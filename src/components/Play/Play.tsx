import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { jiraTicketUrl } from '../../jiraHosts';
import { openTicketWindow } from '../../ticketWindow';
import { itsmTicketUrl } from '../../itsm';
import { SubtaskChecklist } from '../SubtaskPanel/SubtaskChecklist';
import { buildMailEntry } from '../../mailEntry';
import { MailEntryFields } from '../Mail/MailEntryFields';

interface Props {
  taskId: string;
  onClose: () => void;
}

// Deliberately constant dark canvas — Play is a focus surface, not another
// app surface, so it ignores the theme.
const C = {
  bg: '#17171a', panel: '#232327', panelBrd: '#3a3a40',
  inputBg: '#1d1d21', text: '#e8e8ec', dim: '#8a8a92', dimmer: '#5c5c64',
};

const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.dim };
const darkInp: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 9px', borderRadius: 7, border: `1px solid ${C.panelBrd}`, background: C.inputBg, color: C.text, boxSizing: 'border-box', outline: 'none' };

// Collapsible field panel — the collapsed-section design: populated fields
// start collapsed (expand to edit); fields revealed from the ⊞ picker start
// open, ready to type.
export function FieldPanel({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.panelBrd}`, borderRadius: 10 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: C.dim, textAlign: 'left' }}>
        <span style={lbl}>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dimmer, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
      </button>
      {open && <div style={{ padding: '2px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>}
    </div>
  );
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// #play/<taskId>/mail/<entryId> — the m-shortcut's communication popup rides
// as a sub-route so Play (and its timer) stays alive underneath.
function mailSubFromHash(): string | null {
  const parts = window.location.hash.slice(1).split('/');
  return parts[0] === 'play' && parts[2] === 'mail' ? (parts[3] ?? null) : null;
}

// Play (#play/<taskId>): full-screen focus mode that executes ONE starred
// step. Plan writes the steps, DailyPlay marks the day, Play executes —
// a task with no steps is sent to Plan first.
export function Play({ taskId, onClose }: Props) {
  const items = useStore(s => s.items);
  const updateItem = useStore(s => s.updateItem);
  const updateSubtask = useStore(s => s.updateSubtask);
  const toggleSubtaskDone = useStore(s => s.toggleSubtaskDone);
  const completeItem = useStore(s => s.completeItem);
  const setForToday = useStore(s => s.setForToday);
  const createItem = useStore(s => s.createItem);
  const deleteItem = useStore(s => s.deleteItem);
  const jiraConfigs = useStore(s => s.jiraConfigs);
  const itsmConfig = useStore(s => s.itsmConfig);

  const task = items.find((it): it is Task => it.id === taskId && it.kind === 'task');

  // Empty fields hide behind ONE icon (top-right); picking a field there
  // reveals it back in its place. Reset per step.
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);
  const [mailSubId, setMailSubId] = useState<string | null>(() => mailSubFromHash());
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onHash = () => setMailSubId(mailSubFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Task deleted while open → leave.
  useEffect(() => { if (!task) onClose(); }, [task, onClose]);

  // No steps yet → Plan writes steps first. Replace (not push) so Back
  // doesn't bounce between #play and #plan.
  const noSteps = !!task && task.subtasks.length === 0;
  useEffect(() => {
    if (noSteps) {
      history.replaceState(null, '', '#plan');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, [noSteps]);

  const starred = task ? (task.subtasks.find(s => s.isNext && !s.done) ?? task.subtasks.find(s => !s.done)) : undefined;
  const allDone = !!task && task.subtasks.length > 0 && task.subtasks.every(s => s.done);

  useEffect(() => { setRevealed(new Set()); setPickerOpen(false); }, [starred?.id]);

  function stepDone() {
    if (!task || !starred) return;
    toggleSubtaskDone(task.id, starred.id);
    updateSubtask(task.id, starred.id, { isNext: false });
    const next = task.subtasks.find(s => !s.done && s.id !== starred.id);
    if (next) updateSubtask(task.id, next.id, { isNext: true });
  }

  function closeMailSub() {
    if (mailSubFromHash()) history.back();
    else setMailSubId(null);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mailSubFromHash()) closeMailSub();
        else onClose();
        return;
      }
      if (mailSubFromHash()) return; // mail popup owns the keyboard
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      if (e.key === ' ') { e.preventDefault(); stepDone(); }
      else if ((e.key === 'm' || e.code === 'KeyM') && task) {
        // New communication pre-linked to this task — opens ON TOP of Play.
        e.preventDefault();
        const entry = buildMailEntry(task.title, task.id);
        createItem(entry);
        window.location.hash = `play/${task.id}/mail/${entry.id}`;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, task, starred?.id]);

  if (!task || noSteps) return null;

  const openBtn = (url: string | null, ticket?: string) => url ? (
    <>
      <span onClick={() => window.open(url, '_blank')} title="Open"
        style={{ fontSize: 14, color: '#8ab4ff', cursor: 'pointer', flexShrink: 0, userSelect: 'none', alignSelf: 'center' }}>↗</span>
      {ticket ? (
        <span onClick={() => openTicketWindow(url, ticket)} title={`Open ${ticket} in a popup window`}
          style={{ fontSize: 12, color: '#8ab4ff', cursor: 'pointer', flexShrink: 0, userSelect: 'none', alignSelf: 'center' }}>⧉</span>
      ) : null}
    </>
  ) : null;

  const box = (label: string, control: React.ReactNode, key: string, has: boolean, span2 = false) =>
    ({ key, label, has, span2, control });

  // Paired boxes: step's field next to the task's field. Populated ones show;
  // empty ones live in the top-right ⊞ picker until chosen.
  const s = starred;
  const fields = (task && s) ? [
    box('Checklist (step)', <SubtaskChecklist dark parentId={task.id} sub={s} />, 'checklist', (s.checklist ?? []).length > 0, true),
    box('Notes (step)', <textarea value={s.notes} onChange={e => updateSubtask(task.id, s.id, { notes: e.target.value })} rows={4} style={{ ...darkInp, fontSize: 14, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }} />, 'notes-step', s.notes.trim().length > 0),
    box('Notes (task)', <textarea value={task.notes} onChange={e => updateItem(task.id, { notes: e.target.value })} rows={4} style={{ ...darkInp, fontSize: 14, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }} />, 'notes-task', task.notes.trim().length > 0),
    box('Blockers (step)', <textarea value={s.blockers} onChange={e => updateSubtask(task.id, s.id, { blockers: e.target.value })} rows={2} placeholder="Who can help?" style={{ ...darkInp, background: 'var(--t-amber-bg)', color: 'var(--t-amber)', border: '1px solid color-mix(in oklab, var(--t-amber) 35%, transparent)', resize: 'vertical', fontFamily: 'inherit' }} />, 'blockers-step', s.blockers.trim().length > 0),
    box('Blockers (task)', <textarea value={task.blockers} onChange={e => updateItem(task.id, { blockers: e.target.value })} rows={2} placeholder="Who can help?" style={{ ...darkInp, background: 'var(--t-amber-bg)', color: 'var(--t-amber)', border: '1px solid color-mix(in oklab, var(--t-amber) 35%, transparent)', resize: 'vertical', fontFamily: 'inherit' }} />, 'blockers-task', task.blockers.trim().length > 0),
    box('Jira (step)', (
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={s.jira} onChange={e => updateSubtask(task.id, s.id, { jira: e.target.value })} placeholder="PROJ-1235" style={darkInp} />
        {openBtn(s.jira.trim() ? jiraTicketUrl(jiraConfigs, s.jira) : null, s.jira.trim())}
      </div>
    ), 'jira-step', s.jira.trim().length > 0),
    box('Jira (task)', (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={task.jiraLink} onChange={e => updateItem(task.id, { jiraLink: e.target.value })} placeholder="PROJ-1234" style={darkInp} />
          {openBtn(task.jiraLink.trim() ? jiraTicketUrl(jiraConfigs, task.jiraLink) : null, task.jiraLink.trim())}
        </div>
        {(task.extraJiraLinks ?? []).map((l, i) => l.trim() ? (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            <input value={l} onChange={e => { const n = [...(task.extraJiraLinks ?? [])]; n[i] = e.target.value; updateItem(task.id, { extraJiraLinks: n }); }} style={darkInp} />
            {openBtn(jiraTicketUrl(jiraConfigs, l), l)}
          </div>
        ) : null)}
      </div>
    ), 'jira-task', task.jiraLink.trim().length > 0 || (task.extraJiraLinks ?? []).some(l => l.trim())),
    box('ITSM (task)', (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={task.itsmTicket ?? ''} onChange={e => updateItem(task.id, { itsmTicket: e.target.value })} placeholder="INC0001234" style={darkInp} />
          {openBtn((task.itsmTicket ?? '').trim() ? itsmTicketUrl(itsmConfig, task.itsmTicket ?? '') : null, (task.itsmTicket ?? '').trim())}
        </div>
        {task.itsmStatus && <div style={{ fontSize: 11.5, color: C.dim }}>Status: {task.itsmStatus}</div>}
        {(task.extraItsmTickets ?? []).map((tk, i) => tk.trim() ? (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            <input value={tk} onChange={e => { const n = [...(task.extraItsmTickets ?? [])]; n[i] = e.target.value; updateItem(task.id, { extraItsmTickets: n }); }} style={darkInp} />
            {openBtn(itsmTicketUrl(itsmConfig, tk), tk)}
          </div>
        ) : null)}
      </div>
    ), 'itsm-task', (task.itsmTicket ?? '').trim().length > 0 || (task.extraItsmTickets ?? []).some(t2 => t2.trim())),
    box('Link (step)', (
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={s.generalLink ?? ''} onChange={e => updateSubtask(task.id, s.id, { generalLink: e.target.value })} placeholder="Any URL or ref" style={darkInp} />
        {openBtn((s.generalLink ?? '').trim() ? (/^https?:\/\//i.test(s.generalLink) ? s.generalLink : `https://${s.generalLink}`) : null)}
      </div>
    ), 'link-step', (s.generalLink ?? '').trim().length > 0),
    box('Links (task)', (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={task.generalLink} onChange={e => updateItem(task.id, { generalLink: e.target.value })} placeholder="Any URL or ref" style={darkInp} />
          {openBtn(task.generalLink.trim() ? (/^https?:\/\//i.test(task.generalLink) ? task.generalLink : `https://${task.generalLink}`) : null)}
        </div>
        {(task.extraGeneralLinks ?? []).map((l, i) => l.trim() ? (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            <input value={l} onChange={e => { const n = [...(task.extraGeneralLinks ?? [])]; n[i] = e.target.value; updateItem(task.id, { extraGeneralLinks: n }); }} style={darkInp} />
            {openBtn(/^https?:\/\//i.test(l) ? l : `https://${l}`)}
          </div>
        ) : null)}
      </div>
    ), 'links-task', task.generalLink.trim().length > 0 || (task.extraGeneralLinks ?? []).some(l => l.trim())),
  ] : [];

  const visible = fields.filter(f => f.has || revealed.has(f.key));
  const hidden = fields.filter(f => !f.has && !revealed.has(f.key));

  const mailEntry = mailSubId ? items.find((it): it is Task => it.id === mailSubId && it.kind === 'task') : undefined;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: C.bg, color: C.text, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Top bar: timer left · hidden-fields picker + exit right */}
      <div style={{ position: 'absolute', top: 18, left: 24, fontSize: 15, fontWeight: 700, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
        ⏱ {fmtElapsed(now - startedAt)}
      </div>
      <div style={{ position: 'absolute', top: 18, right: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
        {starred && hidden.length > 0 && (
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button onClick={() => setPickerOpen(o => !o)}
              title={`${hidden.length} empty field${hidden.length !== 1 ? 's' : ''} — pick one to fill`}
              style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${C.panelBrd}`, background: pickerOpen ? C.panel : 'transparent', color: C.dim, fontSize: 14, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ⊞
            </button>
            {pickerOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, width: 190, background: C.panel, border: `1px solid ${C.panelBrd}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', padding: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {hidden.map(f => (
                  <div key={f.key}
                    onClick={() => { setRevealed(prev => new Set(prev).add(f.key)); setPickerOpen(false); }}
                    style={{ padding: '7px 10px', borderRadius: 7, fontSize: 12.5, color: C.text, cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.inputBg; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    {f.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={onClose}
          style={{ border: `1px solid ${C.panelBrd}`, background: 'transparent', color: C.dim, fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}>
          Exit ✕
        </button>
      </div>

      {/* Fields — right column, collapsed lines (⊞ picks empty ones into here) */}
      {starred && !allDone && visible.length > 0 && (
        <div style={{ position: 'fixed', right: 22, top: 70, width: 280, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 130px)', overflowY: 'auto' }}>
          {visible.map(f => (
            <FieldPanel key={`${starred.id}:${f.key}`} title={f.label} defaultOpen={revealed.has(f.key)}>
              {f.control}
            </FieldPanel>
          ))}
        </div>
      )}

      {/* Centered focus column — title and action only, no fields */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '70px 330px 60px 40px' }}>
        <div style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 22 }}>

          {allDone ? (
            <>
              <div style={{ ...lbl, color: 'oklch(0.7 0.15 150)' }}>All steps done</div>
              <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', textWrap: 'pretty' } as React.CSSProperties}>{task.title}</div>
              <div style={{ fontSize: 16, color: C.dim }}>Every step is checked off. Close it out, or head back to the card to add more.</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setForToday(task.id, false); completeItem(task.id); onClose(); }}
                  style={{ border: 'none', background: 'var(--t-success)', color: 'white', fontSize: 15, fontWeight: 700, padding: '12px 24px', borderRadius: 9, cursor: 'pointer' }}>
                  🎉 Complete task
                </button>
                <button onClick={onClose}
                  style={{ border: `1px solid ${C.panelBrd}`, background: 'transparent', color: C.text, fontSize: 14, fontWeight: 600, padding: '12px 20px', borderRadius: 9, cursor: 'pointer' }}>
                  Back to card
                </button>
              </div>
            </>
          ) : starred ? (
            <>
              <div>
                <div style={lbl}>Working on</div>
                <div style={{ fontSize: 15, color: C.dim, marginTop: 4 }}>{task.title}</div>
              </div>
              <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', textWrap: 'pretty' } as React.CSSProperties}>{starred.title}</div>
              <div>
                <button onClick={stepDone} title="Space"
                  style={{ border: 'none', background: 'var(--t-success)', color: 'white', fontSize: 15, fontWeight: 700, padding: '13px 26px', borderRadius: 10, cursor: 'pointer' }}>
                  Step done → next
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 16, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: C.dimmer, pointerEvents: 'none' }}>
        click m to add communication
      </div>

      {/* m → communication popup ON TOP of Play (Play + timer stay alive) */}
      {mailEntry && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 540, maxWidth: '92vw', maxHeight: '84vh', overflowY: 'auto', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t-txt)', letterSpacing: '-0.01em' }}>✉ New communication</div>
              <span onClick={closeMailSub} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 20, lineHeight: 1 }}>×</span>
            </div>
            <MailEntryFields entry={mailEntry} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { updateItem(mailEntry.id, { status: 'done' }); closeMailSub(); }}
                style={{ border: 'none', background: 'oklch(0.6 0.14 150)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '9px 16px', borderRadius: 8, cursor: 'pointer' }}>
                ✓ Mail sent — archive
              </button>
              <button onClick={closeMailSub}
                style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 8, cursor: 'pointer' }}>
                Close — keep in ✉ queue
              </button>
              <button onClick={() => { deleteItem(mailEntry.id); closeMailSub(); }}
                title="Delete this entry — nothing is kept"
                style={{ marginLeft: 'auto', border: '1px solid var(--t-urgent)', background: 'transparent', color: 'var(--t-urgent)', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 8, cursor: 'pointer' }}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
