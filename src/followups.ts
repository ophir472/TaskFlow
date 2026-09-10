import type { Task, Followup, CustomSystem, Item, HubConfig } from './types';

export const itsmKey = (ticket: string) => `itsm:${ticket}`;
export const csKey = (sysId: string, ticket: string) => `cs:${sysId}:${ticket}`;
// Hub rows that aren't tickets get the same "followed up today" mark through
// a shadow followup record keyed like a ticket (never rendered as a followup
// row — followupRows only lists ticket keys it knows).
export const waitKey = (rowId: string) => `wait:${rowId}`;
export const commKey = (fieldId: string) => `comm:${fieldId}`;
export const progressedToday = (task: Task, key: string) => isProgressed(task.followups?.find(f => f.ticketKey === key) ?? {});

export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** "Progressed" is a today-only mark: true while the stamp is from today. */
export const isProgressed = (f: { progressedAt?: number }) => (f.progressedAt ?? 0) >= startOfToday();

// A row as the UI sees it: manual rows straight from task.followups; ticket
// rows derived from the card's ITSM / custom-system tickets, merged with
// their shadow record (if any) for progress/notes. `done` for ticket rows
// always comes from irrelevantTickets — the same ✓ the ticket row shows.
export interface FollowupRow {
  id: string;            // stored record id, or `tk:<ticketKey>` for a virtual ticket row
  title: string;
  subtitle?: string;     // e.g. "ITSM" / system name for ticket rows
  notes: string;
  done: boolean;
  doneAt?: number;
  progressedAt?: number;
  ticketKey?: string;
  manual: boolean;
}

export function followupRows(task: Task, customSystems: CustomSystem[]): FollowupRow[] {
  const stored = task.followups ?? [];
  const marked = new Set(task.irrelevantTickets ?? []);
  const rows: FollowupRow[] = [];

  // Ticket rows — every ticket on the card, in card order.
  const tickets: { key: string; title: string; subtitle: string }[] = [];
  for (const tk of [task.itsmTicket, ...(task.extraItsmTickets ?? [])]) {
    if (tk?.trim()) tickets.push({ key: itsmKey(tk.trim()), title: tk.trim(), subtitle: 'ITSM' });
  }
  for (const sys of customSystems) {
    const tk = (task.customTickets?.[sys.id] ?? '').trim();
    if (tk) tickets.push({ key: csKey(sys.id, tk), title: tk, subtitle: sys.name });
  }
  for (const t of tickets) {
    const rec = stored.find(f => f.ticketKey === t.key);
    rows.push({
      id: rec?.id ?? `tk:${t.key}`, title: t.title, subtitle: t.subtitle,
      notes: rec?.notes ?? '', done: marked.has(t.key), doneAt: rec?.doneAt,
      progressedAt: rec?.progressedAt, ticketKey: t.key, manual: false,
    });
  }
  // Manual rows.
  for (const f of stored) {
    if (f.ticketKey) continue; // shadow records render via their ticket above
    rows.push({ id: f.id, title: f.title, notes: f.notes, done: f.done, doneAt: f.doneAt, progressedAt: f.progressedAt, manual: true });
  }
  return rows;
}

/** Stored followup records only (for summaries) — ticket shadow records
 *  carry doneAt/progressedAt too, so both kinds count. */
export function storedFollowups(task: Task): Followup[] {
  return task.followups ?? [];
}

/** Store ref for a row: manual rows by id, ticket rows by key (+ title for
 *  the shadow record created on first touch). Structurally = store.FollowupRef. */
export const refOf = (r: FollowupRow): { id: string } | { ticketKey: string; title: string } =>
  r.manual ? { id: r.id } : { ticketKey: r.ticketKey!, title: r.title };

/** What the ▣ Hub shows, minus what's been followed up today (or is done):
 *  the tile number. Same rules as the Hub page — tickets from every active
 *  card, waits + manual followups from today's cards, communication threads
 *  per hubConfig (touched today / focus). */
export function hubOpenCount(items: Item[], customSystems: CustomSystem[], hubConfig: HubConfig = { commTodayOnly: true, commFocusOnly: true }): number {
  const tasks = items.filter((it): it is Task => it.kind === 'task' && it.type !== 'mail' && !it.archived && it.status !== 'done' && it.status !== 'archived');
  const day = startOfToday();
  let n = 0;
  for (const t of tasks) {
    const marked = new Set(t.irrelevantTickets ?? []);
    for (const tk of [t.itsmTicket, ...(t.extraItsmTickets ?? [])]) {
      if (!tk?.trim()) continue;
      const k = itsmKey(tk.trim());
      if (!marked.has(k) && !progressedToday(t, k)) n++;
    }
    for (const sys of customSystems) {
      if (sys.showInHub === false) continue;
      const tk = (t.customTickets?.[sys.id] ?? '').trim();
      if (!tk) continue;
      const k = csKey(sys.id, tk);
      if (!marked.has(k) && !progressedToday(t, k)) n++;
    }
    for (const f of t.communications ?? []) {
      if (!f.value.trim()) continue;
      if (hubConfig.commTodayOnly && !(f.touchedAt ? f.touchedAt >= day : t.forToday)) continue;
      if (hubConfig.commFocusOnly && !f.focus) continue;
      if (!progressedToday(t, commKey(f.id))) n++;
    }
    if (t.forToday) {
      for (const r of t.waitingFor?.rows ?? []) {
        if (r.done || !r.cells.some(c => c?.trim())) continue;
        if (!progressedToday(t, waitKey(r.id))) n++;
      }
      for (const f of t.followups ?? []) {
        if (f.ticketKey || f.done || isProgressed(f)) continue;   // ticket rows counted above
        n++;
      }
    }
  }
  return n;
}
