import type { JiraConfig } from './types';

/**
 * The Jira config marked default. Used by "Create Jira" everywhere and as the
 * fallback host when a pasted ticket's project prefix doesn't match any
 * configured entry. Returns null if there are no configured hosts at all.
 */
export function getDefaultJiraConfig(configs: JiraConfig[]): JiraConfig | null {
  if (configs.length === 0) return null;
  return configs.find(c => c.isDefault) ?? configs[0];
}

/**
 * Extract the project prefix from a Jira ticket key.
 * Splits on the LAST dash (matches keys like "C123456-6789" or "PROJ-123").
 * Returns null if the key has no dash.
 */
export function jiraProjectPrefix(ticketKey: string): string | null {
  const dash = ticketKey.lastIndexOf('-');
  if (dash <= 0) return null;
  return ticketKey.slice(0, dash);
}

/**
 * Pick the Jira config to use when opening a specific ticket. Matches
 * projectKey case-insensitively against the ticket's prefix. Falls back to
 * the default config when nothing matches.
 */
export function getJiraConfigForKey(configs: JiraConfig[], ticketKey: string): JiraConfig | null {
  if (!ticketKey) return getDefaultJiraConfig(configs);
  const prefix = jiraProjectPrefix(ticketKey);
  if (!prefix) return getDefaultJiraConfig(configs);
  const match = configs.find(c => c.projectKey.toLowerCase() === prefix.toLowerCase());
  return match ?? getDefaultJiraConfig(configs);
}

/** Convenience: full URL for opening a ticket in its correct host. Null if no matching host. */
export function jiraTicketUrl(configs: JiraConfig[], ticketKey: string): string | null {
  const cfg = getJiraConfigForKey(configs, ticketKey);
  if (!cfg) return null;
  return `https://${cfg.host}/browse/${ticketKey}`;
}

/**
 * Apply the host's summary template to a task title. "<TASK NAME>" (case-
 * insensitive) is replaced with the title; no template → title as-is.
 */
export function applySummaryTemplate(cfg: JiraConfig | null, taskTitle: string): string {
  const tpl = cfg?.summaryTemplate?.trim();
  if (!tpl) return taskTitle;
  return tpl.replace(/<task name>/gi, taskTitle);
}

/**
 * Build the pre-filled create URL from the host's override template. The
 * template is fully self-contained (host, pid, issuetype, priority, assignee,
 * component…); only summary/description are injected — via {summary} /
 * {description} placeholders when present, otherwise appended as query params.
 * Returns null when the host has no override (caller should use the API).
 */
export function buildJiraCreateUrl(cfg: JiraConfig, summary: string, description: string): string | null {
  let u = cfg.createUrlTemplate?.trim();
  if (!u) return null;
  const enc = encodeURIComponent;
  if (/\{summary\}|\{description\}/i.test(u)) {
    u = u.replace(/\{summary\}/gi, enc(summary)).replace(/\{description\}/gi, enc(description));
  } else {
    u += (u.includes('?') ? '&' : '?') + `summary=${enc(summary)}&description=${enc(description)}`;
  }
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}
