import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import { useLogMount } from '../../useLogMount';
import { scoreItem, duplicateTask } from '../../engine';
import { EstimatesSection } from '../Common/EstimatesSection';
import { WaitingForSection } from '../Common/WaitingForSection';
import { QuickToActSection } from '../Common/QuickToActSection';
import { CommunicationSection, getCommunications } from '../Common/CommunicationSection';
import { ResizableTextarea } from '../Common/ResizableTextarea';
import { TaskModal } from '../TaskModal/TaskModal';
import { formatSchedule } from '../../scheduleEngine';
import type { Item, Task, Subtask, ScheduleSpec } from '../../types';
import { SubtaskPanel } from '../SubtaskPanel/SubtaskPanel';
import { SubtaskFullPage } from '../SubtaskPanel/SubtaskFullPage';
import { SchedulePicker } from '../SchedulePicker/SchedulePicker';
import { TicketSections } from '../Common/TicketSections';

interface Props {
  onToast: (msg: string) => void;
}

export function CardFeed({ onToast }: Props) {
  useLogMount('CardFeed');
  const items = useStore(s => s.items);
  const requesters = useStore(s => s.requesters);
  const projects = useStore(s => s.projects);

  // displayId and triggerTagForId live in the store so they survive page refresh
  const displayId = useStore(s => s.displayId);
  const setDisplayId = useStore(s => s.setDisplayId);
  const triggerTagForId = useStore(s => s.triggerTagForId);
  const setTriggerTagForId = useStore(s => s.setTriggerTagForId);

  const customFields = useStore(s => s.customFields);
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

  const [subDragId, setSubDragId] = useState<string | null>(null);
  const [subDragOverId, setSubDragOverId] = useState<string | null>(null);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubTitle, setEditingSubTitle] = useState('');
  const updateSubtask = useStore(s => s.updateSubtask);
  const [holdOpen, setHoldOpen] = useState(false);
  const [cardMenuOpen, setCardMenuOpen] = useState(false);
  const cardMenuRef = useRef<HTMLDivElement>(null);
  const prevHadSubtask = useRef(false);
  const [holdSchedule, setHoldSchedule] = useState<ScheduleSpec | null>(null);
  const [subtaskPanel, setSubtaskPanel] = useState<{ parentId: string; subId: string } | null>(null);
  // Ids of subtasks that just gained/lost the star — they get the rise/drop
  // animation for one render cycle. Without the "just" tracking, the banner
  // would animate on every card open and refresh, not only on star changes.
  const [justStarred, setJustStarred] = useState<string | null>(null);
  const [justUnstarred, setJustUnstarred] = useState<string | null>(null);
  function markStarred(id: string | undefined) {
    if (!id) return;
    setJustStarred(id);
    setTimeout(() => setJustStarred(cur => (cur === id ? null : cur)), 400);
  }
  function markUnstarred(id: string | undefined) {
    if (!id) return;
    setJustUnstarred(id);
    setTimeout(() => setJustUnstarred(cur => (cur === id ? null : cur)), 400);
  }
  const [fullPageSubtask, setFullPageSubtask] = useState<{ parentId: string; subId: string } | null>(null);
  const [tagModalTaskId, setTagModalTaskId] = useState<string | null>(null);
  // Subtask list collapsing: show up to 3 open subtasks; overflow and
  // completed ones sit behind their own chevron toggles. Reset per card.
  const [showAllSubs, setShowAllSubs] = useState(false);
  const [showDoneSubs, setShowDoneSubs] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [tagEditMode, setTagEditMode] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const autoResizeTitle = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  // Queue matches table order exactly: today-filter → today→manual→score.
  // The feed is task-only — reminders pop up via ReminderPopup when due.
  //
  // Visibility (processed in this order, later rules override earlier ones):
  //   1. forToday alone would show it in the feed
  //   2. status='waiting' (held) hides it — Hold wins over Today
  //   3. Toggling forToday clears the hold (setForToday store action),
  //      so once un-held the task shows normally per rule 1
  // priorityBoost still surfaces a manually-resumed held task at the top.
  const activeItems = items.filter(it => {
    if (it.archived) return false;
    if (it.kind !== 'task') return false;
    const t = it as Task;
    return t.status !== 'done' && t.status !== 'archived' &&
           (t.status !== 'waiting' || it.priorityBoost);
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

  // Collapse subtask overflow/completed again when switching cards.
  useEffect(() => {
    setShowAllSubs(false);
    setShowDoneSubs(false);
  }, [displayItem?.id]);
  const current = displayItem;

  // Only clear displayId when the item is deleted entirely — not when it's just outside the queue
  useEffect(() => {
    if (tagEditMode) return;
    if (displayId && !items.find(it => it.id === displayId)) setDisplayId(null);
  }, [items.map(it => it.id).join(','), tagEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the queue changes (e.g., a task is marked forToday and scope narrows
  // to today-only), snap to queue[0] if the current displayId is out of queue.
  // Without this, marking new today tasks doesn't update the shown card —
  // the user sees their old pinned card indefinitely.
  // Skip the first render so URL-restored displayId (e.g. deep link to a
  // specific task) isn't immediately overridden.
  const queueSyncedOnce = useRef(false);
  useEffect(() => {
    if (!queueSyncedOnce.current) { queueSyncedOnce.current = true; return; }
    if (tagEditMode) return;
    if (!displayId) return;
    if (queue.length === 0) return;
    if (!queue.some(it => it.id === displayId)) setDisplayId(null);
  }, [queue.map(it => it.id).join(','), tagEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // URL scheme: #feed/taskId/sub/subId  → panel
  //             #feed/taskId/full/subId → full-page (persists across refresh)
  useEffect(() => {
    const parts = window.location.hash.slice(1).split('/');
    if (parts[0] !== 'feed') return;
    if (parts[1]) {
      setDisplayId(parts[1]);
      if (parts[3]) {
        if (parts[2] === 'full') setFullPageSubtask({ parentId: parts[1], subId: parts[3] });
        else if (parts[2] === 'sub') setSubtaskPanel({ parentId: parts[1], subId: parts[3] });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Back/forward within feed: restore card/subtask from URL
  useEffect(() => {
    function onHashChange() {
      const parts = window.location.hash.slice(1).split('/');
      if (parts[0] !== 'feed') return;
      setDisplayId(parts[1] || null);
      if (parts[1] && parts[3]) {
        if (parts[2] === 'full') { setFullPageSubtask({ parentId: parts[1], subId: parts[3] }); setSubtaskPanel(null); }
        else if (parts[2] === 'sub') { setSubtaskPanel({ parentId: parts[1], subId: parts[3] }); setFullPageSubtask(null); }
      } else {
        setSubtaskPanel(null);
        setFullPageSubtask(null);
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // State → URL: full-page uses 'full' segment, panel uses 'sub'
  useEffect(() => {
    if (window.location.hash.slice(1).split('/')[0] !== 'feed') return;
    let hash = 'feed';
    if (fullPageSubtask) hash = `feed/${fullPageSubtask.parentId}/full/${fullPageSubtask.subId}`;
    else if (subtaskPanel) hash = `feed/${subtaskPanel.parentId}/sub/${subtaskPanel.subId}`;
    else if (displayId) hash = `feed/${displayId}`;

    if (window.location.hash.slice(1) !== hash) {
      const opening = (!!fullPageSubtask || !!subtaskPanel) && !prevHadSubtask.current;
      if (opening) history.pushState(null, '', '#' + hash);
      else history.replaceState(null, '', '#' + hash);
    }
    prevHadSubtask.current = !!(fullPageSubtask || subtaskPanel);
  }, [displayId, subtaskPanel, fullPageSubtask]);

  const handleContinue = useCallback(() => {
    if (!current || queue.length <= 1) return;
    continueItem(current.id);
    setTagEditMode(false);
    setHoldOpen(false);
    const idx = queue.findIndex(it => it.id === current.id);
    setDisplayId(queue[(idx + 1) % queue.length].id);
  }, [current, queue, continueItem, setDisplayId]);

  const handleBack = useCallback(() => {
    if (!current || queue.length <= 1) return;
    const idx = queue.findIndex(it => it.id === current.id);
    setDisplayId(queue[(idx - 1 + queue.length) % queue.length].id);
  }, [current, queue, setDisplayId]);

  // Enter → Continue, Shift+Enter → go back (when no input/textarea is focused)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (e.shiftKey) handleBack();
      else handleContinue();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleContinue, handleBack]);

  const handleHoldConfirm = () => {
    if (!current) return;
    if (current.kind === 'reminder') {
      if (!holdSchedule) return;
      rescheduleReminder(current.id, holdSchedule);
      onToast('Reminder rescheduled');
    } else {
      holdItem(current.id, '', holdSchedule ?? undefined);
      onToast('Moved to Waiting');
    }
    setDisplayId(null);
    setTagEditMode(false);
    setHoldOpen(false);
    setHoldSchedule(null);
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

  function handleCardDuplicate() {
    if (!current || current.kind !== 'task') return;
    const dup = duplicateTask(current as Task);
    createItem(dup);
    setCardMenuOpen(false);
    onToast('Duplicated');
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
  const t = isTask ? (current as Task) : null;

  // Tag-sweep banner
  const needsTagCount = (activeItems.filter(it => it.kind === 'task') as Task[])
    .filter(it => !it.urgent && !it.important && !it.quick && !it.noTag).length;
  const queueTier: 'needsTag' | 'scored' =
    needsTagCount > 0 ? 'needsTag' : 'scored';

  const kindLabel = isTask ? 'TASK' : 'REMINDER';
  const holdButtonLabel = isReminder ? 'Remind me again' : 'Hold';
  const holdPanelLabel = isReminder ? 'Schedule next reminder' : 'When should this come back?';
  const completeLabel = 'Complete';
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
        {/* Tier banner — click to open the FIRST task that needs tagging in a
            popup (which may be a different task than the one currently shown). */}
        {isTask && queueTier === 'needsTag' && (() => {
          const nextNeedsTag = (activeItems.filter(it => it.kind === 'task') as Task[])
            .find(it => !it.urgent && !it.important && !it.quick && !it.noTag);
          return (
            <div
              onClick={() => { if (nextNeedsTag) setTagModalTaskId(nextNeedsTag.id); }}
              title="Click to tag the next untagged task"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 20px', background: 'var(--t-amber-bg)', borderBottom: '1px solid var(--t-amber-brd)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'oklch(0.9 0.06 85)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--t-amber-bg)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 13 }}>🏷</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-amber)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tag sweep</span>
                <span style={{ fontSize: 12, color: 'var(--t-amber)' }}>
                  — click to tag{nextNeedsTag ? `: ${nextNeedsTag.title}` : ''}
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-amber)', background: 'var(--t-amber-bg)', padding: '2px 8px', borderRadius: 20 }}>
                {needsTagCount} left
              </span>
            </div>
          );
        })()}

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
                    {isTask && (
                      <button onClick={handleCardDuplicate}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', background: 'transparent', fontSize: 14, color: 'var(--t-txt)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-surf2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        ⧉ Duplicate
                      </button>
                    )}
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

            {/* ── Main column ── minWidth 0 lets it shrink below its content
                width, so a long task/subtask name can't push the fixed-width
                sidebar (Requester/Jira/…) out of the card. */}
            <div style={{ flex: 1, minWidth: 0, padding: '14px 20px 22px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>

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
              <div data-review-target="subtasks">
                <div style={{ ...fl, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>Subtasks {t.subtasks.length > 0 && `(${t.subtasks.filter(s => s.done).length}/${t.subtasks.length})`}</span>
                  {(() => {
                    const openCount = t.subtasks.filter(s => !s.done && !s.isNext).length;
                    const doneCount = t.subtasks.filter(s => s.done).length;
                    const hdrBtn: React.CSSProperties = { border: 'none', background: 'transparent', color: 'var(--t-muted)', fontSize: 11.5, fontWeight: 600, padding: '1px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, textTransform: 'none', letterSpacing: 'normal' };
                    const chev = (on: boolean): React.CSSProperties => ({ display: 'inline-block', transform: on ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', fontSize: 11, lineHeight: 1 });
                    return (
                      <>
                        {openCount > 3 && (
                          <button onClick={() => setShowAllSubs(v => !v)} style={hdrBtn}>
                            <span style={chev(showAllSubs)}>›</span>
                            {showAllSubs ? 'Show less' : `${openCount - 3} more`}
                          </button>
                        )}
                        {doneCount > 0 && (
                          <button onClick={() => setShowDoneSubs(v => !v)} style={hdrBtn}>
                            <span style={chev(showDoneSubs)}>›</span>
                            {showDoneSubs ? 'Hide completed' : `${doneCount} completed`}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
                {/* Starred ("next up") subtasks get their own highlighted spot
                    above the list; unstarring drops them back into it. */}
                {t.subtasks.filter(s => s.isNext && !s.done).length > 0 && (
                  <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {t.subtasks.filter(s => s.isNext && !s.done).map(sub => (
                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', border: '1.5px solid var(--t-amber-brd)', borderRadius: 9, background: 'var(--t-amber-bg)', animation: justStarred === sub.id ? 'starRise 0.28s ease' : undefined }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-amber)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>★ Next up</span>
                        <input type="checkbox" checked={sub.done} onChange={() => toggleSubtaskDone(current.id, sub.id)} onClick={e => e.stopPropagation()} style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-txt)', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.title}</span>
                        <div onClick={() => setSubtaskPanel({ parentId: current.id, subId: sub.id })}
                          title="Open subtask details"
                          style={{ flex: 1, minWidth: 48, cursor: 'pointer', alignSelf: 'stretch' }} />
                        <div onClick={() => updateSubtask(current.id, sub.id, { isQuick: !sub.isQuick })} style={{ cursor: 'pointer', fontSize: 14, color: sub.isQuick ? 'oklch(0.55 0.16 250)' : 'var(--t-brd)', userSelect: 'none', flexShrink: 0 }} title="Quick to act">◷</div>
                        <div onClick={() => { markUnstarred(sub.id); toggleSubtaskNext(current.id, sub.id); }} style={{ cursor: 'pointer', fontSize: 15, color: 'var(--t-amber)', userSelect: 'none', flexShrink: 0 }} title="Unstar — return to the list">★</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(() => {
                    const renderSubRow = (sub: Subtask) => {
                    const isDragging = subDragId === sub.id;
                    const isOver = subDragOverId === sub.id;
                    return (
                      <div key={sub.id}
                        draggable
                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setSubDragId(sub.id); }}
                        onDragOver={e => { e.preventDefault(); if (sub.id !== subDragId) setSubDragOverId(sub.id); }}
                        onDrop={e => {
                          e.preventDefault();
                          if (!subDragId || subDragId === sub.id) return;
                          const subs = [...t.subtasks];
                          const from = subs.findIndex(s => s.id === subDragId);
                          const to = subs.findIndex(s => s.id === sub.id);
                          const [moved] = subs.splice(from, 1);
                          subs.splice(to > from ? to - 1 : to, 0, moved);
                          updateItem(current.id, { subtasks: subs });
                          setSubDragId(null); setSubDragOverId(null);
                        }}
                        onDragEnd={() => { setSubDragId(null); setSubDragOverId(null); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--t-brd2)', borderRadius: 9, background: 'var(--t-surf2)', opacity: isDragging ? 0.4 : 1, borderTop: isOver ? '2px solid var(--t-acc)' : undefined, cursor: 'grab', animation: justUnstarred === sub.id ? 'starDrop 0.28s ease' : undefined }}>
                        <span style={{ fontSize: 14, color: 'var(--t-brd)', flexShrink: 0, userSelect: 'none' }}>⠿</span>
                        <input type="checkbox" checked={sub.done} onChange={() => toggleSubtaskDone(current.id, sub.id)} onClick={e => e.stopPropagation()} style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                        {editingSubId === sub.id ? (
                          <input autoFocus value={editingSubTitle}
                            size={Math.max(editingSubTitle.length + 2, 8)}
                            onChange={e => setEditingSubTitle(e.target.value)}
                            onBlur={() => {
                              const v = editingSubTitle.trim();
                              if (v && v !== sub.title) updateSubtask(current.id, sub.id, { title: v });
                              setEditingSubId(null);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.currentTarget.blur(); }
                              if (e.key === 'Escape') setEditingSubId(null);
                            }}
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: 14, padding: '3px 6px', border: '1px solid var(--t-acc)', borderRadius: 4, background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none' }} />
                        ) : (
                          <span onClick={() => { setEditingSubId(sub.id); setEditingSubTitle(sub.title); }}
                            title="Click to rename"
                            style={{ fontSize: 14, cursor: 'text', textDecoration: sub.done ? 'line-through' : 'none', color: sub.done ? 'var(--t-muted)' : 'var(--t-txt)', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.title}</span>
                        )}
                        {/* Click-to-open area — minWidth keeps it clickable even
                            when the title is long (title truncates instead). */}
                        <div onClick={() => setSubtaskPanel({ parentId: current.id, subId: sub.id })}
                          title="Open subtask details"
                          style={{ flex: 1, minWidth: 48, cursor: 'pointer', alignSelf: 'stretch' }} />
                        <div onClick={() => updateSubtask(current.id, sub.id, { isQuick: !sub.isQuick })} style={{ cursor: 'pointer', fontSize: 14, color: sub.isQuick ? 'oklch(0.55 0.16 250)' : 'var(--t-brd)', userSelect: 'none', flexShrink: 0 }} title="Quick to act">◷</div>
                        <div onClick={() => {
                          // Starring this one displaces the current starred
                          // subtask — mark both so only they animate.
                          if (!sub.isNext) {
                            markStarred(sub.id);
                            markUnstarred(t.subtasks.find(s => s.isNext && !s.done)?.id);
                          }
                          toggleSubtaskNext(current.id, sub.id);
                        }} style={{ cursor: 'pointer', fontSize: 15, color: sub.isNext ? 'var(--t-amber)' : 'var(--t-brd)', userSelect: 'none', flexShrink: 0 }} title="Next up">★</div>
                        <div onClick={() => deleteSubtask(current.id, sub.id)} style={{ cursor: 'pointer', fontSize: 14, color: 'var(--t-muted)', userSelect: 'none', flexShrink: 0 }} title="Remove">×</div>
                      </div>
                    );
                    };

                    const openSubs = t.subtasks.filter(s => !s.done && !s.isNext);
                    const doneSubs = t.subtasks.filter(s => s.done);
                    const visible = showAllSubs ? openSubs : openSubs.slice(0, 3);
                    return (
                      <>
                        {visible.map(renderSubRow)}
                        {showDoneSubs && doneSubs.map(renderSubRow)}
                      </>
                    );
                  })()}
                  {/* Bottom drop zone — lets the last subtask be reachable */}
                  {subDragId && (
                    <div
                      onDragOver={e => { e.preventDefault(); setSubDragOverId('__bottom__'); }}
                      onDragLeave={() => setSubDragOverId(null)}
                      onDrop={e => {
                        e.preventDefault();
                        if (!subDragId) return;
                        const subs = [...t.subtasks];
                        const from = subs.findIndex(s => s.id === subDragId);
                        const [moved] = subs.splice(from, 1);
                        subs.push(moved);
                        updateItem(current.id, { subtasks: subs });
                        setSubDragId(null); setSubDragOverId(null);
                      }}
                      style={{ height: 20, borderTop: subDragOverId === '__bottom__' ? '2px solid var(--t-acc)' : '2px solid transparent' }}
                    />
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newSubtask.trim()) { addSubtask(current.id, newSubtask.trim(), { isQuick: e.shiftKey }); setNewSubtask(''); } if (e.key === 'Escape') setNewSubtask(''); }}
                      title="Enter adds · Shift+Enter adds as quick-to-act"
                      placeholder="Add subtask…" style={{ ...inp, flex: 1 }} />
                    <button onClick={() => { if (newSubtask.trim()) { addSubtask(current.id, newSubtask.trim()); setNewSubtask(''); } }} disabled={!newSubtask.trim()}
                      title="Add subtask (Enter)"
                      style={{ border: 'none', background: 'oklch(0.6 0.14 150)', color: 'white', fontSize: 18, lineHeight: 1, width: 34, height: 34, borderRadius: 8, cursor: 'pointer', opacity: newSubtask.trim() ? 1 : 0.4, flexShrink: 0 }}>+</button>
                    <button onClick={() => { if (newSubtask.trim()) { addSubtask(current.id, newSubtask.trim(), { isQuick: true }); setNewSubtask(''); } }} disabled={!newSubtask.trim()}
                      title="Add as quick to act (Shift+Enter)"
                      style={{ border: 'none', background: 'oklch(0.55 0.16 250)', color: 'white', fontSize: 15, lineHeight: 1, width: 34, height: 34, borderRadius: 8, cursor: 'pointer', opacity: newSubtask.trim() ? 1 : 0.4, flexShrink: 0 }}>◷</button>
                  </div>
                </div>
              </div>

              {/* Quick to Act — view of isQuick subtasks */}
              <QuickToActSection task={t} />

              {/* Notes */}
              <div>
                <div style={fl}>Notes</div>
                <ResizableTextarea taskId={current.id} fieldKey="notes" value={t.notes} onChange={e => updateItem(current.id, { notes: e.target.value })} rows={5} style={ta} />
              </div>

              {/* Blockers */}
              <div>
                <div style={fl}>Blockers</div>
                <ResizableTextarea taskId={current.id} fieldKey="blockers" value={t.blockers} onChange={e => updateItem(current.id, { blockers: e.target.value })} rows={3} placeholder="Who can help?" style={ta} />
              </div>

              {/* Communication */}
              <CommunicationSection taskId={current.id} task={t} fields={getCommunications(t.communications)} />

              {/* Waiting for (collapsible) */}
              <WaitingForSection task={t} />

              {/* Estimates (collapsible) */}
              <EstimatesSection task={t} />

              {/* Custom fields (showInCard) */}
              {customFields.filter(f => f.showInCard).map(f => (
                <div key={f.id}>
                  <div style={fl}>{f.name}</div>
                  <ResizableTextarea taskId={current.id} fieldKey={`cf:${f.id}`} value={t.customValues?.[f.id] ?? ''} onChange={e => updateItemCustomValue(current.id, f.id, e.target.value)} rows={3} style={ta} />
                </div>
              ))}
            </div>

            {/* ── Sidebar ── */}
            <div style={{ width: 200, flexShrink: 0, borderLeft: '1px solid var(--t-brd2)', padding: '14px 14px 22px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              {/* Jira / ITSM / Link sections — shared with the task popup */}
              <TicketSections task={t} onToast={onToast} />
            </div>
            </div>

          </div>
        )}

        {isReminder && (
          <div style={{ padding: '6px 26px 26px', fontSize: 15, color: 'var(--t-txt2)' }}>
            Scheduled: {formatSchedule(current.schedule)}
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

      {tagModalTaskId && (
        <TaskModal
          taskId={tagModalTaskId}
          onClose={() => setTagModalTaskId(null)}
          urlDriven={false}
        />
      )}

      {/* Fixed bottom bar: search + action buttons */}
      <div style={{
        position: 'fixed', bottom: 0, left: sidebarCollapsed ? 44 : 220, right: 0,
        transition: 'left 0.15s ease',
        background: 'color-mix(in oklab, var(--t-surf) 82%, transparent)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderTop: '1px solid var(--t-brd2)', zIndex: 40,
        padding: '0 36px',
      }}>
        {/* Hold panel — expands above the bar */}
        {holdOpen && current && (
          <div style={{ padding: '14px 0 10px', borderBottom: '1px solid var(--t-brd)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-txt)' }}>{holdPanelLabel}</div>
            <SchedulePicker value={holdSchedule} onChange={setHoldSchedule} allowRecurring={isReminder} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleHoldConfirm} disabled={holdConfirmDisabled}
                style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 7, opacity: holdConfirmDisabled ? 0.5 : 1, cursor: holdConfirmDisabled ? 'not-allowed' : 'pointer' }}>
                Confirm
              </button>
              <button onClick={() => { setHoldOpen(false); setHoldSchedule(null); }}
                style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 7, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Transport row — thin frosted light strip, minimal icon buttons,
            green play circle center */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '5px 0', minHeight: 44 }}>
          {current && (() => {
            const ghost: React.CSSProperties = { width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--t-muted)', lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'color 0.1s, background 0.1s' };
            const hover = {
              onMouseEnter: (e: React.MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--t-txt)'; el.style.background = 'var(--t-surf2)'; },
              onMouseLeave: (e: React.MouseEvent) => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--t-muted)'; el.style.background = 'transparent'; },
            };
            return (
              <>
                <button onClick={handleBack} disabled={queue.length <= 1} title="Previous card (Shift+Enter)" {...hover}
                  style={{ ...ghost, fontSize: 16, opacity: queue.length <= 1 ? 0.35 : 1, cursor: queue.length <= 1 ? 'default' : 'pointer' }}>←</button>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button onClick={() => { setHoldOpen(o => !o); setHoldSchedule(null); }} title={holdButtonLabel} {...hover}
                    style={{ ...ghost, fontSize: 14, ...(holdOpen ? { color: 'var(--t-txt)', background: 'var(--t-surf2)' } : {}) }}>⏸</button>
                  {current.kind === 'task' && (
                    <button onClick={() => { window.location.hash = `play/${current.id}`; }} title="Play — focus on the next step"
                      style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--t-success)', color: 'white', fontSize: 12.5, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, boxShadow: '0 2px 8px color-mix(in oklab, var(--t-success) 40%, transparent)' }}>
                      <span style={{ transform: 'translateX(1px)', display: 'block' }}>▶</span></button>
                  )}
                  <button onClick={handleComplete} title={completeLabel} {...hover}
                    style={{ ...ghost, fontSize: 15 }}>🎉</button>
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={handleContinue} disabled={queue.length <= 1} title="Continue (Enter)" {...hover}
                  style={{ ...ghost, fontSize: 16, opacity: queue.length <= 1 ? 0.35 : 1, cursor: queue.length <= 1 ? 'default' : 'pointer' }}>→</button>
              </>
            );
          })()}
        </div>
      </div>

    </div>
  );
}
