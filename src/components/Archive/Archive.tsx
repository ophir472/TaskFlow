import { useState } from 'react';
import { useStore } from '../../store';
import type { Item, Task, Reminder, Responsibility } from '../../types';
import { formatSchedule } from '../../scheduleEngine';
import { scoreItem } from '../../engine';

const td: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--t-brd2)', fontSize: 13.5, color: 'var(--t-txt2)' };
const th: React.CSSProperties = { padding: '11px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--t-muted)', fontWeight: 700, textAlign: 'left' };

function statusLabel(it: Item) {
  if (it.kind === 'task') return it.status.replace('_', ' ');
  return formatSchedule((it as Reminder | Responsibility).schedule);
}

export function Archive() {
  const items = useStore(s => s.items);
  const unarchiveItem = useStore(s => s.unarchiveItem);
  const deleteItem = useStore(s => s.deleteItem);

  const [typeFilter, setTypeFilter] = useState('');
  const [query, setQuery] = useState('');

  const archived = items.filter(it => it.archived);
  const rows = archived.filter(it => {
    if (typeFilter && it.kind !== typeFilter) return false;
    if (query && !it.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const ctrl: React.CSSProperties = { fontSize: 13, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)' };

  return (
    <div style={{ flex: 1, padding: '8px 36px 36px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
      {archived.length === 0 ? (
        <div style={{ paddingTop: 60, textAlign: 'center', color: 'var(--t-muted)', fontSize: 15 }}>No archived items yet.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search archived…" style={ctrl} />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={ctrl}>
              <option value="">All types</option>
              <option value="task">Task</option>
              <option value="reminder">Reminder</option>
              <option value="responsibility">Responsibility</option>
            </select>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-muted)' }}>{rows.length} archived item{rows.length !== 1 ? 's' : ''}</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 10, overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: 'var(--t-surf2)', borderBottom: '1px solid var(--t-brd)' }}>
                {['Title','Type','Requester','Project','Status','Score','Actions'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(it => {
                const t = it as Task;
                return (
                  <tr key={it.id} style={{ opacity: 0.8 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--t-surf2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.background = 'var(--t-surf)'; }}>
                    <td style={{ ...td, fontWeight: 500, color: 'var(--t-txt)' }}>{it.title}</td>
                    <td style={td}>{it.kind === 'task' ? 'Task' : it.kind === 'reminder' ? 'Reminder' : 'Responsibility'}</td>
                    <td style={td}>{t.requester || '—'}</td>
                    <td style={td}>{t.project || '—'}</td>
                    <td style={td}>{statusLabel(it)}</td>
                    <td style={td}>{scoreItem(it).toFixed(0)}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => unarchiveItem(it.id)}
                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', cursor: 'pointer', color: 'var(--t-txt2)', fontWeight: 500 }}>
                          Restore
                        </button>
                        <button onClick={() => { if (confirm('Permanently delete this item?')) deleteItem(it.id); }}
                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--t-urgent-bg)', background: 'var(--t-urgent-bg)', cursor: 'pointer', color: 'var(--t-urgent)', fontWeight: 500 }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--t-muted)', padding: '32px 14px' }}>No items match</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
