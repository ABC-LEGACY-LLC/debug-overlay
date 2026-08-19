#!/usr/bin/env node
/**
 * map.js — what the code you just wrote looks like from the panel.
 *
 *     npm run map
 *
 * WHY THIS EXISTS: the folders say what kind of file a thing is; the ROLES say
 * what a tool DOES, and they are derived from its hooks. Neither is written in
 * the other, deliberately — a tool can hold two roles and a file can only sit
 * in one folder. The cost is that "where will my new tool appear?" had no
 * answer short of installing the build and looking.
 *
 * It is not answered by re-deriving the roles here either: a second copy of
 * that mapping would drift from the registry, which is the whole failure the
 * `kind` field died of. So this boots the real bundle and asks the running
 * registry, through the only thing it makes observable — the panel it builds.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'userscript.json'), 'utf8'));
const bundle = path.join(ROOT, 'dist', cfg.distFile);
if (!fs.existsSync(bundle)) {
  console.error('✗ no bundle — run node build.js first');
  process.exit(1);
}
const source = fs.readFileSync(bundle, 'utf8');

/** id → the file it came from, read off the build's own section markers. */
function origins() {
  const out = {};
  const parts = source.split(/^ {2}\/\/ ─── (src\/\S+)/m);
  for (let i = 1; i < parts.length; i += 2) {
    const id = (parts[i + 1].match(/\bid: '([a-z][\w-]*)'/) || [])[1];
    if (id) out[id] = parts[i];
  }
  return out;
}

const dom = new JSDOM('<!doctype html><html><body><div id="x">x</div></body></html>', {
  url: 'https://example.test/', pretendToBeVisual: true,
  runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
});
const w = dom.window;
w.eval(source);
const d = w.document;
const bar = d.getElementById('__dbgov-bar');
if (!bar) { console.error('✗ the bundle booted without building a panel'); process.exit(1); }

const from = origins();
console.log(`\ndbgov v${cfg.version} — the panel, and where it comes from\n`);

console.log('BAR');
console.log('  ' + [...bar.children]
  .map((c) => (c.tagName === 'HR' ? '│' : c.textContent.trim() || c.className)).join(' '));

console.log('\nTOOLS          roles are derived from hooks, so they can be plural');
for (const b of bar.querySelectorAll('button.tool')) {
  const id = b.dataset.tool;
  const roles = (b.title.split('\n')[1] || '').replace(' · also runs in the page audit', '');
  console.log(`  ${b.textContent}  ${id.padEnd(10)}${roles.padEnd(20)}${from[id] || '?'}`);
}

w.dispatchEvent(new w.KeyboardEvent('keydown',
  { altKey: true, shiftKey: true, ctrlKey: false, code: 'KeyD', bubbles: true }));
bar.querySelector('[data-settings]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

console.log('\nSETTINGS       grouped by what each one CHANGES, not by which tool owns it');
for (const n of d.querySelectorAll('#__dbgov-list > *')) {
  if (n.classList.contains('viewhead')) continue;
  if (n.classList.contains('head')) {
    console.log(`\n  ${n.childNodes[0].textContent.toUpperCase().padEnd(9)}` +
                `${(n.querySelector('.note') || {}).textContent || ''}`);
    continue;
  }
  const c = n.querySelector('.opt');
  if (!c) {   // the gesture legend: read-only rows, no control
    console.log(`    ${n.querySelector(".tag").textContent.padEnd(14)}` +
                `${n.querySelector('.lbl').textContent}`);
    continue;
  }
  const shown = c.tagName === 'SELECT'
    ? [...c.options].map((o, i) => (i === c.selectedIndex ? `[${o.textContent}]` : o.textContent)).join(' ')
    : c.type === 'checkbox' ? (c.checked ? '[x]' : '[ ]')
      : `${c.value}${(n.querySelector('.unit') || {}).textContent || ''}`;
  console.log(`    ${n.querySelector('.tag').textContent} ` +
              `${n.querySelector('.lbl').textContent.padEnd(22)}${shown}`);
}

/* Derived from the same hooks.js audit.js enforces — the hand-written version
   of these tables was wrong twice. ARCHITECTURE.md is the prose companion. */
const { SURFACES, registered, bandsOf } = require('./hooks.js');
const tools = registered('tools');

/* THE THREE SPECIES. A flat component list put select and measure in one
   rowset and every matrix over it felt wrong; the bands are what the hooks
   say. Describers get the four-channel table because those are the channels
   a describer fills from inside its own file. */
console.log('\nBANDS          three species of component, derived from hooks\n');
const inBand = (b) => tools.filter((t) => bandsOf(t).includes(b));
console.log('  DESCRIBER — says something about elements');
console.log('    ' + 'component'.padEnd(11) + 'badge'.padEnd(14) + '⌕ findings'.padEnd(13) +
            '⧉ report'.padEnd(11) + '⚙ settings');
for (const t of inBand('DESCRIBER')) {
  const has = (h) => t.hooks.includes(h);
  const uses = (t.s.match(/uses: \[(\w+)\]/) || [])[1];
  console.log('    ' + t.id.padEnd(11) +
    ((has('badge') ? '✓' : '·') + (has('annotate') ? ' +⚠ lens' : '')).padEnd(14) +
    ((has('audit') || has('auditPage')) ? '✓' : '·').padEnd(12) +
    (has('report') ? '✓' : '·').padEnd(10) +
    (has('options') ? 'own' : uses ? 'via ' + uses.toLowerCase() : '·'));
}
for (const t of inBand('SELECTOR'))
  console.log('  SELECTOR  — ' + t.id + ': publishes groups() for whoever measures; ' +
              'pair rows; the … on a waiting pin');
for (const t of inBand('ACTOR'))
  console.log('  ACTOR     — ' + t.id + ': claims input via intercept');

console.log('\nSURFACES       every one exists with no tool armed; a tool ADDS to it\n');
console.log('  ' + 'surface'.padEnd(14) + 'there anyway (core)'.padEnd(46) + 'tools that add to it');
console.log('  ' + '-'.repeat(14 + 46 + 38));
for (const s of SURFACES) {
  const who = tools.filter((t) => s.fills.some((h) => t.hooks.includes(h))).map((t) => t.id);
  console.log('  ' + s.key.padEnd(14) + s.core.padEnd(46) + (who.join(', ') || '— core only'));
}

console.log('\nWHAT EACH TOOL ADDS\n');
const W = 13;
console.log('  ' + 'tool'.padEnd(10) + SURFACES.map((s) => s.key.slice(0, 11).padEnd(W)).join(''));
console.log('  ' + '-'.repeat(10 + SURFACES.length * W));
for (const t of tools) {
  console.log('  ' + t.id.padEnd(10) + SURFACES.map((s) =>
    (s.fills.filter((h) => t.hooks.includes(h)).join('+') || '·').slice(0, 11).padEnd(W)).join(''));
}

console.log(`
WHERE A NEW FILE GOES — every file is exactly one of these

  COMPONENT  tools/     something you can ARM        → its own button, and its
                                                       rows under ⚙, both free
  SUBJECT    subjects/  shared measurement + its     → no button, no surface;
                        settings                       consulted, never shows
  SURFACE    ui/        where output APPEARS         → the panel is made of these
  GLUE       core/      what connects them           → no user surface at all
             app/                                      (app/ is the page-level
                                                        half of the same job)
`);
dom.window.close();
