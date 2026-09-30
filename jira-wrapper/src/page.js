// Jira Mover — the part that lives in the Jira page: the pane, the settings
// panel and the calls to Jira's own REST API. It runs INSIDE your logged-in
// Jira tab, so it uses your session — no token, nothing leaves Jira.
//
// Click any ticket (board card, list row, link) → the pane opens for it.
// Alt+J toggles the pane · Alt+I moves the ticket to the primary status
// (In progress) · Esc closes.
(function () {
  'use strict';
  var C = JiraMoverCore;
  if (window.__jiraMover) { window.__jiraMover.toggle(true); return; }

  var STORE = 'jira-mover-settings-v1';
  // Installed as a userscript it runs on every Jira page and survives a
  // refresh; run from the bookmark it lives until the page reloads.
  var AUTO = !!window.__jiraMoverAuto;
  var base = (function () {
    // Jira may live under a context path (https://host/jira). AJS knows it.
    try { if (window.AJS && typeof window.AJS.contextPath === 'function') return location.origin + window.AJS.contextPath(); } catch (e) { /* ignore */ }
    var m = /^(\/[^\/]+)\/(browse|secure|projects|issues)\//.exec(location.pathname);
    return location.origin + (m ? m[1] : '');
  })();

  function load() { try { return C.mergeSettings(JSON.parse(localStorage.getItem(STORE) || 'null')); } catch (e) { return C.mergeSettings(null); } }
  function save(s) { localStorage.setItem(STORE, JSON.stringify(s)); settings = C.mergeSettings(s); }
  var settings = load();

  // ── Jira REST (same origin, your session) ──
  function api(method, path, body) {
    return fetch(base + '/rest/api/2' + path, {
      method: method, credentials: 'same-origin',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Atlassian-Token': 'no-check' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
        if (!res.ok) {
          var msg = 'HTTP ' + res.status;
          if (data && data.errorMessages && data.errorMessages.length) msg = data.errorMessages.join('; ');
          else if (data && data.errors && Object.keys(data.errors).length) msg = Object.keys(data.errors).map(function (k) { return k + ': ' + data.errors[k]; }).join('; ');
          else if (res.status === 401) msg = 'Not logged in to Jira in this tab';
          var err = new Error(msg); err.fieldErrors = (data && data.errors) || null; throw err;
        }
        return data;
      });
    });
  }
  function getIssue(key) {
    return api('GET', '/issue/' + encodeURIComponent(key) + '?expand=editmeta').then(function (d) {
      var f = d.fields || {};
      return { key: d.key, summary: f.summary || '', status: (f.status && f.status.name) || '', type: (f.issuetype && f.issuetype.name) || '', values: f, editmeta: (d.editmeta && d.editmeta.fields) || null };
    });
  }
  function getTransitions(key) {
    return api('GET', '/issue/' + encodeURIComponent(key) + '/transitions?expand=transitions.fields').then(function (d) { return d.transitions || []; });
  }

  // ── the move: walk the flow hop by hop, filling what each screen demands ──
  // Resolves { status, filled[], hops[] } or rejects; when a required field
  // has no value and no default it rejects with err.missing so the pane asks.
  // Order matters: FILL the ticket first, THEN walk. Jira's workflow checks
  // the ticket's fields on every hop, so New → To do → In progress only goes
  // through once the ticket is complete.
  function move(key, target, typed, log) {
    var hops = [], filledAll = [];
    function putEach(edit) {
      // One field per call: a field this ticket type refuses must not block the others.
      return Object.keys(edit).reduce(function (p, id) {
        return p.then(function () {
          var one = {}; one[id] = edit[id];
          return api('PUT', '/issue/' + encodeURIComponent(key), { fields: one })
            .then(function () { filledAll.push(labelOf(id)); })
            .catch(function () { /* not editable here — its transition screen will carry it */ });
        });
      }, Promise.resolve());
    }
    function fill() {
      return getIssue(key).then(function (issue) {
        if (C.same(issue.status, target)) return;
        var edit = C.planEdit(settings, issue, issue.values, issue.editmeta, null, typed);
        if (!Object.keys(edit).length) return;
        return putEach(edit).then(function () { if (filledAll.length) log('Filled: ' + filledAll.join(', ')); });
      });
    }
    function step(guard) {
      return getIssue(key).then(function (issue) {
        if (C.same(issue.status, target)) return { status: issue.status, filled: filledAll, hops: hops };
        if (guard <= 0) throw new Error('Stopped at "' + issue.status + '" before reaching "' + target + '"');
        return getTransitions(key).then(function (trs) {
          var offered = trs.map(function (t) { return (t.to && t.to.name) || ''; }).filter(Boolean);
          var flow = C.flowFor(settings, issue.type);
          var next = C.nextHop(flow, issue.status, target, offered);
          if (!next) throw new Error('Jira offers no way from "' + issue.status + '" toward "' + target + '" (offered: ' + (offered.join(', ') || 'none') + ')');
          var tr = trs.filter(function (t) { return C.same(t.to && t.to.name, next); })[0];
          var plan = C.planHop(settings, issue, tr.fields || {}, issue.values, typed);
          if (plan.missing.length) { var e = new Error('“' + next + '” needs: ' + plan.missing.map(function (m) { return m.label; }).join(', ')); e.missing = plan.missing; e.at = next; throw e; }
          log(issue.status + ' → ' + next + (plan.filled.length ? '  (with: ' + plan.filled.join(', ') + ')' : ''));
          var body = { transition: { id: tr.id } };
          if (Object.keys(plan.send).length) body.fields = plan.send;
          return api('POST', '/issue/' + encodeURIComponent(key) + '/transitions', body).then(function () {
            hops.push(next); filledAll = filledAll.concat(plan.filled);
            return step(guard - 1);
          }, function (err) {
            // Jira refused because of fields (a validator): ask for exactly those.
            if (err.fieldErrors && Object.keys(err.fieldErrors).length) {
              var m = C.missingFromErrors(err.fieldErrors, tr.fields, issue.editmeta);
              var e2 = new Error('“' + next + '” needs: ' + m.map(function (x) { return x.label; }).join(', ')); e2.missing = m; e2.at = next; throw e2;
            }
            throw err;
          });
        });
      });
    }
    return fill().then(function () { return step(settings.flow.length + 4); });
  }
  function labelOf(id) {
    var f = settings.fields, k;
    for (k in f) if (f[k].id === id) return f[k].label;
    for (k = 0; k < settings.extra.length; k++) if (settings.extra[k].id === id) return settings.extra[k].label;
    return id;
  }

  // ── DOM helpers (textContent only — ticket text is never parsed as HTML) ──
  function el(tag, style, text, attrs) {
    var n = document.createElement(tag);
    if (style) n.style.cssText = style;
    if (text != null) n.textContent = text;
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'onclick') n.addEventListener('click', attrs[k]); else n.setAttribute(k, attrs[k]); });
    return n;
  }
  var FONT = 'font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
  var BTN = FONT + 'border:1px solid #c1c7d0;background:#fff;color:#172b4d;border-radius:6px;padding:7px 10px;cursor:pointer;font-weight:600;';
  var INP = FONT + 'width:100%;box-sizing:border-box;border:1px solid #c1c7d0;border-radius:6px;padding:6px 8px;background:#fafbfc;color:#172b4d;';
  var LBL = 'font-size:11px;font-weight:700;color:#6b778c;text-transform:uppercase;letter-spacing:.04em;margin:10px 0 4px;';

  // The pane can be dragged by its title bar and resized from its bottom-right
  // corner; where you leave it is remembered (double-click the title to reset).
  var GEOM = 'jira-mover-geom-v1', MIN_W = 260, MIN_H = 160;
  var pane = el('div', FONT + 'position:fixed;box-sizing:border-box;min-width:' + MIN_W + 'px;min-height:' + MIN_H + 'px;max-width:calc(100vw - 8px);max-height:calc(100vh - 8px);overflow:auto;resize:both;z-index:2147483000;background:#fff;color:#172b4d;border:1px solid #c1c7d0;border-radius:12px;box-shadow:0 12px 40px rgba(9,30,66,.28);padding:14px 16px;display:none;');
  pane.setAttribute('data-jira-mover', '1');
  document.body.appendChild(pane);

  function defaultGeom() { return { left: Math.max(8, window.innerWidth - 330 - 16), top: 64, width: 330, height: 0 }; }
  function readGeom() { try { var g = JSON.parse(localStorage.getItem(GEOM) || 'null'); if (g && isFinite(g.left) && isFinite(g.top) && isFinite(g.width)) return g; } catch (e) { /* ignore */ } return defaultGeom(); }
  function applyGeom(g) {
    // Always keep the whole pane reachable, whatever the window became.
    var w = Math.max(MIN_W, Math.min(g.width || 330, window.innerWidth - 8));
    var h = g.height ? Math.max(MIN_H, Math.min(g.height, window.innerHeight - 8)) : 0;
    var left = Math.max(4, Math.min(g.left, window.innerWidth - w - 4));
    var top = Math.max(4, Math.min(g.top, window.innerHeight - (h || MIN_H) - 4));
    pane.style.left = left + 'px'; pane.style.top = top + 'px'; pane.style.width = w + 'px';
    pane.style.height = h ? h + 'px' : 'auto';
  }
  var geom = readGeom(), geomReady = false;
  function saveGeom() { try { localStorage.setItem(GEOM, JSON.stringify(geom)); } catch (e) { /* ignore */ } }
  applyGeom(geom);
  window.addEventListener('resize', function () { applyGeom(geom); });
  if (window.ResizeObserver) new ResizeObserver(function () {
    if (!geomReady || pane.style.display === 'none') return;
    var r = pane.getBoundingClientRect();
    // Only a real drag of the corner sets an explicit size (the browser writes inline width/height).
    var w = Math.round(r.width), h = pane.style.height && pane.style.height !== 'auto' ? Math.round(r.height) : 0;
    if (w !== geom.width || h !== geom.height) { geom.width = w; geom.height = h; saveGeom(); }
  }).observe(pane);
  var drag = null;
  document.addEventListener('mousemove', function (e) {
    if (!drag) return;
    e.preventDefault();
    geom.left = drag.left + (e.clientX - drag.x); geom.top = drag.top + (e.clientY - drag.y);
    applyGeom(geom);
  }, true);
  document.addEventListener('mouseup', function () {
    if (!drag) return;
    drag = null; document.body.style.userSelect = '';
    var r = pane.getBoundingClientRect(); geom.left = Math.round(r.left); geom.top = Math.round(r.top); saveGeom();
  }, true);

  var state = { key: null, issue: null, busy: false, log: [], missing: null, pendingTarget: null, view: 'ticket', loadErr: null, draft: {} };

  function show(on) { pane.style.display = on ? 'block' : 'none'; if (on) { applyGeom(geom); render(); setTimeout(function () { geomReady = true; }, 0); } }
  function visible() { return pane.style.display !== 'none'; }

  function open(key) {
    if (!key) return;
    settings = load();   // another Jira tab may have changed them
    if (state.key !== key) { state.key = key; state.issue = null; state.log = []; state.missing = null; state.pendingTarget = null; state.loadErr = null; state.draft = {}; }
    state.view = 'ticket';
    show(true);
    refresh();
  }
  function refresh() {
    if (!state.key) return;
    var key = state.key;
    getIssue(key).then(function (i) { if (state.key === key) { state.issue = i; state.loadErr = null; render(); } })
      .catch(function (e) { if (state.key === key) { state.loadErr = e.message; render(); } });
  }
  function addLog(text, kind) { state.log.push({ text: text, kind: kind || 'info' }); if (visible()) render(); }

  function run(target) {
    if (state.busy || !state.key) return;
    settings = load();
    var typed = {};
    // Field inputs on the main screen: only what you changed counts as typed
    // (the rest are defaults, filled the normal way — empty fields only).
    Object.keys(state.draft).forEach(function (id) { if (String(state.draft[id]).trim()) typed[id] = String(state.draft[id]).trim(); });
    Array.prototype.forEach.call(pane.querySelectorAll('[data-missing-id]'), function (inp) {
      if (inp.value.trim()) typed[inp.getAttribute('data-missing-id')] = inp.value.trim();
    });
    var remember = pane.querySelector('[data-remember]');
    if (remember && remember.checked) {
      var s = load();
      Object.keys(typed).forEach(function (id) {
        var m = (state.missing || []).filter(function (x) { return x.id === id; })[0];
        var known = Object.keys(s.fields).filter(function (k) { return s.fields[k].id === id; })[0];
        if (known) s.fields[known].value = typed[id];
        else { s.extra = s.extra.filter(function (e) { return e.id !== id; }); s.extra.push({ id: id, label: (m && m.label) || id, value: typed[id], show: true }); }
      });
      save(s);
    }
    state.busy = true; state.missing = null; state.pendingTarget = target; state.log = [];
    render();
    move(state.key, target, typed, addLog).then(function (r) {
      state.busy = false; state.pendingTarget = null; state.draft = {};
      addLog('✓ ' + state.key + ' is now ' + r.status + (r.hops.length > 1 ? '  (' + r.hops.length + ' hops)' : ''), 'ok');
      refresh();
      if (r.hops.length && settings.reloadAfter && AUTO) { addLog('Refreshing the page…'); setTimeout(function () { location.reload(); }, 900); }
      else if (r.hops.length) addLog('Refresh the page to see it in Jira' + (AUTO ? '' : ' (then click the bookmark again)'));
    }).catch(function (e) {
      state.busy = false;
      if (e.missing) { state.missing = e.missing; addLog(e.message + ' — fill below and press the button again', 'warn'); }
      else { state.pendingTarget = null; addLog('✗ ' + e.message, 'err'); }
      refresh();
    });
  }

  function header(title) {
    var h = el('div', 'display:flex;align-items:center;gap:8px;margin:-14px -16px 8px;padding:10px 16px 8px;cursor:move;user-select:none;border-bottom:1px solid #ebecf0;background:#f4f5f7;border-radius:12px 12px 0 0;position:sticky;top:-14px;z-index:1;');
    h.title = 'Drag to move · drag the bottom-right corner to resize · double-click to reset';
    h.setAttribute('data-drag', '1');
    h.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || (e.target !== h && e.target.getAttribute('data-title') !== '1')) return;   // not on ⚙ / ×
      var r = pane.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
      document.body.style.userSelect = 'none'; e.preventDefault();
    });
    h.addEventListener('dblclick', function (e) { if (e.target !== h && e.target.getAttribute('data-title') !== '1') return; geom = defaultGeom(); saveGeom(); applyGeom(geom); });
    h.appendChild(el('span', 'color:#97a0af;font-size:12px;letter-spacing:-2px;pointer-events:none;', '⋮⋮'));
    h.appendChild(el('div', 'font-weight:800;font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', title, { 'data-title': '1' }));
    h.appendChild(el('span', 'cursor:pointer;color:#6b778c;font-size:15px;', state.view === 'settings' ? '←' : '⚙', { title: state.view === 'settings' ? 'Back to the ticket' : 'Settings', onclick: function () { state.view = state.view === 'settings' ? 'ticket' : 'settings'; render(); } }));
    h.appendChild(el('span', 'cursor:pointer;color:#6b778c;font-size:18px;line-height:1;', '×', { title: 'Close (Esc)', onclick: function () { show(false); } }));
    return h;
  }

  function render() {
    while (pane.firstChild) pane.removeChild(pane.firstChild);
    if (state.view === 'settings') return renderSettings();
    pane.appendChild(header(state.key || 'Jira Mover'));
    if (!state.key) { pane.appendChild(el('div', 'color:#6b778c;', 'Click a ticket on the page — a board card, a row or a ticket link — and it opens here.')); return; }
    if (state.loadErr) { pane.appendChild(el('div', 'color:#bf2600;', state.loadErr)); return; }
    if (!state.issue) { pane.appendChild(el('div', 'color:#6b778c;', 'Loading…')); return; }
    var i = state.issue;
    pane.appendChild(el('div', 'font-weight:600;margin-bottom:6px;', i.summary));
    var st = el('div', 'display:flex;align-items:center;gap:8px;margin-bottom:12px;');
    st.appendChild(el('span', 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:10px;background:#deebff;color:#0747a6;', i.status));
    if (i.type) st.appendChild(el('span', 'font-size:12px;color:#6b778c;', i.type));
    pane.appendChild(st);

    // required fields the last attempt could not fill
    if (state.missing && state.missing.length) {
      var box = el('div', 'border:1px solid #ffab00;background:#fffae6;border-radius:8px;padding:10px;margin-bottom:12px;');
      box.appendChild(el('div', 'font-weight:700;margin-bottom:2px;', 'Jira requires these to move on'));
      state.missing.forEach(function (m) {
        box.appendChild(el('div', LBL, m.label));
        var inp;
        if (m.allowed && m.allowed.length) {
          inp = el('select', INP);
          inp.appendChild(el('option', null, '— choose —', { value: '' }));
          m.allowed.forEach(function (a) { inp.appendChild(el('option', null, a, { value: a })); });
        } else inp = el('input', INP);
        inp.setAttribute('data-missing-id', m.id);
        box.appendChild(inp);
      });
      var rl = el('label', 'display:flex;align-items:center;gap:6px;margin-top:10px;font-size:12px;cursor:pointer;');
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = true; cb.setAttribute('data-remember', '1');
      rl.appendChild(cb); rl.appendChild(el('span', null, 'Remember as the default for next time'));
      box.appendChild(rl);
      pane.appendChild(box);
    }

    // the moves — primary first, big
    var flow = C.flowFor(settings, i.type);
    var want = C.primaryFor(settings, i.type);
    var primary = flow.filter(function (s) { return C.same(s, want); })[0] || flow[Math.min(2, flow.length - 1)];
    var at = C.same(i.status, primary);
    var big = el('button', BTN + 'width:100%;padding:11px 10px;font-size:14px;border:none;color:#fff;background:' + (at ? '#97a0af' : '#0052cc') + ';' + (state.busy ? 'opacity:.6;cursor:wait;' : ''),
      state.busy && C.same(state.pendingTarget, primary) ? 'Moving…' : at ? 'Already ' + primary : 'Move to ' + primary,
      { title: 'Alt+I', onclick: function () { if (!at) run(primary); } });
    if (at || state.busy) big.disabled = true;
    pane.appendChild(big);
    var row = el('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;');
    flow.forEach(function (s) {
      if (C.same(s, primary)) return;
      var here = C.same(i.status, s);
      var b = el('button', BTN + 'flex:1;font-size:12px;' + (here ? 'background:#f4f5f7;color:#97a0af;cursor:default;' : '') + (state.busy ? 'opacity:.6;' : ''), here ? '● ' + s : s, { onclick: function () { if (!here) run(s); } });
      if (here || state.busy) b.disabled = true;
      row.appendChild(b);
    });
    pane.appendChild(row);

    // The fields — prefilled from settings (or the ticket's own value when it
    // has one), editable; what you change is written with the move. Hidden
    // fields (⚙ → show) are still filled, just not shown.
    var defs = C.defaultsFor(settings, i), ids = Object.keys(defs);
    var shown = ids.filter(function (id) { return defs[id].show; }), hidden = ids.filter(function (id) { return !defs[id].show; });
    var current = function (id) { var v = i.values[id]; if (C.isEmpty(v)) return ''; if (Array.isArray(v)) return v.map(function (x) { return x && typeof x === 'object' ? (x.value || x.name || x.key || x.id) : x; }).join(', '); return typeof v === 'object' ? String(v.value || v.name || v.key || v.id || '') : String(v); };
    pane.appendChild(el('div', LBL + 'display:flex;align-items:center;', 'Fields'));
    if (!ids.length) pane.appendChild(el('div', 'color:#6b778c;font-size:12px;', 'No field defaults yet — open ⚙ and press Detect.'));
    shown.forEach(function (id) {
      var has = current(id) !== '';
      var prefill = has && !settings.overwrite ? current(id) : defs[id].raw;
      var value = state.draft[id] != null ? state.draft[id] : prefill;
      var r = el('div', 'display:flex;align-items:center;gap:8px;padding:3px 0;');
      r.appendChild(el('span', 'color:#6b778c;font-size:12px;flex:0 0 108px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', defs[id].label, { title: defs[id].label + (has ? ' — the ticket already has: ' + current(id) : ' — from settings') }));
      var inp = el(/acceptance/i.test(defs[id].label) ? 'textarea' : 'input', INP + 'flex:1;font-size:12.5px;padding:5px 8px;' + (has && state.draft[id] == null ? 'background:#f4f5f7;' : ''));
      inp.value = value; inp.setAttribute('data-field-id', id);
      if (inp.tagName === 'TEXTAREA') inp.rows = 2;
      inp.addEventListener('input', function () { state.draft[id] = inp.value; });
      inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
      r.appendChild(inp);
      if (state.draft[id] != null) r.appendChild(el('span', 'cursor:pointer;color:#6b778c;font-size:14px;', '↺', { title: 'Back to the default', onclick: function () { delete state.draft[id]; render(); } }));
      pane.appendChild(r);
    });
    if (hidden.length) pane.appendChild(el('div', 'color:#97a0af;font-size:11.5px;margin-top:4px;', 'Also filled: ' + hidden.map(function (id) { return defs[id].label + ' = ' + defs[id].raw; }).join(' · ')));

    if (state.log.length) {
      var lg = el('div', 'margin-top:12px;padding-top:10px;border-top:1px solid #ebecf0;font-size:12px;');
      state.log.forEach(function (l) { lg.appendChild(el('div', 'padding:1px 0;color:' + (l.kind === 'err' ? '#bf2600' : l.kind === 'warn' ? '#974f0c' : l.kind === 'ok' ? '#006644' : '#42526e') + ';' + (l.kind === 'ok' || l.kind === 'err' ? 'font-weight:700;' : ''), l.text)); });
      pane.appendChild(lg);
    }
    pane.appendChild(el('div', 'margin-top:10px;font-size:11px;color:#97a0af;', 'Alt+I move · Alt+J show/hide · Esc close'));
  }

  function renderSettings() {
    var s = load();
    pane.appendChild(header('Jira Mover — settings'));
    var status = el('div', 'font-size:12px;min-height:16px;margin-bottom:4px;');
    var field = function (label, value, onchange, ph) {
      pane.appendChild(el('div', LBL, label));
      var i = el('input', INP); i.value = value == null ? '' : value; if (ph) i.placeholder = ph;
      i.addEventListener('change', function () { onchange(i.value); save(s); status.textContent = 'Saved'; status.style.color = '#006644'; });
      pane.appendChild(i); return i;
    };
    var parseFlow = function (v) { return v.split(/>|,/).map(function (x) { return x.trim(); }).filter(Boolean); };
    field('Status flow, in order (Task and everything else)', s.flow.join(' > '), function (v) { var f = parseFlow(v); if (f.length >= 2) s.flow = f; }, 'New > To do > In progress > Done');
    pane.appendChild(el('div', LBL, 'Flows by issue type'));
    Object.keys(s.flows).forEach(function (type) {
      var r = el('div', 'display:flex;gap:6px;margin-bottom:6px;');
      var t = el('input', INP + 'flex:0 0 96px;width:96px;'); t.value = type; t.placeholder = 'Story';
      var f = el('input', INP + 'flex:1;'); f.value = s.flows[type].join(' > '); f.placeholder = 'New > Defined > In tech review > Ready for dev > In dev > In testing > Accepted';
      var pm = el('input', INP + 'flex:0 0 92px;width:92px;'); pm.value = (s.primaries || {})[type] || ''; pm.placeholder = 'main: In dev'; pm.title = 'What the main button moves this type to (empty = the default above)';
      pm.addEventListener('change', function () { s.primaries = s.primaries || {}; if (pm.value.trim()) s.primaries[type] = pm.value.trim(); else delete s.primaries[type]; save(s); status.textContent = 'Saved'; status.style.color = '#006644'; });
      t.addEventListener('change', function () { var nt = t.value.trim(); if (!nt || nt === type) return; s.flows[nt] = s.flows[type]; delete s.flows[type]; if (s.primaries && s.primaries[type]) { s.primaries[nt] = s.primaries[type]; delete s.primaries[type]; } save(s); render(); });
      f.addEventListener('change', function () { var pf = parseFlow(f.value); if (pf.length >= 2) { s.flows[type] = pf; save(s); status.textContent = 'Saved'; status.style.color = '#006644'; } });
      r.appendChild(t); r.appendChild(f); r.appendChild(pm);
      r.appendChild(el('span', 'cursor:pointer;color:#6b778c;font-size:16px;align-self:center;', '×', { title: 'Remove — this type then uses the default flow', onclick: function () { delete s.flows[type]; if (s.primaries) delete s.primaries[type]; save(s); render(); } }));
      pane.appendChild(r);
    });
    pane.appendChild(el('button', BTN + 'padding:4px 9px;font-size:12px;', '+ Add an issue type', { onclick: function () { var n = 'Type'; while (s.flows[n]) n += '2'; s.flows[n] = s.flow.slice(); save(s); render(); } }));
    field('Main button moves to (Task and everything else)', s.primary, function (v) { s.primary = v.trim() || 'In progress'; }, 'In progress');

    var dh = el('div', 'display:flex;align-items:center;margin-top:14px;');
    dh.appendChild(el('div', 'font-weight:800;flex:1;', 'Fields filled on a move'));
    dh.appendChild(el('button', BTN + 'padding:4px 9px;font-size:12px;', '⌕ Detect', { title: 'Find the four field ids in this Jira by name', onclick: function () {
      status.textContent = 'Asking Jira…'; status.style.color = '#6b778c';
      api('GET', '/field').then(function (list) {
        var found = C.detect(list), names = [];
        Object.keys(found).forEach(function (k) { s.fields[k].id = found[k].id; names.push(found[k].name); });
        save(s); render();
        var st2 = pane.querySelector('[data-status]');
        if (st2) { st2.textContent = names.length ? '✓ Found: ' + names.join(', ') : 'Nothing matched by name — type the ids by hand'; st2.style.color = names.length ? '#006644' : '#974f0c'; }
      }).catch(function (e) { status.textContent = '✗ ' + e.message; status.style.color = '#bf2600'; });
    } }));
    pane.appendChild(dh);
    status.setAttribute('data-status', '1');
    pane.appendChild(status);

    var pair = function (label, obj, note) {
      pane.appendChild(el('div', LBL, label + (note ? '  ·  ' + note : '')));
      var r = el('div', 'display:flex;gap:6px;');
      var eye = el('input'); eye.type = 'checkbox'; eye.checked = obj.show !== false; eye.title = 'Show this field on the main screen (it is filled either way)'; eye.style.cssText = 'margin:0 2px 0 0;align-self:center;cursor:pointer;';
      eye.addEventListener('change', function () { obj.show = eye.checked; save(s); status.textContent = 'Saved'; status.style.color = '#006644'; });
      r.appendChild(eye);
      var id = el('input', INP + 'flex:0 0 132px;width:132px;font-family:ui-monospace,Menlo,monospace;font-size:12px;'); id.value = obj.id || ''; id.placeholder = 'customfield_…';
      var v = el('input', INP + 'flex:1;'); v.value = obj.value == null ? '' : obj.value; v.placeholder = 'default value';
      id.addEventListener('change', function () { obj.id = id.value.trim(); save(s); status.textContent = 'Saved'; status.style.color = '#006644'; });
      v.addEventListener('change', function () { obj.value = v.value; save(s); status.textContent = 'Saved'; status.style.color = '#006644'; });
      r.appendChild(id); r.appendChild(v);
      return r;
    };
    pane.appendChild(pair('Acceptance criteria', s.fields.acceptance, '<TICKET TITLE> = the title'));
    pane.appendChild(pair('Story points', s.fields.points));
    pane.appendChild(pair('Scrum team', s.fields.team));
    pane.appendChild(pair('Epic', s.fields.epic, 'epic key'));

    pane.appendChild(el('div', 'font-weight:800;margin-top:14px;', 'Other required fields'));
    pane.appendChild(el('div', 'font-size:12px;color:#6b778c;', 'Added when a move asks for a field and you tick "remember". The checkbox in front of each field shows or hides it on the main screen.'));
    s.extra.forEach(function (e, idx) {
      var r = pair(e.label, e);
      r.appendChild(el('span', 'cursor:pointer;color:#6b778c;font-size:16px;align-self:center;', '×', { title: 'Remove', onclick: function () { s.extra.splice(idx, 1); save(s); render(); } }));
      pane.appendChild(r);
    });
    pane.appendChild(el('button', BTN + 'margin-top:8px;padding:4px 9px;font-size:12px;', '+ Add a field', { onclick: function () { s.extra.push({ id: 'customfield_', label: 'Field', value: '', show: true }); save(s); render(); } }));

    var chk = function (label, key) {
      var l = el('label', 'display:flex;align-items:flex-start;gap:7px;margin-top:10px;cursor:pointer;font-size:12.5px;');
      var c = el('input'); c.type = 'checkbox'; c.checked = !!s[key];
      c.addEventListener('change', function () { s[key] = c.checked; save(s); status.textContent = 'Saved'; status.style.color = '#006644'; });
      l.appendChild(c); l.appendChild(el('span', null, label)); pane.appendChild(l);
    };
    chk('Overwrite fields that already have a value (off = fill only the empty ones)', 'overwrite');
    chk('Refresh the Jira page after a move', 'reloadAfter');

    pane.appendChild(el('div', LBL, 'Copy settings to another computer'));
    var ta = el('textarea', INP + 'height:64px;font-family:ui-monospace,Menlo,monospace;font-size:11px;'); ta.value = JSON.stringify(s);
    ta.addEventListener('change', function () { try { save(C.mergeSettings(JSON.parse(ta.value))); render(); } catch (e) { status.textContent = '✗ Not valid settings text'; status.style.color = '#bf2600'; } });
    pane.appendChild(ta);
    pane.appendChild(el('div', 'font-size:11px;color:#97a0af;margin-top:4px;', 'Settings are kept in this browser, for this Jira only.'));
  }

  // ── which ticket was clicked ──
  function keyOf(node) {
    for (var n = node, d = 0; n && n !== document && d < 12; n = n.parentNode, d++) {
      if (n.getAttribute) {
        if (n.getAttribute('data-jira-mover')) return null;
        var k = n.getAttribute('data-issue-key') || n.getAttribute('data-issuekey') || n.getAttribute('data-key');
        if (k && C.issueKeyFrom(' ' + k)) return C.issueKeyFrom(' ' + k);
        if (n.tagName === 'A' && n.getAttribute('href')) { var h = C.issueKeyFrom(n.getAttribute('href')); if (h && /\/browse\/|selectedIssue=/.test(n.getAttribute('href'))) return h; }
      }
    }
    return null;
  }
  function keyOfPage() {
    var m = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/.exec(location.pathname) || /[?&]selectedIssue=([A-Z][A-Z0-9_]+-\d+)/.exec(location.search);
    return m ? m[1] : null;
  }
  document.addEventListener('click', function (e) { var k = keyOf(e.target); if (k) open(k); }, true);   // never blocks Jira's own click
  var lastUrl = '';
  setInterval(function () {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    var k = keyOfPage();
    if (k && (visible() || /\/browse\//.test(location.pathname))) open(k);
  }, 700);
  document.addEventListener('keydown', function (e) {
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (e.altKey && e.code === 'KeyJ') { e.preventDefault(); if (visible()) show(false); else { var k = state.key || keyOfPage(); if (k) open(k); else show(true); } }
    else if (e.altKey && e.code === 'KeyI') { e.preventDefault(); var key = state.key || keyOfPage(); if (key) { open(key); var go = function () { if (state.issue && state.key === key) run(C.primaryFor(settings, state.issue.type)); else setTimeout(go, 200); }; go(); } }
    else if (e.key === 'Escape' && visible() && !(typing && pane.contains(t) === false)) show(false);
  }, true);

  window.__jiraMover = { toggle: function (on) { if (on === true) { var k = state.key || keyOfPage(); if (k) open(k); else show(true); } else show(!visible()); }, open: open };
  var first = keyOfPage();
  if (first) open(first); else if (!AUTO) show(true);   // the bookmark was clicked: show yourself
})();
