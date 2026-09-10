import { useState } from 'react';
import { useStore } from '../../store';
import type { Task, GetBackTo as GetBackToItem, CustomSystem } from '../../types';
import { itsmTicketUrl } from '../../itsm';
import { customOpenUrl } from '../../customSystems';
import { openTicketWindow } from '../../ticketWindow';
import { getCommunications, commChannel } from '../Common/CommunicationSection';
import { BrandIcon } from '../Mail/ChannelToggle';
import { TaskModal } from '../TaskModal/TaskModal';
import { RelevanceToggle, itsmKey, csKey } from '../Common/RelevanceToggle';
import { followupRows, isProgressed, progressedToday, waitKey, commKey, startOfToday } from '../../followups';
import { FollowupMarks, ProgressMark } from '../Common/FollowupSection';
import { GetBackToModal } from '../GetBackTo/GetBackToModal';
import { buildGetBackTo } from '../../getBackTo';

const sectionCard: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 14, padding: '18px 20px' };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: 'var(--t-txt)', display: 'flex', alignItems: 'center', gap: 8 };
const rowSt: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 9, fontSize: 13 };
const taskLink: React.CSSProperties = { fontSize: 11.5, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220, cursor: 'pointer', flexShrink: 0 };
const ext: React.CSSProperties = { fontSize: 14, color: 'var(--t-acc)', cursor: 'pointer', flexShrink: 0, userSelect: 'none' };
const empty: React.CSSProperties = { fontSize: 12.5, color: 'var(--t-muted)' };
const count = (n: number) => <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-muted)' }}>{n}</span>;

// ▣ Hub (layout 2026-09-10):
//   1. Get back to <who> — full width, people-bound notes, not tied to any card
//   2. TODAY — cards marked Today, five parts: ITSM · custom systems ·
//      waiting for · communication · followups (manual rows only — the
//      ticket-derived followup rows live in ITSM / custom systems here; the
//      card's own followup table keeps showing them)
//   3. ALL — the same five parts across every active card
// Every row carries the blue "followed up today" ✓ (strikes through until
// midnight); a ticket's own ✓ and its followup row's green ✓ stay one state.
export function Hub() {
  const items = useStore(s => s.items);
  const itsmConfig = useStore(s => s.itsmConfig);
  const customSystems = useStore(s => s.customSystems);
  const hubConfig = useStore(s => s.hubConfig);
  const updateItem = useStore(s => s.updateItem);
  const createItem = useStore(s => s.createItem);
  const updateCommunicationField = useStore(s => s.updateCommunicationField);
  const toggleFollowupProgressed = useStore(s => s.toggleFollowupProgressed);
  const [showDone, setShowDone] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [getBackModalId, setGetBackModalId] = useState<string | null>(null);
  const [gbWho, setGbWho] = useState('');
  const [gbNotes, setGbNotes] = useState('');
  const [showDoneGB, setShowDoneGB] = useState(false);
  const [allOpen, setAllOpen] = useState(true);

  const tasks = items.filter((it): it is Task =>
    it.kind === 'task' && it.type !== 'mail' && !it.archived && it.status !== 'done' && it.status !== 'archived');
  const todayTasks = tasks.filter(t => t.forToday);
  const hubSystems = customSystems.filter(sys => sys.showInHub !== false);
  const dayStart = startOfToday();
  const openTask = (id: string) => setOpenTaskId(id);

  // "Followed up today" on any row — the same blue ✓ the followup table has.
  const fu = (t: Task, key: string, title: string) => ({ on: progressedToday(t, key), toggle: () => toggleFollowupProgressed(t.id, { ticketKey: key, title }) });
  const struck = (on: boolean): React.CSSProperties => (on ? { textDecoration: 'line-through', color: 'var(--t-muted)' } : {});

  // ── Get back to ──
  const gbAll = items.filter((it): it is GetBackToItem => it.kind === 'getback');
  const gbOpen = gbAll.filter(g => !g.done).sort((a, b) => b.createdAt - a.createdAt);
  const gbDone = gbAll.filter(g => g.done);
  function addGetBack() {
    const who = gbWho.trim();
    if (!who) return;
    createItem(buildGetBackTo(who, gbNotes));
    setGbWho(''); setGbNotes('');
  }
  function toggleWaitDone(t: Task, rowId: string) {
    updateItem(t.id, { waitingFor: { ...t.waitingFor!, rows: t.waitingFor!.rows.map(r => r.id === rowId ? { ...r, done: !r.done } : r) } });
  }

  // How many rows in a scope are hidden by "show done" (dismissed tickets,
  // progressed/done followups) — for the header button.
  const hiddenIn = (scope: Task[]) => {
    let n = 0;
    for (const t of scope) {
      const marked = new Set(t.irrelevantTickets ?? []);
      for (const tk of [t.itsmTicket, ...(t.extraItsmTickets ?? [])]) if (tk?.trim() && marked.has(itsmKey(tk.trim()))) n++;
      for (const sys of hubSystems) { const tk = (t.customTickets?.[sys.id] ?? '').trim(); if (tk && marked.has(csKey(sys.id, tk))) n++; }
      for (const r of followupRows(t, customSystems)) if (r.manual && (r.done || isProgressed(r))) n++;
    }
    return n;
  };
  const hiddenTotal = hiddenIn(tasks);

  // ── One scope (Today / All): the five parts ──
  function renderScope(scope: Task[], todayScope: boolean) {
    const itsmRows = scope.flatMap(t => [t.itsmTicket, ...(t.extraItsmTickets ?? [])]
      .filter((tk): tk is string => !!tk?.trim())
      .map(tk => ({ t, ticket: tk.trim(), key: itsmKey(tk.trim()), marked: (t.irrelevantTickets ?? []).includes(itsmKey(tk.trim())) })))
      .filter(r => showDone || !r.marked);
    const csRows = hubSystems.flatMap(sys => scope.flatMap(t => {
      const tk = (t.customTickets?.[sys.id] ?? '').trim();
      return tk ? [{ sys, t, ticket: tk, key: csKey(sys.id, tk), marked: (t.irrelevantTickets ?? []).includes(csKey(sys.id, tk)) }] : [];
    })).filter(r => showDone || !r.marked);
    const waitRows = scope.flatMap(t => (t.waitingFor?.rows ?? [])
      .filter(r => !r.done && r.cells.some(c => c?.trim()))
      .map(r => ({ t, row: r })));
    // Communication threads — focus per Settings; "touched today" only narrows the Today scope.
    const commRows = scope.flatMap(t => getCommunications(t.communications)
      .filter(f => f.value.trim())
      .filter(f => !hubConfig.commFocusOnly || f.focus)
      .filter(f => !todayScope || !hubConfig.commTodayOnly || !f.touchedAt || f.touchedAt >= dayStart)
      .map(f => ({ t, f })));
    // Followups — manual rows only here (ticket rows are the ITSM / custom parts).
    const fuRows = scope.flatMap(t => followupRows(t, customSystems).filter(r => r.manual).map(r => ({ t, r })))
      .filter(x => showDone || !(x.r.done || isProgressed(x.r)));

    const part = (title: string, n: number, body: React.ReactNode) => (
      <div style={sectionCard}>
        <div style={{ ...sectionTitle, marginBottom: 12 }}>{title} {count(n)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{body}</div>
      </div>
    );
    const ticketRow = (t: Task, ticket: string, key: string, marked: boolean, url: string | null, badge?: React.ReactNode, sysName?: string) => {
      const m = fu(t, key, ticket);
      return (
        <div key={`${t.id}-${key}`} style={{ ...rowSt, opacity: marked ? 0.5 : m.on ? 0.75 : 1 }}>
          <RelevanceToggle task={t} ticketKey={key} />
          <ProgressMark on={m.on} onClick={m.toggle} />
          <span style={{ fontWeight: 700, color: 'var(--t-txt)', flexShrink: 0, textDecoration: marked || m.on ? 'line-through' : 'none' }}>{ticket}</span>
          {sysName && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--t-surf3)', color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{sysName}</span>}
          {badge}
          <span style={{ flex: 1 }} />
          <span onClick={() => openTask(t.id)} title="Open the card" style={taskLink}>{t.title}</span>
          {url && <>
            <span onClick={() => window.open(url, '_blank')} title={`Open ${ticket}`} style={ext}>↗</span>
            <span onClick={() => openTicketWindow(url, ticket)} title={`Open ${ticket} in a popup window`} style={{ ...ext, fontSize: 12.5 }}>⧉</span>
          </>}
        </div>
      );
    };
    const none = (what: string) => <div style={empty}>{what} {todayScope ? "on today's cards" : 'on any card'}.</div>;

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, alignItems: 'start' }}>
        {part('ITSM tickets', itsmRows.length, <>
          {itsmRows.length === 0 && none('No ITSM tickets')}
          {itsmRows.map(({ t, ticket, key, marked }) => ticketRow(t, ticket, key, marked, itsmTicketUrl(itsmConfig, ticket),
            t.itsmTicket === ticket && t.itsmStatus ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--t-acc-bg)', color: 'var(--t-acc-dk)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{t.itsmStatus}</span> : null))}
        </>)}
        {part('Custom systems', csRows.length, <>
          {hubSystems.length === 0 && <div style={empty}>No custom system is flagged for the Hub (Settings → Integrations).</div>}
          {hubSystems.length > 0 && csRows.length === 0 && none('No custom-system tickets')}
          {csRows.map(({ sys, t, ticket, key, marked }) => ticketRow(t, ticket, key, marked, customOpenUrl(sys as CustomSystem, ticket), null, sys.name))}
        </>)}
        {part('Waiting for', waitRows.length, <>
          {waitRows.length === 0 && none('Nothing pending')}
          {waitRows.map(({ t, row }) => {
            const text = row.cells.filter(c => c?.trim()).join(' — ');
            const m = fu(t, waitKey(row.id), text);
            return (
              <div key={`${t.id}-${row.id}`} style={{ ...rowSt, opacity: m.on ? 0.75 : 1 }}>
                <span onClick={() => toggleWaitDone(t, row.id)} title="Mark the wait as over"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0, background: 'transparent', color: 'var(--t-brd)', border: '1.5px solid var(--t-brd)' }}>✓</span>
                <ProgressMark on={m.on} onClick={m.toggle} />
                <span style={{ flex: 1, minWidth: 0, color: 'var(--t-txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...struck(m.on) }}>{text}</span>
                <span onClick={() => openTask(t.id)} title="Open the card" style={taskLink}>{t.title}</span>
              </div>
            );
          })}
        </>)}
        {part(`Communication${hubConfig.commFocusOnly ? ' · focus' : ''}${todayScope && hubConfig.commTodayOnly ? ' · touched today' : ''}`, commRows.length, <>
          {commRows.length === 0 && <div style={empty}>{hubConfig.commFocusOnly ? 'No thread in focus' : 'No filled communication thread'} {todayScope ? "on today's cards" : 'on any card'}. Mark a thread ◉ Focus on its card{hubConfig.commFocusOnly || hubConfig.commTodayOnly ? ', or change the filters in Settings → General → Hub' : ''}.</div>}
          {commRows.map(({ t, f }) => {
            const m = fu(t, commKey(f.id), `${f.label}: ${f.value}`);
            return (
              <div key={`${t.id}-${f.id}`} style={{ ...rowSt, opacity: m.on ? 0.75 : 1 }}>
                <span title={commChannel(f) === 'teams' ? 'Teams' : 'Outlook'} style={{ display: 'inline-flex', flexShrink: 0 }}><BrandIcon channel={commChannel(f)} size={16} /></span>
                <ProgressMark on={m.on} onClick={m.toggle} />
                <span onClick={() => updateCommunicationField(t.id, f.id, { focus: !f.focus })} title={f.focus ? 'In focus — click to drop' : 'Click to focus'} style={{ cursor: 'pointer', color: f.focus ? 'var(--t-acc)' : 'var(--t-muted)', fontSize: 13, flexShrink: 0 }}>{f.focus ? '◉' : '◎'}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--t-surf3)', color: 'var(--t-txt2)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{f.label}</span>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--t-txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...struck(m.on) }} title={f.value}>{f.value}</span>
                <span onClick={() => openTask(t.id)} title="Open the card" style={taskLink}>{t.title}</span>
              </div>
            );
          })}
        </>)}
        {part('Followups', fuRows.length, <>
          {fuRows.length === 0 && <div style={empty}>{showDone ? 'No followups' : 'No open followups'} {todayScope ? "on today's cards" : 'on any card'} — add them in the card's Followup table.</div>}
          {fuRows.map(({ t, r }) => (
            <div key={`${t.id}-${r.id}`} style={{ ...rowSt, opacity: r.done ? 0.5 : isProgressed(r) ? 0.75 : 1 }}>
              <FollowupMarks taskId={t.id} row={r} />
              <span style={{ fontWeight: 700, color: (r.done || isProgressed(r)) ? 'var(--t-muted)' : 'var(--t-txt)', textDecoration: (r.done || isProgressed(r)) ? 'line-through' : 'none', flexShrink: 0 }}>{r.title}</span>
              {r.notes.trim() ? <span style={{ flex: 1, minWidth: 0, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes}>{r.notes}</span> : <span style={{ flex: 1 }} />}
              <span onClick={() => openTask(t.id)} title="Open the card" style={taskLink}>{t.title}</span>
            </div>
          ))}
        </>)}
      </div>
    );
  }

  const scopeHeader = (label: string, sub: string, open?: boolean, onToggle?: () => void) => (
    <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '30px 0 12px', cursor: onToggle ? 'pointer' : 'default' }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--t-txt)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--t-muted)' }}>{sub}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--t-brd)' }} />
      {onToggle && <span style={{ fontSize: 12, color: 'var(--t-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>}
    </div>
  );

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', padding: '38px 48px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--t-txt)' }}>▣ Hub</div>
        <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>Get back to · today's cards · every card — blue ✓ = followed up today</div>
        {hiddenTotal > 0 && (
          <button onClick={() => setShowDone(d => !d)}
            style={{ marginLeft: 'auto', border: '1px solid var(--t-brd)', background: showDone ? 'var(--t-surf2)' : 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 8, cursor: 'pointer' }}>
            {showDone ? 'Hide' : 'Show'} done ({hiddenTotal})
          </button>
        )}
      </div>

      {/* 1 ── Get back to <who> — full width */}
      <div style={sectionCard}>
        <div style={{ ...sectionTitle, marginBottom: 12 }}>
          Get back to {count(gbOpen.length)}
          {gbDone.length > 0 && (
            <button onClick={() => setShowDoneGB(d => !d)}
              style={{ marginLeft: 'auto', border: '1px solid var(--t-brd)', background: showDoneGB ? 'var(--t-surf2)' : 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, cursor: 'pointer' }}>
              {showDoneGB ? 'Hide' : 'Show'} done ({gbDone.length})
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input value={gbWho} onChange={e => setGbWho(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addGetBack(); }}
            placeholder="Who…" style={{ width: 180, flexShrink: 0, fontSize: 12.5, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none' }} />
          <input value={gbNotes} onChange={e => setGbNotes(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addGetBack(); }}
            placeholder="Notes (optional)" style={{ flex: 1, fontSize: 12.5, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', outline: 'none' }} />
          <button onClick={addGetBack} disabled={!gbWho.trim()}
            style={{ border: 'none', background: 'oklch(0.55 0.16 300)', color: 'white', fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 7, cursor: 'pointer', opacity: gbWho.trim() ? 1 : 0.5, flexShrink: 0 }}>
            + Add
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6 }}>
          {gbOpen.length === 0 && <div style={empty}>Nobody pending — add who you owe a follow-up above.</div>}
          {gbOpen.map(g => (
            <div key={g.id} onClick={() => setGetBackModalId(g.id)} title="Open" style={{ ...rowSt, cursor: 'pointer' }}>
              <span onClick={e => { e.stopPropagation(); updateItem(g.id, { done: true, doneAt: Date.now() }); }} title="Followed up"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0, background: 'transparent', color: 'var(--t-brd)', border: '1.5px solid var(--t-brd)' }}>✓</span>
              <span style={{ fontWeight: 700, color: 'var(--t-txt)', flexShrink: 0 }}>{g.who}</span>
              {g.notes.trim() && <span style={{ flex: 1, minWidth: 0, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.notes}>{g.notes}</span>}
            </div>
          ))}
          {showDoneGB && gbDone.map(g => (
            <div key={g.id} onClick={() => setGetBackModalId(g.id)} title="Open" style={{ ...rowSt, cursor: 'pointer', opacity: 0.55 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', fontSize: 11, fontWeight: 800, flexShrink: 0, background: 'var(--t-success)', color: 'white' }}>✓</span>
              <span style={{ fontWeight: 700, color: 'var(--t-txt)', flexShrink: 0, textDecoration: 'line-through' }}>{g.who}</span>
              {g.notes.trim() && <span style={{ flex: 1, minWidth: 0, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.notes}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 2 ── Today's scope */}
      {scopeHeader('Today', `${todayTasks.length} card${todayTasks.length !== 1 ? 's' : ''} marked Today`)}
      {renderScope(todayTasks, true)}

      {/* 3 ── Every card */}
      {scopeHeader('All cards', `${tasks.length} active card${tasks.length !== 1 ? 's' : ''} — not filtered by today`, allOpen, () => setAllOpen(o => !o))}
      {allOpen && renderScope(tasks, false)}

      {openTaskId && <TaskModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} urlDriven={false} />}
      {getBackModalId && <GetBackToModal id={getBackModalId} onClose={() => setGetBackModalId(null)} />}
    </div>
  );
}
