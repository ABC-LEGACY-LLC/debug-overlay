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

const sheets = root ? [...root.querySelectorAll('style')] : [];
const cssOf = (who) => (sheets.find((s) => (s.dataset.tool || 'core') === who) || {}).textContent || '';
ok('stylesheet injected', sheets.length > 0 && sheets[0].textContent.length > 0);
// One sheet per tool is the containment: a parser that gives up takes the
// rest of ITS sheet with it and nothing else.
ok('each tool ships its own sheet',
  ['measure', 'grid', 'contrast'].every((id) => cssOf(id).length > 0),
  sheets.map((s) => s.dataset.tool || 'core').join(', '));
ok('tool CSS reached its sheet', cssOf('measure').includes('.dbgov-line'),
  'measure tool css missing');
// the lens emits <span class="warn"> itself, so its markup and the rule that
// colours it have to ship from the same file
ok('lens CSS reached its sheet', cssOf('grid').includes('.dbgov-badge .warn'),
  'grid lens css missing');

console.log('\nSTYLESHEET');
// Malformed CSS never fails loudly: the parser drops the broken rule and
// every rule after it in that sheet, and raises nothing. Each sheet is
// checked on its own, and a failure names the file that has to fix it.
function readCss(text) {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '""');
  let depth = 0, parens = 0, topLevel = 0, stray = false;
  for (const ch of bare) {
    if (ch === '(') parens++;
    else if (ch === ')') parens--;
    else if (parens > 0) continue;        // braces inside gradient()/url() are data
    else if (ch === '{') { if (depth === 0) topLevel++; depth++; }
    else if (ch === '}') { if (--depth < 0) { stray = true; depth = 0; } }
  }
  return { depth, parens, topLevel, stray };
}
const broken = { braces: [], parens: [], dropped: [] };
for (const s of sheets) {
  const who = s.dataset.tool || 'core';
  const m = readCss(s.textContent);
  if (m.depth !== 0 || m.stray) broken.braces.push(who);
  if (m.parens !== 0) broken.parens.push(who);
  const kept = s.sheet ? s.sheet.cssRules.length : 0;
  if (kept !== m.topLevel) broken.dropped.push(`${who}: wrote ${m.topLevel}, kept ${kept}`);
}
ok('braces balance in every sheet', !broken.braces.length, broken.braces.join(', '));
ok('parens balance in every sheet', !broken.parens.length, broken.parens.join(', '));
ok('no rule dropped by the parser', !broken.dropped.length, broken.dropped.join('; '));

// the tool registered last is the one a shared sheet used to eat first
const lastSheet = sheets[sheets.length - 1];
ok('the last tool\'s CSS survives',
  !!lastSheet.sheet && [...lastSheet.sheet.cssRules].some(
    (r) => r.selectorText && r.selectorText.includes('.dbgov-badge')),
  `${lastSheet.dataset.tool} sheet kept ${lastSheet.sheet ? lastSheet.sheet.cssRules.length : 0} rules`);

console.log('\nPANEL');
const bar = window.document.getElementById('__dbgov-bar');
ok('panel built', !!bar);
const status = bar && bar.querySelector('[data-st]');
ok('boots powered off', !!status && status.textContent === 'OFF');

const buttons = bar ? [...bar.querySelectorAll('button.tool')] : [];
const ids = buttons.map((b) => b.dataset.tool).sort();
ok('a button per registered tool', ids.length === 4, `got ${ids.length}: ${ids.join(', ')}`);
ok('tool ids match the registry',
  ids.join(',') === 'contrast,dupid,grid,measure', ids.join(','));
// Two toggles that look identical and mean different things was the problem:
// arming grid or contrast changes what ⌕ finds, arming measure does not.
const checks = buttons.filter((b) => b.classList.contains('checks')).map((b) => b.dataset.tool).sort();
ok('the tools that feed the audit are marked as such',
  checks.join(',') === 'contrast,dupid,grid', checks.join(',') || 'none marked');
ok('and they are separated from the ones that only draw',
  bar.querySelectorAll('button.tool + hr.sep, hr.sep + button.tool').length >= 2,
  'the runs are not divided by a rule');
ok('⌕ sits with the run it sweeps',
  checks.includes(bar.querySelector('[data-sweep]').previousElementSibling?.dataset.tool),
  `after ${bar.querySelector('[data-sweep]').previousElementSibling?.dataset.tool || 'nothing'}`);

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
  /— whole page · 3 rules · \d+ elements/.test(swept),
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

console.log('\nTWO ROLES');
// grid decorates other tools' numbers AND produces findings. The old
// one-label-per-tool taxonomy made that impossible for no reason but the
// shape of the label.
{
  const g = new JSDOM('<!doctype html><html><body>' +
    '<div style="padding:7px"><p style="color:#000">a</p></div>' +
    '<div style="padding:11px"><p style="color:#000">b</p></div>' +
    '<div style="padding:7px"><p style="color:#000">c</p></div>' +
    // what ml-auto arrives as, and a real token just under the ceiling
    '<div style="margin-left:1127px">layout worked this out</div>' +
    '<div style="padding:95px">somebody typed this</div></body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true, runScripts: 'outside-only',
      virtualConsole: new VirtualConsole() });
  const wg = g.window;
  wg.HTMLElement.prototype.scrollIntoView = function () {};
  let gcopy = null;
  Object.defineProperty(wg.navigator, 'clipboard',
    { value: { writeText: async (t) => { gcopy = t; } }, configurable: true });
  wg.eval(source);
  const barg = wg.document.getElementById('__dbgov-bar');
  wg.dispatchEvent(new wg.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  barg.querySelector('[data-sweep]').dispatchEvent(new wg.MouseEvent('click', { bubbles: true }));
  barg.querySelector('[data-copy]').dispatchEvent(new wg.MouseEvent('click', { bubbles: true }));
  ok('a lens can also be a rule', /grid-off/.test(gcopy || ''),
    'grid produced no findings, so the sweep still cannot see it');
  // width and height are what layout PRODUCED; padding, margin and gap are
  // what somebody typed. Sweeping the first buried the second on a real page.
  ok('the audit judges authored spacing, not computed size',
    !/\d+px is off[\s\S]*?\n {4}span/.test(gcopy || '') &&
    /gap|7px|11px/.test(gcopy || ''),
    ((/\[info\][^\n]*/.exec(gcopy || '') || [])[0]) || 'nothing');
  // getComputedStyle resolves margin:auto to the pixels it worked out, and
  // nothing distinguishes that from a typed value — except that nobody types
  // 1127px. Above the ceiling is layout arithmetic.
  ok('layout arithmetic is not a spacing decision',
    !/1127px/.test(gcopy || ''), 'an auto margin was reported as off-grid');
  ok('and a real token just under the ceiling survives',
    /95px is off the 2px grid/.test(gcopy || ''),
    'the ceiling is swallowing values somebody actually typed');
  // keyed by value: 7px used twice is one decision, not two mistakes. Two
  // divs at 7px and one at 11px = 8 raw findings, 2 lines.
  ok('off-grid values group by value, not by element',
    /grid-off ×8: 7px is off the 2px grid/.test(gcopy || ''),
    ((/\[info\][^\n]*/.exec(gcopy || '') || [])[0]) || 'no grid finding');
  g.window.close();
}

console.log('\nPAGE RULES');
// audit(info) is blind to this by construction: each of these elements is
// perfectly correct on its own, and only the second one makes either wrong.
{
  const dup = new JSDOM('<!doctype html><html><body>' +
    '<label for="email">Email</label><input id="email">' +
    '<div id="email">a second one</div><span id="email">a third</span>' +
    '<p id="unique">fine</p>' +
    // what React and base-ui emit: a new one on every render
    '<div id="base-ui-:r1t9:"><p style="color:#999">faint</p></div></body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true, runScripts: 'outside-only',
      virtualConsole: new VirtualConsole() });
  const wd = dup.window;
  wd.HTMLElement.prototype.scrollIntoView = function () {};
  let dcopy = null;
  Object.defineProperty(wd.navigator, 'clipboard',
    { value: { writeText: async (t) => { dcopy = t; } }, configurable: true });
  wd.eval(source);
  const bard = wd.document.getElementById('__dbgov-bar');
  wd.dispatchEvent(new wd.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bard.querySelector('[data-sweep]').dispatchEvent(new wd.MouseEvent('click', { bubbles: true }));
  bard.querySelector('[data-copy]').dispatchEvent(new wd.MouseEvent('click', { bubbles: true }));
  ok('a page-wide rule sees what no element could',
    /\[error\] dup-id: id "email" is used 3 times/.test(dcopy || ''),
    ((/dup-id[^\n]*/.exec(dcopy || '') || [])[0]) || 'no dup-id finding');
  ok('a unique id is not a finding', !/"unique"/.test(dcopy || ''),
    'every id was reported, not just the repeated one');
  // the report has to make sense to whoever picks up the ticket, not only to
  // the person who already knew the rule
  // once, in its own section — under every finding it made a real report
  // unreadable, ninety of them carrying the same three lines
  ok('the report documents its rules',
    /## rules[\s\S]*An id must be unique in a document\./.test(dcopy || '') &&
    /https:\/\/developer\.mozilla\.org/.test(dcopy || ''),
    'the rule id is bare — no help, no link');
  ok('and documents each one once',
    ((dcopy || '').match(/An id must be unique/g) || []).length === 1,
    `${((dcopy || '').match(/An id must be unique/g) || []).length} copies`);
  // A generated id is the worst address in the document: it changes on the
  // next render, so a finding that names one cannot be found twice.
  ok('a generated id is not used as an address',
    !/^ {4}#base-ui/m.test(dcopy || ''),
    ((/^ {4}#base-ui.*/m.exec(dcopy || '') || [])[0]) || '');
  ok('and an id a person chose still is', /^ {4}#email$/m.test(dcopy || ''),
    'the best address there is was thrown away with the generated ones');
  dup.window.close();
}

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
  ok('a clean page reports its scope, not a mood', /3 rules over \d+ elements/.test(msg), msg);
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

console.log('\nSETTINGS');
/**
 * The panel is meant to be the only place a tool is controlled. That is only
 * true if moving a picker changes what the RULE DOES — a control surface that
 * merely remembers what you picked is a preferences screen wired to nothing.
 * 12px is on a 2px grid and off an 8px one, so the same element has to change
 * verdict when nothing about it changed but the setting.
 */
{
  const page = `<!doctype html><html><body>
     <div id="p" style="padding:12px">twelve</div></body></html>`;
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const d4 = new JSDOM(page, opts);
  const w4 = d4.window;
  w4.eval(source);
  const bar4 = w4.document.getElementById('__dbgov-bar');
  const list4 = w4.document.getElementById('__dbgov-list');
  const hit = (sel) => bar4.querySelector(sel)
    .dispatchEvent(new w4.MouseEvent('click', { bubbles: true }));
  const rowsOf = () => [...list4.querySelectorAll('.row')];
  const labelled = (t) => rowsOf().find((r) => r.querySelector('.lbl').textContent === t);
  const messages = () => rowsOf().map((r) => r.querySelector('.lbl').textContent).join(' | ');

  // built by build.js, so the assertion is against the bundle, not the source
  ok('the version placeholder is substituted', !source.includes(['__VER', 'SION__'].join('')),
    'it shipped unreplaced — the overlay cannot say which version it is');
  ok('and the panel states the version', bar4.querySelector('.pwr').title.includes(`v${cfg.version}`),
    bar4.querySelector('.pwr').title);

  w4.dispatchEvent(new w4.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  hit('[data-settings]');
  ok('⚙ opens a view of its own', list4.classList.contains('open') && rowsOf().length > 0,
    `${rowsOf().length} rows`);
  ok('every setting is a control, not a read-out',
    rowsOf().length > 0 && rowsOf().every((r) => r.querySelector('select.opt')),
    rowsOf().map((r) => r.querySelector('.lbl').textContent).join(', '));
  const step = labelled('Grid step');
  ok('a tool contributes its own options', !!step, messages());
  ok('and the picker shows what is actually in force',
    !!step && step.querySelector('select').selectedOptions[0].textContent === '2px',
    step ? step.querySelector('select').selectedOptions[0].textContent : 'no row');

  hit('[data-sweep]');
  ok('12px is on the 2px grid to begin with', !/off the 2px grid/.test(messages()), messages());

  // The only opener for the findings view is the sweep button, which would
  // re-audit and hide exactly what this is checking. The report states its own
  // scope, so ask there instead.
  let copied4 = null;
  Object.defineProperty(w4.navigator, 'clipboard',
    { value: { writeText: async (t) => { copied4 = t; } }, configurable: true });
  hit('[data-copy]');
  ok('a live sweep reports its scope', /— whole page/.test(copied4 || ''),
    'without this the next assertion passes for the wrong reason');

  hit('[data-settings]');
  const sel4 = labelled('Grid step').querySelector('select');
  sel4.selectedIndex = [...sel4.options].findIndex((o) => o.textContent === '8px');
  sel4.dispatchEvent(new w4.Event('change'));

  hit('[data-copy]');
  ok('changing a setting drops the sweep it invalidated',
    !/— whole page/.test(copied4 || ''),
    'findings judged under the old setting outlived it');

  hit('[data-sweep]');
  ok('the rule now judges by the new setting', /off the 8px grid/.test(messages()), messages());

  const saved = w4.localStorage.getItem('__dbgov_settings');
  ok('the choice is persisted', !!saved && /"step":8/.test(saved), String(saved));

  // "install once and never set anything up again" is only true if the choice
  // outlives the page it was made on
  const d5 = new JSDOM(page, opts);
  d5.window.localStorage.setItem('__dbgov_settings', saved);
  d5.window.eval(source);
  const bar5 = d5.window.document.getElementById('__dbgov-bar');
  d5.window.dispatchEvent(new d5.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar5.querySelector('[data-settings]')
    .dispatchEvent(new d5.window.MouseEvent('click', { bubbles: true }));
  const back = [...d5.window.document.querySelectorAll('#__dbgov-list .row')]
    .find((r) => r.querySelector('.lbl').textContent === 'Grid step');
  ok('and it is restored on the next load',
    !!back && back.querySelector('select').selectedOptions[0].textContent === '8px',
    back ? back.querySelector('select').selectedOptions[0].textContent : 'no row');

  // A value the tool no longer offers must not silently read as choice 0 —
  // the picker would then disagree with the rule it claims to drive.
  const d6 = new JSDOM(page, opts);
  d6.window.localStorage.setItem('__dbgov_settings', '{"grid":{"step":37}}');
  d6.window.eval(source);
  const bar6 = d6.window.document.getElementById('__dbgov-bar');
  d6.window.dispatchEvent(new d6.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar6.querySelector('[data-settings]')
    .dispatchEvent(new d6.window.MouseEvent('click', { bubbles: true }));
  const stale = [...d6.window.document.querySelectorAll('#__dbgov-list .row')]
    .find((r) => r.querySelector('.lbl').textContent === 'Grid step');
  ok('a value the tool dropped falls back to its default',
    !!stale && stale.querySelector('select').selectedOptions[0].textContent === '2px',
    stale ? stale.querySelector('select').selectedOptions[0].textContent : 'no row');

  d4.window.close(); d5.window.close(); d6.window.close();
}

console.log('\nSTORAGE');
/**
 * localStorage is scoped to one origin and this script matches every site, so
 * everything the user chose had to be chosen again on the next domain. The
 * grant buys storage that is per SCRIPT — at the price of running in the
 * manager's sandbox, which is what the guard assertions below are about.
 */
{
  const meta = fs.readFileSync(path.join(ROOT, 'dist', cfg.metaFile), 'utf8');
  ok('the header asks for the storage API',
    /@grant\s+GM_getValue/.test(meta) && /@grant\s+GM_setValue/.test(meta),
    'without the grant the API is not defined and nothing syncs');
  ok('and leaves frames to the manager', /@noframes/m.test(meta),
    'a sandboxed script cannot reliably recognise a cross-origin frame itself');

  const page = `<!doctype html><html><body><div id="p">x</div></body></html>`;
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const withGm = (dom) => {
    const store = new Map();
    dom.window.GM_getValue = (k) => (store.has(k) ? store.get(k) : undefined);
    dom.window.GM_setValue = (k, v) => { store.set(k, v); };
    return store;
  };
  const armedIn = (w) => [...w.document.querySelectorAll('#__dbgov-bar button.tool.armed')]
    .map((b) => b.dataset.tool).sort().join(',');

  // ---- writes go to the script store, not the origin ----------------------
  const d7 = new JSDOM(page, opts);
  const gm7 = withGm(d7);
  d7.window.eval(source);
  const bar7 = d7.window.document.getElementById('__dbgov-bar');
  d7.window.dispatchEvent(new d7.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar7.querySelector('[data-tool="contrast"]')
    .dispatchEvent(new d7.window.MouseEvent('click', { bubbles: true }));
  ok('a choice is written where every site can read it',
    gm7.get('__dbgov_tools') === '["measure","grid","contrast"]',
    JSON.stringify(gm7.get('__dbgov_tools')));
  ok('and not into this one origin',
    d7.window.localStorage.getItem('__dbgov_tools') === null,
    'writing both leaves two answers to the same question');

  // ---- a soft navigation may re-inject into a FRESH sandbox ---------------
  // Same document, new window: the flag the old guard relied on is gone, and
  // two overlays on one page fight over the same hotkey.
  delete d7.window.__DBG_OVERLAY__;
  d7.window.eval(source);
  ok('a fresh sandbox on the same page builds no second panel',
    d7.window.document.querySelectorAll('#__dbgov-bar').length === 1,
    `${d7.window.document.querySelectorAll('#__dbgov-bar').length} panels`);

  // ---- nobody loses what they already had ---------------------------------
  const d8 = new JSDOM(page, opts);
  const gm8 = withGm(d8);
  d8.window.localStorage.setItem('__dbgov_tools', '["contrast"]');
  d8.window.eval(source);
  ok('what an origin already had is adopted, not discarded',
    gm8.get('__dbgov_tools') === '["contrast"]',
    'shipping the grant would have reset every existing user');
  ok('and it is actually in force', armedIn(d8.window) === 'contrast',
    armedIn(d8.window) || '(nothing armed)');

  // ---- and it still works where the API does not exist --------------------
  // the dev page, the tests, and any manager without GM_* — falling back is
  // what keeps those from silently forgetting everything
  const d9 = new JSDOM(page, opts);
  d9.window.eval(source);
  const bar9 = d9.window.document.getElementById('__dbgov-bar');
  d9.window.dispatchEvent(new d9.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar9.querySelector('[data-tool="contrast"]')
    .dispatchEvent(new d9.window.MouseEvent('click', { bubbles: true }));
  ok('with no GM API it falls back to the origin',
    d9.window.localStorage.getItem('__dbgov_tools') === '["measure","grid","contrast"]',
    JSON.stringify(d9.window.localStorage.getItem('__dbgov_tools')));

  // ---- the frame check, exercised directly --------------------------------
  // frameElement is the identity-free half of this; @noframes is the other.
  const d10 = new JSDOM(page, opts);
  Object.defineProperty(d10.window, 'frameElement',
    { value: d10.window.document.createElement('iframe'), configurable: true });
  d10.window.eval(source);
  ok('a framed document gets no overlay',
    !d10.window.document.getElementById('__dbgov-bar'),
    'the overlay started inside a frame');

  [d7, d8, d9, d10].forEach((d) => d.window.close());
}

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
