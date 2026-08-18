import { useStore } from '../../store';
import type { Task } from '../../types';
import { jiraTicketUrl } from '../../jiraHosts';
import { openTicketWindow } from '../../ticketWindow';
import { itsmTicketUrl } from '../../itsm';

interface Props {
  // The PARENT task — fields here edit it directly.
  task: Task;
  style?: React.CSSProperties;
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };
const inp: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', boxSizing: 'border-box', outline: 'none' };

interface FieldRow {
  key: string;
  label: string;
  value: string;
  url: string | null;
  save: (v: string) => void;
}

// Floating context card shown beside an open subtask: the parent task's
// notes plus EVERY populated Jira / ITSM / link field (primary + extras,
// with their custom labels), all editable in place, segmented per group.
export function ParentContextCard({ task, style }: Props) {
  const updateItem = useStore(s => s.updateItem);
  const jiraConfigs = useStore(s => s.jiraConfigs);
  const itsmConfig = useStore(s => s.itsmConfig);

  const normalizeUrl = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

  const jiraRows: FieldRow[] = [];
  if (task.jiraLink.trim()) {
    jiraRows.push({ key: 'jira', label: task.jiraLinkLabel || 'Jira ticket', value: task.jiraLink, url: jiraTicketUrl(jiraConfigs, task.jiraLink), save: v => updateItem(task.id, { jiraLink: v }) });
  }
  (task.extraJiraLinks ?? []).forEach((l, i) => {
    if (!l.trim()) return;
    jiraRows.push({
      key: `jira${i}`, label: task.extraJiraLinkLabels?.[i] || `Jira ticket ${i + 2}`, value: l, url: jiraTicketUrl(jiraConfigs, l),
      save: v => { const n = [...(task.extraJiraLinks ?? [])]; n[i] = v; updateItem(task.id, { extraJiraLinks: n }); },
    });
  });

  const itsmRows: FieldRow[] = [];
  if ((task.itsmTicket ?? '').trim()) {
    itsmRows.push({
      key: 'itsm', label: (task.itsmTicketLabel || 'ITSM ticket') + (task.itsmStatus ? ` · ${task.itsmStatus}` : ''),
      value: task.itsmTicket ?? '', url: itsmTicketUrl(itsmConfig, task.itsmTicket ?? ''), save: v => updateItem(task.id, { itsmTicket: v }),
    });
  }
  (task.extraItsmTickets ?? []).forEach((tk, i) => {
    if (!tk.trim()) return;
    itsmRows.push({
      key: `itsm${i}`, label: task.extraItsmTicketLabels?.[i] || `ITSM ticket ${i + 2}`, value: tk, url: itsmTicketUrl(itsmConfig, tk),
      save: v => { const n = [...(task.extraItsmTickets ?? [])]; n[i] = v; updateItem(task.id, { extraItsmTickets: n }); },
    });
  });

  const linkRows: FieldRow[] = [];
  if (task.generalLink.trim()) {
    linkRows.push({ key: 'link', label: task.generalLinkLabel || 'Link', value: task.generalLink, url: normalizeUrl(task.generalLink), save: v => updateItem(task.id, { generalLink: v }) });
  }
  (task.extraGeneralLinks ?? []).forEach((l, i) => {
    if (!l.trim()) return;
    linkRows.push({
      key: `link${i}`, label: task.extraGeneralLinkLabels?.[i] || `Link ${i + 2}`, value: l, url: normalizeUrl(l),
      save: v => { const n = [...(task.extraGeneralLinks ?? [])]; n[i] = v; updateItem(task.id, { extraGeneralLinks: n }); },
    });
  });

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ flex: 1, borderTop: '1px solid var(--t-brd2)' }} />
    </div>
  );

  const section = (label: string, group: FieldRow[]) => group.length === 0 ? null : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 9, padding: '10px 12px', }}>
      {secHdr(label)}
      {group.map(r => (
        <div key={r.key}>
          <div style={lbl}>{r.label}</div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <input value={r.value} onChange={e => r.save(e.target.value)} style={inp} />
            {r.url && (
              <span onClick={() => window.open(r.url!, '_blank')} title={`Open ${r.value}`}
                style={{ fontSize: 15, color: 'var(--t-acc)', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}>↗</span>
            )}
            {r.url && (r.key.startsWith('jira') || r.key.startsWith('itsm')) && (
              <span onClick={() => openTicketWindow(r.url!, r.value)} title={`Open ${r.value} in a popup window`}
                style={{ fontSize: 13, color: 'var(--t-acc)', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}>⧉</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ width: 290, boxSizing: 'border-box', background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 14, boxShadow: '0 12px 36px rgba(0,0,0,0.22)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      <div title={task.title} style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Parent · <span style={{ color: 'var(--t-txt2)', textTransform: 'none', letterSpacing: 'normal' }}>{task.title}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 9, padding: '10px 12px', }}>
        {secHdr('Notes')}
        <textarea value={task.notes} onChange={e => updateItem(task.id, { notes: e.target.value })}
          rows={5} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {section('Jira', jiraRows)}
      {section('ITSM', itsmRows)}
      {section('Links', linkRows)}

      {jiraRows.length + itsmRows.length + linkRows.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>No tickets or links on the parent yet.</div>
      )}
    </div>
  );
}
