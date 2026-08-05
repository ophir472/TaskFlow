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
  if (!(await ensureDirPermissionTracked(handle))) return false;

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

// ── Live file (current.json) ────────────────────────────────────────
// Written on every store change (debounced). Provides continuous protection
// between navigation-triggered snapshots.

const LIVE_FILENAME = 'current.json';
let lastLiveContent: string | null = null;

export async function writeLiveFile(): Promise<boolean> {
  const handle = await getSnapshotDir();
  if (!handle) return false;
  if (!(await ensureDirPermissionTracked(handle))) return false;

  const raw = localStorage.getItem('taskflow-store') ?? '{}';
  const content = JSON.stringify({
    savedAt: new Date().toISOString(),
    ...JSON.parse(raw),
  }, null, 2);

  if (content === lastLiveContent) return false;

  try {
    const fh = await handle.getFileHandle(LIVE_FILENAME, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
    lastLiveContent = content;
    return true;
  } catch (e) {
    logError('writeLiveFile failed', e);
    return false;
  }
}

export async function readLiveFile(): Promise<Record<string, unknown> | null> {
  const handle = await getSnapshotDir();
  if (!handle) return null;
  try {
    const fh = await handle.getFileHandle(LIVE_FILENAME);
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  } catch { return null; }
}

// ── Permission state ────────────────────────────────────────────────

type PermListener = (err: string | null) => void;
const permListeners = new Set<PermListener>();
let currentPermError: string | null = null;

export function subscribePermission(l: PermListener): () => void {
  permListeners.add(l);
  l(currentPermError);
  return () => { permListeners.delete(l); };
}

function setPermError(err: string | null) {
  if (currentPermError === err) return;
  currentPermError = err;
  permListeners.forEach(l => l(err));
}

// Wrap the original permission check to publish errors
const _originalEnsurePerm = ensureDirPermission;
export async function ensureDirPermissionTracked(handle: Handle): Promise<boolean> {
  const ok = await _originalEnsurePerm(handle);
  if (ok) setPermError(null);
  else setPermError('Snapshot folder permission has been revoked. Grant access to resume backups.');
  return ok;
}

// Explicitly request permission on user activation (button click)
export async function requestDirPermission(): Promise<boolean> {
  const handle = await getSnapshotDir();
  if (!handle) return false;
  try {
    const req = await handle.requestPermission({ mode: 'readwrite' });
    const ok = req === 'granted';
    setPermError(ok ? null : 'Permission still denied.');
    return ok;
  } catch {
    setPermError('Failed to request permission.');
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
  if (!(await ensureDirPermissionTracked(handle))) return [];

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

// ── Log reading ─────────────────────────────────────────────────────

interface LogRecord extends LogEntry { _time: number }

async function readAllLogs(): Promise<LogRecord[]> {
  const handle = await getSnapshotDir();
  if (!handle) return [];
  if (!(await ensureDirPermissionTracked(handle))) return [];

  const all: LogRecord[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [name, entry] of (handle as any).entries()) {
      if (entry.kind !== 'file') continue;
      if (!/^log-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue;
      try {
        const text = await (await entry.getFile()).text();
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          try {
            const e = JSON.parse(line) as LogEntry;
            all.push({ ...e, _time: Date.parse(e.ts) });
          } catch { /* skip corrupt line */ }
        }
      } catch { /* skip unreadable file */ }
    }
  } catch { /* dir issue */ }
  all.sort((a, b) => a._time - b._time);
  return all;
}

// ── Integrity check ────────────────────────────────────────────────
// Detects data loss by comparing what user actions logged (create/delete)
// against what actually exists in the store.

export interface IntegrityResult {
  timestamp: number;
  isFirstRun: boolean;
  baselineItems: number;
  baselineSubtasks: number;
  itemsCreated: number;
  itemsDeleted: number;
  itemsImported: number;
  subtasksCreated: number;
  subtasksDeleted: number;
  expectedItems: number;
  actualItems: number;
  expectedSubtasks: number;
  actualSubtasks: number;
  itemDelta: number;         // negative = data loss
  subtaskDelta: number;
  suspectedLoss: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countSubtasks(items: any[]): number {
  return items.reduce((sum, it) => sum + (it.kind === 'task' ? (it.subtasks?.length ?? 0) : 0), 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runIntegrityCheck(currentItems: any[]): Promise<IntegrityResult | null> {
  const handle = await getSnapshotDir();
  if (!handle) return null;

  const logs = await readAllLogs();
  const actualItems = currentItems.length;
  const actualSubtasks = countSubtasks(currentItems);

  // Find latest baseline (either 'integrity-check' or 'integrity-check-initial')
  const lastCheck = [...logs].reverse().find(e =>
    e.event === 'integrity-check' || e.event === 'integrity-check-initial'
  );

  // First run: establish baseline from current state, don't alarm
  if (!lastCheck) {
    log('integrity-check-initial', {
      baselineItems: actualItems,
      baselineSubtasks: actualSubtasks,
      note: 'Establishing baseline from current state; pre-existing items are not in create log.',
    });
    return {
      timestamp: Date.now(), isFirstRun: true,
      baselineItems: actualItems, baselineSubtasks: actualSubtasks,
      itemsCreated: 0, itemsDeleted: 0, itemsImported: 0,
      subtasksCreated: 0, subtasksDeleted: 0,
      expectedItems: actualItems, actualItems,
      expectedSubtasks: actualSubtasks, actualSubtasks,
      itemDelta: 0, subtaskDelta: 0, suspectedLoss: false,
    };
  }

  // Incremental: use baseline from last check + count events since
  const baselineItems = Number(lastCheck.data?.baselineItems ?? 0);
  const baselineSubtasks = Number(lastCheck.data?.baselineSubtasks ?? 0);
  const since = lastCheck._time;
  const newer = logs.filter(e => e._time > since);

  const itemsCreated  = newer.filter(e => e.event === 'item:create').length;
  const itemsDeleted  = newer.filter(e => e.event === 'item:delete').length;
  const itemsImported = newer
    .filter(e => e.event === 'item:import')
    .reduce((sum, e) => sum + Number(e.data?.count ?? 0), 0);
  const subtasksCreated = newer.filter(e => e.event === 'subtask:create').length;
  const subtasksDeleted = newer.filter(e => e.event === 'subtask:delete').length;

  const expectedItems = baselineItems + itemsCreated + itemsImported - itemsDeleted;
  const expectedSubtasks = baselineSubtasks + subtasksCreated - subtasksDeleted;
  const itemDelta = actualItems - expectedItems;
  const subtaskDelta = actualSubtasks - expectedSubtasks;
  const suspectedLoss = itemDelta < 0 || subtaskDelta < 0;

  const result: IntegrityResult = {
    timestamp: Date.now(), isFirstRun: false,
    baselineItems: actualItems, baselineSubtasks: actualSubtasks,
    itemsCreated, itemsDeleted, itemsImported,
    subtasksCreated, subtasksDeleted,
    expectedItems, actualItems, expectedSubtasks, actualSubtasks,
    itemDelta, subtaskDelta, suspectedLoss,
  };

  // Write new checkpoint: use ACTUAL as the new baseline (regardless of drift).
  // This resets accumulation so next check compares against known-good state.
  log('integrity-check', {
    baselineItems: actualItems,
    baselineSubtasks: actualSubtasks,
    prev: {
      expectedItems, actualItems, itemDelta,
      expectedSubtasks, actualSubtasks, subtaskDelta,
      suspectedLoss,
    },
  });

  return result;
}
