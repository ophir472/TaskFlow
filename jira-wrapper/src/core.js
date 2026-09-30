// Jira Mover — core logic. Pure functions, no DOM, no network: the same file
// is loaded by the page script and by the node tests.
//
// The job: move a ticket along the flow (New > To do > In progress > Done)
// with one click, filling whatever the transition screens demand from the
// defaults in settings, and never overwriting a value that is already set.
var JiraMoverCore = (function () {
  'use strict';

  var DEFAULT_SETTINGS = {
    flow: ['New', 'To do', 'In progress', 'Done'],
    // Issue types with their own flow (matched by name); anything else uses `flow`.
    flows: { Story: ['New', 'Defined', 'In tech review', 'Ready for dev', 'In dev', 'In testing', 'Accepted'] },
    // The main button's target: per issue type, else `primary`.
    primary: 'In progress',
    primaries: { Story: 'In dev' },
    // The four known fields. id = customfield_12345 (Detect fills it).
    fields: {
      acceptance: { label: 'Acceptance criteria', id: '', value: '<TICKET TITLE>', show: true },
      points: { label: 'Story points', id: '', value: '1', show: true },
      team: { label: 'Scrum team', id: '', value: '', show: false },
      epic: { label: 'Epic', id: '', value: '', show: true },
      // Story only (types: which issue types the field applies to; empty = all).
      fixVersions: { label: 'Fix Version/s', id: 'fixVersions', value: '', show: true, types: ['Story'] },
      nft: { label: 'NFT Required', id: '', value: '', show: true, types: ['Story'] },
    },
    // Any other field a transition demands: { id, label, value }. Filled the
    // same way. The pane adds to this list when you tick "remember".
    extra: [],
    overwrite: false,        // false = fill only what is empty
    reloadAfter: true,       // refresh the page after a successful move
  };

  // The flow this ticket follows: its issue type's own, else the default.
  function flowFor(settings, issueType) {
    var flows = settings.flows || {};
    for (var k in flows) if (same(k, issueType) && flows[k] && flows[k].length >= 2) return flows[k];
    return settings.flow;
  }

  // What the main button moves this ticket to: the type's own, else the default.
  function primaryFor(settings, issueType) {
    var p = settings.primaries || {};
    for (var k in p) if (same(k, issueType) && String(p[k]).trim()) return String(p[k]).trim();
    return settings.primary;
  }

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/[\s_-]+/g, ' '); }
  function same(a, b) { return !!norm(a) && norm(a) === norm(b); }

  // Which status to go to next. Direct hop when Jira offers it, else the
  // furthest legal status on the way; a ticket outside the flow re-enters at
  // the offered status nearest the target. null = stuck.
  function nextHop(flow, current, target, offered) {
    if (same(current, target)) return null;
    var i, direct = offered.filter(function (o) { return same(o, target); })[0];
    if (direct) return direct;
    var idx = function (s) { for (var k = 0; k < flow.length; k++) if (same(flow[k], s)) return k; return -1; };
    var ci = idx(current), ti = idx(target);
    if (ti === -1) return null;
    if (ci === -1) {
      var best = null, bestD = Infinity;
      offered.forEach(function (o) { var k = idx(o); if (k !== -1 && Math.abs(k - ti) < bestD) { best = o; bestD = Math.abs(k - ti); } });
      return best;
    }
    var step = ti > ci ? 1 : -1;
    for (i = ti - step; i !== ci; i -= step) {
      var hit = offered.filter(function (o) { return same(o, flow[i]); })[0];
      if (hit) return hit;
    }
    return null;
  }

  function isEmpty(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }

  // Shape a typed-in value the way the field wants it, using Jira's own
  // description of the field (schema + allowedValues) when we have it.
  function shape(raw, meta) {
    var s = String(raw == null ? '' : raw).trim();
    if (s === '') return undefined;
    var schema = (meta && meta.schema) || {};
    var allowed = (meta && meta.allowedValues) || null;
    var pick = function (txt) {
      if (!allowed) return null;
      for (var k = 0; k < allowed.length; k++) {
        var a = allowed[k];
        if (same(a.value, txt) || same(a.name, txt) || String(a.id) === txt || same(a.key, txt)) return { id: String(a.id) };
      }
      return null;
    };
    var one = function (txt) {
      var hit = pick(txt);
      if (hit) return hit;
      if (schema.type === 'option' || schema.items === 'option') return { value: txt };
      if (schema.type === 'user' || schema.items === 'user') return { name: txt };
      if (schema.type === 'priority' || schema.type === 'resolution' || schema.items === 'component' || schema.items === 'version') return { name: txt };
      return txt;
    };
    if (schema.type === 'number') { var n = Number(s); return isFinite(n) ? n : undefined; }
    if (schema.type === 'array') {
      if (schema.items === 'string') return s.split(/[,\s]+/).filter(Boolean);           // labels
      return s.split(',').map(function (x) { return x.trim(); }).filter(Boolean).map(one);
    }
    return one(s);
  }

  // Every default from settings as { id: { label, raw } }, templates resolved.
  function defaultsFor(settings, issue) {
    var out = {};
    var title = (issue && issue.summary) || '';
    var type = (issue && issue.type) || '';
    var applies = function (types) { if (!types || !types.length) return true; for (var k = 0; k < types.length; k++) if (same(types[k], type)) return true; return false; };
    var put = function (id, label, value, show, types) {
      id = String(id || '').trim();
      if (!id || !applies(types)) return;
      if (String(value == null ? '' : value).trim() === '') { if (show !== false) out[id] = { label: label || id, raw: '', show: true, empty: true }; return; }   // shown, nothing to fill
      out[id] = { label: label || id, raw: String(value).replace(/<ticket title>|<task name>/gi, title), show: show !== false };
    };
    var f = settings.fields || {};
    Object.keys(f).forEach(function (k) { put(f[k].id, f[k].label, f[k].value, f[k].show, f[k].types); });
    (settings.extra || []).forEach(function (e) { put(e.id, e.label, e.value, e.show, e.types); });
    return out;
  }

  // Plan one hop. `screen` = the transition's fields (from
  // ?expand=transitions.fields), `values` = the ticket's current values,
  // `typed` = what the user entered in the pane for this move.
  //   send    → goes in the transition POST (fields on its screen)
  //   missing → required, empty, no default: the pane must ask
  function planHop(settings, issue, screen, values, typed) {
    var defaults = defaultsFor(settings, issue);
    var send = {}, missing = [], filled = [];
    Object.keys(screen || {}).forEach(function (id) {
      var meta = screen[id] || {};
      var has = !isEmpty(values ? values[id] : undefined);
      var raw = typed && typed[id] != null && String(typed[id]).trim() !== '' ? typed[id]
        : defaults[id] && !defaults[id].empty ? defaults[id].raw : null;
      if (has && !(settings.overwrite && raw != null) && !(typed && typed[id] != null && String(typed[id]).trim() !== '')) return;
      if (raw == null) {
        // Jira fills these itself or they have a server default.
        if (meta.required && !meta.hasDefaultValue && !has) missing.push({ id: id, label: meta.name || id, allowed: (meta.allowedValues || []).map(function (a) { return a.value || a.name || a.key || String(a.id); }) });
        return;
      }
      var v = shape(raw, meta);
      if (v === undefined || (Array.isArray(v) && !v.length)) { if (meta.required && !has) missing.push({ id: id, label: meta.name || id, allowed: [] }); return; }
      send[id] = v;
      filled.push((defaults[id] && defaults[id].label) || meta.name || id);
    });
    return { send: send, missing: missing, filled: filled };
  }

  // FILL FIRST: what to write on the ticket itself before any move — every
  // default whose field is empty (or all of them with overwrite), plus what
  // was typed in the pane (typed always wins). Workflow validators check the
  // ticket's fields, not the transition screen, so the ticket must be
  // complete before the first hop. Fields this ticket can't edit are left
  // to the transition screens.
  function planEdit(settings, issue, values, editmeta, skipIds, typed) {
    var defaults = defaultsFor(settings, issue), out = {};
    var ids = Object.keys(defaults);
    Object.keys(typed || {}).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
    ids.forEach(function (id) {
      if (skipIds && skipIds[id]) return;
      var t = typed && typed[id] != null && String(typed[id]).trim() !== '' ? String(typed[id]) : null;
      if (t == null && !isEmpty(values ? values[id] : undefined) && !settings.overwrite) return;
      var meta = editmeta && editmeta[id];
      if (editmeta && !meta) return;               // not editable on this ticket type
      var raw = t != null ? t : defaults[id] && !defaults[id].empty ? defaults[id].raw : null;
      if (raw == null) return;
      var v = shape(raw, meta);
      if (v !== undefined && !(Array.isArray(v) && !v.length)) out[id] = v;
    });
    return out;
  }

  // A transition Jira refused because of fields (a validator, or a screen
  // field we had nothing for): turn its error into questions for the pane.
  function missingFromErrors(fieldErrors, screen, editmeta) {
    return Object.keys(fieldErrors || {}).map(function (id) {
      var meta = (screen && screen[id]) || (editmeta && editmeta[id]) || {};
      return { id: id, label: meta.name || String(fieldErrors[id]).replace(/\s+is required\.?$/i, '') || id,
        allowed: (meta.allowedValues || []).map(function (a) { return a.value || a.name || a.key || String(a.id); }) };
    });
  }

  // Settings → Detect: match Jira's field list by name.
  var MATCH = {
    acceptance: [/^acceptance criteria$/i, /acceptance criteri/i],
    points: [/^story points$/i, /^story point estimate$/i, /story point/i],
    team: [/^scrum[ -]?team$/i, /scrum[ -]?team/i, /^team$/i],
    epic: [/^epic link$/i, /^parent link$/i],
    nft: [/^nft required$/i, /nft/i],
  };
  function detect(fields) {
    var out = {};
    Object.keys(MATCH).forEach(function (k) {
      for (var r = 0; r < MATCH[k].length; r++) {
        var hit = (fields || []).filter(function (f) { return f.custom !== false && MATCH[k][r].test(String(f.name).trim()); })[0];
        if (hit) { out[k] = { id: hit.id, name: hit.name }; break; }
      }
    });
    return out;
  }

  function issueKeyFrom(text) {
    var m = /(?:^|[\/=\s"'#])([A-Z][A-Z0-9_]+-\d+)(?=$|[\/?&#\s"'.,;:)])/.exec(String(text || ''));
    return m ? m[1] : null;
  }

  function mergeSettings(saved) {
    var d = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!saved || typeof saved !== 'object') return d;
    var cleanFlow = function (f) { return Array.isArray(f) ? f.map(function (s) { return String(s == null ? '' : s).trim(); }).filter(Boolean) : []; };
    if (cleanFlow(saved.flow).length >= 2) d.flow = cleanFlow(saved.flow);
    if (saved.flows && typeof saved.flows === 'object') {
      d.flows = {};
      Object.keys(saved.flows).forEach(function (k) { var f = cleanFlow(saved.flows[k]); if (String(k).trim() && f.length >= 2) d.flows[String(k).trim()] = f; });
      // 1.2.0 shipped a placeholder Story flow; a saved copy of it is replaced by the real one.
      if (d.flows.Story && d.flows.Story.join('|') === 'To do|In assessment|In progress|Done') d.flows.Story = DEFAULT_SETTINGS.flows.Story.slice();
    }
    if (saved.primaries && typeof saved.primaries === 'object') {
      d.primaries = {};
      Object.keys(saved.primaries).forEach(function (k) { if (String(k).trim() && String(saved.primaries[k] == null ? '' : saved.primaries[k]).trim()) d.primaries[String(k).trim()] = String(saved.primaries[k]).trim(); });
    }
    if (saved.primary) d.primary = String(saved.primary);
    Object.keys(d.fields).forEach(function (k) {
      var s = (saved.fields || {})[k];
      if (s) { if (s.id != null) d.fields[k].id = String(s.id).trim(); if (s.value != null) d.fields[k].value = String(s.value); if (typeof s.show === 'boolean') d.fields[k].show = s.show; if (Array.isArray(s.types)) d.fields[k].types = s.types.map(function (t) { return String(t).trim(); }).filter(Boolean); }
    });
    if (Array.isArray(saved.extra)) d.extra = saved.extra.filter(function (e) { return e && e.id; }).map(function (e) { return { id: String(e.id).trim(), label: String(e.label || e.id), value: String(e.value == null ? '' : e.value), show: e.show !== false, types: Array.isArray(e.types) ? e.types.map(function (t) { return String(t).trim(); }).filter(Boolean) : [] }; });
    if (typeof saved.overwrite === 'boolean') d.overwrite = saved.overwrite;
    if (typeof saved.reloadAfter === 'boolean') d.reloadAfter = saved.reloadAfter;
    return d;
  }

  return { DEFAULT_SETTINGS: DEFAULT_SETTINGS, flowFor: flowFor, primaryFor: primaryFor, norm: norm, same: same, nextHop: nextHop, isEmpty: isEmpty, shape: shape, defaultsFor: defaultsFor, planHop: planHop, planEdit: planEdit, missingFromErrors: missingFromErrors, detect: detect, issueKeyFrom: issueKeyFrom, mergeSettings: mergeSettings };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = JiraMoverCore;
