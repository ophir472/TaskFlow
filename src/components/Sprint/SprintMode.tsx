import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../store';
import type { Item, Task } from '../../types';
import { QUICK_BLUE } from '../Common/QuickToActSection';

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

  // Frozen at start — live edits still show (resolution is against live items).
  const pool = useMemo(() => buildSprintPool(useStore.getState().items), []);
  const [idx, setIdx] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [skipCount, setSkipCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') { e.preventDefault(); navRef.current(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); navRef.current(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => setExpanded(false), [idx]);

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

  const btn: React.CSSProperties = { border: '1px solid #454549', background: '#2a2a2e', color: '#e4e4e8', fontSize: 14, fontWeight: 600, padding: '10px 22px', borderRadius: 9, cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#1b1b1e', zIndex: 500, display: 'flex', flexDirection: 'column', color: '#fff' }}>
      {/* Top bar: timer · progress · close */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 24px', fontSize: 14, color: '#888' }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#ddd', fontSize: 16 }}>⏱ {fmtElapsed(now - startedAt)}</span>
        {!finished && <span>{Math.min(idx + 1, pool.length)} / {pool.length}</span>}
        <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: '#8a8a92' }}>×</span>
      </div>

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
    </div>
  );
}
