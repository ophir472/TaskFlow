import { useState } from 'react';
import { useStore } from '../../store';
import type { Task, TaskStatus } from '../../types';

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'in_progress', label: 'In Progress' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'done', label: 'Done' },
];

export function Kanban() {
  const items = useStore(s => s.items);
  const updateItem = useStore(s => s.updateItem);
  // Done tasks are auto-archived (status ⇄ archive link in the store), so the
  // Done column must include archived tasks with status 'done' — otherwise
  // cards would vanish from the board the moment they're dropped there.
  // Dragging one back to an active column un-archives it via the same link.
  const tasks = items.filter(it =>
    it.kind === 'task' && (!it.archived || it.status === 'done')
  ) as Task[];
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const [overCard, setOverCard] = useState<string | null>(null);

  function handleDrop(colKey: TaskStatus) {
    if (dragId) updateItem(dragId, { status: colKey } as Partial<Task>);
    setDragId(null); setOverCol(null); setOverCard(null);
  }

  const dragTask = dragId ? tasks.find(t => t.id === dragId) : null;

  return (
    <div style={{ flex: 1, display: 'flex', gap: 14, padding: '8px 36px 36px', overflowX: 'auto' }}>
      {COLUMNS.map(col => {
        const cards = tasks.filter(t => t.status === col.key);
        const isOver = overCol === col.key;
        return (
          <div key={col.key}
            onDragOver={e => { e.preventDefault(); setOverCol(col.key); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
            onDrop={e => { e.preventDefault(); handleDrop(col.key); }}
            style={{
              width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8,
              padding: '10px 8px', borderRadius: 12,
              background: isOver ? 'var(--t-acc-bg)' : 'transparent',
              border: isOver ? '2px dashed var(--t-acc)' : '2px solid transparent',
              transition: 'background 0.12s, border 0.12s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 4px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--t-muted)' }}>{col.label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)', background: 'var(--t-surf3)', borderRadius: 20, padding: '1px 8px' }}>{cards.length}</div>
            </div>

            {cards.map(card => {
              const isDragging = dragId === card.id;
              const isOverThis = overCard === card.id;
              return (
                <div key={card.id} draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(card.id); }}
                  onDragEnd={() => { setDragId(null); setOverCol(null); setOverCard(null); }}
                  onDragEnter={() => setOverCard(card.id)}
                  onDragLeave={() => setOverCard(null)}
                  style={{
                    background: 'var(--t-surf)',
                    border: `1px solid ${isOverThis && dragTask && dragTask.id !== card.id ? 'var(--t-acc)' : 'var(--t-brd)'}`,
                    borderRadius: 10, padding: '12px 14px', fontSize: 13.5,
                    display: 'flex', flexDirection: 'column', gap: 6, cursor: 'grab',
                    opacity: isDragging ? 0.4 : 1,
                    boxShadow: isDragging ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'opacity 0.1s, box-shadow 0.1s', userSelect: 'none',
                  }}>
                  <div style={{ fontWeight: 600, color: 'var(--t-txt)', lineHeight: 1.35 }}>{card.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--t-muted)' }}>
                      {[card.requester, card.project].filter(Boolean).join(' · ') || <span style={{ color: 'var(--t-brd)' }}>—</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {card.urgent && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--t-urgent-bg)', color: 'var(--t-urgent)' }}>U</span>}
                      {card.important && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--t-important-bg)', color: 'var(--t-important)' }}>I</span>}
                      {card.quick && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--t-quick-bg)', color: 'var(--t-quick)' }}>Q</span>}
                    </div>
                  </div>
                  {card.subtasks.length > 0 && <div style={{ fontSize: 11, color: 'var(--t-muted)' }}>✓ {card.subtasks.filter(s => s.done).length}/{card.subtasks.length} subtasks</div>}
                  {card.jiraLink && <div style={{ fontSize: 11, color: 'var(--t-acc)', fontWeight: 500 }}>{card.jiraLink}</div>}
                </div>
              );
            })}

            {isOver && cards.length === 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: 'var(--t-acc)', borderRadius: 8, border: '1px dashed var(--t-acc)' }}>Drop here</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
