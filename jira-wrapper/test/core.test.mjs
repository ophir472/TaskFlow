import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
// core.js is a plain script (it must run as-is in the page); load it as CommonJS.
const m = { exports: {} };
new Function('module', readFileSync(new URL('../src/core.js', import.meta.url), 'utf8'))(m);
const C = m.exports; void require;
let fails = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `\n   got  ${JSON.stringify(a)}\n   want ${JSON.stringify(b)}`)); if (!ok) fails++; };
const F = C.DEFAULT_SETTINGS.flow;
const strict = cur => { const i = F.findIndex(s => C.same(s, cur)); return [F[i - 1], F[i + 1]].filter(Boolean); };
const walk = (from, to, offer) => { const p = [from]; let c = from; for (let n = 0; n < 8; n++) { const h = C.nextHop(F, c, to, offer(c)); if (!h) break; p.push(h); c = h; } return p; };

eq('New → In progress walks through To do', walk('New', 'In progress', strict), ['New', 'To do', 'In progress']);
eq('New → Done walks every status', walk('New', 'Done', strict), ['New', 'To do', 'In progress', 'Done']);
eq('Done → In progress (reopen)', walk('Done', 'In progress', strict), ['Done', 'In progress']);
eq('direct hop taken when Jira offers it', walk('New', 'In progress', () => ['To do', 'In Progress']), ['New', 'In Progress']);
eq('names compare loosely', C.nextHop(F, 'TO-DO', 'in progress', ['IN_PROGRESS']), 'IN_PROGRESS');
eq('stuck when nothing useful is offered', C.nextHop(F, 'New', 'In progress', ['Cancelled']), null);
eq('ticket outside the flow re-enters', C.nextHop(F, 'Blocked', 'In progress', ['To do']), 'To do');

const settings = C.mergeSettings({ fields: { acceptance: { id: 'cf_ac' }, points: { id: 'cf_sp' }, team: { id: 'cf_team', value: 'Platform' }, epic: { id: 'cf_epic', value: 'PROJ-12' } }, extra: [{ id: 'cf_env', label: 'Environment', value: 'Prod' }] });
const issue = { summary: 'Fix login' };
eq('defaults: title template, story points 1', C.defaultsFor(settings, issue), { cf_ac: { label: 'Acceptance criteria', raw: 'Fix login' }, cf_sp: { label: 'Story points', raw: '1' }, cf_team: { label: 'Scrum team', raw: 'Platform' }, cf_epic: { label: 'Epic', raw: 'PROJ-12' }, cf_env: { label: 'Environment', raw: 'Prod' } });

const screen = {
  cf_ac: { required: true, name: 'Acceptance Criteria', schema: { type: 'string' } },
  cf_sp: { required: true, name: 'Story Points', schema: { type: 'number' } },
  cf_team: { required: true, name: 'Scrum-Team', schema: { type: 'option' }, allowedValues: [{ id: '101', value: 'Platform' }, { id: '102', value: 'Payments' }] },
  cf_root: { required: true, name: 'Root cause', schema: { type: 'string' } },
  assignee: { required: false, name: 'Assignee', schema: { type: 'user' } },
  resolution: { required: true, hasDefaultValue: true, name: 'Resolution', schema: { type: 'resolution' } },
};
let plan = C.planHop(settings, issue, screen, {}, null);
eq('fills the screen fields from defaults, typed per Jira', plan.send, { cf_ac: 'Fix login', cf_sp: 1, cf_team: { id: '101' } });
eq('asks only for the required field with no default', plan.missing.map(x => x.id), ['cf_root']);
eq('a required field with a server default is not asked', plan.missing.some(x => x.id === 'resolution'), false);
plan = C.planHop(settings, issue, screen, { cf_ac: 'Already written', cf_sp: 5, cf_root: 'x' }, null);
eq('never overwrites what is set', plan.send, { cf_team: { id: '101' } });
eq('…and then nothing is missing', plan.missing, []);
plan = C.planHop({ ...settings, overwrite: true }, issue, screen, { cf_sp: 5, cf_root: 'x' }, null);
eq('overwrite on: defaults replace existing values', plan.send.cf_sp, 1);
plan = C.planHop(settings, issue, screen, {}, { cf_root: 'Config drift', cf_sp: '3' });
eq('what you type in the pane wins and completes the move', [plan.send.cf_root, plan.send.cf_sp, plan.missing], ['Config drift', 3, []]);
eq('fields not on the screen are not sent in the transition', 'cf_epic' in plan.send || 'cf_env' in plan.send, false);

eq('off-screen defaults go on the ticket, empty ones only', C.planEdit(settings, issue, { cf_env: 'Test' }, { cf_epic: { schema: { type: 'any' } }, cf_env: { schema: { type: 'option' } } }, { cf_ac: true, cf_sp: true, cf_team: true }), { cf_epic: 'PROJ-12' });
eq('a field the ticket type cannot edit is skipped', C.planEdit(settings, issue, {}, { cf_env: { schema: { type: 'option' } } }, { cf_ac: true, cf_sp: true, cf_team: true }), { cf_env: { value: 'Prod' } });

eq('shape: option by value, multi, labels, user, number, junk number', [C.shape('B', { schema: { type: 'option' } }), C.shape('A, B', { schema: { type: 'array', items: 'option' } }), C.shape('a b', { schema: { type: 'array', items: 'string' } }), C.shape('jsmith', { schema: { type: 'user' } }), C.shape('0.5', { schema: { type: 'number' } }), C.shape('abc', { schema: { type: 'number' } })], [{ value: 'B' }, [{ value: 'A' }, { value: 'B' }], ['a', 'b'], { name: 'jsmith' }, 0.5, null]);
eq('detect by name', C.detect([{ id: 'summary', name: 'Summary', custom: false }, { id: 'customfield_1', name: 'Story Points', custom: true }, { id: 'customfield_2', name: 'Epic Link', custom: true }, { id: 'customfield_3', name: 'Acceptance Criteria', custom: true }, { id: 'customfield_4', name: 'Scrum-Team', custom: true }, { id: 'customfield_5', name: 'Team Lead', custom: true }]), { acceptance: { id: 'customfield_3', name: 'Acceptance Criteria' }, points: { id: 'customfield_1', name: 'Story Points' }, team: { id: 'customfield_4', name: 'Scrum-Team' }, epic: { id: 'customfield_2', name: 'Epic Link' } });
eq('ticket key from links', ['/browse/PROJ-123', '/jira/browse/C123456-6789?x=1', 'RapidBoard.jspa?rapidView=4&selectedIssue=AB_C-9', '/browse/', 'notakey-1', ' PROJ-7'].map(C.issueKeyFrom), ['PROJ-123', 'C123456-6789', 'AB_C-9', null, null, 'PROJ-7']);
eq('settings survive junk', [C.mergeSettings('x').primary, C.mergeSettings({ flow: ['A'] }).flow, C.mergeSettings({ flow: ['A', 'B'], extra: [{}, { id: 'cf' }] }).extra], ['In progress', F, [{ id: 'cf', label: 'cf', value: '' }]]);
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
