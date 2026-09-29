// Jira custom fields + status flow checks (2026-09-29). Run: npm run check:jira
import { nextHop, jiraStatusFor, buildCustomFields, fieldValue, detectFields, defaultAcceptanceCriteria, defaultStoryPoints, statusFlowOf, DEFAULT_STATUS_FLOW } from '../src/jiraFields.ts';
const eq = (name: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? 'PASS ' : 'FAIL ') + name, ok ? '' : `\n   got ${JSON.stringify(a)}\n   want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
const F = DEFAULT_STATUS_FLOW;

// walking the flow: simulate a strict workflow that only offers neighbours
const strict = (cur: string) => { const i = F.findIndex(s => s.toLowerCase() === cur.toLowerCase()); return [F[i - 1], F[i + 1]].filter(Boolean); };
const walk = (from: string, to: string, offer: (c: string) => string[]) => { const path = [from]; let cur = from; for (let n = 0; n < 8; n++) { const h = nextHop(F, cur, to, offer(cur)); if (!h) break; path.push(h); cur = h; } return path; };
eq('New → Done walks every status', walk('New', 'Done', strict), ['New', 'To do', 'In progress', 'Done']);
eq('Done → In progress (reopen) walks back', walk('Done', 'In progress', strict), ['Done', 'In progress']);
eq('Done → New walks all the way back', walk('Done', 'New', strict), ['Done', 'In progress', 'To do', 'New']);
eq('direct transition is taken when offered', walk('New', 'Done', () => ['To do', 'Done']), ['New', 'Done']);
eq('longest legal jump is preferred', walk('New', 'Done', c => c === 'New' ? ['To do', 'In progress'] : strict(c)), ['New', 'In progress', 'Done']);
eq('already there → no hop', nextHop(F, 'in progress', 'In Progress', ['Done']), null);
eq('names compare loosely (case, dashes, underscores)', nextHop(F, 'TO-DO', 'done', ['IN_PROGRESS']), 'IN_PROGRESS');
eq('stuck when Jira offers nothing useful', nextHop(F, 'New', 'Done', ['Cancelled']), null);
eq('ticket outside the flow re-enters at the nearest status', nextHop(F, 'Blocked', 'Done', ['To do', 'In progress']), 'In progress');
eq('unknown target → stuck', nextHop(F, 'New', 'Shipped', ['To do']), null);

// card status → Jira status
eq('default map', ['backlog', 'todo', 'in_progress', 'waiting', 'done'].map(s => jiraStatusFor(null, s)), ['New', 'To do', 'In progress', 'In progress', 'Done']);
eq('host override + blank = leave the ticket', [jiraStatusFor({ statusMap: { waiting: '' } }, 'waiting'), jiraStatusFor({ statusMap: { waiting: '' } }, 'done')], ['', 'Done']);
eq('empty flow falls back to the default', statusFlowOf({ statusFlow: [] }), F);

// create payload
const cfg: any = { acceptanceCriteriaFieldId: 'customfield_1', storyPointsFieldId: 'customfield_2', scrumTeamFieldId: 'customfield_3', defaultScrumTeam: 'Platform', epicFieldId: 'customfield_4', defaultEpic: 'PROJ-12' };
eq('all four fields, default formats', buildCustomFields(cfg, { acceptanceCriteria: 'Fix login' }), { customfield_1: 'Fix login', customfield_2: 1, customfield_3: { value: 'Platform' }, customfield_4: 'PROJ-12' });
eq('story points typed in the prompt win', buildCustomFields(cfg, { acceptanceCriteria: 'x', storyPoints: '3' }).customfield_2, 3);
eq('host default story points', buildCustomFields({ ...cfg, defaultStoryPoints: 5 }, {}).customfield_2, 5);
eq('no field id → nothing sent', buildCustomFields({ defaultScrumTeam: 'Platform', defaultEpic: 'PROJ-12' } as any, { acceptanceCriteria: 'x', storyPoints: 2 }), {});
eq('empty default → field left out', Object.keys(buildCustomFields({ ...cfg, defaultScrumTeam: ' ', defaultEpic: '' }, { acceptanceCriteria: 'x' })), ['customfield_1', 'customfield_2']);
eq('non-numeric story points are dropped, not sent as NaN', buildCustomFields(cfg, { storyPoints: 'abc' }).customfield_2, undefined);
eq('formats', [fieldValue('option', 'A'), fieldValue('options', 'A, B'), fieldValue('id', '42'), fieldValue('labels', 'a b,c'), fieldValue('number', '0.5')], [{ value: 'A' }, [{ value: 'A' }, { value: 'B' }], { id: '42' }, ['a', 'b', 'c'], 0.5]);
eq('acceptance criteria default = title, or the template', [defaultAcceptanceCriteria(null, 'Fix login'), defaultAcceptanceCriteria({ acceptanceCriteriaTemplate: 'Done when <TASK NAME> works' }, 'Fix login')], ['Fix login', 'Done when Fix login works']);
eq('story points default = 1', [defaultStoryPoints(null), defaultStoryPoints({ defaultStoryPoints: 0 })], [1, 0]);

// detect
const fields = [
  { id: 'summary', name: 'Summary', custom: false, schema: { type: 'string' } },
  { id: 'customfield_10002', name: 'Story Points', custom: true, schema: { type: 'number' } },
  { id: 'customfield_10101', name: 'Epic Link', custom: true, schema: { type: 'any', custom: 'com.pyxis.greenhopper.jira:gh-epic-link' } },
  { id: 'customfield_11200', name: 'Acceptance Criteria', custom: true, schema: { type: 'string' } },
  { id: 'customfield_11300', name: 'Scrum-Team', custom: true, schema: { type: 'option' } },
  { id: 'customfield_11301', name: 'Team Lead', custom: true, schema: { type: 'user' } },
];
eq('detect by name + value type', detectFields(fields), {
  acceptanceCriteria: { id: 'customfield_11200', name: 'Acceptance Criteria', format: 'text' },
  storyPoints: { id: 'customfield_10002', name: 'Story Points', format: 'number' },
  scrumTeam: { id: 'customfield_11300', name: 'Scrum-Team', format: 'option' },
  epic: { id: 'customfield_10101', name: 'Epic Link', format: 'text' },
});
eq('detect: nothing matching → empty', detectFields([{ id: 'x', name: 'Team Lead', custom: true }]), {});
