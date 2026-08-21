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

     Living in the side panel is the point: a page refresh kills the
     content script but not this page, so the port drops, the cockpit
     says "waiting", and reconnects to the fresh content script — the
     DevTools property the in-page bar can never have.
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
};

/* ---- render: state messages → DOM ---------------------------------- */

// an icon string is trusted only if it is one of ours: same gate as ui/list.js
const putIcon = (el, svg) => { if (/^<svg/.test(svg || '')) el.innerHTML = svg; };

$('#ver').textContent = 'v' + VERSION;
putIcon($('#power'), IC.power);
$('#power').insertAdjacentHTML('beforeend', '<span class="st">OFF</span>');
for (const [sel, ic] of [['[data-sweep]', IC.sweep], ['[data-copy]', IC.copy], ['[data-clear]', IC.clear]])
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
      b.title = t.title + '\n' + (t.roles || []).join(' · ');
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
      box.append(b);
    }
  },
  tool([id, v]) {
    $(`#tools [data-tool="${id}"]`)?.setAttribute('aria-pressed', String(!!v));
  },
  count([n]) { $('[data-c]').textContent = n ? String(n) : ''; },
  swept([v, n]) {
    const b = $('[data-sweep]');
    b.classList.toggle('swept', !!v);
    b.querySelector('.n').textContent = v ? `${n} problem${n === 1 ? '' : 's'}` : '';
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
        b.textContent = `${r.glyph} ${r.title.split(/[—–]/)[0].trim()}`;
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

bind();
