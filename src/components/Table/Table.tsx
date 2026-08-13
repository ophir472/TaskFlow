import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { useLogMount } from '../../useLogMount';
import { TaskModal } from '../TaskModal/TaskModal';
import { DailyPlay } from '../DailyPlay/DailyPlay';
import { ReminderModal } from '../ReminderPopup/ReminderModal';
import { AiAssignModal } from './AiAssignModal';
import { jiraTicketUrl } from '../../jiraHosts';
import { scoreItem, duplicateTask } from '../../engine';
import { formatSchedule } from '../../scheduleEngine';
import type { Item, Task, Reminder } from '../../types';
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
  { key: 'type', label: 'Type', defaultOn: true, getValue: it => it.kind === 'task' ? 'Task' : 'Reminder' },
  { key: 'requester', label: 'Requester', defaultOn: true, getValue: it => (it as Task).requester ?? '' },
  { key: 'project', label: 'Project', defaultOn: true, getValue: it => (it as Task).project ?? '' },
  { key: 'status', label: 'Status / Schedule', defaultOn: true, getValue: it => it.kind === 'task' ? it.status.replace('_', ' ') : formatSchedule((it as Reminder).schedule) },
  { key: 'jira', label: 'Jira', defaultOn: true, getValue: it => (it as Task).jiraLink ?? '' },
  { key: 'tags', label: 'Tags', defaultOn: false, getValue: it => {
    if (it.kind !== 'task') return '';
    const t = it as Task;
    if (t.noTag) return 'None';
    return [t.urgent && 'Urgent', t.important && 'Important', t.quick && 'Quick'].filter(Boolean).join(', ') || '—';
  }},
  { key: 'estimate', label: 'Estimate', defaultOn: false, getValue: it => (it as Task).estimate ?? '' },
  { key: 'score', label: 'Score', defaultOn: true, align: 'right', getValue: it => scoreItem(it) },
  { key: 'created', label: 'Created', defaultOn: false, getValue: it => new Date(it.createdAt).toLocaleDateString() },
  { key: 'updated', label: 'Updated', defaultOn: false, getValue: it => new Date(it.updatedAt).toLocaleDateString() },
];

// ── Styles ──────────────────────────────────────────────────────

function ghostSelect(hasValue: boolean): React.CSSProperties {
  return {
    fontSize: 13,
    padding: '5px 6px 5px 10px',
    borderRadius: 6,
    border: 'none',
    background: hasValue ? 'var(--t-acc-bg)' : 'transparent',
    color: hasValue ? 'var(--t-acc-dk)' : 'var(--t-muted)',
    fontWeight: hasValue ? 500 : 400,
    cursor: 'pointer',
    outline: 'none',
  };
}
const ghostBtn: React.CSSProperties = {
  fontSize: 13, padding: '5px 10px', borderRadius: 6, border: 'none',
  background: 'transparent', color: 'var(--t-muted)', cursor: 'pointer', fontWeight: 500,
};
const EDITABLE_COLS = new Set(['title', 'requester', 'project', 'status', 'jira', 'estimate']);
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  title: 200, type: 110, requester: 120, project: 120,
  status: 130, jira: 90, tags: 150, estimate: 90, score: 65, created: 95, updated: 95,
};

// ── Component ───────────────────────────────────────────────────

export function Table() {
  useLogMount('Table');
  const items = useStore(s => s.items);
  const requesters = useStore(s => s.requesters);
  const projects = useStore(s => s.projects);
  const customFields = useStore(s => s.customFields);
  const taskOrder = useStore(s => s.taskOrder);
  const setTaskOrder = useStore(s => s.setTaskOrder);
  const resetManualOrder = useStore(s => s.resetManualOrder);
  const updateItem = useStore(s => s.updateItem);
  const updateItemCustomValue = useStore(s => s.updateItemCustomValue);
  const setForToday = useStore(s => s.setForToday);
  const jiraConfigs = useStore(s => s.jiraConfigs);
  const openJira = (url: string, _key: string) => window.open(url, '_blank');
  const toggleTag = useStore(s => s.toggleTag);
  const archiveItem = useStore(s => s.archiveItem);
  const deleteItem = useStore(s => s.deleteItem);
  const createItem = useStore(s => s.createItem);
  const tableVisibleColsArr = useStore(s => s.tableVisibleCols);
  const setTableVisibleCols = useStore(s => s.setTableVisibleCols);
  const tableColWidthsStore = useStore(s => s.tableColWidths);
  const setTableColWidths = useStore(s => s.setTableColWidths);

  const [reqFilter, setReqFilter] = useState('');
  const [projFilter, setProjFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [minScore, setMinScore] = useState('');
  const [quickFilters, setQuickFilters] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [frozenRowIds, setFrozenRowIds] = useState<string[] | null>(null);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [focusedRowIdx, setFocusedRowIdx] = useState(-1);
  const [editCell, setEditCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const [reminderModalId, setReminderModalId] = useState<string | null>(null);
  const [aiTaskId, setAiTaskId] = useState<string | null>(null);
  const [dailyOpen, setDailyOpen] = useState(false);
  const colWidths = tableColWidthsStore;
  const [hoveredResize, setHoveredResize] = useState<string | null>(null);

  function setColWidths(updater: ((p: Record<string, number>) => Record<string, number>) | Record<string, number>) {
    const next = typeof updater === 'function' ? updater(colWidths) : updater;
    setTableColWidths(next);
  }

  function resetColWidth(colKey: string) {
    const n = { ...colWidths }; delete n[colKey]; setTableColWidths(n);
  }

  function startColResize(e: React.MouseEvent, colKey: string) {
    e.preventDefault();
    e.stopPropagation();
    const resizeTh = (e.currentTarget as HTMLElement).closest('th') as HTMLTableCellElement;
    const table = resizeTh.closest('table') as HTMLTableElement;
    // Freeze ALL data column widths so other columns don't redistribute during drag
    const dataHeaders = Array.from(table.querySelectorAll('thead th[data-colkey]')) as HTMLTableCellElement[];
    dataHeaders.forEach(th => { th.style.width = th.offsetWidth + 'px'; });
    const startX = e.clientX;
    const startWidth = resizeTh.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(ev: MouseEvent) {
      resizeTh.style.width = Math.max(50, startWidth + (ev.clientX - startX)) + 'px';
    }
    function onUp(ev: MouseEvent) {
      const finalW = Math.max(50, startWidth + (ev.clientX - startX));
      const newWidths: Record<string, number> = {};
      dataHeaders.forEach(th => {
        const key = th.dataset.colkey;
        if (key) newWidths[key] = key === colKey ? finalW : th.offsetWidth;
      });
      // React will overwrite the drag-set DOM styles with these state values on next render.
      // Do NOT clear th.style.width here — that would undo what React sets.
      setColWidths(newWidths);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
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

  // visibleCols from store (persisted + included in backup automatically)
  const defaultVisibleCols = new Set(STD_COLS.filter(c => c.defaultOn).map(c => c.key));
  const visibleCols: Set<string> = tableVisibleColsArr ? new Set(tableVisibleColsArr) : defaultVisibleCols;
  function setVisibleCols(updater: ((p: Set<string>) => Set<string>) | Set<string>) {
    const next = typeof updater === 'function' ? updater(visibleCols) : updater;
    setTableVisibleCols([...next]);
  }

  // Sync new custom field cols into visible set
  useEffect(() => {
    const newKeys = customFields.filter(f => f.showInTable).map(f => `cf_${f.id}`);
    const missing = newKeys.filter(k => !visibleCols.has(k));
    if (missing.length > 0) {
      setTableVisibleCols([...visibleCols, ...missing]);
    }
  }, [customFields]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  let rows = items.filter(it => {
    if (it.archived) return false;
    if (reqFilter && (it as Task).requester !== reqFilter) return false;
    if (projFilter && (it as Task).project !== projFilter) return false;
    if (typeFilter && it.kind !== typeFilter) return false;
    if (statusFilter && it.kind === 'task' && it.status !== statusFilter) return false;
    // Tag priority filter
    if (tagFilter && it.kind === 'task') {
      const t = it as Task;
      if (tagFilter === 'urgent' && !t.urgent) return false;
      if (tagFilter === 'important' && !t.important) return false;
      if (tagFilter === 'quick' && !t.quick) return false;
      if (tagFilter === 'noTag' && !t.noTag) return false;
    }
    // Quick filters
    if (minScore !== '' && scoreItem(it) < Number(minScore)) return false;
    if (quickFilters.has('createdToday') && it.createdAt < todayStart) return false;
    if (quickFilters.has('updatedToday') && it.updatedAt < todayStart) return false;
    if (quickFilters.has('forToday') && !(it.kind === 'task' && (it as Task).forToday)) return false;
    if (quickFilters.has('untagged') && !(it.kind === 'task' && !(it as Task).urgent && !(it as Task).important && !(it as Task).quick && !(it as Task).noTag)) return false;
    if (quickFilters.has('mail') && !(it.kind === 'task' && (it as Task).type === 'mail')) return false;
    return true;
  });

  const isManual = (it: Item) => it.kind === 'task' && !!(it as Task).manuallyMoved;
  const isUntaggedTask = (it: Item) =>
    it.kind === 'task' && !(it as Task).urgent && !(it as Task).important &&
    !(it as Task).quick && !(it as Task).noTag;

  // While editing tags: freeze the row order so score changes don't move rows around
  if (frozenRowIds) {
    const frozenMap = new Map(frozenRowIds.map((id, i) => [id, i]));
    rows = [...rows].sort((a, b) => {
      const ai = frozenMap.has(a.id) ? frozenMap.get(a.id)! : Infinity;
      const bi = frozenMap.has(b.id) ? frozenMap.get(b.id)! : Infinity;
      return ai - bi;
    });
  } else if (sort) {
    // Temporary column sort — manual positions not preserved
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
    // Merge: manual tasks hold their exact positions; auto tasks fill remaining slots by score
    const itemMap = new Map(rows.map(it => [it.id, it]));
    const manualIds = new Set(rows.filter(isManual).map(it => it.id));

    const autoSorted = rows.filter(it => !manualIds.has(it.id)).sort((a, b) => {
      const aT = a.kind === 'task' && (a as Task).forToday ? 0 : 1;
      const bT = b.kind === 'task' && (b as Task).forToday ? 0 : 1;
      if (aT !== bT) return aT - bT;
      const aU = isUntaggedTask(a) ? 0 : 1;
      const bU = isUntaggedTask(b) ? 0 : 1;
      if (aU !== bU) return aU - bU;
      return scoreItem(b) - scoreItem(a);
    });

    // Slot list: taskOrder positions first, then new tasks not yet in taskOrder
    const inRows = new Set(rows.map(it => it.id));
    const slotIds = [
      ...taskOrder.filter(id => inRows.has(id)),
      ...rows.filter(it => !taskOrder.includes(it.id)).map(it => it.id),
    ];

    let autoPtr = 0;
    rows = [];
    for (const id of slotIds) {
      if (manualIds.has(id)) {
        rows.push(itemMap.get(id)!);
      } else if (autoPtr < autoSorted.length) {
        rows.push(autoSorted[autoPtr++]);
      }
    }
  }

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Inline edit helpers
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
    else if (colKey === 'estimate') updateItem(rowId, { estimate: value });
    else if (colKey.startsWith('cf_')) updateItemCustomValue(rowId, colKey.slice(3), value);
    setEditCell(null);
  }

  function commitEdit() { if (editCell) saveEdit(editValue, editCell.colKey, editCell.rowId); }

  function openTask(id: string) {
    // Reminders get the simple ReminderModal (plain state, no URL) — the
    // task modal doesn't know how to render them.
    const item = items.find(it => it.id === id);
    if (item?.kind === 'reminder') { setReminderModalId(id); return; }
    // Push URL so browser back closes the modal
    window.location.hash = `table/task/${id}`;
  }
  function closeTaskModal() {
    // Go back to just #table via history.back so the browser-back-friendly URL
    // history is preserved (open + close = round trip that pops out cleanly)
    const currentHash = window.location.hash.slice(1);
    if (currentHash.startsWith('table/task/')) history.back();
    else window.location.hash = 'table';
  }
  function navigateModal(nextId: string) {
    // Replace URL (no new history entry per arrow-key press) so the browser
    // history stays clean: just "opened modal" → "closed modal", not one
    // history entry per task navigated to.
    history.replaceState(null, '', `#table/task/${nextId}`);
    setModalTaskId(nextId);
  }

  // Sync modalTaskId from URL: #table/task/{id}
  useEffect(() => {
    function syncFromHash() {
      const parts = window.location.hash.slice(1).split('/');
      if (parts[0] !== 'table') return;
      if (parts[1] === 'task' && parts[2]) setModalTaskId(parts[2]);
      else setModalTaskId(null);
    }
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = rows.map(r => r.id);
    const newIds = [...ids];
    const from = newIds.indexOf(dragId);
    const to = newIds.indexOf(targetId);
    newIds.splice(from, 1);
    // When dragging down, removal shifts every index below `from` up by 1,
    // so adjust `to` to land the item before the drop target (not after).
    newIds.splice(to > from ? to - 1 : to, 0, dragId);
    const notVisible = taskOrder.filter(id => !ids.includes(id));
    setTaskOrder([...newIds, ...notVisible]);
    updateItem(dragId, { manuallyMoved: true });
    setSort(null);
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
    <>
    <div style={{ flex: 1, padding: '8px 36px 36px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', overflowX: 'hidden' }}>
      {/* Filters + column picker */}
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={ghostSelect(!!typeFilter)}>
          <option value="">All types</option>
          <option value="task">Task</option>
          <option value="reminder">Reminder</option>
        </select>
        <select value={reqFilter} onChange={e => setReqFilter(e.target.value)} style={ghostSelect(!!reqFilter)}>
          <option value="">All requesters</option>
          {requesters.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={projFilter} onChange={e => setProjFilter(e.target.value)} style={ghostSelect(!!projFilter)}>
          <option value="">All projects</option>
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={ghostSelect(!!statusFilter)}>
          <option value="">All statuses</option>
          <option value="in_progress">In progress</option>
          <option value="backlog">Backlog</option>
          <option value="waiting">Waiting</option>
          <option value="done">Done</option>
        </select>
        <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} style={ghostSelect(!!tagFilter)}>
          <option value="">All tags</option>
          <option value="urgent">Urgent</option>
          <option value="important">Important</option>
          <option value="quick">Quick</option>
          <option value="noTag">None of these</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: minScore ? 'var(--t-acc-dk)' : 'var(--t-muted)', whiteSpace: 'nowrap', padding: '4px 8px', borderRadius: 6, background: minScore ? 'var(--t-acc-bg)' : 'transparent' }}>
          Score ≥
          <input type="number" min="0" value={minScore} onChange={e => setMinScore(e.target.value)} placeholder="—"
            style={{ width: 36, fontSize: 12, padding: '2px 4px', borderRadius: 4, border: 'none', background: 'transparent', color: 'inherit', outline: 'none', textAlign: 'center' }} />
        </div>

        {/* Quick filter chips */}
        {([
          { key: 'createdToday', label: 'Created today' },
          { key: 'updatedToday', label: 'Updated today' },
          { key: 'forToday', label: 'Marked today' },
          { key: 'untagged', label: 'Untagged' },
          { key: 'mail', label: '✉ Mail' },
        ] as const).map(({ key, label }) => {
          const active = quickFilters.has(key);
          return (
            <button key={key}
              onClick={() => setQuickFilters(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
              style={{ fontSize: 12.5, padding: '5px 10px', borderRadius: 6, border: 'none', background: active ? 'var(--t-acc-bg)' : 'transparent', color: active ? 'var(--t-acc-dk)' : 'var(--t-muted)', cursor: 'pointer', fontWeight: active ? 500 : 400, whiteSpace: 'nowrap' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--t-surf2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
              {label}
            </button>
          );
        })}

        {(typeFilter || reqFilter || projFilter || statusFilter || tagFilter || minScore || quickFilters.size > 0) && (
          <button onClick={() => { setTypeFilter(''); setReqFilter(''); setProjFilter(''); setStatusFilter(''); setTagFilter(''); setMinScore(''); setQuickFilters(new Set()); }}
            style={{ ...ghostBtn, fontSize: 12 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-surf2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            title="Clear all filters">Clear filters</button>
        )}

        {items.some(it => it.kind === 'task' && (it as Task).manuallyMoved) && (
          <button onClick={resetManualOrder}
            style={{ ...ghostBtn, fontSize: 12 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-surf2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            ↺ Reset all to auto
          </button>
        )}

        {selCount > 0 && (
          <>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t-muted)', marginLeft: 10, paddingLeft: 10, borderLeft: '1px solid var(--t-brd)' }}>{selCount} selected</span>
            <button onClick={() => setSelected(new Set())}
              style={ghostBtn}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-surf2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              Clear
            </button>
            <button onClick={bulkArchive}
              style={{ ...ghostBtn, color: 'var(--t-acc)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-acc-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              ⊙ Archive
            </button>
            <button onClick={bulkDelete}
              style={{ ...ghostBtn, color: 'var(--t-urgent)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-urgent-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              ✕ Delete
            </button>
            {selCount === 1 && (() => {
              const selItem = rows.find(r => selected.has(r.id));
              if (!selItem || selItem.kind !== 'task') return null;
              return (
                <button onClick={() => setAiTaskId(selItem.id)}
                  title="Send this task to the configured AI model — the reply goes to the log"
                  style={{ ...ghostBtn, color: 'var(--t-acc)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-acc-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  ✦ Assign to AI
                </button>
              );
            })()}
          </>
        )}

        <button onClick={() => setDailyOpen(true)}
          title="Open the Daily play — pick which subtasks you're doing today"
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'oklch(0.6 0.14 150)',
            color: 'white',
            fontSize: 13, fontWeight: 700,
            padding: '7px 14px', borderRadius: 999,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <span style={{ fontSize: 11 }}>▶</span>
          Daily
        </button>

        <div style={{ position: 'relative' }} ref={colPickerRef}>
          <button onClick={() => setColPickerOpen(o => !o)}
            style={ghostBtn}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-surf2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
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
      <table style={{ width: 'auto', minWidth: '100%', borderCollapse: 'collapse', fontSize: 13.5, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 10, overflow: 'hidden', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ background: 'var(--t-surf2)', borderBottom: '1px solid var(--t-brd)' }}>
            <th style={{ ...th, width: 34, cursor: 'default' }}></th>
            <th style={{ ...th, width: 40, cursor: 'default' }} onClick={e => e.stopPropagation()}>
              <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleSelectAll} style={{ cursor: 'pointer', width: 15, height: 15 }} />
            </th>
            <th style={{ ...th, width: 36, cursor: 'default', textAlign: 'right' }}>#</th>
            <th style={{ ...th, width: 60, cursor: 'default', textAlign: 'center' }}>Today</th>
            {cols.map(col => {
              const colW = colWidths[col.key] ?? DEFAULT_COL_WIDTHS[col.key] ?? 130;
              return (
                // No padding on th itself — inner flex div handles it, so no absolute positioning needed
                <th key={col.key} data-colkey={col.key} style={{ ...th, padding: 0, width: colW, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'stretch' }}>
                    {/* Sort label */}
                    <div onClick={() => handleSortClick(col.key)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '11px 6px 11px 14px', cursor: 'pointer', overflow: 'hidden', textAlign: col.align ?? 'left', justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                      {col.label}{sortIcon(col.key)}
                    </div>
                    {/* Resize handle — flex child, no absolute positioning, constrained to header height */}
                    <div
                      onMouseDown={e => startColResize(e, col.key)}
                      onDoubleClick={e => { e.stopPropagation(); resetColWidth(col.key); }}
                      onMouseEnter={() => setHoveredResize(col.key)}
                      onMouseLeave={() => setHoveredResize(null)}
                      title="Drag to resize · Double-click to reset"
                      style={{ width: 8, flexShrink: 0, cursor: 'col-resize', borderRight: `2px solid ${hoveredResize === col.key ? 'var(--t-acc)' : 'var(--t-brd2)'}`, transition: 'border-color 0.12s' }} />
                  </div>
                </th>
              );
            })}
            <th style={{ ...th, width: 40, cursor: 'default' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it, rowIdx) => {
            const isSelected = selected.has(it.id);
            const isToday = it.kind === 'task' && (it as Task).forToday;
            const isDragging = dragId === it.id;
            const isDragOver = dragOverId === it.id;
            const isFocused = focusedRowIdx === rowIdx;
            const rowBg = isSelected ? 'var(--t-acc-bg)' : isToday ? 'var(--t-amber-bg)' : isFocused ? 'var(--t-surf2)' : 'var(--t-surf)';
            const rowStyle: CSSProperties = {
              background: rowBg,
              opacity: isDragging ? 0.4 : 1,
              borderTop: isDragOver ? '2px solid var(--t-acc)' : undefined,
              outline: isFocused ? '2px solid var(--t-acc)' : undefined,
              outlineOffset: '-2px',
            };
            const inpSt: CSSProperties = { width: '100%', fontSize: 13.5, padding: '5px 7px', border: '1px solid var(--t-acc)', borderRadius: 5, background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none', boxSizing: 'border-box' };
            return (
              <tr key={it.id}
                draggable
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(it.id); }}
                onDragOver={e => { e.preventDefault(); if (it.id !== dragId) setDragOverId(it.id); }}
                onDrop={e => { e.preventDefault(); handleDrop(it.id); }}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                onClick={() => setFocusedRowIdx(rowIdx)}
                style={{ ...rowStyle, cursor: 'default' }}
                onMouseEnter={e => { if (!isSelected && !isDragging) e.currentTarget.style.background = isToday ? 'var(--t-amber-bg)' : 'var(--t-surf2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>
                <td onClick={e => e.stopPropagation()} style={{ ...td, width: 34, textAlign: 'center' }}>
                  <span onClick={() => { openTask(it.id); }}
                    style={{ fontSize: 15, color: 'var(--t-acc)', cursor: 'pointer', fontWeight: 600 }}
                    title="Open task">→</span>
                </td>
                <td style={{ ...td, width: 40 }} onClick={e => { e.stopPropagation(); toggleRow(it.id); }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleRow(it.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                </td>
                <td style={{ ...td, width: 36, textAlign: 'right', fontSize: 12, color: 'var(--t-muted)', fontWeight: 600, paddingRight: 10 }}>
                  {rowIdx + 1}
                </td>
                <td onClick={e => e.stopPropagation()} style={{ ...td, width: 60, textAlign: 'center' }}>
                  {it.kind === 'task' && (
                    <input
                      type="checkbox"
                      checked={(it as Task).forToday ?? false}
                      onChange={() => setForToday(it.id, !(it as Task).forToday)}
                      style={{ cursor: 'pointer', width: 15, height: 15, accentColor: 'var(--t-amber)' }}
                      title="Mark for today"
                    />
                  )}
                </td>
                {cols.map(col => {
                  const isEditable = it.kind === 'task' && (EDITABLE_COLS.has(col.key) || col.key.startsWith('cf_'));
                  const isEditing = editCell?.rowId === it.id && editCell?.colKey === col.key;
                  // Tags column: pencil to edit, chips appear only in edit mode
                  if (col.key === 'tags') {
                    const tagKey = `${it.id}:tags`;
                    const isEditingTags = editCell?.rowId === it.id && editCell?.colKey === 'tags';
                    const tagChips = [
                      { key: 'urgent' as const, label: 'Urgent', color: 'var(--t-urgent)', bg: 'var(--t-urgent-bg)' },
                      { key: 'important' as const, label: 'Important', color: 'var(--t-important)', bg: 'var(--t-important-bg)' },
                      { key: 'quick' as const, label: 'Quick', color: 'var(--t-quick)', bg: 'var(--t-quick-bg)' },
                      { key: 'noTag' as const, label: 'None', color: 'var(--t-muted)', bg: 'var(--t-surf2)' },
                    ];
                    const t = it.kind === 'task' ? it as Task : null;
                    return (
                      <td key={col.key}
                        onMouseEnter={() => setHoveredCell(tagKey)}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={e => e.stopPropagation()}
                        style={{ ...td }}>
                        {isEditingTags && t ? (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                            {tagChips.map(({ key, label, color, bg }) => {
                              const active = key === 'noTag' ? t.noTag : t[key];
                              return (
                                <button key={key} onClick={() => toggleTag(it.id, key)}
                                  style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, border: `1px solid ${active ? color : 'var(--t-brd)'}`, background: active ? bg : 'transparent', color: active ? color : 'var(--t-muted)', cursor: 'pointer', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap' }}>
                                  {label}
                                </button>
                              );
                            })}
                            <button onClick={() => { setFrozenRowIds(null); setEditCell(null); }}
                              style={{ fontSize: 11, padding: '2px 9px', borderRadius: 10, border: 'none', background: 'var(--t-acc)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                              Done
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ color: 'var(--t-txt2)', fontSize: 13.5 }}>{String(col.getValue(it) || '—')}</span>
                            {t && (
                              <span onClick={() => {
                                setFrozenRowIds(rows.map(r => r.id)); // freeze order during tag edit
                                setEditCell({ rowId: it.id, colKey: 'tags' });
                              }}
                                style={{ fontSize: 12, color: 'var(--t-muted)', cursor: 'pointer', opacity: hoveredCell === tagKey ? 1 : 0, transition: 'opacity 0.1s' }}
                                title="Edit tags">✎</span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  }

                  if (isEditing) {
                    return (
                      <td key={col.key} onClick={e => e.stopPropagation()} style={{ ...td, padding: '4px 8px' }}>
                        {col.key === 'requester' ? (
                          <select autoFocus value={editValue} style={inpSt}
                            onChange={e => saveEdit(e.target.value, col.key, it.id)}
                            onBlur={() => setEditCell(null)}>
                            <option value="">—</option>
                            {requesters.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : col.key === 'project' ? (
                          <select autoFocus value={editValue} style={inpSt}
                            onChange={e => saveEdit(e.target.value, col.key, it.id)}
                            onBlur={() => setEditCell(null)}>
                            <option value="">—</option>
                            {projects.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        ) : col.key === 'status' ? (
                          <select autoFocus value={editValue} style={inpSt}
                            onChange={e => saveEdit(e.target.value, col.key, it.id)}
                            onBlur={() => setEditCell(null)}>
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
                  // Title cell: the text keeps to ~70% so there's always an
                  // empty strip at the end of the cell — clicking it opens the
                  // task (clicking the text still edits it inline).
                  if (col.key === 'title') {
                    return (
                      <td key={col.key}
                        onMouseEnter={() => { if (isEditable) setHoveredCell(cellKey); }}
                        onMouseLeave={() => setHoveredCell(null)}
                        style={{ ...td, padding: 0, fontWeight: 500, color: 'var(--t-txt)', background: hoveredCell === cellKey ? 'var(--t-acc-bg)' : undefined }}>
                        <div style={{ display: 'flex', alignItems: 'stretch', width: '100%' }}>
                          <span
                            onClick={isEditable ? e => startEdit(e, it.id, col.key) : undefined}
                            title={String(col.getValue(it) || '')}
                            style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: isEditable ? 'text' : 'default', padding: '10px 0 10px 14px' }}>
                            {String(col.getValue(it) || '—')}
                          </span>
                          <span
                            onClick={e => { e.stopPropagation(); openTask(it.id); }}
                            title="Open task"
                            style={{ flex: 1, minWidth: 34, cursor: 'pointer' }} />
                        </div>
                      </td>
                    );
                  }
                  const jiraKey = col.key === 'jira' && it.kind === 'task' ? ((it as Task).jiraLink ?? '').trim() : '';
                  const jiraCellUrl = jiraKey ? jiraTicketUrl(jiraConfigs, jiraKey) : null;
                  return (
                    <td key={col.key}
                      onClick={isEditable ? e => startEdit(e, it.id, col.key) : undefined}
                      onMouseEnter={() => { if (isEditable) setHoveredCell(cellKey); }}
                      onMouseLeave={() => setHoveredCell(null)}
                      style={{ ...td, textAlign: col.align ?? 'left', fontWeight: col.key === 'title' ? 500 : 400, color: col.key === 'title' ? 'var(--t-txt)' : 'var(--t-txt2)', cursor: isEditable ? 'text' : 'default', background: hoveredCell === cellKey ? 'var(--t-acc-bg)' : undefined }}>
                      {String(col.getValue(it) || '—')}
                      {jiraCellUrl && (
                        <span
                          onClick={e => { e.stopPropagation(); openJira(jiraCellUrl, jiraKey); }}
                          title={`Open ${jiraKey}`}
                          style={{ marginLeft: 6, fontSize: 14, color: 'var(--t-acc)', cursor: 'pointer', userSelect: 'none' }}>
                          ↗
                        </span>
                      )}
                    </td>
                  );
                })}
                <td onClick={e => e.stopPropagation()} style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', width: 70 }}>
                  {it.kind === 'task' && (it as Task).manuallyMoved && (
                    <span onClick={() => { updateItem(it.id, { manuallyMoved: false }); setTaskOrder(taskOrder.filter(id => id !== it.id)); }}
                      style={{ fontSize: 12, color: 'var(--t-acc)', cursor: 'pointer', marginRight: 6, fontWeight: 500 }}
                      title="Reset to auto-sort">↺</span>
                  )}
                  {it.kind === 'task' && (
                    <span onClick={() => { createItem(duplicateTask(it as Task)); }}
                      style={{ fontSize: 14, color: 'var(--t-acc)', cursor: 'pointer', marginRight: 8, fontWeight: 500 }}
                      title="Duplicate task">⧉</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length + 5} style={{ ...td, textAlign: 'center', color: 'var(--t-muted)', padding: '32px 14px' }}>No items match the filters</td>
            </tr>
          )}
          {/* Drop zone below last row — lets user drag to the very end */}
          {dragId && (
            <tr onDragOver={e => { e.preventDefault(); setDragOverId('__bottom__'); }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={e => {
                e.preventDefault();
                if (!dragId) return;
                const ids = rows.map(r => r.id).filter(id => id !== dragId);
                ids.push(dragId);
                const notVisible = taskOrder.filter(id => !rows.some(r => r.id === id));
                setTaskOrder([...ids, ...notVisible]);
                updateItem(dragId, { manuallyMoved: true });
                setSort(null); setDragId(null); setDragOverId(null);
              }}
              style={{ borderTop: dragOverId === '__bottom__' ? '2px solid var(--t-acc)' : undefined }}>
              <td colSpan={cols.length + 5} style={{ height: 28 }} />
            </tr>
          )}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>{rows.length} item{rows.length !== 1 ? 's' : ''}</div>
    </div>
    {modalTaskId && <TaskModal taskId={modalTaskId} allIds={rows.map(r => r.id)} onNavigate={navigateModal} onClose={closeTaskModal} />}
    {dailyOpen && <DailyPlay onClose={() => setDailyOpen(false)} />}
    {reminderModalId && <ReminderModal reminderId={reminderModalId} onClose={() => setReminderModalId(null)} />}
    {aiTaskId && (() => {
      const t = rows.find(r => r.id === aiTaskId);
      return t && t.kind === 'task' ? <AiAssignModal task={t as Task} onClose={() => setAiTaskId(null)} /> : null;
    })()}
    </>
  );
}
