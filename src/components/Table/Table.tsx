import { Fragment, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { parseQuery, setField, setIs } from '../../tableQuery';
import { useStore } from '../../store';
import { useLogMount } from '../../useLogMount';
import { TaskModal } from '../TaskModal/TaskModal';
import { MailEntryPopup } from '../Mail/MailEntryPopup';
import { TypePicker } from '../Common/TypePicker';
import { parseEstimate, formatMinutes } from '../../estimateParser';
import { DailyPlay } from '../DailyPlay/DailyPlay';
import { ReminderModal } from '../ReminderPopup/ReminderModal';
import { AiAssignModal } from './AiAssignModal';
import { jiraTicketUrl } from '../../jiraHosts';
import { openTicketWindow } from '../../ticketWindow';
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
  { key: 'type', label: 'Item', defaultOn: false, getValue: it => it.kind !== 'task' ? 'Reminder' : (it as Task).type === 'mail' ? '✉ Mail' : 'Task' },
  { key: 'kind', label: 'Kind', defaultOn: true, getValue: it => {
    if (it.kind !== 'task') return '';
    const wt = (it as Task).type;
    return wt === 'mail' ? '✉ mail' : wt === 'quick' ? 'Quick help' : wt === 'urgent' ? 'Urgent' : wt === 'planned' ? 'Planned' : 'untyped';
  }},
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

// Chain-in-circle "link" glyph (the flaticon 10016986 shape, redrawn inline so
// it needs no network and follows the button's text colour).
const LinkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10.5" />
    <path d="M10.4 13.6a2.6 2.6 0 0 1 0-3.7l2.4-2.4a2.6 2.6 0 0 1 3.7 3.7l-1.3 1.3" />
    <path d="M13.6 10.4a2.6 2.6 0 0 1 0 3.7l-2.4 2.4a2.6 2.6 0 0 1-3.7-3.7l1.3-1.3" />
  </svg>
);

const ghostBtn: React.CSSProperties = {
  fontSize: 13, padding: '5px 10px', borderRadius: 6, border: 'none',
  background: 'transparent', color: 'var(--t-muted)', cursor: 'pointer', fontWeight: 500,
};
const EDITABLE_COLS = new Set(['title', 'requester', 'project', 'status', 'jira', 'estimate']);
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  title: 200, type: 110, kind: 200, requester: 120, project: 120,
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

  // ── Filters ARE the search string (Kibana-style query). Every "filter"
  // below is derived from it, and every setter rewrites it — so pills, the
  // search box and the URL (#table?q=…) can never disagree. ──
  const [search, setSearch] = useState(() => {
    const m = /^#table\?(.*)$/.exec(window.location.hash);
    return m ? (new URLSearchParams(m[1]).get('q') ?? '') : '';
  });
  const parsed = parseQuery(search, { requesters, projects });
  const reqFilter = parsed.requester, projFilter = parsed.project, typeFilter = parsed.item, workTypeFilter = parsed.kind;
  const tagFilter = parsed.tag, minScore = parsed.score, quickFilters = parsed.is, statusFilter = parsed.status;
  const setQualifier = (field: string, v: string | null) => setSearch(prev => setField(prev, field, v));
  const setReqFilter = (v: string) => setQualifier('requester', v || null);
  const setProjFilter = (v: string) => setQualifier('project', v || null);
  const setTypeFilter = (v: string) => setQualifier('item', v || null);
  const setWorkTypeFilter = (v: string) => setQualifier('kind', v || null);
  const setTagFilter = (v: string) => setQualifier('tag', v || null);
  const setStatusFilter = (v: string) => setQualifier('status', v || null);
  const setMinScore = (v: string) => setQualifier('score', v.trim() || null);
  const setQuickFilters = (upd: Set<string> | ((prev: Set<string>) => Set<string>)) =>
    setSearch(prev => setIs(prev, typeof upd === 'function' ? upd(new Set(parseQuery(prev, { requesters, projects }).is)) : upd));
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
  const [mailPopupId, setMailPopupId] = useState<string | null>(null);
  const [aiTaskId, setAiTaskId] = useState<string | null>(null);
  const [dailyOpen, setDailyOpen] = useState(false);
  // The search box doubles as the filter picker: focused + empty shows EVERY
  // filter option; typing narrows both the rows (free text) and the options
  // (e.g. "wait" → Status: Waiting). Enter on a highlighted option applies it
  // as a pill and clears the text.
  const [groupBy, setGroupBy] = useState<'' | 'requester' | 'project'>(() => {
    const m = /^#table\?(.*)$/.exec(window.location.hash);
    return ((m && new URLSearchParams(m[1]).get('group')) ?? '') as '' | 'requester' | 'project';
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Gantt: live bar resize (duration) — {id, mins} while the handle is held.
  const [ganttResize, setGanttResize] = useState<{ id: string; mins: number } | null>(null);
  const ganttDrag = useRef<{ id: string; startX: number; startMins: number; pxPerMin: number } | null>(null);
  const ganttJustResized = useRef(false); // swallow the click that follows a resize
  const updateSubtask = useStore(s => s.updateSubtask);
  // Mirror the query into the URL (replaceState — not a history entry per
  // keystroke) and read it back when the hash changes underneath us.
  useEffect(() => {
    if (!window.location.hash.startsWith('#table')) return;
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (groupBy) params.set('group', groupBy);
    const qs = params.toString();
    const next = qs ? `#table?${qs}` : '#table';
    if (window.location.hash !== next && /^#table(\?|$)/.test(window.location.hash)) history.replaceState(null, '', next);
  }, [search, groupBy]);
  useEffect(() => {
    const onHash = () => {
      const m = /^#table\?(.*)$/.exec(window.location.hash);
      if (!m) return;
      const p = new URLSearchParams(m[1]);
      const q = p.get('q') ?? '';
      const g = (p.get('group') ?? '') as '' | 'requester' | 'project';
      setSearch(cur => (cur.trim() === q.trim() ? cur : q));
      setGroupBy(cur => (cur === g ? cur : g));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [searchHi, setSearchHi] = useState(-1);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (e: MouseEvent) => { if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setSearchOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [searchOpen]);
  // The search box lives in the page header (right of the title) via a portal.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setHeaderSlot(document.getElementById('view-header-slot')); }, []);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // Second click on the active grouping button opens a picker of the
  // existing requesters / projects (with counts); picking one filters on it.
  const [groupMenu, setGroupMenu] = useState(false);
  const [groupMenuHi, setGroupMenuHi] = useState(0);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!groupMenu) return;
    const onDown = (e: MouseEvent) => { if (groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node)) setGroupMenu(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [groupMenu]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'pipeline' | 'gantt'>('table');
  // A dashboard tile can hand over a filter (e.g. "No Jira yet") — apply it
  // as a normal on-screen pill so it's visible and removable.
  const tableFilterPreset = useStore(s => s.tableFilterPreset);
  const setTableFilterPreset = useStore(s => s.setTableFilterPreset);
  useEffect(() => {
    if (!tableFilterPreset) return;
    if (tableFilterPreset === 'nojira') setQuickFilters(prev => new Set(prev).add('nojira'));
    setTableFilterPreset(null);
  }, [tableFilterPreset, setTableFilterPreset]);

  useEffect(() => { setPage(0); }, [workTypeFilter, typeFilter, reqFilter, projFilter, statusFilter, tagFilter, minScore, quickFilters, viewMode, search]);

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
    // "Get back to" notes live only in the ▣ Hub and search — never the table.
    if (it.kind === 'getback') return false;
    if (parsed.text) {
      const q = parsed.text.toLowerCase();
      const t = it as Task;
      const hay = [it.title, t.requester, t.project, t.jiraLink, t.itsmTicket, t.notes, t.description]
        .filter((v): v is string => typeof v === 'string');
      if (!hay.some(v => v.toLowerCase().includes(q))) return false;
    }
    if (reqFilter && (it as Task).requester !== reqFilter) return false;
    if (projFilter && (it as Task).project !== projFilter) return false;
    if (typeFilter && it.kind !== typeFilter) return false;
    // Work-type label filter (planned / urgent / quick help / untyped)
    if (workTypeFilter && it.kind === 'task') {
      const wt = (it as Task).type;
      if (workTypeFilter === 'untyped' ? (wt !== undefined) : wt !== workTypeFilter) return false;
    }
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
    // Mail entries are hidden by DEFAULT — the ✉ Mail filter flips the view
    // to only them.
    {
      const isMailRow = it.kind === 'task' && (it as Task).type === 'mail';
      if (quickFilters.has('mail') ? !isMailRow : isMailRow) return false;
    }
    if (quickFilters.has('nojira') && !(it.kind === 'task' && ((it as Task).type === 'planned' || (it as Task).type === 'urgent') && !((it as Task).jiraLink ?? '').trim())) return false;
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

  // Pagination — keeps the table scannable; bulk actions and select-all
  // still operate on the FULL filtered set.
  // Group by requester / project: rows sorted by group (stable, so the
  // in-group order is untouched), no pagination while grouped.
  const groupKeyOf = (it: Item) => (it.kind === 'task' && groupBy ? ((it as Task)[groupBy] || '').trim() : '') || '—';
  const groupCounts = new Map<string, number>();
  if (groupBy) for (const it of rows) groupCounts.set(groupKeyOf(it), (groupCounts.get(groupKeyOf(it)) ?? 0) + 1);
  const groupedRows = groupBy ? [...rows].sort((a, b) => {
    const ka = groupKeyOf(a), kb = groupKeyOf(b);
    return (ka === '—' ? '\uffff' : ka).localeCompare(kb === '—' ? '\uffff' : kb);
  }) : rows;
  const pageCount = groupBy ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = groupBy ? groupedRows : rows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // Keep refs current for keydown handler (keyboard walks the visible page)
  rowsRef.current = pagedRows;
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
      } else if (e.key === '/' || e.code === 'Slash') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'd' || e.code === 'KeyD') {
        setDailyOpen(true);
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
    // A mail row IS a mail entry — show the mail form, not a task card.
    if (item?.kind === 'task' && (item as Task).type === 'mail') { setMailPopupId(id); return; }
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


  // Every filter as a pickable option (the old "+ Filter" menu, flattened).
  const FILTER_OPTIONS: { group: string; label: string; apply: () => void }[] = [
    { group: 'Kind', label: 'Planned', apply: () => setWorkTypeFilter('planned') },
    { group: 'Kind', label: 'Urgent / same-day', apply: () => setWorkTypeFilter('urgent') },
    { group: 'Kind', label: 'Quick help', apply: () => setWorkTypeFilter('quick') },
    { group: 'Kind', label: 'Untyped', apply: () => setWorkTypeFilter('untyped') },
    ...(['backlog', 'todo', 'in_progress', 'waiting', 'done'] as const).map(st => ({ group: 'Status', label: st === 'todo' ? 'To do' : st.replace('_', ' ').replace(/^./, c => c.toUpperCase()), apply: () => setStatusFilter(st) })),
    { group: 'Quick', label: 'No Jira yet', apply: () => setQuickFilters(prev => new Set(prev).add('nojira')) },
    { group: 'Quick', label: '✉ Mail entries', apply: () => setQuickFilters(prev => new Set(prev).add('mail')) },
    { group: 'Quick', label: 'Created today', apply: () => setQuickFilters(prev => new Set(prev).add('createdToday')) },
    { group: 'Quick', label: 'Updated today', apply: () => setQuickFilters(prev => new Set(prev).add('updatedToday')) },
    { group: 'Quick', label: 'Untagged', apply: () => setQuickFilters(prev => new Set(prev).add('untagged')) },
    { group: 'Quick', label: 'Marked today', apply: () => setQuickFilters(prev => new Set(prev).add('forToday')) },
    { group: 'Tag', label: 'Urgent', apply: () => setTagFilter('urgent') },
    { group: 'Tag', label: 'Important', apply: () => setTagFilter('important') },
    { group: 'Tag', label: 'Quick', apply: () => setTagFilter('quick') },
    { group: 'Tag', label: 'None of these', apply: () => setTagFilter('noTag') },
    ...requesters.map(r => ({ group: 'Requester', label: r, apply: () => setReqFilter(r) })),
    ...projects.map(p => ({ group: 'Project', label: p, apply: () => setProjFilter(p) })),
    { group: 'Item', label: 'Tasks only', apply: () => setTypeFilter('task') },
    { group: 'Item', label: 'Reminders only', apply: () => setTypeFilter('reminder') },
    ...[3, 5, 7, 10].map(n => ({ group: 'Score', label: `Score ≥ ${n}`, apply: () => setMinScore(String(n)) })),
  ];
  // Two levels, Kibana-style: with nothing typed the list is one row per
  // FIELD ("status:" …); picking one (or typing "status:") shows its values.
  // Free text without a field searches across all values ("wait" → Status:
  // Waiting) as well as filtering the rows live.
  const FIELDS = Array.from(new Set(FILTER_OPTIONS.map(o => o.group)));
  // Suggest for the token being typed (after the last space); earlier
  // tokens stay untouched.
  const lastSpace = search.lastIndexOf(' ');
  const head = lastSpace >= 0 ? search.slice(0, lastSpace + 1) : '';
  const tok = search.slice(lastSpace + 1);
  const rawQ = tok.toLowerCase();
  const colon = rawQ.indexOf(':');
  const fieldTyped = colon >= 0 ? FIELDS.find(f => f.toLowerCase() === rawQ.slice(0, colon).trim()) : undefined;
  const valueQ = colon >= 0 ? rawQ.slice(colon + 1).trim().replace(/^"|"$/g, '') : rawQ;
  type Opt = { group: string; label: string; apply: () => void; isField?: boolean };
  const visibleOptions: Opt[] = !rawQ
    ? FIELDS.map(f => ({ group: f, label: `${f.toLowerCase()}:`, isField: true, apply: () => { setSearch(`${head}${f.toLowerCase()}:`); setSearchHi(-1); setSearchOpen(true); searchRef.current?.focus(); } }))
    : fieldTyped
      ? FILTER_OPTIONS.filter(o => o.group === fieldTyped && (!valueQ || o.label.toLowerCase().includes(valueQ)))
      : FILTER_OPTIONS.filter(o => `${o.group} ${o.label}`.toLowerCase().includes(rawQ.replace(/:/g, ' ')));
  function applyOption(o: Opt) {
    if (o.isField) { o.apply(); return; }
    // Drop the half-typed token, then let the option's setter write the
    // canonical `field:value` — the string stays in the box.
    setSearch(head.trim());
    o.apply();
    setSearchHi(-1); setSearchOpen(false);
    searchRef.current?.focus();
  }

  return (
    <>
    <div style={{ flex: 1, padding: '8px 36px 36px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', overflowX: 'hidden' }}>
      {headerSlot && createPortal(
        <>
        {/* Search + filter picker — title/requester/project/Jira/ITSM/notes text
            search; focused & empty = every filter option; typing narrows both */}
        <div ref={searchWrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '0 1 300px', minWidth: 160 }}>
          <span style={{ position: 'absolute', left: 9, fontSize: 13, color: 'var(--t-muted)', pointerEvents: 'none' }}>⌕</span>
          <input ref={searchRef} value={search}
            onChange={e => { setSearch(e.target.value); setSearchHi(-1); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Escape') { if (search) setSearch(''); else { setSearchOpen(false); (e.target as HTMLInputElement).blur(); } return; }
              if (!searchOpen) { if (e.key === 'ArrowDown') setSearchOpen(true); return; }
              if (e.key === 'ArrowDown') { e.preventDefault(); setSearchHi(h => Math.min(h + 1, visibleOptions.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchHi(h => Math.max(h - 1, -1)); }
              else if (e.key === 'Enter') {
                if (searchHi >= 0 && visibleOptions[searchHi]) { e.preventDefault(); applyOption(visibleOptions[searchHi]); }
                else if (search.trim() && visibleOptions.length === 1) { e.preventDefault(); applyOption(visibleOptions[0]); }
                else setSearchOpen(false); // plain text search — rows already filter live
              }
            }}
            placeholder="Search or filter…"
            style={{ width: '100%', height: 32, fontSize: 13, padding: '0 26px', borderRadius: 8, border: '1px solid ' + (search || searchOpen ? 'var(--t-acc)' : 'var(--t-brd)'), background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none', boxSizing: 'border-box' }} />
          {search ? (
            <span onClick={() => { setSearch(''); searchRef.current?.focus(); }} title="Clear"
              style={{ position: 'absolute', right: 8, fontSize: 13, color: 'var(--t-muted)', cursor: 'pointer', lineHeight: 1 }}>×</span>
          ) : !searchOpen && (
            <kbd title="Press / to jump here"
              style={{ position: 'absolute', right: 7, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1, padding: '3px 7px', borderRadius: 5, border: '1px solid var(--t-brd)', borderBottomWidth: 2, background: 'var(--t-surf2)', color: 'var(--t-muted)', pointerEvents: 'none' }}>/</kbd>
          )}
          {searchOpen && (visibleOptions.length > 0 || !rawQ) && (() => {
            // Kibana-style suggestions: type badge · `field: value` · description
            const BADGE: Record<string, { code: string; color: string; desc: string }> = {
              Kind:      { code: 'K',  color: 'oklch(0.55 0.15 264)', desc: 'kind of work' },
              Status:    { code: 'S',  color: 'oklch(0.55 0.14 150)', desc: 'workflow status' },
              Quick:     { code: '⚡', color: 'oklch(0.6 0.15 60)',   desc: 'quick filter' },
              Tag:       { code: 'T',  color: 'oklch(0.55 0.16 25)',  desc: 'priority tag' },
              Requester: { code: 'R',  color: 'oklch(0.55 0.13 200)', desc: 'requested by' },
              Project:   { code: 'P',  color: 'oklch(0.55 0.14 300)', desc: 'project' },
              Item:      { code: 'I',  color: 'oklch(0.5 0.05 264)',  desc: 'item type' },
              Score:     { code: '≥',  color: 'oklch(0.55 0.12 85)',  desc: 'minimum score' },
            };
            return (
              <div style={{ position: 'absolute', left: 0, width: '200%', top: 'calc(100% + 6px)', zIndex: 60, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 8, boxShadow: '0 12px 36px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 11, color: 'var(--t-muted)', background: 'var(--t-surf2)', borderBottom: '1px solid var(--t-brd2)' }}>
                  <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Suggestions</span>
                  <span>{visibleOptions.length}</span>
                  <span style={{ marginLeft: 'auto' }}>{!rawQ ? 'pick a field, or just type' : fieldTyped ? `values for ${fieldTyped.toLowerCase()}` : 'text also filters the rows'}</span>
                </div>
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {visibleOptions.map((o, i) => {
                    const b = BADGE[o.group] ?? { code: '•', color: 'var(--t-muted)', desc: o.group };
                    const on = searchHi === i;
                    const count = o.isField ? FILTER_OPTIONS.filter(x => x.group === o.group).length : 0;
                    return (
                      <div key={`${o.group}:${o.label}`}
                        onMouseDown={e => e.preventDefault()} onClick={() => applyOption(o)} onMouseEnter={() => setSearchHi(i)}
                        style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', alignItems: 'center', gap: 10, padding: '4px 12px 4px 9px', cursor: 'pointer',
                          background: on ? `color-mix(in oklab, ${b.color} 10%, var(--t-surf))` : 'transparent',
                          boxShadow: on ? `inset 3px 0 0 ${b.color}` : 'none', borderBottom: '1px solid var(--t-brd2)' }}>
                        <span style={{ width: 20, height: 20, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, color: 'white', background: b.color }}>{b.code}</span>
                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, color: 'var(--t-txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.isField
                            ? <>
                                <span style={{ color: b.color }}>{o.label}</span>
                                {/* the field's values inline — click one to apply it directly */}
                                <span style={{ marginLeft: 8, fontFamily: 'inherit', fontSize: 11.5, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {FILTER_OPTIONS.filter(x => x.group === o.group).map((x, j) => (
                                    <span key={x.label}>
                                      {j > 0 && <span style={{ opacity: 0.5 }}> · </span>}
                                      <span onClick={e => { e.stopPropagation(); setSearch(head.trim()); x.apply(); setSearchHi(-1); setSearchOpen(false); searchRef.current?.focus(); }}
                                        style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>{x.label}</span>
                                    </span>
                                  ))}
                                </span>
                              </>
                            : <><span style={{ color: b.color }}>{o.group.toLowerCase()}</span><span style={{ color: 'var(--t-muted)' }}>: </span>{o.label}</>}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--t-muted)', whiteSpace: 'nowrap' }}>{o.isField ? `${count}` : b.desc}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 14, padding: '6px 12px', fontSize: 11, color: 'var(--t-muted)', background: 'var(--t-surf2)', borderTop: '1px solid var(--t-brd2)' }}>
                  <span><kbd style={{ fontFamily: 'inherit' }}>↑↓</kbd> navigate</span>
                  <span><kbd style={{ fontFamily: 'inherit' }}>↵</kbd> apply</span>
                  <span><kbd style={{ fontFamily: 'inherit' }}>esc</kbd> close</span>
                </div>
              </div>
            );
          })()}
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2200); }}
          title="Copy link"
          style={{ flexShrink: 0, height: 32, width: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: '1px solid ' + (copied ? 'var(--t-acc)' : 'var(--t-brd)'), background: copied ? 'var(--t-acc-bg)' : 'var(--t-surf)', color: copied ? 'var(--t-acc-dk)' : 'var(--t-txt2)', borderRadius: 8, cursor: 'pointer' }}>
          {copied ? <span style={{ fontSize: 14, fontWeight: 700 }}>✓</span> : <LinkIcon />}
        </button>
        {/* Reset order — always in the header (fixed line); disabled until a
            row was dragged out of the automatic order */}
        {(() => {
          const hasManual = items.some(it => it.kind === 'task' && (it as Task).manuallyMoved);
          return (
            <button onClick={resetManualOrder} disabled={!hasManual}
              title={hasManual ? 'Put every dragged row back in the automatic order' : 'No row was dragged out of the automatic order'}
              style={{ flexShrink: 0, height: 32, padding: '0 10px', border: '1px solid var(--t-brd)', borderRadius: 8, background: 'var(--t-surf)', color: hasManual ? 'var(--t-txt2)' : 'var(--t-muted)', opacity: hasManual ? 1 : 0.5, fontSize: 12, fontWeight: 600, cursor: hasManual ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
              ↺ Reset order
            </button>
          );
        })()}
        {/* Views + column picker — one fixed header line with the title and search;
            anything that comes and goes (filter pills, selection, reset) lives in the
            bar below the header so this line never reflows */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'nowrap', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Scope + grouping in one segmented control: ◷ Today (today-only
              scope toggle) · Not filtered / Requester / Project (grouping; the
              active one shows ▾ and lists the existing values to filter on). */}
          <div ref={groupMenuRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: 32, border: '1px solid var(--t-brd)', borderRadius: 8, overflow: 'hidden' }}>
              {([['', groupBy ? 'Filtered by' : 'Not filtered'], ['today', '◷ Today'], ['requester', 'Requester'], ['project', 'Project']] as const).map(([k, label], i) => k === 'today' ? (
                <button key="today" onClick={() => setQuickFilters(prev => { const n = new Set(prev); if (n.has('forToday')) n.delete('forToday'); else n.add('forToday'); return n; })}
                  title="Show only tasks marked for today"
                  style={{ border: 'none', borderLeft: '1px solid var(--t-brd)', fontSize: 12, fontWeight: 700, padding: '0 10px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5, background: quickFilters.has('forToday') ? 'var(--t-amber-bg)' : 'var(--t-surf)', color: quickFilters.has('forToday') ? 'var(--t-amber)' : 'var(--t-muted)' }}>
                  {label}
                </button>
              ) : (
                <button key={k || 'none'}
                  onClick={() => {
                    if (groupBy === k && k) { setGroupMenu(m => !m); setGroupMenuHi(0); return; }
                    setGroupBy(k); setCollapsedGroups(new Set()); setGroupMenu(false); if (k) setViewMode('table');
                  }}
                  title={k ? (groupBy === k ? `Pick a ${k} to filter on` : `Group rows by ${k}`) : (groupBy ? 'Clear the grouping' : 'No grouping')}
                  style={{ border: 'none', borderLeft: i ? '1px solid var(--t-brd)' : 'none', background: groupBy === k && k ? 'var(--t-acc-bg)' : 'var(--t-surf)', color: groupBy === k ? 'var(--t-acc-dk)' : (!k && groupBy) ? 'var(--t-txt2)' : 'var(--t-muted)', fontSize: 12, fontWeight: 700, padding: '0 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, minWidth: k ? undefined : 92, whiteSpace: 'nowrap' }}>
                  {label}{groupBy === k && k ? <span style={{ fontSize: 10, transform: groupMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span> : null}{!k && groupBy ? <span title="Clear the grouping" style={{ fontSize: 13, lineHeight: 1, color: 'var(--t-muted)' }}>×</span> : null}
                </button>
              ))}
            </div>
            {groupMenu && groupBy && (() => {
              const known = groupBy === 'requester' ? requesters : projects;
              const values = Array.from(new Set([...known, ...Array.from(groupCounts.keys()).filter(k => k !== '—')]));
              const pick = (v: string) => { if (groupBy === 'requester') setReqFilter(v); else setProjFilter(v); setGroupMenu(false); };
              return (
                <div tabIndex={-1} autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') { e.stopPropagation(); setGroupMenu(false); }
                    else if (e.key === 'ArrowDown') { e.preventDefault(); setGroupMenuHi(h => (h + 1) % Math.max(values.length, 1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setGroupMenuHi(h => (h - 1 + values.length) % Math.max(values.length, 1)); }
                    else if (e.key === 'Enter' && values[groupMenuHi]) { e.preventDefault(); pick(values[groupMenuHi]); }
                  }}
                  style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 40, minWidth: 220, maxHeight: 320, overflowY: 'auto', outline: 'none', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 10, boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: '4px 0' }}>
                  {values.length === 0 && <div style={{ padding: '8px 14px', fontSize: 12.5, color: 'var(--t-muted)' }}>No {groupBy}s yet.</div>}
                  {values.map((v, i) => (
                    <div key={v} onClick={() => pick(v)} onMouseEnter={() => setGroupMenuHi(i)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', color: 'var(--t-txt2)', background: groupMenuHi === i ? 'var(--t-surf2)' : 'transparent' }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                      <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>{groupCounts.get(v) ?? 0}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          {/* View switcher — table · cards · pipeline · gantt */}
          <div style={{ display: 'flex', alignItems: 'stretch', height: 32, border: '1px solid var(--t-brd)', borderRadius: 8, overflow: 'hidden' }}>
            {([['table', '☰', 'Table'], ['cards', '▦', 'Cards'], ['pipeline', '⇉', 'Pipeline (by status)'], ['gantt', '𝄜', 'Gantt (by estimates)']] as const).map(([mode, icon, tip]) => (
              <button key={mode} onClick={() => setViewMode(mode)} title={tip}
                style={{ border: 'none', borderLeft: mode !== 'table' ? '1px solid var(--t-brd)' : 'none', background: viewMode === mode ? 'var(--t-acc-bg)' : 'var(--t-surf)', color: viewMode === mode ? 'var(--t-acc-dk)' : 'var(--t-muted)', fontSize: 13, fontWeight: 700, padding: '0 11px', cursor: 'pointer' }}>
                {icon}
              </button>
            ))}
          </div>
          <button onClick={() => setDailyOpen(true)}
            title="Daily — today's work, pick what you're doing (also: d)"
            style={{ height: 32, border: 'none', background: 'oklch(0.6 0.14 150)', color: 'white', fontSize: 12.5, fontWeight: 700, padding: '0 14px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 10 }}>▶</span> Daily
          </button>
        <div style={{ position: 'relative' }} ref={colPickerRef}>
          <button onClick={() => setColPickerOpen(o => !o)}
            title="Columns — choose which to show"
            style={{ height: 32, width: 36, fontSize: 15, padding: 0, borderRadius: 8, border: '1px solid var(--t-brd)', background: colPickerOpen ? 'var(--t-surf2)' : 'var(--t-surf)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-surf2)')}
            onMouseLeave={e => (e.currentTarget.style.background = colPickerOpen ? 'var(--t-surf2)' : 'var(--t-surf)')}>
            🔧
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
      </div>
        </>,
        headerSlot,
      )}

      {/* Filter bar — between the header and the table: active filter pills
          (from the search box, ⌕ cells, the ▾ pickers — all the same string)
          and the selection actions. Only renders when it
          has something to show, so the header line above stays fixed. */}
      {(() => {
        const hasPills = !!(workTypeFilter || statusFilter || reqFilter || projFilter || tagFilter || typeFilter || minScore || [...quickFilters].some(k => k !== 'forToday'));
        if (!hasPills && selCount === 0) return null;
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 10 }}>
        {/* Active filter pills */}
        {(() => {
          const QF_LABELS: Record<string, string> = { createdToday: 'Created today', updatedToday: 'Updated today', forToday: 'Today scope', untagged: 'Untagged', mail: '✉ Mail', nojira: 'No Jira yet' };
          const KIND_LABELS: Record<string, string> = { planned: 'Planned', urgent: 'Urgent', quick: 'Quick help', untyped: 'Untyped' };
          const pills: { label: string; clear: () => void }[] = [];
          if (workTypeFilter) pills.push({ label: `Kind: ${KIND_LABELS[workTypeFilter] ?? workTypeFilter}`, clear: () => setWorkTypeFilter('') });
          if (statusFilter) pills.push({ label: `Status: ${statusFilter.replace('_', ' ')}`, clear: () => setStatusFilter('') });
          if (reqFilter) pills.push({ label: `Requester: ${reqFilter}`, clear: () => setReqFilter('') });
          if (projFilter) pills.push({ label: `Project: ${projFilter}`, clear: () => setProjFilter('') });
          if (tagFilter) pills.push({ label: `Tag: ${tagFilter === 'noTag' ? 'none' : tagFilter}`, clear: () => setTagFilter('') });
          if (typeFilter) pills.push({ label: `Item: ${typeFilter}`, clear: () => setTypeFilter('') });
          if (minScore) pills.push({ label: `Score ≥ ${minScore}`, clear: () => setMinScore('') });
          for (const k of quickFilters) if (k !== 'forToday') pills.push({ label: QF_LABELS[k] ?? k, clear: () => setQuickFilters(prev => { const n = new Set(prev); n.delete(k); return n; }) });
          return (
            <>
              {pills.map(p => (
                <span key={p.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, background: 'var(--t-acc-bg)', color: 'var(--t-acc-dk)', border: '1px solid color-mix(in oklab, var(--t-acc) 30%, transparent)', whiteSpace: 'nowrap' }}>
                  {p.label}
                  <span onClick={p.clear} style={{ cursor: 'pointer', fontSize: 13, lineHeight: 1, opacity: 0.7 }}>×</span>
                </span>
              ))}
              {pills.length > 1 && (
                <button onClick={() => { setTypeFilter(''); setWorkTypeFilter(''); setReqFilter(''); setProjFilter(''); setStatusFilter(''); setTagFilter(''); setMinScore(''); setQuickFilters(prev => new Set([...prev].filter(x => x === 'forToday'))); }}
                  style={{ border: 'none', background: 'transparent', color: 'var(--t-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 6px' }}>
                  Clear all
                </button>
              )}
            </>
          );
        })()}


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

          </div>
        );
      })()}

      {/* Copy-link confirmation — small banner, bottom-right */}
      {copied && (
        <div role="status" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 80, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 9, background: 'var(--t-surf)', color: 'var(--t-txt)', border: '1px solid var(--t-brd)', boxShadow: '0 6px 20px rgba(0,0,0,0.18)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--t-success, oklch(0.5 0.14 150))', fontWeight: 800 }}>✓</span> Link to current view copied
        </div>
      )}

      {/* Pipeline view — filtered tasks by status, board-style */}
      {viewMode === 'pipeline' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, alignItems: 'start' }}>
          {([['backlog', 'Backlog'], ['todo', 'To do'], ['in_progress', 'In progress'], ['waiting', 'Waiting'], ['done', 'Done']] as const).map(([st, label]) => {
            const colRows = rows.filter(it => it.kind === 'task' && (st === 'done' ? (it as Task).status === 'done' || it.archived : (it as Task).status === st && !it.archived)) as Task[];
            return (
              <div key={st} style={{ background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 12, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  {label} · {colRows.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {colRows.map(t2 => (
                    <div key={t2.id} onClick={() => openTask(t2.id)} title="Open"
                      style={{ background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 9, padding: '9px 11px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--t-txt)', lineHeight: 1.35 }}>
                      {t2.title}
                      {t2.forToday && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--t-amber)', fontWeight: 700 }}>◷</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Gantt view — professional-timeline style: a clock-time scale with
          gridlines, a "now" marker, one bar per task carrying its NAME and
          duration, a darker progress fill for the share of steps already
          done, and the label spilling to the right when the bar is too short. */}
      {viewMode === 'gantt' && (() => {
        const gRows = (rows.filter(it => it.kind === 'task' && !it.archived) as Task[]).map(t2 => {
          const fromSubs = t2.subtasks.filter(su => !su.done).reduce((n, su) => n + (parseEstimate(su.estimate) || 0), 0);
          const baseMins = fromSubs || parseEstimate(t2.estimate) || 60;
          const mins = ganttResize?.id === t2.id ? ganttResize.mins : baseMins;
          const steps = t2.subtasks.length;
          const progress = steps ? t2.subtasks.filter(su => su.done).length / steps : 0;
          return { t: t2, mins, progress };
        });
        const total = Math.max(gRows.reduce((n, r) => n + r.mins, 0), 60);
        // Time scale from now: hourly ticks (half-hourly when the span is short)
        const tickMins = total <= 180 ? 30 : total <= 720 ? 60 : 120;
        const ticks: number[] = [];
        for (let m = 0; m <= total; m += tickMins) ticks.push(m);
        const now = Date.now();
        const clock = (offsetMins: number) => {
          const d = new Date(now + offsetMins * 60_000);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        const LABEL_MIN_PCT = 14; // below this the name sits beside the bar
        // Resize = change the remaining estimate. If the duration came from
        // subtask estimates, scale those proportionally (the bar IS their
        // sum); otherwise write the task's own estimate.
        const commitResize = (t2: Task, mins: number) => {
          const undone = t2.subtasks.filter(su => !su.done && parseEstimate(su.estimate) > 0);
          const fromSubs = undone.reduce((n, su) => n + parseEstimate(su.estimate), 0);
          if (fromSubs > 0) {
            undone.forEach(su => updateSubtask(t2.id, su.id, { estimate: formatMinutes(Math.max(5, Math.round(parseEstimate(su.estimate) / fromSubs * mins / 5) * 5)) }));
          } else updateItem(t2.id, { estimate: formatMinutes(mins) });
        };
        const startResize = (e: React.MouseEvent, t2: Task, mins: number, rowEl: HTMLElement) => {
          e.preventDefault(); e.stopPropagation();
          const pxPerMin = rowEl.getBoundingClientRect().width / total;
          ganttDrag.current = { id: t2.id, startX: e.clientX, startMins: mins, pxPerMin };
          setGanttResize({ id: t2.id, mins });
          const onMove = (ev: MouseEvent) => {
            const d = ganttDrag.current; if (!d) return;
            const next = Math.max(15, Math.round((d.startMins + (ev.clientX - d.startX) / d.pxPerMin) / 15) * 15);
            setGanttResize({ id: d.id, mins: next });
          };
          const onUp = (ev: MouseEvent) => {
            window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
            const d = ganttDrag.current; ganttDrag.current = null;
            if (!d) return;
            const next = Math.max(15, Math.round((d.startMins + (ev.clientX - d.startX) / d.pxPerMin) / 15) * 15);
            setGanttResize(null);
            ganttJustResized.current = true; setTimeout(() => { ganttJustResized.current = false; }, 0);
            if (next !== d.startMins) commitResize(t2, next);
          };
          window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        };
        let acc = 0;
        return (
          <div style={{ background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, overflow: 'hidden' }}>
            {/* scale */}
            <div style={{ position: 'relative', height: 30, borderBottom: '1px solid var(--t-brd)', background: 'var(--t-surf2)' }}>
              {ticks.map(m => (
                <div key={m} style={{ position: 'absolute', left: `${(m / total) * 100}%`, top: 0, bottom: 0, borderLeft: '1px solid var(--t-brd2)' }}>
                  <span style={{ position: 'absolute', left: 5, top: 7, fontSize: 11, fontWeight: 600, color: 'var(--t-muted)', whiteSpace: 'nowrap' }}>{m === 0 ? 'now' : clock(m)}</span>
                </div>
              ))}
            </div>
            {/* rows */}
            <div style={{ position: 'relative' }}>
              {/* gridlines */}
              {ticks.map(m => <div key={m} style={{ position: 'absolute', left: `${(m / total) * 100}%`, top: 0, bottom: 0, borderLeft: '1px solid var(--t-brd2)', pointerEvents: 'none' }} />)}
              {/* now marker */}
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderLeft: '2px solid var(--t-urgent)', pointerEvents: 'none' }} />
              {gRows.length === 0 && <div style={{ padding: 18, fontSize: 13, color: 'var(--t-muted)' }}>Nothing matches the filters.</div>}
              {gRows.map(({ t: t2, mins, progress }, i) => {
                const left = (acc / total) * 100;
                const widthPct = (mins / total) * 100;
                acc += mins;
                const accent = t2.forToday ? 'var(--t-amber)' : t2.type === 'urgent' ? 'var(--t-urgent)' : 'var(--t-acc)';
                const inside = widthPct >= LABEL_MIN_PCT;
                return (
                  <div key={t2.id}
                    draggable={!ganttResize}
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(t2.id); }}
                    onDragOver={e => { e.preventDefault(); if (t2.id !== dragId) setDragOverId(t2.id); }}
                    onDrop={e => { e.preventDefault(); handleDrop(t2.id); }}
                    onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                    data-gantt-row
                    style={{ position: 'relative', height: 40, borderBottom: '1px solid var(--t-brd2)', background: i % 2 ? 'transparent' : 'color-mix(in oklab, var(--t-surf2) 50%, transparent)', opacity: dragId === t2.id ? 0.4 : 1, borderTop: dragOverId === t2.id && dragId !== t2.id ? '2px solid var(--t-acc)' : undefined, cursor: 'grab' }}>
                    <div onClick={() => { if (!ganttJustResized.current) openTask(t2.id); }} title={`${t2.title} · ~${formatMinutes(mins)} remaining · ${Math.round(progress * 100)}% of steps done · drag to reorder · drag the right edge to change the time`}
                      style={{ position: 'absolute', left: `${left}%`, width: `${Math.max(widthPct, 0.8)}%`, top: 7, height: 26, borderRadius: 6, cursor: 'pointer', background: `color-mix(in oklab, ${accent} 78%, white)`, boxShadow: ganttResize?.id === t2.id ? `0 0 0 2px ${accent}` : '0 1px 2px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                      {/* progress fill */}
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, background: accent }} />
                      {/* resize handle — drag to change the remaining estimate */}
                      <div onMouseDown={e => startResize(e, t2, mins, (e.currentTarget.closest('[data-gantt-row]') as HTMLElement) ?? e.currentTarget.parentElement!.parentElement!)}
                        title="Drag to change the time"
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 10, cursor: 'ew-resize', background: 'linear-gradient(to left, rgba(255,255,255,0.35), transparent)' }} />
                      {inside && (
                        <span style={{ position: 'absolute', left: 8, right: 8, top: 0, bottom: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'white', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textShadow: '0 1px 1px rgba(0,0,0,0.25)' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t2.title}</span>
                          <span style={{ marginLeft: 'auto', fontWeight: 600, opacity: 0.9, flexShrink: 0 }}>{formatMinutes(mins)}</span>
                        </span>
                      )}
                    </div>
                    {!inside && (
                      <span onClick={() => openTask(t2.id)}
                        style={{ position: 'absolute', left: `calc(${left + Math.max(widthPct, 0.8)}% + 8px)`, top: 0, height: 40, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--t-txt)', whiteSpace: 'nowrap', cursor: 'pointer', maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t2.title} <span style={{ fontWeight: 600, color: 'var(--t-muted)' }}>{formatMinutes(mins)}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--t-muted)', background: 'var(--t-surf2)', borderTop: '1px solid var(--t-brd)' }}>
              Drag a row to reorder · drag a bar's right edge to change its time (15-min steps; scales the step estimates when those set the length) · darker fill = steps done · total ~{formatMinutes(total)}
            </div>
          </div>
        );
      })()}

      {/* Card view of the SAME filtered rows — roomy: title, description /
          notes snippet, chips for kind · status · requester · project, step
          progress, tickets */}
      {viewMode === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {pagedRows.map(it => {
            const isT = it.kind === 'task';
            const tt = it as Task;
            const accent = isT ? (tt.type === 'urgent' ? 'var(--t-urgent)' : tt.type === 'quick' ? 'var(--t-quick)' : tt.type === 'mail' ? 'var(--t-amber)' : 'var(--t-acc)') : 'var(--t-amber)';
            const snippet = isT ? (tt.description?.trim() || tt.notes?.trim() || '') : '';
            const steps = isT ? tt.subtasks : [];
            const doneSteps = steps.filter(s => s.done).length;
            const chip = (label: string, color = 'var(--t-txt2)', bg = 'var(--t-surf2)'): React.ReactNode => (
              <span key={label} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color, whiteSpace: 'nowrap' }}>{label}</span>
            );
            return (
              <div key={it.id} onClick={() => openTask(it.id)}
                title="Open"
                style={{ background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderTop: `3px solid ${accent}`, borderRadius: 14, padding: '16px 18px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 150, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.title}</div>
                  {isT && tt.forToday && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--t-amber)', background: 'var(--t-amber-bg)', padding: '3px 8px', borderRadius: 999, flexShrink: 0 }}>◷ today</span>}
                </div>
                {snippet && (
                  <div style={{ fontSize: 13, color: 'var(--t-txt2)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line' }}>{snippet}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {isT && chip(tt.type === 'mail' ? '✉ mail' : (tt.type ? { planned: 'Planned', urgent: 'Urgent', quick: 'Quick help' }[tt.type] : 'Untyped'), accent, `color-mix(in oklab, ${accent} 12%, var(--t-surf))`)}
                  {isT && chip(tt.status === 'todo' ? 'To do' : tt.status.replace('_', ' '))}
                  {isT && tt.requester && chip(`👤 ${tt.requester}`)}
                  {isT && tt.project && chip(`▣ ${tt.project}`)}
                  {!isT && chip('Reminder', 'var(--t-amber)', 'var(--t-amber-bg)')}
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--t-muted)', flexWrap: 'wrap' }}>
                  {steps.length > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 64, height: 5, borderRadius: 999, background: 'var(--t-surf3)', overflow: 'hidden', display: 'inline-block' }}>
                        <span style={{ display: 'block', width: `${(doneSteps / steps.length) * 100}%`, height: '100%', background: 'var(--t-success)' }} />
                      </span>
                      {doneSteps}/{steps.length} steps
                    </span>
                  )}
                  {isT && tt.jiraLink && <span style={{ fontWeight: 600 }}>{tt.jiraLink}</span>}
                  {isT && tt.itsmTicket && <span style={{ fontWeight: 600 }}>{tt.itsmTicket}</span>}
                  <span style={{ marginLeft: 'auto' }}>{new Date(it.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>Nothing matches the filters.</div>}
        </div>
      )}

      {/* Table */}
      {/* Horizontal scroll ONLY when the columns outgrow the page — overflow:auto
          shows a scrollbar just in that case; the page itself never scrolls sideways. */}
      {viewMode === 'table' && <div style={{ overflowX: 'auto', overflowY: 'visible', maxWidth: '100%' }}><table style={{ width: 'auto', minWidth: '100%', borderCollapse: 'collapse', fontSize: 13.5, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 10, overflow: 'hidden', tableLayout: 'fixed' }}>
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
          {pagedRows.map((it, rowIdx) => {
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
            const gKey = groupBy ? groupKeyOf(it) : null;
            const showHeader = gKey !== null && (rowIdx === 0 || groupKeyOf(pagedRows[rowIdx - 1]) !== gKey);
            const gCollapsed = gKey !== null && collapsedGroups.has(gKey);
            const header = showHeader ? (
              <tr key={`g:${gKey}`} onClick={() => setCollapsedGroups(prev => { const n = new Set(prev); if (n.has(gKey!)) n.delete(gKey!); else n.add(gKey!); return n; })}
                style={{ background: 'var(--t-surf2)', cursor: 'pointer', borderTop: '1px solid var(--t-brd)' }}>
                <td colSpan={cols.length + 2} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, color: 'var(--t-txt2)' }}>
                  <span style={{ display: 'inline-block', marginRight: 8, fontSize: 11, color: 'var(--t-muted)', transform: gCollapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s' }}>▸</span>
                  {gKey === '—' ? `No ${groupBy}` : gKey}
                  <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--t-muted)' }}>· {groupCounts.get(gKey!) ?? 0}</span>
                </td>
              </tr>
            ) : null;
            if (gCollapsed) return header;
            return (
              <Fragment key={it.id}>
              {header}
              <tr
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
                  if (col.key === 'kind' && it.kind === 'task' && (it as Task).type !== 'mail') {
                    return (
                      <td key={col.key} style={{ ...td }} onClick={e => e.stopPropagation()}>
                        <TypePicker task={it as Task} compact />
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
                      {(col.key === 'requester' || col.key === 'project') && String(col.getValue(it) || '') && (
                        <span
                          onClick={e => { e.stopPropagation(); const v = String(col.getValue(it)); if (col.key === 'requester') setReqFilter(v); else setProjFilter(v); }}
                          title={`Show only this ${col.key}`}
                          style={{ marginLeft: 6, fontSize: 12, color: 'var(--t-acc)', cursor: 'pointer', userSelect: 'none', opacity: hoveredCell === cellKey ? 1 : 0, transition: 'opacity 0.1s' }}>⌕</span>
                      )}
                      {jiraCellUrl && (
                        <>
                          <span
                            onClick={e => { e.stopPropagation(); openJira(jiraCellUrl, jiraKey); }}
                            title={`Open ${jiraKey}`}
                            style={{ marginLeft: 6, fontSize: 14, color: 'var(--t-acc)', cursor: 'pointer', userSelect: 'none' }}>
                            ↗
                          </span>
                          <span
                            onClick={e => { e.stopPropagation(); openTicketWindow(jiraCellUrl, jiraKey); }}
                            title={`Open ${jiraKey} in a popup window`}
                            style={{ marginLeft: 4, fontSize: 12, color: 'var(--t-acc)', cursor: 'pointer', userSelect: 'none' }}>
                            ⧉
                          </span>
                        </>
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
              </Fragment>
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
      </table></div>}

      {(viewMode === 'table' || viewMode === 'cards') && rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', fontSize: 12.5, color: 'var(--t-muted)' }}>
          <span>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
          {pageCount > 1 && (
            <>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}
                style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, padding: '3px 10px', borderRadius: 6, cursor: safePage === 0 ? 'default' : 'pointer', opacity: safePage === 0 ? 0.4 : 1 }}>‹</button>
              <span>Page {safePage + 1} / {pageCount}</span>
              <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
                style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, padding: '3px 10px', borderRadius: 6, cursor: safePage >= pageCount - 1 ? 'default' : 'pointer', opacity: safePage >= pageCount - 1 ? 0.4 : 1 }}>›</button>
            </>
          )}
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
            style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)' }}>
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>{rows.length} item{rows.length !== 1 ? 's' : ''}</div>
    </div>
    {modalTaskId && <TaskModal taskId={modalTaskId} allIds={rows.map(r => r.id)} onNavigate={navigateModal} onClose={closeTaskModal} />}
    {dailyOpen && <DailyPlay onClose={() => setDailyOpen(false)} />}
    {reminderModalId && <ReminderModal reminderId={reminderModalId} onClose={() => setReminderModalId(null)} />}
      {mailPopupId && <MailEntryPopup entryId={mailPopupId} onClose={() => setMailPopupId(null)} />}
    {aiTaskId && (() => {
      const t = rows.find(r => r.id === aiTaskId);
      return t && t.kind === 'task' ? <AiAssignModal task={t as Task} onClose={() => setAiTaskId(null)} /> : null;
    })()}
    </>
  );
}
