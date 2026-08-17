import { useState } from 'react';
import type { CommunicationField, Task } from '../../types';
import { LinkedCommTable } from '../Mail/LinkedCommTable';
import { useStore } from '../../store';

interface Props {
  taskId: string;
  task: Task;
  fields: CommunicationField[];
  /** When true, the section is rendered enlarged (used by Green Play review). */
  emphasized?: boolean;
}

// Fields removed on blur when their value is left empty — matching the
// Jira/ITSM "extra tickets" pattern. The first field only survives empty when
// it's the ONLY one (it's the default seed); with others present it's deleted
// and the next field becomes the first.
// The "+ Add field" button only appears once the primary field has a value.
export function CommunicationSection({ taskId, task, fields, emphasized }: Props) {
  const addField = useStore(s => s.addCommunicationField);
  const updateField = useStore(s => s.updateCommunicationField);
  const deleteField = useStore(s => s.deleteCommunicationField);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  const fl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--t-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
  };
  const sInp: React.CSSProperties = {
    width: '100%', fontSize: emphasized ? 15 : 14,
    padding: emphasized ? '10px 12px' : '7px 10px',
    borderRadius: 7, border: '1px solid var(--t-brd)',
    background: 'var(--t-surf2)', color: 'var(--t-txt)',
    boxSizing: 'border-box', outline: 'none',
  };

  const primaryHasValue = fields.length > 0 && fields[0].value.trim().length > 0;

  return (
    <div data-review-target="communication" style={{
      border: emphasized ? '2px solid var(--t-acc)' : '1px solid var(--t-brd)',
      background: emphasized ? 'var(--t-acc-bg)' : 'var(--t-surf2)',
      borderRadius: 10, padding: emphasized ? 16 : 12, transition: 'all 0.2s',
    }}>
      <div style={{
        fontSize: emphasized ? 13 : 11, fontWeight: 700,
        color: emphasized ? 'var(--t-acc-dk)' : 'var(--t-muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        marginBottom: 10,
      }}>Communication</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fields.map((f, i) => {
          const isPrimary = i === 0;
          return (
            <div key={f.id} data-comm-field-id={f.id}>
              {editingLabelId === f.id ? (
                <input
                  autoFocus
                  value={labelDraft}
                  onChange={e => setLabelDraft(e.target.value)}
                  onBlur={() => {
                    const v = labelDraft.trim() || f.label;
                    updateField(taskId, f.id, { label: v });
                    setEditingLabelId(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                    if (e.key === 'Escape') { setEditingLabelId(null); }
                  }}
                  style={{ ...fl, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', padding: '2px 6px', borderRadius: 4, outline: 'none', width: 130, display: 'block' }}
                />
              ) : (
                <div
                  style={{ ...fl, cursor: 'text' }}
                  title="Click to rename"
                  onClick={() => { setEditingLabelId(f.id); setLabelDraft(f.label); }}
                >{f.label}</div>
              )}
              <input
                value={f.value}
                placeholder={placeholderFor(f.label)}
                onChange={e => updateField(taskId, f.id, { value: e.target.value })}
                onBlur={() => {
                  if (f.value.trim()) return;
                  // Empty on blur → remove the field; the primary is only
                  // kept when it's the last one left (default seed).
                  if (!isPrimary || fields.length > 1) deleteField(taskId, f.id);
                }}
                style={sInp}
              />
            </div>
          );
        })}
      </div>

      {/* "To send" — view of communication-assistant entries linked here */}
      <div style={{ marginTop: 10 }}>
        <LinkedCommTable task={task} />
      </div>

      {primaryHasValue && (
        <button
          onClick={() => addField(taskId, `Field ${fields.length + 1}`)}
          style={{
            marginTop: 10, width: '100%',
            border: '1px dashed var(--t-brd)', background: 'transparent',
            color: 'var(--t-muted)', fontSize: 12, fontWeight: 500,
            padding: '5px 0', borderRadius: 6, cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--t-surf)'; e.currentTarget.style.color = 'var(--t-txt2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t-muted)'; }}
        >+ Add another field</button>
      )}
    </div>
  );
}

function placeholderFor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('team')) return 'Channel / person on Teams';
  if (l.includes('mail') || l.includes('email')) return 'Recipient / subject';
  if (l.includes('slack')) return 'Channel / person';
  return 'Names, subjects, links…';
}

/** Returns communications with fallback seeding — for older items missing the
 * field OR items left with an empty array by the pre-upsert bug. The primary
 * field can't be deleted from the UI, so empty always means "needs the
 * default", never a deliberate user state. */
export function getCommunications(fields: CommunicationField[] | undefined): CommunicationField[] {
  if (fields && fields.length) return fields;
  return [{ id: 'c-default-teams', label: 'Teams', value: '' }];
}
