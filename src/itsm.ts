import type { ItsmConfig } from './types';

/**
 * URL for opening an ITSM ticket. A configured custom URL wins: the ticket
 * number is appended directly after it. Otherwise the ServiceNow-style
 * incident query on the host. Null when nothing is configured.
 */
export function itsmTicketUrl(cfg: ItsmConfig | null | undefined, ticket: string): string | null {
  if (!cfg || !ticket) return null;
  const custom = cfg.customUrl?.trim();
  if (custom) {
    const base = /^https?:\/\//i.test(custom) ? custom : `https://${custom}`;
    return base + encodeURIComponent(ticket);
  }
  if (!cfg.host.trim()) return null;
  return `https://${cfg.host}/incident.do?sysparm_query=number=${ticket}`;
}
