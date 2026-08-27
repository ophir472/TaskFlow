import type { Task, JiraConfig, ItsmConfig, CustomSystem } from './types';
import { jiraTicketUrl } from './jiraHosts';
import { itsmTicketUrl } from './itsm';
import { customOpenUrl } from './customSystems';
import { logOpenUrl } from './apiLog';

/**
 * Open a ticket's real page in a centered browser popup window — the user's
 * own logged-in session, so it works on every host (corporate Jira/ServiceNow
 * refuse iframes, real windows always render). The window is named per ticket
 * so clicking ⧉ again refocuses the existing window instead of stacking new
 * ones. Popup windows require a user gesture, so this is button-triggered
 * only (no hash route — there is no in-app state to restore).
 */
export function openTicketWindow(url: string, ticket: string): void {
  const w = Math.min(1150, screen.availWidth - 80);
  const h = Math.min(900, screen.availHeight - 60);
  const left = Math.round((screen.availWidth - w) / 2);
  const top = Math.round((screen.availHeight - h) / 2);
  logOpenUrl('ticket:window', url, { ticket });
  window.open(url, `taskflow-ticket-${ticket}`, `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
}

/** First openable ticket URL on a task: Jira → ITSM → custom systems. */
export function firstTicketUrl(t: Task, jiraConfigs: JiraConfig[], itsmConfig: ItsmConfig | null | undefined, customSystems: CustomSystem[]): string | null {
  if (t.jiraLink?.trim()) { const u = jiraTicketUrl(jiraConfigs, t.jiraLink.trim()); if (u) return u; }
  if (t.itsmTicket?.trim()) { const u = itsmTicketUrl(itsmConfig, t.itsmTicket.trim()); if (u) return u; }
  for (const sys of customSystems) {
    const tid = t.customTickets?.[sys.id];
    if (tid?.trim()) { const u = customOpenUrl(sys, tid); if (u) return u; }
  }
  return null;
}
