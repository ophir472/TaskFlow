import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { followupRows, isProgressed, refOf, type FollowupRow } from '../../followups';

interface Props {
  task: Task;
}

export const PROGRESS_BLUE = 'oklch(0.55 0.15 250)';

// The two marks every followup row carries — blue ✓ progressed (today-only,
// strikes the row through, resets at 00:00), green ✓✓✓ done (hides the row).
// Different glyph counts on purpose: one check = a step, three = finished.
// Shared by the card section and the Hub so they can't drift.
export function FollowupMarks({ taskId, row }: { taskId: string; row: FollowupRow }) {
  const toggleFollowupProgressed = useStore(s => s.toggleFollowupProgressed);
  const setFollowupDone = useStore(s => s.setFollowupDone);
  const prog = isProgressed(row);
  const pill = (on: boolean, color: string, wide: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 18, minWidth: wide ? 34 : 18, padding: wide ? '0 5px' : 0, borderRadius: 999,
    fontSize: 10, fontWeight: 800, letterSpacing: wide ? '-1px' : 0, cursor: 'pointer', flexShrink: 0, boxSizing: 'border-box',
    background: on ? color : 'transparent', color: on ? 'white' : 'var(--t-brd)', border: on ? 'none' : '1.5px solid var(--t-brd)',
  });
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
      <span onClick={e => { e.stopPropagation(); toggleFollowupProgressed(taskId, refOf(row)); }}
        title={prog ? 'Progressed today — click to undo' : 'Progressed ✓ (strikes through until midnight)'}
        style={pill(prog, PROGRESS_BLUE, false)}>✓</span>
      <span onClick={e => { e.stopPropagation(); setFollowupDone(taskId, refOf(row), !row.done); }}
        title={row.done ? 'Done ✓✓✓ — click to reopen' : 'Done ✓✓✓ (hides the row)'}
        style={pill(row.done, 'var(--t-success)', true)}>✓✓✓</span>
    </span>
  );
}

// Per-card "Followup" table, under Waiting for. Manual rows (title + notes)
// plus one auto row per ITSM / custom-system ticket on the card — the
// ticket's own ✓ and the row's green ✓ are the same state.
export function FollowupSection({ task }: Props) {
  const customSystems = useStore(s => s.customSystems);
  const addFollowup = useStore(s => s.addFollowup);
  const updateFollowup = useStore(s => s.updateFollowup);
  const removeFollowup = useStore(s => s.removeFollowup);

  const rows = followupRows(task, customSystems);
  const active = rows.filter(r => !r.done);
  const done = rows.filter(r => r.done);

  const [open, setOpen] = useState(active.length > 0);
  const [showCompleted, setShowCompleted] = useState(false);
  const [draft, setDraft] = useState('');
  // Blur-commit drafts so typing doesn't spam versioned events per keystroke.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const prevActive = useRef(active.length);
  useEffect(() => {
    if (prevActive.current > 0 && active.length === 0) setOpen(false);
    if (prevActive.current === 0 && active.length > 0) setOpen(true);
    prevActive.current = active.length;
  }, [active.length]);
  useEffect(() => { setOpen(rows.some(r => !r.done)); setShowCompleted(false); setEdits({}); }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(row: FollowupRow, field: 'title' | 'notes') {
    const key = `${row.id}:${field}`;
    if (!(key in edits)) return;
    const v = edits[key];
    setEdits(e => { const n = { ...e }; delete n[key]; return n; });
    if (v !== row[field]) updateFollowup(task.id, refOf(row), { [field]: v });
  }

  const displayRows = showCompleted ? [...active, ...done] : active;
  const cellInp: React.CSSProperties = { width: '100%', fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ border: '1px solid var(--t-brd)', borderRadius: 10, background: 'var(--t-surf)' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--t-txt2)', textAlign: 'left' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Followup</span>
        {active.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: `color-mix(in oklab, ${PROGRESS_BLUE} 14%, var(--t-surf2))`, color: PROGRESS_BLUE }}>{active.length}</span>
        )}
        {active.length === 0 && rows.length > 0 && <span style={{ fontSize: 11, color: 'var(--t-muted)' }}>all done</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
      </button>

      {open && (
        <div style={{ padding: '2px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {displayRows.map(row => {
            const prog = isProgressed(row);
            const struck = prog || row.done;
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '60px minmax(120px, 1fr) minmax(120px, 1.4fr) 18px', gap: 6, alignItems: 'center', opacity: row.done ? 0.55 : 1 }}>
                <FollowupMarks taskId={task.id} row={row} />
                {row.manual ? (
                  <input
                    value={edits[`${row.id}:title`] ?? row.title}
                    onChange={e => setEdits(ed => ({ ...ed, [`${row.id}:title`]: e.target.value }))}
                    onBlur={() => commit(row, 'title')}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    style={{ ...cellInp, textDecoration: struck ? 'line-through' : 'none', color: struck ? 'var(--t-muted)' : 'var(--t-txt)' }} />
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: struck ? 'line-through' : 'none', color: struck ? 'var(--t-muted)' : 'var(--t-txt)' }}>{row.title}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--t-surf3)', color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{row.subtitle}</span>
                  </span>
                )}
                <input
                  value={edits[`${row.id}:notes`] ?? row.notes}
                  onChange={e => setEdits(ed => ({ ...ed, [`${row.id}:notes`]: e.target.value }))}
                  onBlur={() => commit(row, 'notes')}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  placeholder="notes" style={{ ...cellInp, color: 'var(--t-txt2)' }} />
                {row.manual ? (
                  <span onClick={() => removeFollowup(task.id, row.id)} title="Remove"
                    style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 14, lineHeight: 1, textAlign: 'center' }}>×</span>
                ) : <span />}
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <input value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) { addFollowup(task.id, draft.trim()); setDraft(''); } }}
              placeholder="+ Followup… (Enter)" style={{ ...cellInp, flex: 1, border: '1px dashed var(--t-brd)', background: 'transparent' }} />
            {done.length > 0 && (
              <button onClick={() => setShowCompleted(v => !v)}
                style={{ border: 'none', background: 'transparent', color: 'var(--t-muted)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {showCompleted ? 'Hide' : 'Show'} {done.length} completed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
