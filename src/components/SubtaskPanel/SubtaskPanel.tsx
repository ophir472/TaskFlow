import { useEffect } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { ParentContextCard } from './ParentContextCard';
import { SubtaskChecklist } from './SubtaskChecklist';

interface Props {
  parentId: string;
  subId: string;
  onClose: () => void;
  onExpand?: () => void;
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 };
const inp: React.CSSProperties = { width: '100%', fontSize: 14, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', boxSizing: 'border-box', color: 'var(--t-txt)' };
const ta: React.CSSProperties = { ...inp, resize: 'vertical' as const, fontFamily: 'inherit' };

export function SubtaskPanel({ parentId, subId, onClose, onExpand }: Props) {
  const items = useStore(s => s.items);
  const updateSubtask = useStore(s => s.updateSubtask);
  const toggleSubtaskDone = useStore(s => s.toggleSubtaskDone);

  const parent = items.find(it => it.id === parentId) as Task | undefined;
  const sub = parent?.subtasks.find(s => s.id === subId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!parent || !sub) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}
      {...backdropCloseProps(onClose)}>
      <ParentContextCard task={parent} style={{ alignSelf: 'center', marginRight: 16, maxHeight: '82vh', overflowY: 'auto', flexShrink: 0 }} />
      <div style={{ width: 420, maxWidth: '90vw', height: '100%', background: 'var(--t-surf)', boxShadow: '-8px 0 30px rgba(0,0,0,0.2)', padding: 26, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={sub.done} onChange={() => toggleSubtaskDone(parentId, subId)} style={{ width: 17, height: 17, cursor: 'pointer' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtask</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onExpand && <div onClick={onExpand} title="Open full page" style={{ cursor: 'pointer', fontSize: 15, color: 'var(--t-muted)', lineHeight: 1 }}>⤢</div>}
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 18, color: 'var(--t-muted)', lineHeight: 1 }}>×</div>
          </div>
        </div>

        <input value={sub.title} onChange={e => updateSubtask(parentId, subId, { title: e.target.value })}
          placeholder="Title"
          style={{ border: 'none', outline: 'none', fontSize: 19, fontWeight: 700, padding: 0, background: 'transparent', color: sub.done ? 'var(--t-muted)' : 'var(--t-txt)', textDecoration: sub.done ? 'line-through' : 'none' }} />

        <div style={{ fontSize: 12, color: 'var(--t-muted)', padding: '8px 12px', background: 'var(--t-surf2)', borderRadius: 8, border: '1px solid var(--t-brd)' }}>
          Parent: <span style={{ fontWeight: 600, color: 'var(--t-txt2)' }}>{parent.title}</span>
          {parent.jiraLink && <span> · {parent.jiraLink}</span>}
        </div>

        <div><div style={lbl}>Jira (child)</div>
          <input value={sub.jira} onChange={e => updateSubtask(parentId, subId, { jira: e.target.value })} placeholder="PROJ-1235" style={inp} />
          {sub.jira && parent.jiraLink && <div style={{ fontSize: 11, color: 'var(--t-muted)', marginTop: 4 }}>{parent.jiraLink} › {sub.jira}</div>}
        </div>

        <div><div style={lbl}>General link</div>
          <input value={sub.generalLink ?? ''} onChange={e => updateSubtask(parentId, subId, { generalLink: e.target.value })} placeholder="Any URL or reference" style={inp} />
        </div>

        <SubtaskChecklist parentId={parentId} sub={sub} />

        <div><div style={lbl}>Notes</div>
          <textarea value={sub.notes} onChange={e => updateSubtask(parentId, subId, { notes: e.target.value })} rows={4} style={ta} />
        </div>

        <div><div style={lbl}>Blockers</div>
          <textarea value={sub.blockers} onChange={e => updateSubtask(parentId, subId, { blockers: e.target.value })} rows={2} placeholder="Who can help?" style={ta} />
        </div>

        {sub.createdAt && (
          <div style={{ fontSize: 11, color: 'var(--t-muted)', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--t-brd)' }}>
            Created {new Date(sub.createdAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
