import { useState, useEffect, useRef } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { nextId } from '../../engine';

interface Props {
  onClose: () => void;
}

function stageFromHash(): 'capture' | 'preview' {
  const parts = window.location.hash.slice(1).split('/');
  return parts[0] === 'mail' && parts[1] === 'preview' ? 'preview' : 'capture';
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', boxSizing: 'border-box', outline: 'none' };

// Communication assistant (#mail): fast capture of mail/Teams items to
// respond to. Entries are regular tasks with type:'mail' — they live in the
// table (✉ Mail filter) and the archive once sent, but stay out of the card
// feed, Kanban and review. #mail/preview walks them one at a time.
export function MailAssistant({ onClose }: Props) {
  const items = useStore(s => s.items);
  const createItem = useStore(s => s.createItem);
  const updateItem = useStore(s => s.updateItem);
  const deleteItem = useStore(s => s.deleteItem);

  const [stage, setStage] = useState<'capture' | 'preview'>(stageFromHash);
  useEffect(() => {
    const onHash = () => setStage(stageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mails = items.filter((it): it is Task => it.kind === 'task' && it.type === 'mail' && !it.archived);

  // ── capture ──
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  function commit() {
    const v = text.trim();
    if (!v) return;
    const now = Date.now();
    createItem({
      id: nextId('t'), kind: 'task', type: 'mail', title: v,
      description: '', notes: '', blockers: '', generalLink: '', jiraLink: '',
      requester: '', project: '', status: 'backlog',
      urgent: false, important: false, quick: false, noTag: true, noJira: true,
      forToday: false, toCheck: '', priorityBoost: false, subtasks: [],
      bumpedAt: now, staleness: 0, createdAt: now, updatedAt: now, archived: false,
    });
    setText('');
    inputRef.current?.focus();
  }

  // ── preview stepper: freeze the entry list when entering ──
  const [stepIds, setStepIds] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [sent, setSent] = useState(0);
  const [skipped, setSkipped] = useState(0);
  useEffect(() => {
    if (stage === 'preview') {
      setStepIds(items.filter((it): it is Task => it.kind === 'task' && it.type === 'mail' && !it.archived).map(m => m.id));
      setIdx(0); setSent(0); setSkipped(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const doneStepping = stage === 'preview' && idx >= stepIds.length;
  const current = !doneStepping && stage === 'preview'
    ? (items.find(i => i.id === stepIds[idx]) as Task | undefined)
    : undefined;
  // Entry deleted mid-walk → advance past it.
  useEffect(() => {
    if (stage === 'preview' && !doneStepping && !current) setIdx(i => i + 1);
  }, [stage, doneStepping, current]);

  function markSent() {
    if (!current) return;
    // status 'done' auto-archives via the store's status⇄archive link.
    updateItem(current.id, { status: 'done' });
    setSent(n => n + 1);
    setIdx(i => i + 1);
  }
  function skip() {
    setSkipped(n => n + 1);
    setIdx(i => i + 1);
  }

  const accBtn: React.CSSProperties = { border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '9px 16px', borderRadius: 8, cursor: 'pointer' };
  const ghostBtn: React.CSSProperties = { border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 8, cursor: 'pointer' };

  return (
    <div {...backdropCloseProps(onClose)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 560, maxWidth: '92vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-txt)', letterSpacing: '-0.01em' }}>
            ✉ Communication assistant
          </div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 20, lineHeight: 1 }}>×</span>
        </div>

        {stage === 'capture' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                ref={inputRef}
                autoFocus
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commit(); }}
                placeholder="Mail subject / Teams chat to respond to…"
                style={{ ...inp, flex: 1 }} />
              <button onClick={commit} disabled={!text.trim()}
                style={{ ...accBtn, opacity: text.trim() ? 1 : 0.5, cursor: text.trim() ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                Add
              </button>
            </div>

            {mails.length > 0 ? (
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                {mails.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', fontSize: 13, color: 'var(--t-txt)' }}>
                    <span style={{ fontSize: 11, color: 'var(--t-muted)', flexShrink: 0 }}>✉</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                    {(m.whatIWantToSay?.trim() || m.mailToSend?.trim()) && (
                      <span title="Has draft notes" style={{ fontSize: 10, color: 'var(--t-acc)', flexShrink: 0 }}>✎</span>
                    )}
                    <span onClick={() => deleteItem(m.id)} title="Delete entry"
                      style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>×</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--t-muted)', padding: '8px 0 14px' }}>
                Nothing captured yet — type and press Enter. Entries persist until sent.
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => { window.location.hash = 'mail/preview'; }} disabled={mails.length === 0}
                style={{ ...accBtn, opacity: mails.length ? 1 : 0.5, cursor: mails.length ? 'pointer' : 'not-allowed' }}>
                Preview ({mails.length})
              </button>
              <span style={{ fontSize: 11.5, color: 'var(--t-muted)' }}>
                Entries are tasks — find them in the table with the ✉ Mail filter.
              </span>
            </div>
          </>
        )}

        {stage === 'preview' && !doneStepping && current && (
          <>
            <div style={{ fontSize: 12, color: 'var(--t-muted)', marginBottom: 12 }}>
              Entry {idx + 1} of {stepIds.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
              <div>
                <div style={lbl}>Subject</div>
                <input value={current.title} onChange={e => updateItem(current.id, { title: e.target.value })} style={inp} />
              </div>
              <div>
                <div style={lbl}>What I want to say</div>
                <textarea value={current.whatIWantToSay ?? ''} onChange={e => updateItem(current.id, { whatIWantToSay: e.target.value })}
                  rows={4} placeholder="Rough notes — the gist of the answer…"
                  style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div>
                <div style={lbl}>Mail to send</div>
                <textarea value={current.mailToSend ?? ''} onChange={e => updateItem(current.id, { mailToSend: e.target.value })}
                  rows={6} placeholder="The actual draft…"
                  style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={markSent}
                style={{ ...accBtn, background: 'oklch(0.6 0.14 150)' }}>
                ✓ Mail sent — archive
              </button>
              <button onClick={skip} style={ghostBtn}>Continue (skip) →</button>
              <button onClick={() => { window.location.hash = 'mail'; }} style={{ ...ghostBtn, marginLeft: 'auto' }}>Back</button>
            </div>
          </>
        )}

        {stage === 'preview' && doneStepping && (
          <>
            <div style={{ fontSize: 15, color: 'var(--t-txt)', padding: '10px 0 4px' }}>
              Pass complete — <b style={{ color: 'oklch(0.5 0.14 150)' }}>{sent} sent</b>{' · '}
              <b>{skipped} skipped</b>{stepIds.length === 0 && ' (nothing to walk through)'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--t-muted)', marginBottom: 16 }}>
              Sent entries moved to the archive (✉ Mail filter there finds them). Skipped ones stay in the capture list.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { window.location.hash = 'mail'; }} style={accBtn}>Back to capture</button>
              <button onClick={onClose} style={ghostBtn}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
