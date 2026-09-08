import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { QUICK_BLUE } from './QuickToActSection';

export const TYPE_DEFS: { key: 'planned' | 'urgent' | 'quick'; label: string; color: string; bg: string }[] = [
  { key: 'planned', label: 'Planned', color: 'var(--t-acc-dk)', bg: 'var(--t-acc-bg)' },
  { key: 'urgent', label: 'Urgent / same-day', color: 'var(--t-urgent)', bg: 'var(--t-urgent-bg)' },
  { key: 'quick', label: 'Quick help', color: QUICK_BLUE, bg: `color-mix(in oklab, ${QUICK_BLUE} 14%, var(--t-surf))` },
];

export const TYPE_LABEL: Record<string, string> = { planned: 'Planned', urgent: 'Urgent / same-day', quick: 'Quick help', mail: 'Mail' };

const TITLES: Record<string, string> = {
  quick: 'Quick help — leaves the card feed, lives in the ⚡ Quick Help view',
  urgent: 'Unplanned same-day work — its Jira gets the configured urgent label',
  planned: 'Planned work',
};

// The task's Kind (planned / urgent / quick help) as a dropdown — the ONE
// picker on the card feed, the task popup, Quick Help and the Table's Kind
// column. Collapsed it shows the chosen kind; open, the three chips the
// create form uses. ↑↓ moves, Enter picks, Esc closes. An untyped (legacy)
// task shows an amber "Set kind" button until it gets a label.
export function TypePicker({ task, compact }: { task: Task; compact?: boolean }) {
  const updateItem = useStore(s => s.updateItem);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const hiRef = useRef(0);
  hiRef.current = hi;
  const ref = useRef<HTMLDivElement>(null);
  // Popover is position:fixed (anchored to the button's rect) so it escapes
  // overflow:hidden ancestors — e.g. the Table's Kind column.
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, TYPE_DEFS.findIndex(d => d.key === task.type)));
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => (i + 1) % TYPE_DEFS.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => (i - 1 + TYPE_DEFS.length) % TYPE_DEFS.length); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateItem(task.id, { type: TYPE_DEFS[hiRef.current].key }); setOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id]);

  if (task.type === 'mail') return null;
  const cur = TYPE_DEFS.find(d => d.key === task.type);
  const missing = !cur;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setAnchor({ top: r.bottom + 6, left: r.left }); setOpen(o => !o); }} title={open ? 'Close' : missing ? 'Set the kind' : `Kind: ${cur.label} — click to change`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: compact ? '2px 8px' : '3px 10px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
          fontSize: compact ? 10.5 : 11.5, fontWeight: 700,
          border: missing ? '2px solid var(--t-amber)' : `1px solid ${open ? 'var(--t-acc)' : cur.color}`,
          background: missing ? 'var(--t-amber-bg)' : cur.bg, color: missing ? 'var(--t-amber)' : cur.color }}>
        {missing ? 'Set kind' : cur.label}
        <span style={{ fontSize: 10, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>
      {open && (
        <div onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', left: anchor?.left ?? 0, top: anchor?.top ?? 0, zIndex: 120, display: 'flex', gap: 6, flexWrap: 'wrap', padding: 8, minWidth: 260, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 10, boxShadow: '0 10px 32px rgba(0,0,0,0.18)' }}>
          {TYPE_DEFS.map((d, i) => {
            const on = task.type === d.key;
            return (
              <button key={d.key}
                onClick={() => { updateItem(task.id, { type: d.key }); setOpen(false); }}
                onMouseEnter={() => setHi(i)}
                title={TITLES[d.key]}
                style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: on ? `1px solid ${d.color}` : '1px solid var(--t-brd)',
                  background: on ? d.bg : 'var(--t-surf)', color: on ? d.color : 'var(--t-muted)',
                  outline: hi === i ? '2px solid var(--t-acc)' : 'none', outlineOffset: 1 }}>
                {on ? '✓ ' : ''}{d.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
