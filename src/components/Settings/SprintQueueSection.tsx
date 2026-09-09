import { useState } from 'react';
import { useStore } from '../../store';
import { buildSprintPool, resolveSprintTarget, sprintTargetKey, type SprintTarget } from '../Sprint/SprintMode';
import { QUICK_BLUE } from '../Common/QuickToActSection';
import type { SprintTypeToggles } from '../../types';
import { TaskModal } from '../TaskModal/TaskModal';
import { MailEntryPopup } from '../Mail/MailEntryPopup';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };

const KIND_COLORS: Record<string, { bg: string; fg: string }> = {
  'Quick subtask': { bg: `color-mix(in oklab, ${QUICK_BLUE} 14%, var(--t-surf2))`, fg: QUICK_BLUE },
  'Quick task': { bg: 'var(--t-quick-bg)', fg: 'var(--t-quick)' },
  'Mail to send': { bg: 'var(--t-amber-bg)', fg: 'var(--t-amber)' },
};

const TOGGLE_DEFS: { key: keyof SprintTypeToggles; label: string }[] = [
  { key: 'mail', label: 'Mail' },
  { key: 'quickTask', label: 'Quick tasks' },
  { key: 'quickSubtask', label: 'Quick sub-tasks' },
  { key: 'todayOnly', label: 'Today only' },
];

interface Row {
  target: SprintTarget;
  key: string;
  title: string;
  kindLabel: string;
  parent?: string;
}

function moveWithin<T>(list: T[], from: number, to: number): T[] {
  const n = [...list];
  const [x] = n.splice(from, 1);
  n.splice(to, 0, x);
  return n;
}

// Shows exactly what ▶ Sprint will walk through on next start — same pool
// builder the Sprint overlay uses, so this can't drift from reality.
// Toggles gate which types enter the pool; rows drag-reorder WITHIN their
// section (mail can't cross into tasks and vice versa); clicking a row
// opens the item as an overlay on top of Settings.
export function SprintQueueSection() {
  const items = useStore(s => s.items);
  const storedToggles = useStore(s => s.sprintTypeToggles);
  const toggles = { todayOnly: true, ...storedToggles };   // missing todayOnly = on
  const sprintOrder = useStore(s => s.sprintOrder);
  const setSprintTypeToggle = useStore(s => s.setSprintTypeToggle);
  const setSprintOrder = useStore(s => s.setSprintOrder);
  const [open, setOpen] = useState(false);
  const [openTarget, setOpenTarget] = useState<SprintTarget | null>(null);
  const [drag, setDrag] = useState<{ section: number; index: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ section: number; index: number } | null>(null);

  const rows: Row[] = buildSprintPool(items, toggles, sprintOrder)
    .map((target): Row | null => {
      const r = resolveSprintTarget(target, items);
      if (!r) return null;
      const parent = r.context.find(f => (f.label === 'Task' || f.label === 'Linked card') && f.value !== '—')?.value;
      return { target, key: sprintTargetKey(target), title: r.title, kindLabel: r.kindLabel, parent };
    })
    .filter((r): r is Row => r !== null);

  // Section split mirrors the pool builder: mail block first, then the rest.
  const sections: { name: string; rows: Row[] }[] = [
    { name: 'Mail', rows: rows.filter(r => r.target.kind === 'mail') },
    { name: 'Tasks & sub-tasks (oldest first)', rows: rows.filter(r => r.target.kind !== 'mail') },
  ].filter(s => s.rows.length > 0);

  function handleDrop(sectionIdx: number, index: number) {
    if (!drag || drag.section !== sectionIdx || drag.index === index) { setDrag(null); setDragOver(null); return; }
    const reordered = sections.map((s, i) =>
      i === sectionIdx ? moveWithin(s.rows, drag.index, index) : s.rows);
    setSprintOrder(reordered.flat().map(r => r.key));
    setDrag(null);
    setDragOver(null);
  }

  return (
    <div style={card}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, cursor: 'pointer' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Sprint queue</div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: rows.length > 0 ? `color-mix(in oklab, ${QUICK_BLUE} 14%, var(--t-surf2))` : 'var(--t-surf3)', color: rows.length > 0 ? QUICK_BLUE : 'var(--t-muted)' }}>
          {rows.length}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {rows.length > 0 && (
            <button onClick={e => { e.stopPropagation(); window.location.hash = 'sprint'; }}
              style={{ border: 'none', background: 'var(--t-txt)', color: 'var(--t-bg)', fontSize: 12.5, fontWeight: 700, padding: '6px 14px', borderRadius: 999, cursor: 'pointer' }}>
              ▶ Start sprint
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
            style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer' }}>
            {open ? 'Hide queue' : 'Show queue'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: open ? 12 : 0 }}>
        <span style={{ fontSize: 13, color: 'var(--t-muted)' }}>
          Pending mail first, then quick tasks &amp; sub-tasks (from Today cards only, unless you switch that off), oldest first. In queue:
        </span>
        {TOGGLE_DEFS.map(({ key, label }) => (
          <button key={key}
            onClick={e => { e.stopPropagation(); setSprintTypeToggle(key, !toggles[key]); }}
            title={key === 'todayOnly' ? ((toggles.todayOnly ?? true) ? 'Only quick work from cards marked Today enters the pool — click to include every card' : 'Quick work from every card enters the pool — click to limit it to Today cards') : toggles[key] ? `${label} are in the sprint pool — click to exclude` : `${label} are excluded — click to include`}
            style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
              border: toggles[key] ? `1px solid ${QUICK_BLUE}` : '1px solid var(--t-brd)',
              background: toggles[key] ? `color-mix(in oklab, ${QUICK_BLUE} 12%, var(--t-surf))` : 'var(--t-surf)',
              color: toggles[key] ? QUICK_BLUE : 'var(--t-muted)' }}>
            {toggles[key] ? '✓ ' : ''}{label}
          </button>
        ))}
      </div>
      {open && (
        rows.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>Queue is empty — nothing quick is pending.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sections.map((sec, si) => (
              <div key={sec.name}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                  {sec.name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sec.rows.map((r, i) => {
                    const c = KIND_COLORS[r.kindLabel] ?? { bg: 'var(--t-surf3)', fg: 'var(--t-muted)' };
                    const isOver = dragOver?.section === si && dragOver.index === i && drag && (drag.section !== si || drag.index !== i);
                    return (
                      <div key={r.key}
                        draggable
                        onDragStart={() => setDrag({ section: si, index: i })}
                        onDragOver={e => { if (drag?.section === si) { e.preventDefault(); setDragOver({ section: si, index: i }); } }}
                        onDragLeave={() => setDragOver(cur => (cur?.section === si && cur.index === i) ? null : cur)}
                        onDrop={() => handleDrop(si, i)}
                        onDragEnd={() => { setDrag(null); setDragOver(null); }}
                        onClick={() => setOpenTarget(r.target)}
                        title="Click to open · drag to reorder"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--t-surf2)',
                          border: isOver ? '1px solid var(--t-acc)' : '1px solid var(--t-brd2)', borderRadius: 8, fontSize: 13,
                          cursor: 'pointer', opacity: drag?.section === si && drag.index === i ? 0.45 : 1 }}>
                        <span style={{ color: 'var(--t-muted)', fontSize: 12, cursor: 'grab', flexShrink: 0 }}>⠿</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.fg, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {r.kindLabel}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t-txt)' }}>
                          {r.title}
                        </span>
                        {r.parent && (
                          <span style={{ fontSize: 11.5, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180, flexShrink: 0 }}>
                            {r.parent}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}
      {/* Item overlays — on top of Settings, no page change. */}
      {openTarget && openTarget.kind !== 'mail' && (
        <TaskModal taskId={openTarget.taskId} onClose={() => setOpenTarget(null)} urlDriven={false}
          initialSubId={openTarget.kind === 'subtask' ? openTarget.subId : undefined} />
      )}
      {openTarget && openTarget.kind === 'mail' && (
        <MailEntryPopup entryId={openTarget.taskId} onClose={() => setOpenTarget(null)} />
      )}
    </div>
  );
}
