import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { nextId } from '../../engine';
import { THEMES } from '../../themes';
import { ThemePicker } from './ThemePicker';
import { ResponsibilitiesSection } from './ResponsibilitiesSection';
import { JiraHostsSection } from './JiraHostsSection';
import { triggerDownload, restoreFromData, supportsAutoBackup, triggerExcelDownload, pickAndRegisterRestoreFile } from '../../backup';
import { pickSnapshotDir, getSnapshotDir, clearSnapshotDir, listSnapshots, readSnapshot, writeSnapshot, log, trashSnapshot, summarizeRanges, formatSummary, formatDetailed, getDebugMode, setDebugMode, subscribeSnapshots } from '../../snapshots';
import type { SnapshotEntry, ChangeSummary } from '../../snapshots';
import { useLogMount } from '../../useLogMount';
import type { ItsmConfig, Task } from '../../types';
import { flaggedTasks } from '../../greenPlay';
import { TaskModal } from '../TaskModal/TaskModal';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };
const listItem: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 8, fontSize: 14, color: 'var(--t-txt)' };
const addBtn: React.CSSProperties = { border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const inp: React.CSSProperties = { flex: 1, fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)' };

// Requesters list — like ManagedList but each row also carries a Jira account
// ID. When a card with this requester creates a Jira, that account becomes the
// ticket's Reporter (assignee stays the host default).
function RequestersList() {
  const requesters = useStore(s => s.requesters);
  const requesterJiraIds = useStore(s => s.requesterJiraIds);
  const addRequester = useStore(s => s.addRequester);
  const removeRequester = useStore(s => s.removeRequester);
  const setRequesterJiraId = useStore(s => s.setRequesterJiraId);
  const [input, setInput] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const submit = () => { if (input.trim()) { addRequester(input.trim()); setInput(''); } };
  return (
    <div style={{ ...card, flex: 1, minWidth: 280 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Requesters</div>
      <div style={{ fontSize: 12, color: 'var(--t-muted)', marginBottom: 14 }}>
        Jira account ID (optional) is set as <b>Reporter</b> on tickets created from this requester's tasks.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {requesters.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>None yet</div>}
        {requesters.map(name => {
          const draft = drafts[name] ?? requesterJiraIds[name] ?? '';
          return (
            <div key={name} style={{ ...listItem, gap: 10 }}>
              <span style={{ flexShrink: 0 }}>{name}</span>
              <input
                value={draft}
                onChange={e => setDrafts(d => ({ ...d, [name]: e.target.value }))}
                onBlur={() => {
                  setRequesterJiraId(name, draft);
                  setDrafts(d => { const n = { ...d }; delete n[name]; return n; });
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Jira account ID"
                style={{ flex: 1, fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', minWidth: 0, outline: 'none' }}
              />
              <span onClick={() => removeRequester(name)} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Add requester" style={inp}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <button onClick={submit} style={addBtn}>Add</button>
      </div>
    </div>
  );
}

// Shows exactly what the Green Play review will walk through on next open:
// the un-walked remainder of an in-flight session plus any newly flagged
// tasks (mirrors the sidebar badge / GreenPlay sync logic).
function ReviewQueueSection() {
  const items = useStore(s => s.items);
  const reviewSession = useStore(s => s.reviewSession);
  const [open, setOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const flagged = flaggedTasks(items);
  let rows: { task: Task; inSession: boolean }[];
  if (reviewSession) {
    const inSession = new Set(reviewSession.taskIds);
    const remaining = reviewSession.taskIds.slice(reviewSession.cardIdx)
      .map(id => items.find(it => it.id === id))
      .filter((it): it is Task => !!it && it.kind === 'task')
      .map(t => ({ task: t, inSession: true }));
    const fresh = flagged.filter(t => !inSession.has(t.id)).map(t => ({ task: t, inSession: false }));
    rows = [...remaining, ...fresh];
  } else {
    rows = flagged.map(t => ({ task: t, inSession: false }));
  }

  function reason(t: Task): string {
    if (t.reviewedAt === undefined) return 'never reviewed';
    if (t.createdAt > t.reviewedAt) return 'created after last review';
    return 'updated since last review';
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Review queue</div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: rows.length > 0 ? 'oklch(0.94 0.05 150)' : 'var(--t-surf3)', color: rows.length > 0 ? 'oklch(0.4 0.14 150)' : 'var(--t-muted)' }}>
          {rows.length}
        </span>
        {reviewSession && (
          <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>
            session in progress · card {reviewSession.cardIdx + 1} of {reviewSession.taskIds.length}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {rows.length > 0 && (
            <button onClick={() => { window.location.hash = 'review'; }}
              style={{ border: 'none', background: 'oklch(0.6 0.14 150)', color: 'white', fontSize: 12.5, fontWeight: 700, padding: '6px 14px', borderRadius: 999, cursor: 'pointer' }}>
              ▶ Start review
            </button>
          )}
          <button onClick={() => setOpen(o => !o)}
            style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer' }}>
            {open ? 'Hide queue' : 'Show queue'}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: open && rows.length > 0 ? 12 : 0 }}>
        Tasks the ▶ Review walkthrough will show on next open.
      </div>
      {open && (
        rows.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>Queue is empty — everything reviewed.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(({ task, inSession }, i) => (
              <div key={task.id}
                onClick={() => setOpenTaskId(task.id)}
                title="Open task"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--t-acc)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--t-brd2)')}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)', width: 22, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--t-txt)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: task.status === 'in_progress' ? 'var(--t-acc-bg)' : task.status === 'waiting' ? 'var(--t-amber-bg)' : 'var(--t-surf3)', color: task.status === 'in_progress' ? 'var(--t-acc-dk)' : task.status === 'waiting' ? 'var(--t-amber)' : 'var(--t-txt2)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                  {task.status.replace('_', ' ')}
                </span>
                <span style={{ fontSize: 11, color: 'var(--t-muted)', flexShrink: 0 }}>{reason(task)}</span>
                {inSession && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'oklch(0.94 0.05 150)', color: 'oklch(0.4 0.14 150)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                    In session
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      )}
      {openTaskId && (
        <TaskModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} urlDriven={false} />
      )}
    </div>
  );
}

function ManagedList({ title, items, onAdd, onRemove }: { title: string; items: string[]; onAdd: (n: string) => void; onRemove: (n: string) => void }) {
  const [input, setInput] = useState('');
  const submit = () => { if (input.trim()) { onAdd(input.trim()); setInput(''); } };
  return (
    <div style={{ ...card, flex: 1, minWidth: 240 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {items.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>None yet</div>}
        {items.map(item => (
          <div key={item} style={listItem}>
            <span>{item}</span>
            <span onClick={() => onRemove(item)} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 16, lineHeight: 1 }}>×</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder={`Add ${title.toLowerCase().slice(0, -1)}`} style={inp}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <button onClick={submit} style={addBtn}>Add</button>
      </div>
    </div>
  );
}

export function Settings() {
  useLogMount('Settings');
  const projects = useStore(s => s.projects);
  const customFields = useStore(s => s.customFields);
  const addProject = useStore(s => s.addProject);
  const removeProject = useStore(s => s.removeProject);
  const addCustomField = useStore(s => s.addCustomField);
  const removeCustomField = useStore(s => s.removeCustomField);
  const updateCustomField = useStore(s => s.updateCustomField);
  const themeId = useStore(s => s.themeId);
  const itsmConfig = useStore(s => s.itsmConfig);
  const setItsmConfig = useStore(s => s.setItsmConfig);
  const [page, setPage] = useState<'main' | 'appearance'>('main');

  const [itsm, setItsm] = useState<ItsmConfig>(() => itsmConfig ?? { host: '' });
  function saveItsm() {
    setItsmConfig(itsm.host ? itsm : null);
  }
  const importRef = useRef<HTMLInputElement>(null);

  // Snapshot directory state
  const [snapDirName, setSnapDirName] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [loadingSnaps, setLoadingSnaps] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, ChangeSummary>>({});
  const [debugEnabled, setDebugEnabled] = useState(getDebugMode());
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [showAllSnaps, setShowAllSnaps] = useState(false);

  useEffect(() => {
    getSnapshotDir().then(h => { if (h) setSnapDirName(h.name); });
    refreshSnapshots();
    // Auto-refresh whenever a new snapshot is written (e.g. user navigated
    // to Settings and the navigation itself triggered a snapshot write).
    // Also handles background snapshot writes while Settings stays open.
    return subscribeSnapshots(() => { refreshSnapshots(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshSnapshots() {
    setLoadingSnaps(true);
    try {
      const list = await listSnapshots();
      setSnapshots(list);
      // Change summaries for all snapshots in ONE batch — the logs are read
      // from disk once instead of once per snapshot.
      // list is newest-first; the previous snapshot is at index+1.
      const ranges = list.map((s, i) => ({
        from: i < list.length - 1 ? list[i + 1].time : 0,
        to: s.time,
      }));
      const sums = await summarizeRanges(ranges);
      const map: Record<string, ChangeSummary> = {};
      list.forEach((s, i) => { map[s.filename] = sums[i]; });
      setSummaries(map);
    } catch { /* ignore */ }
    setLoadingSnaps(false);
  }

  async function handleTrash(entry: SnapshotEntry) {
    if (!confirm(`Move snapshot from ${new Date(entry.time).toLocaleString()} to trash?\nIt will disappear from this list. The file will move to ${snapDirName}/trash/ (you can recover it manually).`)) return;
    const ok = await trashSnapshot(entry.filename);
    if (ok) await refreshSnapshots();
    else alert('Failed to move snapshot to trash.');
  }

  function handlePreview(entry: SnapshotEntry) {
    // Open as a popup window (specifying width/height forces popup mode).
    // sessionStorage in that window will be seeded with the snapshot data by main.tsx.
    const url = window.location.origin + window.location.pathname + '#preview/' + encodeURIComponent(entry.filename);
    const w = Math.min(1400, Math.floor(window.screen.availWidth * 0.9));
    const h = Math.min(900, Math.floor(window.screen.availHeight * 0.9));
    const left = Math.floor((window.screen.availWidth - w) / 2);
    const top = Math.floor((window.screen.availHeight - h) / 2);
    window.open(url, '_blank', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  }

  async function handlePickSnapDir() {
    const h = await pickSnapshotDir();
    if (h) {
      setSnapDirName(h.name);
      log('snapshot-dir:configured', { name: h.name });
      // Write an initial snapshot right away
      await writeSnapshot();
      await refreshSnapshots();
    }
  }

  async function handleClearSnapDir() {
    if (!confirm('Stop writing snapshots to this folder? Existing files on disk are not deleted.')) return;
    await clearSnapshotDir();
    setSnapDirName(null);
    setSnapshots([]);
  }

  async function handleRestoreSnapshot(entry: SnapshotEntry) {
    if (!confirm(`Restore snapshot from ${new Date(entry.time).toLocaleString()}?\nAll current data will be overwritten. A new snapshot of your current state will be written first.`)) return;
    // Write a "pre-restore" snapshot as a safety net
    await writeSnapshot();
    log('snapshot:restore-requested', { filename: entry.filename, time: entry.time });
    const data = await readSnapshot(entry.filename);
    if (!data) { alert('Failed to read snapshot file.'); return; }
    restoreFromData(data);
  }

  function handleExport() {
    const date = new Date().toISOString().slice(0, 10);
    triggerDownload(`taskflow-backup-${date}.json`);
  }

  async function handleImportClick() {
    const data = await pickAndRegisterRestoreFile();
    if (data) {
      if (!confirm('This will overwrite all current data. Continue?')) return;
      restoreFromData(data);
      return;
    }
    // Fallback for browsers without File System Access API
    importRef.current?.click();
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as Record<string, unknown>;
        if (!confirm('This will overwrite all current data. Continue?')) return;
        restoreFromData(data);
      } catch {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldTable, setNewFieldTable] = useState(true);
  const [newFieldCard, setNewFieldCard] = useState(false);

  const handleAddField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    addCustomField({ id: nextId('cf'), name, showInTable: newFieldTable, showInCard: newFieldCard });
    setNewFieldName('');
    setNewFieldTable(true);
    setNewFieldCard(false);
  };

  const check = (checked: boolean, label: string, onChange: (v: boolean) => void) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ cursor: 'pointer' }} />
      {label}
    </label>
  );

  if (page === 'appearance') return <ThemePicker onBack={() => setPage('main')} />;

  const activeTheme = THEMES.find(t => t.id === themeId) ?? THEMES[0];

  return (
    <div style={{ flex: 1, padding: '8px 36px 36px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Appearance */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 3 }}>Appearance</div>
            <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>
              Current theme: <span style={{ fontWeight: 600, color: 'var(--t-acc)' }}>{activeTheme.name}</span>
            </div>
          </div>
          <button
            onClick={() => setPage('appearance')}
            style={{ ...addBtn, display: 'flex', alignItems: 'center', gap: 7 }}
          >
            🎨 Change theme
          </button>
        </div>
      </div>

      {/* Backup & Version History */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 6 }}>Backup & Version History</div>
        <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 14 }}>
          Pick a folder on your computer. On every navigation a full snapshot is written to that folder as a JSON file.
          Snapshots older than 7 days are pruned automatically. Debug logs also go here.
        </div>

        {/* Manual export / import */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <button onClick={handleExport} style={addBtn}>↓ Export JSON</button>
          <button onClick={handleImportClick}
            style={{ ...addBtn, background: 'var(--t-surf2)', color: 'var(--t-txt2)', border: '1px solid var(--t-brd)' }}>
            ↑ Import JSON
          </button>
          <button onClick={() => triggerExcelDownload()} style={{ ...addBtn, background: '#1D6F42' }}>
            ↓ Export Excel
          </button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        </div>

        {/* Snapshot folder */}
        {supportsAutoBackup() ? (
          snapDirName ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 9, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--t-txt)' }}>📁 {snapDirName}</div>
                  <div style={{ fontSize: 12, color: 'var(--t-muted)', marginTop: 2 }}>{snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} · 7 day retention</div>
                </div>
                <button onClick={refreshSnapshots}
                  style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', cursor: 'pointer' }}>
                  ↻ Refresh
                </button>
                <span onClick={handleClearSnapDir}
                  style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 16, lineHeight: 1 }}
                  title="Stop using this folder">×</span>
              </div>

              {/* Version history list — collapsible. When collapsed, show
                  latest snapshot summary + total backup folder size. */}
              {(() => {
                const latest = snapshots[0];
                const latestSummary = latest ? summaries[latest.filename] : undefined;
                const totalBytes = snapshots.reduce((n, s) => n + s.size, 0);
                const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(2)} MB`;
                return (
                  <button
                    type="button"
                    onClick={() => setHistoryCollapsed(c => { if (!c) setShowAllSnaps(false); return !c; })}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', marginBottom: historyCollapsed ? 0 : 8,
                      border: '1px solid var(--t-brd2)', borderRadius: 8,
                      background: 'var(--t-surf2)', cursor: 'pointer', textAlign: 'left',
                    }}>
                    <span style={{ fontSize: 11, color: 'var(--t-muted)', transform: historyCollapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s' }}>▸</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Version history
                      </div>
                      {latest ? (
                        <div style={{ fontSize: 12, color: 'var(--t-txt2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'var(--t-txt)', fontWeight: 500 }}>Last saved: {new Date(latest.time).toLocaleString()}</span>
                          {latestSummary && latestSummary.dataEvents > 0 && (
                            <span style={{ color: 'var(--t-muted)' }}> · {formatSummary(latestSummary)}</span>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--t-muted)', marginTop: 4 }}>No snapshots yet.</div>
                      )}
                      {latestSummary && latestSummary.details.length > 0 && (
                        <div style={{ color: 'var(--t-muted)', fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
                          {formatDetailed(latestSummary).map((line, i) => (
                            <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {line}</div>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--t-muted)', marginTop: 4 }}>
                        {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} · {formatBytes(totalBytes)}
                      </div>
                    </div>
                  </button>
                );
              })()}
              {!historyCollapsed && (loadingSnaps ? (
                <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>Loading…</div>
              ) : snapshots.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>No snapshots yet. Navigate between views to create some.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 420, overflowY: 'auto', border: '1px solid var(--t-brd2)', borderRadius: 8 }}>
                  {(showAllSnaps ? snapshots : snapshots.slice(0, 10)).map((s, idx) => {
                    const summary = summaries[s.filename];
                    const isCurrent = idx === 0;
                    return (
                      <div key={s.filename}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--t-brd2)', fontSize: 13 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--t-txt)', fontWeight: 500 }}>{new Date(s.time).toLocaleString()}</span>
                            {isCurrent && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'var(--t-acc-bg)', color: 'var(--t-acc-dk)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Current
                              </span>
                            )}
                          </div>
                          <div style={{ color: 'var(--t-muted)', fontSize: 12, marginTop: 3 }}>
                            {isCurrent
                              ? (summary && summary.dataEvents > 0 ? formatSummary(summary) : 'Latest saved state')
                              : idx === snapshots.length - 1
                                ? 'Initial snapshot'
                                : (summary ? formatSummary(summary) : '…')}
                          </div>
                          {summary && summary.details.length > 0 && (
                            <div style={{ color: 'var(--t-muted)', fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>
                              {formatDetailed(summary).map((line, i) => (
                                <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {line}</div>
                              ))}
                            </div>
                          )}
                          <div style={{ color: 'var(--t-muted)', fontSize: 11, marginTop: 1, opacity: 0.7 }}>{(s.size / 1024).toFixed(1)} KB · {s.filename}</div>
                        </div>
                        <button onClick={() => handlePreview(s)}
                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', cursor: 'pointer', fontWeight: 500 }}
                          title="Open this version in a new tab (read-only)">
                          👁 Preview
                        </button>
                        <button onClick={() => handleRestoreSnapshot(s)}
                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', cursor: 'pointer', fontWeight: 500 }}>
                          Restore
                        </button>
                        <button onClick={() => handleTrash(s)}
                          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-urgent)', cursor: 'pointer', fontWeight: 500 }}
                          title="Move to trash">
                          🗑
                        </button>
                      </div>
                    );
                  })}
                  {!showAllSnaps && snapshots.length > 10 && (
                    <button
                      onClick={() => setShowAllSnaps(true)}
                      style={{ padding: '10px 12px', border: 'none', background: 'var(--t-surf2)', color: 'var(--t-acc-dk)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Show all {snapshots.length} snapshots
                    </button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <button onClick={handlePickSnapDir} style={addBtn}>Choose snapshot folder…</button>
          )
        ) : (
          <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>Auto-backup requires Chrome or Edge.</div>
        )}
      </div>

      {/* Debug logging */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 6 }}>Debug Logging</div>
        <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 14 }}>
          When on, every user interaction (clicks, keyboard shortcuts), component mount/unmount,
          and internal function call is written to the log file. Useful for reproducing weird behavior.
          Files rotate at 10,000 lines and use true append writes (fast). Errors are always logged
          regardless of this setting.
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={debugEnabled}
            onChange={e => { setDebugMode(e.target.checked); setDebugEnabled(e.target.checked); }}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <span style={{ fontWeight: 500 }}>Enable verbose debug logging</span>
          {debugEnabled && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: '#ff8a3d', color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active
            </span>
          )}
        </label>
      </div>

      {/* Jira (multi-host) */}
      <JiraHostsSection />

      {/* ITSM (ServiceNow) */}
      {(() => {
        const fi: React.CSSProperties = { fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', width: '100%', boxSizing: 'border-box' as const };
        const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 };
        const field = (label: string, el: React.ReactNode) => (
          <div><div style={fl}>{label}</div>{el}</div>
        );
        return (
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 4 }}>ITSM Integration</div>
            <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 16 }}>
              ServiceNow or any ITSM tool. Tickets open at: https://HOST/incident.do?sysparm_query=number=TICKET
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {field('Host', <input value={itsm.host} onChange={e => setItsm(i => ({ ...i, host: e.target.value }))} placeholder="mycompany.service-now.com" style={fi} />)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={saveItsm} style={addBtn}>Save</button>
              {itsmConfig && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'oklch(0.5 0.14 150)' }}>
                  <span>✓ Connected · {itsmConfig.host}</span>
                  <span onClick={() => { setItsmConfig(null); setItsm({ host: '' }); }}
                    style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 16 }}>×</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Managed lists row */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <RequestersList />
        <ManagedList title="Projects" items={projects} onAdd={addProject} onRemove={removeProject} />
      </div>

      <ReviewQueueSection />

      <ResponsibilitiesSection />

      {/* Custom fields */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Custom fields</div>
        <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 16 }}>Extra fields shown on the table and/or the card. Values are free text.</div>

        {/* Existing fields */}
        {customFields.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 16 }}>No custom fields yet.</div>
        )}
        {customFields.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {customFields.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 9 }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{f.name}</span>
                {check(f.showInTable, 'Table', v => updateCustomField(f.id, { showInTable: v }))}
                {check(f.showInCard, 'Card', v => updateCustomField(f.id, { showInCard: v }))}
                <span onClick={() => removeCustomField(f.id)} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 16, marginLeft: 4, lineHeight: 1 }}>×</span>
              </div>
            ))}
          </div>
        )}

        {/* Add new field */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--t-brd)' }}>
          <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="Field name"
            style={{ ...inp, flex: '1 1 160px', minWidth: 120 }}
            onKeyDown={e => e.key === 'Enter' && handleAddField()} />
          {check(newFieldTable, 'Table', setNewFieldTable)}
          {check(newFieldCard, 'Card', setNewFieldCard)}
          <button onClick={handleAddField} disabled={!newFieldName.trim()} style={{ ...addBtn, opacity: newFieldName.trim() ? 1 : 0.5, cursor: newFieldName.trim() ? 'pointer' : 'not-allowed' }}>
            Add field
          </button>
        </div>
      </div>
    </div>
  );
}
