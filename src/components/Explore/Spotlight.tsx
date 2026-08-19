import { useState, useEffect, useRef, useMemo } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import { nextId, scoreItem } from '../../engine';
import { searchItems } from './Explore';
import { ReminderModal } from '../ReminderPopup/ReminderModal';
import { TaskModal } from '../TaskModal/TaskModal';
import type { Item, Task } from '../../types';

interface Props {
  onClose: () => void;
  onToast: (msg: string) => void;
}

const KIND_LABEL: Record<string, string> = { task: 'Task', reminder: 'Reminder' };
const KIND_COLOR: Record<string, string> = { task: 'var(--t-txt2)', reminder: 'var(--t-amber)' };

// Floating spotlight-style search (Cmd+F anywhere outside the Explore tab).
// Shows the same live results as the Explore tab, keyboard-navigable:
//   ↑/↓ move · ↵ open highlighted (or jump to Explore when nothing is
//   highlighted) · ⇧↵ quick-create · Esc close.
export function Spotlight({ onClose, onToast }: Props) {
  const items = useStore(s => s.items);
  const setExploreQuery = useStore(s => s.setExploreQuery);
  const setView = useStore(s => s.setView);
  const createItem = useStore(s => s.createItem);
  const setTriggerTagForId = useStore(s => s.setTriggerTagForId);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [reminderModalId, setReminderModalId] = useState<string | null>(null);
  const reminderModalRef = useRef<string | null>(null);
  reminderModalRef.current = reminderModalId;
  const [taskModalId, setTaskModalId] = useState<string | null>(null);
  const taskModalRef = useRef<string | null>(null);
  taskModalRef.current = taskModalId;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchItems(items, query), [items, query]);
  const open = query.trim().length > 0;
  const totalRows = results.length + 1; // + quick-create row

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setHighlightIdx(-1); }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // When a form/modal is open on top, Escape belongs to it (each has
      // its own listener) — don't tear down the whole spotlight underneath.
      if (reminderModalRef.current || taskModalRef.current) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Blur the input while the reminder form is open so its keyboard handling
  // isn't swallowed by the search field.
  useEffect(() => {
    if (reminderModalId || taskModalId) inputRef.current?.blur();
  }, [reminderModalId, taskModalId]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (highlightIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  function goExplore() {
    setExploreQuery(query);
    setView('explore');
    onClose();
  }

  function handleOpen(item: Item) {
    if (item.kind === 'task') {
      // The card overlay opens right here, on top of the spotlight — no
      // page change. "Open in Explore →" is the way to the full list.
      setTaskModalId(item.id);
    } else {
      // Reminders open their simple form right here, on top of the spotlight
      // — same modal as Explore/Table, same behavior on every page.
      setReminderModalId(item.id);
    }
  }

  function quickCreate() {
    const title = query.trim();
    if (!title) return;
    const now = Date.now();
    const id = nextId('t');
    createItem({
      id, kind: 'task', title, description: '', notes: '', blockers: '', generalLink: '', jiraLink: '',
      requester: '', project: '', status: 'backlog', forToday: false,
      urgent: false, important: false, quick: false, noTag: false,
      toCheck: '', priorityBoost: false, subtasks: [],
      bumpedAt: 0, staleness: 0, createdAt: now, updatedAt: now, archived: false,
    });
    setTriggerTagForId(id);
    onToast(`Created "${title}"`);
    onClose();
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (reminderModalId) return;
    if (!open) {
      if (e.key === 'Enter') { e.preventDefault(); goExplore(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => (i < totalRows - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => (i > 0 ? i - 1 : totalRows - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) { quickCreate(); return; }
      if (highlightIdx >= 0 && highlightIdx < results.length) handleOpen(results[highlightIdx]);
      else if (highlightIdx === results.length) quickCreate();
      else goExplore();
    }
  }

  return (
    <div
      {...backdropCloseProps(onClose)}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 85,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(640px, 92vw)',
          background: 'var(--t-surf)', borderRadius: 16,
          boxShadow: '0 24px 70px rgba(0,0,0,0.4)',
          border: '1px solid var(--t-brd)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          maxHeight: '64vh',
        }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <span style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-muted)', fontSize: 21, pointerEvents: 'none' }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search everything…"
            style={{
              width: '100%', fontSize: 18, padding: '18px 20px 18px 54px',
              border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--t-txt)', boxSizing: 'border-box',
              borderBottom: open ? '1px solid var(--t-brd2)' : 'none',
            }}
          />
        </div>

        {open && (
          <>
            <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
              {results.map((item, idx) => (
                <div key={item.id}
                  onClick={() => handleOpen(item)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '11px 20px',
                    cursor: 'pointer', borderBottom: '1px solid var(--t-brd2)',
                    background: highlightIdx === idx ? 'var(--t-surf2)' : 'var(--t-surf)',
                  }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--t-txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </div>
                    {item.kind === 'task' && (
                      <div style={{ fontSize: 12, color: 'var(--t-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[(item as Task).requester, (item as Task).project, (item as Task).jiraLink].filter(Boolean).join(' · ') || (item as Task).status.replace('_', ' ')}
                      </div>
                    )}
                  </div>
                  {item.kind === 'task' && (
                    <span style={{ fontSize: 11.5, color: 'var(--t-muted)', flexShrink: 0 }}>score {scoreItem(item).toFixed(0)}</span>
                  )}
                  <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: KIND_COLOR[item.kind], flexShrink: 0 }}>
                    {KIND_LABEL[item.kind]}
                  </span>
                </div>
              ))}
              {/* Quick create — last keyboard-reachable row */}
              <div
                onClick={quickCreate}
                onMouseEnter={() => setHighlightIdx(results.length)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px',
                  cursor: 'pointer', color: 'var(--t-acc)',
                  background: highlightIdx === results.length ? 'var(--t-acc-bg)' : 'var(--t-surf)',
                }}>
                <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1 }}>+</span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>Create task "<span style={{ fontStyle: 'italic' }}>{query.trim()}</span>"</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-acc-dk)', background: 'var(--t-acc-bg)', padding: '2px 8px', borderRadius: 6, flexShrink: 0 }}>⇧↵</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 20px', borderTop: '1px solid var(--t-brd2)', background: 'var(--t-surf2)', fontSize: 11, color: 'var(--t-muted)', flexShrink: 0 }}>
              <span onClick={goExplore} style={{ cursor: 'pointer', color: 'var(--t-acc-dk)', fontWeight: 600 }}>
                Open in Explore →
              </span>
              <span style={{ marginLeft: 'auto' }}>{results.length} result{results.length !== 1 ? 's' : ''} · ↑↓ · ↵ open · ⇧↵ create · esc</span>
            </div>
          </>
        )}
      </div>

      {/* Reminder form on top of the spotlight. stopPropagation so its
          backdrop click closes only the form, not the spotlight below. */}
      {reminderModalId && (
        <div onClick={e => e.stopPropagation()}>
          <ReminderModal reminderId={reminderModalId} onClose={() => { setReminderModalId(null); inputRef.current?.focus(); }} />
        </div>
      )}
      {/* Card overlay on top of the spotlight — same modal as everywhere. */}
      {taskModalId && (
        <div onClick={e => e.stopPropagation()}>
          <TaskModal taskId={taskModalId} onClose={() => { setTaskModalId(null); inputRef.current?.focus(); }} urlDriven={false} />
        </div>
      )}
    </div>
  );
}
