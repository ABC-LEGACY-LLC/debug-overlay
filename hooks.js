/**
 * hooks.js — the hook vocabulary, and what each one FEEDS.
 *
 * Shared by audit.js (which enforces it) and map.js (which documents it), so
 * there is one definition rather than two that agree until they do not. The
 * surface map in particular was written by hand twice and was wrong twice:
 * the pin outline and the #N chip are drawn by the RENDERER for every pin, and
 * a tool only ever adds to a surface core has already put on the screen.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');

const HOOKS = ['badge', 'compact', 'report', 'reportTail', 'draw', 'listRows',
               'pendingIndex', 'annotate', 'audit', 'auditPage', 'options',
               'intercept', 'groups', 'gestures'];

/** Comments first: a file that merely EXPLAINS a hook is not implementing it. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** \b would match U.mark(…); a hook is never called through a dot. */
const calls = (s, h) => new RegExp(`(^|[^.\\w])${h}\\s*\\(`, 'm').test(strip(s));

/** Every .js under src/, as paths relative to src/. */
const walk = (dir = SRC, base = '') => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out.sort();
};

/** The registered files under one folder, with their id and their hooks. */
const registered = (dir) => walk().filter((f) => f.startsWith(dir + '/')).map((f) => {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  return { f, s, id: (s.match(/id: '([a-z][a-z0-9-]*)'/) || [])[1],
           hooks: HOOKS.filter((h) => calls(s, h)) };
});

/**
 * THE SURFACES, and the three layers every one of them has.
 *
 *   core  — what is drawn whether or not any tool is armed
 *   fills — the hooks through which a tool adds to it
 *
 * Getting this wrong is easy and invisible: `select` looked like the owner of
 * the pin chip because it is the only tool touching that surface, when in fact
 * the renderer draws the chip and select only appends the "…".
 */
const SURFACES = [
  { key: '① badge', core: 'renderer — the box, and the #N prefix',
    fills: ['badge', 'compact', 'annotate'] },
  { key: '② pin marks', core: 'renderer — the outline AND the #N chip',
    fills: ['pendingIndex'] },
  { key: '③ page marks', core: 'renderer — the layer, cleared every frame',
    fills: ['draw'] },
  { key: '④ pin list', core: 'controller — a plain row per unclaimed pin',
    fills: ['listRows'] },
  { key: '⑤ findings', core: 'controller — grouping, sort, the ×N counts',
    fills: ['audit', 'auditPage'] },
  { key: '⑥ report', core: 'report — header, scope, the ## rules section',
    fills: ['report', 'reportTail'] },
  { key: '⚙ settings', core: 'settings — grouping by affects, plus KEYS',
    fills: ['options', 'gestures'] },
  { key: 'input', core: 'interactions — hover, click, pins, hotkeys',
    fills: ['intercept'] },
];

/**
 * THE THREE SPECIES, derived from hooks — the same derivation the registry's
 * ROLES make at runtime. A flat component list forced select and measure into
 * one rowset and every map drawn over it felt wrong; the bands are what the
 * hooks actually say.
 *
 *   DESCRIBER — speaks ABOUT elements: badge/compact/annotate, audit/auditPage
 *   SELECTOR  — decides WHICH elements: groups/listRows/pendingIndex
 *   ACTOR     — takes the user's input: intercept
 *
 * Plural on purpose (grid is Inspect+Detect, both describer duties). A tool in
 * two bands would be listed in both — none is today, and if one appears the
 * map shows it rather than hiding it.
 */
const bandsOf = (t) => {
  const has = (h) => t.hooks.includes(h);
  const out = [];
  if (has('badge') || has('compact') || has('annotate') ||
      has('audit') || has('auditPage')) out.push('DESCRIBER');
  if (has('groups') || has('listRows') || has('pendingIndex')) out.push('SELECTOR');
  if (has('intercept')) out.push('ACTOR');
  return out;
};

module.exports = { SRC, HOOKS, SURFACES, strip, calls, walk, registered, bandsOf };
