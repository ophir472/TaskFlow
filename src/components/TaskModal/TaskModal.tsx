import { useState, useEffect, useRef, useCallback } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import { useLogMount } from '../../useLogMount';
import type { Task, Subtask as SubtaskT } from '../../types';
import { scoreItem } from '../../engine';
import { EstimatesSection } from '../Common/EstimatesSection';
import { WaitingForSection } from '../Common/WaitingForSection';
import { QuickToActSection } from '../Common/QuickToActSection';
import { SubtaskChecklist } from '../SubtaskPanel/SubtaskChecklist';
import { CommunicationSection, getCommunications } from '../Common/CommunicationSection';
import { ResizableTextarea } from '../Common/ResizableTextarea';
import { TicketSections } from '../Common/TicketSections';

interface Props {
  taskId: string;
  allIds?: string[];        // ordered list for keyboard navigation
  onNavigate?: (id: string) => void;
  onClose: () => void;
  /** When true (default), close pops the URL hash — matches Table/Archive
   * routing. Callers that open the modal via React state only (like CardFeed's
   * tag-sweep banner) should pass false so close doesn't trigger navigation. */
  urlDriven?: boolean;
  // Open directly on a subtask (non-URL-driven hosts like Settings queues).
  initialSubId?: string;
}

const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };
const inp: React.CSSProperties = { width: '100%', fontSize: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box' };
const ta: React.CSSProperties = { ...inp, resize: 'vertical' as const, fontFamily: 'inherit' };
const sel: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 8px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)' };

export function TaskModal({ taskId, allIds, onNavigate, onClose, urlDriven = true, initialSubId }: Props) {
  useLogMount('TaskModal');
  const items = useStore(s => s.items);
  const requesters = useStore(s => s.requesters);
  const projects = useStore(s => s.projects);
  const customFields = useStore(s => s.customFields);
  const updateItem = useStore(s => s.updateItem);
  const toggleTag = useStore(s => s.toggleTag);
  const addSubtask = useStore(s => s.addSubtask);
  const deleteSubtask = useStore(s => s.deleteSubtask);
  const toggleSubtaskDone = useStore(s => s.toggleSubtaskDone);
  const toggleSubtaskNext = useStore(s => s.toggleSubtaskNext);
  const updateSubtask = useStore(s => s.updateSubtask);
  const updateItemCustomValue = useStore(s => s.updateItemCustomValue);

  const [newSubtask, setNewSubtask] = useState('');
  const [showAllSubs, setShowAllSubs] = useState(false);
  const [showDoneSubs, setShowDoneSubs] = useState(false);
  useEffect(() => { setShowAllSubs(false); setShowDoneSubs(false); }, [taskId]);
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
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubTitle, setEditingSubTitle] = useState('');
  const [subId, setSubId] = useState<string | null>(initialSubId ?? null);
  const subIdRef = useRef<string | null>(null);
  subIdRef.current = subId; // keep ref in sync for popstate handler
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const task = items.find(it => it.id === taskId) as Task | undefined;
  const sub = task && subId ? task.subtasks.find(s => s.id === subId) : undefined;

  const autoResizeTitle = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  useEffect(() => { autoResizeTitle(); }, [autoResizeTitle]);

  const idx = allIds ? allIds.indexOf(taskId) : -1;
  const canPrev = idx > 0;
  const canNext = allIds ? idx < allIds.length - 1 : false;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === 'Escape') {
        // Escape fully closes the modal (both task and subtask view in one press)
        fullyClose();
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Arrow keys navigate between tasks only when NOT in subtask view
      if (subIdRef.current) return;
      if (e.key === 'ArrowLeft' && canPrev && allIds && onNavigate) onNavigate(allIds[idx - 1]);
      if (e.key === 'ArrowRight' && canNext && allIds && onNavigate) onNavigate(allIds[idx + 1]);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [taskId, idx, canPrev, canNext, allIds, onNavigate, onClose]);

  // URL-driven subId: parse from #{view}/task/{id}/sub/{subId}
  // Uses hashchange (battle-tested in this app) rather than pushState/popstate.
  useEffect(() => {
    if (!urlDriven) return; // local subId state only — the hash isn't ours
    function syncSubIdFromHash() {
      const parts = window.location.hash.slice(1).split('/');
      // parts: [view, 'task', taskId, 'sub', subId]
      if (parts[3] === 'sub' && parts[4]) setSubId(parts[4]);
      else setSubId(null);
    }
    syncSubIdFromHash(); // initial
    window.addEventListener('hashchange', syncSubIdFromHash);
    return () => window.removeEventListener('hashchange', syncSubIdFromHash);
  }, []);

  function openSubtask(id: string) {
    // Not URL-driven (e.g. Settings review queue): plain local state — the
    // hash there belongs to Settings and must stay untouched.
    if (!urlDriven) { setSubId(id); return; }
    const parts = window.location.hash.slice(1).split('/');
    const view = parts[0] || 'table';
    window.location.hash = `${view}/task/${taskId}/sub/${id}`;
  }
  function closeSubtask() {
    if (!urlDriven) { setSubId(null); return; }
    // Back-arrow in header: pops the /sub/{id} entry, restoring task view
    history.back();
  }
  // Full close: used by backdrop, × button, and Escape. When URL-driven,
  // pops both entries (task + subtask) so the modal exits and the URL returns
  // to the underlying view. When not URL-driven, just calls onClose so the
  // parent can unmount without any navigation side-effect.
  function fullyClose() {
    if (!urlDriven) { onClose(); return; }
    const toPop = subIdRef.current ? 2 : 1;
    history.go(-toPop);
  }

  if (!task) return null;

  const score = scoreItem(task);
  const TAG_DEFS = [
    { key: 'urgent' as const,    label: 'Urgent',        ac: 'var(--t-urgent)',    ab: 'var(--t-urgent-bg)',    abr: 'var(--t-urgent)'    },
    { key: 'important' as const, label: 'Important',     ac: 'var(--t-important)', ab: 'var(--t-important-bg)', abr: 'var(--t-important)' },
    { key: 'quick' as const,     label: 'Quick',         ac: 'var(--t-quick)',     ab: 'var(--t-quick-bg)',     abr: 'var(--t-quick)'     },
    { key: 'noTag' as const,     label: 'None of these', ac: 'var(--t-txt2)',      ab: 'var(--t-surf3)',        abr: 'var(--t-muted)'     },
  ];

  // Subtask view — renders inside the same modal when a subtask is opened
  if (sub) {
    return (
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        {...backdropCloseProps(fullyClose)}>
        <div
          style={{ width: 900, maxWidth: '96vw', maxHeight: '90vh', overflow: 'auto', background: 'var(--t-surf)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.28)', borderTop: '3px solid var(--t-acc)' }}
          onClick={e => e.stopPropagation()}>
          {/* Subtask header */}
          <div style={{ padding: '18px 26px', borderBottom: '1px solid var(--t-brd)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={closeSubtask}
              style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>
              ← Back
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Subtask of</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-txt2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13.5, color: 'var(--t-txt2)', userSelect: 'none' }}>
                <input type="checkbox" checked={sub.done} onChange={() => toggleSubtaskDone(taskId, sub.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                Done
              </label>
              <div onClick={() => toggleSubtaskNext(taskId, sub.id)} title="Mark as next up"
                style={{ cursor: 'pointer', fontSize: 18, color: sub.isNext ? 'var(--t-amber)' : 'var(--t-brd)', userSelect: 'none' }}>★</div>
              <span onClick={fullyClose} style={{ cursor: 'pointer', fontSize: 20, color: 'var(--t-muted)', lineHeight: 1, padding: '2px 6px' }}>×</span>
            </div>
          </div>
          {/* Subtask body */}
          <div style={{ padding: '18px 26px 24px' }}>
            <input value={sub.title} onChange={e => updateSubtask(taskId, sub.id, { title: e.target.value })}
              placeholder="Title"
              style={{ ...inp, fontSize: 18, fontWeight: 600, padding: '10px 12px' }} />
            <div style={{ display: 'flex', gap: 20, marginTop: 18, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SubtaskChecklist parentId={taskId} sub={sub} />
                <div>
                  <div style={fl}>Notes</div>
                  <textarea value={sub.notes} onChange={e => updateSubtask(taskId, sub.id, { notes: e.target.value })} placeholder="Notes…" rows={5} style={ta} />
                </div>
                <div>
                  <div style={fl}>Blockers</div>
                  <textarea value={sub.blockers} onChange={e => updateSubtask(taskId, sub.id, { blockers: e.target.value })} placeholder="Who can help?" rows={3} style={ta} />
                </div>
              </div>
              <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={fl}>Jira (child)</div>
                  <input value={sub.jira} onChange={e => updateSubtask(taskId, sub.id, { jira: e.target.value })} placeholder="PROJ-1235" style={{ ...inp, fontSize: 13 }} />
                </div>
                <div>
                  <div style={fl}>General link</div>
                  <input value={sub.generalLink ?? ''} onChange={e => updateSubtask(taskId, sub.id, { generalLink: e.target.value })} placeholder="Any URL or ref" style={{ ...inp, fontSize: 13 }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      {...backdropCloseProps(fullyClose)}>
      <div
        style={{ width: 900, maxWidth: '96vw', maxHeight: '90vh', overflow: 'auto', background: 'var(--t-surf)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.28)', borderTop: '3px solid var(--t-acc)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '22px 26px 0', borderBottom: '1px solid var(--t-brd)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 20, background: 'var(--t-acc-bg)', color: 'var(--t-acc)' }}>TASK</span>
              <span style={{ fontSize: 12, color: 'var(--t-muted)' }}>Score {score.toFixed(0)}</span>
              {task.archived && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'var(--t-urgent-bg)', color: 'var(--t-urgent)' }}>ARCHIVED</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {allIds && allIds.length > 1 && (
                <>
                  <button onClick={() => canPrev && onNavigate?.(allIds[idx - 1])} disabled={!canPrev}
                    style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', fontSize: 14, padding: '4px 10px', borderRadius: 7, cursor: canPrev ? 'pointer' : 'default', opacity: canPrev ? 1 : 0.35 }}>←</button>
                  <span style={{ fontSize: 12, color: 'var(--t-muted)', minWidth: 40, textAlign: 'center' }}>{idx + 1} / {allIds.length}</span>
                  <button onClick={() => canNext && onNavigate?.(allIds[idx + 1])} disabled={!canNext}
                    style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', fontSize: 14, padding: '4px 10px', borderRadius: 7, cursor: canNext ? 'pointer' : 'default', opacity: canNext ? 1 : 0.35 }}>→</button>
                </>
              )}
              <span onClick={fullyClose} style={{ cursor: 'pointer', fontSize: 20, color: 'var(--t-muted)', lineHeight: 1, padding: '2px 6px', marginLeft: 4 }}>×</span>
            </div>
          </div>
          <textarea
            ref={titleRef}
            value={task.title}
            onChange={e => { updateItem(taskId, { title: e.target.value }); autoResizeTitle(); }}
            rows={1}
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', padding: '6px 0 0', color: 'var(--t-txt)', background: 'transparent', resize: 'none', overflow: 'hidden', lineHeight: 1.3, fontFamily: 'inherit', display: 'block', boxSizing: 'border-box' }}
          />
        </div>

        {/* Body */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>

          {/* Left: main fields — minWidth 0 so long titles can't push the
              fixed-width sidebar out of the modal */}
          <div style={{ flex: 1, minWidth: 0, padding: '18px 20px 24px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Tags */}
            <div>
              <div style={fl}>Tags</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TAG_DEFS.map(({ key, label, ac, ab, abr }) => {
                  const active = key === 'noTag' ? task.noTag : task[key];
                  return (
                    <div key={key} onClick={() => toggleTag(taskId, key)}
                      style={{ padding: '7px 13px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', userSelect: 'none', border: `1.5px solid ${active ? abr : 'var(--t-brd)'}`, color: active ? ac : 'var(--t-muted)', background: active ? ab : 'transparent' }}>
                      {active ? '✓ ' : ''}{label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* To check */}
            {task.toCheck && (
              <div style={{ background: 'var(--t-amber-bg)', border: '1px solid var(--t-amber-brd)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--t-amber)' }}>
                <b>To check:</b> {task.toCheck}
              </div>
            )}

            {/* Subtasks */}
            <div data-review-target="subtasks">
              <div style={{ ...fl, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>Subtasks {task.subtasks.length > 0 && `(${task.subtasks.filter(s => s.done).length}/${task.subtasks.length})`}</span>
                {(() => {
                  const openCount = task.subtasks.filter(s => !s.done && !s.isNext).length;
                  const doneCount = task.subtasks.filter(s => s.done).length;
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
              {/* Starred ("next up") subtasks get their own highlighted spot */}
              {task.subtasks.filter(s => s.isNext && !s.done).length > 0 && (
                <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {task.subtasks.filter(s => s.isNext && !s.done).map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1.5px solid var(--t-amber-brd)', borderRadius: 9, background: 'var(--t-amber-bg)', animation: justStarred === s.id ? 'starRise 0.28s ease' : undefined }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-amber)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>★ Next up</span>
                      <input type="checkbox" checked={s.done} onChange={() => toggleSubtaskDone(taskId, s.id)} style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-txt)', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                      <div onClick={() => openSubtask(s.id)}
                        title="Open subtask details"
                        style={{ flex: 1, minWidth: 48, cursor: 'pointer', alignSelf: 'stretch' }} />
                      <div onClick={() => updateSubtask(taskId, s.id, { isQuick: !s.isQuick })} style={{ cursor: 'pointer', fontSize: 14, color: s.isQuick ? 'oklch(0.55 0.16 250)' : 'var(--t-brd)', userSelect: 'none', flexShrink: 0 }} title="Quick to act">◷</div>
                      <div onClick={() => { markUnstarred(s.id); toggleSubtaskNext(taskId, s.id); }} style={{ cursor: 'pointer', fontSize: 15, color: 'var(--t-amber)', userSelect: 'none', flexShrink: 0 }} title="Unstar — return to the list">★</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(() => {
                const renderSubRow = (s: SubtaskT) => {
                  const isEditing = editingSubId === s.id;
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--t-brd2)', borderRadius: 9, background: 'var(--t-surf2)', animation: justUnstarred === s.id ? 'starDrop 0.28s ease' : undefined }}>
                      <input type="checkbox" checked={s.done} onChange={() => toggleSubtaskDone(taskId, s.id)} style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
                      {isEditing ? (
                        <input autoFocus value={editingSubTitle}
                          size={Math.max(editingSubTitle.length + 2, 8)}
                          onChange={e => setEditingSubTitle(e.target.value)}
                          onBlur={() => {
                            const t = editingSubTitle.trim();
                            if (t && t !== s.title) updateSubtask(taskId, s.id, { title: t });
                            setEditingSubId(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.currentTarget.blur(); }
                            if (e.key === 'Escape') setEditingSubId(null);
                          }}
                          style={{ fontSize: 14, padding: '3px 6px', border: '1px solid var(--t-acc)', borderRadius: 4, background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none' }} />
                      ) : (
                        <span onClick={() => { setEditingSubId(s.id); setEditingSubTitle(s.title); }}
                          title="Click to rename"
                          style={{ fontSize: 14, cursor: 'text', textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--t-muted)' : 'var(--t-txt)', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                      )}
                      {/* Click-to-open area — minWidth keeps it clickable even
                          when the title is long (title truncates instead). */}
                      <div onClick={() => openSubtask(s.id)}
                        title="Open subtask details"
                        style={{ flex: 1, minWidth: 48, cursor: 'pointer', alignSelf: 'stretch' }} />
                      <div onClick={() => updateSubtask(taskId, s.id, { isQuick: !s.isQuick })} style={{ cursor: 'pointer', fontSize: 14, color: s.isQuick ? 'oklch(0.55 0.16 250)' : 'var(--t-brd)', userSelect: 'none', flexShrink: 0 }} title="Quick to act">◷</div>
                      <div onClick={() => {
                        if (!s.isNext) {
                          markStarred(s.id);
                          markUnstarred(task.subtasks.find(x => x.isNext && !x.done)?.id);
                        }
                        toggleSubtaskNext(taskId, s.id);
                      }} style={{ cursor: 'pointer', fontSize: 15, color: s.isNext ? 'var(--t-amber)' : 'var(--t-brd)', userSelect: 'none', flexShrink: 0 }} title="Next up">★</div>
                      <span onClick={() => deleteSubtask(taskId, s.id)} style={{ cursor: 'pointer', fontSize: 14, color: 'var(--t-muted)', flexShrink: 0 }}>×</span>
                    </div>
                  );
                };

                const openSubs = task.subtasks.filter(s => !s.done && !s.isNext);
                const doneSubs = task.subtasks.filter(s => s.done);
                const visible = showAllSubs ? openSubs : openSubs.slice(0, 3);
                return (
                  <>
                    {visible.map(renderSubRow)}
                    {showDoneSubs && doneSubs.map(renderSubRow)}
                  </>
                );
                })()}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newSubtask.trim()) { addSubtask(taskId, newSubtask.trim(), { isQuick: e.shiftKey }); setNewSubtask(''); } }}
                    title="Enter adds · Shift+Enter adds as quick-to-act"
                    placeholder="Add subtask…" style={{ ...inp, flex: 1 }} />
                  <button onClick={() => { if (newSubtask.trim()) { addSubtask(taskId, newSubtask.trim()); setNewSubtask(''); } }} disabled={!newSubtask.trim()}
                    title="Add subtask (Enter)"
                    style={{ border: 'none', background: 'oklch(0.6 0.14 150)', color: 'white', fontSize: 18, width: 34, height: 34, borderRadius: 8, cursor: 'pointer', opacity: newSubtask.trim() ? 1 : 0.4, flexShrink: 0 }}>+</button>
                  <button onClick={() => { if (newSubtask.trim()) { addSubtask(taskId, newSubtask.trim(), { isQuick: true }); setNewSubtask(''); } }} disabled={!newSubtask.trim()}
                    title="Add as quick to act (Shift+Enter)"
                    style={{ border: 'none', background: 'oklch(0.55 0.16 250)', color: 'white', fontSize: 15, width: 34, height: 34, borderRadius: 8, cursor: 'pointer', opacity: newSubtask.trim() ? 1 : 0.4, flexShrink: 0 }}>◷</button>
                </div>
              </div>
            </div>

            {/* Quick to Act — view of isQuick subtasks */}
            <QuickToActSection task={task} />

            {/* Notes */}
            <div>
              <div style={fl}>Notes</div>
              <ResizableTextarea taskId={taskId} fieldKey="notes" value={task.notes} onChange={e => updateItem(taskId, { notes: e.target.value })} rows={5} style={ta} />
            </div>

            {/* Blockers */}
            <div>
              <div style={fl}>Blockers</div>
              <ResizableTextarea taskId={taskId} fieldKey="blockers" value={task.blockers} onChange={e => updateItem(taskId, { blockers: e.target.value })} rows={3} placeholder="Who can help?" style={ta} />
            </div>

            {/* Communication */}
            <CommunicationSection taskId={taskId} task={task} fields={getCommunications(task.communications)} />

            {/* Waiting for (collapsible) */}
            <WaitingForSection task={task} />

            {/* Estimates (collapsible) */}
            <EstimatesSection task={task} />

            {/* Custom fields */}
            {customFields.filter(f => f.showInCard).map(f => (
              <div key={f.id}>
                <div style={fl}>{f.name}</div>
                <ResizableTextarea taskId={taskId} fieldKey={`cf:${f.id}`} value={task.customValues?.[f.id] ?? ''} onChange={e => updateItemCustomValue(taskId, f.id, e.target.value)} rows={3} style={ta} />
              </div>
            ))}
          </div>

          {/* Right sidebar */}
          <div style={{ width: 200, flexShrink: 0, borderLeft: '1px solid var(--t-brd2)', padding: '18px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--t-surf2)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={fl}>Status</div>
                <select value={task.status} onChange={e => updateItem(taskId, { status: e.target.value as Task['status'] })} style={sel}>
                  <option value="in_progress">In progress</option>
                  <option value="backlog">Backlog</option>
                  <option value="waiting">Waiting</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <div style={fl}>Requester</div>
                <select value={task.requester} onChange={e => updateItem(taskId, { requester: e.target.value })} style={sel}>
                  <option value="">—</option>
                  {requesters.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div style={fl}>Project</div>
                <select value={task.project} onChange={e => updateItem(taskId, { project: e.target.value })} style={sel}>
                  <option value="">—</option>
                  {projects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {/* Jira / ITSM / Link — same shared sections as the card feed */}
              <TicketSections task={task} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
