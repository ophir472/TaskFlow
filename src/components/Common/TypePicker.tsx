import { useStore } from '../../store';
import type { Task } from '../../types';
import { QUICK_BLUE } from './QuickToActSection';

export const TYPE_DEFS: { key: 'planned' | 'urgent' | 'quick'; label: string; color: string; bg: string }[] = [
  { key: 'planned', label: 'Planned', color: 'var(--t-acc-dk)', bg: 'var(--t-acc-bg)' },
  { key: 'urgent', label: 'Urgent / same-day', color: 'var(--t-urgent)', bg: 'var(--t-urgent-bg)' },
  { key: 'quick', label: 'Quick help', color: QUICK_BLUE, bg: `color-mix(in oklab, ${QUICK_BLUE} 14%, var(--t-surf))` },
];

export const TYPE_LABEL: Record<string, string> = { planned: 'Planned', urgent: 'Urgent / same-day', quick: 'Quick help', mail: 'Mail' };

// The task's Type label (planned / urgent / quick help) — the ONE picker,
// rendered on the card feed, the task popup and the Quick Help view so the
// entity looks the same everywhere. A legacy untyped task renders with an
// amber attention ring until it gets a label (new tasks can't be untyped).
export function TypePicker({ task, compact }: { task: Task; compact?: boolean }) {
  const updateItem = useStore(s => s.updateItem);
  if (task.type === 'mail') return null;
  const missing = !task.type;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: missing ? '5px 9px' : 0, borderRadius: 10,
      border: missing ? '2px solid var(--t-amber)' : 'none',
      background: missing ? 'var(--t-amber-bg)' : 'transparent' }}>
      {missing && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-amber)', whiteSpace: 'nowrap' }}>Set kind:</span>}
      {TYPE_DEFS.map(d => {
        const on = task.type === d.key;
        return (
          <button key={d.key}
            onClick={e => { e.stopPropagation(); updateItem(task.id, { type: d.key }); }}
            title={d.key === 'quick' ? 'Quick help — leaves the card feed, lives in the ⚡ Quick Help view' : d.key === 'urgent' ? 'Unplanned same-day work — its Jira gets the configured urgent label' : 'Planned work'}
            style={{ fontSize: compact ? 10.5 : 11.5, fontWeight: 700, padding: compact ? '2px 8px' : '3px 10px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
              border: on ? `1px solid ${d.color}` : '1px solid var(--t-brd)',
              background: on ? d.bg : 'var(--t-surf)',
              color: on ? d.color : 'var(--t-muted)' }}>
            {on ? '✓ ' : ''}{d.label}
          </button>
        );
      })}
    </div>
  );
}
