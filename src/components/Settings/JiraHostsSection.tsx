import { useState } from 'react';
import { useStore } from '../../store';
import type { JiraConfig } from '../../types';

const card: React.CSSProperties = { background: 'var(--t-surf)', border: '1px solid var(--t-brd)', borderRadius: 12, padding: 20 };
const fi: React.CSSProperties = { fontSize: 13.5, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-brd)', background: 'var(--t-surf2)', color: 'var(--t-txt)', width: '100%', boxSizing: 'border-box' };
const fl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };
const addBtn: React.CSSProperties = { border: 'none', background: 'var(--t-acc)', color: 'white', fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { border: '1px solid var(--t-brd)', background: 'var(--t-surf)', color: 'var(--t-txt2)', fontSize: 13, fontWeight: 500, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' };

type DraftEntry = Omit<JiraConfig, 'id' | 'isDefault'>;
const EMPTY_DRAFT: DraftEntry = {
  host: '', username: '', apiToken: '', projectKey: '',
  component: '', defaultAssigneeId: '',
};

export function JiraHostsSection() {
  const jiraConfigs = useStore(s => s.jiraConfigs);
  const addJiraConfig = useStore(s => s.addJiraConfig);
  const updateJiraConfig = useStore(s => s.updateJiraConfig);
  const removeJiraConfig = useStore(s => s.removeJiraConfig);
  const setDefaultJiraConfig = useStore(s => s.setDefaultJiraConfig);
  const jiraOpenMode = useStore(s => s.jiraOpenMode);
  const setJiraOpenMode = useStore(s => s.setJiraOpenMode);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<boolean>(jiraConfigs.length === 0);
  const [draft, setDraft] = useState<DraftEntry>(EMPTY_DRAFT);

  function startAdd() {
    setAdding(true);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }
  function startEdit(c: JiraConfig) {
    setEditingId(c.id);
    setAdding(false);
    setDraft({
      host: c.host, username: c.username, apiToken: c.apiToken,
      projectKey: c.projectKey, component: c.component, defaultAssigneeId: c.defaultAssigneeId,
    });
  }
  function cancelForm() {
    setEditingId(null);
    setAdding(false);
    setDraft(EMPTY_DRAFT);
  }
  function saveForm() {
    if (!draft.host.trim() || !draft.projectKey.trim() || !draft.username.trim() || !draft.apiToken.trim()) return;
    const normalized: DraftEntry = { ...draft, projectKey: draft.projectKey.trim().toUpperCase() };
    if (editingId) updateJiraConfig(editingId, normalized);
    else addJiraConfig(normalized);
    cancelForm();
  }
  function handleDelete(c: JiraConfig) {
    if (!confirm(`Delete Jira host "${c.host}" / ${c.projectKey}?`)) return;
    removeJiraConfig(c.id);
  }

  const formOpen = adding || editingId !== null;
  const canSave = draft.host.trim() && draft.projectKey.trim() && draft.username.trim() && draft.apiToken.trim();

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

      {/* Global open behavior — applies to every host */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, padding: '10px 14px', background: 'var(--t-surf2)', border: '1px solid var(--t-brd2)', borderRadius: 9 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t-txt2)' }}>Open Jira links in</span>
        <div style={{ display: 'flex', gap: 4, background: 'var(--t-surf)', padding: 3, borderRadius: 999, border: '1px solid var(--t-brd)' }}>
          {([['popup', 'Popup preview'], ['tab', 'New tab']] as const).map(([mode, label]) => (
            <button key={mode} type="button" onClick={() => setJiraOpenMode(mode)}
              style={{
                padding: '5px 14px', borderRadius: 999, border: 'none',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                background: jiraOpenMode === mode ? 'var(--t-acc)' : 'transparent',
                color: jiraOpenMode === mode ? 'white' : 'var(--t-txt2)',
                transition: 'background 0.12s, color 0.12s',
              }}>
              {label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--t-muted)' }}>
          The popup still has an "Open in new tab" button.
        </span>
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
                padding: '16px 18px', background: 'var(--t-surf2)',
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
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--t-txt2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                    {c.host}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--t-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.username}{c.component ? ` · ${c.component}` : ''}
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
          padding: 16, background: 'var(--t-surf2)',
          border: '1px solid var(--t-brd)', borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-txt2)' }}>
            {editingId ? 'Edit host' : 'New Jira host'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>
            Use an <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" style={{ color: 'var(--t-acc)' }}>Atlassian API token</a> (not your password). Fields marked * are required.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div style={fl}>Host *</div>
              <input value={draft.host} onChange={e => setDraft(d => ({ ...d, host: e.target.value }))} placeholder="mycompany.atlassian.net" style={fi} />
            </div>
            <div><div style={fl}>Project Key *</div>
              <input value={draft.projectKey} onChange={e => setDraft(d => ({ ...d, projectKey: e.target.value.toUpperCase() }))} placeholder="PROJ" style={fi} />
            </div>
            <div><div style={fl}>Username (email) *</div>
              <input value={draft.username} onChange={e => setDraft(d => ({ ...d, username: e.target.value }))} placeholder="you@company.com" style={fi} />
            </div>
            <div><div style={fl}>API Token *</div>
              <input value={draft.apiToken} onChange={e => setDraft(d => ({ ...d, apiToken: e.target.value }))} type="password" placeholder="••••••••••••" style={fi} />
            </div>
            <div><div style={fl}>Default Component</div>
              <input value={draft.component} onChange={e => setDraft(d => ({ ...d, component: e.target.value }))} placeholder="Frontend (optional)" style={fi} />
            </div>
            <div><div style={fl}>Default Assignee Account ID</div>
              <input value={draft.defaultAssigneeId} onChange={e => setDraft(d => ({ ...d, defaultAssigneeId: e.target.value }))} placeholder="5d3f… (from Jira profile URL)" style={fi} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
