// Docs markup parser checks (2026-09-10): nesting, leaf to-do keys, toggles,
// code fences, tables, callouts, inline tokens. Run: npm run check:docs
import { parseDoc, leafCheckKeys, tokenizeInline, parseFlat } from '../src/docBlocks.ts';
const eq = (name: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? 'PASS ' : 'FAIL ') + name, ok ? '' : `\n   got ${JSON.stringify(a)}\n   want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

const page = `# Morning
- [ ] Coffee
- [ ] Inbox
  - [x] Mail
  - [ ] Slack
- [ ] Coffee

▸ Details
  hidden line
  - [ ] inside toggle
!! ⚠️ Careful
\`\`\`sh
echo hi
\`\`\`
| A | B |
| --- | --- |
| 1 | 2 |
> quote
---`;
const blocks = parseDoc(page);
eq('top-level kinds (same-depth blocks are siblings, not children)', blocks.filter(b => b.t !== 'blank').map(b => b.t), ['heading','check','check','check','toggle','callout','code','table','quote','divider']);
const h = blocks[0];
eq('heading owns nothing (same depth)', h.children.length, 0);
const flat = parseFlat(page);
eq('flat kinds', flat.filter(f => f.t !== 'blank').map(f => f.t), ['heading','check','check','check','check','check','toggle','para','check','callout','code','table','quote','divider']);
eq('inbox has 2 to-do children', (parseDoc(page).find(b => b.t === 'check' && b.text === 'Inbox') as any)?.children.length, 2);
eq('leaf keys (parent excluded, duplicate suffixed)', leafCheckKeys(page), ['coffee', 'mail', 'slack', 'coffee#2', 'inside toggle']);
const toggle = parseDoc(page).find(b => b.t === 'toggle') as any;
eq('toggle body = 2 blocks', toggle.children.map((c: any) => c.t), ['para', 'check']);
const callout = flat.find(f => f.t === 'callout') as any;
eq('callout icon from leading emoji', [callout.icon, callout.text], ['⚠️', 'Careful']);
const code = flat.find(f => f.t === 'code') as any;
eq('code fence', [code.lang, code.code], ['sh', 'echo hi']);
const table = flat.find(f => f.t === 'table') as any;
eq('table header + rows', [table.header, table.rows], [true, [['A','B'],['1','2']]]);
eq('inline tokens', tokenizeInline('a **b** *i* ~~s~~ `c` [[Page]] [x](https://x.y) https://z.w end').map(t => t.t), ['text','b','text','i','text','s','text','code','text','ref','text','url','text','url','text']);
eq('inline: no italics inside words', tokenizeInline('snake_case_name').map(t => t.t), ['text']);
eq('empty page → no keys', leafCheckKeys(''), []);
