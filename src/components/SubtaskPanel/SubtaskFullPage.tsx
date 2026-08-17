import { useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';

import { ParentContextCard } from './ParentContextCard';
import { SubtaskChecklist } from './SubtaskChecklist';

interface Props { parentId: string; subId: string; onBack: () => void; }

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 };
const inp: React.CSSProperties = { width: '100%', fontSize: 14, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', boxSizing: 'border-box', color: 'var(--t-txt)' };
const ta = (rows: number): React.CSSProperties => ({ ...inp, resize: 'vertical', fontFamily: 'inherit', minHeight: `${rows * 1.6 + 1}em` });

export function SubtaskFullPage({ parentId, subId, onBack }: Props) {
  const items = useStore(s => s.items);
  const updateSubtask = useStore(s => s.updateSubtask);
  const toggleSubtaskDone = useStore(s => s.toggleSubtaskDone);
  const toggleSubtaskNext = useStore(s => s.toggleSubtaskNext);

  const parent = items.find(it => it.id === parentId) as Task | undefined;
  const sub = parent?.subtasks.find(s => s.id === subId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onBack]);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const autoResize = useCallback(() => {
    const el = titleRef.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px';
  }, []);
  useEffect(() => { autoResize(); }, [sub?.id, autoResize]);

  if (!parent || !sub) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--t-muted)' }}>Subtask not found.</div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--t-bg)', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 36px', borderBottom: '1px solid var(--t-brd)', background: 'var(--t-surf)', flexShrink: 0 }}>
        <button onClick={onBack} style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtask of</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-txt2)' }}>{parent.title}</span>
          {parent.jiraLink && <span style={{ fontSize: 12, color: 'var(--t-muted)' }}>· {parent.jiraLink}</span>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13.5, color: 'var(--t-txt2)', userSelect: 'none' }}>
            <input type="checkbox" checked={sub.done} onChange={() => toggleSubtaskDone(parentId, subId)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            Done
          </label>
          <div onClick={() => toggleSubtaskNext(parentId, subId)} title="Mark as next up"
            style={{ cursor: 'pointer', fontSize: 18, color: sub.isNext ? 'var(--t-amber)' : 'var(--t-brd)', userSelect: 'none' }}>★</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 24, padding: '28px 36px 40px' }}>
        <div style={{ width: 880, maxWidth: '100%', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '22px 26px 0' }}>
            <textarea ref={titleRef} value={sub.title}
              placeholder="Title"
              onChange={e => { updateSubtask(parentId, subId, { title: e.target.value }); autoResize(); }}
              rows={1} style={{ width: '100%', border: 'none', outline: 'none', fontSize: 23, fontWeight: 700, letterSpacing: '-0.01em', padding: '4px 0 10px', color: sub.done ? 'var(--t-muted)' : 'var(--t-txt)', background: 'transparent', resize: 'none', overflow: 'hidden', lineHeight: 1.3, fontFamily: 'inherit', display: 'block', textDecoration: sub.done ? 'line-through' : 'none' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, padding: '14px 20px 28px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SubtaskChecklist parentId={parentId} sub={sub} />
              <div><div style={lbl}>Notes</div><textarea value={sub.notes} onChange={e => updateSubtask(parentId, subId, { notes: e.target.value })} placeholder="Notes…" style={ta(5)} rows={5} /></div>
              <div><div style={lbl}>Blockers</div><textarea value={sub.blockers} onChange={e => updateSubtask(parentId, subId, { blockers: e.target.value })} placeholder="Who can help?" style={ta(3)} rows={3} /></div>
              {sub.createdAt && (
                <div style={{ fontSize: 11, color: 'var(--t-muted)', paddingTop: 8, borderTop: '1px solid var(--t-brd)' }}>
                  Created {new Date(sub.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
              )}
            </div>
            <div style={{ width: 200, flexShrink: 0, borderLeft: '1px solid var(--t-brd2)', padding: '14px 22px 28px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={lbl}>Jira (child)</div>
                <input value={sub.jira} onChange={e => updateSubtask(parentId, subId, { jira: e.target.value })} placeholder="PROJ-1235" style={{ ...inp, fontSize: 13, padding: '7px 9px', borderRadius: 7 }} />
                {sub.jira && parent.jiraLink && <div style={{ fontSize: 11, color: 'var(--t-muted)', marginTop: 4 }}>{parent.jiraLink} › {sub.jira}</div>}
              </div>
              <div>
                <div style={lbl}>General link</div>
                <input value={sub.generalLink ?? ''} onChange={e => updateSubtask(parentId, subId, { generalLink: e.target.value })} placeholder="Any URL or ref" style={{ ...inp, fontSize: 13, padding: '7px 9px', borderRadius: 7 }} />
              </div>
            </div>
          </div>
        </div>
        <ParentContextCard task={parent} style={{ position: 'sticky', top: 0, flexShrink: 0, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }} />
      </div>
    </div>
  );
}
