import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';

interface Props {
  entry: Task;
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', boxSizing: 'border-box', outline: 'none' };

// The ONE communication-entry form (Subject / Linked card / What I want to
// say / Mail to send) — hosted by the assistant's preview stepper AND by
// Play's m-shortcut popup so the two can't drift.
export function MailEntryFields({ entry }: Props) {
  const items = useStore(s => s.items);
  const updateItem = useStore(s => s.updateItem);

  const [linkQuery, setLinkQuery] = useState('');
  const [linkSel, setLinkSel] = useState(0);
  useEffect(() => { setLinkQuery(''); setLinkSel(0); }, [entry.id]);

  const linkCandidates = (!entry.linkedTaskId && linkQuery.trim())
    ? items.filter((it): it is Task => it.kind === 'task' && it.type !== 'mail' && !it.archived && it.title.toLowerCase().includes(linkQuery.trim().toLowerCase())).slice(0, 8)
    : [];
  function pickLink(t: Task) {
    updateItem(entry.id, { linkedTaskId: t.id });
    setLinkQuery('');
    setLinkSel(0);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
      <div>
        <div style={lbl}>Subject</div>
        <input value={entry.title} onChange={e => updateItem(entry.id, { title: e.target.value })} style={inp} />
      </div>
      <div>
        <div style={lbl}>Linked card</div>
        {entry.linkedTaskId ? (() => {
          const lt = items.find(i => i.id === entry.linkedTaskId);
          return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 999, background: 'var(--t-acc-bg)', border: '1px solid var(--t-acc)', color: 'var(--t-acc-dk)', fontSize: 12.5, fontWeight: 600, maxWidth: '100%' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>⛓ {lt ? lt.title : '(task deleted)'}</span>
              <span onClick={() => updateItem(entry.id, { linkedTaskId: undefined })} title="Unlink"
                style={{ cursor: 'pointer', fontSize: 13, lineHeight: 1, flexShrink: 0 }}>×</span>
            </div>
          );
        })() : (
          <div style={{ position: 'relative' }}>
            <input
              value={linkQuery}
              onChange={e => { setLinkQuery(e.target.value); setLinkSel(0); }}
              onKeyDown={e => {
                if (!linkCandidates.length) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); setLinkSel(s => Math.min(s + 1, linkCandidates.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setLinkSel(s => Math.max(s - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); pickLink(linkCandidates[Math.min(linkSel, linkCandidates.length - 1)]); }
                else if (e.key === 'Escape') { e.stopPropagation(); setLinkQuery(''); }
              }}
              placeholder="Type to search a task to link…"
              style={inp} />
            {linkCandidates.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 8, boxShadow: '0 10px 28px rgba(0,0,0,0.18)', maxHeight: 190, overflowY: 'auto', padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {linkCandidates.map((t, i) => (
                  <div key={t.id}
                    onClick={() => pickLink(t)}
                    onMouseEnter={() => setLinkSel(i)}
                    style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: i === Math.min(linkSel, linkCandidates.length - 1) ? 'var(--t-acc-bg)' : 'transparent', color: i === Math.min(linkSel, linkCandidates.length - 1) ? 'var(--t-acc-dk)' : 'var(--t-txt)' }}>
                    {t.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div>
        <div style={lbl}>What I want to say</div>
        <textarea value={entry.whatIWantToSay ?? ''} onChange={e => updateItem(entry.id, { whatIWantToSay: e.target.value })}
          rows={4} placeholder="Rough notes — the gist of the answer…"
          style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
      <div>
        <div style={lbl}>Mail to send</div>
        <textarea value={entry.mailToSend ?? ''} onChange={e => updateItem(entry.id, { mailToSend: e.target.value })}
          rows={6} placeholder="The actual draft…"
          style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
    </div>
  );
}
