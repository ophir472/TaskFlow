import { useState } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { itsmTicketUrl } from '../../itsm';
import { customOpenUrl } from '../../customSystems';
import { openTicketWindow } from '../../ticketWindow';
import { getCommunications } from '../Common/CommunicationSection';
import { TaskModal } from '../TaskModal/TaskModal';
import { RelevanceToggle, itsmKey, csKey } from '../Common/RelevanceToggle';
import { followupRows, isProgressed, type FollowupRow } from '../../followups';
import { FollowupMarks } from '../Common/FollowupSection';

const sectionCard: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 14, padding: '18px 20px' };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: 'var(--t-txt)', display: 'flex', alignItems: 'center', gap: 8 };
const rowSt: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 8, fontSize: 13 };
const taskLink: React.CSSProperties = { fontSize: 11.5, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220, flexShrink: 0, cursor: 'pointer' };
const ext: React.CSSProperties = { fontSize: 14, color: 'var(--t-acc)', cursor: 'pointer', flexShrink: 0, userSelect: 'none' };

// ▣ Hub — one page aggregating, across ALL cards: every ITSM ticket, every
// custom-system ticket (systems flagged for the Hub), today's cards'
// followups (progressed/done rows hide behind "Show done"), all followups
// collapsed, plus today's communications and open waiting-for rows.
// A ticket's ✓ and its followup row's green ✓ are the same state.
export function Hub() {
  const items = useStore(s => s.items);
  const itsmConfig = useStore(s => s.itsmConfig);
  const customSystems = useStore(s => s.customSystems);
  const updateItem = useStore(s => s.updateItem);
  const [showDismissed, setShowDismissed] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [showDoneFU, setShowDoneFU] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  const tasks = items.filter((it): it is Task =>
    it.kind === 'task' && it.type !== 'mail' && !it.archived && it.status !== 'done' && it.status !== 'archived');
  const todayTasks = tasks.filter(t => t.forToday);

  // ── Followups: today's cards (main list) + every card (collapsed) ──
  // "Disappear after progressed / done" — hidden rows come back via Show done.
  const fuRow = (t: Task, r: FollowupRow) => ({ t, r, hidden: r.done || isProgressed(r) });
  const fuToday = todayTasks.flatMap(t => followupRows(t, customSystems).map(r => fuRow(t, r)));
  const fuAll = tasks.flatMap(t => followupRows(t, customSystems).map(r => fuRow(t, r)));
  const fuTodayVis = fuToday.filter(x => showDoneFU || !x.hidden);
  const fuAllVis = fuAll.filter(x => showDoneFU || !x.r.done);
  const fuHiddenCount = fuToday.filter(x => x.hidden).length + fuAll.filter(x => x.r.done && !todayTasks.includes(x.t)).length;

  // ── ITSM tickets from every card ──
  const itsmRows = tasks.flatMap(t =>
    [t.itsmTicket, ...(t.extraItsmTickets ?? [])]
      .filter((tk): tk is string => !!tk?.trim())
      .map(tk => ({ t, ticket: tk.trim(), key: itsmKey(tk.trim()), marked: (t.irrelevantTickets ?? []).includes(itsmKey(tk.trim())) })));

  // ── Custom-system tickets (hub-flagged systems) ──
  const hubSystems = customSystems.filter(sys => sys.showInHub !== false);
  const csRows = hubSystems.flatMap(sys => tasks.flatMap(t => {
    const tk = (t.customTickets?.[sys.id] ?? '').trim();
    return tk ? [{ sys, t, ticket: tk, key: csKey(sys.id, tk), marked: (t.irrelevantTickets ?? []).includes(csKey(sys.id, tk)) }] : [];
  }));

  // ── Today's communications (the card fields, NOT the to-send entries) ──
  const commRows = todayTasks.flatMap(t =>
    getCommunications(t.communications)
      .filter(f => f.value.trim())
      .map(f => ({ t, label: f.label, value: f.value })));

  // ── Today's open waiting-for rows ──
  const waitRows = todayTasks.flatMap(t =>
    (t.waitingFor?.rows ?? [])
      .filter(r => !r.done && r.cells.some(c => c?.trim()))
      .map(r => ({ t, row: r, columns: t.waitingFor!.columns })));

  const dismissedCount = itsmRows.filter(r => r.marked).length + csRows.filter(r => r.marked).length;
  const visItsm = itsmRows.filter(r => showDismissed || !r.marked);
  const visCs = csRows.filter(r => showDismissed || !r.marked);

  const openTask = (id: string) => setOpenTaskId(id);

  function toggleWaitDone(t: Task, rowId: string) {
    updateItem(t.id, {
      waitingFor: { ...t.waitingFor!, rows: t.waitingFor!.rows.map(r => r.id === rowId ? { ...r, done: !r.done } : r) },
    });
  }

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', padding: '38px 48px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--t-txt)' }}>▣ Hub</div>
        <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>Every ticket across all cards · today's followups, communications and waits</div>
        {fuHiddenCount > 0 && (
          <button onClick={() => setShowDoneFU(d => !d)}
            style={{ marginLeft: dismissedCount > 0 ? 0 : 'auto', border: '1px solid var(--t-brd)', background: showDoneFU ? 'var(--t-surf2)' : 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer' }}>
            {showDoneFU ? 'Hide' : 'Show'} done followups ({fuHiddenCount})
          </button>
        )}
        {dismissedCount > 0 && (
          <button onClick={() => setShowDismissed(d => !d)}
            style={{ marginLeft: fuHiddenCount > 0 ? 0 : 'auto', border: '1px solid var(--t-brd)', background: showDismissed ? 'var(--t-surf2)' : 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer' }}>
            {showDismissed ? 'Hide' : 'Show'} done tickets ({dismissedCount})
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, alignItems: 'start' }}>
        {/* ITSM */}
        <div style={sectionCard}>
          <div style={{ ...sectionTitle, marginBottom: 12 }}>ITSM tickets <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)' }}>{visItsm.length}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visItsm.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--t-muted)' }}>No ITSM tickets on any card.</div>}
            {visItsm.map(({ t, ticket, key, marked }) => {
              const url = itsmTicketUrl(itsmConfig, ticket);
              return (
                <div key={`${t.id}-${key}`} style={{ ...rowSt, opacity: marked ? 0.5 : 1 }}>
                  <RelevanceToggle task={t} ticketKey={key} />
                  <span style={{ fontWeight: 700, color: 'var(--t-txt)', flexShrink: 0, textDecoration: marked ? 'line-through' : 'none' }}>{ticket}</span>
                  {t.itsmTicket === ticket && t.itsmStatus && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--t-acc-bg)', color: 'var(--t-acc-dk)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{t.itsmStatus}</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span onClick={() => openTask(t.id)} title="Open the task" style={taskLink}>{t.title}</span>
                  {url && <>
                    <span onClick={() => window.open(url, '_blank')} title={`Open ${ticket}`} style={ext}>↗</span>
                    <span onClick={() => openTicketWindow(url, ticket)} title={`Open ${ticket} in a popup window`} style={{ ...ext, fontSize: 12.5 }}>⧉</span>
                  </>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Custom systems — one block per hub-flagged system */}
        {hubSystems.map(sys => {
          const rows = visCs.filter(r => r.sys.id === sys.id);
          return (
            <div key={sys.id} style={sectionCard}>
              <div style={{ ...sectionTitle, marginBottom: 12 }}>{sys.name} tickets <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)' }}>{rows.length}</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rows.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--t-muted)' }}>No {sys.name} tickets on any card.</div>}
                {rows.map(({ t, ticket, key, marked }) => {
                  const url = customOpenUrl(sys, ticket);
                  return (
                    <div key={`${t.id}-${key}`} style={{ ...rowSt, opacity: marked ? 0.5 : 1 }}>
                      <RelevanceToggle task={t} ticketKey={key} />
                      <span style={{ fontWeight: 700, color: 'var(--t-txt)', flexShrink: 0, textDecoration: marked ? 'line-through' : 'none' }}>{ticket}</span>
                      <span style={{ flex: 1 }} />
                      <span onClick={() => openTask(t.id)} title="Open the task" style={taskLink}>{t.title}</span>
                      {url && <>
                        <span onClick={() => window.open(url, '_blank')} title={`Open ${ticket}`} style={ext}>↗</span>
                        <span onClick={() => openTicketWindow(url, ticket)} title={`Open ${ticket} in a popup window`} style={{ ...ext, fontSize: 12.5 }}>⧉</span>
                      </>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Today's communications (card fields, not the ✉ to-send queue) */}
        <div style={sectionCard}>
          <div style={{ ...sectionTitle, marginBottom: 12 }}>Communications · today's cards <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)' }}>{commRows.length}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {commRows.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--t-muted)' }}>No filled communication fields on today's cards.</div>}
            {commRows.map(({ t, label, value }, i) => (
              <div key={`${t.id}-${i}`} style={rowSt}>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--t-surf3)', color: 'var(--t-txt2)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{label}</span>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--t-txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>{value}</span>
                <span onClick={() => openTask(t.id)} title="Open the task" style={taskLink}>{t.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Today's open waiting-for rows */}
        <div style={sectionCard}>
          <div style={{ ...sectionTitle, marginBottom: 12 }}>Waiting for · today's cards <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)' }}>{waitRows.length}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {waitRows.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--t-muted)' }}>Nothing pending on today's cards.</div>}
            {waitRows.map(({ t, row }) => (
              <div key={`${t.id}-${row.id}`} style={rowSt}>
                <span onClick={() => toggleWaitDone(t, row.id)}
                  title="Mark the wait as over"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0, background: 'transparent', color: 'var(--t-brd)', border: '1.5px solid var(--t-brd)' }}>✓</span>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--t-txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.cells.filter(c => c?.trim()).join(' — ')}
                </span>
                <span onClick={() => openTask(t.id)} title="Open the task" style={taskLink}>{t.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Followups · today's cards — progressed/done rows disappear (Show done) */}
        <div style={sectionCard}>
          <div style={{ ...sectionTitle, marginBottom: 12 }}>Followups · today's cards <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)' }}>{fuTodayVis.length}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fuTodayVis.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--t-muted)' }}>{fuToday.length ? 'All followups on today\'s cards are progressed or done.' : 'No followups on today\'s cards — add them on the card, under Waiting for.'}</div>}
            {fuTodayVis.map(({ t, r }) => (
              <div key={`${t.id}-${r.id}`} style={{ ...rowSt, opacity: r.done ? 0.5 : 1 }}>
                <FollowupMarks taskId={t.id} row={r} />
                <span style={{ fontWeight: 700, color: (r.done || isProgressed(r)) ? 'var(--t-muted)' : 'var(--t-txt)', textDecoration: (r.done || isProgressed(r)) ? 'line-through' : 'none', flexShrink: 0 }}>{r.title}</span>
                {r.subtitle && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--t-surf3)', color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{r.subtitle}</span>}
                {r.notes.trim() && <span style={{ flex: 1, minWidth: 0, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes}>{r.notes}</span>}
                {!r.notes.trim() && <span style={{ flex: 1 }} />}
                <span onClick={() => openTask(t.id)} title="Open the card" style={taskLink}>{t.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* All followups — every card, collapsed by default */}
        <div style={sectionCard}>
          <div onClick={() => setAllOpen(o => !o)} style={{ ...sectionTitle, cursor: 'pointer', marginBottom: allOpen ? 12 : 0 }}>
            All followups <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)' }}>{fuAllVis.length}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-muted)', transform: allOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
          </div>
          {allOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {fuAllVis.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--t-muted)' }}>No followups on any card.</div>}
              {fuAllVis.map(({ t, r }) => (
                <div key={`${t.id}-${r.id}`} style={{ ...rowSt, opacity: r.done ? 0.5 : 1 }}>
                  <FollowupMarks taskId={t.id} row={r} />
                  <span style={{ fontWeight: 700, color: (r.done || isProgressed(r)) ? 'var(--t-muted)' : 'var(--t-txt)', textDecoration: (r.done || isProgressed(r)) ? 'line-through' : 'none', flexShrink: 0 }}>{r.title}</span>
                  {r.subtitle && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--t-surf3)', color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{r.subtitle}</span>}
                  {r.notes.trim() && <span style={{ flex: 1, minWidth: 0, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes}>{r.notes}</span>}
                  {!r.notes.trim() && <span style={{ flex: 1 }} />}
                  <span onClick={() => openTask(t.id)} title="Open the card" style={taskLink}>{t.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {openTaskId && <TaskModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} urlDriven={false} />}
    </div>
  );
}
