// The Table's query language — Kibana-style. The search string IS the
// filter state: `status:waiting requester:"Dana Cohen" is:nojira jira`.
// Qualifier tokens set filters; everything else is free text that searches
// the rows. The string round-trips to the URL (#table?q=…) so any filtered
// view is a link.

export const IS_KEYS: Record<string, string> = {
  nojira: 'nojira', mail: 'mail', created: 'createdToday', updated: 'updatedToday', untagged: 'untagged', today: 'forToday',
};
const IS_TOKEN: Record<string, string> = Object.fromEntries(Object.entries(IS_KEYS).map(([k, v]) => [v, k]));

const KINDS = ['planned', 'urgent', 'quick', 'untyped'];
const STATUSES = ['backlog', 'todo', 'in_progress', 'waiting', 'done'];
const TAGS: Record<string, string> = { urgent: 'urgent', important: 'important', quick: 'quick', none: 'noTag', notag: 'noTag' };
const ITEMS = ['task', 'reminder'];

export interface ParsedQuery {
  text: string;
  kind: string; status: string; tag: string; item: string;
  requester: string; project: string; score: string;
  is: Set<string>;
}

export interface Known { requesters: string[]; projects: string[] }

const TOKEN = /(\w+):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/g;

/** Parse; unknown/partial qualifier values are ignored (so typing
 *  `status:wai` doesn't blank the table) — they simply count as nothing. */
export function parseQuery(q: string, known: Known): ParsedQuery {
  const out: ParsedQuery = { text: '', kind: '', status: '', tag: '', item: '', requester: '', project: '', score: '', is: new Set() };
  const words: string[] = [];
  for (const m of q.matchAll(TOKEN)) {
    const field = m[1]?.toLowerCase();
    if (field) {
      const raw = (m[2] ?? m[3] ?? '').trim();
      const v = raw.toLowerCase();
      const findKnown = (list: string[]) => list.find(x => x.toLowerCase() === v) ?? '';
      switch (field) {
        case 'kind': if (KINDS.includes(v)) out.kind = v; break;
        case 'status': { const s = v.replace(/[\s-]+/g, '_'); if (STATUSES.includes(s)) out.status = s; break; }
        case 'tag': if (TAGS[v]) out.tag = TAGS[v]; break;
        case 'item': if (ITEMS.includes(v)) out.item = v; break;
        case 'requester': out.requester = findKnown(known.requesters) || raw; break;
        case 'project': out.project = findKnown(known.projects) || raw; break;
        case 'score': if (/^\d+$/.test(v)) out.score = v; break;
        case 'is': if (IS_KEYS[v]) out.is.add(IS_KEYS[v]); break;
        default: words.push(m[0]);
      }
    } else words.push(m[4] ?? m[5] ?? '');
  }
  out.text = words.join(' ').trim();
  return out;
}

const quote = (v: string) => /\s/.test(v) ? `"${v}"` : v;

/** Replace every `field:…` token with one `field:value` (or drop it). The
 *  new token goes at the end; free text keeps its place. */
export function setField(q: string, field: string, value: string | null): string {
  const re = new RegExp(`(^|\\s)${field}:(?:"[^"]*"|\\S+)`, 'gi');
  const rest = q.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!value) return rest;
  const v = field === 'status' ? value.replace(/_/g, ' ') : field === 'tag' && value === 'noTag' ? 'none' : value;
  return `${rest} ${field}:${quote(v)}`.trim();
}

/** Rewrite the `is:` tokens to exactly the given set of internal keys. */
export function setIs(q: string, keys: Set<string>): string {
  const rest = q.replace(/(^|\s)is:(?:"[^"]*"|\S+)/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  const toks = [...keys].map(k => IS_TOKEN[k]).filter(Boolean).map(t => `is:${t}`);
  return [rest, ...toks].filter(Boolean).join(' ');
}

/** Drop the free-text words, keep every `field:value` qualifier as typed. */
export function stripText(q: string): string {
  const keep: string[] = [];
  for (const m of q.matchAll(TOKEN)) if (m[1]) keep.push(m[0]);
  return keep.join(' ');
}
