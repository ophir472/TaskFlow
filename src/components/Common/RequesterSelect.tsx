import { useState } from 'react';
import { useStore } from '../../store';
import { backdropCloseProps } from '../../backdrop';

interface Props {
  value: string;
  onChange: (name: string) => void;
  style?: React.CSSProperties;
}

const NEW = '__new-requester__';
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none' };

// The ONE requester dropdown — used on cards, the task popup, Quick Help and
// the create form. Its last option pops a small form to create a requester
// in place (name + Jira username, which becomes the Reporter mapping).
export function RequesterSelect({ value, onChange, style }: Props) {
  const requesters = useStore(s => s.requesters);
  const addRequester = useStore(s => s.addRequester);
  const setRequesterJiraId = useStore(s => s.setRequesterJiraId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [jira, setJira] = useState('');

  function create() {
    const n = name.trim();
    if (!n) return;
    if (!requesters.includes(n)) addRequester(n);
    if (jira.trim()) setRequesterJiraId(n, jira.trim());
    onChange(n);
    setOpen(false);
    setName('');
    setJira('');
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); create(); }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
  };

  return (
    <>
      <select value={value} onChange={e => { if (e.target.value === NEW) setOpen(true); else onChange(e.target.value); }} style={style}>
        <option value="">—</option>
        {requesters.map(r => <option key={r} value={r}>{r}</option>)}
        <option value={NEW}>+ New requester…</option>
      </select>
      {open && (
        <div {...backdropCloseProps(() => setOpen(false))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 360, maxWidth: '92vw', background: 'var(--t-surf)', borderRadius: 14, border: '1px solid var(--t-brd)', boxShadow: '0 24px 70px rgba(0,0,0,0.4)', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)', marginBottom: 14 }}>New requester</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={lbl}>Name</div>
                <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey} placeholder="Dana Cohen" style={inp} />
              </div>
              <div>
                <div style={lbl}>Jira username (optional — set as Reporter)</div>
                <input value={jira} onChange={e => setJira(e.target.value)} onKeyDown={onKey} placeholder="dcohen" style={inp} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setOpen(false)}
                  style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={create} disabled={!name.trim()}
                  style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 12.5, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', opacity: name.trim() ? 1 : 0.5 }}>
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
