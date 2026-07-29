import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { scoreItem } from '../../engine';
import { formatSchedule } from '../../scheduleEngine';
import type { Item, Task, Reminder, Responsibility } from '../../types';
import type { CSSProperties } from 'react';

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

// ── Component ───────────────────────────────────────────────────

export function Table() {
  const items = useStore(s => s.items);
  const requesters = useStore(s => s.requesters);
  const projects = useStore(s => s.projects);
  const customFields = useStore(s => s.customFields);
  const taskOrder = useStore(s => s.taskOrder);
  const setTaskOrder = useStore(s => s.setTaskOrder);
  const updateItem = useStore(s => s.updateItem);
  const archiveItem = useStore(s => s.archiveItem);
  const deleteItem = useStore(s => s.deleteItem);

  const [reqFilter, setReqFilter] = useState('');
  const [projFilter, setProjFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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

  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(STD_COLS.filter(c => c.defaultOn).map(c => c.key))
  );

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
    if (key === 'title') return; // title always visible
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

  // Filter rows
  let rows = items.filter(it => {
    if (it.archived) return false;
    if (reqFilter && (it as Task).requester !== reqFilter) return false;
    if (projFilter && (it as Task).project !== projFilter) return false;
    if (typeFilter && it.kind !== typeFilter) return false;
    if (statusFilter && it.kind === 'task' && it.status !== statusFilter) return false;
    return true;
  });

  // Sort: column sort (with today secondary) OR unified today→manual→score
  if (sort) {
    const col = allCols.find(c => c.key === sort.key);
    if (col) {
      rows = [...rows].sort((a, b) => {
        const av = col.getValue(a), bv = col.getValue(b);
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv : String(av).localeCompare(String(bv));
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    rows = [...rows].sort((a, b) => {
      const aT = a.kind === 'task' && (a as Task).forToday ? 0 : 1;
      const bT = b.kind === 'task' && (b as Task).forToday ? 0 : 1;
      return aT - bT;
    });
  } else {
    // Always: today first → manual order → score fallback
    const orderMap = new Map(taskOrder.map((id, i) => [id, i]));
    rows = [...rows].sort((a, b) => {
      const aT = a.kind === 'task' && (a as Task).forToday ? 0 : 1;
      const bT = b.kind === 'task' && (b as Task).forToday ? 0 : 1;
      if (aT !== bT) return aT - bT;
      const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : Infinity;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : Infinity;
      if (ai !== bi) return ai - bi;
      return scoreItem(b) - scoreItem(a);
    });
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = rows.map(r => r.id);
    const newIds = [...ids];
    const from = newIds.indexOf(dragId);
    const to = newIds.indexOf(targetId);
    newIds.splice(from, 1);
    newIds.splice(to, 0, dragId);
    // Preserve tasks not currently visible (due to filters) at end of order
    const notVisible = taskOrder.filter(id => !ids.includes(id));
    setTaskOrder([...newIds, ...notVisible]);
    setSort(null); // lock into manual mode
    setDragId(null);
    setDragOverId(null);
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

  function bulkArchive() {
    const ids = [...selected].filter(id => rows.some(r => r.id === id));
    if (!ids.length || !confirm(`Archive ${ids.length} item${ids.length > 1 ? 's' : ''}?`)) return;
    ids.forEach(id => archiveItem(id));
    setSelected(new Set());
  }

  function bulkDelete() {
    const ids = [...selected].filter(id => rows.some(r => r.id === id));
    if (!ids.length || !confirm(`Permanently delete ${ids.length} item${ids.length > 1 ? 's' : ''}?`)) return;
    ids.forEach(id => deleteItem(id));
    setSelected(new Set());
  }

  const selCount = rows.filter(it => selected.has(it.id)).length;

  // Ref for the "select all" checkbox to set indeterminate state
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  return (
    <div style={{ flex: 1, padding: '8px 36px 36px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
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

        {taskOrder.length > 0 && (
          <button onClick={() => setTaskOrder([])}
            style={{ fontSize: 12, padding: '6px 11px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-muted)', cursor: 'pointer' }}>
            ↺ Reset order
          </button>
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

      {/* Bulk action bar */}
      {selCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--t-acc-bg)', border: '1px solid var(--t-acc)', borderRadius: 9 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-acc-dk)' }}>{selCount} selected</span>
          <button onClick={() => setSelected(new Set())}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', cursor: 'pointer' }}>
            Clear
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={bulkArchive}
            style={{ fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--t-acc)', color: 'white', cursor: 'pointer' }}>
            ⊙ Archive {selCount}
          </button>
          <button onClick={bulkDelete}
            style={{ fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--t-urgent)', color: 'white', cursor: 'pointer' }}>
            ✕ Delete {selCount}
          </button>
        </div>
      )}

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 10, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--t-surf2)', borderBottom: '1px solid var(--t-brd)' }}>
            <th style={{ ...th, width: 28, cursor: 'default' }} />
            <th style={{ ...th, width: 36, cursor: 'default', textAlign: 'right' }}>#</th>
            <th style={{ ...th, width: 40, cursor: 'default' }} onClick={e => e.stopPropagation()}>
              <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleSelectAll} style={{ cursor: 'pointer', width: 15, height: 15 }} />
            </th>
            <th style={{ ...th, width: 60, cursor: 'default', textAlign: 'center' }}>Today</th>
            {cols.map(col => (
              <th key={col.key} onClick={() => handleSortClick(col.key)}
                style={{ ...th, textAlign: col.align ?? 'left' }}>
                {col.label}{sortIcon(col.key)}
              </th>
            ))}
            <th style={{ ...th, width: 80, cursor: 'default' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(it => {
            const isSelected = selected.has(it.id);
            const isToday = it.kind === 'task' && (it as Task).forToday;
            const isDragging = dragId === it.id;
            const isDragOver = dragOverId === it.id;
            const rowBg = isSelected ? 'var(--t-acc-bg)' : isToday ? 'var(--t-amber-bg)' : 'var(--t-surf)';
            const rowStyle: CSSProperties = {
              background: rowBg,
              opacity: isDragging ? 0.4 : 1,
              borderTop: isDragOver ? '2px solid var(--t-acc)' : undefined,
            };
            return (
              <tr key={it.id}
                draggable
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(it.id); }}
                onDragOver={e => { e.preventDefault(); if (it.id !== dragId) setDragOverId(it.id); }}
                onDrop={e => { e.preventDefault(); handleDrop(it.id); }}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                style={rowStyle}
                onMouseEnter={e => { if (!isSelected && !isDragging) e.currentTarget.style.background = isToday ? 'var(--t-amber-bg)' : 'var(--t-surf2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>
                <td style={{ ...td, width: 28, color: 'var(--t-brd)', cursor: 'grab', userSelect: 'none', fontSize: 15, textAlign: 'center', paddingLeft: 8, paddingRight: 4 }}>
                  ⠿
                </td>
                <td style={{ ...td, width: 36, textAlign: 'right', fontSize: 12, color: 'var(--t-muted)', fontWeight: 600, paddingRight: 10 }}>
                  {rows.indexOf(it) + 1}
                </td>
                <td style={{ ...td, width: 40 }} onClick={() => toggleRow(it.id)}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleRow(it.id)} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                </td>
                <td style={{ ...td, width: 60, textAlign: 'center' }}>
                  {it.kind === 'task' && (
                    <input
                      type="checkbox"
                      checked={(it as Task).forToday ?? false}
                      onChange={() => updateItem(it.id, { forToday: !(it as Task).forToday })}
                      style={{ cursor: 'pointer', width: 15, height: 15, accentColor: 'var(--t-amber)' }}
                      title="Mark for today"
                    />
                  )}
                </td>
                {cols.map(col => (
                  <td key={col.key} style={{ ...td, textAlign: col.align ?? 'left', fontWeight: col.key === 'title' ? 500 : 400, color: col.key === 'title' ? 'var(--t-txt)' : 'var(--t-txt2)' }}>
                    {String(col.getValue(it) || '—')}
                  </td>
                ))}
                <td style={{ ...td, textAlign: 'right' }}>
                  <span onClick={() => { if (confirm('Archive this item?')) archiveItem(it.id); }}
                    style={{ fontSize: 12, color: 'var(--t-muted)', cursor: 'pointer', marginRight: 8, fontWeight: 500 }}
                    title="Archive">⊙</span>
                  <span onClick={() => { if (confirm('Permanently delete?')) deleteItem(it.id); }}
                    style={{ fontSize: 12, color: 'var(--t-urgent)', cursor: 'pointer', fontWeight: 500 }}
                    title="Delete">✕</span>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length + 4} style={{ ...td, textAlign: 'center', color: 'var(--t-muted)', padding: '32px 14px' }}>No items match the filters</td>
            </tr>
          )}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>{rows.length} item{rows.length !== 1 ? 's' : ''}</div>
    </div>
  );
}
