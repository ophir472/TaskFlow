import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';

export type TagKey = 'urgent' | 'important' | 'quick' | 'noTag';

export const TAG_DEFS: { key: TagKey; label: string; color: string; bg: string; border: string }[] = [
  { key: 'urgent',    label: 'Urgent',        color: 'var(--t-urgent)',    bg: 'var(--t-urgent-bg)',    border: 'var(--t-urgent)'    },
  { key: 'important', label: 'Important',     color: 'var(--t-important)', bg: 'var(--t-important-bg)', border: 'var(--t-important)' },
  { key: 'quick',     label: 'Quick',         color: 'var(--t-quick)',     bg: 'var(--t-quick-bg)',     border: 'var(--t-quick)'     },
  { key: 'noTag',     label: 'None of these', color: 'var(--t-txt2)',      bg: 'var(--t-surf3)',        border: 'var(--t-muted)'     },
];

interface Props {
  task: Task;
  // Controlled open state (the card feed ties it to its tag-edit mode, which
  // pins the card so queue re-sorts don't move it away mid-edit).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Priority tags as a dropdown: collapsed, the button shows the chosen tags
// (or "Untagged"); open, the same four chips as the create form. ↑↓ moves,
// Enter/Space toggles, Esc closes. Shared by the card feed and the popup.
export function TagDropdown({ task, open: openProp, onOpenChange }: Props) {
  const toggleTag = useStore(s => s.toggleTag);
  const [openLocal, setOpenLocal] = useState(false);
  const open = openProp ?? openLocal;
  const setOpen = (v: boolean) => { setOpenLocal(v); onOpenChange?.(v); };
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => (i + 1) % TAG_DEFS.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => (i - 1 + TAG_DEFS.length) % TAG_DEFS.length); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTag(task.id, TAG_DEFS[hi].key); }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hi, task.id]);

  const active = TAG_DEFS.filter(d => task[d.key]);
  const untagged = active.length === 0;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(!open)} title={open ? 'Close' : 'Edit tags'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 8px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          border: `1.5px solid ${untagged ? 'var(--t-amber)' : open ? 'var(--t-acc)' : 'var(--t-brd)'}`,
          background: untagged ? 'var(--t-amber-bg)' : 'var(--t-surf)', color: untagged ? 'var(--t-amber)' : 'var(--t-txt2)' }}>
        {untagged ? <span>Untagged — pick tags</span> : active.map(d => (
          <span key={d.key} style={{ padding: '1px 8px', borderRadius: 20, fontSize: 12, fontWeight: 700, color: d.color, background: d.bg, border: `1px solid ${d.border}` }}>{d.label}</span>
        ))}
        <span style={{ fontSize: 11, color: 'var(--t-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 40, display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10, minWidth: 320, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, boxShadow: '0 10px 32px rgba(0,0,0,0.18)' }}>
          {TAG_DEFS.map((d, i) => {
            const on = !!task[d.key];
            return (
              <div key={d.key} onClick={() => toggleTag(task.id, d.key)} onMouseEnter={() => setHi(i)}
                style={{ padding: '7px 13px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', userSelect: 'none',
                  border: `1.5px solid ${on ? d.border : 'var(--t-brd)'}`, color: on ? d.color : 'var(--t-txt2)', background: on ? d.bg : 'transparent',
                  outline: hi === i ? '2px solid var(--t-acc)' : 'none', outlineOffset: 1 }}>
                {on ? '✓ ' : ''}{d.label}
              </div>
            );
          })}
          <div style={{ width: '100%', fontSize: 11, color: 'var(--t-muted)' }}>↑↓ move · ↵ toggle · esc close</div>
        </div>
      )}
    </div>
  );
}
