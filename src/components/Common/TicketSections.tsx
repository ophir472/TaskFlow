import { useState } from 'react';
import { useStore } from '../../store';
import type { Task } from '../../types';
import { createJiraIssue } from '../../jira';
import { getDefaultJiraConfig, jiraTicketUrl, applySummaryTemplate, buildJiraCreateUrl } from '../../jiraHosts';
import { itsmTicketUrl } from '../../itsm';

interface Props {
  task: Task;
  onToast?: (msg: string) => void;
}

const lblSt: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'text', marginBottom: 4 };
const lblEdSt: React.CSSProperties = { ...lblSt, border: 'none', outline: '1px solid var(--t-acc)', borderRadius: 3, padding: '1px 4px', background: 'transparent', width: '100%' };
const sInp: React.CSSProperties = { flex: 1, fontSize: 13, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', boxSizing: 'border-box', color: 'var(--t-txt)', width: '100%' };
const addRowBtn: React.CSSProperties = { marginTop: 8, width: '100%', border: '1px dashed var(--t-brd)', background: 'transparent', color: 'var(--t-muted)', fontSize: 12, fontWeight: 500, padding: '5px 0', borderRadius: 6, cursor: 'pointer' };
const extLink: React.CSSProperties = { fontSize: 16, color: 'var(--t-acc)', textDecoration: 'none', flexShrink: 0 };

// The Jira / ITSM / Link sections shared by the card feed and every task
// popup (Table, Explore, tag-sweep). One implementation so edits behave the
// same everywhere: rename-on-click labels, extra rows, ↗ open links,
// Create-in-Jira, "No Jira needed".
export function TicketSections({ task, onToast }: Props) {
  const updateItem = useStore(s => s.updateItem);
  const jiraConfigs = useStore(s => s.jiraConfigs);
  const itsmConfig = useStore(s => s.itsmConfig);
  const requesterJiraIds = useStore(s => s.requesterJiraIds);
  const defaultJira = getDefaultJiraConfig(jiraConfigs);

  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState('');
  const [creatingJira, setCreatingJira] = useState(false);
  // Which slot a Create-in-Jira prompt is open for: 'primary' or an extra-row
  // index. The prompt asks for the ticket description before creating.
  const [createTarget, setCreateTarget] = useState<'primary' | number | null>(null);
  const [createDesc, setCreateDesc] = useState('');
  const [createSummary, setCreateSummary] = useState('');
  // Host has a create-URL override → creation opens that URL in a new tab
  // (pre-filled Jira create screen) instead of calling the REST API.
  const urlCreate = !!defaultJira?.createUrlTemplate?.trim();
  const openJira = (url: string, _key: string) => window.open(url, '_blank');

  const t = task;
  const id = task.id;

  function label(key: string, current: string | undefined, fallback: string, save: (v: string) => void) {
    if (editingLabel === key) {
      return (
        <input autoFocus value={labelValue} onChange={e => setLabelValue(e.target.value)}
          onBlur={() => { save(labelValue.trim()); setEditingLabel(null); }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingLabel(null); }}
          style={lblEdSt} />
      );
    }
    return (
      <div style={lblSt} title="Click to rename"
        onClick={() => { setEditingLabel(key); setLabelValue(current || fallback); }}>
        {current || fallback}
      </div>
    );
  }

  function openCreatePrompt(target: 'primary' | number) {
    setCreateTarget(target);
    setCreateDesc(t.description ?? '');
    setCreateSummary(applySummaryTemplate(defaultJira, t.title));
  }

  async function handleCreateConfirm() {
    if (!defaultJira || createTarget === null) return;
    const summary = createSummary.trim() || t.title;

    if (urlCreate) {
      // URL mode: everything (pid, issuetype, priority, assignee…) lives in
      // the configured URL. Jira's own create screen opens pre-filled; we
      // can't know the resulting key, so the ticket field stays for pasting.
      const url = buildJiraCreateUrl(defaultJira, summary, createDesc);
      if (url) {
        window.open(url, '_blank');
        updateItem(id, { description: createDesc });
        onToast?.('Opened Jira create form — paste the ticket key here once created');
        setCreateTarget(null);
      }
      return;
    }

    setCreatingJira(true);
    try {
      const result = await createJiraIssue(defaultJira, {
        summary,
        description: createDesc,
        requestedBy: t.requester,
        reporterAccountId: t.requester ? requesterJiraIds[t.requester] : undefined,
      });
      if (createTarget === 'primary') {
        updateItem(id, { jiraLink: result.key, description: createDesc });
      } else {
        const n = [...(t.extraJiraLinks ?? [])];
        n[createTarget] = result.key;
        updateItem(id, { extraJiraLinks: n, description: createDesc });
      }
      onToast?.(`Created ${result.key}`);
      window.open(result.url, '_blank');
      setCreateTarget(null);
    } catch (err) {
      const msg = `Jira error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      if (onToast) onToast(msg); else alert(msg);
    } finally {
      setCreatingJira(false);
    }
  }

  function createPrompt() {
    return (
      <div style={{ marginTop: 6, marginBottom: 4, padding: 10, border: '1px solid var(--t-acc-fo)', borderRadius: 8, background: 'var(--t-surf)' }}>
        <div style={{ ...lblSt, cursor: 'default' }}>Jira summary</div>
        <input
          value={createSummary}
          onChange={e => setCreateSummary(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setCreateTarget(null); }}
          placeholder={t.title}
          style={{ width: '100%', fontSize: 13, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', outline: 'none', marginBottom: 8 }}
        />
        <div style={{ ...lblSt, cursor: 'default' }}>Jira description</div>
        <textarea
          autoFocus
          value={createDesc}
          onChange={e => setCreateDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setCreateTarget(null); }}
          rows={3}
          placeholder="Describe the ticket…"
          style={{ width: '100%', fontSize: 13, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={handleCreateConfirm} disabled={creatingJira}
            style={{ flex: 1, border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 12, fontWeight: 600, padding: '6px 0', borderRadius: 6, cursor: creatingJira ? 'wait' : 'pointer', opacity: creatingJira ? 0.6 : 1 }}>
            {creatingJira ? 'Creating…' : urlCreate ? 'Open create form ↗' : 'Create'}
          </button>
          <button onClick={() => setCreateTarget(null)}
            style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Jira section ── */}
      <div>
        {label('jiraLink:primary', t.jiraLinkLabel, 'Jira ticket', v => updateItem(id, { jiraLinkLabel: v || undefined }))}
        <div data-review-target="jira" style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
          <input value={t.jiraLink} onChange={e => updateItem(id, { jiraLink: e.target.value })} placeholder="PROJ-1234" style={sInp} />
          {t.jiraLink && (() => { const url = jiraTicketUrl(jiraConfigs, t.jiraLink); return url ? <span onClick={() => openJira(url, t.jiraLink)} style={{ ...extLink, cursor: 'pointer' }} title={`Open ${t.jiraLink}`}>↗</span> : null; })()}
        </div>
        {!t.jiraLink && defaultJira && createTarget !== 'primary' && (
          <button onClick={() => openCreatePrompt('primary')}
            style={{ marginBottom: 4, width: '100%', border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 12, fontWeight: 600, padding: '6px 0', borderRadius: 6, cursor: 'pointer' }}>
            + Create in Jira
          </button>
        )}
        {createTarget === 'primary' && createPrompt()}
        {!t.jiraLink && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t-muted)', cursor: 'pointer', marginTop: 2 }}>
            <input type="checkbox" checked={!!t.noJira} onChange={e => updateItem(id, { noJira: e.target.checked })} style={{ cursor: 'pointer' }} />
            No Jira needed
          </label>
        )}
        {t.jiraLink && (t.extraJiraLinks ?? []).map((link, i) => (
          <div key={i} style={{ marginTop: 6 }}>
            {label(`jiraLink:${i}`, t.extraJiraLinkLabels?.[i], `Jira ticket ${i + 2}`, v => {
              const ls = [...(t.extraJiraLinkLabels ?? [])]; ls[i] = v;
              updateItem(id, { extraJiraLinkLabels: ls });
            })}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input value={link} style={sInp} placeholder="PROJ-1234"
                onChange={e => { const n = [...(t.extraJiraLinks ?? [])]; n[i] = e.target.value; updateItem(id, { extraJiraLinks: n }); }}
                onBlur={() => {
                  // Don't run the empty-row cleanup while a create prompt is
                  // open for this row — blurring into the prompt would remove
                  // the very slot we're about to fill.
                  if (createTarget === i) return;
                  const links = t.extraJiraLinks ?? []; const labels = t.extraJiraLinkLabels ?? [];
                  const pairs = links.map((l, j) => ({ l, lb: labels[j] ?? '' })).filter(p => p.l.trim());
                  updateItem(id, { extraJiraLinks: pairs.map(p => p.l), extraJiraLinkLabels: pairs.map(p => p.lb) });
                }} />
              {link && (() => { const url = jiraTicketUrl(jiraConfigs, link); return url ? <span onClick={() => openJira(url, link)} style={{ ...extLink, cursor: 'pointer' }} title={`Open ${link}`}>↗</span> : null; })()}
            </div>
            {!link.trim() && defaultJira && createTarget !== i && (
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => openCreatePrompt(i)}
                style={{ marginTop: 4, width: '100%', border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 12, fontWeight: 600, padding: '6px 0', borderRadius: 6, cursor: 'pointer' }}>
                + Create in Jira
              </button>
            )}
            {createTarget === i && createPrompt()}
          </div>
        ))}
        {t.jiraLink && (
          <button onClick={() => updateItem(id, { extraJiraLinks: [...(t.extraJiraLinks ?? []), ''], extraJiraLinkLabels: [...(t.extraJiraLinkLabels ?? []), ''] })}
            style={addRowBtn}>
            + Add another Jira ticket
          </button>
        )}
      </div>

      {/* ── ITSM section ── */}
      <div>
        {label('itsmTicket:primary', t.itsmTicketLabel, 'ITSM ticket', v => updateItem(id, { itsmTicketLabel: v || undefined }))}
        <div data-review-target="itsm" style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
          <input value={t.itsmTicket ?? ''} onChange={e => updateItem(id, { itsmTicket: e.target.value })} placeholder="INC0001234" style={sInp} />
          {t.itsmTicket && (() => { const url = itsmTicketUrl(itsmConfig, t.itsmTicket); return url ? <a href={url} target="_blank" rel="noreferrer" style={extLink} title={`Open ${t.itsmTicket}`}>↗</a> : null; })()}
        </div>
        {t.itsmTicket && (t.extraItsmTickets ?? []).map((ticket, i) => (
          <div key={i} style={{ marginTop: 6 }}>
            {label(`itsmTicket:${i}`, t.extraItsmTicketLabels?.[i], `ITSM ticket ${i + 2}`, v => {
              const ls = [...(t.extraItsmTicketLabels ?? [])]; ls[i] = v;
              updateItem(id, { extraItsmTicketLabels: ls });
            })}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input value={ticket} style={sInp} placeholder="INC0001234"
                onChange={e => { const n = [...(t.extraItsmTickets ?? [])]; n[i] = e.target.value; updateItem(id, { extraItsmTickets: n }); }}
                onBlur={() => { const tks = t.extraItsmTickets ?? []; const lbs = t.extraItsmTicketLabels ?? []; const pairs = tks.map((tk, j) => ({ tk, lb: lbs[j] ?? '' })).filter(p => p.tk.trim()); updateItem(id, { extraItsmTickets: pairs.map(p => p.tk), extraItsmTicketLabels: pairs.map(p => p.lb) }); }} />
              {ticket && (() => { const url = itsmTicketUrl(itsmConfig, ticket); return url ? <a href={url} target="_blank" rel="noreferrer" style={extLink} title={`Open ${ticket}`}>↗</a> : null; })()}
            </div>
          </div>
        ))}
        {t.itsmTicket && (
          <button onClick={() => updateItem(id, { extraItsmTickets: [...(t.extraItsmTickets ?? []), ''], extraItsmTicketLabels: [...(t.extraItsmTicketLabels ?? []), ''] })}
            style={addRowBtn}>
            + Add another ITSM ticket
          </button>
        )}
      </div>

      {/* ── General link section ── */}
      <div>
        {label('generalLink:primary', t.generalLinkLabel, 'Link', v => updateItem(id, { generalLinkLabel: v || undefined }))}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
          <input value={t.generalLink} onChange={e => updateItem(id, { generalLink: e.target.value })} placeholder="Any URL or ref" style={sInp} />
          {t.generalLink && <a href={t.generalLink.startsWith('http') ? t.generalLink : `https://${t.generalLink}`} target="_blank" rel="noreferrer" style={extLink} title="Open link">↗</a>}
        </div>
        {(t.extraGeneralLinks ?? []).map((link, i) => (
          <div key={i} style={{ marginTop: 6 }}>
            {label(`generalLink:${i}`, t.extraGeneralLinkLabels?.[i], `Link ${i + 2}`, v => {
              const ls = [...(t.extraGeneralLinkLabels ?? [])]; ls[i] = v;
              updateItem(id, { extraGeneralLinkLabels: ls });
            })}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input value={link} style={sInp} placeholder="Any URL or ref"
                onChange={e => { const n = [...(t.extraGeneralLinks ?? [])]; n[i] = e.target.value; updateItem(id, { extraGeneralLinks: n }); }}
                onBlur={() => { const links = t.extraGeneralLinks ?? []; const labels = t.extraGeneralLinkLabels ?? []; const pairs = links.map((l, j) => ({ l, lb: labels[j] ?? '' })).filter(p => p.l.trim()); updateItem(id, { extraGeneralLinks: pairs.map(p => p.l), extraGeneralLinkLabels: pairs.map(p => p.lb) }); }} />
              {link && <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noreferrer" style={extLink} title="Open link">↗</a>}
            </div>
          </div>
        ))}
        <button onClick={() => updateItem(id, { extraGeneralLinks: [...(t.extraGeneralLinks ?? []), ''], extraGeneralLinkLabels: [...(t.extraGeneralLinkLabels ?? []), ''] })}
          style={addRowBtn}>
          + Add another link
        </button>
      </div>

    </>
  );
}
