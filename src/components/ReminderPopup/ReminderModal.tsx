import { useEffect } from 'react';
import { useStore } from '../../store';
import { SchedulePicker } from '../SchedulePicker/SchedulePicker';
import { nextOccurrence, formatSchedule } from '../../scheduleEngine';
import type { Reminder, ScheduleSpec } from '../../types';

interface Props {
  reminderId: string;
  onClose: () => void;
}

const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 };

// Simple edit form for a reminder — opened from Explore results and Table
// rows (reminders have no TaskModal; this is their equivalent).
export function ReminderModal({ reminderId, onClose }: Props) {
  const items = useStore(s => s.items);
  const updateItem = useStore(s => s.updateItem);
  const archiveItem = useStore(s => s.archiveItem);
  const unarchiveItem = useStore(s => s.unarchiveItem);
  const deleteItem = useStore(s => s.deleteItem);
  const reminder = items.find(it => it.id === reminderId && it.kind === 'reminder') as Reminder | undefined;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!reminder) return null;

  function handleSchedule(spec: ScheduleSpec) {
    const nextFireAt = spec.type === 'once' ? spec.at : nextOccurrence(spec, Date.now());
    updateItem(reminderId, { schedule: spec, nextFireAt });
  }

  function handleDelete() {
    if (!confirm(`Delete reminder "${reminder!.title}"?`)) return;
    deleteItem(reminderId);
    onClose();
  }

  const ghostBtn: React.CSSProperties = { border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div
        style={{ width: 520, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', background: 'var(--t-surf)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.28)', borderTop: '3px solid var(--t-amber)', padding: '22px 26px' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 20, background: 'var(--t-amber-bg)', color: 'var(--t-amber)' }}>Reminder</span>
          {reminder.archived && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'var(--t-urgent-bg)', color: 'var(--t-urgent)' }}>ARCHIVED</span>
          )}
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 20, color: 'var(--t-muted)', lineHeight: 1, padding: '2px 6px' }}>×</span>
        </div>

        {/* Title */}
        <input
          value={reminder.title}
          onChange={e => updateItem(reminderId, { title: e.target.value })}
          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em', padding: '2px 0 14px', color: 'var(--t-txt)', background: 'transparent', boxSizing: 'border-box' }}
        />

        {/* Schedule */}
        <div style={{ marginBottom: 16 }}>
          <div style={fl}>Schedule</div>
          <SchedulePicker value={reminder.schedule} onChange={handleSchedule} />
        </div>

        {/* Next fire */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--t-amber-bg)', border: '1px solid var(--t-amber-brd)', borderRadius: 9, marginBottom: 18 }}>
          <span style={{ fontSize: 15 }}>🔔</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-amber)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next reminder</div>
            <div style={{ fontSize: 13.5, color: 'var(--t-txt)', fontWeight: 500, marginTop: 2 }}>
              {new Date(reminder.nextFireAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              <span style={{ color: 'var(--t-muted)', fontWeight: 400 }}> · {formatSchedule(reminder.schedule)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {reminder.archived ? (
            <button onClick={() => { unarchiveItem(reminderId); }} style={ghostBtn}>↩ Restore</button>
          ) : (
            <button onClick={() => { archiveItem(reminderId); onClose(); }} style={ghostBtn}>⊙ Archive</button>
          )}
          <button onClick={handleDelete} style={{ ...ghostBtn, color: 'var(--t-urgent)' }}>✕ Delete</button>
          <button onClick={onClose} style={{ ...ghostBtn, marginLeft: 'auto', background: 'var(--t-acc)', border: 'none', color: 'white' }}>Done</button>
        </div>
      </div>
    </div>
  );
}
