// Builds the two ways to run Jira Mover from the same source:
//   dist/jira-mover.user.js  — userscript (Tampermonkey / Violentmonkey)
//   dist/install.html        — a page with the bookmark to drag to the bar
//   dist/bookmarklet.txt     — the same bookmark as text
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const core = readFileSync('src/core.js', 'utf8').replace(/\nif \(typeof module[^\n]*\n?$/, '\n');
const page = readFileSync('src/page.js', 'utf8');
mkdirSync('dist', { recursive: true });

const header = `// ==UserScript==
// @name         Jira Mover
// @namespace    jira-mover
// @version      ${pkg.version}
// @description  Click a ticket, move it to In progress in one click — required fields filled from your defaults
// @match        *://*/browse/*
// @match        *://*/secure/*
// @match        *://*/projects/*
// @match        *://*/issues/*
// @match        *://*/*/browse/*
// @match        *://*/*/secure/*
// @match        *://*/*/projects/*
// @match        *://*/*/issues/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
`;
// Only ever wake up on a Jira page.
const guard = `if (!(document.querySelector('meta[name="application-name"][content="JIRA"]') || (window.AJS && window.JIRA) || document.body.id === 'jira')) return;`;
writeFileSync('dist/jira-mover.user.js', `${header}(function () {\n${guard}\nwindow.__jiraMoverAuto = true;\n${core}\n${page}\n})();\n`);

const strip = src => src.split('\n').map(l => l.replace(/^\s*\/\/.*$/, '').replace(/\s+$/, '')).filter(l => l.trim()).join('\n');
const bookmarklet = 'javascript:' + encodeURIComponent(`(function(){${strip(core)}\n${strip(page)}\n})();`);
writeFileSync('dist/bookmarklet.txt', bookmarklet + '\n');
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
writeFileSync('dist/install.html', `<!doctype html><meta charset="utf-8"><title>Install Jira Mover</title>
<style>body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:680px;margin:48px auto;padding:0 20px;color:#172b4d}
a.bm{display:inline-block;padding:10px 18px;border-radius:8px;background:#0052cc;color:#fff;font-weight:700;text-decoration:none;cursor:grab}
code{background:#f4f5f7;padding:1px 5px;border-radius:4px}h1{font-size:22px}li{margin:6px 0}</style>
<h1>Jira Mover ${esc(pkg.version)}</h1>
<p>Drag this button to your bookmarks bar (show the bar with <code>Cmd/Ctrl+Shift+B</code>):</p>
<p><a class="bm" href="${esc(bookmarklet)}">Jira Mover</a></p>
<ol>
<li>Open Jira (a board, a filter or a ticket) and click the <b>Jira Mover</b> bookmark.</li>
<li>First time: press <b>⚙</b> in the pane, then <b>Detect</b>, and type your default scrum team and epic.</li>
<li>Click any ticket on the page. The pane shows it. Press <b>Move to In progress</b>.</li>
</ol>
<p>Keys: <code>Alt+I</code> move to In progress · <code>Alt+J</code> show/hide · <code>Esc</code> close.</p>
<p>It runs inside your logged-in Jira tab and talks only to that Jira. Settings stay in that browser.</p>
`);
console.log(`built ${pkg.version}: userscript ${readFileSync('dist/jira-mover.user.js').length} bytes, bookmarklet ${bookmarklet.length} chars`);
