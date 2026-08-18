import { useState, useEffect } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import type { Task, Subtask } from '../../types';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--t-kind-reminder)';
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };

// Plan (#plan): write the day's steps. For every task marked "today", the
// steps textarea IS the task's subtask list — one line per subtask, matched
// by title so ids/done/estimates survive edits. Plan authors the steps;
// DailyPlay marks which happen today; Play executes one.
export function PlanPopup({ onClose }: Props) {
  const items = useStore(s => s.items);
  const updateItem = useStore(s => s.updateItem);
  const updateSubtask = useStore(s => s.updateSubtask);
  const toggleSubtaskNext = useStore(s => s.toggleSubtaskNext);
  const markTaskPlanned = useStore(s => s.markTaskPlanned);

  const todayTasks = items.filter((it): it is Task => it.kind === 'task' && it.forToday && !it.archived);
  // engine.midnight() is the UPCOMING midnight (daily-reset deadline) —
  // "planned today" needs the start of today instead.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isPlanned = (t: Task) => (t.plannedAt ?? 0) >= startOfToday.getTime();
  const plannedCount = todayTasks.filter(isPlanned).length;

  // Local textarea drafts (per task) — the store value would collapse blank
  // lines mid-typing and fight the cursor.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function reconcile(t: Task, text: string) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const remaining = [...t.subtasks];
    const next: Subtask[] = lines.map(line => {
      const i = remaining.findIndex(s => s.title.trim() === line);
      if (i >= 0) return remaining.splice(i, 1)[0];
      return {
        id: 's' + Date.now() + Math.random().toString(36).slice(2, 5),
        title: line, done: false, isNext: false, jira: '', generalLink: '', notes: '', blockers: '',
        createdAt: Date.now(),
      };
    });
    // Keep exactly one undone step starred.
    if (!next.some(s => s.isNext && !s.done)) {
      const firstUndone = next.findIndex(s => !s.done);
      if (firstUndone >= 0) next[firstUndone] = { ...next[firstUndone], isNext: true };
    }
    updateItem(t.id, { subtasks: next });
  }

  return (
    <div {...backdropCloseProps(onClose)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(900px, 100%)', height: 'min(720px, 100%)', background: 'var(--t-surf)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: `3px solid ${ACCENT}` }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--t-brd)' }}>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.08em', color: ACCENT }}>◷ PLAN</span>
          <span style={{ fontSize: 13, color: 'var(--t-muted)' }}>{todayTasks.length} marked today{plannedCount > 0 && ` · ${plannedCount} planned`}</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 20, color: 'var(--t-muted)', lineHeight: 1 }}>×</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {todayTasks.length === 0 && (
            <div style={{ margin: 'auto', fontSize: 13.5, color: 'var(--t-muted)' }}>
              No tasks marked for today. Mark cards with the Today pill in the feed.
            </div>
          )}
          {todayTasks.map(t => {
            if (isPlanned(t)) {
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 12, padding: '10px 18px', opacity: 0.75 }}>
                  <span onClick={() => markTaskPlanned(t.id, false)} title="Reopen planning"
                    style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700, color: 'var(--t-success)', userSelect: 'none', flexShrink: 0 }}>✓</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--t-muted)', flexShrink: 0 }}>{t.subtasks.length} step{t.subtasks.length !== 1 ? 's' : ''} · planned</span>
                </div>
              );
            }
            const draft = drafts[t.id] ?? t.subtasks.map(s => s.title).join('\n');
            return (
              <div key={t.id} style={{ background: 'var(--t-surf2)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-txt)', lineHeight: 1.3 }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--t-muted)', marginTop: 2 }}>
                      {[t.requester, t.project].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <button onClick={() => markTaskPlanned(t.id, true)}
                    title="Done planning this task"
                    style={{ border: 'none', background: 'var(--t-success)', color: 'white', fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    ✓ Complete
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={lbl}>Steps — one per line</div>
                  <textarea
                    value={draft}
                    onChange={e => { setDrafts(d => ({ ...d, [t.id]: e.target.value })); reconcile(t, e.target.value); }}
                    rows={4}
                    placeholder={'First concrete step\nSecond step\n…'}
                    style={{ width: '100%', fontSize: 13.5, lineHeight: 1.6, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }} />
                </div>

                {t.subtasks.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={lbl}>First step — {t.subtasks.length} step{t.subtasks.length !== 1 ? 's' : ''}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {t.subtasks.map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span onClick={() => toggleSubtaskNext(t.id, s.id)}
                            title="Make this the first step"
                            style={{ cursor: 'pointer', fontSize: 15, color: s.isNext ? 'var(--t-amber)' : 'var(--t-brd)', userSelect: 'none', flexShrink: 0 }}>★</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--t-muted)' : 'var(--t-txt)' }}>
                            {s.title}
                          </span>
                          <input
                            value={s.estimate ?? ''}
                            onChange={e => updateSubtask(t.id, s.id, { estimate: e.target.value })}
                            placeholder="est."
                            title="Estimate (free text, e.g. 2h)"
                            style={{ width: 66, fontSize: 12, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none', boxSizing: 'border-box', flexShrink: 0 }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 22px', borderTop: '1px solid var(--t-brd)' }}>
          <button onClick={onClose}
            style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 7, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
