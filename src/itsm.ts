import type { ItsmConfig } from './types';
import { log } from './snapshots';

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

export interface SnTicketInfo {
  status: string;
  updatedOn: number;
}

const TABLE_BY_PREFIX: [RegExp, string][] = [
  [/^CHG/i, 'change_request'],
  [/^RITM/i, 'sc_req_item'],
  [/^SCTASK/i, 'sc_task'],
  [/^PRB/i, 'problem'],
];

/**
 * Fetch a ticket's status + last update time from the ServiceNow Table API.
 * The table is derived from the ticket prefix (INC → incident, CHG →
 * change_request, …). Requires username/apiToken on the ITSM config.
 */
export async function fetchSnTicket(cfg: ItsmConfig, ticket: string): Promise<SnTicketInfo> {
  const host = cfg.host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const table = TABLE_BY_PREFIX.find(([re]) => re.test(ticket))?.[1] ?? 'incident';
  const url = `https://${host}/api/now/table/${table}?sysparm_query=number=${encodeURIComponent(ticket)}&sysparm_fields=state,sys_updated_on&sysparm_display_value=all&sysparm_limit=1`;
  log('itsm:fetch-start', { url, ticket });
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Basic ${btoa(`${cfg.username ?? ''}:${cfg.apiToken ?? ''}`)}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    log('itsm:fetch-network-error', { url, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  log('itsm:fetch-complete', { url, status: res.status });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const row = data.result?.[0];
  if (!row) throw new Error('Ticket not found');
  const status = (typeof row.state === 'object' ? row.state?.display_value : row.state) ?? '';
  // sys_updated_on raw value is UTC "YYYY-MM-DD HH:MM:SS"
  const updRaw = (typeof row.sys_updated_on === 'object' ? row.sys_updated_on?.value : row.sys_updated_on) ?? '';
  const updatedOn = updRaw ? Date.parse(String(updRaw).replace(' ', 'T') + 'Z') : 0;
  return { status: String(status), updatedOn: isNaN(updatedOn) ? 0 : updatedOn };
}
