import { useEffect } from 'react';
import { backdropCloseProps } from '../../backdrop';

interface Props {
  onClose: () => void;
}

interface Row {
  keys: string[];
  what: string;
}

// Grouped reference of every keyboard shortcut in the app. Update alongside
// the handlers (App global block + per-component keydown effects).
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Global',
    rows: [
      { keys: ['⌘/Ctrl', 'K'], what: 'Create task / reminder (Shift+Enter there creates it tagged Quick)' },
      { keys: ['⌘/Ctrl', 'F'], what: 'Search — spotlight anywhere, focuses the box on Explore' },
      { keys: ['1', '…', '9'], what: 'Switch tab: Home · Feed · Explore · Kanban · Table · Quick Help · Hub · Docs · Settings' },
      { keys: ['r'], what: 'Start the Green Play review' },
      { keys: ['m'], what: 'Open the communication assistant' },
      { keys: ['s'], what: 'Start Sprint (war mode)' },
      { keys: ['b'], what: 'Open the bookmarks drawer (the line with a bump at the bottom does the same)' },
      { keys: ['p'], what: "Open Plan — write today's steps (inside the mail assistant, p starts its preview instead)" },
      { keys: ['Shift', 'S'], what: 'Enter Play (focus mode) for the current card — Shift+P does the same' },
      { keys: ['Esc'], what: 'While typing: unfocus the field (shortcuts work again). Otherwise: close any popup / overlay' },
    ],
  },
  {
    title: 'Table',
    rows: [
      { keys: ['↑', '↓'], what: 'Move row focus' },
      { keys: ['Enter'], what: 'Open the focused task' },
      { keys: ['d'], what: 'Open the Daily view (Table page only)' },
      { keys: ['/'], what: 'Focus the search box (Esc clears it)' },
    ],
  },
  {
    title: 'Task popup',
    rows: [
      { keys: ['←', '→'], what: 'Previous / next task in the list' },
    ],
  },
  {
    title: 'Comments (card, popup, Quick Help)',
    rows: [
      { keys: ['Enter'], what: 'Post the comment · Shift+Enter = newline' },
      { keys: ['dbl-click'], what: 'Edit a comment (blur or Enter saves, Esc cancels) · × twice deletes' },
    ],
  },
  {
    title: 'Subtask add fields (card & popup)',
    rows: [
      { keys: ['Enter'], what: 'Add subtask — the green action' },
      { keys: ['Shift', 'Enter'], what: 'Add as quick-to-act — the blue action (also in Quick to Act table)' },
    ],
  },
  {
    title: 'Card feed',
    rows: [
      { keys: ['Enter'], what: 'Continue — next card (right arrow button)' },
      { keys: ['Shift', 'Enter'], what: 'Back to the previous card (left arrow button)' },
    ],
  },
  {
    title: 'Play focus mode',
    rows: [
      { keys: ['Space'], what: 'Step done → star the next step' },
      { keys: ['m'], what: 'Create a communication linked to this task and open it in the assistant' },
      { keys: ['Esc'], what: 'Exit Play' },
    ],
  },
  {
    title: 'Review (Green Play)',
    rows: [
      { keys: ['Space', '/', '→', '↓'], what: 'Advance a step' },
      { keys: ['←', '↑'], what: 'Back a step' },
    ],
  },
  {
    title: 'Sprint',
    rows: [
      { keys: ['←', '→'], what: 'Previous / next item (without marking done or skipped)' },
      { keys: ['click title'], what: 'Expand / collapse the item context' },
      { keys: ['m'], what: 'Create a communication linked to the current item, on top of Sprint' },
    ],
  },
  {
    title: 'Communication assistant',
    rows: [
      { keys: ['Enter'], what: 'Add the typed entry' },
      { keys: ['Shift', 'Enter'], what: 'Add the entry and open it' },
      { keys: ['p'], what: 'Start the preview walkthrough' },
      { keys: ['t'], what: 'Outlook ⇄ Teams — flips the highlighted entry, or the channel new entries get' },
      { keys: ['Enter'], what: 'Sweep (#mail/sweep): Next — file the subject + key point and clear; Done marks the daily Sweep step' },
      { keys: ['↑', '↓'], what: 'Move the highlight through entries' },
      { keys: ['Enter'], what: 'Open the highlighted entry (when the input is empty)' },
    ],
  },
  {
    title: 'Communication assistant — the "Linked card" search inside an open entry',
    rows: [
      { keys: ['↑', '↓'], what: 'Move through matching tasks' },
      { keys: ['Enter'], what: 'Link the highlighted task' },
      { keys: ['Esc'], what: 'Close the dropdown (second Esc closes the assistant)' },
    ],
  },
  {
    title: 'Tags & Kind dropdowns (card, task popup, table)',
    rows: [
      { keys: ['↑', '↓'], what: 'Move between the options' },
      { keys: ['Enter', 'Space'], what: 'Toggle the highlighted tag / pick the kind' },
      { keys: ['Esc'], what: 'Close (the card unpins)' },
    ],
  },
  {
    title: 'Bookmarks drawer',
    rows: [
      { keys: ['/'], what: 'Focus the search (tag:x · folder:x · is:favorite / task / unsorted / dup · free text also matches the source task title)' },
      { keys: ['↑', '↓'], what: 'Move · Enter opens the link in a new tab' },
      { keys: ['e', 'f', 'n'], what: 'Edit · favorite · new bookmark (full form)' },
      { keys: ['Space'], what: 'Select (then Move to / + Tag / ★ / Delete act on the selection)' },
      { keys: ['⌫'], what: 'Delete — Undo in the corner banner' },
      { keys: ['Esc'], what: 'Clear selection → close the drawer' },
    ],
  },
  {
    title: 'Docs editor',
    rows: [
      { keys: ['/'], what: 'At the start of a line: block menu (to-do, headings, toggle, callout, table…) — ↑↓ ↵ esc' },
      { keys: ['[', '['], what: 'Link picker over pages and tasks — ↑↓ ↵ esc' },
      { keys: ['Enter'], what: 'Continue a list / to-do / numbering (empty item ends it)' },
      { keys: ['Tab', '⇧Tab'], what: 'Indent / outdent the line (nests to-dos, fills a toggle)' },
      { keys: ['⌘B', '⌘I', '⌘E', '⌘⇧X'], what: 'Bold · italic · code · strike the selection' },
      { keys: ['⌘Enter'], what: 'Tick the to-do on the current line' },
    ],
  },
  {
    title: 'Daily checklist popup (agenda step)',
    rows: [
      { keys: ['↑', '↓'], what: 'Move between to-dos' },
      { keys: ['Space', 'Enter'], what: 'Tick / untick' },
      { keys: ['Esc'], what: 'Close' },
    ],
  },
  {
    title: 'Guided tour',
    rows: [
      { keys: ['→', 'Enter', 'Space'], what: 'Next step (finishes on the last one)' },
      { keys: ['←'], what: 'Previous step' },
      { keys: ['Esc'], what: 'Leave the tour (sample data is removed)' },
    ],
  },
];

const kbd: React.CSSProperties = {
  display: 'inline-block', padding: '2px 7px', borderRadius: 5,
  border: '1px solid var(--t-brd)', borderBottomWidth: 2,
  background: 'var(--t-surf2)', color: 'var(--t-txt)',
  fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1.4,
  whiteSpace: 'nowrap',
};

export function ShortcutsHelp({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div {...backdropCloseProps(onClose)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 620, maxWidth: '92vw', maxHeight: '84vh', overflowY: 'auto', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-txt)', letterSpacing: '-0.01em' }}>Keyboard shortcuts</div>
          <button onClick={() => { window.dispatchEvent(new CustomEvent('taskflow:start-tour')); onClose(); }}
            style={{ marginLeft: 'auto', marginRight: 14, border: '1px solid var(--t-amber-brd)', background: 'var(--t-amber-bg)', color: 'var(--t-amber)', fontSize: 12.5, fontWeight: 700, padding: '6px 14px', borderRadius: 999, cursor: 'pointer' }}>
            ▶ Take the guided tour
          </button>
          <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 20, lineHeight: 1 }}>×</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--t-muted)', marginBottom: 14 }}>
          Plain-key shortcuts are ignored while you're typing in a field, and work on any keyboard layout.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {GROUPS.map(g => (
            <div key={g.title}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
                {g.title}
                <span style={{ flex: 1, borderTop: '1px solid var(--t-brd2)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {g.rows.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ width: 150, flexShrink: 0, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {r.keys.map((k, j) => k === '/' || k === '…'
                        ? <span key={j} style={{ color: 'var(--t-muted)', fontSize: 11.5 }}>{k}</span>
                        : <span key={j} style={kbd}>{k}</span>)}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--t-txt2)' }}>{r.what}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
