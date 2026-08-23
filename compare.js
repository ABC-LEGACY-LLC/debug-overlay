#!/usr/bin/env node
/**
 * compare.js — proves two bundles BEHAVE the same, before believing either.
 *
 *     node compare.js <bundleA> <bundleB>
 *     npm run compare            (dist against itself — the harness self-test)
 *
 * WHY: the migration rebuilds the build system underneath an unchanged
 * product. "The tests pass" is necessary but they assert points; this runs one
 * scripted session — power, hover, pin, pair, sweep, settings, menus, copy,
 * Escape, Alt — against BOTH bundles and diffs every observable: bar, badges,
 * marks, list rows, settings rows, the copied report, storage. The baseline
 * for a phase is the bundle of the commit before it:
 *
 *     git show HEAD~1:dist/debug-overlay.user.js > /tmp/base.user.js
 *     node compare.js /tmp/base.user.js dist/debug-overlay.user.js
 *
 * Version numbers are normalised out — two builds of the same behaviour may
 * legitimately differ only there.
 */
'use strict';
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const HOT = { altKey: true, shiftKey: true, ctrlKey: false, code: 'KeyD' };
const PAGE = `<!doctype html><html><body>
  <div id="a" style="padding:7px">alpha</div>
  <div id="b">beta</div>
  <div id="c" style="margin-top:30px">gamma</div>
  <p id="dup" style="color:#bbb;background:#fff">faint one</p>
  <p id="dup">faint two</p>
  <a id="link" href="#x">a link</a>
</body></html>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).replace(/\d+\.\d+\.\d+/g, 'X.X.X');

async function observe(bundlePath) {
  const src = fs.readFileSync(bundlePath, 'utf8');
  const dom = new JSDOM(PAGE, { url: 'https://compare.test/', pretendToBeVisual: true,
    runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window, d = w.document;
  w.localStorage.setItem('__debug_overlay_tools', '["measure","grid","contrast","dupid","select"]');
  w.localStorage.setItem('__debug_overlay_seen', '["measure","grid","contrast","dupid","select","pick"]');
  w.localStorage.setItem('__debug_overlay_settings',
    '{"scale":{"step":2,"max":96,"boxes":false},"grid":{"suggest":true},"colour":{"level":"AA"}}');
  let copied = null;
  Object.defineProperty(w.navigator, 'clipboard',
    { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  w.eval(src);

  const o = {};
  const bar = d.getElementById('__debug-overlay-bar');
  const list = d.getElementById('__debug-overlay-list');
  const root = d.getElementById('__debug-overlay-root');
  const click = (sel) => bar.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const pin = (id, mods = {}) => {
    const el = d.getElementById(id);
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5, ...mods }));
  };
  const rows = () => [...list.querySelectorAll('.debug-overlay-row')].map((r) => {
    const c = r.querySelector('.debug-overlay-opt');
    const shown = !c ? (r.querySelector('.debug-overlay-det') || {}).textContent || ''
      : c.tagName === 'SELECT' ? c.selectedOptions[0].textContent
        : c.type === 'checkbox' ? String(c.checked) : c.value;
    return [(r.querySelector('.debug-overlay-tag') || {}).textContent,
            (r.querySelector('.debug-overlay-lbl') || {}).textContent, shown, r.className].join(' | ');
  });
  const heads = () => [...list.querySelectorAll('.debug-overlay-head, .debug-overlay-viewhead')].map((h) => h.textContent);

  // ---- the bar, cold ------------------------------------------------------
  o.barButtons = [...bar.querySelectorAll('button')].map((b) =>
    [b.className, b.dataset.tool || '', norm(b.title), b.getAttribute('aria-pressed')].join(' | '));
  o.rootAttrs = [root.getAttribute('aria-label'), root.getAttribute('aria-hidden')];
  o.sheets = [...root.querySelectorAll('style')].map((s) => [s.dataset.tool || 'core', s.textContent.length].join(':'));

  // ---- power on, pins, pair ----------------------------------------------
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...HOT, bubbles: true }));
  o.powerOn = bar.classList.contains('debug-overlay-on');
  pin('a');                       // note pin
  pin('b', { shiftKey: true });   // pair 1
  pin('c', { shiftKey: true });   // pair 2
  await sleep(150);
  o.badges = [...root.querySelectorAll('.debug-overlay-badge')].map((b) => b.textContent).sort();
  o.pinChips = [...root.querySelectorAll('.debug-overlay-pin-num')].map((n) => [n.textContent, n.className].join('|')).sort();
  click('[data-c]');
  o.pinListRows = rows(); o.pinListHeads = heads();
  o.countChip = bar.querySelector('[data-c]').textContent;

  // ---- sweep --------------------------------------------------------------
  click('[data-sweep]');
  await sleep(150);
  o.findingsRows = rows(); o.findingsHeads = heads();
  o.sweepBtn = [bar.querySelector('[data-sweep]').textContent,
                bar.querySelector('[data-sweep]').classList.contains('debug-overlay-swept'),
                norm(bar.querySelector('[data-sweep]').title)];
  o.marks = [...root.querySelectorAll('.debug-overlay-flag')].map((m) => m.className).sort();

  // ---- settings, both doors ----------------------------------------------
  click('[data-settings]');
  o.settingsRows = rows(); o.settingsHeads = heads();
  bar.querySelector('[data-tool="measure"]').dispatchEvent(
    new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  o.measureMenu = rows(); o.measureMenuHeads = heads();
  bar.querySelector('[data-tool="grid"]').dispatchEvent(
    new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  o.gridMenu = rows();

  // ---- report -------------------------------------------------------------
  click('[data-copy]');
  o.report = norm(copied || '');

  // ---- Escape closes the layer, Alt passes through ------------------------
  d.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  o.escClosedList = !list.classList.contains('debug-overlay-open');
  o.escPowerStays = bar.classList.contains('debug-overlay-on');
  let pageSaw = 0;
  d.getElementById('link').addEventListener('click', () => pageSaw++);
  pin('link', { altKey: true });
  o.altPassthrough = pageSaw;

  // ---- ✕ clears pins AND audit -------------------------------------------
  click('[data-clear]');
  await sleep(120);
  o.afterClear = [bar.querySelector('[data-sweep]').classList.contains('debug-overlay-swept'),
                  root.querySelectorAll('.debug-overlay-flag').length,
                  root.querySelectorAll('.debug-overlay-pin-num').length];

  o.storage = Object.keys(w.localStorage).filter((k) => k.startsWith('__debug_overlay') || k.startsWith('__dbgov'))
    .sort().map((k) => k + '=' + w.localStorage.getItem(k));
  dom.window.close();
  return o;
}

function diff(a, b, path = '', out = []) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} vs ${b.length}`);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n && out.length < 40; i++) diff(a[i], b[i], `${path}[${i}]`, out);
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      diff(a[k], b[k], path ? `${path}.${k}` : k, out);
  } else if (String(a) !== String(b)) {
    out.push(`${path}:\n    A: ${JSON.stringify(a)}\n    B: ${JSON.stringify(b)}`);
  }
  return out;
}

(async () => {
  const A = process.argv[2] || 'dist/debug-overlay.user.js';
  const B = process.argv[3] || A;
  const [oa, ob] = [await observe(A), await observe(B)];
  const d = diff(oa, ob);
  const observed = Object.keys(oa).length;
  if (!d.length) {
    console.log(`✓ behaviourally identical — ${observed} observation groups, 0 differences`);
    console.log(`  A: ${A}\n  B: ${B}`);
    process.exit(0);
  }
  console.log(`✗ ${d.length} difference(s) across ${observed} observation groups\n`);
  d.slice(0, 25).forEach((x) => console.log('  ' + x + '\n'));
  process.exit(1);
})();
