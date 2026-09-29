import { Fragment, useState } from 'react';
import { useStore } from '../../store';
import type { JiraConfig, JiraFieldFormat } from '../../types';
import { testJiraAuth, detectJiraFields } from '../../jira';
import { DEFAULT_STATUS_FLOW, DEFAULT_STATUS_MAP, DEFAULT_STORY_POINTS, statusFlowOf } from '../../jiraFields';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };
const fi: React.CSSProperties = { fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', width: '100%', boxSizing: 'border-box' };
const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };
const addBtn: React.CSSProperties = { border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const grp: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--t-txt2)', margin: '2px 0 -6px' };
const ghostBtn: React.CSSProperties = { border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 500, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' };

// One Jira board row: local drafts commit on blur so typing doesn't spam
// the store/version history with per-keystroke events.
function BoardRow({ id, label, url, onSave, onRemove }: {
  id: string; label: string; url: string;
  onSave: (patch: { label?: string; url?: string }) => void;
  onRemove: () => void;
}) {
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState<string | null>(null);
  const rowInp: React.CSSProperties = { fontSize: 12.5, padding: '5px 9px', borderRadius: 6, border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', outline: 'none', boxSizing: 'border-box' };
  return (
    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <input
        value={labelDraft ?? label}
        onChange={e => setLabelDraft(e.target.value)}
        onBlur={() => { if (labelDraft !== null) { onSave({ label: labelDraft }); setLabelDraft(null); } }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="Board name"
        style={{ ...rowInp, width: 150, flexShrink: 0 }}
      />
      <input
        value={urlDraft ?? url}
        onChange={e => setUrlDraft(e.target.value)}
        onBlur={() => { if (urlDraft !== null) { onSave({ url: urlDraft }); setUrlDraft(null); } }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="https://mycompany.atlassian.net/jira/software/projects/PROJ/boards/1"
        style={{ ...rowInp, flex: 1, minWidth: 0 }}
      />
      <span onClick={onRemove} title="Remove board"
        style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</span>
    </div>
  );
}

type DraftEntry = Omit<JiraConfig, 'id' | 'isDefault'>;
// Custom fields + status flow (2026-09-29).
const EMPTY_EXTRAS = {
  acceptanceCriteriaFieldId: '', acceptanceCriteriaFormat: 'text' as JiraFieldFormat, acceptanceCriteriaTemplate: '',
  storyPointsFieldId: '', storyPointsFormat: 'number' as JiraFieldFormat, defaultStoryPoints: DEFAULT_STORY_POINTS,
  scrumTeamFieldId: '', scrumTeamFormat: 'option' as JiraFieldFormat, defaultScrumTeam: '',
  epicFieldId: '', epicFormat: 'text' as JiraFieldFormat, defaultEpic: '',
  statusFlow: DEFAULT_STATUS_FLOW, statusMap: DEFAULT_STATUS_MAP, syncStatus: true,
};
const FORMATS: { v: JiraFieldFormat; label: string }[] = [
  { v: 'text', label: 'text' }, { v: 'number', label: 'number' }, { v: 'option', label: 'select option' },
  { v: 'options', label: 'multi-select' }, { v: 'id', label: 'object id' }, { v: 'labels', label: 'labels' },
];
const CARD_STATUSES: { k: string; label: string }[] = [
  { k: 'backlog', label: 'Backlog' }, { k: 'todo', label: 'To do' }, { k: 'in_progress', label: 'In progress' }, { k: 'waiting', label: 'Waiting' }, { k: 'done', label: 'Done' },
];
const EMPTY_DRAFT: DraftEntry = {
  host: '', username: '', apiToken: '', projectKey: '', authMode: 'pat',
  component: '', defaultAssigneeId: '',
  pid: '', issueTypeId: '', priorityId: '', summaryTemplate: '', createUrlTemplate: '',
  ...EMPTY_EXTRAS,
};

export function JiraHostsSection() {
  const jiraConfigs = useStore(s => s.jiraConfigs);
  const addJiraConfig = useStore(s => s.addJiraConfig);
  const updateJiraConfig = useStore(s => s.updateJiraConfig);
  const removeJiraConfig = useStore(s => s.removeJiraConfig);
  const setDefaultJiraConfig = useStore(s => s.setDefaultJiraConfig);
  const jiraBoards = useStore(s => s.jiraBoards);
  const addJiraBoard = useStore(s => s.addJiraBoard);
  const updateJiraBoard = useStore(s => s.updateJiraBoard);
  const removeJiraBoard = useStore(s => s.removeJiraBoard);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<boolean>(jiraConfigs.length === 0);
  const [draft, setDraft] = useState<DraftEntry>(EMPTY_DRAFT);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [detectResult, setDetectResult] = useState<string | null>(null);
  const [flowText, setFlowText] = useState(DEFAULT_STATUS_FLOW.join(' > '));

  function startAdd() {
    setAdding(true);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFlowText(DEFAULT_STATUS_FLOW.join(' > '));
    setDetectResult(null);
  }
  function startEdit(c: JiraConfig) {
    setTestResult(null);
    setEditingId(c.id);
    setAdding(false);
    setDraft({
      host: c.host, username: c.username, apiToken: c.apiToken, authMode: c.authMode ?? 'pat',
      projectKey: c.projectKey, component: c.component, defaultAssigneeId: c.defaultAssigneeId,
      pid: c.pid ?? '', issueTypeId: c.issueTypeId ?? '', priorityId: c.priorityId ?? '', urgentLabel: c.urgentLabel ?? '',
      summaryTemplate: c.summaryTemplate ?? '', createUrlTemplate: c.createUrlTemplate ?? '',
      acceptanceCriteriaFieldId: c.acceptanceCriteriaFieldId ?? '', acceptanceCriteriaFormat: c.acceptanceCriteriaFormat ?? 'text', acceptanceCriteriaTemplate: c.acceptanceCriteriaTemplate ?? '',
      storyPointsFieldId: c.storyPointsFieldId ?? '', storyPointsFormat: c.storyPointsFormat ?? 'number', defaultStoryPoints: c.defaultStoryPoints ?? DEFAULT_STORY_POINTS,
      scrumTeamFieldId: c.scrumTeamFieldId ?? '', scrumTeamFormat: c.scrumTeamFormat ?? 'option', defaultScrumTeam: c.defaultScrumTeam ?? '',
      epicFieldId: c.epicFieldId ?? '', epicFormat: c.epicFormat ?? 'text', defaultEpic: c.defaultEpic ?? '',
      statusFlow: statusFlowOf(c), statusMap: { ...DEFAULT_STATUS_MAP, ...(c.statusMap ?? {}) }, syncStatus: c.syncStatus !== false,
    });
    setFlowText(statusFlowOf(c).join(' > '));
    setDetectResult(null);
  }
  function cancelForm() {
    setTestResult(null);
    setEditingId(null);
    setAdding(false);
    setDraft(EMPTY_DRAFT);
  }
  function saveForm() {
    if (!draft.host.trim() || !draft.projectKey.trim() || !draft.apiToken.trim() || (draft.authMode === 'basic' && !draft.username.trim())) return;
    const flow = flowText.split(/>|,|\n/).map(x => x.trim()).filter(Boolean);
    const normalized: DraftEntry = { ...draft, projectKey: draft.projectKey.trim().toUpperCase(), statusFlow: flow.length >= 2 ? flow : DEFAULT_STATUS_FLOW, defaultStoryPoints: Number.isFinite(Number(draft.defaultStoryPoints)) ? Number(draft.defaultStoryPoints) : DEFAULT_STORY_POINTS };
    if (editingId) updateJiraConfig(editingId, normalized);
    else addJiraConfig(normalized);
    cancelForm();
  }
  function handleDelete(c: JiraConfig) {
    if (!confirm(`Delete Jira host "${c.host}" / ${c.projectKey}?`)) return;
    removeJiraConfig(c.id);
  }

  const formOpen = adding || editingId !== null;
  const canSave = draft.host.trim() && draft.projectKey.trim() && draft.apiToken.trim() && (draft.authMode !== 'basic' || draft.username.trim());

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-txt)' }}>Jira Integration</div>
        {!formOpen && (
          <button onClick={startAdd} style={addBtn}>+ Add host</button>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--t-muted)', marginBottom: 14 }}>
        Multiple hosts supported. Each entry has its own project key. When you paste a ticket (e.g. <b>C123456-6789</b>), the host is picked by matching the project key. The <b>default</b> host is used for <b>Create Jira</b> everywhere and as a fallback for tickets whose prefix doesn't match any configured project key.
      </div>

      {/* Kanban boards — each becomes a button on the Kanban page that opens
          the board in a new tab. */}
      <div style={{ marginBottom: 18, padding: '10px 14px', background: 'color-mix(in oklab, var(--t-txt) 3%, var(--t-surf2))', border: '1px solid color-mix(in oklab, var(--t-txt) 10%, var(--t-brd2))', borderRadius: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: jiraBoards.length > 0 ? 8 : 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-txt)' }}>Jira boards</span>
          <span style={{ fontSize: 11.5, color: 'var(--t-muted)', flex: 1 }}>
            Each board shows as a button on the Kanban page (opens in a new tab).
          </span>
          <button onClick={addJiraBoard}
            style={{ border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add board
          </button>
        </div>
        {jiraBoards.map(b => (
          <BoardRow key={b.id} id={b.id} label={b.label} url={b.url}
            onSave={(patch) => updateJiraBoard(b.id, patch)}
            onRemove={() => removeJiraBoard(b.id)} />
        ))}
      </div>

      {jiraConfigs.length === 0 && !formOpen && (
        <div style={{ fontSize: 13, color: 'var(--t-muted)' }}>No Jira hosts configured.</div>
      )}

      {jiraConfigs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: formOpen ? 16 : 0 }}>
          {jiraConfigs.map(c => {
            if (editingId === c.id) return null;
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 18,
                padding: '16px 18px', background: 'color-mix(in oklab, var(--t-txt) 3%, var(--t-surf2))',
                border: `1px solid ${c.isDefault ? 'var(--t-acc-fo)' : 'var(--t-brd2)'}`,
                borderRadius: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-txt)', letterSpacing: '-0.01em' }}>{c.projectKey}</span>
                    {c.isDefault && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'var(--t-acc-bg)', color: 'var(--t-acc-dk)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Default
                      </span>
                    )}
                    {!!c.createUrlTemplate?.trim() && (
                      <span title="Tickets are created by opening the configured URL in a new tab, not via the API"
                        style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'var(--t-surf3)', color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        URL create
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--t-txt2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                    {c.host}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.projectKey}{c.component ? ` · ${c.component}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {!c.isDefault && (
                    <button onClick={() => setDefaultJiraConfig(c.id)} style={ghostBtn}
                      title="Use this host for Create Jira and for tickets whose prefix doesn't match any project key">
                      Make default
                    </button>
                  )}
                  <button onClick={() => startEdit(c)} style={ghostBtn}>Edit</button>
                  <span onClick={() => handleDelete(c)} title="Delete" style={{ cursor: 'pointer', color: 'var(--t-muted)', fontSize: 18, padding: '0 6px', lineHeight: 1 }}>×</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <div style={{
          padding: 16, background: 'color-mix(in oklab, var(--t-txt) 3%, var(--t-surf2))', border: '1px solid color-mix(in oklab, var(--t-txt) 10%, var(--t-brd2))',
          borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--t-txt)' }}>
            {editingId ? 'Edit host' : 'New Jira host'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>
            <b>PAT</b>: a Personal Access Token (Jira → your avatar → Profile → Personal Access Tokens) sent as Bearer. <b>Username + Password</b>: Basic auth, for instances that reject PATs. Fields marked * are required.
          </div>
          <div style={grp}>Connection</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div style={fl}>Host *</div>
              <input value={draft.host} onChange={e => setDraft(d => ({ ...d, host: e.target.value }))} placeholder="jira.company.com" style={fi} />
            </div>
            <div><div style={fl}>Project Key *</div>
              <input value={draft.projectKey} onChange={e => setDraft(d => ({ ...d, projectKey: e.target.value.toUpperCase() }))} placeholder="PROJ" style={fi} />
            </div>
            <div><div style={fl}>Authentication</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([['pat', 'PAT (Bearer)'], ['basic', 'Username + Password']] as const).map(([mode, label]) => (
                  <button key={mode} onClick={e => { e.currentTarget.blur(); setDraft(d => ({ ...d, authMode: mode })); }}
                    style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
                      border: (draft.authMode ?? 'pat') === mode ? '1px solid var(--t-acc)' : '1px solid var(--t-brd)',
                      background: (draft.authMode ?? 'pat') === mode ? 'var(--t-acc-bg)' : 'var(--t-surf)',
                      color: (draft.authMode ?? 'pat') === mode ? 'var(--t-acc-dk)' : 'var(--t-txt2)' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {draft.authMode === 'basic' ? (
              <div><div style={fl}>Username *</div>
                <input value={draft.username} onChange={e => setDraft(d => ({ ...d, username: e.target.value }))} placeholder="jsmith" style={fi} />
              </div>
            ) : <div />}
            <div><div style={fl}>{draft.authMode === 'basic' ? 'Password *' : 'Personal Access Token (PAT) *'}</div>
              <input value={draft.apiToken} onChange={e => setDraft(d => ({ ...d, apiToken: e.target.value }))} type="password" placeholder="••••••••••••" style={fi} />
            </div>
            <div />
            <div><div style={fl}>Default Component</div>
              <input value={draft.component} onChange={e => setDraft(d => ({ ...d, component: e.target.value }))} placeholder="Frontend (optional)" style={fi} />
            </div>
            <div><div style={fl}>Default Assignee (Jira username)</div>
              <input value={draft.defaultAssigneeId} onChange={e => setDraft(d => ({ ...d, defaultAssigneeId: e.target.value }))} placeholder="jsmith (optional)" style={fi} />
            </div>
            <div><div style={fl}>Urgent-task Label</div>
              <input value={draft.urgentLabel ?? ''} onChange={e => setDraft(d => ({ ...d, urgentLabel: e.target.value }))} placeholder="unplanned (added to Urgent-type tickets)" style={fi} />
            </div>
          </div>
          <div style={grp}>Ticket create defaults (API)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div><div style={fl}>Project ID (pid)</div>
              <input value={draft.pid} onChange={e => setDraft(d => ({ ...d, pid: e.target.value }))} placeholder="10000 (optional)" style={fi} />
            </div>
            <div><div style={fl}>Issue Type ID</div>
              <input value={draft.issueTypeId} onChange={e => setDraft(d => ({ ...d, issueTypeId: e.target.value }))} placeholder={'3 (optional, default "Task")'} style={fi} />
            </div>
            <div><div style={fl}>Priority ID</div>
              <input value={draft.priorityId} onChange={e => setDraft(d => ({ ...d, priorityId: e.target.value }))} placeholder="3 (optional)" style={fi} />
            </div>
          </div>
          <div style={{ ...grp, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Ticket fields — acceptance criteria · story points · scrum team · epic</span>
            <button disabled={!draft.host.trim() || !draft.apiToken.trim()}
              onClick={async () => {
                setDetectResult('Asking Jira for its fields…');
                try {
                  const found = await detectJiraFields({ ...draft, id: 'detect', isDefault: false });
                  setDraft(d => ({
                    ...d,
                    ...(found.acceptanceCriteria ? { acceptanceCriteriaFieldId: found.acceptanceCriteria.id, acceptanceCriteriaFormat: found.acceptanceCriteria.format } : {}),
                    ...(found.storyPoints ? { storyPointsFieldId: found.storyPoints.id, storyPointsFormat: found.storyPoints.format } : {}),
                    ...(found.scrumTeam ? { scrumTeamFieldId: found.scrumTeam.id, scrumTeamFormat: found.scrumTeam.format } : {}),
                    ...(found.epic ? { epicFieldId: found.epic.id, epicFormat: found.epic.format } : {}),
                  }));
                  const names = Object.values(found).map(f => `${f.name} = ${f.id}`);
                  const missing = (['acceptanceCriteria', 'storyPoints', 'scrumTeam', 'epic'] as const).filter(k => !found[k]).map(k => ({ acceptanceCriteria: 'acceptance criteria', storyPoints: 'story points', scrumTeam: 'scrum team', epic: 'epic' }[k]));
                  setDetectResult(`✓ ${names.length ? names.join(' · ') : 'nothing matched'}${missing.length ? ` — not found: ${missing.join(', ')} (type the id by hand)` : ''} — Save to keep`);
                } catch (err) {
                  setDetectResult(`✗ ${err instanceof Error ? err.message : String(err)} — type the ids by hand`);
                }
              }}
              title="Look the four fields up by name in this Jira (GET /rest/api/2/field)"
              style={{ ...ghostBtn, marginLeft: 'auto', textTransform: 'none', letterSpacing: 0, opacity: draft.host.trim() && draft.apiToken.trim() ? 1 : 0.5 }}>
              ⌕ Detect
            </button>
          </div>
          {detectResult && <div style={{ fontSize: 12, fontWeight: 600, color: detectResult.startsWith('✓') ? 'var(--t-success)' : detectResult.startsWith('✗') ? 'var(--t-urgent)' : 'var(--t-muted)' }}>{detectResult}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.8fr 1.6fr', gap: '8px 12px', alignItems: 'end' }}>
            {([
              { label: 'Acceptance criteria', id: 'acceptanceCriteriaFieldId', fmt: 'acceptanceCriteriaFormat', def: 'acceptanceCriteriaTemplate', defLabel: 'Default (template)', ph: 'empty = the task title · <TASK NAME> inserts it', note: 'editable on every create' },
              { label: 'Story points', id: 'storyPointsFieldId', fmt: 'storyPointsFormat', def: 'defaultStoryPoints', defLabel: 'Default', ph: '1', note: 'editable on every create' },
              { label: 'Scrum team', id: 'scrumTeamFieldId', fmt: 'scrumTeamFormat', def: 'defaultScrumTeam', defLabel: 'Default', ph: 'team name as Jira lists it', note: '' },
              { label: 'Epic', id: 'epicFieldId', fmt: 'epicFormat', def: 'defaultEpic', defLabel: 'Default', ph: 'epic key, e.g. PROJ-12', note: '' },
            ] as const).map(f => (
              <Fragment key={f.id}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-txt)', paddingBottom: 8 }}>{f.label}{f.note && <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-muted)' }}>{f.note}</div>}</div>
                <div><div style={fl}>Field id</div>
                  <input value={String(draft[f.id] ?? '')} onChange={e => setDraft(d => ({ ...d, [f.id]: e.target.value.trim() }))} placeholder="customfield_12345" style={{ ...fi, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                </div>
                <div><div style={fl}>Value type</div>
                  <select value={String(draft[f.fmt] ?? 'text')} onChange={e => setDraft(d => ({ ...d, [f.fmt]: e.target.value as JiraFieldFormat }))} style={fi}>
                    {FORMATS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
                <div><div style={fl}>{f.defLabel}</div>
                  <input value={String(draft[f.def] ?? '')} type={f.def === 'defaultStoryPoints' ? 'number' : 'text'} min={0} step={0.5}
                    onChange={e => setDraft(d => ({ ...d, [f.def]: f.def === 'defaultStoryPoints' ? (e.target.value === '' ? ('' as unknown as number) : Number(e.target.value)) : e.target.value }))}
                    placeholder={f.ph} style={fi} />
                </div>
              </Fragment>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--t-muted)' }}>A field with no id is simply not sent — Jira rejects a create that names a field it doesn't know. For the URL fallback, put <b>{'{acceptance}'}</b>, <b>{'{storypoints}'}</b>, <b>{'{team}'}</b>, <b>{'{epic}'}</b> in the Create-URL override.</div>

          <div style={grp}>Status flow</div>
          <div>
            <div style={fl}>Jira statuses, in order</div>
            <input value={flowText} onChange={e => setFlowText(e.target.value)} placeholder="New > To do > In progress > Done" style={fi} />
            <div style={{ fontSize: 11.5, color: 'var(--t-muted)', marginTop: 4 }}>
              Jira only allows the hops its workflow defines, so a ticket is walked along this flow one status at a time (New → To do → In progress → Done). TaskFlow's own statuses don't change — the Jira status only shows next to the ticket.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.syncStatus !== false} onChange={e => setDraft(d => ({ ...d, syncStatus: e.target.checked }))} />
            <span><b>The ticket follows the card's status</b> <span style={{ color: 'var(--t-muted)' }}>— off: tickets only move when you close them in the review</span></span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, opacity: draft.syncStatus === false ? 0.5 : 1 }}>
            {CARD_STATUSES.map(cs => (
              <div key={cs.k}><div style={fl}>Card: {cs.label} →</div>
                <input value={draft.statusMap?.[cs.k] ?? ''} onChange={e => setDraft(d => ({ ...d, statusMap: { ...(d.statusMap ?? {}), [cs.k]: e.target.value } }))}
                  placeholder="(leave ticket)" style={fi} />
              </div>
            ))}
          </div>

          <div style={grp}>Templates &amp; URL override</div>
          <div>
            <div style={fl}>Summary Template</div>
            <input value={draft.summaryTemplate} onChange={e => setDraft(d => ({ ...d, summaryTemplate: e.target.value }))}
              placeholder="blah 123456 <TASK NAME> more words" style={fi} />
            <div style={{ fontSize: 11.5, color: 'var(--t-muted)', marginTop: 4 }}>
              <b>&lt;TASK NAME&gt;</b> is replaced with the task's title. Leave empty to use the title as-is. You can still edit the result before each create.
            </div>
          </div>
          <div>
            <div style={fl}>Create-URL Override</div>
            <input value={draft.createUrlTemplate} onChange={e => setDraft(d => ({ ...d, createUrlTemplate: e.target.value }))}
              placeholder="https://host/secure/CreateIssueDetails!init.jspa?pid=10000&issuetype=3&priority=3&assignee=me&components=…" style={fi} />
            <div style={{ fontSize: 11.5, color: 'var(--t-muted)', marginTop: 4 }}>
              Fallback: <b>Create in Jira</b> calls the API first; only when the API is unreachable does this URL open in a new tab, pre-filled — put pid, issuetype, priority, assignee, component etc. directly in the URL. Use <b>{'{summary}'}</b> and <b>{'{description}'}</b> placeholders, or omit them and both are appended automatically.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              disabled={!draft.host.trim() || !draft.apiToken.trim()}
              onClick={async () => {
                setTestResult('Testing…');
                try {
                  const who = await testJiraAuth({ ...draft, id: 'test', isDefault: false });
                  setTestResult(`✓ Authenticated as ${who}`);
                } catch (err) {
                  setTestResult(`✗ ${err instanceof Error ? err.message : String(err)}`);
                }
              }}
              style={{ ...ghostBtn, opacity: draft.host.trim() && draft.apiToken.trim() ? 1 : 0.5 }}>
              Test connection
            </button>
            {testResult && (
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: testResult.startsWith('✓') ? 'var(--t-success)' : testResult.startsWith('✗') ? 'oklch(0.5 0.19 25)' : 'var(--t-muted)' }} title={testResult}>
                {testResult}
              </span>
            )}
            {!testResult && <div style={{ flex: 1 }} />}
            <button onClick={cancelForm} style={ghostBtn}>Cancel</button>
            <button onClick={saveForm} disabled={!canSave}
              style={{ ...addBtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}>
              {editingId ? 'Save changes' : 'Add host'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
