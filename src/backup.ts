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

export function restoreFromData(data: Record<string, unknown>): void {
  const { exportedAt: _, ...storeData } = data;
  localStorage.setItem('taskflow-store', JSON.stringify(storeData));
  window.location.reload();
}

export function supportsAutoBackup(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
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

  const responsibilities = items.filter(it => it.kind === 'responsibility').map(it => ({
    Title: it.title ?? '',
    Status: it.status ?? '',
    Archived: it.archived ? 'Yes' : 'No',
    Created: new Date(it.createdAt).toLocaleDateString(),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tasks.length ? tasks : [{}]), 'Tasks');
  if (subtasks.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subtasks), 'Subtasks');
  if (reminders.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reminders), 'Reminders');
  if (responsibilities.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(responsibilities), 'Responsibilities');

  XLSX.writeFile(wb, `taskflow-${date}.xlsx`);
}
