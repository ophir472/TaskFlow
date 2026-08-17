import { useState } from 'react';
import { useStore } from '../../store';
import type { SnTemplate, SnTicketType } from '../../types';

export const EMPTY_SN_TEMPLATE: Omit<SnTemplate, 'id'> = {
  name: '', type: 'INC', templateNumber: '', instructions: '',
  confluenceLink: '', exampleTicket: '', emailDL: '', fieldValues: {},
};

const fi: React.CSSProperties = { fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', width: '100%', boxSizing: 'border-box' };
const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };
const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--t-muted)', lineHeight: 1.45 };
const addBtn: React.CSSProperties = { border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 500, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' };

interface Props {
  heading: string;
  saveLabel: string;
  initial: Omit<SnTemplate, 'id'>;
  onSave: (tpl: Omit<SnTemplate, 'id'>) => void;
  onCancel: () => void;
}

// The ONE ServiceNow template editor — used by Settings and by the #sncreate
// menu's "+ New template" tile, so the two can never drift apart.
export function SnTemplateForm({ heading, saveLabel, initial, onSave, onCancel }: Props) {
  const snConfig = useStore(s => s.snConfig);
  const fields = snConfig.fields;
  const [draft, setDraft] = useState<Omit<SnTemplate, 'id'>>(initial);

  return (
    <div style={{ padding: 16, background: 'color-mix(in oklab, var(--t-txt) 3%, var(--t-surf2))', border: '1px solid color-mix(in oklab, var(--t-txt) 10%, var(--t-brd2))', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--t-txt)' }}>{heading}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
        <div><div style={fl}>Name *</div>
          <input autoFocus value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Access request" style={fi} />
        </div>
        <div><div style={fl}>Type</div>
          <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value as SnTicketType }))}
            style={{ ...fi, cursor: 'pointer' }}>
            <option value="INC">INC</option>
            <option value="CHG">CHG</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><div style={fl}>Template number</div>
          <input value={draft.templateNumber} onChange={e => setDraft(d => ({ ...d, templateNumber: e.target.value }))} placeholder="If one exists" style={fi} />
        </div>
        <div><div style={fl}>Email DL</div>
          <input value={draft.emailDL} onChange={e => setDraft(d => ({ ...d, emailDL: e.target.value }))} placeholder="team-dl@company.com" style={fi} />
        </div>
        <div><div style={fl}>Confluence page</div>
          <input value={draft.confluenceLink} onChange={e => setDraft(d => ({ ...d, confluenceLink: e.target.value }))} placeholder="https://confluence/…" style={fi} />
        </div>
        <div><div style={fl}>Example ticket</div>
          <input value={draft.exampleTicket} onChange={e => setDraft(d => ({ ...d, exampleTicket: e.target.value }))} placeholder="INC0012345" style={fi} />
        </div>
      </div>
      <div>
        <div style={fl}>Instructions</div>
        <textarea value={draft.instructions} onChange={e => setDraft(d => ({ ...d, instructions: e.target.value }))}
          rows={3} placeholder="How to create this ticket — description to use, assigned group, etc."
          style={{ ...fi, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      <div>
        <div style={{ ...fl, marginBottom: 2 }}>ServiceNow fields</div>
        <div style={{ ...hint, marginBottom: 10 }}>
          Filled exactly as entered here. Use <b>FILL</b> where the value is per-ticket — you'll be prompted to replace it when creating. Empty fields inherit the {draft.type} default ticket.
        </div>
        {fields.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--t-muted)' }}>No fields configured — add them in Settings → ServiceNow Tickets → Fields.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {fields.map(f => (
              <div key={f.id}>
                <div style={fl}>{f.label.trim() || f.key.trim() || 'unnamed field'}</div>
                <textarea
                  value={draft.fieldValues[f.id] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, fieldValues: { ...d.fieldValues, [f.id]: e.target.value } }))}
                  placeholder={(snConfig.defaultFieldValues[draft.type][f.id] ?? '').trim() ? `default: ${snConfig.defaultFieldValues[draft.type][f.id]}` : ''}
                  rows={Math.min(6, Math.max(1, (draft.fieldValues[f.id] ?? '').split('\n').length))}
                  style={{ ...fi, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
        <button onClick={() => { if (draft.name.trim()) onSave(draft); }} disabled={!draft.name.trim()}
          style={{ ...addBtn, opacity: draft.name.trim() ? 1 : 0.5, cursor: draft.name.trim() ? 'pointer' : 'not-allowed' }}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
