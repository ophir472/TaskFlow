import { useStore } from '../../store';
import type { Task } from '../../types';
import { itsmKey, csKey } from '../../followups';

export { itsmKey, csKey };

// ✓ on a ticket row (card Tickets section / Hub) — marks the ticket DONE.
// It is the same state as the ticket's auto row in the card's Followup
// table: store.setFollowupDone keeps irrelevantTickets and the followup
// record in lockstep, so both surfaces always agree.
export function RelevanceToggle({ task, ticketKey, title }: { task: Task; ticketKey: string; title?: string }) {
  const setFollowupDone = useStore(s => s.setFollowupDone);
  const marked = (task.irrelevantTickets ?? []).includes(ticketKey);
  return (
    <span
      onClick={e => {
        e.stopPropagation();
        setFollowupDone(task.id, { ticketKey, title: title ?? ticketKey.split(':').pop() ?? ticketKey }, !marked);
      }}
      title={marked ? 'Done — click to reopen' : 'Mark done (also completes its followup row)'}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0, background: marked ? 'var(--t-success)' : 'transparent', color: marked ? 'white' : 'var(--t-brd)', border: marked ? 'none' : '1.5px solid var(--t-brd)' }}>
      ✓
    </span>
  );
}
