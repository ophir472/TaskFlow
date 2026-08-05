// Snapshot / version-history / log system.
// User picks a directory once. On every URL change (navigate away) the current
// state is written as its own timestamped JSON file. Snapshots older than
// RETENTION_DAYS are pruned. A per-day JSONL log file records every mutation
// for forensic debugging.

// Cached at module init — a tab is either preview or real for its entire lifetime.
// Do NOT re-check window.location.hash: browsing inside the preview updates the
// URL (to #feed/taskId etc.), which would flip this flag and cause disastrous
// writes to real localStorage from the preview tab.
const IS_PREVIEW_MODE = typeof window !== 'undefined' && window.location.hash.startsWith('#preview/');
export function isPreviewMode(): boolean {
  return IS_PREVIEW_MODE;
}

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

let lastSnapshotRaw: string | null = null;

// UI-only fields that change during normal navigation but don't represent
// user data. Excluded from the change-detection comparison so navigating
// between views doesn't create redundant snapshots.
const UI_ONLY_FIELDS = ['view', 'sidebarCollapsed', 'displayId', 'triggerTagForId'];

function stripUiFields(rawJson: string): string {
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === 'object' && parsed.state && typeof parsed.state === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cleaned: any = { ...parsed.state };
      UI_ONLY_FIELDS.forEach(k => delete cleaned[k]);
      return JSON.stringify({ ...parsed, state: cleaned });
    }
    return rawJson;
  } catch { return rawJson; }
}

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
  if (isPreviewMode()) return false;
  // Cross-tab lock: only one tab at a time is inside this block. Fixes the
  // race where two tabs both call writeSnapshot simultaneously and both write
  // near-identical files (visible as multiple snapshots at the same millisecond
  // with "no changes" summaries between them).
  return withLock('taskflow-snapshot-write', () => writeSnapshotInner());
}

async function writeSnapshotInner(): Promise<boolean> {
  const handle = await getSnapshotDir();
  if (!handle) return false;
  if (!(await ensureDirPermissionTracked(handle))) return false;

  const raw = localStorage.getItem('taskflow-store') ?? '{}';
  const stripped = stripUiFields(raw);

  // Skip if only UI-only fields (view/sidebar/displayId) changed.
  if (stripped === lastSnapshotRaw) return false;

  // CLAIM the in-memory marker synchronously — BEFORE any await. This prevents
  // a second call from passing the check while the first is still awaiting.
  lastSnapshotRaw = stripped;

  // Skip if no user-facing data changes have been logged since the last snapshot.
  // Uses dataEvents (not totalEvents) so navigation/rehydrate noise doesn't count.
  // Because we hold the cross-tab lock, no other tab can have written since we
  // read the newest snapshot time.
  const lastSnapshotTime = await getNewestSnapshotTime(handle);
  if (lastSnapshotTime !== null) {
    const summary = await summarizeRange(lastSnapshotTime, Date.now());
    if (summary.dataEvents === 0) return false;
  }

  const content = JSON.stringify({
    savedAt: new Date().toISOString(),
    ...JSON.parse(raw),
  }, null, 2);

  try {
    const fileHandle = await handle.getFileHandle(snapshotFilename(), { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    pruneOldSnapshots(handle).catch(() => { /* ignore */ });
    return true;
  } catch (e) {
    logError('writeSnapshot failed', e);
    return false;
  }
}

// Web Locks API wrapper — serializes execution across tabs on the same origin.
// If Web Locks isn't available (unlikely in Chromium), falls through to a
// per-tab-only queue via a chained promise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _lockFallback: Record<string, Promise<any>> = {};
async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyNav = navigator as any;
  if (anyNav.locks && typeof anyNav.locks.request === 'function') {
    return anyNav.locks.request(name, { mode: 'exclusive' }, () => fn());
  }
  // Fallback: at least serialize within this tab
  const prev = _lockFallback[name] ?? Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  _lockFallback[name] = next.catch(() => {});
  return next;
}

// ── Live file (current.json) ────────────────────────────────────────
// Written on every store change (debounced). Provides continuous protection
// between navigation-triggered snapshots.

const LIVE_FILENAME = 'current.json';
let lastLiveRaw: string | null = null;

export async function writeLiveFile(): Promise<boolean> {
  if (isPreviewMode()) return false;
  return withLock('taskflow-live-write', () => writeLiveFileInner());
}

async function writeLiveFileInner(): Promise<boolean> {
  const handle = await getSnapshotDir();
  if (!handle) return false;
  if (!(await ensureDirPermissionTracked(handle))) return false;

  const raw = localStorage.getItem('taskflow-store') ?? '{}';
  const stripped = stripUiFields(raw);

  if (stripped === lastLiveRaw) return false;
  lastLiveRaw = stripped;

  const content = JSON.stringify({
    savedAt: new Date().toISOString(),
    ...JSON.parse(raw),
  }, null, 2);

  try {
    const fh = await handle.getFileHandle(LIVE_FILENAME, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
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

// Returns the epoch-ms time of the newest snapshot in the dir, or null if none exist.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getNewestSnapshotTime(handle: any): Promise<number | null> {
  let newest: number | null = null;
  try {
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind !== 'file') continue;
      const t = parseSnapshotTime(name);
      if (t !== null && (newest === null || t > newest)) newest = t;
    }
  } catch { /* ignore */ }
  return newest;
}

/**
 * Move a snapshot to the trash/ subfolder. Doesn't delete permanently —
 * user can recover via Finder if needed.
 */
export async function trashSnapshot(filename: string): Promise<boolean> {
  const handle = await getSnapshotDir();
  if (!handle) return false;
  if (!(await ensureDirPermissionTracked(handle))) return false;
  try {
    // Read the file first
    const src = await handle.getFileHandle(filename);
    const text = await (await src.getFile()).text();
    // Write to trash/
    const trashDir = await handle.getDirectoryHandle('trash', { create: true });
    const dest = await trashDir.getFileHandle(filename, { create: true });
    const writable = await dest.createWritable();
    await writable.write(text);
    await writable.close();
    // Remove original
    await handle.removeEntry(filename);
    log('snapshot:trashed', { filename });
    return true;
  } catch (e) {
    logError('trashSnapshot failed', e);
    return false;
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

// ── Debug mode ────────────────────────────────────────────────────
// When enabled, logDebug() calls are recorded. When disabled, they're no-ops.
// Persisted in localStorage so it survives reloads.

let _debugMode = typeof window !== 'undefined' && localStorage.getItem('taskflow-debug') === 'true';

export function getDebugMode(): boolean { return _debugMode; }

export function setDebugMode(on: boolean): void {
  _debugMode = on;
  if (typeof window !== 'undefined') {
    if (on) localStorage.setItem('taskflow-debug', 'true');
    else localStorage.removeItem('taskflow-debug');
  }
  log('debug-mode:set', { enabled: on });
}

// Cross-tab sync of debug mode
if (typeof window !== 'undefined' && !IS_PREVIEW_MODE) {
  window.addEventListener('storage', (e) => {
    if (e.key === 'taskflow-debug') _debugMode = e.newValue === 'true';
  });
}

// Log a verbose event that's gated by debug mode. Free when debug is off.
export function logDebug(event: string, data?: unknown): void {
  if (!_debugMode) return;
  log(event, data);
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

// ── Log rotation + true append ────────────────────────────────────
// Each day's logs are split into files of MAX_LINES_PER_LOG lines.
// Filename: log-YYYY-MM-DD-NNN.jsonl (NNN = 001, 002, ...)
// Legacy format `log-YYYY-MM-DD.jsonl` is still read by readAllLogs.

const MAX_LINES_PER_LOG = 10_000;

let currentLogFilename: string | null = null;
let currentLogDate: string | null = null;
let currentLogLines = 0;

function logFilenameFor(date: string, part: number): string {
  return `log-${date}-${String(part).padStart(3, '0')}.jsonl`;
}

// Find the newest partition for a given date. Returns null if no logs exist.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findLatestPart(handle: any, date: string): Promise<{ part: number; lines: number } | null> {
  let maxPart = 0;
  let found = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file') continue;
    const m = name.match(/^log-(\d{4}-\d{2}-\d{2})(?:-(\d{3}))?\.jsonl$/);
    if (!m || m[1] !== date) continue;
    // Legacy format (no part number) counts as part 0
    const part = m[2] ? parseInt(m[2]) : 0;
    if (part >= maxPart) { maxPart = part; found = true; }
  }
  if (!found) return null;
  // Count lines in the latest partition
  const latestName = maxPart === 0
    ? `log-${date}.jsonl`
    : logFilenameFor(date, maxPart);
  try {
    const fh = await handle.getFileHandle(latestName);
    const text = await (await fh.getFile()).text();
    const lines = text.split('\n').filter((l: string) => l.trim()).length;
    return { part: maxPart, lines };
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureCurrentLogFilename(handle: any): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  // Reset on date rollover
  if (currentLogDate !== today) {
    currentLogFilename = null;
    currentLogDate = today;
    currentLogLines = 0;
  }
  // First flush of the session (or after rollover): scan for existing files
  if (currentLogFilename === null) {
    const latest = await findLatestPart(handle, today);
    if (latest === null) {
      currentLogFilename = logFilenameFor(today, 1);
      currentLogLines = 0;
    } else if (latest.lines >= MAX_LINES_PER_LOG) {
      // Latest is full — roll to next partition
      currentLogFilename = logFilenameFor(today, latest.part + 1);
      currentLogLines = 0;
    } else {
      // Append to existing (respect legacy naming if part=0)
      currentLogFilename = latest.part === 0
        ? `log-${today}.jsonl`
        : logFilenameFor(today, latest.part);
      currentLogLines = latest.lines;
    }
  }
  return currentLogFilename;
}

async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) return;
  if (isPreviewMode()) { logBuffer.length = 0; return; }
  // Serialize log writes across tabs. Without this, two tabs both do
  // seek(fileSize) at the same position and one overwrites the other's data.
  return withLock('taskflow-log-write', () => flushLogsInner());
}

async function flushLogsInner(): Promise<void> {
  if (logBuffer.length === 0) return;
  const handle = await getSnapshotDir();
  if (!handle) { logBuffer.length = 0; return; } // no dir configured — drop
  if (!(await ensureDirPermissionTracked(handle))) return;

  const entries = logBuffer.splice(0);
  const text = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

  try {
    // Rotate if adding these entries would exceed the line cap
    if (currentLogLines + entries.length > MAX_LINES_PER_LOG && currentLogLines > 0) {
      currentLogFilename = null; // triggers a fresh scan → next partition
    }
    const filename = await ensureCurrentLogFilename(handle);

    // TRUE APPEND: use createWritable({keepExistingData:true}) + seek(fileSize).
    // O(new content) instead of O(entire file). Critical for perf as logs grow.
    const fh = await handle.getFileHandle(filename, { create: true });
    const existingSize = (await fh.getFile()).size;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writable = await fh.createWritable({ keepExistingData: true } as any);
    await writable.seek(existingSize);
    await writable.write(text);
    await writable.close();
    currentLogLines += entries.length;
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

// ── Change summaries ────────────────────────────────────────────────

export interface ChangeSummary {
  itemsCreated: number;
  itemsDeleted: number;
  itemsArchived: number;
  itemsUnarchived: number;
  itemsUpdated: number;
  itemsCompleted: number;
  itemsHeld: number;
  subtasksCreated: number;
  subtasksDeleted: number;
  subtasksUpdated: number;
  subtasksToggled: number;
  tagsToggled: number;
  customValueChanges: number;
  otherChanges: number;
  totalEvents: number;   // all events including noise (navigation, rehydrate)
  dataEvents: number;    // only user-facing data changes; use this for skip logic
}

export function emptySummary(): ChangeSummary {
  return {
    itemsCreated: 0, itemsDeleted: 0, itemsArchived: 0, itemsUnarchived: 0,
    itemsUpdated: 0, itemsCompleted: 0, itemsHeld: 0,
    subtasksCreated: 0, subtasksDeleted: 0, subtasksUpdated: 0, subtasksToggled: 0,
    tagsToggled: 0, customValueChanges: 0, otherChanges: 0, totalEvents: 0, dataEvents: 0,
  };
}

// Format a short human-readable summary line
export function formatSummary(s: ChangeSummary): string {
  const parts: string[] = [];
  if (s.itemsCreated) parts.push(`+${s.itemsCreated} task${s.itemsCreated > 1 ? 's' : ''}`);
  if (s.itemsDeleted) parts.push(`−${s.itemsDeleted} deleted`);
  if (s.itemsArchived) parts.push(`${s.itemsArchived} archived`);
  if (s.itemsUnarchived) parts.push(`${s.itemsUnarchived} restored`);
  if (s.itemsCompleted) parts.push(`${s.itemsCompleted} completed`);
  if (s.itemsHeld) parts.push(`${s.itemsHeld} held`);
  if (s.subtasksCreated) parts.push(`+${s.subtasksCreated} subtask${s.subtasksCreated > 1 ? 's' : ''}`);
  if (s.subtasksDeleted) parts.push(`−${s.subtasksDeleted} subtask${s.subtasksDeleted > 1 ? 's' : ''}`);
  if (s.subtasksToggled) parts.push(`${s.subtasksToggled} subtask check${s.subtasksToggled > 1 ? 's' : ''}`);
  if (s.itemsUpdated) parts.push(`${s.itemsUpdated} edit${s.itemsUpdated > 1 ? 's' : ''}`);
  if (s.subtasksUpdated) parts.push(`${s.subtasksUpdated} subtask edit${s.subtasksUpdated > 1 ? 's' : ''}`);
  if (s.tagsToggled) parts.push(`${s.tagsToggled} tag change${s.tagsToggled > 1 ? 's' : ''}`);
  if (s.customValueChanges) parts.push(`${s.customValueChanges} custom field${s.customValueChanges > 1 ? 's' : ''}`);
  if (s.otherChanges) parts.push(`${s.otherChanges} other`);
  return parts.length ? parts.join(' · ') : 'no changes';
}

// Summarize log events in the range (fromTime, toTime]
export async function summarizeRange(fromTime: number, toTime: number): Promise<ChangeSummary> {
  const logs = await readAllLogs();
  const s = emptySummary();
  const CATEGORIZED = new Set([
    'item:create', 'item:delete', 'item:archive', 'item:unarchive', 'item:update',
    'item:complete', 'item:hold', 'item:continue',
    'subtask:create', 'subtask:delete', 'subtask:update',
    'subtask:toggle-done', 'subtask:toggle-next',
    'tag:toggle', 'item:custom-value',
    'reminder:reschedule',
    // These are UI/system and don't count as data changes
    'app:mount', 'snapshot:navigate', 'store:rehydrate-from-other-tab',
    'integrity-check', 'integrity-check-initial',
    'restore:start', 'restore:complete', 'restore:failed', 'item:import',
    'snapshot-dir:configured',
  ]);

  // Events that represent actual user-facing data changes.
  const DATA_EVENTS = new Set([
    'item:create', 'item:delete', 'item:archive', 'item:unarchive', 'item:update',
    'item:complete', 'item:hold',
    'subtask:create', 'subtask:delete', 'subtask:update', 'subtask:toggle-done',
    'tag:toggle', 'item:custom-value', 'reminder:reschedule', 'item:import',
  ]);

  for (const e of logs) {
    if (e._time <= fromTime || e._time > toTime) continue;
    s.totalEvents++;
    if (DATA_EVENTS.has(e.event)) s.dataEvents++;
    switch (e.event) {
      case 'item:create': s.itemsCreated++; break;
      case 'item:delete': s.itemsDeleted++; break;
      case 'item:archive': s.itemsArchived++; break;
      case 'item:unarchive': s.itemsUnarchived++; break;
      case 'item:update': s.itemsUpdated++; break;
      case 'item:complete': s.itemsCompleted++; break;
      case 'item:hold': s.itemsHeld++; break;
      case 'subtask:create': s.subtasksCreated++; break;
      case 'subtask:delete': s.subtasksDeleted++; break;
      case 'subtask:update': s.subtasksUpdated++; break;
      case 'subtask:toggle-done': s.subtasksToggled++; break;
      case 'tag:toggle': s.tagsToggled++; break;
      case 'item:custom-value': s.customValueChanges++; break;
      default:
        if (!CATEGORIZED.has(e.event)) { s.otherChanges++; s.dataEvents++; }
    }
  }
  return s;
}

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
      // Match both legacy (log-YYYY-MM-DD.jsonl) and rotated (log-YYYY-MM-DD-NNN.jsonl)
      if (!/^log-\d{4}-\d{2}-\d{2}(?:-\d{3})?\.jsonl$/.test(name)) continue;
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
