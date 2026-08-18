import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../store';
import type { Item, Task } from '../../types';
import { QUICK_BLUE } from '../Common/QuickToActSection';
import { buildMailEntry } from '../../mailEntry';
import { MailEntryFields } from '../Mail/MailEntryFields';
import { FieldPanel } from '../Play/Play';

interface Props {
  onClose: () => void;
}

export type SprintTarget =
  | { kind: 'subtask'; taskId: string; subId: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'mail'; taskId: string };

const isActiveTask = (it: Item): it is Task =>
  it.kind === 'task' && !it.archived && it.status !== 'done' && it.status !== 'archived';

// The pool, in walk order: quick subtasks → quick-tagged tasks → mail
// entries (which include every task's linked "To send" items).
export function buildSprintPool(items: Item[]): SprintTarget[] {
  const pool: SprintTarget[] = [];
  const work = items.filter((it): it is Task => isActiveTask(it) && it.type !== 'mail');
  for (const t of work) for (const s of t.subtasks) if (s.isQuick && !s.done) pool.push({ kind: 'subtask', taskId: t.id, subId: s.id });
  for (const t of work) if (t.quick) pool.push({ kind: 'task', taskId: t.id });
  for (const it of items) if (it.kind === 'task' && it.type === 'mail' && !it.archived) pool.push({ kind: 'mail', taskId: it.id });
  return pool;
}

export interface ResolvedTarget {
  title: string;
  kindLabel: string;
  // Context fields shown when expanded. The final always-visible list is
  // still TBD — extend these per-kind arrays freely.
  context: { label: string; value: string }[];
}

const joinVals = (...vals: (string | undefined)[]) =>
  vals.filter((v): v is string => !!v && v.trim().length > 0).join(' · ');

export function resolveSprintTarget(target: SprintTarget, items: Item[]): ResolvedTarget | null {
  const task = items.find(i => i.id === target.taskId);
  if (!task || task.kind !== 'task') return null;
  switch (target.kind) {
    case 'subtask': {
      const s = task.subtasks.find(x => x.id === target.subId);
      if (!s || s.done) return null;
      return {
        title: s.title,
        kindLabel: 'Quick subtask',
        context: [
          { label: 'Task', value: task.title },
          { label: 'Notes (subtask)', value: s.notes.trim() || '—' },
          { label: 'Blockers (subtask)', value: s.blockers.trim() || '—' },
          { label: 'Link (subtask)', value: (s.generalLink ?? '').trim() || '—' },
          { label: 'Notes (task)', value: task.notes.trim() || '—' },
          { label: 'ITSM (task)', value: joinVals(task.itsmTicket, ...(task.extraItsmTickets ?? [])) || '—' },
          { label: 'Links (task)', value: joinVals(task.generalLink, ...(task.extraGeneralLinks ?? [])) || '—' },
        ],
      };
    }
    case 'task': {
      if (task.archived || task.status === 'done') return null;
      const openSubs = task.subtasks.filter(s => !s.done);
      return {
        title: task.title,
        kindLabel: 'Quick task',
        context: [
          { label: 'Subtasks', value: openSubs.length ? openSubs.map(s => `• ${s.isNext ? '★ ' : ''}${s.title}`).join('\n') : '—' },
          { label: 'ITSM', value: joinVals(task.itsmTicket, ...(task.extraItsmTickets ?? [])) || '—' },
          { label: 'Links', value: joinVals(task.generalLink, ...(task.extraGeneralLinks ?? [])) || '—' },
          { label: 'Notes', value: task.notes.trim() || '—' },
          { label: 'Blockers', value: task.blockers.trim() || '—' },
        ],
      };
    }
    case 'mail': {
      if (task.archived) return null;
      const linked = task.linkedTaskId ? items.find(i => i.id === task.linkedTaskId) : null;
      return {
        title: task.title,
        kindLabel: 'Mail to send',
        context: [
          { label: 'Linked card', value: linked?.title ?? '—' },
          { label: 'What I want to say', value: (task.whatIWantToSay ?? '').trim() || '—' },
          { label: 'Mail to send', value: (task.mailToSend ?? '').trim() || '—' },
        ],
      };
    }
  }
}

// #sprint/mail/<entryId> — the m-shortcut's communication popup rides as a
// sub-route so Sprint (and its timer) stays alive underneath.
function mailSubFromHash(): string | null {
  const parts = window.location.hash.slice(1).split('/');
  return parts[0] === 'sprint' && parts[1] === 'mail' ? (parts[2] ?? null) : null;
}

const darkInp: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 9px', borderRadius: 7, border: '1px solid #3d3d44', background: '#1d1d21', color: '#e4e4e8', boxSizing: 'border-box', outline: 'none' };
const dLbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8a8a92', marginBottom: 3 };

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Sprint "war mode": black screen, one pending item at a time, running timer.
// Click the title to expand its context, click again to collapse.
export function SprintMode({ onClose }: Props) {
  const items = useStore(s => s.items);
  const updateItem = useStore(s => s.updateItem);
  const toggleSubtaskDone = useStore(s => s.toggleSubtaskDone);
  const updateSubtask = useStore(s => s.updateSubtask);
  const createItem = useStore(s => s.createItem);
  const deleteItem = useStore(s => s.deleteItem);

  // Frozen at start — live edits still show (resolution is against live items).
  const pool = useMemo(() => buildSprintPool(useStore.getState().items), []);
  const [idx, setIdx] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [skipCount, setSkipCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // ⊞ drawer: empty fields hide behind one icon; picking one reveals it as
  // an EDITABLE field inside the expanded context. Reset per item.
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [mailSubId, setMailSubId] = useState<string | null>(() => mailSubFromHash());
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);
  useEffect(() => {
    const onHash = () => setMailSubId(mailSubFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mailSubFromHash()) history.back();
        else onClose();
        return;
      }
      if (mailSubFromHash()) return; // mail popup owns the keyboard
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'ArrowRight' && !typing) { e.preventDefault(); navRef.current(1); }
      else if (e.key === 'ArrowLeft' && !typing) { e.preventDefault(); navRef.current(-1); }
      else if ((e.key === 'm' || e.code === 'KeyM') && !typing) { e.preventDefault(); mRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { setExpanded(false); setRevealed(new Set()); setPickerOpen(false); }, [idx]);

  const finished = idx >= pool.length;
  const target = finished ? null : pool[idx];
  const resolved = target ? resolveSprintTarget(target, items) : null;
  // Item resolved away (done elsewhere / deleted) → advance past it.
  useEffect(() => {
    if (!finished && target && !resolved) setIdx(i => i + 1);
  }, [finished, target, resolved]);

  function markDone() {
    if (!target || !resolved) return;
    if (target.kind === 'subtask') toggleSubtaskDone(target.taskId, target.subId);
    else updateItem(target.taskId, { status: 'done' });
    setDoneCount(n => n + 1);
    setIdx(i => i + 1);
  }
  function skip() {
    setSkipCount(n => n + 1);
    setIdx(i => i + 1);
  }
  function nav(dir: 1 | -1) {
    const from = finished ? pool.length : idx;
    let i = from + dir;
    while (i >= 0 && i < pool.length && !resolveSprintTarget(pool[i], items)) i += dir;
    if (dir === 1) setIdx(Math.min(i, pool.length));
    else if (i >= 0) setIdx(i);
  }
  const navRef = useRef(nav);
  navRef.current = nav;

  // Editable fields for the current item — populated ones already show in the
  // context; empty ones hide in the ⊞ drawer and reveal here when picked.
  const curTask = target ? items.find((i): i is Task => i.id === target.taskId && i.kind === 'task') : undefined;
  const curSub = target?.kind === 'subtask' && curTask ? curTask.subtasks.find(x => x.id === target.subId) : undefined;
  type FieldDef = { key: string; label: string; has: boolean; control: React.ReactNode };
  const mkText = (key: string, label: string, value: string, save: (v: string) => void, rows = 3): FieldDef => ({
    key, label, has: value.trim().length > 0,
    control: <textarea value={value} onChange={e => save(e.target.value)} rows={rows} style={{ ...darkInp, resize: 'vertical', fontFamily: 'inherit' }} />,
  });
  const mkLine = (key: string, label: string, value: string, save: (v: string) => void): FieldDef => ({
    key, label, has: value.trim().length > 0,
    control: <input value={value} onChange={e => save(e.target.value)} style={darkInp} />,
  });
  let fieldDefs: FieldDef[] = [];
  if (curTask && target) {
    if (target.kind === 'subtask' && curSub) {
      fieldDefs = [
        mkText('notes-sub', 'Notes (subtask)', curSub.notes, v => updateSubtask(curTask.id, curSub.id, { notes: v })),
        mkText('blockers-sub', 'Blockers (subtask)', curSub.blockers, v => updateSubtask(curTask.id, curSub.id, { blockers: v }), 2),
        mkLine('link-sub', 'Link (subtask)', curSub.generalLink ?? '', v => updateSubtask(curTask.id, curSub.id, { generalLink: v })),
        mkText('notes-task', 'Notes (task)', curTask.notes, v => updateItem(curTask.id, { notes: v })),
        mkLine('itsm-task', 'ITSM (task)', curTask.itsmTicket ?? '', v => updateItem(curTask.id, { itsmTicket: v })),
        mkLine('links-task', 'Links (task)', curTask.generalLink, v => updateItem(curTask.id, { generalLink: v })),
      ];
    } else if (target.kind === 'task') {
      fieldDefs = [
        mkLine('itsm', 'ITSM', curTask.itsmTicket ?? '', v => updateItem(curTask.id, { itsmTicket: v })),
        mkLine('links', 'Links', curTask.generalLink, v => updateItem(curTask.id, { generalLink: v })),
        mkText('notes', 'Notes', curTask.notes, v => updateItem(curTask.id, { notes: v })),
        mkText('blockers', 'Blockers', curTask.blockers, v => updateItem(curTask.id, { blockers: v }), 2),
      ];
    }
    // mail kind: What-I-want-to-say / Mail-to-send are ALWAYS shown in the
    // middle — nothing to hide in the drawer.
  }
  // The drawer offers EVERY relevant field (populated or not) that isn't
  // already opened as a side panel — pick any to edit it.
  const hiddenDefs = fieldDefs.filter(d => !revealed.has(d.key));
  const revealedDefs = fieldDefs.filter(d => revealed.has(d.key));

  // 'm' — new communication linked to the current item's card, ON TOP of
  // Sprint (the assistant proper would swap the whole background).
  function openLinkedMail() {
    if (!resolved) return;
    const link = target?.kind === 'mail'
      ? (curTask?.linkedTaskId ? items.find(i => i.id === curTask.linkedTaskId) : undefined)
      : curTask;
    const entry = buildMailEntry(link?.title ?? resolved.title, link?.id);
    createItem(entry);
    window.location.hash = `sprint/mail/${entry.id}`;
  }
  const mRef = useRef(openLinkedMail);
  mRef.current = openLinkedMail;
  const mailEntry = mailSubId ? items.find((it): it is Task => it.id === mailSubId && it.kind === 'task') : undefined;

  const btn: React.CSSProperties = { border: '1px solid #454549', background: '#2a2a2e', color: '#e4e4e8', fontSize: 14, fontWeight: 600, padding: '10px 22px', borderRadius: 9, cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#1b1b1e', zIndex: 500, display: 'flex', flexDirection: 'column', color: '#fff' }}>
      {/* Top bar: timer · progress · close */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 24px', fontSize: 14, color: '#888' }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#ddd', fontSize: 16 }}>⏱ {fmtElapsed(now - startedAt)}</span>
        {!finished && <span>{Math.min(idx + 1, pool.length)} / {pool.length}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          {!finished && hiddenDefs.length > 0 && (
            <div ref={pickerRef} style={{ position: 'relative' }}>
              <button onClick={() => setPickerOpen(o => !o)}
                title={`${hiddenDefs.length} field${hiddenDefs.length !== 1 ? 's' : ''} — pick one to edit`}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #3d3d44', background: pickerOpen ? '#242428' : 'transparent', color: '#8a8a92', fontSize: 13, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ⊞
              </button>
              {pickerOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, width: 190, background: '#242428', border: '1px solid #3d3d44', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', padding: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {hiddenDefs.map(d => (
                    <div key={d.key}
                      onClick={() => { setRevealed(prev => new Set(prev).add(d.key)); setPickerOpen(false); setExpanded(true); }}
                      style={{ padding: '7px 10px', borderRadius: 7, fontSize: 12.5, color: '#e4e4e8', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1d1d21'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      {d.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 22, lineHeight: 1, color: '#8a8a92' }}>×</span>
        </div>
      </div>

      {/* Fields picked from ⊞ — same panel design as Play, on the side */}
      {!finished && revealedDefs.length > 0 && (
        <div style={{ position: 'fixed', right: 22, top: 64, width: 280, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', zIndex: 10 }}>
          {revealedDefs.map(d => (
            <FieldPanel key={`${idx}:${d.key}`} title={d.label} defaultOpen>
              {d.control}
            </FieldPanel>
          ))}
        </div>
      )}

      {finished ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Sprint complete
          </div>
          <div style={{ fontSize: 15, color: '#999' }}>
            <b style={{ color: 'oklch(0.7 0.15 150)' }}>{doneCount} done</b> · {skipCount} skipped · {fmtElapsed(now - startedAt)}
            {pool.length === 0 && ' — nothing was pending'}
          </div>
          <button onClick={onClose} style={{ ...btn, marginTop: 14 }}>Close</button>
        </div>
      ) : resolved && (
        <>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 40px', gap: 18, overflowY: 'auto' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: QUICK_BLUE }}>
              {resolved.kindLabel}
            </div>
            <div
              onClick={() => setExpanded(v => !v)}
              title={expanded ? 'Collapse' : 'Expand context'}
              style={{ fontSize: 'clamp(22px, 4vw, 40px)', fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center', maxWidth: 900, lineHeight: 1.25, cursor: 'pointer', userSelect: 'none' }}>
              {resolved.title}
            </div>
            {target?.kind === 'mail' && curTask && (
              <div style={{ width: 'min(680px, 90vw)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={dLbl}>What I want to say</div>
                  <textarea value={curTask.whatIWantToSay ?? ''} onChange={e => updateItem(curTask.id, { whatIWantToSay: e.target.value })}
                    rows={3} placeholder="Rough notes — the gist of the answer…"
                    style={{ ...darkInp, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <div style={dLbl}>Mail to send</div>
                  <textarea value={curTask.mailToSend ?? ''} onChange={e => updateItem(curTask.id, { mailToSend: e.target.value })}
                    rows={5} placeholder="The actual draft…"
                    style={{ ...darkInp, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              </div>
            )}
            {expanded && (
              <div style={{ width: 'min(680px, 90vw)', background: '#242428', border: '1px solid #3d3d44', borderRadius: 14, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '46vh', overflowY: 'auto' }}>
                {resolved.context.length === 0 && (
                  <div style={{ fontSize: 13, color: '#777' }}>No extra context on this item.</div>
                )}
                {resolved.context.map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8a8a92', marginBottom: 3 }}>{f.label}</div>
                    <div style={{ fontSize: 14, color: '#e4e4e8', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{f.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '0 24px 12px' }}>
            <button onClick={markDone} style={{ ...btn, background: 'oklch(0.45 0.12 150)', borderColor: 'oklch(0.5 0.13 150)', color: 'white' }}>✓ Done</button>
            <button onClick={skip} style={btn}>Skip →</button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11.5, color: '#75757c', paddingBottom: 22 }}>← previous · → next · click title for context</div>
        </>
      )}

      {/* m → communication popup ON TOP of Sprint (timer stays alive) */}
      {mailEntry && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 520, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 540, maxWidth: '92vw', maxHeight: '84vh', overflowY: 'auto', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t-txt)', letterSpacing: '-0.01em' }}>✉ New communication</div>
              <span onClick={() => history.back()} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 20, lineHeight: 1 }}>×</span>
            </div>
            <MailEntryFields entry={mailEntry} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { updateItem(mailEntry.id, { status: 'done' }); history.back(); }}
                style={{ border: 'none', background: 'oklch(0.6 0.14 150)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '9px 16px', borderRadius: 8, cursor: 'pointer' }}>
                ✓ Mail sent — archive
              </button>
              <button onClick={() => history.back()}
                style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 8, cursor: 'pointer' }}>
                Close — keep in ✉ queue
              </button>
              <button onClick={() => { deleteItem(mailEntry.id); history.back(); }}
                title="Delete this entry — nothing is kept"
                style={{ marginLeft: 'auto', border: '1px solid var(--t-urgent)', background: 'transparent', color: 'var(--t-urgent)', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 8, cursor: 'pointer' }}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
