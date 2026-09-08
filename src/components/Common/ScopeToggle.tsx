import { useStore } from '../../store';

export const SCOPE_GREEN = 'oklch(0.5 0.14 150)';

/** In scope unless explicitly opted out (undefined = in — backward compatible). */
export const inScope = (x: { inScope?: boolean }) => x.inScope !== false;

// Subtask-level ◎ toggle — sits next to ◷ quick on every subtask row and
// decides whether ▶ Play stars/executes that step. Scope is a STEP
// property only; tasks have no scope flag.
export function SubScopeToggle({ parentId, sub }: { parentId: string; sub: { id: string; inScope?: boolean } }) {
  const updateSubtask = useStore(s => s.updateSubtask);
  const on = inScope(sub);
  return (
    <div onClick={e => { e.stopPropagation(); updateSubtask(parentId, sub.id, { inScope: !on }); }}
      title={on ? 'In scope for ▶ Play — click to exclude' : 'Out of scope — Play skips this step; click to include'}
      style={{ cursor: 'pointer', fontSize: 14, color: on ? SCOPE_GREEN : 'var(--t-brd)', userSelect: 'none', flexShrink: 0 }}>◎</div>
  );
}
