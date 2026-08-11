import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../../store';
import { useLogMount } from '../../useLogMount';
import { nextId, scoreItem } from '../../engine';
import { TaskModal } from '../TaskModal/TaskModal';
import { ReminderModal } from '../ReminderPopup/ReminderModal';
import type { Item, Task } from '../../types';

interface Props {
  /** Bumped by App when Cmd+F is pressed while already on this tab. */
  focusTrigger?: number;
}

export function searchItems(items: Item[], query: string): Item[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items.filter(it => {
    if (it.archived) return false;
    if (it.title.toLowerCase().includes(q)) return true;
    if (it.kind === 'task') {
      const t = it as Task;
      if (t.requester?.toLowerCase().includes(q)) return true;
      if (t.project?.toLowerCase().includes(q)) return true;
      if (t.jiraLink?.toLowerCase().includes(q)) return true;
      if (t.notes?.toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

const KIND_LABEL: Record<string, string> = { task: 'Task', reminder: 'Reminder' };
const KIND_COLOR: Record<string, string> = { task: 'var(--t-txt2)', reminder: 'var(--t-amber)' };

export function Explore({ focusTrigger }: Props) {
  useLogMount('Explore');
  const items = useStore(s => s.items);
  const query = useStore(s => s.exploreQuery);
  const setQuery = useStore(s => s.setExploreQuery);
  const createItem = useStore(s => s.createItem);
  const setTriggerTagForId = useStore(s => s.setTriggerTagForId);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const [reminderModalId, setReminderModalId] = useState<string | null>(null);
  // Result-id list frozen at modal-open time, so editing the task inside the
  // modal (which may make it stop matching the query) doesn't yank it out of
  // allIds and break the ←/→ navigation mid-session.
  const [modalAllIds, setModalAllIds] = useState<string[] | null>(null);
  // -1 = nothing highlighted. Index into [results..., createRow].
  const [highlightIdx, setHighlightIdx] = useState(-1);

  const results = useMemo(() => searchItems(items, query), [items, query]);
  const open = query.trim().length > 0;
  const totalRows = results.length + 1; // + quick-create row

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (focusTrigger) inputRef.current?.focus(); }, [focusTrigger]);
  useEffect(() => { setHighlightIdx(-1); }, [query]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (highlightIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  // The modal's arrow-key handler skips events whose target is an input —
  // if the search bar keeps focus after opening (Enter, or spotlight handoff),
  // ←/→ never reach the modal. Blur it whenever a modal is up.
  useEffect(() => {
    if (modalTaskId || reminderModalId) inputRef.current?.blur();
  }, [modalTaskId, reminderModalId]);

  // URL-routed modal, same pattern as Table: #explore/task/{id}
  function openTask(id: string) {
    setModalAllIds(results.filter(r => r.kind === 'task').map(r => r.id));
    window.location.hash = `explore/task/${id}`;
  }
  function closeTaskModal() {
    const currentHash = window.location.hash.slice(1);
    if (currentHash.startsWith('explore/task/')) history.back();
    else window.location.hash = 'explore';
  }
  function navigateModal(nid: string) {
    history.replaceState(null, '', `#explore/task/${nid}`);
    setModalTaskId(nid);
  }
  useEffect(() => {
    function syncFromHash() {
      const parts = window.location.hash.slice(1).split('/');
      if (parts[0] !== 'explore') return;
      if (parts[1] === 'task' && parts[2]) setModalTaskId(parts[2]);
      else { setModalTaskId(null); setModalAllIds(null); }
    }
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  function handleOpen(item: Item) {
    if (item.kind === 'task') openTask(item.id);
    else setReminderModalId(item.id);
  }

  function handleQuickCreate() {
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
    setQuery('');
    openTask(id);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // A modal is open on top — leave every key to it (its own document-level
    // handler does Escape/arrows). Touching the query here would mutate the
    // result list underneath the open modal.
    if (modalTaskId || reminderModalId) return;
    if (e.key === 'Escape') { setQuery(''); setHighlightIdx(-1); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => (i < totalRows - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => (i > 0 ? i - 1 : totalRows - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) { handleQuickCreate(); return; }
      if (highlightIdx >= 0 && highlightIdx < results.length) handleOpen(results[highlightIdx]);
      else if (highlightIdx === results.length) handleQuickCreate();
      else if (results.length > 0) handleOpen(results[0]);
      else handleQuickCreate();
    }
  }

  const taskResults = results.filter(r => r.kind === 'task');

  return (
    <>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 36px 36px', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ width: 'min(640px, 100%)', marginTop: '14vh', position: 'relative' }}>
        {/* Search bar — Google/ChatGPT style: centered, pill, prominent */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-muted)', fontSize: 20, pointerEvents: 'none' }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search everything…"
            style={{
              width: '100%', fontSize: 17, padding: '17px 52px 17px 56px',
              borderRadius: open ? '22px 22px 0 0' : 999,
              border: '1px solid var(--t-brd)',
              borderBottom: open ? '1px solid var(--t-brd2)' : '1px solid var(--t-brd)',
              background: 'var(--t-surf)', color: 'var(--t-txt)',
              boxSizing: 'border-box', outline: 'none',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            }}
          />
          {query && (
            <span onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-muted)', cursor: 'pointer', fontSize: 19, lineHeight: 1 }}>×</span>
          )}
        </div>

        {/* Attached results dropdown */}
        {open && (
          <div style={{
            background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderTop: 'none',
            borderRadius: '0 0 22px 22px', boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}>
            <div ref={listRef} style={{ maxHeight: '52vh', overflowY: 'auto' }}>
              {results.map((item, idx) => (
                <div key={item.id}
                  onClick={() => handleOpen(item)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px',
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
                onClick={handleQuickCreate}
                onMouseEnter={() => setHighlightIdx(results.length)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 22px',
                  cursor: 'pointer', color: 'var(--t-acc)',
                  background: highlightIdx === results.length ? 'var(--t-acc-bg)' : 'var(--t-surf)',
                }}>
                <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1 }}>+</span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>Create task "<span style={{ fontStyle: 'italic' }}>{query.trim()}</span>"</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-acc-dk)', background: 'var(--t-acc-bg)', padding: '2px 8px', borderRadius: 6, flexShrink: 0 }}>⇧↵</span>
              </div>
            </div>
            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 22px', borderTop: '1px solid var(--t-brd2)', background: 'var(--t-surf2)', fontSize: 11, color: 'var(--t-muted)' }}>
              <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
              <span style={{ marginLeft: 'auto' }}>↑↓ navigate · ↵ open · ⇧↵ create</span>
            </div>
          </div>
        )}

        {!open && (
          <div style={{ marginTop: 22, textAlign: 'center', fontSize: 13, color: 'var(--t-muted)' }}>
            Search tasks, reminders, requesters, projects, Jira keys and notes.
          </div>
        )}
      </div>
    </div>
    {modalTaskId && <TaskModal taskId={modalTaskId} allIds={modalAllIds ?? taskResults.map(r => r.id)} onNavigate={navigateModal} onClose={closeTaskModal} />}
    {reminderModalId && <ReminderModal reminderId={reminderModalId} onClose={() => setReminderModalId(null)} />}
    </>
  );
}
