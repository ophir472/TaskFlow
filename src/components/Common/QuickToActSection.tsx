import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';

export const QUICK_BLUE = 'oklch(0.55 0.16 250)';

interface Props {
  task: Task;
}

// "Quick to Act" table on a card — a filtered VIEW of the task's subtasks
// (isQuick flag), styled like the Waiting-for table. Same underlying objects
// as the subtask list: done/rename/unmark here reflect there instantly.
export function QuickToActSection({ task }: Props) {
  const updateSubtask = useStore(s => s.updateSubtask);
  const toggleSubtaskDone = useStore(s => s.toggleSubtaskDone);
  const addSubtask = useStore(s => s.addSubtask);

  const quick = task.subtasks.filter(s => s.isQuick);
  const pending = quick.filter(s => !s.done);
  const done = quick.filter(s => s.done);

  const [open, setOpen] = useState(pending.length > 0);
  const [showCompleted, setShowCompleted] = useState(false);
  const [newRow, setNewRow] = useState('');

  useEffect(() => {
    setOpen((task.subtasks ?? []).some(s => s.isQuick && !s.done));
    setShowCompleted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const rows = showCompleted ? [...pending, ...done] : pending;
  const cellInp: React.CSSProperties = { width: '100%', fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ border: '1px solid var(--t-brd)', borderRadius: 10, background: 'var(--t-surf)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--t-txt2)', textAlign: 'left' }}>
        <span style={{ fontSize: 12, color: QUICK_BLUE, lineHeight: 1 }}>◷</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick to Act</span>
        {pending.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: `color-mix(in oklab, ${QUICK_BLUE} 14%, var(--t-surf2))`, color: QUICK_BLUE }}>{pending.length}</span>
        )}
        {pending.length === 0 && quick.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>all done</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
      </button>

      {open && (
        <div style={{ padding: '2px 14px 12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 24px 24px', gap: 6, alignItems: 'center', opacity: s.done ? 0.55 : 1 }}>
                <input
                  value={s.title}
                  onChange={e => updateSubtask(task.id, s.id, { title: e.target.value })}
                  style={{ ...cellInp, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--t-muted)' : 'var(--t-txt)' }} />
                <span
                  onClick={() => toggleSubtaskDone(task.id, s.id)}
                  title={s.done ? 'Reopen' : 'Done'}
                  style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, textAlign: 'center', color: s.done ? 'oklch(0.5 0.13 150)' : 'var(--t-brd)', userSelect: 'none' }}>
                  ✓
                </span>
                <span
                  onClick={() => updateSubtask(task.id, s.id, { isQuick: false })}
                  title="Remove from Quick to Act (stays a subtask)"
                  style={{ cursor: 'pointer', fontSize: 13, textAlign: 'center', color: QUICK_BLUE, userSelect: 'none' }}>
                  ◷
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: rows.length > 0 ? 8 : 2, alignItems: 'center' }}>
            <input
              value={newRow}
              onChange={e => setNewRow(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newRow.trim()) { addSubtask(task.id, newRow.trim(), { isQuick: true }); setNewRow(''); } }}
              placeholder="+ Quick thing to do… (also becomes a subtask)"
              style={{ ...cellInp, flex: 1, background: 'transparent', borderStyle: 'dashed' }} />
            {done.length > 0 && (
              <button onClick={() => setShowCompleted(v => !v)}
                style={{ border: 'none', background: 'transparent', color: 'var(--t-muted)', fontSize: 11.5, fontWeight: 600, padding: '4px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', transform: showCompleted ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', fontSize: 11, lineHeight: 1 }}>›</span>
                {showCompleted ? 'Hide completed' : `${done.length} completed`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
