import { useState } from 'react';
import { useStore } from '../../store';
import { nextId } from '../../engine';
import { THEMES } from '../../themes';
import { ThemePicker } from './ThemePicker';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };
const listItem: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 8, fontSize: 14, color: 'var(--t-txt)' };
const addBtn: React.CSSProperties = { border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const inp: React.CSSProperties = { flex: 1, fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)' };

function ManagedList({ title, items, onAdd, onRemove }: { title: string; items: string[]; onAdd: (n: string) => void; onRemove: (n: string) => void }) {
  const [input, setInput] = useState('');
  const submit = () => { if (input.trim()) { onAdd(input.trim()); setInput(''); } };
  return (
    <div style={{ ...card, flex: 1, minWidth: 240 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {items.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>None yet</div>}
        {items.map(item => (
          <div key={item} style={listItem}>
            <span>{item}</span>
            <span onClick={() => onRemove(item)} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 16, lineHeight: 1 }}>×</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder={`Add ${title.toLowerCase().slice(0, -1)}`} style={inp}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <button onClick={submit} style={addBtn}>Add</button>
      </div>
    </div>
  );
}

export function Settings() {
  const requesters = useStore(s => s.requesters);
  const projects = useStore(s => s.projects);
  const customFields = useStore(s => s.customFields);
  const addRequester = useStore(s => s.addRequester);
  const removeRequester = useStore(s => s.removeRequester);
  const addProject = useStore(s => s.addProject);
  const removeProject = useStore(s => s.removeProject);
  const addCustomField = useStore(s => s.addCustomField);
  const removeCustomField = useStore(s => s.removeCustomField);
  const updateCustomField = useStore(s => s.updateCustomField);
  const themeId = useStore(s => s.themeId);
  const [page, setPage] = useState<'main' | 'appearance'>('main');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldTable, setNewFieldTable] = useState(true);
  const [newFieldCard, setNewFieldCard] = useState(false);

  const handleAddField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    addCustomField({ id: nextId('cf'), name, showInTable: newFieldTable, showInCard: newFieldCard });
    setNewFieldName('');
    setNewFieldTable(true);
    setNewFieldCard(false);
  };

  const check = (checked: boolean, label: string, onChange: (v: boolean) => void) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ cursor: 'pointer' }} />
      {label}
    </label>
  );

  if (page === 'appearance') return <ThemePicker onBack={() => setPage('main')} />;

  const activeTheme = THEMES.find(t => t.id === themeId) ?? THEMES[0];

  return (
    <div style={{ flex: 1, padding: '8px 36px 36px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Appearance */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 3 }}>Appearance</div>
            <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>
              Current theme: <span style={{ fontWeight: 600, color: 'var(--t-acc)' }}>{activeTheme.name}</span>
            </div>
          </div>
          <button
            onClick={() => setPage('appearance')}
            style={{ ...addBtn, display: 'flex', alignItems: 'center', gap: 7 }}
          >
            🎨 Change theme
          </button>
        </div>
      </div>

      {/* Managed lists row */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <ManagedList title="Requesters" items={requesters} onAdd={addRequester} onRemove={removeRequester} />
        <ManagedList title="Projects" items={projects} onAdd={addProject} onRemove={removeProject} />
      </div>

      {/* Custom fields */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Custom fields</div>
        <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 16 }}>Extra fields shown on the table and/or the card. Values are free text.</div>

        {/* Existing fields */}
        {customFields.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 16 }}>No custom fields yet.</div>
        )}
        {customFields.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {customFields.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 9 }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{f.name}</span>
                {check(f.showInTable, 'Table', v => updateCustomField(f.id, { showInTable: v }))}
                {check(f.showInCard, 'Card', v => updateCustomField(f.id, { showInCard: v }))}
                <span onClick={() => removeCustomField(f.id)} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 16, marginLeft: 4, lineHeight: 1 }}>×</span>
              </div>
            ))}
          </div>
        )}

        {/* Add new field */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--t-brd)' }}>
          <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="Field name"
            style={{ ...inp, flex: '1 1 160px', minWidth: 120 }}
            onKeyDown={e => e.key === 'Enter' && handleAddField()} />
          {check(newFieldTable, 'Table', setNewFieldTable)}
          {check(newFieldCard, 'Card', setNewFieldCard)}
          <button onClick={handleAddField} disabled={!newFieldName.trim()} style={{ ...addBtn, opacity: newFieldName.trim() ? 1 : 0.5, cursor: newFieldName.trim() ? 'pointer' : 'not-allowed' }}>
            Add field
          </button>
        </div>
      </div>
    </div>
  );
}
