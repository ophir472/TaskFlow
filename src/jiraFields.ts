// Jira custom fields + status flow — PURE helpers (no imports beyond types,
// so the node check script can load this file directly).
//
// Custom fields (Settings → Integrations → Jira host, 2026-09-29):
//   acceptance criteria — defaults to the task title, editable per create
//   scrum team          — host default
//   epic                — host default (the epic's key, e.g. PROJ-12)
//   story points        — host default 1, editable per create
// Their field ids differ per Jira (customfield_12345) and so does the value
// shape, so each field carries an id + a format. Nothing is sent for a field
// whose id is empty — an unknown custom field fails the whole create.
//
// Status flow: New > To do > In progress > Done. Jira only allows the
// transitions its workflow defines, so moving a ticket means walking the
// flow one hop at a time. TaskFlow's own statuses are NOT changed by any of
// this — the map below only says which Jira status a card status asks for.
import type { JiraConfig, JiraFieldFormat, TaskStatus } from './types';

export const DEFAULT_STATUS_FLOW = ['New', 'To do', 'In progress', 'Done'];
export const DEFAULT_STATUS_MAP: Record<string, string> = {
  backlog: 'New', todo: 'To do', in_progress: 'In progress', waiting: 'In progress', done: 'Done', archived: 'Done',
};
export const DEFAULT_STORY_POINTS = 1;

export const statusFlowOf = (c: Pick<JiraConfig, 'statusFlow'> | null | undefined): string[] =>
  c?.statusFlow?.filter(s => s.trim()).length ? c.statusFlow.map(s => s.trim()).filter(Boolean) : DEFAULT_STATUS_FLOW;

export const norm = (s: string | undefined | null) => (s ?? '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
export const sameStatus = (a: string | undefined | null, b: string | undefined | null) => !!norm(a) && norm(a) === norm(b);

/** The Jira status a card status asks for ('' = leave the ticket alone). */
export function jiraStatusFor(c: Pick<JiraConfig, 'statusMap'> | null | undefined, status: TaskStatus | string): string {
  const own = c?.statusMap?.[status];
  if (own !== undefined) return own.trim();
  return DEFAULT_STATUS_MAP[status] ?? '';
}

/** Which status to transition to next, given where the ticket is, where it
 *  should end up and what Jira offers from here. Direct hop when offered;
 *  otherwise the neighbour in the flow, in the right direction. null = stuck. */
export function nextHop(flow: string[], current: string, target: string, offered: string[]): string | null {
  if (sameStatus(current, target)) return null;
  const direct = offered.find(o => sameStatus(o, target));
  if (direct) return direct;
  const ci = flow.findIndex(s => sameStatus(s, current));
  const ti = flow.findIndex(s => sameStatus(s, target));
  if (ti === -1) return null;
  if (ci === -1) {
    // Ticket sits in a status outside the flow (e.g. "Blocked"): take any
    // offered hop that lands inside the flow, nearest to the target.
    const inside = offered.map(o => ({ o, i: flow.findIndex(s => sameStatus(s, o)) })).filter(x => x.i !== -1)
      .sort((a, b) => Math.abs(a.i - ti) - Math.abs(b.i - ti));
    return inside[0]?.o ?? null;
  }
  const step = ti > ci ? 1 : -1;
  // Nearest offered status between here and the target, in direction.
  for (let i = ti - step; i !== ci; i -= step) { /* prefer the longest legal jump */
    const hit = offered.find(o => sameStatus(o, flow[i]));
    if (hit) return hit;
  }
  return null;
}

/** Shape a raw value the way the field's type wants it. */
export function fieldValue(format: JiraFieldFormat | undefined, raw: string | number): unknown {
  const s = String(raw).trim();
  switch (format) {
    case 'number': { const n = Number(s); return Number.isFinite(n) ? n : undefined; }
    case 'option': return { value: s };
    case 'options': return s.split(',').map(v => v.trim()).filter(Boolean).map(value => ({ value }));
    case 'id': return { id: s };
    case 'labels': return s.split(/[,\s]+/).filter(Boolean);
    default: return s;
  }
}

export interface CreateExtras { acceptanceCriteria?: string; storyPoints?: number | string }

/** The custom-field part of the create payload. */
export function buildCustomFields(c: JiraConfig, x: CreateExtras): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (id: string | undefined, format: JiraFieldFormat | undefined, raw: string | number | undefined) => {
    const fid = id?.trim();
    if (!fid || raw === undefined || String(raw).trim() === '') return;
    const v = fieldValue(format, raw);
    if (v === undefined || (Array.isArray(v) && v.length === 0)) return;
    out[fid] = v;
  };
  put(c.acceptanceCriteriaFieldId, c.acceptanceCriteriaFormat ?? 'text', x.acceptanceCriteria);
  put(c.storyPointsFieldId, c.storyPointsFormat ?? 'number', x.storyPoints ?? c.defaultStoryPoints ?? DEFAULT_STORY_POINTS);
  put(c.scrumTeamFieldId, c.scrumTeamFormat ?? 'option', c.defaultScrumTeam);
  put(c.epicFieldId, c.epicFormat ?? 'text', c.defaultEpic);
  return out;
}

/** Acceptance criteria default: the host's template (<TASK NAME>) or the title. */
export function defaultAcceptanceCriteria(c: Pick<JiraConfig, 'acceptanceCriteriaTemplate'> | null, title: string): string {
  const tpl = c?.acceptanceCriteriaTemplate?.trim();
  return tpl ? tpl.replace(/<task name>/gi, title) : title;
}
export const defaultStoryPoints = (c: Pick<JiraConfig, 'defaultStoryPoints'> | null) => c?.defaultStoryPoints ?? DEFAULT_STORY_POINTS;

// ── Detect: match Jira's field list (GET /rest/api/2/field) by name ──
export interface JiraFieldMeta { id: string; name: string; custom?: boolean; schema?: { type?: string; items?: string; custom?: string } }
export type DetectKey = 'acceptanceCriteria' | 'storyPoints' | 'scrumTeam' | 'epic';
const MATCHERS: Record<DetectKey, RegExp[]> = {
  acceptanceCriteria: [/^acceptance criteria$/i, /acceptance criteri/i],
  storyPoints: [/^story points$/i, /^story point estimate$/i, /story point/i],
  scrumTeam: [/^scrum[ -]?team$/i, /scrum[ -]?team/i, /^team$/i],
  epic: [/^epic link$/i, /^parent link$/i],
};
export function formatOf(f: JiraFieldMeta): JiraFieldFormat {
  const t = f.schema?.type;
  if (t === 'number') return 'number';
  if (t === 'option') return 'option';
  if (t === 'array') return f.schema?.items === 'option' ? 'options' : f.schema?.items === 'string' ? 'labels' : 'text';
  return 'text';   // string, any (epic link, team id), …
}
export function detectFields(fields: JiraFieldMeta[]): Partial<Record<DetectKey, { id: string; name: string; format: JiraFieldFormat }>> {
  const out: Partial<Record<DetectKey, { id: string; name: string; format: JiraFieldFormat }>> = {};
  (Object.keys(MATCHERS) as DetectKey[]).forEach(k => {
    for (const re of MATCHERS[k]) {
      const hit = fields.find(f => f.custom !== false && re.test(f.name.trim()));
      if (hit) { out[k] = { id: hit.id, name: hit.name, format: formatOf(hit) }; break; }
    }
  });
  return out;
}
