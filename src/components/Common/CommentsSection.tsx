import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';

// Comments — a running log of quick updates on a card (newest first). Enter
// posts, Shift+Enter is a newline; double-click a comment to edit (blur
// commits); × asks once more before deleting. Comments written since the
// card's last review are pulled into the review's "Update Jira" prefill.
// Shared by the card feed, the task popup and Quick Help (parity).
interface Props { task: Task; emphasized?: boolean }

const fmt = (ts: number) => {
  const d = new Date(ts); const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

export function CommentsSection({ task, emphasized }: Props) {
  const addComment = useStore(s => s.addComment);
  const updateComment = useStore(s => s.updateComment);
  const removeComment = useStore(s => s.removeComment);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [armed, setArmed] = useState<string | null>(null);     // × clicked once
  const armTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  const comments = [...(task.comments ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const post = () => { const v = draft.trim(); if (!v) return; addComment(task.id, v); setDraft(''); };

  const lbl: React.CSSProperties = { fontSize: emphasized ? 13 : 11, fontWeight: 700, color: emphasized ? 'var(--t-acc-dk)' : 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const inp: React.CSSProperties = { width: '100%', fontSize: emphasized ? 15 : 14, padding: emphasized ? '10px 12px' : '7px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.45 };

  return (
    <div data-review-target="comments" style={{ border: emphasized ? '2px solid var(--t-acc)' : '1px solid var(--t-brd)', background: emphasized ? 'var(--t-acc-bg)' : 'var(--t-surf2)', borderRadius: 10, padding: emphasized ? 16 : 12, transition: 'all 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={lbl}>Comments</div>
        {comments.length > 0 && <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>{comments.length}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--t-muted)' }}>↵ post · ⇧↵ newline</span>
      </div>
      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={draft.includes('\n') ? 3 : 1}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post(); } if (e.key === 'Escape') { e.stopPropagation(); (e.target as HTMLTextAreaElement).blur(); } }}
        placeholder="Quick update — what happened, what's next…" style={inp} />
      {comments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 8, background: 'var(--t-surf)', border: '1px solid var(--t-brd2)' }}>
              <span title={new Date(c.createdAt).toLocaleString()} style={{ fontSize: 11, color: 'var(--t-muted)', whiteSpace: 'nowrap', flexShrink: 0, paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(c.createdAt)}</span>
              {editingId === c.id ? (
                <textarea autoFocus value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={Math.max(1, editDraft.split('\n').length)}
                  onBlur={() => { const v = editDraft.trim(); if (v && v !== c.text) updateComment(task.id, c.id, v); setEditingId(null); }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); } }}
                  style={{ ...inp, flex: 1, padding: '4px 8px', fontSize: 13.5 }} />
              ) : (
                <span onDoubleClick={() => { setEditingId(c.id); setEditDraft(c.text); }} title="Double-click to edit"
                  style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--t-txt)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
                  {c.text}{c.updatedAt && <span style={{ fontSize: 10.5, color: 'var(--t-muted)' }}> (edited)</span>}
                </span>
              )}
              <span onClick={() => {
                  if (armed === c.id) { removeComment(task.id, c.id); setArmed(null); return; }
                  setArmed(c.id); window.clearTimeout(armTimer.current); armTimer.current = window.setTimeout(() => setArmed(null), 3000);
                }}
                title={armed === c.id ? 'Click again to delete' : 'Delete'}
                style={{ cursor: 'pointer', flexShrink: 0, fontSize: armed === c.id ? 11 : 14, lineHeight: 1, color: armed === c.id ? 'var(--t-urgent)' : 'var(--t-muted)', fontWeight: armed === c.id ? 700 : 400, paddingTop: 2 }}>
                {armed === c.id ? 'delete?' : '×'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
