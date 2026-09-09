// Archive-fold parity checks (2026-09-10): the old #archive links, the query
// tokens and the row-visibility rules that replaced the Archive view.
// Run: npm run check:archive   (plain node, no test framework needed)
import { parseQuery, setIs, stripText } from '../src/tableQuery.ts';
const known = { requesters: ['Dana Cohen'], projects: ['Billing'] };
const eq = (name: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? 'PASS ' : 'FAIL ') + name, ok ? '' : `\n   got ${JSON.stringify(a)}\n   want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
// the redirect target the App writes for #archive, decoded by the Table's hash reader
const q = new URLSearchParams('q=is%3Aarchived').get('q');
eq('redirect q decodes', q, 'is:archived');
eq('is:archived parses', [...parseQuery(q!, known).is], ['archived']);
eq('is:closed parses', [...parseQuery('is:closed', known).is], ['closedToday']);
eq('archived + mail + requester', (() => { const p = parseQuery('is:archived is:mail requester:"Dana Cohen" refund', known); return [[...p.is], p.requester, p.text]; })(), [['archived', 'mail'], 'Dana Cohen', 'refund']);
eq('setIs round-trips archived', setIs('refund', new Set(['archived', 'closedToday'])), 'refund is:archived is:closed');
eq('stripText keeps qualifiers', stripText('refund requester:"Dana Cohen" is:archived'), 'requester:"Dana Cohen" is:archived');
// App redirect regex
const redirect = (hash: string) => { const task = /^#archive\/task\/([^/?]+)/.exec(hash)?.[1]; return task ? `#table/task/${task}` : '#table?q=is%3Aarchived'; };
eq('#archive', redirect('#archive'), '#table?q=is%3Aarchived');
eq('#archive/task/t123', redirect('#archive/task/t123'), '#table/task/t123');
eq('#archive/task/t123?x=1', redirect('#archive/task/t123?x=1'), '#table/task/t123');
// row-visibility semantics: old Archive (archived && filters) vs new (archivedView world)
type It = { archived?: boolean; kind: string; type?: string; updatedAt: number };
const items: It[] = [
  { archived: true, kind: 'task', type: 'planned', updatedAt: 10 },
  { archived: true, kind: 'task', type: 'mail', updatedAt: 20 },
  { archived: true, kind: 'reminder', updatedAt: 30 },
  { archived: undefined, kind: 'task', type: 'planned', updatedAt: 40 },   // legacy: flag missing
  { archived: false, kind: 'task', type: 'mail', updatedAt: 50 },
  { archived: false, kind: 'getback', updatedAt: 60 },
];
const oldArchive = items.filter(it => !!it.archived);
const newArchived = items.filter(it => { const archivedView = true; if (!!it.archived !== archivedView) return false; if (it.kind === 'getback') return false; const isMail = it.kind === 'task' && it.type === 'mail'; if (isMail && !archivedView) return false; return true; }).sort((a, b) => b.updatedAt - a.updatedAt);
eq('archived world shows exactly what the old Archive showed', newArchived.map(i => i.updatedAt).sort(), oldArchive.map(i => i.updatedAt).sort());
const oldTable = items.filter(it => !it.archived && it.kind !== 'getback' && !(it.kind === 'task' && it.type === 'mail'));
const newActive = items.filter(it => { const archivedView = false; if (!!it.archived !== archivedView) return false; if (it.kind === 'getback') return false; const isMail = it.kind === 'task' && it.type === 'mail'; if (isMail && !archivedView) return false; return true; });
eq('active table unchanged (legacy missing flag = active)', newActive.map(i => i.updatedAt), oldTable.map(i => i.updatedAt));
