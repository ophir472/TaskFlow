import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { nextId } from '../../engine';
import { THEMES } from '../../themes';
import { ThemePicker } from './ThemePicker';
import { triggerDownload, restoreFromData, supportsAutoBackup, triggerExcelDownload, pickAndRegisterRestoreFile } from '../../backup';
import { pickSnapshotDir, getSnapshotDir, clearSnapshotDir, listSnapshots, readSnapshot, writeSnapshot, log, trashSnapshot, summarizeRange, formatSummary, getDebugMode, setDebugMode } from '../../snapshots';
import type { SnapshotEntry, ChangeSummary } from '../../snapshots';
import { useLogMount } from '../../useLogMount';
import type { JiraConfig, ItsmConfig } from '../../types';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };
const listItem: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 8, fontSize: 14, color: 'var(--t-txt)' };
const addBtn: React.CSSProperties = { border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const inp: React.CSSProperties = { flex: 1, fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)' };

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
  const requesters = useStore(s => s.requesters);
  const projects = useStore(s => s.projects);
  const customFields = useStore(s => s.customFields);
  const addRequester = useStore(s => s.addRequester);
  const removeRequester = useStore(s => s.removeRequester);
  const addProject = useStore(s => s.addProject);
  const removeProject = useStore(s => s.removeProject);
  const addCustomField = useStore(s => s.addCustomField);
  const removeCustomField = useStore(s => s.removeCustomField);
  const updateCustomField = useStore(s => s.updateCustomField);
  const themeId = useStore(s => s.themeId);
  const jiraConfig = useStore(s => s.jiraConfig);
  const setJiraConfig = useStore(s => s.setJiraConfig);
  const itsmConfig = useStore(s => s.itsmConfig);
  const setItsmConfig = useStore(s => s.setItsmConfig);
  const [page, setPage] = useState<'main' | 'appearance'>('main');

  const [jira, setJira] = useState<JiraConfig>(() => jiraConfig ?? {
    host: '', username: '', apiToken: '', projectKey: '', component: '', defaultAssigneeId: '',
  });

  function saveJira() {
    setJiraConfig(jira.host && jira.username && jira.apiToken && jira.projectKey ? jira : null);
  }

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

  useEffect(() => {
    getSnapshotDir().then(h => { if (h) setSnapDirName(h.name); });
    refreshSnapshots();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshSnapshots() {
    setLoadingSnaps(true);
    try {
      const list = await listSnapshots();
      setSnapshots(list);
      // Compute change summaries for each snapshot (change since previous)
      const map: Record<string, ChangeSummary> = {};
      // list is newest-first; the previous snapshot is at index+1
      for (let i = 0; i < list.length; i++) {
        const from = i < list.length - 1 ? list[i + 1].time : 0;
        const to = list[i].time;
        // eslint-disable-next-line no-await-in-loop
        map[list[i].filename] = await summarizeRange(from, to);
      }
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

              {/* Version history list */}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Version history
              </div>
              {loadingSnaps ? (
                <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>Loading…</div>
              ) : snapshots.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>No snapshots yet. Navigate between views to create some.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 420, overflowY: 'auto', border: '1px solid var(--t-brd2)', borderRadius: 8 }}>
                  {snapshots.map((s, idx) => {
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
                </div>
              )}
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

      {/* Jira */}
      {(() => {
        const fi: React.CSSProperties = { fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', width: '100%', boxSizing: 'border-box' as const };
        const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 };
        const field = (label: string, el: React.ReactNode) => (
          <div><div style={fl}>{label}</div>{el}</div>
        );
        return (
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 4 }}>Jira Integration</div>
            <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 16 }}>
              Use an{' '}
              <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" style={{ color: 'var(--t-acc)' }}>Atlassian API token</a>
              {' '}(not your password). Fields marked * are required.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {field('Host *',
                <input value={jira.host} onChange={e => setJira(j => ({ ...j, host: e.target.value }))} placeholder="mycompany.atlassian.net" style={fi} />
              )}
              {field('Project Key *',
                <input value={jira.projectKey} onChange={e => setJira(j => ({ ...j, projectKey: e.target.value.toUpperCase() }))} placeholder="PROJ" style={fi} />
              )}
              {field('Username (email) *',
                <input value={jira.username} onChange={e => setJira(j => ({ ...j, username: e.target.value }))} placeholder="you@company.com" style={fi} />
              )}
              {field('API Token *',
                <input value={jira.apiToken} onChange={e => setJira(j => ({ ...j, apiToken: e.target.value }))} type="password" placeholder="••••••••••••" style={fi} />
              )}
              {field('Default Component',
                <input value={jira.component} onChange={e => setJira(j => ({ ...j, component: e.target.value }))} placeholder="Frontend (optional)" style={fi} />
              )}
              {field('Default Assignee Account ID',
                <input value={jira.defaultAssigneeId} onChange={e => setJira(j => ({ ...j, defaultAssigneeId: e.target.value }))} placeholder="5d3f… (from Jira profile URL)" style={fi} />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={saveJira} style={addBtn}>Save</button>
              {jiraConfig && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'oklch(0.5 0.14 150)' }}>
                  <span>✓ Connected · {jiraConfig.host} / {jiraConfig.projectKey}</span>
                  <span onClick={() => { setJiraConfig(null); setJira({ host: '', username: '', apiToken: '', projectKey: '', component: '', defaultAssigneeId: '' }); }}
                    style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 16 }}>×</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
        <ManagedList title="Requesters" items={requesters} onAdd={addRequester} onRemove={removeRequester} />
        <ManagedList title="Projects" items={projects} onAdd={addProject} onRemove={removeProject} />
      </div>

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
