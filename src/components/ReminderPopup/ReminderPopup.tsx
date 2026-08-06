import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import type { Reminder } from '../../types';
import { OneTimePicker } from '../SchedulePicker/OneTimePicker';
import { formatSchedule } from '../../scheduleEngine';

// Renders a single reminder popup for the first ID in the pending queue.
// When the user snoozes or completes, that id drops from the queue and the
// next pending reminder (if any) takes over on the next render.
export function ReminderPopup() {
  const pendingIds = useStore(s => s.pendingReminderIds);
  const items = useStore(s => s.items);
  const snoozeReminderTo = useStore(s => s.snoozeReminderTo);
  const completeReminderOccurrence = useStore(s => s.completeReminderOccurrence);

  const currentId = pendingIds[0];
  const reminder = useMemo(
    () => items.find(it => it.id === currentId && it.kind === 'reminder') as Reminder | undefined,
    [items, currentId],
  );

  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeAt, setSnoozeAt] = useState<number | null>(null);

  if (!reminder) return null;

  const dueDelta = Date.now() - reminder.nextFireAt;
  const dueLabel = formatDelta(dueDelta);
  const remaining = pendingIds.length;

  function handleSnoozeConfirm() {
    if (!snoozeAt || !reminder) return;
    snoozeReminderTo(reminder.id, snoozeAt);
    setSnoozeOpen(false);
    setSnoozeAt(null);
  }

  return (
    <div style={backdropSt}>
      <div style={popupSt}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-amber)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reminder</div>
            <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>{dueLabel}</div>
          </div>
          {remaining > 1 && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: 'var(--t-surf2)', color: 'var(--t-muted)' }}>
              +{remaining - 1} more
            </span>
          )}
        </div>

        {/* Title */}
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t-txt)', lineHeight: 1.3, margin: '10px 0 4px' }}>
          {reminder.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-muted)', marginBottom: 20 }}>
          {formatSchedule(reminder.schedule)}
        </div>

        {snoozeOpen ? (
          <div style={{ background: 'var(--t-surf2)', border: '1px solid var(--t-brd)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Snooze until…</div>
            <OneTimePicker value={snoozeAt} onChange={setSnoozeAt} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => { setSnoozeOpen(false); setSnoozeAt(null); }} style={ghostBtn}>Cancel</button>
              <button onClick={handleSnoozeConfirm} disabled={!snoozeAt} style={{ ...primaryBtn, opacity: snoozeAt ? 1 : 0.5, cursor: snoozeAt ? 'pointer' : 'not-allowed' }}>
                Snooze
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSnoozeOpen(true)} style={{ ...ghostBtn, flex: 1 }}>
              Snooze
            </button>
            <button onClick={() => completeReminderOccurrence(reminder.id)} style={{ ...primaryBtn, flex: 1 }}>
              {reminder.schedule.type === 'once' ? 'Complete' : 'Done this time'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDelta(ms: number): string {
  if (ms < 0) {
    const absSec = Math.abs(Math.floor(ms / 1000));
    if (absSec < 60) return `due in ${absSec}s`;
    return `due in ${Math.floor(absSec / 60)}m`;
  }
  const s = Math.floor(ms / 1000);
  if (s < 60) return `due ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `due ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `due ${h}h ${m - h * 60}m ago`;
  const d = Math.floor(h / 24);
  return `due ${d}d ago`;
}

const backdropSt: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
  zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
};
const popupSt: React.CSSProperties = {
  width: 440, maxWidth: '100%',
  background: 'var(--t-surf)', borderRadius: 14, padding: '20px 22px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
  border: '1px solid var(--t-brd)',
  borderTop: '3px solid var(--t-amber)',
};
const primaryBtn: React.CSSProperties = {
  border: 'none', background: 'var(--t-acc)', color: 'white',
  fontSize: 14, fontWeight: 600, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)',
  fontSize: 14, fontWeight: 600, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
};
