/* ======================================================================
  COCKPIT — the extension gate's bigger face.

     TEMPLATE: esbuild bundles this (it imports the shared protocol from
     src/core/) and build.js substitutes __VERSION__; the output lands at
     dist/browser-extension/cockpit.js. Edit HERE, never the output.

     One rule explains this whole file: the cockpit is a RENDERING of the
     in-page panel's state, not a second implementation of the overlay.
     It connects to the active tab's content script over a long-lived
     port, says hello, and draws whatever state messages arrive; every
     button posts the command named after the panel callback the bar's
     own button would have fired. The overlay cannot tell its two faces
     apart, which is what keeps them from disagreeing.

     The lists work the same way: a view button asks for that view's
     rows (openView), the page pushes them packed, and every row action
     travels as (view, index) — resolved page-side against rows(view),
     the row-index law the in-page list already lives by. This file
     never learns what a pin or a setting IS.

     Living in the side panel is the point: a page refresh kills the
     content script but not this page, so the port drops, the cockpit
     says "waiting", and reconnects to the fresh content script — the
     DevTools property the in-page bar can never have. The open view
     survives the reload too: it is re-requested on every reconnect.
   ====================================================================== */
import { Protocol } from '../src/core/protocol.js';

const VERSION = '__VERSION__';
const $ = (s) => document.querySelector(s);
const body = document.body;

/* lucide (ISC), the bar's own faces */
const IC = {
  power: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>',
  sweep: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  copy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  clear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  pin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
  gear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
};

/* ---- render: state messages → DOM ---------------------------------- */

// an icon string is trusted only if it is one of ours: same gate as ui/list.js
const isSvg = (s) => /^<svg[\s>]/.test(s || '');
const putIcon = (el, svg) => { if (isSvg(svg)) el.innerHTML = svg; };

$('#ver').textContent = 'v' + VERSION;
putIcon($('#power'), IC.power);
$('#power').insertAdjacentHTML('beforeend', '<span class="st">OFF</span>');
for (const [sel, ic] of [['[data-sweep]', IC.sweep], ['[data-copy]', IC.copy], ['[data-clear]', IC.clear],
                         ['[data-view="findings"]', IC.sweep], ['[data-view="pins"]', IC.pin],
                         ['[data-view="settings"]', IC.gear]])
  putIcon($(sel + ' .ic'), ic);

const flashing = new Map();
function flash(msg, sel) {
  const b = $(sel);
  if (!b) return;
  const t = b.children[1];                        // the label span
  const live = flashing.get(b);
  const original = live ? live.original : t.textContent;
  if (live) clearTimeout(live.timer);
  t.textContent = msg;
  flashing.set(b, { original, timer: setTimeout(() => {
    t.textContent = original; flashing.delete(b);
  }, 900) });
}

/* ---- the lists ------------------------------------------------------- */

let myView = null;   // which view this cockpit holds open — survives reconnects

function setView(v) {
  myView = myView === v ? null : v;
  for (const b of document.querySelectorAll('#views [data-view]'))
    b.setAttribute('aria-pressed', String(b.dataset.view === myView));
  const box = $('#rowsBox');
  box.classList.toggle('show', !!myView);
  if (!myView) box.textContent = '';
  post(Protocol.cmd('openView', myView));   // the reply is a rows push
}

/** Packed rows → DOM, the in-page list's semantics said again: headings keep
 *  their index so (view, i) resolves page-side; tags may be our own SVG,
 *  labels and details stay textContent because page text is never HTML. */
function renderRows(view, rows, empty) {
  if (view !== myView) return;   // a late push for a view no longer open
  const box = $('#rowsBox');
  box.textContent = '';
  if (!rows.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = empty || 'Nothing here yet.';
    box.append(e);
    return;
  }
  rows.forEach((row, i) => {
    if (row.title || row.heading) {
      const h = document.createElement('div');
      h.className = row.title ? 'viewhead' : 'rowhead';
      h.textContent = row.title || row.heading;
      if (row.detail) {
        const n = document.createElement('span');
        n.className = 'note';
        n.textContent = row.detail;
        h.append(n);
      }
      if (row.removable) h.append(rmButton(view, i, row.rmTitle));
      box.append(h);
      return;
    }
    const r = document.createElement('div');
    r.className = 'rrow';
    if (row.accent) r.dataset.accent = row.accent;
    if (row.inert) r.classList.add('inert');
    if (row.label || row.detail) r.title = [row.label, row.detail].filter(Boolean).join('\n');
    const tag = document.createElement('span');
    tag.className = 'tag';
    if (isSvg(row.tag)) tag.innerHTML = row.tag;
    else tag.textContent = row.tag || '';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = row.label || '';
    if (row.control) {
      r.append(tag, lbl, control(row.control, (raw) => post(Protocol.cmd('rowChange', view, i, raw)),
                                 row.label));
    } else {
      const det = document.createElement('span');
      det.className = 'det';
      det.textContent = row.detail || '';
      if (row.activatable) {
        const go = document.createElement('button');
        go.className = 'go';
        go.append(tag, lbl, det);
        go.addEventListener('click', (e) => { e.stopPropagation(); post(Protocol.cmd('rowActivate', view, i)); });
        r.addEventListener('click', () => post(Protocol.cmd('rowActivate', view, i)));
        r.append(go);
      } else {
        r.append(tag, lbl, det);
      }
    }
    if (row.removable) r.append(rmButton(view, i));
    box.append(r);
  });
}

function rmButton(view, i, title) {
  const rm = document.createElement('button');
  rm.className = 'rm';
  rm.textContent = '✕';
  rm.title = title || 'Remove';
  rm.addEventListener('click', (e) => { e.stopPropagation(); post(Protocol.cmd('rowRemove', view, i)); });
  return rm;
}

/** A control descriptor → a widget producing the SAME raw values the in-page
 *  Controls build (choice → index, number → string, toggle → boolean), so
 *  Settings.fromControl reads both faces identically. */
function control(c, onChange, name) {
  if (c.kind === 'choice') {
    const sel = document.createElement('select');
    (c.choices || []).forEach((label, k) => {
      const o = document.createElement('option');
      o.value = String(k);
      o.textContent = label;
      sel.append(o);
    });
    sel.selectedIndex = c.selected || 0;
    if (name) sel.setAttribute('aria-label', name);
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('change', () => onChange(sel.selectedIndex));
    return sel;
  }
  if (c.kind === 'number') {
    const wrap = document.createElement('span');
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = c.value;
    if (c.min !== undefined) inp.min = String(c.min);
    if (c.max !== undefined) inp.max = String(c.max);
    if (c.step !== undefined) inp.step = String(c.step);
    if (name) inp.setAttribute('aria-label', name);
    inp.addEventListener('click', (e) => e.stopPropagation());
    inp.addEventListener('change', () => onChange(inp.value));
    wrap.append(inp);
    if (c.suffix) {
      const u = document.createElement('span');
      u.className = 'unit';
      u.textContent = c.suffix;
      wrap.append(u);
    }
    return wrap;
  }
  if (c.kind === 'toggle') {
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = !!c.on;
    if (name) inp.setAttribute('aria-label', name);
    inp.addEventListener('click', (e) => e.stopPropagation());
    inp.addEventListener('change', () => onChange(inp.checked));
    return inp;
  }
  return document.createElement('span');   // unknown kinds are visibly missing
}

const render = {
  on([v]) {
    body.dataset.on = v ? '1' : '';
    $('#power').setAttribute('aria-pressed', String(!!v));
    $('#power .st').textContent = v ? 'ON' : 'OFF';
  },
  tools([roster, coreV]) {
    if (coreV && coreV !== VERSION) return mode('stale');
    const box = $('#tools');
    box.textContent = '';
    for (const t of roster) {
      const b = document.createElement('button');
      b.dataset.tool = t.id;
      b.setAttribute('aria-pressed', 'false');
      b.title = t.title + '\n' + (t.roles || []).join(' · ') + '\nright-click for its options';
      const ic = document.createElement('span');
      putIcon(ic, t.icon);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = t.title.split(/[—–]/)[0].trim();
      b.append(ic, name);
      if (t.fam) {
        const f = document.createElement('span');
        f.className = 'fam';
        f.textContent = t.fam;
        b.append(f);
      }
      b.addEventListener('click', () => post(Protocol.cmd('tool', t.id)));
      // the bar's right-click gesture, kept: a tool's own options as a view
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); setView('tool:' + t.id); });
      box.append(b);
    }
  },
  tool([id, v]) {
    $(`#tools [data-tool="${id}"]`)?.setAttribute('aria-pressed', String(!!v));
  },
  count([n]) {
    $('[data-c]').textContent = n ? String(n) : '';
    $('#views [data-view="pins"] .n').textContent = n ? String(n) : '';
  },
  swept([v, n]) {
    const b = $('[data-sweep]');
    b.classList.toggle('swept', !!v);
    b.querySelector('.n').textContent = v ? `${n} problem${n === 1 ? '' : 's'}` : '';
    $('#views [data-view="findings"] .n').textContent = v ? String(n) : '';
  },
  update([v]) {
    const u = $('#upd');
    u.textContent = `v${v} is available — the overlay updates from its own ⏻ menu on the page, or reinstall from the options page.`;
    u.classList.add('show');
  },
  badgeControls([groups]) {
    const box = $('#badge');
    box.textContent = '';
    for (const g of groups) {
      const grp = document.createElement('div');
      grp.className = 'grp';
      const lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = g.title;
      const members = document.createElement('div');
      members.className = 'members';
      for (const r of g.rows) {
        const b = document.createElement('button');
        /* a glyph is one of OUR icons (svg) or a short literal — never markup
           from anywhere else; printing the svg as text was the first bug a
           real install showed */
        const ic = document.createElement('span');
        if (isSvg(r.glyph)) ic.innerHTML = r.glyph;
        else ic.textContent = r.glyph || '';
        const t = document.createElement('span');
        t.textContent = r.label || (r.title || '').split(/[—–]/)[0].trim();
        b.append(ic, t);
        b.title = r.title;
        b.setAttribute('aria-pressed', String(!!r.armed));
        if (r.fixed) b.setAttribute('aria-disabled', 'true');
        else b.addEventListener('click', () => post(Protocol.cmd('badgeControl', r.key)));
        members.append(b);
      }
      grp.append(lbl, members);
      box.append(grp);
    }
  },
  rows([view, rows, empty]) { renderRows(view, rows, empty); },
  flash([msg, sel]) { flash(msg, sel); },
  removeMode() {},   // the remove chip lives on the page itself
};

/* ---- the port: bind the active tab, reconnect forever --------------- */

let tabId = null, port = null, timer = null, live = false;

function mode(m) { body.dataset.mode = m; }
function status(txt, dot) {
  $('#status').textContent = txt;
  $('#dot').className = 'dot' + (dot ? ' ' + dot : '');
}

function post(m) { try { port?.postMessage(m); } catch {} }

function retry(ms) { clearTimeout(timer); timer = setTimeout(connect, ms); }

function drop() { try { port?.disconnect(); } catch {} port = null; }

function connect() {
  clearTimeout(timer);
  if (port) return;   // already live — a stale retry timer must not double-connect
  if (tabId == null) { mode('waiting'); status('no tab', 'bad'); return; }
  let p;
  try { p = chrome.tabs.connect(tabId, { name: 'debug-overlay-cockpit' }); }
  catch { mode('waiting'); status('waiting for page…', 'bad'); return retry(900); }
  port = p;
  live = false;
  status('connecting…', '');
  p.onMessage.addListener((msg) => {
    const m = Protocol.read(msg);
    if (!m) { if (Protocol.stale(msg)) mode('stale'); return; }
    if (m.kind !== 'state') return;
    if (!live) { live = true; mode('main'); status('connected', 'ok'); }
    render[m.name]?.(m.args);
  });
  p.onDisconnect.addListener(() => {
    if (port !== p) return;
    port = null;
    live = false;
    mode('waiting');
    status('waiting for page…', 'bad');
    retry(900);   // a reload's content script needs a moment; keep knocking
  });
  post(Protocol.cmd('hello'));
  // the open view survives the reconnect: ask the fresh page for its rows
  if (myView) post(Protocol.cmd('openView', myView));
}

async function bind() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab ? tab.id : null;
  } catch { tabId = null; }
  drop();
  connect();
}

// the cockpit follows the user's eyes: rebind on tab switch, reconnect the
// moment a reload's fresh content script is in place
chrome.tabs.onActivated.addListener(bind);
chrome.tabs.onUpdated.addListener((id, info) => {
  if (id === tabId && info.status === 'complete') { drop(); connect(); }
});

$('#power').addEventListener('click', () => post(Protocol.cmd('toggle')));
$('[data-sweep]').addEventListener('click', () => post(Protocol.cmd('sweep')));
$('[data-copy]').addEventListener('click', () => post(Protocol.cmd('copy')));
$('[data-clear]').addEventListener('click', () => post(Protocol.cmd('clear')));
for (const b of document.querySelectorAll('#views [data-view]'))
  b.addEventListener('click', () => setView(b.dataset.view));

bind();
