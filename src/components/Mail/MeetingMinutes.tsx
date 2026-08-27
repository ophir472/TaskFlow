import { useState } from 'react';
import { useStore } from '../../store';
import { buildMailEntry } from '../../mailEntry';
import { backdropCloseProps } from '../../backdrop';
import type { MinutesField } from '../../types';

interface Props {
  onClose: () => void;
  onCreated: (entryId: string) => void;
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none' };

// Build the ready-to-send email from the configured fields, in their order.
// 'bullets' fields turn each line into a "• " bullet.
export function buildMinutesEmail(fields: MinutesField[], values: Record<string, string>): string {
  const parts: string[] = [];
  for (const f of fields) {
    if (!f.enabled) continue;
    const v = (values[f.id] ?? '').trim();
    if (!v) continue;
    if (f.kind === 'text') parts.push(`${f.label}: ${v}`);
    else if (f.kind === 'bullets') parts.push(`${f.label}:\n${v.split('\n').filter(l => l.trim()).map(l => `• ${l.trim()}`).join('\n')}`);
    else parts.push(`${f.label}:\n${v}`);
  }
  return `Hi all,\n\nMeeting minutes below.\n\n${parts.join('\n\n')}\n\nPlease reply with any corrections or additions.\n\nThanks!`;
}

// ✎ Meeting minutes — form fields come from Settings (add/disable/reorder),
// output is a complete email in a new mail entry, ready to send.
export function MeetingMinutes({ onClose, onCreated }: Props) {
  const fields = useStore(s => s.minutesFields);
  const createItem = useStore(s => s.createItem);
  const [values, setValues] = useState<Record<string, string>>({});

  const enabled = fields.filter(f => f.enabled);
  const topic = (values[fields.find(f => f.label.toLowerCase().includes('topic'))?.id ?? ''] ?? '').trim();

  function create() {
    const entry = buildMailEntry(`Meeting minutes${topic ? ` — ${topic}` : ''}`);
    entry.mailToSend = buildMinutesEmail(fields, values);
    createItem(entry);
    onCreated(entry.id);
  }

  return (
    <div {...backdropCloseProps(onClose)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 95, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(560px, 92vw)', maxHeight: '80vh', overflowY: 'auto', background: 'var(--t-surf)', borderRadius: 14, border: '1px solid var(--t-brd)', boxShadow: '0 24px 70px rgba(0,0,0,0.4)', padding: 20, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)' }}>✎ Meeting minutes</div>
          <span style={{ marginLeft: 10, fontSize: 11.5, color: 'var(--t-muted)' }}>fields are configurable in Settings → General</span>
          <span onClick={onClose} title="Close" style={{ marginLeft: 'auto', cursor: 'pointer', color: 'var(--t-muted)', fontSize: 18, lineHeight: 1 }}>×</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {enabled.map(f => (
            <div key={f.id}>
              <div style={lbl}>{f.label}{f.kind === 'bullets' ? ' (one per line → bullets)' : ''}</div>
              {f.kind === 'text' ? (
                <input value={values[f.id] ?? ''} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))} style={inp} />
              ) : (
                <textarea value={values[f.id] ?? ''} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
                  rows={f.kind === 'bullets' ? 4 : 3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose}
              style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={create}
              style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 12.5, fontWeight: 700, padding: '8px 18px', borderRadius: 7, cursor: 'pointer' }}>
              Build the email →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
