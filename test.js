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

/**
 * The tools as they exist on disk. Derived, never listed: a test that names
 * the four tools it expects fails the day a fifth lands, which trains everyone
 * to edit the expectation instead of reading it — and the next real regression
 * gets edited away with it.
 */
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const TOOLS_ON_DISK = fs.readdirSync(path.join(ROOT, 'src', 'tools'))
  .filter((f) => f.endsWith('.js')).sort()
  .map((f) => noComments(fs.readFileSync(path.join(ROOT, 'src', 'tools', f), 'utf8')))
  .map((s) => ({
    id: (s.match(/id: '([a-z][a-z0-9-]*)'/) || [])[1],
    // the same test the panel groups by: either hook contributes findings
    judges: /(^|[^.\w])(audit|auditPage)\s*\(/m.test(s),
  }));
const idsOnDisk = TOOLS_ON_DISK.map((t) => t.id).sort();

/**
 * A crash is not a pass. This suite died mid-run for two releases and printed
 * no ✗ anywhere — just a stack trace — so anything reading the output for
 * failures found none and called it green. The summary line is the contract:
 * if the run ends without one, it ended badly.
 */
process.on('uncaughtException', (e) => {
  console.log(`\n✗ SUITE CRASHED — ${e.message}`);
  console.log(`    ${(e.stack || '').split('\n')[1] || ''}`.trimEnd());
  console.log('\n✗ the run stopped here, so nothing after this point was checked\n');
  process.exit(1);
});

/** Checks that need a painted frame. Run inside the final block, never on a
 *  timer of their own — a second timer racing the summary decides the exit
 *  code by luck. */
const pendingChecks = [];

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
const bar0 = window.document.getElementById('__dbgov-bar');
ok('root element appended', !!root);
/* This asserted aria-hidden="true" on the root, which was the DEFECT: the root
   holds 13 tabbable buttons, so it told assistive tech the subtree did not
   exist while keyboard focus could still land in it (axe aria-hidden-focus,
   WCAG 4.1.2). The right invariants are that the root is named, the decorative
   layer is hidden, and the whole thing is inert while powered off. */
ok('the root is named, not hidden',
  root && root.getAttribute('aria-hidden') === null &&
  root.getAttribute('aria-label') === 'Debug overlay',
  `aria-hidden=${root && root.getAttribute('aria-hidden')}`);
ok('the decorative layer is hidden from a11y',
  !!root && [...root.children].some((c) =>
    c.tagName === 'DIV' && c.getAttribute('aria-hidden') === 'true'),
  'the painted layer carries no text anyone needs announced');
/* NEVER inert. jsdom sets the attribute without implementing its semantics, so
   this can only assert the attribute is absent — but in a real browser inert
   disables the whole subtree, and that includes ⏻ and the grip. v3.8.48 shipped
   with it and the panel could not be switched back on by mouse at all. What
   inert was meant to achieve is already true: everything that should be
   unreachable when off is `display: none`. */
ok('the overlay is never made inert', root && !root.hasAttribute('inert'),
  'inert would take the power button and the drag grip with it');
const shownOff = () => [...(bar0 ? bar0.querySelectorAll('button') : [])]
  .filter((b) => window.getComputedStyle(b).display !== 'none');
ok('and powered off, only the power control is reachable',
  shownOff().length === 1 && shownOff()[0].classList.contains('pwr'),
  shownOff().map((b) => b.className).join(', ') || 'nothing reachable at all');

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
const lastWrote = readCss(lastSheet.textContent).topLevel;
const lastKept = lastSheet.sheet ? lastSheet.sheet.cssRules.length : 0;
ok('the last tool\'s CSS survives', lastWrote > 0 && lastKept === lastWrote,
  `${lastSheet.dataset.tool} wrote ${lastWrote}, kept ${lastKept}`);

console.log('\nPANEL');
const bar = window.document.getElementById('__dbgov-bar');
ok('panel built', !!bar);
const status = bar && bar.querySelector('[data-st]');
ok('boots powered off', !!status && status.textContent === 'OFF');

const buttons = bar ? [...bar.querySelectorAll('button.tool')] : [];
const ids = buttons.map((b) => b.dataset.tool).sort();
ok('a button per registered tool', ids.length === idsOnDisk.length,
  `got ${ids.length}: ${ids.join(', ')} — src/tools has ${idsOnDisk.length}`);
ok('tool ids match the registry',
  ids.join(',') === idsOnDisk.join(','), `${ids.join(',')} vs ${idsOnDisk.join(',')}`);
// Two toggles that look identical and mean different things was the problem:
// arming grid or contrast changes what ⌕ finds, arming measure does not.
const checks = buttons.filter((b) => b.classList.contains('checks')).map((b) => b.dataset.tool).sort();
const judgesOnDisk = TOOLS_ON_DISK.filter((t) => t.judges).map((t) => t.id).sort();
ok('the tools that feed the audit are marked as such',
  checks.join(',') === judgesOnDisk.join(','),
  `${checks.join(',') || 'none marked'} vs ${judgesOnDisk.join(',')}`);
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
// derived: naming a tool here is how this file crashed when one was renamed
const judge = TOOLS_ON_DISK.find((t) => t.judges && /contrast/.test(t.id));
ok('a contrast rule exists to arm', !!judge, idsOnDisk.join(', '));
bar.querySelector(`[data-tool="${judge.id}"]`).dispatchEvent(
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
  /## findings — 4 problems · 4 occurrences · whole page/.test(swept),
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
  /· whole page · 3 rules · \d+ elements/.test(swept),
  swept.slice(swept.indexOf('## findings')).split('\n')[0]);
// Arming decides what is DRAWN. With the only rule disarmed the page still
// has the same problems, and the audit still has to find them.
bar.querySelector('[data-tool="contrast"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
bar.querySelector('[data-sweep]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
bar.querySelector('[data-copy]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('a disarmed rule is still swept', /## findings — 4 problems/.test(copied || ''),
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
  // Rows under a ROLE heading are settings and must be controls. Rows under
  // "Keys" are the gesture legend — deliberately read-only, since a gesture is
  // not something you set.
  const settingRows = () => {
    const out = [];
    let inKeys = false;
    for (const n of list4.children) {
      if (n.classList.contains('head')) { inKeys = n.childNodes[0].textContent === 'Keys'; continue; }
      if (n.classList.contains('viewhead')) continue;
      if (!inKeys) out.push(n);
    }
    return out;
  };
  ok('every setting is a control, not a read-out',
    settingRows().length > 0 && settingRows().every((r) => r.querySelector('.opt')),
    settingRows().filter((r) => !r.querySelector('.opt'))
      .map((r) => r.querySelector('.lbl').textContent).join(', ') || 'none missing');
  ok('and the gestures are listed where the user already is',
    [...list4.querySelectorAll('.row .tag')].some((t) => /Alt\+click/.test(t.textContent)),
    'Alt+click, the remove key and Esc existed nowhere in the running UI');
  // a list cannot express a threshold you type or a thing that is simply on
  ok('a choice, a number and a toggle all render',
    !!labelled('Grid step').querySelector('select.opt') &&
    labelled('Ignore above').querySelector('input.opt').type === 'number' &&
    labelled('Judge width & height').querySelector('input.opt').type === 'checkbox',
    rowsOf().map((r) => (r.querySelector('.opt') || {}).tagName).join(', '));
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
  ok('a live sweep reports its scope', /· whole page/.test(copied4 || ''),
    'without this the next assertion passes for the wrong reason');

  hit('[data-settings]');
  const sel4 = labelled('Grid step').querySelector('select');
  sel4.selectedIndex = [...sel4.options].findIndex((o) => o.textContent === '8px');
  sel4.dispatchEvent(new w4.Event('change'));

  hit('[data-copy]');
  ok('changing a setting drops the sweep it invalidated',
    !/· whole page/.test(copied4 || ''),
    'findings judged under the old setting outlived it');

  hit('[data-sweep]');
  ok('the rule now judges by the new setting', /off the 8px grid/.test(messages()), messages());

  // The point of the subject. The per-pin line comes from the lens's read-out
  // path and the finding comes from the rule's audit path; they are two
  // consumers of one `step`, so one report has to state the same number twice.
  const p4 = w4.document.getElementById('p');
  w4.document.elementFromPoint = () => p4;
  p4.dispatchEvent(new w4.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  hit('[data-copy]');
  ok('and the lens and the rule read the one value',
    /⚠ off 8px grid/.test(copied4 || '') && /is off the 8px grid/.test(copied4 || ''),
    (copied4 || '').split('\n').filter((l) => /grid/.test(l)).join(' | ') || 'no grid lines');

  // ---- a typed number is not a choice, and can arrive broken ---------------
  hit('[data-settings]');
  const numOf = () => labelled('Ignore above').querySelector('input.opt');
  const setNum = (v) => {
    const n = numOf();
    n.value = v;
    n.dispatchEvent(new w4.Event('change'));
  };
  setNum('120');
  ok('a typed number is taken', numOf().value === '120', numOf().value);
  setNum('99999');
  ok('and clamped to what the option allows rather than dropped',
    numOf().value === '2000', `${numOf().value} — a typed 5000 should land on the ceiling`);
  setNum('');
  ok('an empty field changes nothing', numOf().value === '2000', numOf().value);
  setNum('abc');
  ok('and neither does a non-number', numOf().value === '2000', numOf().value);

  const tick = () => labelled('Judge width & height').querySelector('input.opt');
  ok('a toggle starts off', tick().checked === false, 'width and height are layout output');
  tick().checked = true;
  tick().dispatchEvent(new w4.Event('change'));
  ok('and can be turned on', tick().checked === true, 'the toggle did not stick');

  const saved = w4.localStorage.getItem('__dbgov_settings');
  ok('the choice is persisted', !!saved && /"step":8/.test(saved), String(saved));
  // The step is owned by the SUBJECT, not by whichever component reads it. Two
  // owners would mean two rows in ⚙ and two values, and a badge could then say
  // 13px is fine over a finding saying it is not.
  ok('and it belongs to the subject, not to one of its consumers',
    /"scale":\{[^}]*"step":8/.test(saved) && !/"grid":\{[^}]*"step"/.test(saved),
    String(saved));
  ok('and so are the typed and toggled ones',
    /"max":2000/.test(saved) && /"boxes":true/.test(saved), String(saved));

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
  // keyed by the OWNER that actually stores it. Naming 'grid' here made this
  // vacuous the day `step` moved to the scale subject: the load took its
  // "nothing saved" branch and never reached the validity check below.
  d6.window.localStorage.setItem('__dbgov_settings', '{"scale":{"step":37}}');
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
  // against the bar rather than a literal list: what matters is that the store
  // and the buttons agree, and a spelled-out default breaks every time a tool
  // ships without saying anything true having changed
  ok('a choice is written where every site can read it',
    JSON.parse(gm7.get('__dbgov_tools') || '[]').sort().join(',') === armedIn(d7.window),
    `stored ${gm7.get('__dbgov_tools')} vs armed ${armedIn(d7.window)}`);
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
    JSON.parse(d9.window.localStorage.getItem('__dbgov_tools') || '[]').sort().join(',')
      === armedIn(d9.window),
    `stored ${d9.window.localStorage.getItem('__dbgov_tools')} vs armed ${armedIn(d9.window)}`);

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

console.log('\nINPUT');
/**
 * Every other hook describes the page or draws over it. This is the one that
 * ACTS on it, so the thing to prove is the handover: an armed tool gets the
 * click, and the pin that would otherwise follow does not also happen.
 */
{
  const d11 = new JSDOM(
    `<!doctype html><html><body><div id="q" class="card">hello</div></body></html>`,
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = d11.window;
  let picked = null;
  Object.defineProperty(w.navigator, 'clipboard',
    { value: { writeText: async (t) => { picked = t; } }, configurable: true });
  w.eval(source);
  const bar11 = w.document.getElementById('__dbgov-bar');
  const list11 = w.document.getElementById('__dbgov-list');
  const el = w.document.getElementById('q');
  w.document.elementFromPoint = () => el;
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));

  const chip = () => bar11.querySelector('[data-c]')
    .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  // the count chip is painted a frame later; the list is rebuilt synchronously
  const pins = () => { chip(); const n = list11.querySelectorAll('.row').length; chip(); return n; };
  const clickEl = (opt) => el.dispatchEvent(
    new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5, ...opt }));

  clickEl({ ctrlKey: true });
  ok('a tool that is off intercepts nothing', picked === null && pins() === 1,
    `copied ${JSON.stringify(picked)}, ${pins()} pins — arming is what turns it on`);

  bar11.querySelector('[data-clear]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  bar11.querySelector('[data-tool="pick"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  clickEl({ ctrlKey: true });
  ok('an armed tool receives the click', picked === '#q', JSON.stringify(picked));
  ok('and consuming it means no pin lands underneath', pins() === 0,
    `${pins()} pins — the overlay did two things for one click`);

  clickEl({});
  ok('an unclaimed click still pins', pins() === 1, `${pins()} pins`);

  // the option changes what the same click does, through the same ⚙ view
  bar11.querySelector('[data-settings]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const what = [...list11.querySelectorAll('.row')]
    .find((r) => r.querySelector('.lbl').textContent === 'Ctrl+click copies')
    .querySelector('select');
  what.selectedIndex = [...what.options].findIndex((o) => o.textContent === 'text');
  what.dispatchEvent(new w.Event('change'));
  clickEl({ ctrlKey: true });
  ok('and its own setting changes what it copies', picked === 'hello', JSON.stringify(picked));

  d11.window.close();
}

console.log('\nCATEGORIES');
/**
 * Roles are derived from hooks and settings declare what they change. The two
 * assertions that matter: a component fills ONE role unless it genuinely does
 * two things, and the ⚙ list is filed by what a setting changes rather than by
 * whichever tool happens to own it.
 */
{
  const dc = new JSDOM(
    `<!doctype html><html><body>
       <div id="one" style="width:40px;height:20px">one</div>
       <div id="two" style="width:40px;height:20px;margin-top:30px">two</div>
     </body></html>`,
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dc.window;
  w.eval(source);
  const bar = w.document.getElementById('__dbgov-bar');
  const list = w.document.getElementById('__dbgov-list');
  const hit = (sel) => bar.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));

  // ---- the ⚙ view, filed by what each setting changes ---------------------
  hit('[data-settings]');
  const heads = [...list.querySelectorAll('.head')].map((h) => h.childNodes[0].textContent);
  ok('the ⚙ view is grouped by what a setting changes',
    heads.join(' → ') === 'Select → Inspect → Detect → Act → Keys',
    heads.join(' → ') || '(no headings)');
  // the grid rows are not adjacent to each other because they own the tool —
  // they are adjacent because all three change what counts as a problem
  const under = (h) => {
    const out = [];
    let seen = false;
    for (const n of list.children) {
      if (n.classList.contains('head')) { seen = n.childNodes[0].textContent === h; continue; }
      if (seen) out.push(n.querySelector('.lbl').textContent);
    }
    return out;
  };
  // A set, not a sequence: order inside a category is derived now, and an
  // assertion on the sequence would fail the day a role is added without
  // anything true having changed.
  /* Was "Inspect prints no heading", which only held while nothing had an
     inspect setting — measure's field toggles fill that category now. The
     invariant underneath is what mattered: a heading over nothing is worse
     than no heading, so assert it of EVERY heading rather than of the one
     that happened to be empty. */
  const empties = heads.filter((h) => under(h).length === 0);
  ok('and no heading stands over an empty section', !empties.length, empties.join(', '));

  ok('settings from different owners share a category',
    under('Detect').slice().sort().join(', ')
      === 'Grid step, Ignore above, Judge width & height, WCAG level',
    under('Detect').join(', '));

  // ---- roles, derived from hooks, plural only where that is true ----------
  const roleOf = (id) => bar.querySelector(`[data-tool="${id}"]`).title.split('\n')[1];
  ok('select fills one role', roleOf('select') === 'Select', roleOf('select'));
  ok('and measure fills one role', roleOf('measure') === 'Inspect', roleOf('measure'));
  ok('a tool that really does two things still says both',
    roleOf('grid').startsWith('Inspect · Detect'), roleOf('grid'));

  // ---- and the split holds at runtime -------------------------------------
  // Pairing moved to SELECT; measuring stayed with INSPECT. Disarming the
  // selection tool must take the grouping with it and leave the read-out.
  const shiftPin = (id) => {
    const el = w.document.getElementById(id);
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click',
      { bubbles: true, clientX: 5, clientY: 5, shiftKey: true }));
  };
  shiftPin('one'); shiftPin('two');
  hit('[data-c]');
  const pairRow = () => [...list.querySelectorAll('.row')]
    .find((r) => /→/.test(r.querySelector('.tag').textContent));
  ok('the selection tool groups the pins it owns', !!pairRow(),
    [...list.querySelectorAll('.row .tag')].map((t) => t.textContent).join(', '));
  hit('[data-tool="select"]');
  ok('and disarming it takes the grouping with it', !pairRow(),
    'the pairing outlived the tool that forms it');
  ok('while the pins themselves stay', list.querySelectorAll('.row').length === 2,
    `${list.querySelectorAll('.row').length} rows — selection is not the same as pinning`);
  dc.window.close();
}

console.log('\nREGRESSIONS');
/**
 * Three defects found on a real page and by review, each with the shape this
 * project keeps meeting: a rule that is confidently wrong, work done that
 * nobody asked for, and a silent reset on upgrade.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };

  // ---- the ceiling has two sides -----------------------------------------
  // `v <= max` bounded large positives only, so a page reported -1127px as a
  // spacing decision while ignoring +1127px. Both are layout arithmetic.
  const dn = new JSDOM(`<!doctype html><html><body>
      <div id="near" style="margin-left:-1px">a pixel someone typed</div>
      <div id="far" style="margin-left:-1127px">what layout worked out</div>
      <div id="pos" style="margin-left:1127px">the same, positive</div>
    </body></html>`, opts);
  const wn = dn.window;
  wn.eval(source);
  let copiedN = null;
  Object.defineProperty(wn.navigator, 'clipboard',
    { value: { writeText: async (t) => { copiedN = t; } }, configurable: true });
  const barN = wn.document.getElementById('__dbgov-bar');
  wn.dispatchEvent(new wn.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  barN.querySelector('[data-sweep]').dispatchEvent(new wn.MouseEvent('click', { bubbles: true }));
  barN.querySelector('[data-copy]').dispatchEvent(new wn.MouseEvent('click', { bubbles: true }));
  ok('a small negative is still judged', /-1px is off/.test(copiedN || ''),
    'someone types -1px; it is a spacing decision like any other');
  ok('a large negative is layout, not a decision', !/-1127px is off/.test(copiedN || ''),
    'the ceiling bounded the positive side only');
  ok('and the positive one stays ignored', !/\b1127px is off/.test(copiedN || ''),
    'this half always worked — it is the control for the two above');
  dn.window.close();

  // ---- the lazy rect stays lazy ------------------------------------------
  // U.info's `r` is a getter so a rule reading only styles never triggers
  // layout. Destructuring it in a parameter list evaluates it anyway.
  const rows = Array.from({ length: 40 }, (_, i) => `<p style="padding:8px">r${i}</p>`).join('');
  const dl = new JSDOM(`<!doctype html><html><body>${rows}</body></html>`, opts);
  const wl = dl.window;
  const realRect = wl.Element.prototype.getBoundingClientRect;
  let rects = 0;
  wl.Element.prototype.getBoundingClientRect = function () {
    rects++; return realRect.apply(this, arguments);
  };
  wl.eval(source);
  const barL = wl.document.getElementById('__dbgov-bar');
  wl.dispatchEvent(new wl.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  rects = 0;
  barL.querySelector('[data-sweep]').dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
  ok('a sweep does not force a layout read per element', rects < 10,
    `${rects} getBoundingClientRect calls over 40 elements — the getter is being evaluated eagerly`);
  dl.window.close();

  // ---- an upgrade does not reset anybody ---------------------------------
  // Moving `step` into the scale subject renamed the key it is stored under.
  const du = new JSDOM('<!doctype html><html><body><div id="x">x</div></body></html>', opts);
  du.window.localStorage.setItem('__dbgov_settings',
    '{"grid":{"step":8,"max":96,"boxes":false},"contrast":{"level":"AAA"}}');
  du.window.eval(source);
  const barU = du.window.document.getElementById('__dbgov-bar');
  du.window.dispatchEvent(new du.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  barU.querySelector('[data-settings]').dispatchEvent(new du.window.MouseEvent('click', { bubbles: true }));
  const valueOf = (label) => {
    const r = [...du.window.document.querySelectorAll('#__dbgov-list .row')]
      .find((x) => x.querySelector('.lbl').textContent === label);
    const c = r && r.querySelector('.opt');
    return c ? (c.tagName === 'SELECT' ? c.selectedOptions[0].textContent : c.value) : null;
  };
  ok('a setting stored under an owner\'s former id is adopted',
    valueOf('Grid step') === '8px', String(valueOf('Grid step')));
  ok('and so is the one that moved with it',
    valueOf('WCAG level') === 'AAA', String(valueOf('WCAG level')));
  // a tool can change owner too: `mode` was measure's before the select split
  const dm = new JSDOM('<!doctype html><html><body><div id="x">x</div></body></html>', opts);
  dm.window.localStorage.setItem('__dbgov_settings', '{"measure":{"mode":"chain"}}');
  dm.window.eval(source);
  dm.window.dispatchEvent(new dm.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  dm.window.document.getElementById('__dbgov-bar').querySelector('[data-settings]')
    .dispatchEvent(new dm.window.MouseEvent('click', { bubbles: true }));
  const modeRow = [...dm.window.document.querySelectorAll('#__dbgov-list .row')]
    .find((r) => r.querySelector('.lbl').textContent === 'Pin grouping');
  ok('an option that changed OWNER is adopted too',
    modeRow.querySelector('select').selectedOptions[0].textContent === 'chain',
    modeRow.querySelector('select').selectedOptions[0].textContent);
  dm.window.close();
  du.window.close();
}

console.log('\nREVIEW FIXES');
/**
 * Defects an adversarial review turned up at v3.8.38, each verified against a
 * running bundle before it was fixed and pinned here after.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const boot = (html, ls) => {
    const d = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, opts);
    if (ls) Object.entries(ls).forEach(([k, v]) => d.window.localStorage.setItem(k, v));
    d.window.eval(source);
    return d.window;
  };
  const swept = (w) => {
    const b = w.document.getElementById('__dbgov-bar');
    let out = null;
    Object.defineProperty(w.navigator, 'clipboard',
      { value: { writeText: async (t) => { out = t; } }, configurable: true });
    w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    b.querySelector('[data-sweep]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    b.querySelector('[data-copy]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return out || '';
  };

  // opacity: two visually identical renderings must not get opposite verdicts
  const wo = boot(`<div style="background:rgb(255,255,255)">
      <p id="alpha" style="color:rgba(0,0,0,.1)">alpha</p>
      <p id="op" style="color:rgb(0,0,0);opacity:.1">opacity</p></div>`);
  const ro = swept(wo);
  ok('CSS opacity reaches the contrast verdict', /contrast-aa ×2/.test(ro),
    (/## findings[^\n]*/.exec(ro) || ['no findings'])[0] +
    ' — faded text used to be reported 21:1 PASS');
  wo.close();

  // a first-truthy chain looked at one axis and called it the gap
  const wg = boot('<div style="display:flex;row-gap:12px;column-gap:13px">x</div>');
  ok('an off-grid column gap is seen past an on-grid row gap',
    /13px is off/.test(swept(wg)), 'the row gap won the || and the column gap was never tested');
  wg.close();

  // Math.round breaks ties toward +Infinity, so the sign decided the verdict
  const wr = boot('<div style="margin-left:2.5px">a</div><div style="margin-left:-2.5px">b</div>');
  const rr = swept(wr);
  ok('a half-pixel is judged by distance, not by sign',
    /3px is off/.test(rr) && /-3px is off/.test(rr), rr.match(/-?\dpx is off[^\n]*/g)?.join(' | '));
  wr.close();

  // two settings that silently cancelled: every real box is wider than 96px
  const wb = boot('<div id="w">x</div>', { __dbgov_settings: '{"scale":{"step":2,"max":96,"boxes":true}}' });
  wb.document.getElementById('w').getBoundingClientRect =
    () => ({ width: 301, height: 101, left: 0, top: 0, right: 301, bottom: 101 });
  ok('the spacing ceiling does not cancel "Judge width & height"',
    /301px is off/.test(swept(wb)), 'arming the toggle produced nothing at the default ceiling');
  wb.close();

  // the popover renders by index and hands the index back
  const wp = boot('<div id="a">A</div><div id="b">B</div><div id="c">C</div>');
  const barP = wp.document.getElementById('__dbgov-bar');
  const listP = wp.document.getElementById('__dbgov-list');
  wp.dispatchEvent(new wp.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  for (const id of ['a', 'b', 'c']) {
    const el = wp.document.getElementById(id);
    wp.document.elementFromPoint = () => el;
    el.dispatchEvent(new wp.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  }
  barP.querySelector('[data-c]').dispatchEvent(new wp.MouseEvent('click', { bubbles: true }));
  wp.document.getElementById('b').remove();
  wp.dispatchEvent(new wp.MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }));

  // Escape belongs to whatever has focus
  const we = boot('<div id="a">A</div><div id="b">B</div>');
  const barE = we.document.getElementById('__dbgov-bar');
  const listE = we.document.getElementById('__dbgov-list');
  we.dispatchEvent(new we.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  for (const id of ['a', 'b']) {
    const el = we.document.getElementById(id);
    we.document.elementFromPoint = () => el;
    el.dispatchEvent(new we.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  }
  barE.querySelector('[data-settings]').dispatchEvent(new we.MouseEvent('click', { bubbles: true }));
  const numE = [...listE.querySelectorAll('.row')]
    .find((r) => r.querySelector('input[type=number]')).querySelector('input');
  numE.dispatchEvent(new we.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  barE.querySelector('[data-c]').dispatchEvent(new we.MouseEvent('click', { bubbles: true }));
  ok('Escape in a panel field abandons the edit, not the pins',
    listE.querySelectorAll('.row').length === 2,
    `${listE.querySelectorAll('.row').length} pins left`);
  we.close();

  // a capability shipped after the user last chose must still appear
  const wn2 = boot('<div id="a">A</div>', {
    __dbgov_tools: '["measure","select"]',
    __dbgov_seen: '["measure","select","contrast","dupid","pick"]',
  });
  const armedN = [...wn2.document.querySelectorAll('#__dbgov-bar button.tool.armed')]
    .map((b) => b.dataset.tool);
  ok('a tool this install has never met gets its own default',
    armedN.includes('grid'), armedN.join(', ') || '(none)');
  ok('and one it has met keeps what the user decided',
    !armedN.includes('dupid'), armedN.join(', '));
  wn2.close();

  // settings this build cannot name must survive somebody changing another one
  const wk = boot('<div id="a">A</div>',
    { __dbgov_settings: '{"scale":{"step":8},"ghost":{"threshold":42}}' });
  const barK = wk.document.getElementById('__dbgov-bar');
  wk.dispatchEvent(new wk.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  barK.querySelector('[data-settings]').dispatchEvent(new wk.MouseEvent('click', { bubbles: true }));
  const selK = [...wk.document.querySelectorAll('#__dbgov-list .row')]
    .find((r) => r.querySelector('.lbl').textContent === 'Pin grouping').querySelector('select');
  selK.selectedIndex = 1; selK.dispatchEvent(new wk.Event('change'));
  ok('a setting whose owner this build does not know is not destroyed',
    /"ghost"/.test(wk.localStorage.getItem('__dbgov_settings') || ''),
    wk.localStorage.getItem('__dbgov_settings'));
  wk.close();

  // Deliberately NOT its own timer. The summary below prints and exits on a
  // timer of its own, so a second one racing it decides the exit code by luck —
  // which is the same "green by accident" this suite has already been caught
  // by once. It runs inside that block instead, before the count is read.
  pendingChecks.push(() => {
    const tags = [...listP.querySelectorAll('.row .tag')].map((t) => t.textContent);
    const rows = [...listP.querySelectorAll('.row')];
    const target = tags[tags.length - 1];
    rows[rows.length - 1].querySelector('.rm')
      .dispatchEvent(new wp.MouseEvent('click', { bubbles: true }));
    const left = [...listP.querySelectorAll('.row .tag')].map((t) => t.textContent);
    ok('the list drops rows whose element left the page',
      tags.join(' ') === '#1 #3', tags.join(' '));
    ok('so ✕ removes the pin that was clicked', !left.includes(target),
      `clicked ${target}, left ${left.join(' ')}`);
    wp.close();
  });
}

console.log('\nSTANDS ALONE');
/**
 * Every tool must be worth arming by itself. Measured, not assumed: armed
 * alone, grid used to produce zero badges and zero ⚠ because `annotate` only
 * decorates what OTHER tools print, and dupid changed nothing at all because
 * findings reach the ⌕ list whether a rule is armed or not. Correct, silent
 * and indistinguishable from broken.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const ALL = JSON.stringify(idsOnDisk);
  const only = (armed, html) => {
    const d = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, opts);
    d.window.localStorage.setItem('__dbgov_tools', JSON.stringify(armed));
    d.window.localStorage.setItem('__dbgov_seen', ALL);   // nothing counts as new
    d.window.eval(source);
    d.window.dispatchEvent(new d.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    return d.window;
  };
  const pinIt = (w, id, mods = {}) => {
    const el = w.document.getElementById(id);
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5, ...mods }));
  };

  // grid, with nothing else to lean on
  const wg = only(['grid'], '<div id="a" style="padding:7px">alpha</div>');
  pinIt(wg, 'a');
  pendingChecks.push(() => {
    const root = wg.document.getElementById('__dbgov-root');
    ok('grid says something with no other tool armed',
      /⚠/.test(root.innerHTML) && root.querySelectorAll('.dbgov-badge').length > 0,
      `${root.querySelectorAll('.dbgov-badge').length} badges, ⚠ ${/⚠/.test(root.innerHTML)}`);
    wg.close();
  });

  // dupid, whose findings reach the list either way — arming it must still do something
  const wd = only(['dupid'], '<p id="dup">one</p><p id="dup">two</p>');
  wd.document.getElementById('__dbgov-bar').querySelector('[data-sweep]')
    .dispatchEvent(new wd.MouseEvent('click', { bubbles: true }));
  pendingChecks.push(() => {
    ok('arming a rule changes something on screen',
      wd.document.querySelectorAll('#__dbgov-root .dbgov-flag').length > 0,
      'a toggle that paints nothing is worse than no toggle');
    wd.close();
  });

  // a shift-click with nothing to group it must not promise a measurement
  const wn = only(['measure'], '<div id="a">a</div><div id="b">b</div>');
  pinIt(wn, 'a', { shiftKey: true });
  pinIt(wn, 'b', { shiftKey: true });
  let copiedN = null;
  Object.defineProperty(wn.navigator, 'clipboard',
    { value: { writeText: async (t) => { copiedN = t; } }, configurable: true });
  wn.document.getElementById('__dbgov-bar').querySelector('[data-copy]')
    .dispatchEvent(new wn.MouseEvent('click', { bubbles: true }));
  ok('no grouping armed, so a shift-click is simply a pin',
    !/\(measure\)/.test(copiedN || '') && /\(note\)/.test(copiedN || ''),
    (copiedN || '').match(/\((note|measure)\)/g)?.join(' ') || 'no pins');
  wn.close();

  // and with a grouping armed it means what it always meant
  const wy = only(['measure', 'select'], '<div id="a">a</div><div id="b">b</div>');
  pinIt(wy, 'a', { shiftKey: true });
  pinIt(wy, 'b', { shiftKey: true });
  let copiedY = null;
  Object.defineProperty(wy.navigator, 'clipboard',
    { value: { writeText: async (t) => { copiedY = t; } }, configurable: true });
  wy.document.getElementById('__dbgov-bar').querySelector('[data-copy]')
    .dispatchEvent(new wy.MouseEvent('click', { bubbles: true }));
  ok('with a grouping armed, a shift-click still joins one',
    /\(measure\)/.test(copiedY || ''),
    (copiedY || '').match(/\((note|measure)\)/g)?.join(' ') || 'no pins');
  wy.close();
}

console.log('\nPANEL AUDIT FIXES');
/**
 * Four defects a live audit of the panel found, each reproduced before the fix.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const boot = (html, ls) => {
    const d = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, opts);
    if (ls) Object.entries(ls).forEach(([k, v]) => d.window.localStorage.setItem(k, v));
    d.window.eval(source);
    d.window.dispatchEvent(new d.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    return d.window;
  };

  // 1. the popover must never sit under the bar, which paints and hit-tests
  //    above it and would eat clicks meant for the rows
  const wl = boot('<div id="a">a</div>');
  const barL = wl.document.getElementById('__dbgov-bar');
  const listL = wl.document.getElementById('__dbgov-list');
  barL.getBoundingClientRect = () => ({ left: 620, top: 8, right: 672, bottom: 604,
                                        width: 52, height: 596 });
  Object.defineProperty(listL, 'offsetWidth', { value: 460, configurable: true });
  Object.defineProperty(listL, 'offsetHeight', { value: 255, configurable: true });
  const overlapsBar = () => {
    const x = parseFloat(listL.style.left), y = parseFloat(listL.style.top);
    const b = barL.getBoundingClientRect();
    return !(x + 460 <= b.left || x >= b.right || y + 255 <= b.top || y >= b.bottom);
  };
  const misses = [];
  for (const side of ['right', 'left', 'top', 'bottom']) {
    wl.__side = side;
    barL.querySelector('[data-settings]').dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
    barL.querySelector('[data-settings]').dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
    barL.querySelector('[data-settings]').dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
    if (overlapsBar()) misses.push(`${side} @ ${listL.style.left},${listL.style.top}`);
  }
  ok('the popover never lands under the bar', !misses.length, misses.join(' | '));
  wl.close();

  // 2. an audit on the page must be visible in the bar and removable from it
  const wa = boot('<p style="color:#bbb">faint</p>', { __dbgov_tools: '["contrast"]' });
  const barA = wa.document.getElementById('__dbgov-bar');
  barA.querySelector('[data-sweep]').dispatchEvent(new wa.MouseEvent('click', { bubbles: true }));
  ok('the bar says an audit is showing',
    barA.querySelector('[data-sweep]').classList.contains('swept'),
    'the ⌕ flash expires, so the marks outlived any sign of them');
  ok('the bar carries a resting problem count',
    /^\d+$/.test(barA.querySelector('[data-sweep]').textContent) &&
    /distinct problem/.test(barA.querySelector('[data-sweep]').title),
    `${barA.querySelector('[data-sweep]').textContent} — ${barA.querySelector('[data-sweep]').title}`);
  barA.querySelector('[data-clear]').dispatchEvent(new wa.MouseEvent('click', { bubbles: true }));
  ok('and ✕ is the way out of it',
    !barA.querySelector('[data-sweep]').classList.contains('swept'),
    'clearing pins used to leave the outlines with no control at all');
  wa.close();

  // 3. a cap nobody is told about reads as "this is everything"
  const many = Array.from({ length: 420 }, () => '<p style="color:#bbb;padding:7px">x</p>').join('');
  const wc = boot(many, { __dbgov_tools: '["contrast"]' });
  const barC = wc.document.getElementById('__dbgov-bar');
  const listC = wc.document.getElementById('__dbgov-list');
  let copiedC = null;
  Object.defineProperty(wc.navigator, 'clipboard',
    { value: { writeText: async (t) => { copiedC = t; } }, configurable: true });
  barC.querySelector('[data-sweep]').dispatchEvent(new wc.MouseEvent('click', { bubbles: true }));
  barC.querySelector('[data-copy]').dispatchEvent(new wc.MouseEvent('click', { bubbles: true }));
  ok('the findings list says the page could not show them all',
    /shows the first 200/.test((listC.querySelector('.head') || {}).textContent || ''),
    (listC.querySelector('.head') || {}).textContent || '(no heading)');
  ok('and so does the copied report',
    /outlines capped at 200 per rule/.test(copiedC || ''),
    (/## findings[^\n]*/.exec(copiedC || '') || ['none'])[0]);
  wc.close();

  // 4. Escape closes the top layer, never the session
  const we = boot('<p style="color:#bbb">faint</p>');
  const barE = we.document.getElementById('__dbgov-bar');
  const listE = we.document.getElementById('__dbgov-list');
  const esc = () => we.document.body
    .dispatchEvent(new we.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  barE.querySelector('[data-sweep]').dispatchEvent(new we.MouseEvent('click', { bubbles: true }));
  esc();
  // From the ⚙ BUTTON, which is where focus lands when you open the panel with
  // the mouse. A `!root.contains(e.target)` guard used to swallow exactly this.
  barE.querySelector('[data-settings]').dispatchEvent(new we.MouseEvent('click', { bubbles: true }));
  barE.querySelector('[data-settings]')
    .dispatchEvent(new we.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Escape closes a panel opened with the mouse', !listE.classList.contains('open'),
    'focus sits on the button that opened it, inside the overlay root');
  barE.querySelector('[data-sweep]').dispatchEvent(new we.MouseEvent('click', { bubbles: true }));
  esc();
  ok('Escape closes the open panel', !listE.classList.contains('open') && barE.classList.contains('on'),
    `list ${listE.classList.contains('open') ? 'open' : 'closed'}, power ${barE.classList.contains('on') ? 'ON' : 'OFF'}`);
  esc(); esc();
  ok('and never powers the tool off', barE.classList.contains('on'),
    'Escape used to end the session whenever nothing was pinned');
  we.close();
}

console.log('\nPIN NUMBERS');
/**
 * A pin's number is stable while it exists — removing #2 must not renumber #3,
 * or a screenshot stops matching the report beside it. But the counter only
 * ever climbed, so pin/unpin/pin left "#9" sitting beside a count chip reading
 * 1: a number that referred to nothing and could not be read off a screenshot.
 */
{
  const d = new JSDOM('<!doctype html><html><body>' +
    ['a', 'b', 'c', 'd'].map((i) => `<div id="${i}">${i}</div>`).join('') + '</body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = d.window;
  w.eval(source);
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  const bar = w.document.getElementById('__dbgov-bar');
  const list = w.document.getElementById('__dbgov-list');
  const hit = (id) => {
    const el = w.document.getElementById(id);
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  };
  const tags = () => {
    bar.querySelector('[data-c]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const t = [...list.querySelectorAll('.row .tag')].map((x) => x.textContent).join(' ');
    bar.querySelector('[data-c]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return t || '(none)';
  };

  hit('a'); hit('a');            // pin then unpin — nothing is pinned now
  hit('a');
  ok('numbering restarts once nothing is pinned', tags() === '#1', tags());

  hit('b');
  ok('and a second pin follows it', tags() === '#1 #2', tags());
  hit('a');
  ok('while removing one does NOT renumber the other', tags() === '#2', tags());

  /* The case that resetting-at-empty did not cover, and the one actually seen
     on a real page: with pins still there, unpin and re-pin and the number kept
     climbing — four pins reading #1 #2 #6 #9. A new pin takes the smallest
     number not in use, so the set stays dense however you got there. */
  hit('a');
  ok('a freed number is reused, not skipped', tags() === '#1 #2', tags());
  hit('c'); hit('d');
  ok('and the set stays dense as it grows', tags() === '#1 #2 #3 #4', tags());
  hit('c');                       // frees #3 from the middle
  ok('removing from the middle leaves the others alone', tags() === '#1 #2 #4', tags());
  hit('c');
  ok('and the next pin fills that gap', tags() === '#1 #2 #3 #4', tags());
  ['a', 'b', 'c', 'd'].forEach(hit);   // empty again
  ok('unpinning the last one empties it', tags() === '(none)', tags());
  hit('a');
  ok('and numbering starts from 1 again', tags() === '#1', tags());

  // and via ✕ clear, which always reset, plus the row ✕, which did not
  hit('b');
  bar.querySelector('[data-c]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  // one at a time, re-querying: the list re-renders after each removal, so a
  // cached NodeList holds nodes that are no longer in the document
  for (let guard = 0; guard < 20; guard++) {
    const rm = list.querySelector('.row .rm');
    if (!rm) break;
    rm.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  }
  bar.querySelector('[data-c]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  hit('a');
  ok('including emptying it from the pin list', tags() === '#1', tags());
  w.close();
}

console.log('\nPER-TOOL OPTIONS');
/**
 * Two doors, one room. ⚙ shows every setting grouped by what it changes;
 * right-clicking a tool shows that tool's subset. The second is a FILTER of
 * the first — same options() call — so they cannot drift apart.
 */
{
  const d = new JSDOM('<!doctype html><html><body>' +
    // longhands, because jsdom does not expand the border-radius shorthand, and
    // a stubbed rect, because it has no layout at all
    '<div id="a" style="padding:6px 8px;border-top-left-radius:9px;' +
    'border-top-right-radius:9px;border-bottom-right-radius:9px;' +
    'border-bottom-left-radius:9px">a</div>' +
    '</body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = d.window;
  w.eval(source);
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  const bar = w.document.getElementById('__dbgov-bar');
  const list = w.document.getElementById('__dbgov-list');
  const labels = () => [...list.querySelectorAll('.row .lbl')].map((x) => x.textContent);

  bar.querySelector('[data-tool="measure"]')
    .dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const mine = labels();
  ok('right-clicking a tool opens its own options', mine.length > 0 && list.classList.contains('open'),
    `${mine.length} rows`);
  ok('and shows only that tool\'s',
    mine.includes('Radius') && !mine.includes('Grid step') && !mine.includes('WCAG level'),
    mine.join(', '));
  ok('titled with the tool, not with "Settings"',
    /Measure/.test((list.querySelector('.viewhead') || {}).textContent || ''),
    (list.querySelector('.viewhead') || {}).textContent || '(none)');

  // the same rows are still in ⚙, because one is a filter of the other
  bar.querySelector('[data-settings]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const all = labels();
  ok('the same rows are still in ⚙', mine.every((l) => all.includes(l)),
    mine.filter((l) => !all.includes(l)).join(', ') || 'all present');

  /* A tool whose settings live on a SUBJECT must still show them. "Grid step"
     is grid's setting to anyone using it; that scale owns it so the lens and
     the rule cannot disagree is internal, and right-clicking ▦ to be told
     "nothing to configure" was the panel lying about its most configurable
     tool. */
  bar.querySelector('[data-tool="grid"]')
    .dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const gridRows = labels();
  ok('a tool surfaces the subject settings it consults',
    gridRows.includes('Grid step') && gridRows.includes('Ignore above'),
    gridRows.join(', ') || (list.querySelector('.empty') || {}).textContent);
  ok('and still not another tool\'s', !gridRows.includes('WCAG level'),
    gridRows.join(', '));
  ok('while the tooltip only offers it where there is something',
    /right-click/.test(bar.querySelector('[data-tool="grid"]').title) &&
    !/right-click/.test(bar.querySelector('[data-tool="dupid"]').title),
    'dupid genuinely has nothing, and must not advertise an empty menu');

  // and the toggle governs the badge
  const el = w.document.getElementById('a');
  el.getBoundingClientRect = () => ({ left: 10, top: 10, right: 50, bottom: 30,
                                      width: 40, height: 20 });
  w.document.elementFromPoint = () => el;
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  bar.querySelector('[data-tool="measure"]')
    .dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const radiusRow = [...list.querySelectorAll('.row')]
    .find((r) => r.querySelector('.lbl').textContent === 'Radius');
  const tick = radiusRow.querySelector('input[type=checkbox]');
  tick.checked = false;
  tick.dispatchEvent(new w.Event('change'));
  pendingChecks.push(() => {
    const badge = w.document.querySelector('#__dbgov-root .dbgov-badge');
    ok('turning a field off takes it off the badge',
      !!badge && !/\br 9\b/.test(badge.textContent),
      badge ? badge.textContent : '(no badge)');
    ok('and leaves the rest of the badge alone',
      !!badge && /40×20/.test(badge.textContent),
      badge ? badge.textContent : '(no badge)');
    w.close();
  });
}

console.log('\nEVERY RULE SHOWS WHERE');
/**
 * Three rules, and only two of them marked their findings: grid produced
 * thousands and drew nothing, so the list was full and the page blank. And
 * dupid knew the element under the cursor had a duplicated id but only ever
 * said so in the copied report.
 */
{
  const d = new JSDOM('<!doctype html><html><body>' +
    '<p id="dup" style="padding:7px">one</p><p id="dup">two</p></body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = d.window;
  w.localStorage.setItem('__dbgov_tools', '["grid","dupid","measure"]');
  w.localStorage.setItem('__dbgov_seen', JSON.stringify(idsOnDisk));
  w.eval(source);
  const bar = w.document.getElementById('__dbgov-bar');
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  const el = w.document.getElementById('dup');
  w.document.elementFromPoint = () => el;
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  bar.querySelector('[data-detail]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  bar.querySelector('[data-sweep]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  pendingChecks.push(() => {
    const root = w.document.getElementById('__dbgov-root');
    const badge = (root.querySelector('.dbgov-badge') || {}).textContent || '';
    ok('dupid says so on the badge, not only in the report', /id ×2/.test(badge), badge);
    ok('grid marks where its findings are',
      root.querySelectorAll('.dbgov-flag').length > 0,
      'a finding you cannot locate is half a finding');
    w.close();
  });
}

console.log('\nBADGE FACETS');
/**
 * The badge's three kinds of content: CURRENT (the component's fields), ISSUE
 * (the lens's ⚠), RECOMMENDATION (the fix — off by default, because a
 * suggestion doubles every marked number). ⚠ and →8 both come from the Scale
 * subject, so they cannot disagree about one number.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const facet = (settings, done) => {
    const d = new JSDOM('<!doctype html><html><body>' +
      '<div id="a" style="padding:7px">seven</div></body></html>', opts);
    const w = d.window;
    w.localStorage.setItem('__dbgov_tools', '["measure","grid"]');
    w.localStorage.setItem('__dbgov_seen', JSON.stringify(idsOnDisk));
    if (settings) w.localStorage.setItem('__dbgov_settings', JSON.stringify(settings));
    w.eval(source);
    w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    const el = w.document.getElementById('a');
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
    pendingChecks.push(() => {
      const b = w.document.querySelector('#__dbgov-root .dbgov-badge');
      done((b || {}).textContent || '(no badge)');
      w.close();
    });
  };
  facet(null, (text) => {
    ok('the ISSUE facet is on by default', /7⚠/.test(text), text);
    ok('and the RECOMMENDATION facet is not', !/→/.test(text),
      text + ' — a suggestion has to be asked for');
  });
  facet({ grid: { suggest: true } }, (text) => {
    ok('asked for, the fix appears after the mark', /7⚠→8/.test(text),
      text + ' — Scale.nearest(7) on a 2px step is 8, half away from zero');
  });
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

/**
 * WAIT FOR THE FRAME, do not assume it. This was a fixed 80ms, which is a bet
 * that the machine is idle — and under load the frame had not landed, so
 * assertions about painted marks failed for a reason that had nothing to do
 * with the code. An intermittently red suite gets re-run until it is green,
 * which is the same "green by luck" the crash guard above exists to stop.
 */
function whenPainted(ready, run, waited = 0) {
  if (ready() || waited > 4000) return run();
  setTimeout(() => whenPainted(ready, run, waited + 25), 25);
}

whenPainted(() => window.document.querySelector('#__dbgov-root .dbgov-flag') &&
                  w3.document.querySelector('#__dbgov-root .dbgov-badge'), () => {
  console.log('\nREVIEW FIXES (after a frame)');
  pendingChecks.forEach((fn) => fn());

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
});
