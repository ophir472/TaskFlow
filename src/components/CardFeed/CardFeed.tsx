import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import { scoreItem, nextId } from '../../engine';
import { formatSchedule } from '../../scheduleEngine';
import type { Item, Task, ScheduleSpec } from '../../types';
import { SubtaskPanel } from '../SubtaskPanel/SubtaskPanel';
import { SubtaskFullPage } from '../SubtaskPanel/SubtaskFullPage';
import { SchedulePicker } from '../SchedulePicker/SchedulePicker';
import { SearchBar } from '../SearchBar/SearchBar';
import { createJiraIssue } from '../../jira';

interface Props {
  onToast: (msg: string) => void;
  focusSearchTrigger?: number;
}

export function CardFeed({ onToast, focusSearchTrigger }: Props) {
  const items = useStore(s => s.items);
  const requesters = useStore(s => s.requesters);
  const projects = useStore(s => s.projects);

  // displayId and triggerTagForId live in the store so they survive page refresh
  const displayId = useStore(s => s.displayId);
  const setDisplayId = useStore(s => s.setDisplayId);
  const triggerTagForId = useStore(s => s.triggerTagForId);
  const setTriggerTagForId = useStore(s => s.setTriggerTagForId);

  const customFields = useStore(s => s.customFields);
  const jiraConfig = useStore(s => s.jiraConfig);
  const itsmConfig = useStore(s => s.itsmConfig);
  const taskOrder = useStore(s => s.taskOrder);
  const sidebarCollapsed = useStore(s => s.sidebarCollapsed);
  const updateItem = useStore(s => s.updateItem);
  const updateItemCustomValue = useStore(s => s.updateItemCustomValue);
  const toggleTag = useStore(s => s.toggleTag);
  const toggleSubtaskDone = useStore(s => s.toggleSubtaskDone);
  const toggleSubtaskNext = useStore(s => s.toggleSubtaskNext);
  const addSubtask = useStore(s => s.addSubtask);
  const deleteSubtask = useStore(s => s.deleteSubtask);
  const continueItem = useStore(s => s.continueItem);
  const holdItem = useStore(s => s.holdItem);
  const rescheduleReminder = useStore(s => s.rescheduleReminder);
  const completeItem = useStore(s => s.completeItem);
  const archiveItem = useStore(s => s.archiveItem);
  const deleteItem = useStore(s => s.deleteItem);
  const createItem = useStore(s => s.createItem);

  const [creatingJira, setCreatingJira] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [cardMenuOpen, setCardMenuOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState('');
  const cardMenuRef = useRef<HTMLDivElement>(null);
  const prevHadSubtask = useRef(false);
  const [holdNote, setHoldNote] = useState('');
  const [holdSchedule, setHoldSchedule] = useState<ScheduleSpec | null>(null);
  const [subtaskPanel, setSubtaskPanel] = useState<{ parentId: string; subId: string } | null>(null);
  const [fullPageSubtask, setFullPageSubtask] = useState<{ parentId: string; subId: string } | null>(null);
  const [newSubtask, setNewSubtask] = useState('');
  const [tagEditMode, setTagEditMode] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const autoResizeTitle = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  // Queue matches table order exactly: today-filter → today→manual→score
  const activeItems = items.filter(it => {
    if (it.archived) return false;
    if (it.kind === 'task') {
      const t = it as Task;
      return t.status !== 'done' && t.status !== 'archived' &&
             (t.status !== 'waiting' || it.priorityBoost);
    }
    return it.status === 'active';
  });
  const todayItems = activeItems.filter(it => it.kind === 'task' && (it as Task).forToday);
  const scope = todayItems.length > 0 ? todayItems : activeItems;
  const untagged = (it: Item) =>
    it.kind === 'task' && !(it as Task).urgent && !(it as Task).important &&
    !(it as Task).quick && !(it as Task).noTag;

  // Merge: manual tasks hold their exact positions; auto tasks fill remaining slots by score
  const scopeMap = new Map(scope.map(it => [it.id, it]));
  const manualIds = new Set(scope.filter(it => it.kind === 'task' && (it as Task).manuallyMoved).map(it => it.id));

  const autoSorted = scope.filter(it => !manualIds.has(it.id)).sort((a, b) => {
    const aT = a.kind === 'task' && (a as Task).forToday ? 0 : 1;
    const bT = b.kind === 'task' && (b as Task).forToday ? 0 : 1;
    if (aT !== bT) return aT - bT;
    const aU = untagged(a) ? 0 : 1;
    const bU = untagged(b) ? 0 : 1;
    if (aU !== bU) return aU - bU;
    return scoreItem(b) - scoreItem(a);
  });

  const inScope = new Set(scope.map(it => it.id));
  const slotIds = [
    ...taskOrder.filter(id => inScope.has(id)),
    ...scope.filter(it => !taskOrder.includes(it.id)).map(it => it.id),
  ];

  let autoPtr = 0;
  const queue: Item[] = [];
  for (const id of slotIds) {
    if (manualIds.has(id)) {
      const item = scopeMap.get(id);
      if (item) queue.push(item);
    } else if (autoPtr < autoSorted.length) {
      queue.push(autoSorted[autoPtr++]);
    }
  }

  // Allow viewing any item (including archived) when navigated to directly.
  const displayItem = (displayId ? items.find(it => it.id === displayId) : null) ?? queue[0] ?? null;
  const current = displayItem;

  // Only clear displayId when the item is deleted entirely — not when it's just outside the queue
  useEffect(() => {
    if (tagEditMode) return;
    if (displayId && !items.find(it => it.id === displayId)) setDisplayId(null);
  }, [items.map(it => it.id).join(','), tagEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize title textarea whenever the active card changes
  useEffect(() => { autoResizeTitle(); }, [current?.id, autoResizeTitle]);

  // Consume triggerTagForId: pin the task and enter tag edit mode
  useEffect(() => {
    if (!triggerTagForId) return;
    setDisplayId(triggerTagForId);
    setTagEditMode(true);
    setTriggerTagForId(null);
  }, [triggerTagForId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-enter tag edit when current card is an untagged task
  useEffect(() => {
    if (tagEditMode || !current) return;
    if (current.kind === 'task') {
      const t = current as Task;
      if (!t.urgent && !t.important && !t.quick && !t.noTag) {
        setDisplayId(current.id); // pin the card so queue re-sorts don't move us away
        setTagEditMode(true);
      }
    }
  }, [current?.id]);

  // On mount: restore card/subtask from URL
  useEffect(() => {
    const parts = window.location.hash.slice(1).split('/');
    if (parts[0] !== 'feed') return;
    if (parts[1]) {
      setDisplayId(parts[1]);
      if (parts[2] === 'sub' && parts[3]) setSubtaskPanel({ parentId: parts[1], subId: parts[3] });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Back/forward within feed: restore card/subtask from URL
  useEffect(() => {
    function onHashChange() {
      const parts = window.location.hash.slice(1).split('/');
      if (parts[0] !== 'feed') return;
      setDisplayId(parts[1] || null);
      if (parts[1] && parts[2] === 'sub' && parts[3]) {
        setSubtaskPanel({ parentId: parts[1], subId: parts[3] });
        setFullPageSubtask(null);
      } else {
        setSubtaskPanel(null);
        setFullPageSubtask(null);
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // State → URL: keep hash in sync with current card/subtask
  useEffect(() => {
    if (window.location.hash.slice(1).split('/')[0] !== 'feed') return;
    const panel = subtaskPanel ?? fullPageSubtask;
    let hash = 'feed';
    if (panel) hash = `feed/${panel.parentId}/sub/${panel.subId}`;
    else if (displayId) hash = `feed/${displayId}`;

    if (window.location.hash.slice(1) !== hash) {
      const openingSubtask = panel !== null && !prevHadSubtask.current;
      if (openingSubtask) history.pushState(null, '', '#' + hash);
      else history.replaceState(null, '', '#' + hash);
    }
    prevHadSubtask.current = panel !== null;
  }, [displayId, subtaskPanel, fullPageSubtask]);

  // Focus search bar when triggered from outside (cmd+f)
  useEffect(() => {
    if (!focusSearchTrigger) return;
    searchRef.current?.focus();
  }, [focusSearchTrigger]);

  const handleContinue = useCallback(() => {
    if (!current || queue.length <= 1) return;
    continueItem(current.id);
    setTagEditMode(false);
    setHoldOpen(false);
    const idx = queue.findIndex(it => it.id === current.id);
    setDisplayId(queue[(idx + 1) % queue.length].id);
  }, [current, queue, continueItem, setDisplayId]);

  // Enter → Continue, Shift+Enter → go back (when no input/textarea is focused)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (e.shiftKey) {
        if (!current || queue.length <= 1) return;
        const idx = queue.findIndex(it => it.id === current.id);
        setDisplayId(queue[(idx - 1 + queue.length) % queue.length].id);
      } else {
        handleContinue();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleContinue, current, queue, setDisplayId]);

  const handleHoldConfirm = () => {
    if (!current) return;
    if (current.kind === 'reminder') {
      if (!holdSchedule) return;
      rescheduleReminder(current.id, holdSchedule);
      onToast('Reminder rescheduled');
    } else {
      holdItem(current.id, holdNote, holdSchedule ?? undefined);
      onToast('Moved to Waiting');
    }
    setDisplayId(null);
    setTagEditMode(false);
    setHoldOpen(false);
    setHoldNote('');
    setHoldSchedule(null);
  };

  const handlePin = (id: string) => {
    setDisplayId(id);
    setHoldOpen(false);
  };

  const handleQuickCreate = (title: string) => {
    const now = Date.now();
    const id = nextId('t');
    createItem({
      id, kind: 'task', title, description: '', notes: '', blockers: '', generalLink: '', jiraLink: '',
      requester: '', project: '', status: 'backlog', forToday: false,
      urgent: false, important: false, quick: false, noTag: false,
      toCheck: '', priorityBoost: false, subtasks: [],
      bumpedAt: 0, staleness: 0, createdAt: now, updatedAt: now, archived: false,
    });
    setTriggerTagForId(id);
  };


  const handleComplete = () => {
    if (!current) return;
    const result = completeItem(current.id);
    setDisplayId(null);
    setTagEditMode(false);
    if (result === 'rescheduled') onToast('Rescheduled for next occurrence');
    else if (result === 'archived') onToast('Archived');
  };

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (cardMenuRef.current && !cardMenuRef.current.contains(e.target as Node)) setCardMenuOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function handleCardArchive() {
    if (!current) return;
    archiveItem(current.id);
    setDisplayId(null);
    setCardMenuOpen(false);
  }

  function handleCardDelete() {
    if (!current) return;
    if (!confirm('Permanently delete this task?')) return;
    deleteItem(current.id);
    setDisplayId(null);
    setCardMenuOpen(false);
  }

  async function handleCreateJira() {
    if (!jiraConfig || !t || !current) return;
    setCreatingJira(true);
    try {
      const result = await createJiraIssue(jiraConfig, {
        summary: t.title,
        description: t.description ?? '',
        requestedBy: t.requester,
      });
      updateItem(current.id, { jiraLink: result.key });
      onToast(`Created ${result.key}`);
      window.open(result.url, '_blank');
    } catch (err) {
      onToast(`Jira error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setCreatingJira(false);
    }
  }

  // Full-page subtask replaces the entire feed area
  if (fullPageSubtask) {
    return (
      <SubtaskFullPage
        parentId={fullPageSubtask.parentId}
        subId={fullPageSubtask.subId}
        onBack={() => setFullPageSubtask(null)}
      />
    );
  }

  if (!current) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--t-muted)', fontSize: 15 }}>
          All caught up — nothing left in the queue.
        </div>
      </div>
    );
  }

  const score = scoreItem(current);
  const isTask = current.kind === 'task';
  const isReminder = current.kind === 'reminder';
  const isResponsibility = current.kind === 'responsibility';
  const t = isTask ? (current as Task) : null;

  // Tag-sweep banner
  const needsTagCount = (activeItems.filter(it => it.kind === 'task') as Task[])
    .filter(it => !it.urgent && !it.important && !it.quick && !it.noTag).length;
  const queueTier: 'needsTag' | 'scored' =
    needsTagCount > 0 ? 'needsTag' : 'scored';

  const kindLabel = isTask ? 'TASK' : isReminder ? 'REMINDER' : 'RESPONSIBILITY';
  const holdButtonLabel = isReminder ? 'Remind me again' : 'Hold';
  const holdPanelLabel = isReminder ? 'Schedule next reminder' : 'When should this come back?';
  const completeLabel = isResponsibility ? 'Complete (reschedule)' : 'Complete';
  const holdConfirmDisabled = isReminder && !holdSchedule;

  const queuePos = queue.length > 1
    ? `${queue.findIndex(it => it.id === current.id) + 1} of ${queue.length}`
    : null;

  const TAG_DEFS: { key: 'urgent' | 'important' | 'quick' | 'noTag'; label: string; activeColor: string; activeBg: string; activeBorder: string }[] = [
    { key: 'urgent',    label: 'Urgent',        activeColor: 'var(--t-urgent)',    activeBg: 'var(--t-urgent-bg)',    activeBorder: 'var(--t-urgent)'    },
    { key: 'important', label: 'Important',     activeColor: 'var(--t-important)', activeBg: 'var(--t-important-bg)', activeBorder: 'var(--t-important)' },
    { key: 'quick',     label: 'Quick',         activeColor: 'var(--t-quick)',     activeBg: 'var(--t-quick-bg)',     activeBorder: 'var(--t-quick)'     },
    { key: 'noTag',     label: 'None of these', activeColor: 'var(--t-txt2)',      activeBg: 'var(--t-surf3)',        activeBorder: 'var(--t-muted)'     },
  ];

  const KIND_STYLE = {
    task:           { color: 'var(--t-kind-task)',     bg: 'var(--t-kind-task-bg)',     border: 'var(--t-kind-task)'     },
    reminder:       { color: 'var(--t-kind-reminder)', bg: 'var(--t-kind-reminder-bg)', border: 'var(--t-kind-reminder)' },
    responsibility: { color: 'var(--t-kind-resp)',     bg: 'var(--t-kind-resp-bg)',      border: 'var(--t-kind-resp)'     },
  } as const;

  // Style shortcuts
  const inp: React.CSSProperties = { width: '100%', fontSize: 14, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', boxSizing: 'border-box', color: 'var(--t-txt)' };
  const ta: React.CSSProperties = { ...inp, resize: 'vertical' as const, fontFamily: 'inherit' };
  const sel: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 8px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)' };
  const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 36px 100px', gap: 0 }}>
      <div style={{
        width: 880, maxWidth: '100%', background: 'var(--t-surf)', border: '1px solid var(--t-brd)',
        borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden',
        borderTop: `3px solid ${KIND_STYLE[current.kind].border}`,
      }}>
        {/* Tier banner */}
        {isTask && queueTier === 'needsTag' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 20px', background: 'var(--t-amber-bg)', borderBottom: '1px solid var(--t-amber-brd)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 13 }}>🏷</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-amber)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tag sweep</span>
              <span style={{ fontSize: 12, color: 'var(--t-amber)' }}>— set at least one tag or "None of these"</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-amber)', background: 'var(--t-amber-bg)', padding: '2px 8px', borderRadius: 20 }}>
              {needsTagCount} left
            </span>
          </div>
        )}

        {/* Header */}
        <div style={{ padding: '22px 26px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '3px 9px', borderRadius: 20,
                color: KIND_STYLE[current.kind].color,
                background: KIND_STYLE[current.kind].bg,
              }}>
                {kindLabel}
              </span>
              {current.priorityBoost && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'var(--t-amber-bg)', color: 'var(--t-amber)' }}>
                  RESUMED · +100
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {queuePos && (
                <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>{queuePos}</span>
              )}
              {queueTier === 'scored' && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)', whiteSpace: 'nowrap' }}>Score {score.toFixed(0)}</span>
              )}
              {/* 3-dot menu */}
              <div ref={cardMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setCardMenuOpen(o => !o)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--t-muted)', padding: '2px 6px', borderRadius: 6, lineHeight: 1 }}
                  title="More options">
                  ⋯
                </button>
                {cardMenuOpen && (
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.14)', minWidth: 150, zIndex: 30, overflow: 'hidden' }}>
                    <button onClick={handleCardArchive}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', background: 'transparent', fontSize: 14, color: 'var(--t-txt)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-surf2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      ⊙ Archive
                    </button>
                    <button onClick={handleCardDelete}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', background: 'transparent', fontSize: 14, color: 'var(--t-urgent)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-urgent-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      ✕ Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <textarea
            ref={titleRef}
            value={current.title}
            onChange={e => { updateItem(current.id, { title: e.target.value }); autoResizeTitle(); }}
            rows={1}
            style={{
              width: '100%', border: 'none', outline: 'none',
              fontSize: 23, fontWeight: 700, letterSpacing: '-0.01em',
              padding: '10px 0 4px', color: 'var(--t-txt)', background: 'transparent',
              resize: 'none', overflow: 'hidden', lineHeight: 1.3,
              fontFamily: 'inherit', display: 'block',
            }}
          />
        </div>

        {/* Task body — two columns */}
        {isTask && t && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>

            {/* ── Main column ── */}
            <div style={{ flex: 1, padding: '14px 20px 22px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Tags (pencil-locked) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={fl}>Tags</span>
                  <button
                    onClick={() => {
                      if (tagEditMode) { setTagEditMode(false); setDisplayId(null); }
                      else { setDisplayId(current.id); setTagEditMode(true); }
                    }}
                    title={tagEditMode ? 'Done — reorder queue' : 'Edit tags'}
                    style={{ border: 'none', background: tagEditMode ? 'var(--t-acc-bg)' : 'transparent', color: tagEditMode ? 'var(--t-acc-dk)' : 'var(--t-muted)', cursor: 'pointer', fontSize: 14, padding: '2px 8px', borderRadius: 6, fontWeight: tagEditMode ? 600 : 400, lineHeight: 1.4 }}
                  >
                    {tagEditMode ? 'Done' : '✎'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TAG_DEFS.map(({ key, label, activeColor, activeBg, activeBorder }) => {
                    const active = t[key];
                    return (
                      <div key={key} onClick={() => tagEditMode && toggleTag(current.id, key)} style={{
                        padding: '7px 13px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                        border: `1.5px solid ${active ? activeBorder : 'var(--t-brd)'}`,
                        color: active ? activeColor : (tagEditMode ? 'var(--t-txt2)' : 'var(--t-muted)'),
                        background: active ? activeBg : 'transparent',
                        cursor: tagEditMode ? 'pointer' : 'default',
                        userSelect: 'none', opacity: tagEditMode ? 1 : (active ? 1 : 0.55),
                        transition: 'background 0.15s, color 0.15s, border-color 0.15s, opacity 0.15s',
                      }}>
                        {active ? '✓ ' : ''}{label}
                      </div>
                    );
                  })}
                </div>
                {tagEditMode && <div style={{ fontSize: 11, color: 'var(--t-acc)' }}>Editing — card stays here until you click Done</div>}
              </div>

              {/* To check banner */}
              {t.toCheck && (
                <div style={{ background: 'var(--t-amber-bg)', border: '1px solid var(--t-amber-brd)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--t-amber)' }}>
                  <b>To check:</b> {t.toCheck}
                </div>
              )}

              {/* Subtasks */}
              <div>
                <div style={{ ...fl, marginBottom: 8 }}>
                  Subtasks {t.subtasks.length > 0 && `(${t.subtasks.filter(s => s.done).length}/${t.subtasks.length})`}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {t.subtasks.map(sub => (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--t-brd2)', borderRadius: 9, background: 'var(--t-surf2)' }}>
                      <input type="checkbox" checked={sub.done} onChange={() => toggleSubtaskDone(current.id, sub.id)} style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                      <div onClick={() => setSubtaskPanel({ parentId: current.id, subId: sub.id })} style={{ flex: 1, fontSize: 14, cursor: 'pointer', textDecoration: sub.done ? 'line-through' : 'none', color: sub.done ? 'var(--t-muted)' : 'var(--t-txt)' }}>{sub.title}</div>
                      <div onClick={() => toggleSubtaskNext(current.id, sub.id)} style={{ cursor: 'pointer', fontSize: 15, color: sub.isNext ? 'var(--t-amber)' : 'var(--t-brd)', userSelect: 'none', flexShrink: 0 }} title="Next up">★</div>
                      <div onClick={() => deleteSubtask(current.id, sub.id)} style={{ cursor: 'pointer', fontSize: 14, color: 'var(--t-muted)', userSelect: 'none', flexShrink: 0 }} title="Remove">×</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newSubtask.trim()) { addSubtask(current.id, newSubtask.trim()); setNewSubtask(''); } if (e.key === 'Escape') setNewSubtask(''); }}
                      placeholder="Add subtask…" style={{ ...inp, flex: 1 }} />
                    <button onClick={() => { if (newSubtask.trim()) { addSubtask(current.id, newSubtask.trim()); setNewSubtask(''); } }} disabled={!newSubtask.trim()}
                      style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 18, lineHeight: 1, width: 34, height: 34, borderRadius: 8, cursor: 'pointer', opacity: newSubtask.trim() ? 1 : 0.4, flexShrink: 0 }}>+</button>
                  </div>
                </div>
              </div>

              {/* Jira Description */}
              <div>
                <div style={fl}>Jira Description</div>
                <textarea value={t.description ?? ''} onChange={e => updateItem(current.id, { description: e.target.value })} rows={3} placeholder="Describe the ticket…" style={ta} />
              </div>

              {/* Notes */}
              <div>
                <div style={fl}>Notes</div>
                <textarea value={t.notes} onChange={e => updateItem(current.id, { notes: e.target.value })} rows={5} style={ta} />
              </div>

              {/* Blockers */}
              <div>
                <div style={fl}>Blockers</div>
                <textarea value={t.blockers} onChange={e => updateItem(current.id, { blockers: e.target.value })} rows={3} placeholder="Who can help?" style={ta} />
              </div>

              {/* Custom fields (showInCard) */}
              {customFields.filter(f => f.showInCard).map(f => (
                <div key={f.id}>
                  <div style={fl}>{f.name}</div>
                  <input value={t.customValues?.[f.id] ?? ''} onChange={e => updateItemCustomValue(current.id, f.id, e.target.value)} style={inp} />
                </div>
              ))}
            </div>

            {/* ── Sidebar ── */}
            <div style={{ width: 200, flexShrink: 0, borderLeft: '1px solid var(--t-brd2)', padding: '14px 14px 22px 14px' }}>
            <div style={{ background: 'var(--t-surf2)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={fl}>Requester</div>
                <select value={t.requester} onChange={e => updateItem(current.id, { requester: e.target.value })} style={sel}>
                  <option value="">—</option>
                  {requesters.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div style={fl}>Project</div>
                <select value={t.project} onChange={e => updateItem(current.id, { project: e.target.value })} style={sel}>
                  <option value="">—</option>
                  {projects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {/* ── Jira section ── */}
              {(() => {
                const sInp: React.CSSProperties = { ...inp, flex: 1, fontSize: 13, padding: '7px 9px', borderRadius: 7 };
                return (
                  <div>
                    {/* Section header */}
                    {editingLabel === 'jiraSection'
                      ? <input autoFocus value={labelValue} onChange={e => setLabelValue(e.target.value)}
                          onBlur={() => { updateItem(current.id, { jiraLabel: labelValue.trim() || undefined }); setEditingLabel(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingLabel(null); }}
                          style={{ ...fl, border: 'none', outline: '1px solid var(--t-acc)', borderRadius: 3, padding: '1px 4px', background: 'transparent', width: '100%', marginBottom: 5 }} />
                      : <div style={{ ...fl, cursor: 'text' }} title="Click to rename" onClick={() => { setEditingLabel('jiraSection'); setLabelValue(t.jiraLabel || 'Jira'); }}>{t.jiraLabel || 'Jira'}</div>
                    }
                    {/* Primary ticket */}
                    {editingLabel === 'jiraLink:primary'
                      ? <input autoFocus value={labelValue} onChange={e => setLabelValue(e.target.value)}
                          onBlur={() => { updateItem(current.id, { jiraLinkLabel: labelValue.trim() || undefined }); setEditingLabel(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingLabel(null); }}
                          style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', border: 'none', outline: '1px solid var(--t-acc)', borderRadius: 3, padding: '1px 4px', background: 'transparent', width: '100%', marginBottom: 4 }} />
                      : <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', cursor: 'text', marginBottom: 4 }} title="Click to rename" onClick={() => { setEditingLabel('jiraLink:primary'); setLabelValue(t.jiraLinkLabel || 'Ticket'); }}>{t.jiraLinkLabel || 'Ticket'}</div>
                    }
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                      <input value={t.jiraLink} onChange={e => updateItem(current.id, { jiraLink: e.target.value })} placeholder="PROJ-1234" style={sInp} />
                      {t.jiraLink && <a href={`https://${jiraConfig?.host ?? ''}/browse/${t.jiraLink}`} target="_blank" rel="noreferrer" style={{ fontSize: 16, color: 'var(--t-acc)', textDecoration: 'none', flexShrink: 0 }} title={`Open ${t.jiraLink}`}>↗</a>}
                    </div>
                    {!t.jiraLink && jiraConfig && (
                      <button onClick={handleCreateJira} disabled={creatingJira}
                        style={{ marginBottom: 4, width: '100%', border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 12, fontWeight: 600, padding: '6px 0', borderRadius: 6, cursor: creatingJira ? 'wait' : 'pointer', opacity: creatingJira ? 0.6 : 1 }}>
                        {creatingJira ? 'Creating…' : '+ Create in Jira'}
                      </button>
                    )}
                    {/* Extra tickets */}
                    {t.jiraLink && (t.extraJiraLinks ?? []).map((link, i) => (
                      <div key={i} style={{ marginTop: 6 }}>
                        {editingLabel === `jiraLink:${i}`
                          ? <input autoFocus value={labelValue} onChange={e => setLabelValue(e.target.value)}
                              onBlur={() => { const ls = [...(t.extraJiraLinkLabels ?? [])]; ls[i] = labelValue.trim(); updateItem(current.id, { extraJiraLinkLabels: ls }); setEditingLabel(null); }}
                              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingLabel(null); }}
                              style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', border: 'none', outline: '1px solid var(--t-acc)', borderRadius: 3, padding: '1px 4px', background: 'transparent', width: '100%', marginBottom: 4 }} />
                          : <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', cursor: 'text', marginBottom: 4 }} title="Click to rename" onClick={() => { setEditingLabel(`jiraLink:${i}`); setLabelValue(t.extraJiraLinkLabels?.[i] || `Ticket ${i + 2}`); }}>{t.extraJiraLinkLabels?.[i] || `Ticket ${i + 2}`}</div>
                        }
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input value={link} style={sInp} placeholder="PROJ-1234"
                            onChange={e => { const n = [...(t.extraJiraLinks ?? [])]; n[i] = e.target.value; updateItem(current.id, { extraJiraLinks: n }); }}
                            onBlur={() => { const links = t.extraJiraLinks ?? []; const labels = t.extraJiraLinkLabels ?? []; const pairs = links.map((l, j) => ({ l, lb: labels[j] ?? '' })).filter(p => p.l.trim()); updateItem(current.id, { extraJiraLinks: pairs.map(p => p.l), extraJiraLinkLabels: pairs.map(p => p.lb) }); }} />
                          {link && <a href={`https://${jiraConfig?.host ?? ''}/browse/${link}`} target="_blank" rel="noreferrer" style={{ fontSize: 16, color: 'var(--t-acc)', textDecoration: 'none', flexShrink: 0 }} title={`Open ${link}`}>↗</a>}
                        </div>
                      </div>
                    ))}
                    {t.jiraLink && (
                      <button onClick={() => updateItem(current.id, { extraJiraLinks: [...(t.extraJiraLinks ?? []), ''], extraJiraLinkLabels: [...(t.extraJiraLinkLabels ?? []), ''] })}
                        style={{ marginTop: 8, width: '100%', border: '1px dashed var(--t-brd)', background: 'transparent', color: 'var(--t-muted)', fontSize: 12, fontWeight: 500, padding: '5px 0', borderRadius: 6, cursor: 'pointer' }}>
                        + Add another {t.jiraLabel || 'Jira'}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* ── ITSM section ── */}
              {(() => {
                const sInp: React.CSSProperties = { ...inp, flex: 1, fontSize: 13, padding: '7px 9px', borderRadius: 7 };
                return (
                  <div>
                    {editingLabel === 'itsmSection'
                      ? <input autoFocus value={labelValue} onChange={e => setLabelValue(e.target.value)}
                          onBlur={() => { updateItem(current.id, { itsmLabel: labelValue.trim() || undefined }); setEditingLabel(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingLabel(null); }}
                          style={{ ...fl, border: 'none', outline: '1px solid var(--t-acc)', borderRadius: 3, padding: '1px 4px', background: 'transparent', width: '100%', marginBottom: 5 }} />
                      : <div style={{ ...fl, cursor: 'text' }} title="Click to rename" onClick={() => { setEditingLabel('itsmSection'); setLabelValue(t.itsmLabel || 'ITSM'); }}>{t.itsmLabel || 'ITSM'}</div>
                    }
                    {editingLabel === 'itsmTicket:primary'
                      ? <input autoFocus value={labelValue} onChange={e => setLabelValue(e.target.value)}
                          onBlur={() => { updateItem(current.id, { itsmTicketLabel: labelValue.trim() || undefined }); setEditingLabel(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingLabel(null); }}
                          style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', border: 'none', outline: '1px solid var(--t-acc)', borderRadius: 3, padding: '1px 4px', background: 'transparent', width: '100%', marginBottom: 4 }} />
                      : <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', cursor: 'text', marginBottom: 4 }} title="Click to rename" onClick={() => { setEditingLabel('itsmTicket:primary'); setLabelValue(t.itsmTicketLabel || 'Ticket'); }}>{t.itsmTicketLabel || 'Ticket'}</div>
                    }
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                      <input value={t.itsmTicket ?? ''} onChange={e => updateItem(current.id, { itsmTicket: e.target.value })} placeholder="INC0001234" style={sInp} />
                      {t.itsmTicket && <a href={`https://${itsmConfig?.host ?? ''}/incident.do?sysparm_query=number=${t.itsmTicket}`} target="_blank" rel="noreferrer" style={{ fontSize: 16, color: 'var(--t-acc)', textDecoration: 'none', flexShrink: 0 }} title={`Open ${t.itsmTicket}`}>↗</a>}
                    </div>
                    {t.itsmTicket && (t.extraItsmTickets ?? []).map((ticket, i) => (
                      <div key={i} style={{ marginTop: 6 }}>
                        {editingLabel === `itsmTicket:${i}`
                          ? <input autoFocus value={labelValue} onChange={e => setLabelValue(e.target.value)}
                              onBlur={() => { const ls = [...(t.extraItsmTicketLabels ?? [])]; ls[i] = labelValue.trim(); updateItem(current.id, { extraItsmTicketLabels: ls }); setEditingLabel(null); }}
                              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingLabel(null); }}
                              style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', border: 'none', outline: '1px solid var(--t-acc)', borderRadius: 3, padding: '1px 4px', background: 'transparent', width: '100%', marginBottom: 4 }} />
                          : <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', cursor: 'text', marginBottom: 4 }} title="Click to rename" onClick={() => { setEditingLabel(`itsmTicket:${i}`); setLabelValue(t.extraItsmTicketLabels?.[i] || `Ticket ${i + 2}`); }}>{t.extraItsmTicketLabels?.[i] || `Ticket ${i + 2}`}</div>
                        }
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input value={ticket} style={sInp} placeholder="INC0001234"
                            onChange={e => { const n = [...(t.extraItsmTickets ?? [])]; n[i] = e.target.value; updateItem(current.id, { extraItsmTickets: n }); }}
                            onBlur={() => { const tks = t.extraItsmTickets ?? []; const lbs = t.extraItsmTicketLabels ?? []; const pairs = tks.map((tk, j) => ({ tk, lb: lbs[j] ?? '' })).filter(p => p.tk.trim()); updateItem(current.id, { extraItsmTickets: pairs.map(p => p.tk), extraItsmTicketLabels: pairs.map(p => p.lb) }); }} />
                          {ticket && <a href={`https://${itsmConfig?.host ?? ''}/incident.do?sysparm_query=number=${ticket}`} target="_blank" rel="noreferrer" style={{ fontSize: 16, color: 'var(--t-acc)', textDecoration: 'none', flexShrink: 0 }} title={`Open ${ticket}`}>↗</a>}
                        </div>
                      </div>
                    ))}
                    {t.itsmTicket && (
                      <button onClick={() => updateItem(current.id, { extraItsmTickets: [...(t.extraItsmTickets ?? []), ''], extraItsmTicketLabels: [...(t.extraItsmTicketLabels ?? []), ''] })}
                        style={{ marginTop: 8, width: '100%', border: '1px dashed var(--t-brd)', background: 'transparent', color: 'var(--t-muted)', fontSize: 12, fontWeight: 500, padding: '5px 0', borderRadius: 6, cursor: 'pointer' }}>
                        + Add another {t.itsmLabel || 'ITSM'}
                      </button>
                    )}
                  </div>
                );
              })()}

              {(() => {
                const sInp: React.CSSProperties = { ...inp, flex: 1, fontSize: 13, padding: '7px 9px', borderRadius: 7 };
                const ticketLblSt: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'text', marginBottom: 4 };
                const ticketLblEdSt: React.CSSProperties = { ...ticketLblSt, border: 'none', outline: '1px solid var(--t-acc)', borderRadius: 3, padding: '1px 4px', background: 'transparent', width: '100%' };
                return (
                  <div>
                    {/* Section header */}
                    {editingLabel === 'generalLink'
                      ? <input autoFocus value={labelValue} onChange={e => setLabelValue(e.target.value)}
                          onBlur={() => { updateItem(current.id, { generalLinkLabel: labelValue.trim() || undefined }); setEditingLabel(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingLabel(null); }}
                          style={{ ...fl, border: 'none', outline: '1px solid var(--t-acc)', borderRadius: 3, padding: '1px 4px', background: 'transparent', width: '100%', marginBottom: 5 }} />
                      : <div style={{ ...fl, cursor: 'text' }} title="Click to rename" onClick={() => { setEditingLabel('generalLink'); setLabelValue(t.generalLinkLabel || 'General link'); }}>{t.generalLinkLabel || 'General link'}</div>
                    }
                    {/* Primary link */}
                    {editingLabel === 'generalLink:primary'
                      ? <input autoFocus value={labelValue} onChange={e => setLabelValue(e.target.value)}
                          onBlur={() => { updateItem(current.id, {}); setEditingLabel(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingLabel(null); }}
                          style={ticketLblEdSt} />
                      : <div style={ticketLblSt} title="Click to rename" onClick={() => { setEditingLabel('generalLink:primary'); setLabelValue('Link'); }}>Link</div>
                    }
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                      <input value={t.generalLink} onChange={e => updateItem(current.id, { generalLink: e.target.value })} placeholder="Any URL or ref" style={sInp} />
                      {t.generalLink && <a href={t.generalLink.startsWith('http') ? t.generalLink : `https://${t.generalLink}`} target="_blank" rel="noreferrer" style={{ fontSize: 16, color: 'var(--t-acc)', textDecoration: 'none', flexShrink: 0 }} title="Open link">↗</a>}
                    </div>
                    {/* Extra links */}
                    {(t.extraGeneralLinks ?? []).map((link, i) => (
                      <div key={i} style={{ marginTop: 6 }}>
                        {editingLabel === `generalLink:${i}`
                          ? <input autoFocus value={labelValue} onChange={e => setLabelValue(e.target.value)}
                              onBlur={() => { const ls = [...(t.extraGeneralLinkLabels ?? [])]; ls[i] = labelValue.trim(); updateItem(current.id, { extraGeneralLinkLabels: ls }); setEditingLabel(null); }}
                              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingLabel(null); }}
                              style={ticketLblEdSt} />
                          : <div style={ticketLblSt} title="Click to rename" onClick={() => { setEditingLabel(`generalLink:${i}`); setLabelValue(t.extraGeneralLinkLabels?.[i] || `Link ${i + 2}`); }}>{t.extraGeneralLinkLabels?.[i] || `Link ${i + 2}`}</div>
                        }
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input value={link} style={sInp} placeholder="Any URL or ref"
                            onChange={e => { const n = [...(t.extraGeneralLinks ?? [])]; n[i] = e.target.value; updateItem(current.id, { extraGeneralLinks: n }); }}
                            onBlur={() => { const links = t.extraGeneralLinks ?? []; const labels = t.extraGeneralLinkLabels ?? []; const pairs = links.map((l, j) => ({ l, lb: labels[j] ?? '' })).filter(p => p.l.trim()); updateItem(current.id, { extraGeneralLinks: pairs.map(p => p.l), extraGeneralLinkLabels: pairs.map(p => p.lb) }); }} />
                          {link && <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noreferrer" style={{ fontSize: 16, color: 'var(--t-acc)', textDecoration: 'none', flexShrink: 0 }} title="Open link">↗</a>}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => updateItem(current.id, { extraGeneralLinks: [...(t.extraGeneralLinks ?? []), ''], extraGeneralLinkLabels: [...(t.extraGeneralLinkLabels ?? []), ''] })}
                      style={{ marginTop: 8, width: '100%', border: '1px dashed var(--t-brd)', background: 'transparent', color: 'var(--t-muted)', fontSize: 12, fontWeight: 500, padding: '5px 0', borderRadius: 6, cursor: 'pointer' }}>
                      + Add another {t.generalLinkLabel || 'link'}
                    </button>
                  </div>
                );
              })()}
            </div>
            </div>

          </div>
        )}

        {isReminder && (
          <div style={{ padding: '6px 26px 26px', fontSize: 15, color: 'var(--t-txt2)' }}>
            Scheduled: {formatSchedule(current.schedule)}
          </div>
        )}
        {isResponsibility && (
          <div style={{ padding: '6px 26px 26px', fontSize: 15, color: 'var(--t-txt2)' }}>
            Cadence: {formatSchedule(current.schedule)}
          </div>
        )}

      </div>

      {subtaskPanel && (
        <SubtaskPanel
          parentId={subtaskPanel.parentId}
          subId={subtaskPanel.subId}
          onClose={() => setSubtaskPanel(null)}
          onExpand={() => { setFullPageSubtask(subtaskPanel); setSubtaskPanel(null); }}
        />
      )}

      {/* Fixed bottom bar: search + action buttons */}
      <div style={{
        position: 'fixed', bottom: 0, left: sidebarCollapsed ? 44 : 220, right: 0,
        transition: 'left 0.15s ease',
        background: 'var(--t-surf)', borderTop: '1px solid var(--t-brd)', zIndex: 40,
        padding: '0 36px',
      }}>
        {/* Hold panel — expands above the bar */}
        {holdOpen && current && (
          <div style={{ padding: '14px 0 10px', borderBottom: '1px solid var(--t-brd)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-txt)' }}>{holdPanelLabel}</div>
            <SchedulePicker value={holdSchedule} onChange={setHoldSchedule} allowRecurring={isReminder} />
            {!isReminder && (
              <input value={holdNote} onChange={e => setHoldNote(e.target.value)} placeholder="What are you waiting for?" style={{ fontSize: 14, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)' }} />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleHoldConfirm} disabled={holdConfirmDisabled}
                style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 7, opacity: holdConfirmDisabled ? 0.5 : 1, cursor: holdConfirmDisabled ? 'not-allowed' : 'pointer' }}>
                Confirm
              </button>
              <button onClick={() => { setHoldOpen(false); setHoldNote(''); setHoldSchedule(null); }}
                style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 7, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search + action buttons row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
          <div style={{ flex: 1 }}>
            <SearchBar onPin={handlePin} onQuickCreate={handleQuickCreate} inputRef={searchRef} />
          </div>
          {current && (
            <>
              <button onClick={handleContinue} disabled={queue.length <= 1}
                style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', fontSize: 14, fontWeight: 600, padding: '11px 18px', borderRadius: 9, opacity: queue.length <= 1 ? 0.4 : 1, cursor: queue.length <= 1 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                Continue
              </button>
              <button onClick={() => { setHoldOpen(o => !o); setHoldNote(''); setHoldSchedule(null); }}
                style={{ border: '1px solid var(--t-brd)', background: holdOpen ? 'var(--t-surf2)' : 'var(--t-surf)', color: 'var(--t-txt)', fontSize: 14, fontWeight: 600, padding: '11px 18px', borderRadius: 9, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {holdButtonLabel}
              </button>
              <button onClick={handleComplete}
                style={{ border: 'none', background: 'var(--t-success)', color: 'white', fontSize: 14, fontWeight: 600, padding: '11px 20px', borderRadius: 9, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {completeLabel}
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
