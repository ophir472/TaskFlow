import type { JiraConfig } from './types';
import { loggedFetch } from './apiLog';
import { buildCustomFields, detectFields, nextHop, sameStatus, statusFlowOf, type CreateExtras, type JiraFieldMeta } from './jiraFields';

// Jira Data Center (REST v2) takes plain-text descriptions — no ADF.
function buildDescription(description: string, requestedBy: string): string {
  const parts: string[] = [];
  if (description) parts.push(description);
  if (requestedBy) parts.push(`Requested by: ${requestedBy}`);
  return parts.join('\n\n') || ' ';
}

// Data Center auth: PAT as Bearer by default; 'basic' sends
// username:password — for DC setups that reject PATs (pre-8.14 or SSO).
function authHeader(config: JiraConfig): string {
  if (config.authMode === 'basic') return `Basic ${btoa(`${config.username}:${config.apiToken}`)}`;
  return `Bearer ${config.apiToken}`;
}

export async function createJiraIssue(
  config: JiraConfig,
  fields: { summary: string; description: string; requestedBy: string; reporterAccountId?: string; labels?: string[] } & CreateExtras
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
      ...(fields.labels?.length ? { labels: fields.labels } : {}),
      // Acceptance criteria / story points / scrum team / epic — only the
      // ones whose field id is configured on the host.
      ...buildCustomFields(config, fields),
    },
  };

  const url = `https://${host}/rest/api/2/issue`;
  const { res, text } = await loggedFetch('jira:create', url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(config),
      // Jira DC's XSRF filter 403s browser-looking POSTs without this.
      'X-Atlassian-Token': 'no-check',
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
  // Walk the configured flow (New > To do > In progress > Done) to its last
  // status first — a ticket still in New has no direct "done" transition.
  const flow = statusFlowOf(config);
  try {
    return await moveJiraIssueTo(config, issueKey, flow[flow.length - 1]);
  } catch (err) {
    // Unreachable API: nothing else will work either. Otherwise fall through
    // to the workflow-agnostic pick below (done category / name match).
    if (err instanceof Error && err.name === 'ApiUnreachableError') throw err;
  }
  const host = config.host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${host}/rest/api/2/issue/${issueKey}/transitions`;
  const headers = {
    Authorization: authHeader(config),
    // Jira DC's XSRF filter 403s browser-looking POSTs without this.
    'X-Atlassian-Token': 'no-check',
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
      // Jira DC's XSRF filter 403s browser-looking POSTs without this.
      'X-Atlassian-Token': 'no-check',
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

/**
 * Auth self-test: GET /myself answers with the authenticated user when the
 * credentials work, and carries the useful 401 diagnostics (WWW-Authenticate,
 * X-Seraph-LoginReason) when they don't. Returns the display name.
 */
export async function testJiraAuth(config: JiraConfig): Promise<string> {
  const host = config.host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${host}/rest/api/2/myself`;
  const { res, text } = await loggedFetch('jira:myself', url, {
    headers: { Authorization: authHeader(config), Accept: 'application/json' },
  });
  if (!res.ok) {
    const seraph = res.headers.get('x-seraph-loginreason');
    throw new Error(`HTTP ${res.status}${seraph ? ` (${seraph})` : ''} — see [jira:myself] in the console for headers/body`);
  }
  const data = JSON.parse(text);
  return data.displayName ?? data.name ?? 'authenticated';
}

const hostOf = (config: JiraConfig) => config.host.replace(/^https?:\/\//, '').replace(/\/$/, '');
const jsonHeaders = (config: JiraConfig) => ({
  Authorization: authHeader(config),
  'X-Atlassian-Token': 'no-check',
  'Content-Type': 'application/json',
  Accept: 'application/json',
});
function errorText(status: number, text: string): string {
  try {
    const err = JSON.parse(text);
    if (err.errorMessages?.length) return err.errorMessages[0];
    if (err.errors && Object.keys(err.errors).length) return Object.values(err.errors).join(', ');
  } catch { /* ignore */ }
  return `HTTP ${status}`;
}

/** The ticket's current Jira status name. */
export async function getJiraStatus(config: JiraConfig, issueKey: string): Promise<string> {
  const url = `https://${hostOf(config)}/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=status`;
  const { res, text } = await loggedFetch('jira:status', url, { headers: jsonHeaders(config) });
  if (!res.ok) throw new Error(errorText(res.status, text));
  return JSON.parse(text)?.fields?.status?.name ?? '';
}

/**
 * Move a ticket to `target`, one legal transition at a time along the host's
 * status flow. Jira only offers the transitions its workflow defines from the
 * current status, so New → Done is usually three hops. Works backwards too
 * (Done → In progress when a card is reopened). Returns the final status.
 */
export async function moveJiraIssueTo(config: JiraConfig, issueKey: string, target: string): Promise<string> {
  const flow = statusFlowOf(config);
  const base = `https://${hostOf(config)}/rest/api/2/issue/${encodeURIComponent(issueKey)}`;
  let current = await getJiraStatus(config, issueKey);
  // A flow of n statuses needs at most n-1 hops; the margin covers a ticket
  // that starts outside the flow.
  for (let hop = 0; hop < flow.length + 2; hop++) {
    if (sameStatus(current, target)) return current;
    const { res, text } = await loggedFetch('jira:transitions', `${base}/transitions`, { headers: jsonHeaders(config) });
    if (!res.ok) throw new Error(`Couldn't list transitions: ${errorText(res.status, text)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transitions: any[] = JSON.parse(text).transitions ?? [];
    const offered = transitions.map(t => String(t.to?.name ?? '')).filter(Boolean);
    const next = nextHop(flow, current, target, offered);
    if (!next) throw new Error(`No transition from "${current}" toward "${target}" (Jira offers: ${offered.join(', ') || 'none'})`);
    const tr = transitions.find(t => sameStatus(t.to?.name, next));
    const post = await loggedFetch('jira:transition-post', `${base}/transitions`, {
      method: 'POST', headers: jsonHeaders(config), body: JSON.stringify({ transition: { id: tr.id } }),
    });
    if (!post.res.ok) throw new Error(`"${current}" → "${next}": ${errorText(post.res.status, post.text)}`);
    current = String(tr.to?.name ?? next);
  }
  if (sameStatus(current, target)) return current;
  throw new Error(`Stopped at "${current}" before reaching "${target}"`);
}

/** Settings → Detect: look the four custom fields up by name. */
export async function detectJiraFields(config: JiraConfig) {
  const { res, text } = await loggedFetch('jira:fields', `https://${hostOf(config)}/rest/api/2/field`, { headers: jsonHeaders(config) });
  if (!res.ok) throw new Error(errorText(res.status, text));
  return detectFields(JSON.parse(text) as JiraFieldMeta[]);
}
