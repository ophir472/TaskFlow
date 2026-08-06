import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { parseEstimate, formatMinutes } from '../../estimateParser';

interface Props {
  onClose: () => void;
}

// Daily-play popup: shows every task marked forToday, with subtask rows
// underneath. Triangle checkboxes on subtask rows are SESSION-ONLY React state
// (nothing persisted) — closing the popup resets them.
export function DailyPlay({ onClose }: Props) {
  const items = useStore(s => s.items);
  const jiraConfig = useStore(s => s.jiraConfig);
  const updateItem = useStore(s => s.updateItem);
  const updateSubtask = useStore(s => s.updateSubtask);

  const todayTasks: Task[] = useMemo(
    () => items.filter(it => it.kind === 'task' && !it.archived && (it as Task).forToday) as Task[],
    [items],
  );

  const [markedSubIds, setMarkedSubIds] = useState<Set<string>>(new Set());
  function toggleMark(subId: string) {
    setMarkedSubIds(prev => {
      const n = new Set(prev);
      if (n.has(subId)) n.delete(subId);
      else n.add(subId);
      return n;
    });
  }

  // Compute summary — only subtasks (not parent totals) count.
  const markedTotal = useMemo(() => {
    let count = 0;
    let mins = 0;
    for (const t of todayTasks) {
      for (const sub of t.subtasks) {
        if (markedSubIds.has(sub.id)) {
          count++;
          mins += parseEstimate(sub.estimate);
        }
      }
    }
    return { count, mins };
  }, [todayTasks, markedSubIds]);

  const jiraHost = jiraConfig?.host;

  return (
    <div style={backdropSt} onClick={onClose}>
      <div style={popupSt} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--t-brd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.5 0.13 150)', letterSpacing: '0.02em' }}>▶ DAILY</span>
            <span style={{ fontSize: 13, color: 'var(--t-muted)' }}>
              {todayTasks.length} task{todayTasks.length === 1 ? '' : 's'} marked today
            </span>
          </div>
          <button onClick={onClose} title="Close" style={{ border: 'none', background: 'transparent', fontSize: 20, color: 'var(--t-muted)', cursor: 'pointer', padding: '0 6px', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {todayTasks.length === 0 ? (
            <div style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--t-muted)', fontSize: 14 }}>
              No tasks marked for today.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--t-brd)', background: 'var(--t-surf2)' }}>
                  <th style={{ ...th, width: 34 }}></th>
                  <th style={{ ...th }}>Task / Subtask</th>
                  <th style={{ ...th, width: 130 }}>Jira</th>
                  <th style={{ ...th, width: 110, textAlign: 'right', paddingRight: 22 }}>Estimate</th>
                </tr>
              </thead>
              <tbody>
                {todayTasks.map(t => {
                  const jiraLink = t.jiraLink;
                  return (
                    <>
                      {/* Parent task row (no triangle — triangles only on subtasks) */}
                      <tr key={t.id} style={{ borderTop: '1px solid var(--t-brd)' }}>
                        <td style={{ ...td, textAlign: 'center', color: 'var(--t-muted)' }}>·</td>
                        <td style={{ ...td, fontWeight: 600 }}>{t.title}</td>
                        <td style={{ ...td }}>
                          {jiraLink && jiraHost ? (
                            <a href={`https://${jiraHost}/browse/${jiraLink}`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 12.5, color: 'var(--t-acc)', textDecoration: 'none' }}>
                              {jiraLink} ↗
                            </a>
                          ) : jiraLink ? (
                            <span style={{ fontSize: 12.5, color: 'var(--t-muted)' }}>{jiraLink}</span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--t-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right', paddingRight: 22 }}>
                          <input
                            value={t.estimate ?? ''}
                            onChange={e => updateItem(t.id, { estimate: e.target.value })}
                            placeholder="—"
                            style={estInp}
                          />
                        </td>
                      </tr>
                      {/* Subtask rows (indented, with triangle) */}
                      {t.subtasks.map(sub => {
                        const marked = markedSubIds.has(sub.id);
                        return (
                          <tr key={sub.id} style={{ background: marked ? 'oklch(0.96 0.05 150)' : 'transparent' }}>
                            <td style={{ ...td, textAlign: 'center', paddingLeft: 8 }}>
                              <span
                                onClick={() => toggleMark(sub.id)}
                                title={marked ? 'Unmark for today' : 'Mark: I’m doing this today'}
                                style={{
                                  display: 'inline-block', cursor: 'pointer',
                                  fontSize: 15, lineHeight: 1, userSelect: 'none',
                                  color: marked ? 'oklch(0.5 0.13 150)' : 'var(--t-brd)',
                                  transition: 'color 0.12s',
                                }}>
                                {marked ? '▶' : '▷'}
                              </span>
                            </td>
                            <td style={{ ...td, paddingLeft: 32, color: sub.done ? 'var(--t-muted)' : 'var(--t-txt2)', textDecoration: sub.done ? 'line-through' : 'none' }}>
                              <span style={{ color: 'var(--t-muted)', marginRight: 8 }}>↳</span>
                              {sub.title}
                            </td>
                            <td style={{ ...td }}>
                              {sub.jira ? (
                                jiraHost ? (
                                  <a href={`https://${jiraHost}/browse/${sub.jira}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--t-acc)', textDecoration: 'none' }}>
                                    {sub.jira} ↗
                                  </a>
                                ) : (
                                  <span style={{ fontSize: 12, color: 'var(--t-muted)' }}>{sub.jira}</span>
                                )
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--t-brd)' }}>—</span>
                              )}
                            </td>
                            <td style={{ ...td, textAlign: 'right', paddingRight: 22 }}>
                              <input
                                value={sub.estimate ?? ''}
                                onChange={e => updateSubtask(t.id, sub.id, { estimate: e.target.value })}
                                placeholder="—"
                                style={estInp}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer summary */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--t-brd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--t-surf2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, fontWeight: 700 }}>Doing today</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'oklch(0.5 0.13 150)' }}>
                {markedTotal.count} subtask{markedTotal.count === 1 ? '' : 's'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, fontWeight: 700 }}>Total time</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-txt)' }}>
                {formatMinutes(markedTotal.mins)}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 7, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropSt: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
};
const popupSt: React.CSSProperties = {
  width: 'min(900px, 100%)', height: 'min(720px, 100%)',
  background: 'var(--t-surf)', borderRadius: 14,
  boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  borderTop: '3px solid oklch(0.5 0.13 150)',
};
const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--t-muted)',
};
const td: React.CSSProperties = { padding: '9px 14px', verticalAlign: 'middle' };
const estInp: React.CSSProperties = {
  width: 76, fontSize: 13, padding: '5px 8px', borderRadius: 6,
  border: '1px solid var(--t-brd)', background: 'var(--t-surf2)',
  color: 'var(--t-txt)', textAlign: 'center', outline: 'none',
};
