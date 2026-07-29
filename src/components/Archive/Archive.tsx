import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { TaskModal } from '../TaskModal/TaskModal';
import { scoreItem } from '../../engine';
import { formatSchedule } from '../../scheduleEngine';
import type { Item, Task, Reminder, Responsibility } from '../../types';

// ── Column definitions ──────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  defaultOn: boolean;
  getValue: (it: Item) => string | number;
  align?: 'right';
}

const STD_COLS: ColDef[] = [
  { key: 'title', label: 'Title', defaultOn: true, getValue: it => it.title },
  { key: 'type', label: 'Type', defaultOn: true, getValue: it => it.kind === 'task' ? 'Task' : it.kind === 'reminder' ? 'Reminder' : 'Responsibility' },
  { key: 'requester', label: 'Requester', defaultOn: true, getValue: it => (it as Task).requester ?? '' },
  { key: 'project', label: 'Project', defaultOn: true, getValue: it => (it as Task).project ?? '' },
  { key: 'status', label: 'Status / Schedule', defaultOn: true, getValue: it => it.kind === 'task' ? it.status.replace('_', ' ') : formatSchedule((it as Reminder | Responsibility).schedule) },
  { key: 'jira', label: 'Jira', defaultOn: true, getValue: it => (it as Task).jiraLink ?? '' },
  { key: 'tags', label: 'Tags', defaultOn: false, getValue: it => {
    if (it.kind !== 'task') return '';
    const t = it as Task;
    if (t.noTag) return 'None';
    return [t.urgent && 'Urgent', t.important && 'Important', t.quick && 'Quick'].filter(Boolean).join(', ') || '—';
  }},
  { key: 'score', label: 'Score', defaultOn: true, align: 'right', getValue: it => scoreItem(it) },
  { key: 'created', label: 'Created', defaultOn: false, getValue: it => new Date(it.createdAt).toLocaleDateString() },
  { key: 'updated', label: 'Updated', defaultOn: false, getValue: it => new Date(it.updatedAt).toLocaleDateString() },
];

// ── Styles ──────────────────────────────────────────────────────

const selectSt: React.CSSProperties = { fontSize: 13, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)' };
const EDITABLE_COLS = new Set(['title', 'requester', 'project', 'status', 'jira']);

// ── Component ───────────────────────────────────────────────────

export function Archive() {
  const items = useStore(s => s.items);
  const requesters = useStore(s => s.requesters);
  const projects = useStore(s => s.projects);
  const customFields = useStore(s => s.customFields);
  const updateItem = useStore(s => s.updateItem);
  const updateItemCustomValue = useStore(s => s.updateItemCustomValue);
  const toggleTag = useStore(s => s.toggleTag);
  const unarchiveItem = useStore(s => s.unarchiveItem);
  const deleteItem = useStore(s => s.deleteItem);

  const [reqFilter, setReqFilter] = useState('');
  const [projFilter, setProjFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  const [focusedRowIdx, setFocusedRowIdx] = useState(-1);
  const [editCell, setEditCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const rowsRef = useRef<Item[]>([]);
  const focusedIdxRef = useRef(-1);

  // Build all available columns (std + custom)
  const allCols: ColDef[] = [
    ...STD_COLS,
    ...customFields.filter(f => f.showInTable).map(f => ({
      key: `cf_${f.id}`,
      label: f.name,
      defaultOn: true,
      getValue: (it: Item) => it.kind === 'task' ? ((it as Task).customValues?.[f.id] ?? '') : '',
    })),
  ];

  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('taskflow-archive-cols');
      if (saved) return new Set(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return new Set(STD_COLS.filter(c => c.defaultOn).map(c => c.key));
  });

  useEffect(() => {
    localStorage.setItem('taskflow-archive-cols', JSON.stringify([...visibleCols]));
  }, [visibleCols]);

  // Sync new custom field cols into visible set
  useEffect(() => {
    const newKeys = customFields.filter(f => f.showInTable).map(f => `cf_${f.id}`);
    setVisibleCols(prev => {
      const next = new Set(prev);
      newKeys.forEach(k => next.add(k));
      return next;
    });
  }, [customFields]);

  // Close col picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setColPickerOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const cols = allCols.filter(c => visibleCols.has(c.key));

  function toggleCol(key: string) {
    if (key === 'title') return;
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleSortClick(key: string) {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  function sortIcon(key: string) {
    if (!sort || sort.key !== key) return <span style={{ color: 'var(--t-brd)', marginLeft: 4 }}>↕</span>;
    return <span style={{ color: 'var(--t-acc)', marginLeft: 4 }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  }

  // Filter rows (archived only)
  let rows = items.filter(it => {
    if (!it.archived) return false;
    if (reqFilter && (it as Task).requester !== reqFilter) return false;
    if (projFilter && (it as Task).project !== projFilter) return false;
    if (typeFilter && it.kind !== typeFilter) return false;
    if (statusFilter && it.kind === 'task' && it.status !== statusFilter) return false;
    return true;
  });

  // Sort
  if (sort) {
    const col = allCols.find(c => c.key === sort.key);
    if (col) {
      rows = [...rows].sort((a, b) => {
        const av = col.getValue(a), bv = col.getValue(b);
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
  }

  const th: React.CSSProperties = { padding: '11px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--t-muted)', fontWeight: 700, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--t-brd2)', fontSize: 13.5, color: 'var(--t-txt2)' };

  const allChecked = rows.length > 0 && rows.every(it => selected.has(it.id));
  const someChecked = rows.some(it => selected.has(it.id)) && !allChecked;

  function toggleSelectAll() {
    if (allChecked) {
      setSelected(prev => { const n = new Set(prev); rows.forEach(it => n.delete(it.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); rows.forEach(it => n.add(it.id)); return n; });
    }
  }

  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function bulkRestore() {
    const ids = [...selected].filter(id => rows.some(r => r.id === id));
    if (!ids.length || !confirm(`Restore ${ids.length} item${ids.length > 1 ? 's' : ''}?`)) return;
    ids.forEach(id => unarchiveItem(id));
    setSelected(new Set());
  }

  function bulkDelete() {
    const ids = [...selected].filter(id => rows.some(r => r.id === id));
    if (!ids.length || !confirm(`Permanently delete ${ids.length} item${ids.length > 1 ? 's' : ''}?`)) return;
    ids.forEach(id => deleteItem(id));
    setSelected(new Set());
  }

  const selCount = rows.filter(it => selected.has(it.id)).length;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  const archived = items.filter(it => it.archived);

  // Keep refs current for keydown handler
  rowsRef.current = rows;
  focusedIdxRef.current = focusedRowIdx;

  // Arrow key row navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedRowIdx(i => Math.min(i + 1, rowsRef.current.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedRowIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && focusedIdxRef.current >= 0) {
        const item = rowsRef.current[focusedIdxRef.current];
        if (item) openTask(item.id);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function getRawEditValue(it: Item, colKey: string): string {
    if (it.kind !== 'task') return '';
    const t = it as Task;
    if (colKey === 'title') return t.title;
    if (colKey === 'requester') return t.requester ?? '';
    if (colKey === 'project') return t.project ?? '';
    if (colKey === 'status') return t.status;
    if (colKey === 'jira') return t.jiraLink ?? '';
    if (colKey.startsWith('cf_')) return t.customValues?.[colKey.slice(3)] ?? '';
    return '';
  }

  function startEdit(e: React.MouseEvent, rowId: string, colKey: string) {
    e.stopPropagation();
    const item = rows.find(r => r.id === rowId);
    if (!item || item.kind !== 'task') return;
    setEditCell({ rowId, colKey });
    setEditValue(getRawEditValue(item, colKey));
  }

  function saveEdit(value: string, colKey: string, rowId: string) {
    if (colKey === 'title') updateItem(rowId, { title: value });
    else if (colKey === 'requester') updateItem(rowId, { requester: value });
    else if (colKey === 'project') updateItem(rowId, { project: value });
    else if (colKey === 'status') updateItem(rowId, { status: value as Task['status'] });
    else if (colKey === 'jira') updateItem(rowId, { jiraLink: value });
    else if (colKey.startsWith('cf_')) updateItemCustomValue(rowId, colKey.slice(3), value);
    setEditCell(null);
  }

  function commitEdit() { if (editCell) saveEdit(editValue, editCell.colKey, editCell.rowId); }

  function openTask(id: string) { setModalTaskId(id); }

  return (
    <>
    <div style={{ flex: 1, padding: '8px 36px 36px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
      {archived.length === 0 ? (
        <div style={{ paddingTop: 60, textAlign: 'center', color: 'var(--t-muted)', fontSize: 15 }}>No archived items yet.</div>
      ) : (
        <>
          {/* Filters + column picker */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectSt}>
              <option value="">All types</option>
              <option value="task">Task</option>
              <option value="reminder">Reminder</option>
              <option value="responsibility">Responsibility</option>
            </select>
            <select value={reqFilter} onChange={e => setReqFilter(e.target.value)} style={selectSt}>
              <option value="">All requesters</option>
              {requesters.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={projFilter} onChange={e => setProjFilter(e.target.value)} style={selectSt}>
              <option value="">All projects</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectSt}>
              <option value="">All statuses</option>
              <option value="in_progress">In progress</option>
              <option value="backlog">Backlog</option>
              <option value="waiting">Waiting</option>
              <option value="done">Done</option>
            </select>

            {selCount > 0 && (
              <>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-acc-dk)' }}>{selCount} selected</span>
                <button onClick={() => setSelected(new Set())}
                  style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', cursor: 'pointer' }}>
                  Clear
                </button>
                <button onClick={bulkRestore}
                  style={{ fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--t-acc)', color: 'white', cursor: 'pointer' }}>
                  ↩ Restore {selCount}
                </button>
                <button onClick={bulkDelete}
                  style={{ fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--t-urgent)', color: 'white', cursor: 'pointer' }}>
                  ✕ Delete {selCount}
                </button>
              </>
            )}

            <div style={{ marginLeft: 'auto', position: 'relative' }} ref={colPickerRef}>
              <button onClick={() => setColPickerOpen(o => !o)}
                style={{ fontSize: 13, padding: '7px 12px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', cursor: 'pointer', color: 'var(--t-txt2)', fontWeight: 500 }}>
                Columns ▾
              </button>
              {colPickerOpen && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: '8px 0', zIndex: 30, minWidth: 180 }}>
                  {allCols.map(col => (
                    <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: col.key === 'title' ? 'default' : 'pointer', fontSize: 13.5, color: 'var(--t-txt)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-surf2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--t-surf)')}>
                      <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} disabled={col.key === 'title'} style={{ cursor: col.key === 'title' ? 'default' : 'pointer' }} />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 10, overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: 'var(--t-surf2)', borderBottom: '1px solid var(--t-brd)' }}>
                <th style={{ ...th, width: 40, cursor: 'default' }} onClick={e => e.stopPropagation()}>
                  <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleSelectAll} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                </th>
                {cols.map(col => (
                  <th key={col.key} onClick={() => handleSortClick(col.key)}
                    style={{ ...th, textAlign: col.align ?? 'left' }}>
                    {col.label}{sortIcon(col.key)}
                  </th>
                ))}
                <th style={{ ...th, width: 40, cursor: 'default' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((it, rowIdx) => {
                const isSelected = selected.has(it.id);
                const isFocused = focusedRowIdx === rowIdx;
                const rowBg = isSelected ? 'var(--t-acc-bg)' : isFocused ? 'var(--t-surf2)' : 'var(--t-surf)';
                const inpSt: React.CSSProperties = { width: '100%', fontSize: 13.5, padding: '5px 7px', border: '1px solid var(--t-acc)', borderRadius: 5, background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none', boxSizing: 'border-box' };
                return (
                  <tr key={it.id}
                    onClick={() => setFocusedRowIdx(rowIdx)}
                    style={{ background: rowBg, cursor: 'default', outline: isFocused ? '2px solid var(--t-acc)' : undefined, outlineOffset: '-2px' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--t-surf2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>
                    <td style={{ ...td, width: 40 }} onClick={e => { e.stopPropagation(); toggleRow(it.id); }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(it.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                    </td>
                    {cols.map(col => {
                      const isEditable = it.kind === 'task' && (EDITABLE_COLS.has(col.key) || col.key.startsWith('cf_'));
                      const isEditing = editCell?.rowId === it.id && editCell?.colKey === col.key;

                      // Tags column: inline chip multi-select
                      if (col.key === 'tags' && it.kind === 'task') {
                        const t = it as Task;
                        const chips = [
                          { key: 'urgent' as const, label: 'Urgent', color: 'var(--t-urgent)', bg: 'var(--t-urgent-bg)' },
                          { key: 'important' as const, label: 'Important', color: 'var(--t-important)', bg: 'var(--t-important-bg)' },
                          { key: 'quick' as const, label: 'Quick', color: 'var(--t-quick)', bg: 'var(--t-quick-bg)' },
                          { key: 'noTag' as const, label: 'None', color: 'var(--t-muted)', bg: 'var(--t-surf2)' },
                        ];
                        return (
                          <td key={col.key} onClick={e => e.stopPropagation()} style={{ ...td }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {chips.map(({ key, label, color, bg }) => {
                                const active = key === 'noTag' ? t.noTag : t[key];
                                return (
                                  <button key={key} onClick={() => toggleTag(it.id, key)}
                                    style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, border: `1px solid ${active ? color : 'var(--t-brd)'}`, background: active ? bg : 'transparent', color: active ? color : 'var(--t-muted)', cursor: 'pointer', fontWeight: active ? 700 : 400 }}>
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        );
                      }

                      if (isEditing) {
                        return (
                          <td key={col.key} onClick={e => e.stopPropagation()} style={{ ...td, padding: '4px 8px' }}>
                            {col.key === 'requester' ? (
                              <select autoFocus value={editValue} style={inpSt}
                                onChange={e => saveEdit(e.target.value, col.key, it.id)} onBlur={() => setEditCell(null)}>
                                <option value="">—</option>
                                {requesters.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                            ) : col.key === 'project' ? (
                              <select autoFocus value={editValue} style={inpSt}
                                onChange={e => saveEdit(e.target.value, col.key, it.id)} onBlur={() => setEditCell(null)}>
                                <option value="">—</option>
                                {projects.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            ) : col.key === 'status' ? (
                              <select autoFocus value={editValue} style={inpSt}
                                onChange={e => saveEdit(e.target.value, col.key, it.id)} onBlur={() => setEditCell(null)}>
                                <option value="in_progress">In progress</option>
                                <option value="backlog">Backlog</option>
                                <option value="waiting">Waiting</option>
                                <option value="done">Done</option>
                              </select>
                            ) : (
                              <input autoFocus value={editValue} style={inpSt}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } if (e.key === 'Escape') setEditCell(null); }} />
                            )}
                          </td>
                        );
                      }
                      const cellKey = `${it.id}:${col.key}`;
                      return (
                        <td key={col.key}
                          onClick={isEditable ? e => startEdit(e, it.id, col.key) : undefined}
                          onMouseEnter={() => { if (isEditable) setHoveredCell(cellKey); }}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{ ...td, textAlign: col.align ?? 'left', fontWeight: col.key === 'title' ? 500 : 400, color: col.key === 'title' ? 'var(--t-txt)' : 'var(--t-txt2)', cursor: isEditable ? 'text' : 'default', background: hoveredCell === cellKey ? 'var(--t-acc-bg)' : undefined }}>
                          {String(col.getValue(it) || '—')}
                        </td>
                      );
                    })}
                    <td onClick={e => e.stopPropagation()} style={{ ...td, textAlign: 'right', width: 40 }}>
                      <span onClick={() => { openTask(it.id); }}
                        style={{ fontSize: 15, color: 'var(--t-acc)', cursor: 'pointer', fontWeight: 600 }}
                        title="Open task">→</span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 2} style={{ ...td, textAlign: 'center', color: 'var(--t-muted)', padding: '32px 14px' }}>No items match the filters</td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>{rows.length} item{rows.length !== 1 ? 's' : ''}</div>
        </>
      )}
    </div>
    {modalTaskId && <TaskModal taskId={modalTaskId} allIds={rows.map(r => r.id)} onNavigate={setModalTaskId} onClose={() => setModalTaskId(null)} />}
    </>
  );
}
