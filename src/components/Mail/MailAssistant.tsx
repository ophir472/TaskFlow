import { useState, useEffect, useRef } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { buildMailEntry } from '../../mailEntry';
import { MeetingMinutes } from './MeetingMinutes';
import { ChannelToggle, ChannelIcon, channelOf, channelDef, nextChannel, type Channel } from './ChannelToggle';
import { MailEntryFields } from './MailEntryFields';

interface Props {
  onClose: () => void;
}

type Stage = 'capture' | 'preview' | 'sweep';
function stageFromHash(): Stage {
  const parts = window.location.hash.slice(1).split('/');
  if (parts[0] !== 'mail') return 'capture';
  return parts[1] === 'preview' ? 'preview' : parts[1] === 'sweep' ? 'sweep' : 'capture';
}

// #mail/preview/<entryId> deep-links straight to one entry (used by the
// card's "To send" table).
function startIdFromHash(): string | null {
  const parts = window.location.hash.slice(1).split('/');
  return parts[0] === 'mail' && parts[1] === 'preview' ? (parts[2] ?? null) : null;
}

const inp: React.CSSProperties = { width: '100%', fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', boxSizing: 'border-box', outline: 'none' };

// Communication assistant (#mail): fast capture of mail/Teams items to
// respond to. Entries are regular tasks with type:'mail' — they live in the
// table (✉ Mail filter) and the archive once sent, but stay out of the card
// feed, Kanban and review. #mail/preview walks them one at a time.
export function MailAssistant({ onClose }: Props) {
  const [minutesOpen, setMinutesOpen] = useState(false);
  const items = useStore(s => s.items);
  const createItem = useStore(s => s.createItem);
  const updateItem = useStore(s => s.updateItem);
  const deleteItem = useStore(s => s.deleteItem);
  const setAgendaChecks = useStore(s => s.setAgendaChecks);
  const agendaChecks = useStore(s => s.agendaChecks);

  const [stage, setStage] = useState<Stage>(stageFromHash);
  useEffect(() => {
    const onHash = () => setStage(stageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const mails = items.filter((it): it is Task => it.kind === 'task' && it.type === 'mail' && !it.archived);

  // Capture-list keyboard: arrows move the highlight (even while the input is
  // focused), 'p' starts preview when not typing, Enter (outside the input)
  // opens the highlighted entry. Refs keep the window handler closure-fresh.
  const [sel, setSel] = useState(-1);
  const selRef = useRef(sel); selRef.current = sel;
  const mailsRef = useRef(mails); mailsRef.current = mails;
  const stageRef = useRef(stage); stageRef.current = stage;
  useEffect(() => setSel(-1), [stage]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (stageRef.current === 'sweep') {
        if ((e.key === 't' || e.code === 'KeyT') && !typing) { e.preventDefault(); pickChannel(nextChannel(captureChannelRef.current)); }
        return;
      }
      if (stageRef.current !== 'capture') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, mailsRef.current.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, -1)); }
      else if (e.key === 'Enter' && !typing) {
        const m = selRef.current >= 0 ? mailsRef.current[selRef.current] : undefined;
        if (m) { startAtRef.current = m.id; window.location.hash = 'mail/preview'; }
      } else if ((e.key === 't' || e.code === 'KeyT') && !typing) {
        e.preventDefault();
        const m = selRef.current >= 0 ? mailsRef.current[selRef.current] : undefined;
        if (m) updateItem(m.id, { channel: nextChannel(channelOf(m)) });   // flip the highlighted entry
        else pickChannel(nextChannel(captureChannelRef.current));            // or the capture default
      } else if ((e.key === 'p' || e.code === 'KeyP') && !typing) {
        e.preventDefault();
        if (mailsRef.current.length) window.location.hash = 'mail/preview';
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── capture ──
  const [text, setText] = useState('');
  // Channel for NEW entries — remembered per browser (t toggles it).
  const [captureChannel, setCaptureChannel] = useState<Channel>(() => { try { return localStorage.getItem('taskflow-mail-channel') === 'teams' ? 'teams' : 'outlook'; } catch { return 'outlook'; } });
  const captureChannelRef = useRef(captureChannel); captureChannelRef.current = captureChannel;
  const pickChannel = (c: Channel) => { setCaptureChannel(c); try { localStorage.setItem('taskflow-mail-channel', c); } catch { /* ignore */ } };
  const inputRef = useRef<HTMLInputElement>(null);
  function openEntry(id: string) {
    startAtRef.current = id;
    window.location.hash = 'mail/preview';
  }
  function commit(openAfter = false) {
    const v = text.trim();
    if (!v) return;
    const entry = buildMailEntry(v, undefined, captureChannel);
    createItem(entry);
    setText('');
    if (openAfter) openEntry(entry.id);
    else inputRef.current?.focus();
  }

  // ── sweep (#mail/sweep): skim Outlook + Teams, jot subject + key point per
  // item, no replying. Next (Enter) files it as a communication entry and
  // clears; Done marks today's Sweep agenda step and returns to the list. ──
  const [sweepSubject, setSweepSubject] = useState('');
  const [sweepPoint, setSweepPoint] = useState('');
  const [sweptIds, setSweptIds] = useState<string[]>([]);
  const sweepSubjectRef = useRef<HTMLInputElement>(null);
  const sweepDoneToday = agendaChecks.date === new Date().toISOString().slice(0, 10) && agendaChecks.ids.includes('sweep');
  useEffect(() => { if (stage === 'sweep') { setSweptIds([]); setTimeout(() => sweepSubjectRef.current?.focus(), 0); } }, [stage]);
  function sweepNext() {
    const v = sweepSubject.trim();
    if (!v) { sweepSubjectRef.current?.focus(); return; }
    const entry = buildMailEntry(v, undefined, captureChannel, sweepPoint);
    createItem(entry);
    setSweptIds(ids => [entry.id, ...ids]);
    setSweepSubject(''); setSweepPoint('');
    sweepSubjectRef.current?.focus();
  }
  function sweepDone() {
    if (sweepSubject.trim()) sweepNext();          // don't lose a half-typed item
    setAgendaChecks(['sweep'], true);
    window.location.replace('#mail');
  }

  // ── preview stepper: freeze the entry list when entering ──
  const startAtRef = useRef<string | null>(null);
  const [stepIds, setStepIds] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [sent, setSent] = useState(0);
  const [skipped, setSkipped] = useState(0);
  useEffect(() => {
    if (stage === 'preview') {
      const ids = items.filter((it): it is Task => it.kind === 'task' && it.type === 'mail' && !it.archived).map(m => m.id);
      setStepIds(ids);
      // Opened by clicking a specific entry (in-popup or via a card's
      // #mail/preview/<id> deep link) → start the walk there.
      const wanted = startAtRef.current ?? startIdFromHash();
      const start = wanted ? ids.indexOf(wanted) : 0;
      startAtRef.current = null;
      setIdx(start >= 0 ? start : 0);
      setSent(0); setSkipped(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const doneStepping = stage === 'preview' && idx >= stepIds.length;
  const current = !doneStepping && stage === 'preview'
    ? (items.find(i => i.id === stepIds[idx]) as Task | undefined)
    : undefined;
  // Entry deleted mid-walk → advance past it.
  useEffect(() => {
    if (stage === 'preview' && !doneStepping && !current) setIdx(i => i + 1);
  }, [stage, doneStepping, current]);

  function markSent() {
    if (!current) return;
    // status 'done' auto-archives via the store's status⇄archive link.
    updateItem(current.id, { status: 'done' });
    setSent(n => n + 1);
    setIdx(i => i + 1);
  }
  function skip() {
    setSkipped(n => n + 1);
    setIdx(i => i + 1);
  }

  const accBtn: React.CSSProperties = { border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '9px 16px', borderRadius: 8, cursor: 'pointer' };
  const ghostBtn: React.CSSProperties = { border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 8, cursor: 'pointer' };

  return (
    <div {...backdropCloseProps(onClose)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 560, maxWidth: '92vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-txt)', letterSpacing: '-0.01em' }}>
            {stage === 'sweep' ? '⟳ Sweep' : '✉ Communication assistant'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setMinutesOpen(true)}
              title="Build ready-to-send meeting minutes (fields configurable in Settings)"
              style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12.5, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer' }}>
              ✎ Meeting minutes
            </button>
            <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 20, lineHeight: 1 }}>×</span>
          </div>
        </div>

        {stage === 'capture' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                ref={inputRef}
                autoFocus
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  if (!text.trim() && sel >= 0 && mails[sel]) { openEntry(mails[sel].id); return; }
                  commit(e.shiftKey);
                }}
                placeholder={captureChannel === 'teams' ? 'Teams chat / channel message to respond to…' : 'Mail subject to respond to…'}
                style={{ ...inp, flex: 1 }} />
              <ChannelToggle value={captureChannel} onChange={pickChannel} />
              <button onClick={() => commit()} disabled={!text.trim()}
                style={{ ...accBtn, opacity: text.trim() ? 1 : 0.5, cursor: text.trim() ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                Add
              </button>
            </div>

            {mails.length > 0 ? (
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                {mails.map((m, i) => (
                  <div key={m.id}
                    onClick={() => openEntry(m.id)}
                    onMouseEnter={() => setSel(i)}
                    title="Open this entry"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: i === sel ? 'var(--t-acc-bg)' : 'var(--t-surf2)', border: i === sel ? '1px solid var(--t-acc)' : '1px solid var(--t-brd2)', fontSize: 13, color: 'var(--t-txt)', cursor: 'pointer' }}>
                    <ChannelIcon channel={channelOf(m)} onClick={() => updateItem(m.id, { channel: nextChannel(channelOf(m)) })} title={`${channelDef(channelOf(m)).label} — click (or t) to switch`} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.title}
                      {m.keyPoint?.trim() && <span style={{ color: 'var(--t-muted)', fontSize: 11.5 }}> — {m.keyPoint.trim()}</span>}
                      {m.linkedTaskId && (() => {
                        const lt = items.find(i => i.id === m.linkedTaskId);
                        return lt ? <span style={{ color: 'var(--t-muted)', fontSize: 11.5 }}> · ⛓ {lt.title}</span> : null;
                      })()}
                    </span>
                    {(m.whatIWantToSay?.trim() || m.mailToSend?.trim()) && (
                      <span title="Has draft notes" style={{ fontSize: 10, color: 'var(--t-acc)', flexShrink: 0 }}>✎</span>
                    )}
                    <span onClick={e => { e.stopPropagation(); deleteItem(m.id); }} title="Delete entry"
                      style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>×</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--t-muted)', padding: '8px 0 14px' }}>
                Nothing captured yet — type and press Enter. Entries persist until sent.
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => { window.location.hash = 'mail/sweep'; }} title="Skim Outlook + Teams and jot each item — no replying (daily agenda step)"
                style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, color: sweepDoneToday ? 'var(--t-success)' : 'var(--t-txt2)' }}>
                ⟳ Sweep{sweepDoneToday ? ' ✓' : ''}
              </button>
              <button onClick={() => { window.location.hash = 'mail/preview'; }} disabled={mails.length === 0}
                style={{ ...accBtn, opacity: mails.length ? 1 : 0.5, cursor: mails.length ? 'pointer' : 'not-allowed' }}>
                Preview ({mails.length})
              </button>
              <span style={{ fontSize: 11.5, color: 'var(--t-muted)' }}>
                p = preview · ↑↓ navigate · Enter opens · Shift+Enter adds & opens · t = Outlook ⇄ Teams
              </span>
            </div>
          </>
        )}

        {stage === 'sweep' && (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--t-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Skim your inbox and chats. For each item: subject, optional key point, <b>Next</b>. Replies come later in the preview walk. <b>Done</b> when you've been through everything.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <ChannelToggle value={captureChannel} onChange={pickChannel} />
              <span style={{ fontSize: 11.5, color: 'var(--t-muted)' }}>t = Outlook ⇄ Teams</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--t-txt2)' }}>Swept this pass: {sweptIds.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Subject / Teams chat</div>
                <input ref={sweepSubjectRef} value={sweepSubject} onChange={e => setSweepSubject(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sweepNext(); } }}
                  placeholder={captureChannel === 'teams' ? 'Who / which chat…' : 'Mail subject…'} style={inp} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Key point <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>— optional</span></div>
                <input value={sweepPoint} onChange={e => setSweepPoint(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sweepNext(); } }}
                  placeholder="One line: what it's about / what they need" style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
              <button onClick={sweepNext} disabled={!sweepSubject.trim()} title="File it and clear for the next one (Enter)"
                style={{ ...accBtn, opacity: sweepSubject.trim() ? 1 : 0.5, cursor: sweepSubject.trim() ? 'pointer' : 'not-allowed' }}>Next ↵</button>
              <button onClick={sweepDone} title="Mark today's Sweep done and go back to the list"
                style={{ ...accBtn, background: 'oklch(0.6 0.14 150)' }}>✓ Done</button>
              <button onClick={() => { window.location.replace('#mail'); }} style={{ ...ghostBtn, marginLeft: 'auto' }}>Back</button>
            </div>
            {sweptIds.length > 0 && (
              <div style={{ marginTop: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sweptIds.map(id => items.find(i => i.id === id) as Task | undefined).filter((m): m is Task => !!m).map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: 'var(--t-surf2)', fontSize: 13, color: 'var(--t-txt2)' }}>
                    <ChannelIcon channel={channelOf(m)} onClick={() => updateItem(m.id, { channel: nextChannel(channelOf(m)) })} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}{m.keyPoint?.trim() && <span style={{ color: 'var(--t-muted)', fontSize: 11.5 }}> — {m.keyPoint.trim()}</span>}</span>
                    <span onClick={() => { deleteItem(m.id); setSweptIds(ids => ids.filter(x => x !== m.id)); }} title="Remove" style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 14, lineHeight: 1 }}>×</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {stage === 'preview' && !doneStepping && current && (
          <>
            <div style={{ fontSize: 12, color: 'var(--t-muted)', marginBottom: 12 }}>
              Entry {idx + 1} of {stepIds.length} · {channelDef(channelOf(current)).icon} {channelDef(channelOf(current)).label}
            </div>
            <MailEntryFields entry={current} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={markSent}
                style={{ ...accBtn, background: 'oklch(0.6 0.14 150)' }}>
                ✓ {channelOf(current) === 'teams' ? 'Message' : 'Mail'} sent — archive
              </button>
              <button onClick={skip} style={ghostBtn}>Continue (skip) →</button>
              <button onClick={() => { window.location.hash = 'mail'; }} style={{ ...ghostBtn, marginLeft: 'auto' }}>Back</button>
            </div>
          </>
        )}

        {stage === 'preview' && doneStepping && (
          <>
            <div style={{ fontSize: 15, color: 'var(--t-txt)', padding: '10px 0 4px' }}>
              Pass complete — <b style={{ color: 'oklch(0.5 0.14 150)' }}>{sent} sent</b>{' · '}
              <b>{skipped} skipped</b>{stepIds.length === 0 && ' (nothing to walk through)'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--t-muted)', marginBottom: 16 }}>
              Sent entries are archived (Table → 🗑 Archived + ✉ Mail finds them). Skipped ones stay in the capture list.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { window.location.hash = 'mail'; }} style={accBtn}>Back to capture</button>
              <button onClick={onClose} style={ghostBtn}>Close</button>
            </div>
          </>
        )}
      </div>
      {minutesOpen && (
        <MeetingMinutes onClose={() => setMinutesOpen(false)}
          onCreated={id => { setMinutesOpen(false); window.location.hash = `mail/preview/${id}`; }} />
      )}
    </div>
  );
}
