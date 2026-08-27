import { useState } from 'react';
import { useStore } from '../../store';
import { nextId } from '../../engine';
import type { CustomSystem } from '../../types';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };
const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
const fi: React.CSSProperties = { width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none' };

const EMPTY: Omit<CustomSystem, 'id'> = { name: '', baseUrl: '', openUri: '', createUri: '', templatesEnabled: false, templates: [], showInHub: true };

// Settings → Integrations → Custom systems: ITSM-like integrations that are
// pure URL templates (no API). Each system adds a ticket row to every card:
// typing a ticket id → ↗ opens baseUrl+openUri+id; empty + createUri → a
// "Create ticket" button opening baseUrl+createUri.
export function CustomSystemsSection() {
  const customSystems = useStore(s => s.customSystems);
  const addCustomSystem = useStore(s => s.addCustomSystem);
  const updateCustomSystem = useStore(s => s.updateCustomSystem);
  const removeCustomSystem = useStore(s => s.removeCustomSystem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);

  const formOpen = adding || editingId !== null;
  const canSave = draft.name.trim() && draft.baseUrl.trim();

  function save() {
    if (!canSave) return;
    const clean = { name: draft.name.trim(), baseUrl: draft.baseUrl.trim(), openUri: draft.openUri?.trim() || undefined, createUri: draft.createUri?.trim() || undefined, templatesEnabled: !!draft.templatesEnabled, templates: (draft.templates ?? []).filter(t => t.name.trim() && t.uri.trim()), showInHub: draft.showInHub !== false };
    if (editingId) updateCustomSystem(editingId, clean);
    else addCustomSystem({ id: nextId('cs'), ...clean });
    setAdding(false); setEditingId(null); setDraft(EMPTY);
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Custom systems</div>
        <button onClick={() => { setAdding(true); setEditingId(null); setDraft(EMPTY); }}
          style={{ marginLeft: 'auto', border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer' }}>
          + Add system
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t-muted)', marginBottom: 12 }}>
        URL-template integrations, ITSM-style. Every card gets a "<b>name</b>" ticket row: a filled ticket id opens <code>base&nbsp;url + open&nbsp;URI + id</code>; an empty one shows a Create button opening <code>base&nbsp;url + create&nbsp;URI</code> (put page ids etc. straight in the URI).
      </div>
      {customSystems.length === 0 && !formOpen && (
        <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>None yet.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {customSystems.map(sys => (
          <div key={sys.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 700, flexShrink: 0 }}>{sys.name}</span>
            <span style={{ flex: 1, minWidth: 0, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sys.baseUrl}{sys.createUri ? ' · create ✓' : ''}{sys.openUri ? ' · open ✓' : ''}{sys.templatesEnabled ? ` · ${(sys.templates ?? []).length} template${(sys.templates ?? []).length !== 1 ? 's' : ''}` : ''}
            </span>
            <button onClick={() => { setEditingId(sys.id); setAdding(false); setDraft({ name: sys.name, baseUrl: sys.baseUrl, openUri: sys.openUri ?? '', createUri: sys.createUri ?? '', templatesEnabled: sys.templatesEnabled ?? false, templates: sys.templates ?? [], showInHub: sys.showInHub !== false }); }}
              style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}>
              Edit
            </button>
            <span onClick={() => { if (confirm(`Remove "${sys.name}"? Ticket ids typed on cards stay stored.`)) removeCustomSystem(sys.id); }}
              title="Remove system" style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</span>
          </div>
        ))}
      </div>
      {formOpen && (
        <div style={{ marginTop: 12, padding: 14, background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><div style={fl}>Name *</div>
            <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="XYZ" style={fi} />
          </div>
          <div><div style={fl}>Base URL *</div>
            <input value={draft.baseUrl} onChange={e => setDraft(d => ({ ...d, baseUrl: e.target.value }))} placeholder="https://xyz.company.com" style={fi} />
          </div>
          <div><div style={fl}>Open-ticket URI (ticket id is appended)</div>
            <input value={draft.openUri} onChange={e => setDraft(d => ({ ...d, openUri: e.target.value }))} placeholder="/browse/ticket?id=" style={fi} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
              <input type="checkbox" checked={draft.showInHub !== false} onChange={e => setDraft(d => ({ ...d, showInHub: e.target.checked }))} />
              Show this system's tickets on the ▣ Hub page
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
              <input type="checkbox" checked={!!draft.templatesEnabled} onChange={e => setDraft(d => ({ ...d, templatesEnabled: e.target.checked }))} />
              Templates (SN-style) — the card's Create button offers these; use <b>FILL</b> in a URI to be prompted per-create
            </label>
            <div style={{ marginBottom: draft.templatesEnabled ? 10 : 0 }}>
              <div style={fl}>Create URI — common start of creation (alone it powers the blank Create button; each template's URI is appended to it)</div>
              <input value={draft.createUri} onChange={e => setDraft(d => ({ ...d, createUri: e.target.value }))} placeholder="/create?pageId=12345&" style={fi} />
            </div>
            {draft.templatesEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(draft.templates ?? []).map((t, i) => (
                  <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={t.name} onChange={e => setDraft(d => ({ ...d, templates: (d.templates ?? []).map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))}
                      placeholder="Template name" style={{ ...fi, width: 160, flexShrink: 0 }} />
                    <input value={t.uri} onChange={e => setDraft(d => ({ ...d, templates: (d.templates ?? []).map((x, j) => j === i ? { ...x, uri: e.target.value } : x) }))}
                      placeholder="tmpl=42&title=FILL (appended to the common start)" style={fi} />
                    <span onClick={() => setDraft(d => ({ ...d, templates: (d.templates ?? []).filter((_, j) => j !== i) }))}
                      title="Remove template" style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</span>
                  </div>
                ))}
                <button onClick={() => setDraft(d => ({ ...d, templates: [...(d.templates ?? []), { id: nextId('cst'), name: '', uri: '' }] }))}
                  style={{ alignSelf: 'flex-start', border: '1px dashed var(--t-brd)', background: 'transparent', color: 'var(--t-muted)', fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 7, cursor: 'pointer' }}>
                  + Template
                </button>
              </div>
            )}
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setAdding(false); setEditingId(null); setDraft(EMPTY); }}
              style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={save} disabled={!canSave}
              style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 12.5, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', opacity: canSave ? 1 : 0.5 }}>
              {editingId ? 'Save changes' : 'Add system'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
