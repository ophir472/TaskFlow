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
import { getStoredHandle, storeHandle, clearStoredHandle, ensureWritePermission, writeBackup, getExportData, supportsAutoBackup, readBackupFile, restoreFromData } from './backup';
import { Confetti } from './components/Confetti';

export type SyncState = 'idle' | 'syncing' | 'saved';

const VIEW_TITLES: Record<string, string> = {
  kanban: 'Kanban', table: 'All Items', archive: 'Archive', settings: 'Settings',
};

export default function App() {
  const view = useStore(s => s.view);
  const setView = useStore(s => s.setView);
  const themeId = useStore(s => s.themeId);
  const promotionsToday = useStore(s => s.promotionsToday);
  const setTriggerTagForId = useStore(s => s.setTriggerTagForId);
  const checkDailyReset = useStore(s => s.checkDailyReset);

  const items = useStore(s => s.items);

  // ── Startup restore ──────────────────────────────────────────────
  // Detect data loss (empty store) and offer to restore from backup file.
  type RestoreState = 'idle' | 'checking' | 'found' | 'manual' | 'dismissed';
  const [restoreState, setRestoreState] = useState<RestoreState>('idle');
  const [foundBackupHandle, setFoundBackupHandle] = useState<FileSystemFileHandle | null>(null);
  const [foundBackupData, setFoundBackupData] = useState<Record<string, unknown> | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only trigger when the store is genuinely empty on first load
    const initialEmpty = items.length === 0;
    if (!initialEmpty) return;
    setRestoreState('checking');
    getStoredHandle().then(async handle => {
      if (!handle) { setRestoreState('manual'); return; }
      try {
        const data = await readBackupFile(handle);
        const count = (data?.state as any)?.items?.length ?? 0;
        if (count === 0) { setRestoreState('manual'); return; }
        setFoundBackupHandle(handle);
        setFoundBackupData(data);
        setRestoreState('found');
      } catch {
        setRestoreState('manual');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAutoRestore() {
    if (foundBackupData) restoreFromData(foundBackupData);
  }

  function handleManualRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as Record<string, unknown>;
        restoreFromData(data);
      } catch { alert('Invalid backup file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const showRestore = restoreState === 'found' || restoreState === 'manual';

  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiFiredAt = useRef<number>(0);
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

  // Fire confetti once when the 3rd task/subtask is completed today
  useEffect(() => {
    if (promotionsToday === 3 && confettiFiredAt.current !== 3) {
      confettiFiredAt.current = 3;
      setShowConfetti(true);
    }
    if (promotionsToday < 3) confettiFiredAt.current = 0; // reset on daily rollover
  }, [promotionsToday]);

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
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}

      {/* Startup restore prompt — shown when all data is gone */}
      {showRestore && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 480, background: 'var(--t-surf)', borderRadius: 18, padding: '40px 36px', boxShadow: '0 12px 48px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>⚠️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 8 }}>No data found</div>
            <div style={{ fontSize: 14, color: 'var(--t-muted)', marginBottom: 28, lineHeight: 1.6 }}>
              {restoreState === 'found'
                ? `Found your backup file "${foundBackupHandle?.name}". Restore your data now or start fresh.`
                : 'Your browser data may have been cleared. Select your backup JSON file to restore, or start fresh.'}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {restoreState === 'found' ? (
                <button onClick={handleAutoRestore}
                  style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 14, fontWeight: 600, padding: '12px 22px', borderRadius: 10, cursor: 'pointer' }}>
                  ↑ Restore from "{foundBackupHandle?.name}"
                </button>
              ) : (
                <>
                  <button onClick={() => restoreFileRef.current?.click()}
                    style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 14, fontWeight: 600, padding: '12px 22px', borderRadius: 10, cursor: 'pointer' }}>
                    ↑ Select backup file…
                  </button>
                  <input ref={restoreFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleManualRestore} />
                </>
              )}
              <button onClick={() => setRestoreState('dismissed')}
                style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 14, fontWeight: 600, padding: '12px 22px', borderRadius: 10, cursor: 'pointer' }}>
                Start fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
