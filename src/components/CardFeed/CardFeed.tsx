import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import { buildQueue, scoreItem, nextId } from '../../engine';
import { formatSchedule } from '../../scheduleEngine';
import type { Task, ScheduleSpec } from '../../types';
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
  const snoozesToday = useStore(s => s.snoozesToday);
  const snoozeLimit = useStore(s => s.snoozeLimit);
  const requesters = useStore(s => s.requesters);
  const projects = useStore(s => s.projects);

  // displayId and triggerTagForId live in the store so they survive page refresh
  const displayId = useStore(s => s.displayId);
  const setDisplayId = useStore(s => s.setDisplayId);
  const triggerTagForId = useStore(s => s.triggerTagForId);
  const setTriggerTagForId = useStore(s => s.setTriggerTagForId);

  const customFields = useStore(s => s.customFields);
  const jiraConfig = useStore(s => s.jiraConfig);
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
  const snoozeItem = useStore(s => s.snoozeItem);
  const completeItem = useStore(s => s.completeItem);
  const createItem = useStore(s => s.createItem);

  const [creatingJira, setCreatingJira] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
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

  const queue = buildQueue(items);

  // If displayId has left the queue (completed/archived/held), fall back to queue[0].
  const displayItem = queue.find(it => it.id === displayId) ?? queue[0] ?? null;
  const current = displayItem;

  useEffect(() => {
    if (queue.length === 0) { setDisplayId(null); return; }
    // Don't clear displayId while editing tags — queue rebuilds but we stay pinned
    if (tagEditMode) return;
    if (displayId && !queue.find(it => it.id === displayId)) setDisplayId(null);
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
        setTagEditMode(true);
      }
    }
  }, [current?.id]);

  // Focus search bar when triggered from outside (cmd+f)
  useEffect(() => {
    if (!focusSearchTrigger) return;
    searchRef.current?.focus();
  }, [focusSearchTrigger]);

  // Score groups derived from the current queue (scores sorted high→low, deduplicated)
  const scoreGroups = [...new Set(queue.map(it => scoreItem(it)))].sort((a, b) => b - a);
  const currentScore = current ? scoreItem(current) : 0;
  const sameScoreGroup = queue.filter(it => scoreItem(it) === currentScore);

  const handleContinue = () => {
    if (!current || sameScoreGroup.length <= 1) return;
    continueItem(current.id);
    setTagEditMode(false);
    setHoldOpen(false);
    const idx = sameScoreGroup.findIndex(it => it.id === current.id);
    const next = sameScoreGroup[(idx + 1) % sameScoreGroup.length];
    setDisplayId(next.id);
  };

  const handleMoveOn = () => {
    if (!current || scoreGroups.length <= 1) return;
    setTagEditMode(false);
    setHoldOpen(false);
    const groupIdx = scoreGroups.indexOf(currentScore);
    const nextScore = scoreGroups[(groupIdx + 1) % scoreGroups.length];
    const nextGroup = queue.filter(it => scoreItem(it) === nextScore);
    setDisplayId(nextGroup[0].id);
  };

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
    // Pin whatever is currently showing BEFORE the new task enters the queue,
    // otherwise it jumps to queue[0] and displaces the card the user is on.
    if (current) setDisplayId(current.id);

    const now = Date.now();
    const id = nextId('t');
    createItem({
      id, kind: 'task', title, description: '', notes: '', blockers: '', generalLink: '', jiraLink: '',
      requester: '', project: '', status: 'backlog', forToday: false,
      urgent: false, important: false, quick: false, noTag: false,
      toCheck: '', priorityBoost: false, subtasks: [],
      bumpedAt: 0, staleness: 0, createdAt: now, updatedAt: now, archived: false,
    });
    onToast(`"${title}" added to backlog`);
  };

  const handleSnooze = () => {
    if (!current) return;
    const ok = snoozeItem(current.id);
    if (ok) { setDisplayId(null); setTagEditMode(false); }
    else onToast('Snooze limit reached for today');
  };

  const handleComplete = () => {
    if (!current) return;
    const result = completeItem(current.id);
    setDisplayId(null);
    setTagEditMode(false);
    if (result === 'rescheduled') onToast('Rescheduled for next occurrence');
    else if (result === 'archived') onToast('Archived');
  };

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

  // Determine which queue tier is active right now
  const activeTasks = items.filter(it =>
    it.kind === 'task' && !it.archived &&
    it.status !== 'done' && it.status !== 'archived' &&
    (it.status !== 'waiting' || it.priorityBoost)
  ) as Task[];
  const needsTagCount = activeTasks.filter(it => !it.urgent && !it.important && !it.quick && !it.noTag).length;
  const queueTier: 'needsTag' | 'scored' =
    needsTagCount > 0 ? 'needsTag' : 'scored';

  const kindLabel = isTask ? 'TASK' : isReminder ? 'REMINDER' : 'RESPONSIBILITY';
  const holdButtonLabel = isReminder ? 'Remind me again' : 'Hold';
  const holdPanelLabel = isReminder ? 'Schedule next reminder' : 'When should this come back?';
  const completeLabel = isResponsibility ? 'Complete (reschedule)' : 'Complete';
  const canSnooze = !isReminder;
  const snoozeDisabled = snoozesToday >= snoozeLimit;
  const holdConfirmDisabled = isReminder && !holdSchedule;

  const groupPos = sameScoreGroup.length > 1
    ? `${sameScoreGroup.findIndex(it => it.id === current.id) + 1} of ${sameScoreGroup.length}`
    : null;
  const groupLabel = scoreGroups.length > 1
    ? `Priority ${scoreGroups.indexOf(currentScore) + 1}/${scoreGroups.length}`
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 36px', gap: 0 }}>
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
              {groupPos && (
                <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>{groupPos}</span>
              )}
              {groupLabel && queueTier === 'scored' && (
                <span style={{ fontSize: 11, color: 'var(--t-muted)', padding: '2px 7px', background: 'var(--t-surf3)', borderRadius: 10 }}>{groupLabel}</span>
              )}
              {queueTier === 'scored' && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)', whiteSpace: 'nowrap' }}>Score {score.toFixed(0)}</span>
              )}
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
              <div>
                <div style={fl}>Jira</div>
                <input value={t.jiraLink} onChange={e => updateItem(current.id, { jiraLink: e.target.value })} placeholder="PROJ-1234" style={{ ...inp, fontSize: 13, padding: '7px 9px', borderRadius: 7 }} />
                {t.jiraLink ? (
                  <a
                    href={`https://${jiraConfig?.host ?? ''}/browse/${t.jiraLink}`}
                    target="_blank" rel="noreferrer"
                    style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'var(--t-acc)', textDecoration: 'none', fontWeight: 500 }}>
                    ↗ Open {t.jiraLink}
                  </a>
                ) : jiraConfig ? (
                  <button
                    onClick={handleCreateJira}
                    disabled={creatingJira}
                    style={{ marginTop: 6, width: '100%', border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 12, fontWeight: 600, padding: '6px 0', borderRadius: 6, cursor: creatingJira ? 'wait' : 'pointer', opacity: creatingJira ? 0.6 : 1 }}>
                    {creatingJira ? 'Creating…' : '+ Create in Jira'}
                  </button>
                ) : null}
              </div>
              <div>
                <div style={fl}>General link</div>
                <input value={t.generalLink} onChange={e => updateItem(current.id, { generalLink: e.target.value })} placeholder="Any URL or ref" style={{ ...inp, fontSize: 13, padding: '7px 9px', borderRadius: 7 }} />
              </div>
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

        {/* Hold panel */}
        {holdOpen && (
          <div style={{ margin: '0 26px 22px', padding: 16, background: 'var(--t-surf3)', borderRadius: 10, border: '1px dashed var(--t-brd)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-txt)' }}>{holdPanelLabel}</div>
            <SchedulePicker value={holdSchedule} onChange={setHoldSchedule} allowRecurring={isReminder} />
            {!isReminder && (
              <div>
                <div style={fl}>Resume note (optional)</div>
                <input value={holdNote} onChange={e => setHoldNote(e.target.value)} placeholder="What are you waiting for?" style={inp} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleHoldConfirm} disabled={holdConfirmDisabled} style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 7, opacity: holdConfirmDisabled ? 0.5 : 1, cursor: holdConfirmDisabled ? 'not-allowed' : 'pointer' }}>
                Confirm
              </button>
              <button onClick={() => { setHoldOpen(false); setHoldNote(''); setHoldSchedule(null); }} style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 7 }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 8, padding: '18px 26px', borderTop: '1px solid var(--t-brd)', background: 'var(--t-surf2)', flexWrap: 'wrap' }}>
          {(['Continue', 'Move On'] as const).map((label, i) => {
            const disabled = i === 0 ? sameScoreGroup.length <= 1 : scoreGroups.length <= 1;
            const handler = i === 0 ? handleContinue : handleMoveOn;
            return (
              <button key={label} onClick={handler} disabled={disabled} style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', fontSize: 14, fontWeight: 600, padding: '11px 18px', borderRadius: 9, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}>
                {label}
              </button>
            );
          })}
          <button onClick={() => { setHoldOpen(o => !o); setHoldNote(''); setHoldSchedule(null); }} style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', fontSize: 14, fontWeight: 600, padding: '11px 18px', borderRadius: 9 }}>
            {holdButtonLabel}
          </button>
          {canSnooze && (
            <button onClick={handleSnooze} disabled={snoozeDisabled} style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', fontSize: 14, fontWeight: 600, padding: '11px 18px', borderRadius: 9, opacity: snoozeDisabled ? 0.45 : 1 }}>
              Snooze
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={handleComplete} style={{ border: 'none', background: 'var(--t-success)', color: 'white', fontSize: 14, fontWeight: 600, padding: '11px 20px', borderRadius: 9 }}>
            {completeLabel}
          </button>
        </div>
      </div>

      <div style={{ width: 880, maxWidth: '100%' }}>
        <SearchBar onPin={handlePin} onQuickCreate={handleQuickCreate} inputRef={searchRef} />
      </div>

      {subtaskPanel && (
        <SubtaskPanel
          parentId={subtaskPanel.parentId}
          subId={subtaskPanel.subId}
          onClose={() => setSubtaskPanel(null)}
          onExpand={() => { setFullPageSubtask(subtaskPanel); setSubtaskPanel(null); }}
        />
      )}

    </div>
  );
}
