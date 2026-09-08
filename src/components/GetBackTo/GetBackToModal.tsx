import { useEffect } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import type { GetBackTo } from '../../types';

interface Props {
  id: string;
  onClose: () => void;
}

const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 };
const inp: React.CSSProperties = { width: '100%', fontSize: 14, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none' };

// The ONE edit surface for a "get back to" note — Who + Notes, that's it.
// Opened from Explore/Spotlight search results and from a Hub row click.
// Edits save live; "Done" just closes; the ✓ in the corner completes it.
export function GetBackToModal({ id, onClose }: Props) {
  const items = useStore(s => s.items);
  const updateItem = useStore(s => s.updateItem);
  const deleteItem = useStore(s => s.deleteItem);
  const entry = items.find(it => it.id === id && it.kind === 'getback') as GetBackTo | undefined;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!entry) return null;

  function handleDelete() {
    if (!confirm(`Delete "${entry!.title}"?`)) return;
    deleteItem(id);
    onClose();
  }

  const ghostBtn: React.CSSProperties = { border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      {...backdropCloseProps(onClose)}>
      <div
        style={{ width: 460, maxWidth: '94vw', background: 'var(--t-surf)', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.28)', borderTop: '3px solid oklch(0.55 0.16 300)', padding: '22px 26px' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 20, background: 'oklch(0.94 0.05 300)', color: 'oklch(0.55 0.16 300)' }}>Get back to</span>
          {entry.done && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'var(--t-success-bg, var(--t-acc-bg))', color: 'var(--t-success)' }}>DONE</span>
          )}
          <span
            onClick={() => {
              const nowDone = !entry.done;
              updateItem(id, { done: nowDone, doneAt: nowDone ? Date.now() : undefined });
              if (nowDone) onClose();
            }}
            title={entry.done ? 'Followed up — click to reopen' : 'Mark as followed up (completes and closes)'}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', fontSize: 14, fontWeight: 800, cursor: 'pointer', flexShrink: 0, background: entry.done ? 'var(--t-success)' : 'transparent', color: entry.done ? 'white' : 'var(--t-brd)', border: entry.done ? 'none' : '2px solid var(--t-brd)' }}>
            ✓
          </span>
          <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: 'var(--t-muted)', lineHeight: 1, padding: '2px 6px' }}>×</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={fl}>Who</div>
            <input autoFocus value={entry.who} onChange={e => updateItem(id, { who: e.target.value })} style={inp} />
          </div>
          <div>
            <div style={fl}>Notes</div>
            <textarea value={entry.notes} onChange={e => updateItem(id, { notes: e.target.value })}
              rows={4} placeholder="What to bring up…" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose}
            title="Close — changes are saved as you type"
            style={{ ...ghostBtn, flex: 1, background: 'var(--t-acc)', color: 'white', border: 'none' }}>
            Done
          </button>
          <button onClick={handleDelete} style={{ ...ghostBtn, color: 'var(--t-urgent)' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}
