import { useStore } from '../../store';
import type { Task } from '../../types';

export const SCOPE_GREEN = 'oklch(0.5 0.14 150)';

/** In scope unless explicitly opted out (undefined = in — backward compatible). */
export const inScope = (x: { inScope?: boolean }) => x.inScope !== false;

// Task-level "in scope" pill — decides whether the task (and its steps) take
// part in ▶ Play focus mode. Same pill on the card, the task popup and Quick
// Help. Subtask rows carry the same idea as a small ◎ toggle.
export function ScopeToggle({ task, compact }: { task: Task; compact?: boolean }) {
  const updateItem = useStore(s => s.updateItem);
  const on = inScope(task);
  return (
    <button
      onClick={e => { e.stopPropagation(); updateItem(task.id, { inScope: !on }); }}
      title={on ? 'In scope — takes part in ▶ Play. Click to exclude.' : 'Out of scope — skipped by ▶ Play. Click to include.'}
      style={{ fontSize: compact ? 10.5 : 11.5, fontWeight: 700, padding: compact ? '2px 8px' : '3px 10px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
        border: on ? `1px solid ${SCOPE_GREEN}` : '1px solid var(--t-brd)',
        background: on ? `color-mix(in oklab, ${SCOPE_GREEN} 12%, var(--t-surf))` : 'var(--t-surf)',
        color: on ? SCOPE_GREEN : 'var(--t-muted)' }}>
      {on ? '◎ In scope' : '⊘ Out of scope'}
    </button>
  );
}

// Subtask-level ◎ toggle — sits next to ◷ quick on every subtask row.
export function SubScopeToggle({ parentId, sub }: { parentId: string; sub: { id: string; inScope?: boolean } }) {
  const updateSubtask = useStore(s => s.updateSubtask);
  const on = inScope(sub);
  return (
    <div onClick={e => { e.stopPropagation(); updateSubtask(parentId, sub.id, { inScope: !on }); }}
      title={on ? 'In scope for ▶ Play — click to exclude' : 'Out of scope — Play skips this step; click to include'}
      style={{ cursor: 'pointer', fontSize: 14, color: on ? SCOPE_GREEN : 'var(--t-brd)', userSelect: 'none', flexShrink: 0 }}>◎</div>
  );
}
