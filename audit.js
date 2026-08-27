#!/usr/bin/env node
/**
 * audit.js — enforces the architecture rules that keep this codebase from
 * turning to mush as tools are added. Run it after every change:
 *
 *     node audit.js
 *
 * Each rule exists because the boundary was actually broken once before.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(SRC, f));
/** Every .js under src/, as paths relative to src/. Folders are grouping now,
 *  so nothing here may assume the files sit in one flat directory. */
const walk = (dir = SRC, base = '') => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out.sort();
};

let fail = 0;

/* ---- pass 1: the tool files, read before any rule runs -------------------
   The cross-tool rule needs every id before it can judge the first file
   (measure is read before grid's id is known), and the core-file id bans
   below are derived from that same list. */
/* Recursive, like the build's own glob. tools/ is flat today and will not stay
   flat forever; discovering them with readdirSync would mean the day someone
   subdivides it, every tool in a subfolder silently stops being audited — no
   id check, no icon check, no cross-tool check, and a green run saying so. */
/* One TOOL = one FOLDER under src/tools/. Its behaviour is spread
   over the files beside its index, so every check below runs against the
   folder's concatenation — id, icon, hooks, option counts are folder facts.
   hooks.js owns that reading; this file only judges it. */
const { registered } = require('./hooks.js');
const tools = registered().map((t) => ({
  f: t.f, s: t.s, orphans: t.orphans,
  id: t.id,
  icon: /\bicon:\s*(['"`])(.+?)\1/.test(t.s),
  title: /\btitle:\s*(['"`])(.+?)\1/.test(t.s),
  defs: (t.s.match(/defineTool\(/g) || []).length,
  lines: t.s.split('\n').length,
}));
const ids = tools.map((t) => t.id).filter(Boolean);

/* Subjects are checked too. They carry no hooks and no button, so most tool
   rules do not apply — but they DO declare options, which the ⚙ view paints,
   and an id the settings store is keyed by. Unchecked, a subject with a typo'd
   affects: would file its row nowhere and a duplicate id would have two owners
   writing the same settings key. */
const subjects = walk().filter((f) => f.startsWith('subjects/')).map((f) => {
  const s = read(f);
  return {
    f, s,
    id: (s.match(/id: '([a-z][a-z0-9-]*)'/) || [])[1],
    icon: /\bicon:\s*(['"`])(.+?)\1/.test(s),
    defs: (s.match(/defineSubject\(/g) || []).length,
    lines: s.split('\n').length,
  };
});

/** file → [ruleName, forbidden regex, why] */
const RULES = [
  ['core/utils.js', /\bState\./, 'UTILS must stay pure — callers pass decorators in'],
  ['core/utils.js', /document\.createElement/, 'UTILS must not build DOM'],
  ['core/utils.js', /class="/, 'UTILS must not own markup — the tool that styles it does'],
  ['subjects/geometry.js', /\bPanel\./, 'GEOMETRY is tool-agnostic drawing'],
  // Persistence goes through Store, which is per-script; localStorage is per
  // origin, and with @match *://*/* that silently means "per site" — the bug
  // this project just spent a release fixing.
  ['ui/web-panel.js', /localStorage/, 'STORE owns persistence — localStorage is per-origin'],
  ['app/controller.js', /localStorage/, 'STORE owns persistence — localStorage is per-origin'],
  ['ui/web-panel.js', /\bState\./, 'WEB PANEL fires callbacks; CONTROLLER owns state'],
  ['ui/web-panel.js', /\bpairs?\b|measurePins/, 'WEB PANEL must not know what a pair is'],
  ['ui/renderer.js', /PAIR_MODE/, 'RENDERER must ask tools via hooks'],
  ['ui/placement.js', /\bTools\.|\bState\./, 'PLACEMENT only positions boxes'],
];

// The three files that must never name a tool. Derived from the ids collected
// above, so a fourth tool is guarded the day it registers instead of the day
// someone remembers to edit three regexes.
const ID_FREE = ['ui/renderer.js', 'app/interactions.js', 'app/controller.js'];
if (ids.length) {
  const idRe = new RegExp(ids.map((i) => `'${i}'`).join('|'));
  for (const f of ID_FREE) RULES.push([f, idRe, 'must reach tools through hooks, never by id']);
} else {
  // never let a broken extractor degrade into new RegExp('') — that matches
  // every file and would report three violations that are not there
  console.log("\n✗ no tool ids found — the id: extractor in audit.js is out of date");
  fail++;
}

console.log('\nARCHITECTURE RULES');
for (const [file, pattern, why] of RULES) {
  if (!exists(file)) { console.log(`  ? ${file} missing`); fail++; continue; }
  const m = read(file).match(pattern);
  const label = `${file} — ${why}`;
  if (m) { console.log(`  ✗ ${label}\n      found: ${m[0]}`); fail++; }
  else console.log(`  ✓ ${label}`);
}

/* A file under tools/ that no index.js claims would be bundled by
   nothing and audited as nothing — the same silent-orphan class the old ORDER
   check guarded. registered() collects them; this makes them loud. */
const orphanFiles = (tools[0] && tools[0].orphans) || [];
if (orphanFiles.length) {
  console.log(`\n✗ tools/ files outside any tool (no index.js above them):`);
  orphanFiles.forEach((f) => console.log('    ' + f));
  fail++;
}

console.log('\nTOOL FILES');
/* A tool may not reach for another tool by id — that coupling is what the
   registry exists to prevent. Match the ACCESSOR, never the bare word:
   'grid' is also a CSS display value (measure has cs.display.includes('grid'))
   and 'contrast' is a CSS filter function, so a quoted-literal scan would be
   permanently red. */
const ACCESSOR = /(?:Tools\.\w+|State\.tools\.has)\s*\(\s*'([a-z][\w-]*)'/g;
const BY_FIELD = /\.id\s*===?\s*'([a-z][\w-]*)'/g;   // the other way back in
/* Comments are stripped first. Without that, a file that merely EXPLAINS a
   hook is reported as implementing it — dupid.js says "audit(info) cannot
   ask this" in its own doc comment and was listed as having an audit hook it
   does not have. Only whole-line // comments go, so a URL inside a string
   keeps its slashes. */
/* strip/calls/HOOKS come from hooks.js, which map.js reads too — one
   definition of what a hook is and who implements it, rather than two that
   agree until they quietly do not. */
const { HOOKS, strip, calls } = require('./hooks.js');  // registered comes from the same file

/* The category vocabulary, read out of the registry rather than repeated here
   — the same reason the banned-id list is derived from the tools themselves.
   A role is derived from hooks and needs no checking; what an option AFFECTS
   cannot be derived from anything, so it is the one thing a tool declares and
   therefore the one thing that can be wrong. */
const CATS = [...read('core/registry.js').matchAll(/\{\s*key:\s*'([a-z]+)',\s*label:/g)]
  .map((m) => m[1]);
if (!CATS.length) {
  console.log('\n✗ no roles found in core/registry.js — the ROLES extractor here is out of date');
  fail++;
}

/** Every option declares what it CHANGES; nothing else can tell you. */
function optionProblems(src) {
  const out = [];
  const keys = (src.match(/\bkey: '/g) || []).length;
  const affects = [...src.matchAll(/\baffects: '([a-z]+)'/g)].map((m) => m[1]);
  if (keys !== affects.length)
    out.push(`${keys} option(s) but ${affects.length} affects: — each option declares one`);
  for (const a of affects)
    if (CATS.length && !CATS.includes(a))
      out.push(`affects: '${a}' is not a role — expected one of ${CATS.join(', ')}`);
  return out;
}

for (const t of tools) {
  const bad = [];
  if (t.defs !== 1) bad.push(`${t.defs} defineTool() calls, expected 1`);
  if (!t.id) bad.push('no id');
  else if (ids.indexOf(t.id) !== ids.lastIndexOf(t.id)) bad.push(`duplicate id '${t.id}'`);
  // The panel paints both of these straight into the bar. Nothing else checked
  // them, so a tool that forgot one shipped a button labelled `undefined` — and
  // the panel is the one surface where every tool has to be legible.
  if (!t.icon) bad.push('no icon — the panel button would read "undefined"');
  if (!t.title) bad.push('no title — the button tooltip would read "undefined"');
  /* WHAT IT EXAMINES, one way or the other. The side panel prints this as a
     column beside every tool, and a column with blank rows is not a column —
     it reads as a status only some tools have. It used to be filled from a
     hardcoded map of tool ids inside the side panel itself, so a tool shipped
     after that map was written arrived blank and nothing failed. Declared by
     the tool now, and required, which is the only version of this that a new
     tool cannot silently miss. */
  if (!/\bfamily: '[a-z]+'/.test(t.s) && !/\bsubject: '[a-z]+'/.test(t.s))
    bad.push('no family and no subject — nothing says what it examines, and ' +
             'the side panel prints that beside every tool');
  /* An option says what it CHANGES. A role is derived from hooks and cannot go
     stale; this cannot be derived from anything — no hook distinguishes a
     detection threshold from a display preference — so it is declared, and an
     undeclared one has nowhere to be filed. Without this the ⚙ view silently
     goes back to being one flat list ordered by filename, which is the state
     this whole category pass existed to fix. */
  /* The FAMILY is a declared fact the runtime needs (the bundle has no
     folders), so like `affects:` it is declared — and audited against the one
     thing it must equal: the domain folder the tool actually sits in. */
  const declared = (t.s.match(/\bfamily: '([a-z]+)'/) || [])[1] || null;
  const actual = t.f.includes('/') ? t.f.split('/')[0] : null;
  if (declared !== actual)
    bad.push(`family: ${JSON.stringify(declared)} but the folder says ` +
             `${JSON.stringify(actual)} — the declaration exists for the ` +
             'runtime and must match the tree');
  bad.push(...optionProblems(t.s));
  // The four kind rules that used to live here are gone. A `kind` label could
  // only repeat what the hooks already said — this file proved it by checking
  // the label by grepping for the hook — and one label per tool made roles
  // exclusive for no reason but the shape of the label. Tools now declare
  // nothing; the hook list below IS the declaration, and it cannot go stale.
  t.s.split('\n').forEach((line, n) => {
    for (const m of line.matchAll(ACCESSOR))
      if (m[1] !== t.id) bad.push(`line ${n + 1}: names another tool — ${m[0].trim()})`);
    for (const m of line.matchAll(BY_FIELD))
      // only another TOOL's id counts; el.id === 'header' is page data
      if (m[1] !== t.id && ids.includes(m[1])) bad.push(`line ${n + 1}: names another tool — ${m[0].trim()}`);
  });

  const hooks = HOOKS.filter((h) => calls(t.s, h));
  if (!hooks.length) bad.push('implements no hook — nothing would ever call it');
  /* EVERY TOOL MUST BE WORTH ARMING ALONE.
     These are the hooks whose effect both depends on the tool being armed and
     is visible on screen. The others cannot carry a tool by themselves:
     `annotate` is a lens that decorates what OTHER tools print, so armed alone
     it shows nothing; `report`/`reportTail` are text in a copied report; and
     findings from `audit`/`auditPage` reach the ⌕ list whether the tool is
     armed or not, so a rule with no `draw` changes nothing when switched on.
     Both were measured, not guessed — grid and dupid each produced zero badges,
     zero marks and zero lines armed by themselves, which is indistinguishable
     from a broken tool. A button that does nothing is worse than no button. */
  /* A RULE MUST SHOW WHERE. contrast and dupid outlined their findings and
     grid drew nothing, so a page with thousands of off-grid values had a full
     list and a blank page — every row clicked one at a time to locate it. A
     finding you cannot find is half a finding, and this is the difference
     between three rules behaving the same way and two of them happening to. */
  if ((hooks.includes('audit') || hooks.includes('auditPage')) && !hooks.includes('draw'))
    bad.push('produces findings but never draws them — add draw() so they can be found on the page');
  /* keeps counts as a surface because arming it alone visibly changes the
     page: selections persist and wear numbers instead of replacing each
     other. This EXTENDS the worth-arming set — an annotate/report/rule-only
     tool still fails exactly as before. */
  const SURFACE = ['badge', 'compact', 'draw', 'listRows', 'intercept', 'keeps'];
  if (hooks.length && !SURFACE.some((h) => hooks.includes(h)))
    bad.push(`no surface of its own (${hooks.join(', ')}) — armed alone this shows ` +
             `nothing. Add one of: ${SURFACE.join(', ')}`);
  if (bad.length) fail++;
  console.log(`  ${bad.length ? '✗' : '✓'} ${t.f.replace('tools/', '').padEnd(16)} id=${(t.id || '??').padEnd(9)}` +
              `${String(t.lines).padStart(3)} lines  hooks: ${hooks.join(', ') || 'none'}`);
  bad.forEach((b) => console.log(`      ${b}`));
}

/* ---- import boundaries ---------------------------------------------------
   The regex layer rules above catch NAMES; these catch the graph itself. Each
   is the structural version of a rule this project already lives by, and the
   set was verified against the real graph before it was written down — every
   rule below held on the day it landed. */
console.log('\nIMPORT BOUNDARIES');
const { importsOf } = require('./hooks.js');
const IMPORT_RULES = [
  ['tools stay behind the registry',
   (f, to) => f.startsWith('tools/') &&
     !(to.startsWith('core/') || to.startsWith('subjects/') ||
       to.split('/').slice(0, 2).join('/') === f.split('/').slice(0, 2).join('/')),
   'a tool imports only core/, subjects/ and its own folder — anything ' +
   'else it wants, it asks the registry. If what you want is another ' +
   "tool's service.js, that backend now has two consumers: PROMOTE it " +
   'to subjects/ (keep its id, declare uses: in both) — a fact two ' +
   'tools consult is a subject, not private property'],
  ['nothing names a tool but the manifest',
   (f, to) => to.startsWith('tools/') && !f.startsWith('tools/') &&
     f !== 'manifest.js',
   'tools are reached through hooks; importing one couples to its name'],
  ['core imports only core',
   (f, to) => f.startsWith('core/') && !to.startsWith('core/'),
   'core is under everything, so it may depend on nothing above itself'],
  ['services never import app',
   (f, to) => f.startsWith('services/') && to.startsWith('app/'),
   'a service collects and renders; deciding is app/'],
  ['ui never imports app',
   (f, to) => f.startsWith('ui/') && to.startsWith('app/'),
   'ui fires callbacks; app decides what they mean'],
];
for (const [name, bad, why] of IMPORT_RULES) {
  const hits = [];
  for (const f of walk()) {
    if (f === 'manifest.js' && name !== 'nothing names a tool but the manifest') continue;
    for (const to of importsOf(f)) if (bad(f, to)) hits.push(`${f} → ${to}`);
  }
  if (hits.length) { console.log(`  ✗ ${name} — ${why}\n      ${hits.join('\n      ')}`); fail++; }
  else console.log(`  ✓ ${name}`);
}

console.log('\nSUBJECTS');
const subjectIds = subjects.map((x) => x.id).filter(Boolean);
for (const x of subjects) {
  const bad = [];
  if (x.defs !== 1) bad.push(`${x.defs} defineSubject() calls, expected 1`);
  if (!x.id) bad.push('no id');
  else if (subjectIds.indexOf(x.id) !== subjectIds.lastIndexOf(x.id))
    bad.push(`duplicate id '${x.id}'`);
  else if (ids.includes(x.id)) bad.push(`id '${x.id}' is already a tool's — settings share one store`);
  if (!x.icon) bad.push('no icon — its ⚙ rows would have a blank tag');
  bad.push(...optionProblems(x.s));
  if (bad.length) fail++;
  console.log(`  ${bad.length ? '✗' : '✓'} ${x.f.replace('subjects/', '').padEnd(16)}` +
              `id=${(x.id || '??').padEnd(9)}${String(x.lines).padStart(4)} lines`);
  bad.forEach((b) => console.log(`      ${b}`));
}

/* ---- layer rules ---------------------------------------------------------
   The folders are only guidance until something checks them. Every one of
   these held the day the folders landed — by habit, which is precisely the
   state a boundary is in just before it quietly stops being true.

   They are also the answer to "where does my new file go": if it would break
   one of these, it belongs in a different folder. */
console.log('\nLAYERS');
const LAYERS = [
  ['core/', /\bPanel\.|\bList\.|\bRender\.|\bController\.|\bSettings\./,
   'CORE is used by everything and reaches up to nothing'],
  ['ui/', /\bController\.|\bSweep\.|\bReport\./,
   'UI fires callbacks; APP decides what they mean'],
  ['ui/', /defineTool\(/, 'UI draws the panel — a capability is a tool, in tools/'],
  ['app/', /defineTool\(/, 'APP is glue and page-level work — a capability is a tool'],
  // A subject is called BY tools and never calls back. Without this it
  // would drift into being a tool that simply has no button.
  ['subjects/', /\bPanel\.|\bList\.|\bRender\.|\bController\.|\bSettings\.|defineTool\(/,
   'A SUBJECT is measurement plus settings — it is called, and calls nothing back'],
];
for (const [dir, pattern, why] of LAYERS) {
  const hits = walk().filter((f) => f.startsWith(dir) && pattern.test(strip(read(f))));
  if (hits.length) {
    console.log(`  ✗ ${dir}* — ${why}\n      ${hits.join(', ')}`);
    fail++;
  } else console.log(`  ✓ ${dir}* — ${why}`);
}

/* Nothing declares a tool's role any more, so the hook list has to be true.
   A name in HOOKS that no file consumes is a contract nobody honours: a tool
   implementing it would pass this audit, print in the column above, and never
   be called. That is exactly the silent failure the kind rules were guarding
   against, moved to where it can actually be checked. */
console.log('\nHOOK CONTRACT');
/* Deliberately NOT the tools: a hook honoured only by the tool that implements
   it is still a contract nobody calls. The consumer has to be core. */
const consumers = walk().filter((f) => !f.startsWith('tools/') && !f.startsWith('subjects/')).map((f) => [f, read(f)]);
for (const h of HOOKS) {
  const users = consumers.filter(([, s]) =>
    new RegExp(`\\.${h}\\b|\\bt\\.${h}|withHook\\('${h}'|'${h}'`).test(strip(s))).map(([f]) => f);
  if (!users.length) fail++;
  console.log(`  ${users.length ? '✓' : '✗'} ${h.padEnd(14)}${users.join(', ') || 'nothing calls this'}`);
}

/* A flat tools/ is right until it is not, and the moment it stops being right
   is not something anyone notices while adding the file that broke it. Advisory
   like the line count, and it names the axis — subdivide by SUBJECT (layout,
   a11y, content), never by role. A role is derived from hooks, so a folder
   named after one goes stale the day someone adds a badge() and nothing moves
   the file. Directories are for what a file IS, not for what it does. */
const FLAT_TOOLS = 20;
if (tools.length > FLAT_TOOLS) {
  console.log(`\n! tools/ holds ${tools.length} folders — past ${FLAT_TOOLS} one flat level stops` +
              ` helping.\n  Subdivide by SUBJECT (layout/, a11y/, content/), never by role.` +
              `\n  build.js globs tools/ recursively, so the layout is free to change.`);
}

console.log('\nFILE SIZES');
const all = walk().map((f) => [f, path.join(SRC, f)]);
const BIG = 220;
for (const [name, p] of all.sort()) {
  const n = fs.readFileSync(p, 'utf8').split('\n').length;
  const flag = n > BIG ? `  ← over ${BIG}, consider splitting` : '';
  console.log(`  ${n > BIG ? '!' : ' '} ${name.padEnd(24)}${String(n).padStart(4)}${flag}`);
}

console.log(`\n${fail ? '✗' : '✓'} ${fail} problem(s)\n`);
process.exit(fail ? 1 : 0);
