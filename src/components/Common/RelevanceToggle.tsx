import { useStore } from '../../store';
import type { Task } from '../../types';

export const itsmKey = (ticket: string) => `itsm:${ticket}`;
export const csKey = (sysId: string, ticket: string) => `cs:${sysId}:${ticket}`;

// ✓ relevance toggle for a ticket — the SAME control on the card and on the
// ▣ Hub: marked = not relevant (grey + hidden from the Hub), click restores.
export function RelevanceToggle({ task, ticketKey }: { task: Task; ticketKey: string }) {
  const updateItem = useStore(s => s.updateItem);
  const marked = (task.irrelevantTickets ?? []).includes(ticketKey);
  return (
    <span
      onClick={e => {
        e.stopPropagation();
        const list = task.irrelevantTickets ?? [];
        updateItem(task.id, { irrelevantTickets: marked ? list.filter(k => k !== ticketKey) : [...list, ticketKey] });
      }}
      title={marked ? 'Marked not relevant — click to restore' : 'Mark not relevant (hidden from the Hub)'}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0, background: marked ? 'var(--t-muted)' : 'transparent', color: marked ? 'white' : 'var(--t-brd)', border: marked ? 'none' : '1.5px solid var(--t-brd)' }}>
      ✓
    </span>
  );
}
