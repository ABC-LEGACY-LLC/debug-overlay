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
       <p id="c" style="color:#bbb">faint text nobody can read</p>
       <div style="background:oklch(0.275 0 0)">
         <p id="d" style="color:oklch(0.985 0 0)">near-white on dark, ~10.9:1</p>
       </div>
       <div style="background:rgb(20,20,20)">
         <p id="e" style="background:rgb(240,240,240);color:rgb(200,200,200)">a chip on a dark page</p>
       </div>
       <p id="f" style="background-image:linear-gradient(red,blue);color:#777">on a gradient</p>
       <p id="h" style="display:none;color:#bbb">unreadable, and nobody can see it</p>
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
// the lens emits <span class="warn"> itself now, so its markup and the rule
// that colours it have to ship from the same file
ok('lens CSS reached the stylesheet',
  !!style && style.textContent.includes('.dbgov-badge .warn'),
  'grid lens css missing');

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

console.log('\nREPORT');
// The report is the only place a rule's audit() hook is observable from
// outside the IIFE: stub the clipboard and read what it was handed.
let copied = null;
Object.defineProperty(window.navigator, 'clipboard',
  { value: { writeText: async (t) => { copied = t; } }, configurable: true });
window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
bar.querySelector('[data-tool="contrast"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true }));
const pin = (id) => {
  window.document.elementFromPoint = () => window.document.getElementById(id);
  window.document.getElementById(id).dispatchEvent(
    new window.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
};
pin('c');            // 1.92:1 — fails AA
pin('a');            // black on white — passes
pin('d');            // oklch on oklch — a colour space we cannot read
bar.querySelector('[data-copy]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('the report is built and copied', typeof copied === 'string', String(copied).slice(0, 40));
ok('a failing element produces a finding',
  /## findings/.test(copied || '') && /\[error\] contrast-aa/.test(copied || ''),
  'audit() hook produced nothing');
ok('a passing element produces none',
  ((copied || '').match(/\[error\]|\[warn\]/g) || []).length === 1,
  'the readable element was reported as a problem too');
// Three pins: one fails, one passes, one cannot be measured at all. The last
// used to be folded into the same empty array as the pass, so a page the tool
// could not read came back clean. It is a third answer and it says so.
ok('what cannot be measured is put up for review, not passed',
  /\[review\] contrast-aa/.test(copied || ''),
  'the unmeasurable element was silently counted as fine');
ok('and the review says what stopped it',
  /not measured — no canvas is available/.test(copied || ''),
  ((/not measured[^\n]*/.exec(copied || '') || [])[0]) || 'no reason given');

console.log('\nBACKGROUND');
// #e is light grey text on a light chip, and the chip sits on a dark page.
// Reading the background from the PARENT scores it against the dark page and
// calls 11:1 — the reader sees 1.4:1. An element paints its own background
// behind its own text.
const only = (id) => {
  window.document.querySelectorAll('button.act[data-clear]')
    .forEach((b) => b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  pin(id);
  bar.querySelector('[data-copy]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return copied || '';
};
const chip = only('e');
const chipRatio = parseFloat((/contrast: ([\d.]+):1/.exec(chip) || [])[1]);
ok('an element is scored on its own background', chipRatio > 1 && chipRatio < 2,
  `got ${chipRatio} — above 10 means it read the page behind the chip`);
ok('and that is a finding', /\[error\] contrast-aa/.test(chip),
  'unreadable text on a chip has to be reported');

const grad = only('f');
ok('a background image is unknown, not white',
  /contrast: not measured — it sits on an image or gradient/.test(grad),
  'reading through a gradient to the white default is the confident wrong answer');

console.log('\nSWEEP');
// The whole point is that this needs nothing pinned.
window.document.querySelectorAll('#__dbgov-bar [data-clear]')
  .forEach((b) => b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
bar.querySelector('[data-sweep]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
bar.querySelector('[data-copy]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const swept = copied || '';
ok('a sweep audits the page with nothing pinned',
  /## findings \(4\) — whole page/.test(swept),
  swept.slice(swept.indexOf('## findings')).split('\n')[0] || 'no findings section');
// two it measured and two it could not, and the two kinds do not blur
ok('measured and unmeasurable are separate counts',
  (swept.match(/\[error\]|\[warn\]/g) || []).length === 2 &&
  (swept.match(/\[review\]/g) || []).length === 2,
  swept.slice(swept.indexOf('## findings')));
ok('reviews sort below anything measured',
  swept.indexOf('[review]') > swept.lastIndexOf('[error]'),
  'a thing to go and look at outranked a thing you can act on');
// A zero that means "nothing was checked" and a zero that means "nothing is
// wrong" must not print the same line, so the scope travels with the count.
ok('the report says what was checked',
  /— whole page · 1 rule · \d+ elements/.test(swept),
  swept.slice(swept.indexOf('## findings')).split('\n')[0]);
// Arming decides what is DRAWN. With the only rule disarmed the page still
// has the same problems, and the audit still has to find them.
bar.querySelector('[data-tool="contrast"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
bar.querySelector('[data-sweep]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
bar.querySelector('[data-copy]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('a disarmed rule is still swept', /## findings \(4\)/.test(copied || ''),
  'the sweep followed the toggle instead of the page');
bar.querySelector('[data-tool="contrast"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('two different colour pairs stay two findings',
  (swept.match(/\[error\] contrast-aa/g) || []).length === 2,
  'they collapsed — key is not distinguishing them');
// display:none is gated before any rule runs: invisible text is not a
// contrast problem, and a rule would pay a full ancestor walk to find out.
ok('a hidden element is skipped', !/#h/.test(swept), 'display:none was audited');
ok('the pin blocks are gone but the audit remains', !/\[#1\]/.test(swept),
  'a sweep does not need pins, and clearing them must not clear it');

console.log('\nHONEST ZERO');
// The sentence a clean page gets is the most-read line in the product, and it
// used to claim "every rule is happy" on pages where no rule had run at all.
{
  const clean = new JSDOM('<!doctype html><html><body><p style="color:#000">readable</p></body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true, runScripts: 'outside-only',
      virtualConsole: new VirtualConsole() });
  const wc = clean.window;
  wc.HTMLElement.prototype.scrollIntoView = function () {};
  wc.eval(source);
  const barc = wc.document.getElementById('__dbgov-bar');
  wc.dispatchEvent(new wc.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  barc.querySelector('[data-sweep]').dispatchEvent(new wc.MouseEvent('click', { bubbles: true }));
  const msg = (wc.document.querySelector('#__dbgov-list .empty') || {}).textContent || '';
  ok('a clean page reports its scope, not a mood', /1 rule over \d+ elements/.test(msg), msg);
  ok('and never claims every rule is happy', !/happy/.test(msg), msg);
  clean.window.close();
}

console.log('\nFINDINGS LIST');
window.HTMLElement.prototype.scrollIntoView = function () {};   // jsdom has none
const listEl = window.document.getElementById('__dbgov-list');
ok('the sweep opens its own view', listEl.classList.contains('open'));
const rows = () => [...listEl.querySelectorAll('.row')];
ok('one row per distinct problem', rows().length === 4, `${rows().length} rows`);
ok('worst first', (rows()[0]?.querySelector('.tag') || {}).textContent === 'error');
ok('reviews are marked as such, and come last',
  rows().slice(-2).every((r) => r.dataset.accent === 'review'),
  rows().map((r) => r.dataset.accent).join(', '));
ok('a finding has no remove button', !listEl.querySelector('.rm'),
  'there is no pin behind a finding for a ✕ to drop');
// A finding is a place on the page. Clicking one should take you there and
// leave something behind that the badge and the report can both use.
rows()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
// the count chip is painted by the renderer on the next frame, so ask the
// pin list instead — it is rebuilt synchronously
bar.querySelector('[data-c]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('clicking a finding pins its element', rows().length === 1,
  `${rows().length} pin rows after clicking one finding`);
ok('and the chip still means pins', !!listEl.querySelector('.rm'),
  'switching views lost the remove button');
window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));

console.log('\nCANVAS');
// jsdom has no canvas, so the section above only proves the fallback stays
// quiet. This proves the other half: given a context, the same oklch that
// used to read as 1.00:1 FAIL is measured correctly instead.
{
  const dom2 = makeDom();
  const w2 = dom2.window;
  const PAINT = {                       // what a browser would rasterise these to
    'oklch(0.985 0 0)': [250, 250, 250, 255],
    'oklch(0.275 0 0)': [58, 58, 58, 255],
  };
  const realCreate = w2.document.createElement.bind(w2.document);
  w2.document.createElement = (tag) => {
    if (String(tag).toLowerCase() !== 'canvas') return realCreate(tag);
    let fill = '#000000';
    const ctx = {
      // a real context keeps its previous value when handed a colour it does
      // not understand — that is what the two-probe check detects
      get fillStyle() { return fill; },
      set fillStyle(v) {
        if (PAINT[v]) fill = v;
        else if (/^#[0-9a-f]{3,8}$/i.test(v)) fill = v.length === 4
          ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v.toLowerCase();
      },
      clearRect() {}, fillRect() {},
      getImageData: () => ({ data: PAINT[fill] || [0, 0, 0, 255] }),
    };
    return { width: 0, height: 0, getContext: () => ctx };
  };

  let copied2 = null;
  Object.defineProperty(w2.navigator, 'clipboard',
    { value: { writeText: async (t) => { copied2 = t; } }, configurable: true });
  w2.eval(source);
  const bar2 = w2.document.getElementById('__dbgov-bar');
  w2.dispatchEvent(new w2.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar2.querySelector('[data-tool="contrast"]').dispatchEvent(
    new w2.MouseEvent('click', { bubbles: true }));
  w2.document.elementFromPoint = () => w2.document.getElementById('d');
  w2.document.getElementById('d').dispatchEvent(
    new w2.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  bar2.querySelector('[data-copy]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));

  const ratio = parseFloat((/contrast: ([\d.]+):1/.exec(copied2 || '') || [])[1]);
  ok('a painted colour gets a verdict', ratio > 0, 'no contrast line at all');
  ok('oklch resolves to the real ratio', ratio > 10 && ratio < 12,
    `got ${ratio} — 1.00 is the old misreading, 10.9 is the truth`);
  ok('and so produces no finding', !/## findings/.test(copied2 || ''),
    'near-white on dark passes AA — a finding here means it was misread');
  dom2.window.close();
}

console.log('\nGUARD');
// running twice must not build a second panel — Tampermonkey can inject again
// on soft navigations, and two overlays fighting over the same keys is worse
// than none.
window.eval(source);
ok('second evaluation is a no-op',
  window.document.querySelectorAll('#__dbgov-bar').length === 1,
  `${window.document.querySelectorAll('#__dbgov-bar').length} panels`);

// ---- the sections that need a painted frame ---------------------------------
// Marks and badges only exist after the renderer runs, which is an animation
// frame away. Everything above is synchronous; these are not, so they go last
// and take the summary with them. Asserting before the frame lands passes for
// the wrong reason: no badge, no injected tag either.
const dom3 = makeDom();
const w3 = dom3.window;
const evil = w3.document.createElement('div');
evil.id = '"><img src=x onerror="void 0">';   // page-authored, hostile
evil.textContent = 'hostile id';
w3.document.body.append(evil);
w3.eval(source);
const bar3 = w3.document.getElementById('__dbgov-bar');
w3.dispatchEvent(new w3.KeyboardEvent('keydown', { ...hot, bubbles: true }));
bar3.querySelector('[data-detail]').dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
w3.document.elementFromPoint = () => evil;
evil.dispatchEvent(new w3.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));

// re-sweep the first page so its marks are on screen for the frame below
window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
bar.querySelector('[data-sweep]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

setTimeout(() => {
  console.log('\nMARKS');
  // A findings list says what is wrong; a mark says where. The renderer hands
  // each armed tool its own findings and nobody else's, so the layer stays
  // attributable and there is nothing to undo.
  const marks = () => window.document.querySelectorAll('#__dbgov-root .dbgov-flag');
  ok('findings are marked on the page', marks().length > 0,
    'the sweep produced findings that appear nowhere on screen');
  ok('a review is not painted as a failure',
    [...marks()].some((m) => m.classList.contains('review')) &&
    [...marks()].some((m) => m.classList.contains('error')),
    [...marks()].map((m) => m.className.replace('dbgov-box dbgov-flag ', '')).join(' / '));
  dom.window.close();

  console.log('\nESCAPING');
  const badge = w3.document.querySelector('#__dbgov-root .dbgov-badge');
  ok('the badge rendered at all', !!badge,
    'without it the next two assertions prove nothing');
  ok('a hostile id builds no markup',
    w3.document.querySelectorAll('#__dbgov-root img').length === 0,
    'the overlay rendered a tag the page authored');
  ok('and the id is still shown, as text',
    !!badge && badge.textContent.includes('<img'),
    badge ? JSON.stringify(badge.textContent.slice(-30)) : 'no badge');
  dom3.window.close();

  console.log(`\n${failed ? '✗' : '✓'} ${failed} failure(s)\n`);
  process.exit(failed ? 1 : 0);
}, 80);
