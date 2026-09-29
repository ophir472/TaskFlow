// End-to-end: the real page script in a real (headless) Chrome against a mock
// Jira with a strict workflow and a transition screen full of required fields.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { execSync } from 'node:child_process';

const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!CHROME) { console.log('SKIP page test — no Chrome found'); process.exit(0); }
execSync('node build.mjs', { stdio: 'ignore' });
const script = readFileSync('dist/jira-mover.user.js', 'utf8');

const FLOW = ['New', 'To do', 'In progress', 'Done'];
const issue = { key: 'PROJ-1', fields: { summary: 'Fix <b>login</b>', status: { name: 'New' }, issuetype: { name: 'Story' }, cf_ac: null, cf_sp: null, cf_team: null, cf_epic: null, cf_root: null, cf_sev: null, cf_keep: 'mine' } };
const calls = [];
const screenFor = to => to !== 'In progress' ? {} : {
  cf_ac: { required: true, name: 'Acceptance Criteria', schema: { type: 'string' } },
  cf_sp: { required: true, name: 'Story Points', schema: { type: 'number' } },
  cf_team: { required: true, name: 'Scrum-Team', schema: { type: 'option' }, allowedValues: [{ id: '101', value: 'Platform' }] },
  cf_root: { required: true, name: 'Root cause', schema: { type: 'string' } },
  cf_keep: { required: true, name: 'Keep me', schema: { type: 'string' } },
};
const transitions = () => { const i = FLOW.indexOf(issue.fields.status.name); return [FLOW[i - 1], FLOW[i + 1]].filter(Boolean).map(to => ({ id: String(FLOW.indexOf(to) + 1), name: 'Go ' + to, to: { name: to }, fields: screenFor(to) })); };
let report = null, done;
const finished = new Promise(r => { done = r; });

const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="application-name" content="JIRA"></head><body id="jira">
<div class="board"><div class="card" data-issue-key="PROJ-1"><span class="title">PROJ-1 Fix login</span></div></div>
<script>if (sessionStorage.getItem('phase') !== 'after-reload') localStorage.setItem('jira-mover-settings-v1', JSON.stringify({ fields: { acceptance: { id: 'cf_ac' }, points: { id: 'cf_sp' }, team: { id: 'cf_team', value: 'Platform' }, epic: { id: 'cf_epic', value: 'PROJ-12' } }, reloadAfter: true }));</script>
<script>${script.replace(/<\/script>/g, '<\\/script>')}</script>
<script>
(async function () {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error('timeout: ' + what); };
  const pane = () => document.querySelector('[data-jira-mover]');
  const out = { steps: [] };
  try {
    if (sessionStorage.getItem('phase') === 'after-reload') {
      out.afterReload = true; out.paneHiddenOnLoad = pane().style.display === 'none';
      await new Promise(r => setTimeout(r, 300)); const r = pane().getBoundingClientRect(); out.rect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      await fetch('/__report', { method: 'POST', body: JSON.stringify({ reload: out }) }); return;
    }
    out.hiddenBeforeClick = pane().style.display === 'none';
    document.querySelector('.card .title').click();
    const big = await until(() => [...pane().querySelectorAll('button')].find(b => /^Move to In progress$/.test(b.textContent)), 'primary button');
    out.summaryAsText = pane().textContent.includes('Fix <b>login</b>') && !pane().querySelector('b');
    out.steps.push('opened');
    const again = () => until(() => [...pane().querySelectorAll('button')].find(b => /^Move to In progress$/.test(b.textContent) && !b.disabled), 'button again');
    // move + resize the pane before using it
    const bar = pane().querySelector('[data-drag]'), r0 = pane().getBoundingClientRect();
    const fire = (t, type, x, y) => t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
    fire(bar, 'mousedown', r0.left + 40, r0.top + 12); fire(document, 'mousemove', r0.left - 160, r0.top + 112); fire(document, 'mouseup', r0.left - 160, r0.top + 112);
    const r1 = pane().getBoundingClientRect();
    out.dragged = [Math.round(r1.left - r0.left), Math.round(r1.top - r0.top)];
    pane().style.width = '420px'; pane().style.height = '380px';           // what dragging the corner does
    await until(() => { const g = JSON.parse(localStorage.getItem('jira-mover-geom-v1') || 'null'); return g && g.width === 420 && g.height === 380; }, 'size saved');
    fire(bar, 'mousedown', 0, 0); fire(document, 'mousemove', -5000, -5000); fire(document, 'mouseup', -5000, -5000);
    const r2 = pane().getBoundingClientRect(); out.clamped = r2.left >= 0 && r2.top >= 0;
    fire(bar, 'mousedown', r2.left + 40, r2.top + 12); fire(document, 'mousemove', r2.left + 140, r2.top + 72); fire(document, 'mouseup', r2.left + 140, r2.top + 72);
    out.geom = JSON.parse(localStorage.getItem('jira-mover-geom-v1'));
    big.isConnected ? big.click() : (await again()).click();
    const sev = await until(() => pane().querySelector('[data-missing-id="cf_sev"]'), 'asks for Severity');
    out.asked1 = [...pane().querySelectorAll('[data-missing-id]')].map(i => i.getAttribute('data-missing-id'));
    out.sevIsSelect = sev.tagName === 'SELECT' && [...sev.options].map(o => o.value).join() === ',High,Low';
    out.statusWhenAsked1 = (await (await fetch('/rest/api/2/issue/PROJ-1')).json()).fields.status.name;
    sev.value = 'High';
    (await again()).click();
    const inp = await until(() => pane().querySelector('[data-missing-id="cf_root"]'), 'asks for Root cause');
    out.askedOnly = [...pane().querySelectorAll('[data-missing-id]')].map(i => i.getAttribute('data-missing-id'));
    inp.value = 'Config drift';
    sessionStorage.setItem('phase', 'after-reload');
    (await again()).click();
    await until(() => /is now In progress/.test(pane().textContent), 'success line');
    out.remembered = JSON.parse(localStorage.getItem('jira-mover-settings-v1')).extra;
    out.steps.push('moved');
  } catch (e) { out.error = String(e && e.message || e) + ' | pane: ' + (pane() ? pane().textContent.slice(0, 300) : 'none'); }
  await fetch('/__report', { method: 'POST', body: JSON.stringify({ run: out }) });
})();
</script></body></html>`;

const server = http.createServer((req, res) => {
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__report') { report = { ...(report || {}), ...JSON.parse(body) }; send(200, {}); if (report.reload || report.run?.error) done(); return; }
    if (url.pathname.startsWith('/rest/')) calls.push(`${req.method} ${url.pathname.replace('/rest/api/2', '')}${body ? ' ' + body : ''}`);
    if (req.method === 'GET' && url.pathname === '/rest/api/2/issue/PROJ-1') return send(200, { ...issue, editmeta: { fields: { cf_epic: { name: 'Epic Link', schema: { type: 'any' } }, cf_ac: { name: 'Acceptance Criteria', schema: { type: 'string' } }, cf_sp: { name: 'Story Points', schema: { type: 'number' } }, cf_team: { name: 'Scrum-Team', schema: { type: 'option' }, allowedValues: [{ id: '101', value: 'Platform' }] }, cf_root: { name: 'Root cause', schema: { type: 'string' } }, cf_sev: { name: 'Severity', schema: { type: 'option' }, allowedValues: [{ id: '7', value: 'High' }, { id: '8', value: 'Low' }] } } } });
    if (req.method === 'GET' && url.pathname === '/rest/api/2/issue/PROJ-1/transitions') return send(200, { transitions: transitions() });
    if (req.method === 'PUT' && url.pathname === '/rest/api/2/issue/PROJ-1') { Object.assign(issue.fields, JSON.parse(body).fields); return send(204); }
    if (req.method === 'POST' && url.pathname === '/rest/api/2/issue/PROJ-1/transitions') {
      const b = JSON.parse(body); const tr = transitions().find(t => t.id === b.transition.id);
      if (!tr) return send(400, { errorMessages: ['Transition not valid from ' + issue.fields.status.name], errors: {} });
      const after = { ...issue.fields, ...(b.fields || {}) };
      // workflow validator on New → To do: the TICKET must have story points and a severity (neither is on a screen)
      if (tr.to.name === 'To do') { const v = {}; if (after.cf_sp == null) v.cf_sp = 'Story Points is required.'; if (after.cf_sev == null) v.cf_sev = 'Severity is required.'; if (Object.keys(v).length) return send(400, { errorMessages: [], errors: v }); }
      const lacking = Object.entries(tr.fields).filter(([id, m]) => m.required && (after[id] == null || after[id] === ''));
      if (lacking.length) return send(400, { errorMessages: [], errors: Object.fromEntries(lacking.map(([id, m]) => [id, m.name + ' is required'])) });
      Object.assign(issue.fields, b.fields || {}); issue.fields.status = { name: tr.to.name }; return send(204);
    }
    if (url.pathname.startsWith('/browse/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page); }
    send(404, { errorMessages: ['nope'] });
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const chrome = execFile(CHROME, ['--headless=new', '--window-size=1400,900', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=/private/tmp/jira-mover-test-${process.pid}`, '--remote-debugging-port=0', `http://127.0.0.1:${port}/browse/PROJ-1`], () => {});
const timer = setTimeout(() => { report = report || { run: { error: 'no report within 25s' } }; done(); }, 25000);
await finished; clearTimeout(timer); chrome.kill(); server.close();
try { execSync(`rm -rf /private/tmp/jira-mover-test-${process.pid}`); } catch { /* ignore */ }

let fails = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `\n   got  ${JSON.stringify(a)}\n   want ${JSON.stringify(b)}`)); if (!ok) fails++; };
const run = report.run || {};
eq('no error in the browser run', run.error, undefined);
eq('on a ticket page the pane opens by itself; clicking the card keeps it on that ticket', run.steps, ['opened', 'moved']);
eq('ticket title is shown as text, never parsed as HTML', run.summaryAsText, true);
eq('asked only for the one field with no default (not the one already set)', run.askedOnly, ['cf_root']);
eq('ticket ended In progress', issue.fields.status.name, 'In progress');
eq('fields filled from defaults, shaped per field type', [issue.fields.cf_ac, issue.fields.cf_sp, issue.fields.cf_team, issue.fields.cf_root], ['Fix <b>login</b>', 1, { id: '101' }, 'Config drift']);
eq('epic (on no screen) was set on the ticket', issue.fields.cf_epic, 'PROJ-12');
eq('existing value untouched', issue.fields.cf_keep, 'mine');
eq('typed values remembered as defaults', run.remembered, [{ id: 'cf_sev', label: 'Severity', value: 'High' }, { id: 'cf_root', label: 'Root cause', value: 'Config drift' }]);
const posts = calls.filter(c => c.startsWith('POST'));
eq('walked New → To do → In progress', [...new Set(posts.map(p => JSON.parse(p.slice(p.indexOf('{'))).transition.id))], ['2', '3']);
eq('the ticket was FILLED before the first move', (() => { const firstPost = calls.findIndex(c => c.startsWith('POST')); return ['cf_ac', 'cf_sp', 'cf_team', 'cf_epic'].map(id => { const i = calls.findIndex(c => c.startsWith('PUT') && c.includes('"' + id + '"')); return i !== -1 && i < firstPost; }); })(), [true, true, true, true]);
eq('validator refusal (field on no screen) became a question, with Jira\'s own choices', [run.asked1, run.sevIsSelect, run.statusWhenAsked1], [['cf_sev'], true, 'New']);
eq('severity written as Jira\'s option id', issue.fields.cf_sev, { id: '7' });
eq('pane dragged by its title bar', run.dragged, [-200, 100]);
eq('pane can never be dragged off-screen', run.clamped, true);
eq('position and size remembered', [run.geom.width, run.geom.height, report.reload?.rect?.slice(2), report.reload?.rect?.[0] === run.geom.left, report.reload?.rect?.[1] === run.geom.top], [420, 380, [420, 380], true, true]);
eq('page refreshed after the move and the pane reopened on the ticket', [report.reload?.afterReload, report.reload?.paneHiddenOnLoad], [true, false]);
if (fails) { console.log(`${fails} FAILED\ncalls:\n  ${calls.join('\n  ')}`); process.exit(1); }
