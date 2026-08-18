import type { JiraConfig } from './types';
import { loggedFetch } from './apiLog';

// Jira Data Center (REST v2) takes plain-text descriptions — no ADF.
function buildDescription(description: string, requestedBy: string): string {
  const parts: string[] = [];
  if (description) parts.push(description);
  if (requestedBy) parts.push(`Requested by: ${requestedBy}`);
  return parts.join('\n\n') || ' ';
}

// Data Center auth: Personal Access Token as Bearer (Basic user:token is the
// Cloud scheme and gets a 401 with a PAT).
function authHeader(config: JiraConfig): string {
  return `Bearer ${config.apiToken}`;
}

export async function createJiraIssue(
  config: JiraConfig,
  fields: { summary: string; description: string; requestedBy: string; reporterAccountId?: string }
): Promise<{ key: string; url: string }> {
  const host = config.host.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const body: Record<string, unknown> = {
    fields: {
      // Numeric project id (pid) wins over the key when configured.
      project: config.pid?.trim() ? { id: config.pid.trim() } : { key: config.projectKey },
      summary: fields.summary,
      description: buildDescription(fields.description, fields.requestedBy),
      issuetype: config.issueTypeId?.trim() ? { id: config.issueTypeId.trim() } : { name: 'Task' },
      ...(config.priorityId?.trim() ? { priority: { id: config.priorityId.trim() } } : {}),
      ...(config.component ? { components: [{ name: config.component }] } : {}),
      ...(config.defaultAssigneeId ? { assignee: { name: config.defaultAssigneeId } } : {}),
      // Requester's mapped Jira username (Settings → Requesters). Setting
      // Reporter requires the "Modify Reporter" Jira permission; if the API
      // rejects it, the whole create fails, so we only send it when mapped.
      ...(fields.reporterAccountId ? { reporter: { name: fields.reporterAccountId } } : {}),
    },
  };

  const url = `https://${host}/rest/api/2/issue`;
  const { res, text } = await loggedFetch('jira:create', url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(config),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = JSON.parse(text);
      if (err.errorMessages?.length) msg = err.errorMessages[0];
      else if (err.errors) msg = Object.values(err.errors).join(', ');
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const data = JSON.parse(text);
  return { key: data.key, url: `https://${host}/browse/${data.key}` };
}

/**
 * Move a ticket to its done/closed/resolved status. Jira workflows differ per
 * project, so we list the available transitions and pick the one whose target
 * status is in the "done" category (falling back to a name match on
 * done/close/resolve). Returns the resulting status name.
 */
export async function closeJiraIssue(config: JiraConfig, issueKey: string): Promise<string> {
  const host = config.host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${host}/rest/api/2/issue/${issueKey}/transitions`;
  const headers = {
    Authorization: authHeader(config),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const { res: listRes, text: listText } = await loggedFetch('jira:transitions', url, { headers });
  if (!listRes.ok) throw new Error(`Couldn't list transitions: HTTP ${listRes.status}`);
  const data = JSON.parse(listText);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transitions: any[] = data.transitions ?? [];
  const target =
    transitions.find(t => t.to?.statusCategory?.key === 'done') ??
    transitions.find(t => /done|closed?|resolved?/i.test(t.name ?? '') || /done|closed?|resolved?/i.test(t.to?.name ?? ''));
  if (!target) throw new Error('No close/resolve transition available from the ticket\'s current status');

  const { res: postRes, text: postText } = await loggedFetch('jira:transition-post', url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ transition: { id: target.id } }),
  });
  if (!postRes.ok) {
    let msg = `HTTP ${postRes.status}`;
    try {
      const err = JSON.parse(postText);
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
  const url = `https://${host}/rest/api/2/issue/${issueKey}/comment`;
  const { res, text: respText } = await loggedFetch('jira:comment', url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(config),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    // REST v2 comments are plain text.
    body: JSON.stringify({ body: text }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = JSON.parse(respText);
      if (err.errorMessages?.length) msg = err.errorMessages[0];
      else if (err.errors) msg = Object.values(err.errors).join(', ');
    } catch { /* ignore */ }
    throw new Error(msg);
  }
}
