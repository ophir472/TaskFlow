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
