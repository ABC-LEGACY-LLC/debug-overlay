#!/usr/bin/env node
/**
 * test.js — boots the built bundle in a fake DOM.
 *
 * Not a unit-test suite: it is the smoke test that catches the failure that
 * actually happens, which is the bundle throwing on load and leaving the page
 * with no overlay at all. A userscript has no console anyone reads, so a boot
 * that dies is silent until you notice the panel never appears.
 *
 * Everything the bundle exposes is closed over by the IIFE, so the assertions
 * go through the only two things it makes observable: window.__DBG_OVERLAY__
 * and the DOM it appends.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'userscript.json'), 'utf8'));
const bundlePath = path.join(ROOT, 'dist', cfg.distFile);

if (!fs.existsSync(bundlePath)) {
  console.error(`✗ ${path.relative(ROOT, bundlePath)} missing — run node build.js first`);
  process.exit(1);
}
const source = fs.readFileSync(bundlePath, 'utf8');

let failed = 0;
function ok(name, cond, detail) {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

/** A page with enough of a layout for the overlay to have something to read. */
function makeDom() {
  const vc = new VirtualConsole();       // swallow page noise, keep real throws
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <div id="a" style="width:100px;height:40px;padding:8px">alpha</div>
       <div id="b" style="width:60px;height:20px;margin:12px">beta</div>
     </body></html>`,
    { url: 'https://example.test/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc },
  );
  return dom;
}

console.log('\nBOOT');
const dom = makeDom();
const { window } = dom;

let bootError = null;
try {
  window.eval(source);
} catch (e) {
  bootError = e;
}
ok('bundle evaluates without throwing', !bootError, bootError && bootError.stack.split('\n')[0]);
if (bootError) { console.log(''); process.exit(1); }

ok('single-instance flag set', window.__DBG_OVERLAY__ === true);

const root = window.document.getElementById('__dbgov-root');
ok('root element appended', !!root);
ok('root is hidden from a11y tree', root && root.getAttribute('aria-hidden') === 'true');

const style = root && root.querySelector('style');
ok('stylesheet injected', !!style && style.textContent.length > 0);
ok('tool CSS reached the stylesheet',
  !!style && style.textContent.includes('.dbgov-line'),
  'measure tool css missing — the tools[].css concat in 07-dom.js broke');

console.log('\nSTYLESHEET');
// Malformed CSS in one tool does not fail loudly. The parser gives up at the
// break and silently drops every rule after it, including the CSS of tools
// concatenated later — so a typo in the first tool can blank out the last.
// These checks read the composed sheet, which is exactly what ships.
const css = style ? style.textContent : '';
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '""');

let depth = 0, parens = 0, topLevel = 0, stray = false;
for (const ch of bare) {
  if (ch === '(') parens++;
  else if (ch === ')') parens--;
  else if (parens > 0) continue;          // braces inside gradient()/url() are data
  else if (ch === '{') { if (depth === 0) topLevel++; depth++; }
  else if (ch === '}') { if (--depth < 0) { stray = true; depth = 0; } }
}
ok('braces balance', depth === 0 && !stray, stray ? 'stray }' : `${depth} rule(s) left open`);
ok('parens balance', parens === 0, `${parens > 0 ? parens + ' unclosed' : -parens + ' extra'}`);

const sheet = style && style.sheet;
const selectors = sheet ? [...sheet.cssRules].map((r) => r.selectorText).filter(Boolean) : [];
ok('no rule dropped by the parser', !!sheet && sheet.cssRules.length === topLevel,
  sheet && `wrote ${topLevel} rules, parser kept ${sheet.cssRules.length} — it stopped at "${selectors[selectors.length - 1]}"`);

// the last tool in the registry is the one a mid-sheet break silently eats
ok('the last tool\'s CSS survives',
  selectors.some((s) => s.includes('.dbgov-badge') && s.includes('.bad')),
  'contrast tool css was dropped');

console.log('\nPANEL');
const bar = window.document.getElementById('__dbgov-bar');
ok('panel built', !!bar);
const status = bar && bar.querySelector('[data-st]');
ok('boots powered off', !!status && status.textContent === 'OFF');

const buttons = bar ? [...bar.querySelectorAll('button.tool')] : [];
const ids = buttons.map((b) => b.dataset.tool).sort();
ok('a button per registered tool', ids.length === 3, `got ${ids.length}: ${ids.join(', ')}`);
ok('tool ids match the registry',
  ids.join(',') === 'contrast,grid,measure', ids.join(','));

console.log('\nWIRING');
// the hotkey is the one path that proves interactions → controller → panel
const hot = cfg.hotkey || { altKey: true, shiftKey: true, ctrlKey: false, code: 'KeyD' };
window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
ok('hotkey powers the overlay on', !!status && status.textContent === 'ON',
  status && `status reads ${status.textContent}`);

window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
ok('hotkey powers it back off', !!status && status.textContent === 'OFF',
  status && `status reads ${status.textContent}`);

console.log('\nMOUSE');
// The overlay used to swallow only the click, which is after the browser has
// already started a selection and after the page has already reacted.
const target = window.document.getElementById('a');
let pageSawIt = false;
target.addEventListener('mousedown', () => { pageSawIt = true; });
const down = (el, opts) => {
  const e = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, ...opts });
  el.dispatchEvent(e);
  return e;
};

ok('powered off, the page keeps its mouse', !down(target).defaultPrevented);

window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
pageSawIt = false;
ok('inspecting, mousedown is swallowed', down(target).defaultPrevented,
  'a text selection starts here — shift-click would drag one across the page');
ok('inspecting, the page never sees it', !pageSawIt);
ok('alt hands the page back', !down(target, { altKey: true }).defaultPrevented);
ok('right-click is left alone', !down(target, { button: 2 }).defaultPrevented,
  'swallowing it would take the context menu too');
ok('the panel keeps its own clicks',
  !down(bar.querySelector('button.pwr')).defaultPrevented);
window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));

console.log('\nGUARD');
// running twice must not build a second panel — Tampermonkey can inject again
// on soft navigations, and two overlays fighting over the same keys is worse
// than none.
window.eval(source);
ok('second evaluation is a no-op',
  window.document.querySelectorAll('#__dbgov-bar').length === 1,
  `${window.document.querySelectorAll('#__dbgov-bar').length} panels`);

dom.window.close();

console.log(`\n${failed ? '✗' : '✓'} ${failed} failure(s)\n`);
process.exit(failed ? 1 : 0);
