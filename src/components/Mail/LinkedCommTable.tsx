import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { buildMailEntry } from '../../mailEntry';

interface Props {
  task: Task;
}

// "To send" table on a card — a VIEW of communication-assistant entries
// linked to this task (mail-type tasks with linkedTaskId). Strict columns
// mirror the assistant's entry form: Subject / What I want to say / Mail to
// send. One entity, two views: edits and sent-state agree everywhere.
export function LinkedCommTable({ task }: Props) {
  const items = useStore(s => s.items);
  const updateItem = useStore(s => s.updateItem);
  const createItem = useStore(s => s.createItem);

  const linked = items.filter((it): it is Task => it.kind === 'task' && it.type === 'mail' && it.linkedTaskId === task.id);
  const pending = linked.filter(m => !m.archived);
  const sent = linked.filter(m => m.archived);

  const [open, setOpen] = useState(pending.length > 0);
  const [showSent, setShowSent] = useState(false);
  const [newRow, setNewRow] = useState('');

  useEffect(() => {
    setOpen(items.some(it => it.kind === 'task' && it.type === 'mail' && it.linkedTaskId === task.id && !it.archived));
    setShowSent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  function addEntry() {
    const v = newRow.trim();
    if (!v) return;
    createItem(buildMailEntry(v, task.id));
    setNewRow('');
    setOpen(true);
  }

  const rows = showSent ? [...pending, ...sent] : pending;
  const hdrSt: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 0' };
  const cellInp: React.CSSProperties = { width: '100%', fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' };
  const gridCols = '1.1fr 1fr 1fr 22px 22px';

  return (
    <div style={{ border: '1px solid var(--t-brd)', borderRadius: 10, background: 'var(--t-surf)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--t-txt2)', textAlign: 'left' }}>
        <span style={{ fontSize: 11, color: 'var(--t-muted)', lineHeight: 1 }}>✉</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To send</span>
        {pending.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: 'var(--t-amber-bg)', color: 'var(--t-amber)' }}>{pending.length}</span>
        )}
        {pending.length === 0 && linked.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>all sent</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
      </button>

      {open && (
        <div style={{ padding: '2px 14px 12px' }}>
          {rows.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <div style={hdrSt}>Subject</div>
              <div style={hdrSt}>What I want to say</div>
              <div style={hdrSt}>Mail to send</div>
              <span />
              <span />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(m => (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 6, alignItems: 'center', opacity: m.archived ? 0.55 : 1 }}>
                <input
                  value={m.title}
                  onChange={e => updateItem(m.id, { title: e.target.value })}
                  style={{ ...cellInp, textDecoration: m.archived ? 'line-through' : 'none', color: m.archived ? 'var(--t-muted)' : 'var(--t-txt)' }} />
                <textarea
                  value={m.whatIWantToSay ?? ''}
                  onChange={e => updateItem(m.id, { whatIWantToSay: e.target.value })}
                  rows={1}
                  style={{ ...cellInp, resize: 'vertical', fontFamily: 'inherit', minHeight: 29 }} />
                <textarea
                  value={m.mailToSend ?? ''}
                  onChange={e => updateItem(m.id, { mailToSend: e.target.value })}
                  rows={1}
                  style={{ ...cellInp, resize: 'vertical', fontFamily: 'inherit', minHeight: 29 }} />
                <span
                  onClick={() => updateItem(m.id, m.archived ? { status: 'backlog' } : { status: 'done' })}
                  title={m.archived ? 'Reopen — back to pending' : 'Mail sent'}
                  style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, textAlign: 'center', color: m.archived ? 'oklch(0.5 0.13 150)' : 'var(--t-brd)', userSelect: 'none' }}>
                  ✓
                </span>
                <span
                  onClick={() => { window.location.hash = `mail/preview/${m.id}`; }}
                  title="Open in the communication assistant"
                  style={{ cursor: 'pointer', fontSize: 12, textAlign: 'center', color: 'var(--t-acc)', userSelect: 'none' }}>
                  ✉
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: rows.length > 0 ? 8 : 2, alignItems: 'center' }}>
            <input
              value={newRow}
              onChange={e => setNewRow(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addEntry(); }}
              placeholder="+ Subject to respond to… (also lands in the ✉ assistant)"
              style={{ ...cellInp, flex: 1, background: 'transparent', borderStyle: 'dashed', boxShadow: 'none' }} />
            {sent.length > 0 && (
              <button onClick={() => setShowSent(v => !v)}
                style={{ border: 'none', background: 'transparent', color: 'var(--t-muted)', fontSize: 11.5, fontWeight: 600, padding: '4px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', transform: showSent ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', fontSize: 11, lineHeight: 1 }}>›</span>
                {showSent ? 'Hide sent' : `${sent.length} sent`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
