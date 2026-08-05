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
import { restoreFromData, pickAndRegisterRestoreFile } from './backup';
import { writeSnapshot, writeLiveFile, log, getTabId, listSnapshots, readSnapshot, getSnapshotDir, subscribePermission, requestDirPermission, runIntegrityCheck, isPreviewMode, summarizeRange, formatSummary } from './snapshots';
import type { IntegrityResult, ChangeSummary } from './snapshots';
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
    // Never show the restore prompt in preview mode — a preview tab starts
    // with the snapshot's data, and clicking Restore would try to write to
    // real localStorage from a preview tab.
    if (isPreviewMode()) return;
    // Only trigger when the store is genuinely empty on first load
    const initialEmpty = items.length === 0;
    if (!initialEmpty) return;
    setRestoreState('checking');
    (async () => {
      // Look for the newest snapshot in the configured snapshot directory
      const dir = await getSnapshotDir();
      if (!dir) { setRestoreState('manual'); return; }
      try {
        const list = await listSnapshots();
        if (list.length === 0) { setRestoreState('manual'); return; }
        const data = await readSnapshot(list[0].filename);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const count = (data as any)?.state?.items?.length ?? 0;
        if (!data || count === 0) { setRestoreState('manual'); return; }
        setFoundBackupHandle({ name: list[0].filename } as FileSystemFileHandle);
        setFoundBackupData(data);
        setRestoreState('found');
      } catch {
        setRestoreState('manual');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAutoRestore() {
    if (foundBackupData) restoreFromData(foundBackupData);
  }

  async function handlePickRestore() {
    // Try the File System Access API first (registers file as backup automatically)
    const data = await pickAndRegisterRestoreFile();
    if (data) { restoreFromData(data); return; }
    // Fall back to plain <input type="file"> (no auto-backup registration)
    restoreFileRef.current?.click();
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
  const liveWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [permError, setPermError] = useState<string | null>(null);
  const [integrityAlert, setIntegrityAlert] = useState<IntegrityResult | null>(null);
  const [previewSummary, setPreviewSummary] = useState<ChangeSummary | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewInfo = (typeof window !== 'undefined' ? (window as any).__preview : null) as { filename: string; savedAt: string } | null;
  const inPreview = isPreviewMode();

  const toastTimer = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(t => (t === msg ? null : t)), 2500);
  }, []);

  // Sync indicator + debounced live-file write on every store change
  useEffect(() => {
    const unsub = useStore.subscribe(() => {
      setSyncState('syncing');
      if (syncTimer.current) clearTimeout(syncTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      syncTimer.current = setTimeout(() => setSyncState('saved'), 500);
      idleTimer.current = setTimeout(() => setSyncState('idle'), 2000);

      // Debounced live-file write (500ms). Skipped silently if no snapshot dir configured.
      if (liveWriteTimer.current) clearTimeout(liveWriteTimer.current);
      liveWriteTimer.current = setTimeout(() => {
        writeLiveFile().catch(() => { /* logged internally */ });
      }, 500);
    });
    return unsub;
  }, []);

  // Subscribe to permission changes → show banner
  useEffect(() => subscribePermission(setPermError), []);

  // In preview mode: compute change summary vs the previous snapshot
  useEffect(() => {
    if (!inPreview || !previewInfo) return;
    (async () => {
      const list = await listSnapshots();
      const currentTime = Date.parse(previewInfo.savedAt);
      const currentIdx = list.findIndex(s => s.filename === previewInfo.filename);
      const prevSnapshot = currentIdx >= 0 && currentIdx < list.length - 1 ? list[currentIdx + 1] : null;
      const from = prevSnapshot ? prevSnapshot.time : 0;
      const summary = await summarizeRange(from, currentTime);
      setPreviewSummary(summary);
    })();
  }, [inPreview, previewInfo]);

  // Run integrity check on mount
  useEffect(() => {
    // Snapshot the items array once on mount so a growing/shrinking state
    // during the async check doesn't skew the result.
    const currentItems = useStore.getState().items;
    runIntegrityCheck(currentItems).then(result => {
      if (result && result.suspectedLoss) {
        setIntegrityAlert(result);
      }
    }).catch(err => log('integrity-check:failed', String(err)));
  }, []);

  async function handleGrantPermission() {
    const ok = await requestDirPermission();
    if (ok) setPermError(null);
  }

  async function handleRestoreLatest() {
    const list = await listSnapshots();
    if (list.length === 0) { alert('No snapshots available to restore.'); return; }
    if (!confirm(`Restore from newest snapshot (${new Date(list[0].time).toLocaleString()})?\nCurrent state will be replaced.`)) return;
    const data = await readSnapshot(list[0].filename);
    if (!data) { alert('Failed to read snapshot.'); return; }
    restoreFromData(data);
  }

  // Fire confetti once when the 3rd task/subtask is completed today
  useEffect(() => {
    if (promotionsToday === 3 && confettiFiredAt.current !== 3) {
      confettiFiredAt.current = 3;
      setShowConfetti(true);
    }
    if (promotionsToday < 3) confettiFiredAt.current = 0; // reset on daily rollover
  }, [promotionsToday]);

  // Hash-based routing: URL → view on load and on back/forward
  // Also: every URL change triggers a snapshot write (fire-and-forget).
  useEffect(() => {
    function syncFromHash() {
      const seg = window.location.hash.slice(1).split('/')[0] as View;
      if (VALID_VIEWS.includes(seg)) setView(seg);
      else if (!window.location.hash) setView('feed');
      // Snapshot on every navigation. Async, non-blocking.
      writeSnapshot().then(written => {
        if (written) log('snapshot:navigate', { hash: window.location.hash });
      }).catch(() => { /* ignore */ });
    }
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    log('app:mount', { tab: getTabId() });
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
    <div style={{ display: 'flex', width: '100%', minHeight: '100vh', background: 'var(--t-bg)', flexDirection: 'column' }}>
      {/* Preview mode banner (blue, always at top when in preview) */}
      {inPreview && previewInfo && (
        <div style={{ padding: '10px 20px', background: '#4b7bec', color: 'white', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.15)', zIndex: 100, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>👁 Preview mode</span>
          <span>·  Snapshot from {new Date(previewInfo.savedAt).toLocaleString()}</span>
          {previewSummary && (
            <span style={{ opacity: 0.9, fontSize: 13 }}>·  Changes since previous snapshot: <b>{formatSummary(previewSummary)}</b></span>
          )}
          <span style={{ marginLeft: 'auto', opacity: 0.8, fontSize: 12 }}>Read-only. Close this tab to exit.</span>
        </div>
      )}
      {/* Persistent alert banners */}
      {permError && (
        <div style={{ padding: '10px 20px', background: '#ff8a3d', color: '#231a10', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.1)', zIndex: 100 }}>
          <span>⚠️ {permError}</span>
          <button onClick={handleGrantPermission}
            style={{ marginLeft: 'auto', border: 'none', background: '#231a10', color: 'white', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 6, cursor: 'pointer' }}>
            Grant access
          </button>
        </div>
      )}
      {integrityAlert && (
        <div style={{ padding: '10px 20px', background: '#ff8a3d', color: '#231a10', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.1)', zIndex: 100, flexWrap: 'wrap' }}>
          <span>
            ⚠️ <b>Possible data loss detected.</b> Expected {integrityAlert.expectedItems} items, found {integrityAlert.actualItems}
            {integrityAlert.subtaskDelta < 0 && ` · Expected ${integrityAlert.expectedSubtasks} subtasks, found ${integrityAlert.actualSubtasks}`}
            . Check Settings → Version History for details.
          </span>
          <button onClick={handleRestoreLatest}
            style={{ border: 'none', background: '#231a10', color: 'white', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 6, cursor: 'pointer' }}>
            Restore latest snapshot
          </button>
          <button onClick={() => setIntegrityAlert(null)}
            style={{ border: '1px solid rgba(0,0,0,0.3)', background: 'transparent', color: '#231a10', fontSize: 13, fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>
            Dismiss
          </button>
        </div>
      )}

    <div style={{ display: 'flex', width: '100%', flex: 1, minHeight: 0 }}>
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
        {view === 'settings' && <Settings />}
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
    </div>{/* end sidebar+content wrapper */}

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
                  <button onClick={handlePickRestore}
                    style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 14, fontWeight: 600, padding: '12px 22px', borderRadius: 10, cursor: 'pointer' }}>
                    ↑ Select backup file…
                  </button>
                  {/* Fallback for browsers without File System Access API */}
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
