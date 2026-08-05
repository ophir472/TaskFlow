// Snapshot / version-history / log system.
// User picks a directory once. On every URL change (navigate away) the current
// state is written as its own timestamped JSON file. Snapshots older than
// RETENTION_DAYS are pruned. A per-day JSONL log file records every mutation
// for forensic debugging.

const IDB_NAME = 'taskflow-meta';
const IDB_STORE = 'handles';
const DIR_HANDLE_KEY = 'snapshotDir';
const RETENTION_DAYS = 7;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handle = any;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSnapshotDir(): Promise<Handle | null> {
  try {
    const db = await openDB();
    return await new Promise(resolve => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(DIR_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function storeSnapshotDir(handle: Handle): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, DIR_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearSnapshotDir(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>(resolve => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve();
    });
  } catch { /* ignore */ }
}

export async function ensureDirPermission(handle: Handle): Promise<boolean> {
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    const req = await handle.requestPermission({ mode: 'readwrite' });
    return req === 'granted';
  } catch { return false; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pickSnapshotDir(): Promise<Handle | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!('showDirectoryPicker' in window)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    await storeSnapshotDir(handle);
    return handle;
  } catch { return null; }
}

// ── Snapshot writing ────────────────────────────────────────────────

let lastSnapshotContent: string | null = null;

function snapshotFilename(ts: number = Date.now()): string {
  // ISO timestamp with dashes-only so it's safe on all filesystems
  const iso = new Date(ts).toISOString().replace(/[:.]/g, '-');
  return `snapshot-${iso}.json`;
}

function parseSnapshotTime(filename: string): number | null {
  // Format: snapshot-YYYY-MM-DDTHH-MM-SS-mmmZ.json
  const m = filename.match(/^snapshot-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`;
  const t = Date.parse(iso);
  return isNaN(t) ? null : t;
}

/**
 * Write a snapshot if state has changed since the last one.
 * Returns true if written, false if skipped (no change or no dir).
 */
export async function writeSnapshot(): Promise<boolean> {
  const handle = await getSnapshotDir();
  if (!handle) return false;
  if (!(await ensureDirPermission(handle))) return false;

  const raw = localStorage.getItem('taskflow-store') ?? '{}';
  const content = JSON.stringify({
    savedAt: new Date().toISOString(),
    ...JSON.parse(raw),
  }, null, 2);

  // Skip if identical to last snapshot we wrote this session
  if (content === lastSnapshotContent) return false;

  try {
    const fileHandle = await handle.getFileHandle(snapshotFilename(), { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    lastSnapshotContent = content;
    // Fire-and-forget prune
    pruneOldSnapshots(handle).catch(() => { /* ignore */ });
    return true;
  } catch (e) {
    logError('writeSnapshot failed', e);
    return false;
  }
}

export interface SnapshotEntry {
  filename: string;
  time: number;      // epoch ms
  size: number;      // bytes
  itemCount?: number;
}

export async function listSnapshots(): Promise<SnapshotEntry[]> {
  const handle = await getSnapshotDir();
  if (!handle) return [];
  if (!(await ensureDirPermission(handle))) return [];

  const entries: SnapshotEntry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, entry] of (handle as any).entries()) {
    if (entry.kind !== 'file') continue;
    const time = parseSnapshotTime(name);
    if (time === null) continue;
    try {
      const file = await entry.getFile();
      entries.push({ filename: name, time, size: file.size });
    } catch { /* skip unreadable */ }
  }
  entries.sort((a, b) => b.time - a.time);
  return entries;
}

export async function readSnapshot(filename: string): Promise<Record<string, unknown> | null> {
  const handle = await getSnapshotDir();
  if (!handle) return null;
  try {
    const fh = await handle.getFileHandle(filename);
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  } catch { return null; }
}

async function pruneOldSnapshots(handle: Handle): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, entry] of (handle as any).entries()) {
    if (entry.kind !== 'file') continue;
    const time = parseSnapshotTime(name);
    if (time !== null && time < cutoff) {
      try { await handle.removeEntry(name); } catch { /* ignore */ }
    }
  }
}

// ── Logging ─────────────────────────────────────────────────────────

// Random per-tab identifier so multi-tab races become visible in logs
const TAB_ID = (() => {
  let id = sessionStorage.getItem('taskflow-tab-id');
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('taskflow-tab-id', id);
  }
  return id;
})();

interface LogEntry {
  ts: string;
  tab: string;
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

const logBuffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function log(event: string, data?: unknown): void {
  logBuffer.push({ ts: new Date().toISOString(), tab: TAB_ID, event, data });
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushLogs().catch(() => {}); }, 500);
}

export function logError(event: string, err: unknown): void {
  const msg = err instanceof Error ? { message: err.message, stack: err.stack } : String(err);
  log(event, msg);
}

async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) return;
  const handle = await getSnapshotDir();
  if (!handle) { logBuffer.length = 0; return; } // no dir configured — drop
  if (!(await ensureDirPermission(handle))) return;

  const today = new Date().toISOString().slice(0, 10);
  const filename = `log-${today}.jsonl`;
  const entries = logBuffer.splice(0);
  const text = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

  try {
    const fh = await handle.getFileHandle(filename, { create: true });
    // Read existing, append, rewrite (browsers don't support true append)
    const existing = await (await fh.getFile()).text().catch(() => '');
    const writable = await fh.createWritable();
    await writable.write(existing + text);
    await writable.close();
  } catch {
    // put back into buffer for next attempt
    logBuffer.unshift(...entries);
  }
}

// Flush on page hide (best-effort)
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flushLogs().catch(() => {}); });
  window.addEventListener('beforeunload', () => { flushLogs().catch(() => {}); });
}

export function getTabId(): string { return TAB_ID; }
