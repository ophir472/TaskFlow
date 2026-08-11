const IDB_NAME = 'taskflow-meta';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'backupFile';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function storeHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStoredHandle(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>(resolve => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
    });
  } catch {
    // ignore
  }
}

export async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = handle as any;
    const perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    const req = await h.requestPermission({ mode: 'readwrite' });
    return req === 'granted';
  } catch {
    return false;
  }
}

export async function writeBackup(handle: FileSystemFileHandle, data: object): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}


export function getExportData(): object {
  const raw = localStorage.getItem('taskflow-store') ?? '{}';
  const parsed = JSON.parse(raw);
  // Column layout is now in the Zustand store (tableVisibleCols, archiveVisibleCols, etc.)
  // so it's automatically included in `parsed`. No separate bundle needed.
  return { exportedAt: new Date().toISOString(), ...parsed };
}

export function triggerDownload(filename: string): void {
  const data = getExportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Defaults for every field added since v1 — ensures old backups load cleanly
const STATE_DEFAULTS: Record<string, unknown> = {
  taskOrder: [],
  jiraConfigs: [],
  jiraOpenMode: 'popup',
  requesterJiraIds: {},
  itsmConfig: null,
  tableVisibleCols: null,
  archiveVisibleCols: null,
  tableColWidths: {},
  archiveColWidths: {},
  promotionGoal: 3,
  displayId: null,
  triggerTagForId: null,
  themeId: 'sand',
  customAccent: null,
  customBg: null,
  sidebarCollapsed: false,
};

// Fields that may be missing from tasks in older backups
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeItem(item: any): any {
  if (item?.kind !== 'task') return item;
  return {
    description: '',
    forToday: false,
    extraJiraLinks: [],
    jiraLabel: undefined,
    jiraLinkLabel: undefined,
    extraJiraLinkLabels: [],
    itsmLabel: undefined,
    itsmTicketLabel: undefined,
    extraItsmTicketLabels: [],
    generalLinkLabel: undefined,
    extraGeneralLinks: [],
    extraGeneralLinkLabels: [],
    itsmTicket: '',
    extraItsmTickets: [],
    notes: item.notes ?? '',
    blockers: item.blockers ?? '',
    generalLink: item.generalLink ?? '',
    jiraLink: item.jiraLink ?? '',
    requester: item.requester ?? '',
    project: item.project ?? '',
    toCheck: item.toCheck ?? '',
    priorityBoost: item.priorityBoost ?? false,
    subtasks: item.subtasks ?? [],
    staleness: item.staleness ?? 0,
    customValues: item.customValues ?? {},
    archived: item.archived ?? false,
    ...item,
  };
}

export function restoreFromData(data: Record<string, unknown>): void {
  // Hard safety: refuse to touch localStorage from a preview tab.
  // Uses cached IS_PREVIEW flag via a runtime check on module-load-time value.
  const isPreview = typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).__previewMode === true || window.location.hash.startsWith('#preview/'));
  if (isPreview) {
    alert('Restore is disabled in preview mode. Close this popup and use Restore from the main app.');
    return;
  }

  // Defensive: log intent BEFORE any destructive action so we have a trail if things fail.
  import('./snapshots').then(m => m.log('restore:start', { hasState: !!data.state, exportedAt: data.exportedAt }));

  try {
    const { exportedAt: _, ...raw } = data;

    // The Zustand persist format is { state: {...}, version: N }
    // Old backups might not wrap in `state`, handle both
    const backupState = (raw.state && typeof raw.state === 'object')
      ? raw.state as Record<string, unknown>
      : raw;

    // Normalize: inject defaults for missing fields, then apply backup on top
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = Array.isArray((backupState as any).items)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (backupState as any).items.map(normalizeItem)
      : [];

    const normalizedState = {
      ...STATE_DEFAULTS,
      ...backupState,
      items,
    };

    // Always write the current schema version so Zustand doesn't discard the state
    localStorage.setItem('taskflow-store', JSON.stringify({ state: normalizedState, version: 2 }));

    // Log restore completion + count of imported items so the integrity check
    // knows this is not "data loss" — user intentionally replaced state.
    import('./snapshots').then(m => m.log('item:import', { count: items.length, source: 'restore' }));
    import('./snapshots').then(m => m.log('restore:complete', { itemCount: items.length }));

    // Give the async log flushes a tick to reach disk before reload
    setTimeout(() => window.location.reload(), 100);
  } catch (err) {
    // If anything above threw, DON'T reload. Log and re-throw so caller can react.
    const msg = err instanceof Error ? err.message : String(err);
    import('./snapshots').then(m => m.log('restore:failed', { error: msg }));
    alert('Restore failed: ' + msg + '\nYour current data has not been changed.');
    throw err;
  }
}

export function supportsAutoBackup(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

/**
 * Opens a file picker for the user to select a backup JSON file.
 * When the File System Access API is available (Chromium), also requests
 * write permission so the file becomes the auto-backup target automatically.
 * Returns the parsed backup data, or null if the user cancelled.
 */
export async function pickAndRegisterRestoreFile(): Promise<Record<string, unknown> | null> {
  // File System Access API path — can obtain a writable handle
  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [handle]: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
        types: [{ description: 'TaskFlow backup', accept: { 'application/json': ['.json'] } }],
      });

      // Request write permission so this file becomes the ongoing backup target
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perm = await (handle as any).requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') await storeHandle(handle);
      } catch { /* write permission denied — still restore, just no auto-backup */ }

      const file = await handle.getFile();
      return JSON.parse(await file.text()) as Record<string, unknown>;
    } catch {
      return null; // user cancelled
    }
  }
  return null; // API not available — caller should fall back to <input type="file">
}

export async function readBackupFile(handle: FileSystemFileHandle): Promise<Record<string, unknown>> {
  const file = await handle.getFile();
  const text = await file.text();
  return JSON.parse(text) as Record<string, unknown>;
}

export async function triggerExcelDownload(): Promise<void> {
  const XLSX = await import('xlsx');
  const raw = localStorage.getItem('taskflow-store') ?? '{}';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = JSON.parse(raw)?.state?.items ?? [];
  const date = new Date().toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tagStr = (it: any) => {
    if (it.kind !== 'task') return '';
    if (it.noTag) return 'None';
    return [it.urgent && 'Urgent', it.important && 'Important', it.quick && 'Quick'].filter(Boolean).join(', ') || '';
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score = (it: any) => {
    if (it.kind !== 'task') return 0;
    let s = (it.urgent ? 6 : 0) + (it.important ? 3 : 0) + (it.quick ? 1 : 0) + (it.staleness ?? 0);
    if (it.priorityBoost) s += 100;
    return s;
  };

  const tasks = items.filter(it => it.kind === 'task').map(it => ({
    Title: it.title ?? '',
    Status: (it.status ?? '').replace('_', ' '),
    Requester: it.requester ?? '',
    Project: it.project ?? '',
    Tags: tagStr(it),
    Score: score(it),
    'Jira Link': it.jiraLink ?? '',
    'General Link': it.generalLink ?? '',
    Description: it.description ?? '',
    Notes: it.notes ?? '',
    Blockers: it.blockers ?? '',
    'For Today': it.forToday ? 'Yes' : 'No',
    'Manually Pinned': it.manuallyMoved ? 'Yes' : 'No',
    Archived: it.archived ? 'Yes' : 'No',
    Created: new Date(it.createdAt).toLocaleDateString(),
    Updated: new Date(it.updatedAt).toLocaleDateString(),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtasks: any[] = [];
  items.filter(it => it.kind === 'task' && it.subtasks?.length).forEach((it: any) => {
    it.subtasks.forEach((sub: any) => {
      subtasks.push({
        'Parent Task': it.title ?? '',
        Title: sub.title ?? '',
        Done: sub.done ? 'Yes' : 'No',
        'Next Up': sub.isNext ? 'Yes' : 'No',
        Jira: sub.jira ?? '',
        Notes: sub.notes ?? '',
        Blockers: sub.blockers ?? '',
      });
    });
  });

  const reminders = items.filter(it => it.kind === 'reminder').map(it => ({
    Title: it.title ?? '',
    Status: it.status ?? '',
    Archived: it.archived ? 'Yes' : 'No',
    Created: new Date(it.createdAt).toLocaleDateString(),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tasks.length ? tasks : [{}]), 'Tasks');
  if (subtasks.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subtasks), 'Subtasks');
  if (reminders.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reminders), 'Reminders');

  XLSX.writeFile(wb, `taskflow-${date}.xlsx`);
}
