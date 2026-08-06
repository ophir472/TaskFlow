import { useState } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';

interface Props {
  task: Task;
  /** Start expanded when first rendered. */
  startOpen?: boolean;
}

// Collapsible section: one free-text estimate input per subtask plus one total
// input at the bottom. Values are plain strings — user can write "2h", "3d",
// "quick", etc. No parsing or arithmetic.
export function EstimatesSection({ task, startOpen }: Props) {
  const updateItem = useStore(s => s.updateItem);
  const updateSubtask = useStore(s => s.updateSubtask);
  const [open, setOpen] = useState<boolean>(!!startOpen);

  const filledSubtasks = task.subtasks.filter(s => (s.estimate ?? '').trim().length > 0).length;
  const summaryBits: string[] = [];
  if (task.subtasks.length > 0) summaryBits.push(`${filledSubtasks}/${task.subtasks.length} subtasks`);
  if (task.estimate) summaryBits.push(`total ${task.estimate}`);

  const inp: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '6px 9px', borderRadius: 6,
    border: '1px solid var(--t-brd)', background: 'var(--t-surf2)',
    color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none',
  };

  return (
    <div data-review-target="estimate" style={{
      border: '1px solid var(--t-brd)', borderRadius: 10,
      background: 'var(--t-surf)',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', width: '100%',
          gap: 8, padding: '10px 14px', border: 'none', background: 'transparent',
          cursor: 'pointer', color: 'var(--t-txt2)', textAlign: 'left',
        }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimates</span>
        {summaryBits.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--t-muted)', marginLeft: 4 }}>· {summaryBits.join(' · ')}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
      </button>
      {open && (
        <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {task.subtasks.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--t-muted)', fontStyle: 'italic' }}>
              No subtasks yet — add them above to estimate individually.
            </div>
          )}
          {task.subtasks.map(sub => (
            <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                flex: 1, fontSize: 13, color: sub.done ? 'var(--t-muted)' : 'var(--t-txt2)',
                textDecoration: sub.done ? 'line-through' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={sub.title}>{sub.title}</span>
              <input
                value={sub.estimate ?? ''}
                onChange={e => updateSubtask(task.id, sub.id, { estimate: e.target.value })}
                placeholder="e.g. 2h"
                style={{ ...inp, width: 100, flexShrink: 0 }}
              />
            </div>
          ))}
          <div style={{
            marginTop: 4, paddingTop: 10, borderTop: '1px dashed var(--t-brd)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--t-txt2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
            <input
              value={task.estimate ?? ''}
              onChange={e => updateItem(task.id, { estimate: e.target.value })}
              placeholder="e.g. 30h"
              style={{ ...inp, width: 100, flexShrink: 0 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
