import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { TypePicker } from '../Common/TypePicker';
import { RequesterSelect } from '../Common/RequesterSelect';
import { FollowupSection } from '../Common/FollowupSection';
import { ScopeToggle } from '../Common/ScopeToggle';
import { TicketSections } from '../Common/TicketSections';
import { QuickToActSection } from '../Common/QuickToActSection';
import { CommunicationSection, getCommunications } from '../Common/CommunicationSection';
import { WaitingForSection } from '../Common/WaitingForSection';
import { EstimatesSection } from '../Common/EstimatesSection';
import { ResizableTextarea } from '../Common/ResizableTextarea';

interface Props {
  onToast?: (msg: string) => void;
}

const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };
const ta: React.CSSProperties = { width: '100%', fontSize: 13.5, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', outline: 'none' };
const sel: React.CSSProperties = { width: '100%', fontSize: 13.5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxSizing: 'border-box' };

// ⚡ Quick Help (#quickhelp) — walker over type-'quick' tasks: the small asks
// that never enter the scored card feed. Same entity, full fields, same
// shared sections as the card/popup. ← → walk, ✓ completes (archives).
export function QuickHelp({ onToast }: Props) {
  const items = useStore(s => s.items);
  const updateItem = useStore(s => s.updateItem);
  const completeItem = useStore(s => s.completeItem);
  const [idx, setIdx] = useState(0);

  const pool = items.filter((it): it is Task =>
    it.kind === 'task' && it.type === 'quick' && !it.archived && it.status !== 'done' && it.status !== 'archived');
  const safeIdx = Math.min(idx, Math.max(pool.length - 1, 0));
  const t = pool[safeIdx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.code === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
      else if (e.code === 'ArrowRight') setIdx(i => Math.min(i + 1, Math.max(pool.length - 1, 0)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pool.length]);

  if (!t) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 10 }}>
        <div style={{ fontSize: 40 }}>⚡</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t-txt)' }}>No quick help pending</div>
        <div style={{ fontSize: 13.5, color: 'var(--t-muted)', maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
          Small asks land here when a task's kind is set to <b>Quick help</b> — they skip the card feed entirely and join the Sprint pool.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 20px 60px' }}>
      {/* Walker header */}
      <div style={{ width: 760, maxWidth: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-txt)' }}>⚡ Quick help</span>
        <span style={{ fontSize: 12.5, color: 'var(--t-muted)' }}>{safeIdx + 1} of {pool.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setIdx(i => Math.max(i - 1, 0))} disabled={safeIdx === 0}
            style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, padding: '5px 12px', borderRadius: 7, cursor: safeIdx === 0 ? 'default' : 'pointer', opacity: safeIdx === 0 ? 0.5 : 1 }}>←</button>
          <button onClick={() => setIdx(i => Math.min(i + 1, pool.length - 1))} disabled={safeIdx >= pool.length - 1}
            style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, padding: '5px 12px', borderRadius: 7, cursor: safeIdx >= pool.length - 1 ? 'default' : 'pointer', opacity: safeIdx >= pool.length - 1 ? 0.5 : 1 }}>→</button>
        </div>
      </div>

      {/* The task — full fields, shared sections (same entity as everywhere) */}
      <div style={{ width: 760, maxWidth: '100%', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderTop: `3px solid var(--t-quick)`, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input value={t.title} onChange={e => updateItem(t.id, { title: e.target.value })}
            style={{ flex: 1, fontSize: 19, fontWeight: 700, border: 'none', outline: 'none', background: 'transparent', color: 'var(--t-txt)' }} />
          <button onClick={() => { completeItem(t.id); onToast?.('Done 🎉'); }}
            style={{ border: 'none', background: 'var(--t-success)', color: 'white', fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}>
            ✓ Done
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><TypePicker task={t} /><ScopeToggle task={t} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={fl}>Requester</div>
            <RequesterSelect value={t.requester} onChange={v => updateItem(t.id, { requester: v })} style={sel} />
          </div>
          <div>
            <div style={fl}>Description</div>
            <ResizableTextarea taskId={t.id} fieldKey="description" value={t.description} onChange={e => updateItem(t.id, { description: e.target.value })} rows={2} style={ta} />
          </div>
        </div>
        <div>
          <div style={fl}>Notes</div>
          <ResizableTextarea taskId={t.id} fieldKey="notes" value={t.notes} onChange={e => updateItem(t.id, { notes: e.target.value })} rows={3} style={ta} />
        </div>
        <QuickToActSection task={t} />
        <CommunicationSection taskId={t.id} task={t} fields={getCommunications(t.communications)} />
        <WaitingForSection task={t} />
        <FollowupSection task={t} />
        <EstimatesSection task={t} />
        <TicketSections task={t} onToast={onToast} />
      </div>
      <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--t-muted)' }}>← → walk the queue · set the kind to Planned/Urgent to send it to the card feed</div>
    </div>
  );
}
