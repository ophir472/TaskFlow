import { useState, useEffect } from 'react';
import { backdropCloseProps } from '../../backdrop';
import { useStore } from '../../store';
import { RequesterSelect } from '../Common/RequesterSelect';
import { useLogMount } from '../../useLogMount';
import { nextId } from '../../engine';
import type { Item, ScheduleSpec } from '../../types';
import { buildGetBackTo } from '../../getBackTo';
import { SchedulePicker } from '../SchedulePicker/SchedulePicker';
import { nextOccurrence } from '../../scheduleEngine';

type CreateType = 'task' | 'reminder' | 'getback';
interface Props { onClose: () => void; onToast: (msg: string) => void; onCreated?: (id: string) => void; initialTitle?: string; }

const TABS: { key: CreateType; label: string }[] = [
  { key: 'task', label: 'Task' }, { key: 'reminder', label: 'Reminder' }, { key: 'getback', label: 'Get back to' },
];
const TAG_DEFS: { key: 'urgent' | 'important' | 'quick' | 'noTag'; label: string }[] = [
  { key: 'urgent', label: 'Urgent' }, { key: 'important', label: 'Important' },
  { key: 'quick', label: 'Quick' }, { key: 'noTag', label: 'None of these' },
];

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 };
const inp: React.CSSProperties = { width: '100%', fontSize: 14, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box' };
const sel: React.CSSProperties = { ...inp };

export function CreateModal({ onClose, onToast, onCreated, initialTitle = '' }: Props) {
  useLogMount('CreateModal');
  const requesters = useStore(s => s.requesters);
  const projects = useStore(s => s.projects);
  const createItem = useStore(s => s.createItem);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const [type, setType] = useState<CreateType>('task');
  const [title, setTitle] = useState(initialTitle);
  const [requester, setRequester] = useState(requesters[0] ?? '');
  const [project, setProject] = useState(projects[0] ?? '');
  const [jiraLink, setJiraLink] = useState('');
  const [itsmTicket, setItsmTicket] = useState('');
  const [generalLink, setGeneralLink] = useState('');
  const [communication, setCommunication] = useState('');
  const [notes, setNotes] = useState('');
  const [schedule, setSchedule] = useState<ScheduleSpec | null>(null);
  const [forToday, setForToday] = useState(false);
  const [workType, setWorkType] = useState<'planned' | 'urgent' | 'quick'>('planned');
  const [status, setStatus] = useState<'backlog' | 'todo' | 'in_progress' | 'waiting'>('backlog');
  const [subs, setSubs] = useState<string[]>([]);
  const [subDraft, setSubDraft] = useState('');
  const [who, setWho] = useState('');
  const [gbNotes, setGbNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [important, setImportant] = useState(false);
  const [quick, setQuick] = useState(false);
  const [noTag, setNoTag] = useState(false);

  function toggleTag(key: 'urgent' | 'important' | 'quick' | 'noTag') {
    if (key === 'noTag') { const n = !noTag; setNoTag(n); if (n) { setUrgent(false); setImportant(false); setQuick(false); } }
    else { setNoTag(false); if (key === 'urgent') setUrgent(v => !v); if (key === 'important') setImportant(v => !v); if (key === 'quick') setQuick(v => !v); }
  }

  const disabled = type === 'getback' ? !who.trim() : !title || (type === 'reminder' && !schedule);
  const now = Date.now();

  const handleSubmit = (asQuick = false) => {
    if (disabled) return;
    if (type === 'getback') {
      const item = buildGetBackTo(who, gbNotes);
      createItem(item); onCreated?.(item.id); onToast('Created'); onClose();
      return;
    }
    const id = nextId(type === 'task' ? 't' : 'r');
    let item: Item;
    if (type === 'task') {
      item = {
        id, kind: 'task', title, description: '', notes, blockers: '', generalLink, jiraLink,
        itsmTicket: itsmTicket.trim() || undefined,
        // Seed the Teams communication field with the typed value (createItem
        // only auto-seeds when communications is absent).
        communications: [{ id: 'c' + now + Math.random().toString(36).slice(2, 5), label: 'Teams', value: communication }],
        type: workType,
        requester, project, status, forToday, urgent: urgent || workType === 'urgent', important, quick: quick || asQuick, noTag: (quick || asQuick) ? false : noTag,
        toCheck: '', priorityBoost: false,
        subtasks: subs.map(st => ({ id: nextId('s'), title: st, done: false, isNext: false, jira: '', generalLink: '', notes: '', blockers: '', createdAt: now })),
        bumpedAt: 0, staleness: 0, createdAt: now, updatedAt: now, archived: false,
      };
    } else {
      const nextFireAt = schedule!.type === 'once' ? schedule!.at : nextOccurrence(schedule!, now);
      item = { id, kind: 'reminder', title, schedule: schedule!, status: 'active', priorityBoost: false, nextFireAt, bumpedAt: 0, createdAt: now, updatedAt: now, archived: false };
    }
    createItem(item); onCreated?.(id); onToast('Created'); onClose();
  };

  const chip = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer', padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600,
    border: `1.5px solid ${active ? 'var(--t-txt)' : 'var(--t-brd)'}`,
    color: active ? 'var(--t-txt)' : 'var(--t-muted)',
    background: active ? 'var(--t-surf3)' : 'transparent', userSelect: 'none',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
      {...backdropCloseProps(onClose)}>
      <div style={{ width: 520, maxWidth: '92vw', maxHeight: '88vh', overflow: 'auto', background: 'var(--t-surf)', borderRadius: 16, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-txt)' }}>New item</div>
          <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 18, color: 'var(--t-muted)' }}>×</div>
        </div>

        <div style={{ display: 'flex', gap: 8, background: 'var(--t-surf2)', padding: 4, borderRadius: 9 }}>
          {TABS.map(tab => (
            <div key={tab.key} onClick={() => { setType(tab.key); setSchedule(null); }}
              style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 7, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: type === tab.key ? 'var(--t-surf)' : 'transparent', color: type === tab.key ? 'var(--t-txt)' : 'var(--t-muted)', userSelect: 'none' }}>
              {tab.label}
            </div>
          ))}
        </div>

        {type !== 'getback' ? (
          <div>
            <div style={lbl}>{type === 'task' ? 'Title' : 'Reminder text'}</div>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder={type === 'task' ? 'What needs to get done?' : 'e.g. Call Dani about the proposal'}
              onKeyDown={e => { if (e.key === 'Enter' && !disabled) handleSubmit(e.shiftKey); }} style={inp} />
          </div>
        ) : (
          <>
            <div>
              <div style={lbl}>Who</div>
              <input value={who} onChange={e => setWho(e.target.value)} autoFocus
                placeholder="e.g. Dana Cohen"
                onKeyDown={e => { if (e.key === 'Enter' && !disabled) handleSubmit(); }} style={inp} />
            </div>
            <div>
              <div style={lbl}>Notes</div>
              <textarea value={gbNotes} onChange={e => setGbNotes(e.target.value)} rows={3}
                placeholder="What to bring up… (optional)" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </>
        )}

        {type === 'task' && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={forToday} onChange={e => setForToday(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--t-amber)' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-txt)' }}>For today</span>
            </label>
            <div>
              <div style={lbl}>Kind</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([['planned', 'Planned'], ['urgent', 'Urgent / same-day'], ['quick', 'Quick help']] as const).map(([k, label]) => (
                  <div key={k} onClick={() => setWorkType(k)} style={chip(workType === k)}>{workType === k ? '✓ ' : ''}{label}</div>
                ))}
              </div>
            </div>
            <div>
              <div style={lbl}>Tags</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TAG_DEFS.map(({ key, label }) => {
                  const active = key === 'urgent' ? urgent : key === 'important' ? important : key === 'quick' ? quick : noTag;
                  return <div key={key} onClick={() => toggleTag(key)} style={chip(active)}>{active ? '✓ ' : ''}{label}</div>;
                })}
              </div>
            </div>
            <div>
              <div style={lbl}>Subtasks</div>
              {subs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                  {subs.map((st, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t-txt)', padding: '4px 10px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 7 }}>
                      <span style={{ flex: 1 }}>{st}</span>
                      <span onClick={() => setSubs(list => list.filter((_, j) => j !== i))} style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 14, lineHeight: 1 }}>×</span>
                    </div>
                  ))}
                </div>
              )}
              <input value={subDraft} onChange={e => setSubDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && subDraft.trim()) { e.preventDefault(); e.stopPropagation(); setSubs(list => [...list, subDraft.trim()]); setSubDraft(''); }
                }}
                placeholder="Add a subtask, Enter to add…" style={inp} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div style={lbl}>Requester</div>
                <RequesterSelect value={requester} onChange={setRequester} style={sel} />
              </div>
              <div><div style={lbl}>Status</div>
                <select value={status} onChange={e => setStatus(e.target.value as 'backlog' | 'todo' | 'in_progress' | 'waiting')} style={sel}>
                  <option value="backlog">Backlog</option>
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="waiting">Waiting</option>
                </select>
              </div>
              <div><div style={lbl}>Project</div>
                <select value={project} onChange={e => setProject(e.target.value)} style={sel}>
                  <option value="">—</option>{projects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div style={lbl}>Jira link</div>
                <input value={jiraLink} onChange={e => setJiraLink(e.target.value)} placeholder="e.g. PROJ-1234" style={inp} />
              </div>
              <div><div style={lbl}>ITSM ticket</div>
                <input value={itsmTicket} onChange={e => setItsmTicket(e.target.value)} placeholder="e.g. INC0001234" style={inp} />
              </div>
            </div>
            <div><div style={lbl}>Link</div>
              <input value={generalLink} onChange={e => setGeneralLink(e.target.value)} placeholder="Any URL or ref (optional)" style={inp} />
            </div>
            <div><div style={lbl}>Communication (Teams)</div>
              <input value={communication} onChange={e => setCommunication(e.target.value)} placeholder="Channel / person on Teams (optional)" style={inp} />
            </div>
            <div><div style={lbl}>Notes</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Anything worth writing down… (optional)" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </>
        )}

        {type === 'reminder' && (
          <div>
            <div style={lbl}>Schedule</div>
            <SchedulePicker value={schedule} onChange={setSchedule} allowRecurring />
          </div>
        )}

        <button onClick={() => handleSubmit()} disabled={disabled}
          style={{ border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 14, fontWeight: 600, padding: 12, borderRadius: 9, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
          Create
        </button>
      </div>
    </div>
  );
}
