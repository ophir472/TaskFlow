import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from './store';
import { getThemeVars } from './themes';
import type { View } from './store';

const VALID_VIEWS: View[] = ['feed', 'kanban', 'table', 'archive', 'settings'];
import { Sidebar } from './components/Sidebar/Sidebar';
import { CardFeed } from './components/CardFeed/CardFeed';
import { Kanban } from './components/Kanban/Kanban';
import { Table } from './components/Table/Table';
import { Archive } from './components/Archive/Archive';
import { Settings } from './components/Settings/Settings';
import { CreateModal } from './components/CreateModal/CreateModal';
import { Toast } from './components/Toast/Toast';
import { getStoredHandle, storeHandle, clearStoredHandle, ensureWritePermission, writeBackup, getExportData, supportsAutoBackup } from './backup';

export type SyncState = 'idle' | 'syncing' | 'saved';

const VIEW_TITLES: Record<string, string> = {
  kanban: 'Kanban', table: 'All Items', archive: 'Archive', settings: 'Settings',
};

export default function App() {
  const view = useStore(s => s.view);
  const setView = useStore(s => s.setView);
  const themeId = useStore(s => s.themeId);
  const setTriggerTagForId = useStore(s => s.setTriggerTagForId);
  const checkDailyReset = useStore(s => s.checkDailyReset);

  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [focusSearchTrigger, setFocusSearchTrigger] = useState(0);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const backupHandleRef = useRef<FileSystemFileHandle | null>(null);
  const backupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [backupFileName, setBackupFileName] = useState<string | null>(null);
  const [lastBackedUp, setLastBackedUp] = useState<number | null>(() => {
    const v = localStorage.getItem('taskflow-last-backup');
    return v ? parseInt(v) : null;
  });

  function applyHandle(handle: FileSystemFileHandle | null) {
    backupHandleRef.current = handle;
    setBackupFileName(handle?.name ?? null);
  }

  async function handleSetBackupFile() {
    if (!supportsAutoBackup()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle: FileSystemFileHandle = await (window as any).showSaveFilePicker({
        suggestedName: 'taskflow-backup.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      await storeHandle(handle);
      applyHandle(handle);
      await writeBackup(handle, getExportData());
      const now = Date.now();
      localStorage.setItem('taskflow-last-backup', String(now));
      setLastBackedUp(now);
    } catch {
      // user cancelled or permission denied
    }
  }

  async function handleClearBackupFile() {
    await clearStoredHandle();
    applyHandle(null);
  }

  const toastTimer = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(t => (t === msg ? null : t)), 2500);
  }, []);

  // Load stored backup handle on mount
  useEffect(() => {
    getStoredHandle().then(handle => {
      if (handle) applyHandle(handle);
    });
  }, []);

  // Sync indicator + auto-backup
  useEffect(() => {
    const unsub = useStore.subscribe(() => {
      setSyncState('syncing');
      if (syncTimer.current) clearTimeout(syncTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      syncTimer.current = setTimeout(() => setSyncState('saved'), 500);
      idleTimer.current = setTimeout(() => setSyncState('idle'), 2000);

      if (backupHandleRef.current) {
        if (backupDebounceRef.current) clearTimeout(backupDebounceRef.current);
        backupDebounceRef.current = setTimeout(async () => {
          const handle = backupHandleRef.current;
          if (!handle) return;
          try {
            const ok = await ensureWritePermission(handle);
            if (!ok) return;
            await writeBackup(handle, getExportData());
            const now = Date.now();
            localStorage.setItem('taskflow-last-backup', String(now));
            setLastBackedUp(now);
          } catch {
            // silently skip — file may have been moved/deleted
          }
        }, 2000);
      }
    });
    return unsub;
  }, []);

  // Hash-based routing: URL → view on load and on back/forward
  // Only the first segment matters for view (e.g. "feed/taskId/sub/subId" → view="feed")
  useEffect(() => {
    function syncFromHash() {
      const seg = window.location.hash.slice(1).split('/')[0] as View;
      if (VALID_VIEWS.includes(seg)) setView(seg);
      else if (!window.location.hash) setView('feed');
    }
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [setView]);

  // View → URL: only update when switching views; preserve sub-path within same view
  useEffect(() => {
    const currentSeg = window.location.hash.slice(1).split('/')[0];
    if (currentSeg !== view) window.location.hash = view;
  }, [view]);

  // Apply theme CSS variables
  useEffect(() => {
    const vars = getThemeVars(themeId);
    Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  }, [themeId]);

  // Daily reset
  useEffect(() => {
    checkDailyReset();
    const id = setInterval(checkDailyReset, 60_000);
    return () => clearInterval(id);
  }, [checkDailyReset]);

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'k') {
        e.preventDefault();
        setCreateOpen(true);
      }
      if (meta && e.key === 'f') {
        e.preventDefault();
        setView('feed');
        setFocusSearchTrigger(n => n + 1);
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setView]);

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '100vh', background: 'var(--t-bg)' }}>
      <Sidebar onNewItem={() => setCreateOpen(true)} syncState={syncState} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {view !== 'feed' && (
          <div style={{ padding: '22px 36px 8px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--t-txt)' }}>{VIEW_TITLES[view]}</div>
          </div>
        )}

        {view === 'feed' && <CardFeed onToast={toastTimer} focusSearchTrigger={focusSearchTrigger} />}
        {view === 'kanban' && <Kanban />}
        {view === 'table' && <Table />}
        {view === 'archive' && <Archive />}
        {view === 'settings' && (
          <Settings
            backupFileName={backupFileName}
            lastBackedUp={lastBackedUp}
            onSetBackupFile={handleSetBackupFile}
            onClearBackupFile={handleClearBackupFile}
          />
        )}
      </div>

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onToast={toastTimer}
          onCreated={id => {
            setTriggerTagForId(id);
          }}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}
