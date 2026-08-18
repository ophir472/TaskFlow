import { useState, useMemo, useEffect } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { parseEstimate, formatMinutes } from '../../estimateParser';
import { jiraTicketUrl } from '../../jiraHosts';
import { openTicketWindow } from '../../ticketWindow';

interface Props {
  onClose: () => void;
}

// Daily-play popup: shows every task marked forToday, with subtask rows
// underneath. Triangle checkboxes on subtask rows are SESSION-ONLY React state
// (nothing persisted) — closing the popup resets them.
export function DailyPlay({ onClose }: Props) {
  const items = useStore(s => s.items);
  const jiraConfigs = useStore(s => s.jiraConfigs);
  const updateItem = useStore(s => s.updateItem);
  const updateSubtask = useStore(s => s.updateSubtask);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const todayTasks: Task[] = useMemo(
    () => items.filter(it => it.kind === 'task' && !it.archived && (it as Task).forToday) as Task[],
    [items],
  );

  const openJira = (url: string, _key: string) => window.open(url, '_blank');
  const [markedSubIds, setMarkedSubIds] = useState<Set<string>>(new Set());
  // Session-only visibility: completed subtasks are hidden by default (toggle
  // to show), and any row can be hidden manually. Both reset when the popup
  // closes — reopening hides only the completed ones again.
  const [showCompleted, setShowCompleted] = useState(false);
  const [hiddenSubIds, setHiddenSubIds] = useState<Set<string>>(new Set());
  // Click-to-open popups (state-driven — no URL routing inside this overlay).
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  function hideSub(subId: string) {
    setHiddenSubIds(prev => new Set(prev).add(subId));
    // A hidden row shouldn't keep counting toward the day's total.
    setMarkedSubIds(prev => { const n = new Set(prev); n.delete(subId); return n; });
  }
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


  return (
    <div style={backdropSt} {...backdropCloseProps(onClose)}>
      <div style={popupSt} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--t-brd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.5 0.13 150)', letterSpacing: '0.02em' }}>▶ DAILY</span>
            <span style={{ fontSize: 13, color: 'var(--t-muted)' }}>
              {todayTasks.length} task{todayTasks.length === 1 ? '' : 's'} marked today
            </span>
          </div>
          {(() => {
            const doneCount = todayTasks.reduce((n, t) => n + t.subtasks.filter(s => s.done).length, 0);
            if (doneCount === 0) return null;
            return (
              <button onClick={() => setShowCompleted(v => !v)}
                style={{ border: '1px solid var(--t-brd)', background: showCompleted ? 'var(--t-surf2)' : 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', marginLeft: 'auto' }}>
                {showCompleted ? 'Hide completed' : `Show completed (${doneCount})`}
              </button>
            );
          })()}
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
                  <th style={{ ...th, width: 110, textAlign: 'right', paddingRight: 8 }}>Estimate</th>
                  <th style={{ ...th, width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {todayTasks.map(t => {
                  const jiraLink = t.jiraLink;
                  const jiraUrl = jiraLink ? jiraTicketUrl(jiraConfigs, jiraLink) : null;
                  return (
                    <>
                      {/* Parent task row (no triangle — triangles only on subtasks) */}
                      <tr key={t.id} style={{ borderTop: '1px solid var(--t-brd)' }}>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span onClick={() => setCollapsedIds(prev => { const n = new Set(prev); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                            title={collapsedIds.has(t.id) ? 'Expand' : 'Collapse'}
                            style={{ cursor: 'pointer', display: 'inline-block', fontSize: 12, color: 'var(--t-muted)', userSelect: 'none', transform: collapsedIds.has(t.id) ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s' }}>▸</span>
                        </td>
                        <td style={{ ...td, fontWeight: 600 }}>
                          <span onClick={() => { window.location.hash = `table/task/${t.id}`; }} title="Open task"
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-acc-dk)')}
                            onMouseLeave={e => (e.currentTarget.style.color = '')}>
                            {t.title}
                          </span>
                        </td>
                        <td style={{ ...td }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <input
                              value={jiraLink}
                              onChange={e => updateItem(t.id, { jiraLink: e.target.value })}
                              placeholder="PROJ-1234"
                              style={jiraInp}
                            />
                            {jiraLink && jiraUrl && (
                              <>
                                <span onClick={() => openJira(jiraUrl, jiraLink)} title={`Open ${jiraLink}`}
                                  style={{ fontSize: 14, color: 'var(--t-acc)', cursor: 'pointer', flexShrink: 0 }}>↗</span>
                                <span onClick={() => openTicketWindow(jiraUrl, jiraLink)} title={`Open ${jiraLink} in a popup window`}
                                  style={{ fontSize: 12, color: 'var(--t-acc)', cursor: 'pointer', flexShrink: 0 }}>⧉</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: 'right', paddingRight: 8 }}>
                          <input
                            value={t.estimate ?? ''}
                            onChange={e => updateItem(t.id, { estimate: e.target.value })}
                            placeholder="—"
                            style={estInp}
                          />
                        </td>
                        <td style={{ ...td }} />
                      </tr>
                      {/* Subtask rows (indented, with triangle). Completed ones
                          are hidden unless toggled; manually hidden stay out
                          for the rest of this session. */}
                      {!collapsedIds.has(t.id) && t.subtasks.filter(sub => !hiddenSubIds.has(sub.id) && (showCompleted || !sub.done)).map(sub => {
                        const marked = markedSubIds.has(sub.id);
                        return (
                          <tr key={sub.id} style={{ background: marked ? 'color-mix(in oklab, var(--t-success) 6%, var(--t-surf))' : 'transparent' }}>
                            <td style={{ ...td, textAlign: 'center', paddingLeft: 8 }}>
                              <span
                                onClick={() => toggleMark(sub.id)}
                                title={marked ? 'Unmark for today' : 'Mark: I’m doing this today'}
                                style={{
                                  display: 'inline-block', cursor: 'pointer',
                                  fontSize: 15, lineHeight: 1, userSelect: 'none',
                                  color: marked ? 'var(--t-success)' : 'var(--t-muted)',
                                  transition: 'color 0.12s',
                                }}>
                                {marked ? '▶' : '▷'}
                              </span>
                            </td>
                            <td style={{ ...td, paddingLeft: 32, color: sub.done ? 'var(--t-muted)' : 'var(--t-txt2)', textDecoration: sub.done ? 'line-through' : 'none' }}>
                              <span style={{ color: 'var(--t-muted)', marginRight: 8 }}>↳</span>
                              <span onClick={() => { window.location.hash = `table/task/${t.id}`; window.location.hash = `table/task/${t.id}/sub/${sub.id}`; }} title="Open subtask"
                                style={{ cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-acc-dk)')}
                                onMouseLeave={e => (e.currentTarget.style.color = '')}>
                                {sub.title}
                              </span>
                            </td>
                            <td style={{ ...td }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <input
                                  value={sub.jira ?? ''}
                                  onChange={e => updateSubtask(t.id, sub.id, { jira: e.target.value })}
                                  placeholder="PROJ-1234"
                                  style={jiraInp}
                                />
                                {sub.jira && (() => {
                                  const subUrl = jiraTicketUrl(jiraConfigs, sub.jira);
                                  return subUrl ? (
                                    <>
                                      <span onClick={() => openJira(subUrl, sub.jira)} title={`Open ${sub.jira}`}
                                        style={{ fontSize: 14, color: 'var(--t-acc)', cursor: 'pointer', flexShrink: 0 }}>↗</span>
                                      <span onClick={() => openTicketWindow(subUrl, sub.jira)} title={`Open ${sub.jira} in a popup window`}
                                        style={{ fontSize: 12, color: 'var(--t-acc)', cursor: 'pointer', flexShrink: 0 }}>⧉</span>
                                    </>
                                  ) : null;
                                })()}
                              </div>
                            </td>
                            <td style={{ ...td, textAlign: 'right', paddingRight: 8 }}>
                              <input
                                value={sub.estimate ?? ''}
                                onChange={e => updateSubtask(t.id, sub.id, { estimate: e.target.value })}
                                placeholder="—"
                                style={estInp}
                              />
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              <span
                                onClick={() => hideSub(sub.id)}
                                title="Hide for this session"
                                style={{ cursor: 'pointer', fontSize: 15, color: 'var(--t-muted)', lineHeight: 1, userSelect: 'none' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-txt2)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--t-muted)')}>
                                ⊖
                              </span>
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

      {/* Task / subtask popups — wrapped so their backdrop clicks don't
          bubble to the Daily backdrop and close everything. */}
    </div>
  );
}

const backdropSt: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
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
const jiraInp: React.CSSProperties = {
  width: 100, fontSize: 12.5, padding: '5px 8px', borderRadius: 6,
  border: '1px solid var(--t-brd)', background: 'var(--t-surf2)',
  color: 'var(--t-txt)', outline: 'none',
};
const estInp: React.CSSProperties = {
  width: 76, fontSize: 13, padding: '5px 8px', borderRadius: 6,
  border: '1px solid var(--t-brd)', background: 'var(--t-surf2)',
  color: 'var(--t-txt)', textAlign: 'center', outline: 'none',
};
