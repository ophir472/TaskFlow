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
  fields: { summary: string; description: string; requestedBy: string }
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
