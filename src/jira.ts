import type { JiraConfig } from './types';
import { log } from './snapshots';

function buildDescription(description: string, requestedBy: string) {
  const content: object[] = [];

  if (description) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: description }],
    });
  }

  if (requestedBy) {
    if (content.length > 0) content.push({ type: 'paragraph', content: [{ type: 'text', text: '' }] });
    content.push({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Requested by: ', marks: [{ type: 'strong' }] },
        { type: 'text', text: requestedBy },
      ],
    });
  }

  if (content.length === 0) content.push({ type: 'paragraph', content: [{ type: 'text', text: ' ' }] });

  return { type: 'doc', version: 1, content };
}

export async function createJiraIssue(
  config: JiraConfig,
  fields: { summary: string; description: string; requestedBy: string; reporterAccountId?: string }
): Promise<{ key: string; url: string }> {
  const host = config.host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const auth = btoa(`${config.username}:${config.apiToken}`);

  const body: Record<string, unknown> = {
    fields: {
      project: { key: config.projectKey },
      summary: fields.summary,
      description: buildDescription(fields.description, fields.requestedBy),
      issuetype: { name: 'Task' },
      ...(config.component ? { components: [{ name: config.component }] } : {}),
      ...(config.defaultAssigneeId ? { assignee: { id: config.defaultAssigneeId } } : {}),
      // Requester's mapped Jira account (Settings → Requesters). Setting
      // Reporter requires the "Modify Reporter" Jira permission; if the API
      // rejects it, the whole create fails, so we only send it when mapped.
      ...(fields.reporterAccountId ? { reporter: { id: fields.reporterAccountId } } : {}),
    },
  };

  const url = `https://${host}/rest/api/3/issue`;
  log('jira:fetch-start', { url, projectKey: config.projectKey, summary: fields.summary });
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    log('jira:fetch-network-error', { url, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  log('jira:fetch-complete', { url, status: res.status });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err.errorMessages?.length) msg = err.errorMessages[0];
      else if (err.errors) msg = Object.values(err.errors).join(', ');
    } catch { /* ignore */ }
    log('jira:fetch-http-error', { url, status: res.status, message: msg });
    throw new Error(msg);
  }

  const data = await res.json();
  return { key: data.key, url: `https://${host}/browse/${data.key}` };
}

// Plain text → ADF doc, one paragraph per line (blank lines become empty
// paragraphs so the comment keeps its spacing).
function textToAdf(text: string) {
  const lines = text.split('\n');
  const content = lines.map(line => ({
    type: 'paragraph',
    content: line ? [{ type: 'text', text: line }] : [],
  }));
  if (content.length === 0) content.push({ type: 'paragraph', content: [] });
  return { type: 'doc', version: 1, content };
}

/**
 * Move a ticket to its done/closed/resolved status. Jira workflows differ per
 * project, so we list the available transitions and pick the one whose target
 * status is in the "done" category (falling back to a name match on
 * done/close/resolve). Returns the resulting status name.
 */
export async function closeJiraIssue(config: JiraConfig, issueKey: string): Promise<string> {
  const host = config.host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const auth = btoa(`${config.username}:${config.apiToken}`);
  const url = `https://${host}/rest/api/3/issue/${issueKey}/transitions`;
  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  log('jira:transitions-start', { url, issueKey });
  const listRes = await fetch(url, { headers });
  if (!listRes.ok) throw new Error(`Couldn't list transitions: HTTP ${listRes.status}`);
  const data = await listRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transitions: any[] = data.transitions ?? [];
  const target =
    transitions.find(t => t.to?.statusCategory?.key === 'done') ??
    transitions.find(t => /done|closed?|resolved?/i.test(t.name ?? '') || /done|closed?|resolved?/i.test(t.to?.name ?? ''));
  if (!target) throw new Error('No close/resolve transition available from the ticket\'s current status');

  log('jira:transition-post', { url, issueKey, transitionId: target.id, to: target.to?.name });
  const postRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ transition: { id: target.id } }),
  });
  if (!postRes.ok) {
    let msg = `HTTP ${postRes.status}`;
    try {
      const err = await postRes.json();
      if (err.errorMessages?.length) msg = err.errorMessages[0];
      else if (err.errors) msg = Object.values(err.errors).join(', ');
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return target.to?.name ?? target.name ?? 'Done';
}

export async function addJiraComment(
  config: JiraConfig,
  issueKey: string,
  text: string,
): Promise<void> {
  const host = config.host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const auth = btoa(`${config.username}:${config.apiToken}`);
  const url = `https://${host}/rest/api/3/issue/${issueKey}/comment`;
  log('jira:comment-start', { url, issueKey });
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ body: textToAdf(text) }),
    });
  } catch (err) {
    log('jira:comment-network-error', { url, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  log('jira:comment-complete', { url, status: res.status });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err.errorMessages?.length) msg = err.errorMessages[0];
      else if (err.errors) msg = Object.values(err.errors).join(', ');
    } catch { /* ignore */ }
    throw new Error(msg);
  }
}
