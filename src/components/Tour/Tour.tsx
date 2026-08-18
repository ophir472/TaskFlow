import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { nextId } from '../../engine';
import { buildMailEntry } from '../../mailEntry';

interface Props {
  onClose: () => void;
}

interface TourStep {
  view: string;               // hash to navigate to before showing the step
  target: string | null;      // CSS selector to spotlight; null = centered card
  placement?: 'right' | 'left' | 'top' | 'bottom';
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  { view: 'feed', target: null, title: 'Welcome to TaskFlow 👋', body: "This tour walks the whole app on sample data (everything marked [Tour] — it's deleted when we finish). Move with → / Enter / Space, go back with ←, leave anytime with Esc — while the tour runs, the app's own shortcuts are paused." },
  { view: 'feed', target: '[data-tour="sidebar"]', placement: 'right', title: 'The sidebar', body: 'Seven views — press 1–7 anywhere: Feed, Explore (⌘F search), Kanban, Table, Archive, Docs, Settings. Click the edge to collapse it.' },
  { view: 'feed', target: '[data-tour="create"]', placement: 'right', title: 'Create anything — ⌘K', body: 'One form for tasks, reminders and responsibilities — tag it, mark it Today or quick-to-act as you create. From the same menu you can raise a ServiceNow ticket straight from your saved templates. ⌘K opens it from anywhere.' },
  { view: 'feed', target: '[data-tour="card"]', placement: 'top', title: 'The card feed', body: 'One card at a time, chosen by score: Urgent 6 · Important 3 · Quick 1, plus staleness — untagged tasks always surface first so nothing stays unclassified. Every field on the card edits in place.' },
  { view: 'feed', target: '[data-review-target="subtasks"]', placement: 'right', title: 'Steps live on the card', body: '★ marks the next step, the blue ◷ marks quick-to-act (they gather in the Quick to Act table and in Sprint). Enter adds a subtask, Shift+Enter adds it already-quick. Each subtask can hold its own checklist.' },
  { view: 'feed', target: '[data-review-target="jira"]', placement: 'left', title: 'Tickets', body: 'Jira, ITSM and links — one-click ticket creation (REST or your org\'s pre-filled URL), live ServiceNow status with an "updated since you looked" dot. All of it is configured as data in Settings → Integrations.' },
  { view: 'feed', target: '[data-review-target="communication"]', placement: 'left', title: 'Communications', body: 'The "To send" table and the ✉ assistant show the SAME entries — write here or there, mark sent anywhere. The sample entry is linked to this card.' },
  { view: 'feed', target: '[data-tour="transport"]', placement: 'top', title: 'The transport bar', body: '← previous card · ⏸ hold with a comeback schedule · ▶ Play (focus mode) · 🎉 complete · continue →. Keyboard: Enter continues, Shift+Enter goes back.' },
  { view: 'feed', target: '[data-tour="plan"]', placement: 'right', title: 'Plan the day — p', body: 'Mark cards "Today", then write each task\'s steps here. The lines you type ARE the subtasks. ✓ Complete tracks which tasks are planned; the badge counts what still needs planning.' },
  { view: 'feed', target: '[data-tour="sprint"]', placement: 'right', title: 'Sprint — s', body: 'War mode: everything quick, one item at a time on a dark screen with a running timer. Quick subtasks → Q-tagged tasks → pending mail. Press m mid-item to fire off a linked communication.' },
  { view: 'feed', target: '[data-tour="mail"]', placement: 'right', title: 'Communication assistant — m', body: 'Fast-capture every mail or Teams chat you owe an answer to, draft the reply, link it to its card. The preview stepper (p inside) walks them one at a time.' },
  { view: 'feed', target: '[data-tour="review"]', placement: 'right', title: 'Review — r', body: 'A guided walkthrough of every new or changed task: create the Jira, break it into steps, estimate, then sync updates back to the ticket. The badge counts what awaits review.' },
  { view: 'table', target: null, title: 'The table', body: 'Everything in rows: ↑↓ moves focus, Enter opens, d opens the Daily view, → at the row start opens the task. Select rows for bulk actions or ✦ Assign to AI. Cells edit inline.' },
  { view: 'explore', target: '[data-tour="search"]', placement: 'bottom', title: 'Search — ⌘F', body: 'Explore searches everything — titles, notes, subtasks, docs, mail. ⌘F from any view opens a floating spotlight; Enter there hands the query off to this page. Results update as you type.' },
  { view: 'docs', target: null, title: 'Docs', body: 'A built-in notebook: notebooks → categories → pages. Every page has its own URL (#docs/<page>) so it can be linked from any task, and it all rides the same backup pipeline as your tasks.' },
  { view: 'settings/backup', target: null, title: 'Never lose work', body: 'Pick a backup folder here (ideally inside OneDrive/Dropbox): every change mirrors to disk within a second, plus 7 days of versioned snapshots you can preview and restore.' },
  { view: 'settings', target: null, title: 'That\'s the loop 🎉', body: 'Daily rhythm: mark Today → Plan the steps (p) → Play them (Shift+S) → Sprint the quick stuff (s) → Review (r). Press ? in Settings anytime for every shortcut. Removing the sample data now — enjoy!' },
];

const TOUR_PREFIX = '[Tour] ';

// Interactive onboarding: spotlights real UI with an arrow + explanation,
// step by step, on self-cleaning sample data.
export function Tour({ onClose }: Props) {
  const createItem = useStore(s => s.createItem);
  const items = useStore(s => s.items);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const created = useRef(false);

  // Seed sample data once (cleaning any leftovers from an interrupted tour).
  useEffect(() => {
    if (created.current) return;
    created.current = true;
    const st = useStore.getState();
    st.items.filter(it => it.title.startsWith(TOUR_PREFIX)).forEach(it => st.deleteItem(it.id));
    const now = Date.now();
    const taskId = nextId('t');
    const task: Task = {
      id: taskId, kind: 'task', title: TOUR_PREFIX + 'Prepare the quarterly demo',
      description: '', notes: 'Sample task — poke around, everything is editable. It disappears when the tour ends.',
      blockers: '', generalLink: '', jiraLink: '', requester: '', project: '',
      status: 'in_progress', urgent: true, important: false, quick: false, noTag: false,
      forToday: true, toCheck: '', priorityBoost: false,
      subtasks: [
        { id: nextId('s'), title: 'Collect usage numbers', done: false, isNext: true, jira: '', generalLink: '', notes: '', blockers: '', estimate: '2h', createdAt: now },
        { id: nextId('s'), title: 'Draft the slides', done: false, isNext: false, jira: '', generalLink: '', notes: '', blockers: '', isQuick: true, createdAt: now },
        { id: nextId('s'), title: 'Rehearse with the team', done: false, isNext: false, jira: '', generalLink: '', notes: '', blockers: '', checklist: [{ id: nextId('cl'), text: 'Book a room', done: false }, { id: nextId('cl'), text: 'Send the invite', done: true }], createdAt: now },
      ],
      waitingFor: { columns: ['Waiting for', 'From'], rows: [{ id: nextId('w'), cells: ['Analytics numbers', 'Dana'], done: false }] },
      bumpedAt: now, staleness: 0.4, createdAt: now, updatedAt: now, archived: false,
    };
    createItem(task);
    createItem(buildMailEntry(TOUR_PREFIX + 'Reply to Dana about the audit', taskId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupAndClose = useCallback(() => {
    const st = useStore.getState();
    st.items.filter(it => it.title.startsWith(TOUR_PREFIX)).forEach(it => st.deleteItem(it.id));
    if (window.location.hash.slice(1).split('/')[0] !== 'feed') window.location.hash = 'feed';
    onClose();
  }, [onClose]);

  const step = STEPS[idx];

  // Navigate + measure the target (retry while views mount/settle).
  useEffect(() => {
    const seg = window.location.hash.slice(1);
    if (seg !== step.view) window.location.hash = step.view;
    let alive = true;
    let tries = 0;
    let scrolled = false;
    const measure = () => {
      if (!alive) return;
      const el = step.target ? document.querySelector(step.target) : null;
      if (el) {
        if (!scrolled) {
          scrolled = true;
          const r = el.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight)
            el.scrollIntoView({ block: r.height > window.innerHeight * 0.7 ? 'start' : 'center' });
        }
        setRect(el.getBoundingClientRect());
      }
      else if (step.target && tries++ < 10) { setTimeout(measure, 120); return; }
      else setRect(null);
    };
    setRect(null);
    setTimeout(measure, 60);
    // Some views (Explore) auto-focus an input on mount, which would capture
    // the tour's navigation keys — blur whatever grabbed focus at step start.
    const blur = () => {
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) a.blur();
    };
    const blurTimers = [setTimeout(blur, 150), setTimeout(blur, 450)];
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    // #root is the scroll container — capture-phase so we hear its scrolls
    // and keep the spotlight glued to the target while the user scrolls.
    window.addEventListener('scroll', onResize, true);
    return () => { alive = false; blurTimers.forEach(clearTimeout); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing into the sample card stays normal — form controls keep every key.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const next = e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ' || e.code === 'Space';
      if (e.key === 'Escape') { e.stopImmediatePropagation(); cleanupAndClose(); }
      else if (next) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (idx >= STEPS.length - 1) cleanupAndClose();
        else setIdx(i => i + 1);
      }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); setIdx(i => Math.max(i - 1, 0)); }
      // Anything else: pause the app's shortcuts while the tour is running.
      // Modifier combos keep their browser default (reload, copy…) — we only
      // stop them from reaching the app's own handlers.
      else if (e.metaKey || e.ctrlKey) e.stopImmediatePropagation();
      else { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    // Capture so views under the tour don't react to the same keys.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [cleanupAndClose, idx]);

  // Tooltip geometry.
  const W = 340;
  const pad = 18;
  const vw = window.innerWidth, vh = window.innerHeight;
  let tipStyle: React.CSSProperties;
  if (!rect) {
    tipStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const pl = step.placement ?? 'bottom';
    if (pl === 'right') tipStyle = { left: Math.min(rect.right + pad, vw - W - 16), top: Math.min(Math.max(rect.top, 16), vh - 280) };
    else if (pl === 'left') tipStyle = { left: Math.max(rect.left - W - pad, 16), top: Math.min(Math.max(rect.top, 16), vh - 280) };
    else if (pl === 'top') {
      // A target that already fills the screen leaves no room above — clamp
      // so the tooltip overlaps its top edge instead of leaving the viewport.
      const bottom = Math.max(Math.min(vh - rect.top + pad, vh - 270), 16);
      tipStyle = { left: Math.min(Math.max(rect.left + rect.width / 2 - W / 2, 16), vw - W - 16), bottom };
    }
    else tipStyle = { left: Math.min(Math.max(rect.left + rect.width / 2 - W / 2, 16), vw - W - 16), top: Math.min(rect.bottom + pad, vh - 300) };
  }

  // Arrow from the tooltip's edge toward the target.
  let arrow: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (rect && step.target) {
    const pl = step.placement ?? 'bottom';
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (pl === 'right') arrow = { x1: Math.min(rect.right + pad, vw - W - 16) - 4, y1: Math.min(Math.max(rect.top, 16), vh - 280) + 40, x2: rect.right + 6, y2: cy };
    else if (pl === 'left') arrow = { x1: Math.max(rect.left - W - pad, 16) + W + 4, y1: Math.min(Math.max(rect.top, 16), vh - 280) + 40, x2: rect.left - 6, y2: cy };
    else if (pl === 'top') arrow = rect.top > 290 ? { x1: cx, y1: rect.top - pad - 6, x2: cx, y2: rect.top - 4 } : null;
    else arrow = { x1: cx, y1: Math.min(rect.bottom + pad, vh - 300) - 4, x2: cx, y2: rect.bottom + 4 };
  }

  return (
    <>
      {/* Spotlight ring + dim (hole via giant box-shadow) */}
      {rect ? (
        <div style={{ position: 'fixed', left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, borderRadius: 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', border: '2px solid var(--t-amber)', zIndex: 600, pointerEvents: 'none', transition: 'all 0.25s ease' }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 600 }} />
      )}

      {/* Arrow */}
      {arrow && (
        <svg style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 601, pointerEvents: 'none' }}>
          <defs>
            <marker id="tour-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--t-amber)" />
            </marker>
          </defs>
          <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke="var(--t-amber)" strokeWidth={2.5} markerEnd="url(#tour-arrow)" />
        </svg>
      )}

      {/* Explanation card */}
      <div style={{ position: 'fixed', width: W, zIndex: 602, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderTop: '3px solid var(--t-amber)', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.35)', padding: '16px 18px', boxSizing: 'border-box', ...tipStyle }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--t-txt)', flex: 1 }}>{step.title}</div>
          <div style={{ fontSize: 11, color: 'var(--t-muted)', flexShrink: 0 }}>{idx + 1} / {STEPS.length}</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--t-txt2)', lineHeight: 1.55, marginBottom: 14 }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={cleanupAndClose}
            style={{ border: 'none', background: 'transparent', color: 'var(--t-muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '6px 4px' }}>
            Skip tour
          </button>
          <div style={{ flex: 1 }} />
          {idx > 0 && (
            <button onClick={() => setIdx(i => i - 1)}
              style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' }}>
              ← Back
            </button>
          )}
          {idx < STEPS.length - 1 ? (
            <button onClick={() => setIdx(i => i + 1)}
              style={{ border: 'none', background: 'var(--t-amber)', color: 'white', fontSize: 12.5, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer' }}>
              Next →
            </button>
          ) : (
            <button onClick={cleanupAndClose}
              style={{ border: 'none', background: 'var(--t-success)', color: 'white', fontSize: 12.5, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer' }}>
              Finish 🎉
            </button>
          )}
        </div>
      </div>
    </>
  );
}
