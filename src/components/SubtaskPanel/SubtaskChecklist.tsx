import { useState } from 'react';
import { useStore } from '../../store';
import type { Subtask, ChecklistItem } from '../../types';

interface Props {
  parentId: string;
  sub: Subtask;
}

// Checklist on a subtask — the ONE implementation, shared by the slide-over,
// the full-page view and the task popup so the three can't drift.
export function SubtaskChecklist({ parentId, sub }: Props) {
  const updateSubtask = useStore(s => s.updateSubtask);
  const [newItem, setNewItem] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const items = sub.checklist ?? [];
  const save = (next: ChecklistItem[]) => updateSubtask(parentId, sub.id, { checklist: next });

  function add() {
    const v = newItem.trim();
    if (!v) return;
    save([...items, { id: 'cl' + Date.now() + Math.random().toString(36).slice(2, 5), text: v, done: false }]);
    setNewItem('');
  }

  function drop(targetId: string) {
    if (dragId && dragId !== targetId) {
      const from = items.findIndex(x => x.id === dragId);
      const to = items.findIndex(x => x.id === targetId);
      if (from >= 0 && to >= 0) {
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        save(next);
      }
    }
    setDragId(null);
    setOverId(null);
  }

  const doneCount = items.filter(i => i.done).length;
  const rowInp: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 13, padding: '4px 7px', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--t-txt)', outline: 'none', boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        Checklist {items.length > 0 && `(${doneCount}/${items.length})`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(it => (
          <div key={it.id}
            onDragOver={e => { if (dragId) { e.preventDefault(); setOverId(it.id); } }}
            onDragLeave={() => { if (overId === it.id) setOverId(null); }}
            onDrop={e => { e.preventDefault(); drop(it.id); }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: dragId === it.id ? 0.4 : 1, boxShadow: overId === it.id && dragId && dragId !== it.id ? 'inset 0 2px 0 var(--t-acc)' : 'none', borderRadius: 4 }}>
            <span draggable
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(it.id); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              title="Drag to reorder"
              style={{ cursor: 'grab', color: 'var(--t-brd)', fontSize: 10, lineHeight: 1, userSelect: 'none', flexShrink: 0 }}>⋮⋮</span>
            <input type="checkbox" checked={it.done}
              onChange={() => save(items.map(x => x.id === it.id ? { ...x, done: !x.done } : x))}
              style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
            <input value={it.text}
              onChange={e => save(items.map(x => x.id === it.id ? { ...x, text: e.target.value } : x))}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--t-brd)'; e.currentTarget.style.background = 'var(--t-surf2)'; }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.background = 'transparent';
                if (!it.text.trim()) save(items.filter(x => x.id !== it.id));
              }}
              style={{ ...rowInp, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--t-muted)' : 'var(--t-txt)' }} />
            <span onClick={() => save(items.filter(x => x.id !== it.id))} title="Remove"
              style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 13, lineHeight: 1, flexShrink: 0, opacity: 0.7 }}>×</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 17 }}>
          <span style={{ width: 14, textAlign: 'center', color: 'var(--t-muted)', fontSize: 13, flexShrink: 0 }}>+</span>
          <input value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            onBlur={add}
            placeholder="Add item…"
            style={{ ...rowInp, borderStyle: 'dashed', borderColor: items.length === 0 ? 'var(--t-brd)' : 'transparent' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--t-brd)'; }} />
        </div>
      </div>
    </div>
  );
}
