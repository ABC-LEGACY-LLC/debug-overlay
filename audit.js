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
const toolDir = path.join(SRC, 'tools');
const toolFiles = fs.existsSync(toolDir)
  ? fs.readdirSync(toolDir).filter((f) => f.endsWith('.js')).sort()
  : [];
const tools = toolFiles.map((f) => {
  const s = fs.readFileSync(path.join(toolDir, f), 'utf8');
  return {
    f, s,
    id: (s.match(/id: '([a-z][a-z0-9-]*)'/) || [])[1],
    // Quote-agnostic: grid's title is a template literal. Only presence is
    // checked — the value is the author's business, having one is not.
    icon: /\bicon:\s*(['"`])(.+?)\1/.test(s),
    title: /\btitle:\s*(['"`])(.+?)\1/.test(s),
    // the `kind:` extractor that used to sit here is gone with the field it
    // read — it had been parsed into a variable nothing looked at for releases
    defs: (s.match(/defineTool\(/g) || []).length,
    lines: s.split('\n').length,
  };
});
const ids = tools.map((t) => t.id).filter(Boolean);

/** file → [ruleName, forbidden regex, why] */
const RULES = [
  ['core/utils.js', /\bState\./, 'UTILS must stay pure — callers pass decorators in'],
  ['core/utils.js', /document\.createElement/, 'UTILS must not build DOM'],
  ['core/utils.js', /class="/, 'UTILS must not own markup — the tool that styles it does'],
  ['core/geometry.js', /\bTools\.|\bPanel\./, 'MEASURE is tool-agnostic geometry'],
  // Persistence goes through Store, which is per-script; localStorage is per
  // origin, and with @match *://*/* that silently means "per site" — the bug
  // this project just spent a release fixing.
  ['ui/panel.js', /localStorage/, 'STORE owns persistence — localStorage is per-origin'],
  ['app/controller.js', /localStorage/, 'STORE owns persistence — localStorage is per-origin'],
  ['ui/panel.js', /\bState\./, 'PANEL fires callbacks; CONTROLLER owns state'],
  ['ui/panel.js', /\bpairs?\b|measurePins/, 'PANEL must not know what a pair is'],
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

console.log('\nTOOL FILES');
/* A tool may not reach for another tool by id — that coupling is what the
   registry exists to prevent. Match the ACCESSOR, never the bare word:
   'grid' is also a CSS display value (measure has cs.display.includes('grid'))
   and 'contrast' is a CSS filter function, so a quoted-literal scan would be
   permanently red. */
const ACCESSOR = /(?:Tools\.\w+|State\.tools\.has)\s*\(\s*'([a-z][\w-]*)'/g;
const BY_FIELD = /\.id\s*===?\s*'([a-z][\w-]*)'/g;   // the other way back in
/* Comments are stripped first. Without that, a file that merely EXPLAINS a
   hook is reported as implementing it — 40-dupid.js says "audit(info) cannot
   ask this" in its own doc comment and was listed as having an audit hook it
   does not have. Only whole-line // comments go, so a URL inside a string
   keeps its slashes. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// \b would match U.mark(…) and this.pairs(); a hook is never called through a dot
const calls = (s, h) => new RegExp(`(^|[^.\\w])${h}\\s*\\(`, 'm').test(strip(s));
const HOOKS = ['badge', 'compact', 'report', 'reportTail', 'draw', 'listRows',
               'pendingIndex', 'annotate', 'audit', 'auditPage', 'options',
               'intercept', 'groups'];

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
  /* An option says what it CHANGES. A role is derived from hooks and cannot go
     stale; this cannot be derived from anything — no hook distinguishes a
     detection threshold from a display preference — so it is declared, and an
     undeclared one has nowhere to be filed. Without this the ⚙ view silently
     goes back to being one flat list ordered by filename, which is the state
     this whole category pass existed to fix. */
  const keys = (t.s.match(/\bkey: '/g) || []).length;
  const affects = [...t.s.matchAll(/\baffects: '([a-z]+)'/g)].map((m) => m[1]);
  if (keys !== affects.length)
    bad.push(`${keys} option(s) but ${affects.length} affects: — each option declares one`);
  for (const a of affects)
    if (CATS.length && !CATS.includes(a))
      bad.push(`affects: '${a}' is not a role — expected one of ${CATS.join(', ')}`);
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
  if (bad.length) fail++;
  console.log(`  ${bad.length ? '✗' : '✓'} ${t.f.padEnd(16)} id=${(t.id || '??').padEnd(9)}` +
              `${String(t.lines).padStart(3)} lines  hooks: ${hooks.join(', ') || 'none'}`);
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
const consumers = walk().filter((f) => !f.startsWith('tools/')).map((f) => [f, read(f)]);
for (const h of HOOKS) {
  const users = consumers.filter(([, s]) =>
    new RegExp(`\\.${h}\\b|\\bt\\.${h}|withHook\\('${h}'|'${h}'`).test(strip(s))).map(([f]) => f);
  if (!users.length) fail++;
  console.log(`  ${users.length ? '✓' : '✗'} ${h.padEnd(14)}${users.join(', ') || 'nothing calls this'}`);
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
