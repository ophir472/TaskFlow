import { useState } from 'react';
import { useStore } from '../../store';
import type { SnTemplate, SnTicketType } from '../../types';
import { SnTemplateForm, EMPTY_SN_TEMPLATE } from '../ServiceNow/SnTemplateForm';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };
const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };
const addBtn: React.CSSProperties = { border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 500, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' };
const panel: React.CSSProperties = { marginBottom: 16, padding: '12px 14px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 9 };
const panelTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 4 };
const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--t-muted)', marginTop: 4, lineHeight: 1.45 };
const smallAdd: React.CSSProperties = { border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' };
const rowInp: React.CSSProperties = { fontSize: 12.5, padding: '5px 9px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', outline: 'none', boxSizing: 'border-box' };

// Committing on blur keeps typing from spamming the store / version history
// with per-keystroke events (same pattern as the Jira board rows).
function DraftInput({ value, onCommit, placeholder, style, multiline }: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cur = draft ?? value;
  const commit = () => { if (draft !== null && draft !== value) onCommit(draft); setDraft(null); };
  if (multiline) {
    return (
      <textarea
        value={cur}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        rows={Math.min(6, Math.max(1, cur.split('\n').length))}
        style={{ ...rowInp, resize: 'vertical', fontFamily: 'inherit', ...style }}
      />
    );
  }
  return (
    <input
      value={cur}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder={placeholder}
      style={{ ...rowInp, ...style }}
    />
  );
}

export function ServiceNowSection() {
  const snConfig = useStore(s => s.snConfig);
  const updateSnUrls = useStore(s => s.updateSnUrls);
  const addSnField = useStore(s => s.addSnField);
  const updateSnField = useStore(s => s.updateSnField);
  const removeSnField = useStore(s => s.removeSnField);
  const setSnDefaultValue = useStore(s => s.setSnDefaultValue);
  const addSnTemplate = useStore(s => s.addSnTemplate);
  const updateSnTemplate = useStore(s => s.updateSnTemplate);
  const removeSnTemplate = useStore(s => s.removeSnTemplate);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState<SnTicketType | null>(null);
  const formOpen = adding || editingId !== null;

  function startAdd() {
    setAdding(true);
    setEditingId(null);
  }
  function startEdit(t: SnTemplate) {
    setEditingId(t.id);
    setAdding(false);
  }
  function cancelForm() {
    setAdding(false);
    setEditingId(null);
  }
  function handleDelete(t: SnTemplate) {
    if (!confirm(`Delete SN template "${t.name}"?`)) return;
    removeSnTemplate(t.id);
  }

  const fields = snConfig.fields;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)' }}>ServiceNow Tickets</div>
        {!formOpen && <button onClick={startAdd} style={addBtn}>+ Add template</button>}
      </div>
      <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 14 }}>
        INC / CHG tickets created from any card via <b>+ Create SN ticket</b> — a template menu (own URL: <b>#sncreate</b>) opens the pre-filled ServiceNow form in a new tab. Everything here is data — URLs, field names, templates — so it adapts to any organization without code changes.
      </div>

      {/* ── Create URLs ── */}
      <div style={{ ...panel, background: 'color-mix(in oklab, var(--t-txt) 3%, var(--t-surf2))', border: '1px solid color-mix(in oklab, var(--t-txt) 10%, var(--t-brd2))' }}>
        <div style={panelTitle}>Create URLs</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...fl, marginBottom: 0, width: 90, flexShrink: 0 }}>INC URL</span>
            <DraftInput value={snConfig.incUrlTemplate} onCommit={v => updateSnUrls({ incUrlTemplate: v })}
              placeholder="https://myorg.service-now.com/incident.do?sys_id=-1&sysparm_query={fields}" style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...fl, marginBottom: 0, width: 90, flexShrink: 0 }}>CHG URL</span>
            <DraftInput value={snConfig.chgUrlTemplate} onCommit={v => updateSnUrls({ chgUrlTemplate: v })}
              placeholder="https://myorg.service-now.com/change_request.do?sys_id=-1&sysparm_query={fields}" style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...fl, marginBottom: 0, width: 90, flexShrink: 0 }}>Separator</span>
            <DraftInput value={snConfig.fieldSeparator} onCommit={v => updateSnUrls({ fieldSeparator: v })}
              placeholder="^" style={{ width: 70 }} />
          </div>
        </div>
        <div style={hint}>
          Fields become key=value pairs (values URL-encoded) joined by the separator — <b>^</b> fits <b>sysparm_query=</b>, <b>&amp;</b> fits plain query params. Put <b>{'{fields}'}</b> where the pairs should go, or inject a single value anywhere in the URL/URI with <b>{'{field_key}'}</b> (e.g. <b>{'{short_description}'}</b>). No tokens → pairs are appended as query params.
        </div>
      </div>

      {/* ── Fields ── */}
      <div style={{ ...panel, background: 'color-mix(in oklab, var(--t-txt) 3%, var(--t-surf2))', border: '1px solid color-mix(in oklab, var(--t-txt) 10%, var(--t-brd2))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...panelTitle, marginBottom: 0 }}>Fields</div>
          <span style={{ fontSize: 11.5, color: 'var(--t-muted)', flex: 1 }}>
            The exact parameter names your ServiceNow instance expects.
          </span>
          <button onClick={addSnField} style={smallAdd}>+ Add field</button>
        </div>
        {fields.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <DraftInput value={f.key} onCommit={v => updateSnField(f.id, { key: v.trim() })}
              placeholder="short_description" style={{ width: 220, flexShrink: 0 }} />
            <DraftInput value={f.label} onCommit={v => updateSnField(f.id, { label: v })}
              placeholder="Display label (optional)" style={{ flex: 1 }} />
            <span onClick={() => removeSnField(f.id)} title="Remove field"
              style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</span>
          </div>
        ))}
      </div>

      {/* ── Default tickets (per type) ── */}
      <div style={{ ...panel, background: 'color-mix(in oklab, var(--t-txt) 3%, var(--t-surf2))', border: '1px solid color-mix(in oklab, var(--t-txt) 10%, var(--t-brd2))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...panelTitle, marginBottom: 0 }}>Default tickets</div>
          <span style={{ fontSize: 11.5, color: 'var(--t-muted)', flex: 1 }}>
            Any field a template leaves empty inherits its type's default.
          </span>
          {(['INC', 'CHG'] as SnTicketType[]).map(ty => (
            <button key={ty}
              // blur: otherwise the browser focus ring on the previously
              // clicked button looks like a second "active" border
              onClick={e => { e.currentTarget.blur(); setDefaultsOpen(cur => cur === ty ? null : ty); }}
              style={{ ...smallAdd, ...(defaultsOpen === ty ? { borderColor: 'var(--t-acc)', color: 'var(--t-acc-dk)', background: 'var(--t-acc-bg)' } : {}) }}>
              {ty} default
            </button>
          ))}
        </div>
        {defaultsOpen && (
          fields.length === 0 ? (
            <div style={{ ...hint, marginTop: 8 }}>Add fields above first.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              {fields.map(f => (
                <div key={f.id}>
                  <div style={fl}>{f.label.trim() || f.key.trim() || 'unnamed field'}</div>
                  <DraftInput
                    multiline
                    value={snConfig.defaultFieldValues[defaultsOpen][f.id] ?? ''}
                    onCommit={v => setSnDefaultValue(defaultsOpen, f.id, v)}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Templates list ── */}
      {snConfig.templates.length === 0 && !formOpen && (
        <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>No templates configured.</div>
      )}
      {snConfig.templates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: formOpen ? 16 : 0 }}>
          {snConfig.templates.map(t => {
            if (editingId === t.id) return null;
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'color-mix(in oklab, var(--t-txt) 3%, var(--t-surf2))', border: '1px solid var(--t-brd2)', borderRadius: 10 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, letterSpacing: '0.05em', flexShrink: 0,
                  background: t.type === 'INC' ? 'var(--t-urgent-bg)' : 'var(--t-important-bg)',
                  color: t.type === 'INC' ? 'var(--t-urgent)' : 'var(--t-important)',
                }}>{t.type}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-txt)' }}>{t.name || 'Unnamed template'}</div>
                  <div style={{ fontSize: 12, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[t.templateNumber && `#${t.templateNumber}`, t.emailDL, Object.values(t.fieldValues).filter(v => v.trim()).length + ' fields'].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button onClick={() => startEdit(t)} style={ghostBtn}>Edit</button>
                <span onClick={() => handleDelete(t)} title="Delete" style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Template form ── */}
      {formOpen && (
        <SnTemplateForm
          key={editingId ?? 'new'}
          heading={editingId ? 'Edit template' : 'New template'}
          saveLabel={editingId ? 'Save changes' : 'Add template'}
          initial={(() => {
            const t = editingId ? snConfig.templates.find(x => x.id === editingId) : null;
            return t
              ? { name: t.name, type: t.type, templateNumber: t.templateNumber, instructions: t.instructions, confluenceLink: t.confluenceLink, exampleTicket: t.exampleTicket, emailDL: t.emailDL, fieldValues: { ...t.fieldValues } }
              : EMPTY_SN_TEMPLATE;
          })()}
          onSave={tpl => { if (editingId) updateSnTemplate(editingId, tpl); else addSnTemplate(tpl); cancelForm(); }}
          onCancel={cancelForm}
        />
      )}
    </div>
  );
}
