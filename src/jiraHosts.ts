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
