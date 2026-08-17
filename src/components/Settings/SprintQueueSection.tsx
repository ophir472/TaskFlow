import { useState } from 'react';
import { useStore } from '../../store';
import { buildSprintPool, resolveSprintTarget } from '../Sprint/SprintMode';
import { QUICK_BLUE } from '../Common/QuickToActSection';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };

const KIND_COLORS: Record<string, { bg: string; fg: string }> = {
  'Quick subtask': { bg: `color-mix(in oklab, ${QUICK_BLUE} 14%, var(--t-surf2))`, fg: QUICK_BLUE },
  'Quick task': { bg: 'var(--t-quick-bg)', fg: 'var(--t-quick)' },
  'Mail to send': { bg: 'var(--t-amber-bg)', fg: 'var(--t-amber)' },
};

// Shows exactly what ▶ Sprint will walk through on next start — same pool
// builder the Sprint overlay uses, so this can't drift from reality.
export function SprintQueueSection() {
  const items = useStore(s => s.items);
  const [open, setOpen] = useState(false);

  const rows = buildSprintPool(items)
    .map(t => resolveSprintTarget(t, items))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Sprint queue</div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: rows.length > 0 ? `color-mix(in oklab, ${QUICK_BLUE} 14%, var(--t-surf2))` : 'var(--t-surf3)', color: rows.length > 0 ? QUICK_BLUE : 'var(--t-muted)' }}>
          {rows.length}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {rows.length > 0 && (
            <button onClick={() => { window.location.hash = 'sprint'; }}
              style={{ border: 'none', background: 'var(--t-txt)', color: 'var(--t-bg)', fontSize: 12.5, fontWeight: 700, padding: '6px 14px', borderRadius: 999, cursor: 'pointer' }}>
              ▶ Start sprint
            </button>
          )}
          <button onClick={() => setOpen(o => !o)}
            style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer' }}>
            {open ? 'Hide queue' : 'Show queue'}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: open && rows.length > 0 ? 12 : 0 }}>
        Everything ▶ Sprint (or the <b>s</b> key) will walk through: quick subtasks, Q-tagged tasks, then pending mail — in that order.
      </div>
      {open && (
        rows.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>Queue is empty — nothing quick is pending.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r, i) => {
              const c = KIND_COLORS[r.kindLabel] ?? { bg: 'var(--t-surf3)', fg: 'var(--t-muted)' };
              const parent = r.context.find(f => (f.label === 'Task' || f.label === 'Linked card') && f.value !== '—')?.value;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.fg, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {r.kindLabel}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t-txt)' }}>
                    {r.title}
                  </span>
                  {parent && (
                    <span style={{ fontSize: 11.5, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180, flexShrink: 0 }}>
                      {parent}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
