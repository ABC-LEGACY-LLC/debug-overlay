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

/**
 * The registered COMPONENTS — one folder each under src/components/, read as a
 * unit: a component's behaviour is spread over the files beside its index, so
 * id, hooks and options are properties of the folder's concatenation, not of
 * any single file. (`registered('tools')` was the flat-file era's version.)
 */
const registered = () => {
  /* A component is THE FOLDER THAT HOLDS AN index.js — not the first path
     segment. That is what lets components/ grow domain folders the day a
     subject gains a second consumer (components/colour/contrast/ beside
     components/colour/palette/) without this file changing again: the domain
     folder has no index.js, so it groups and is nothing. A file under
     components/ with no index.js anywhere above it belongs to no component,
     and that is reported rather than silently skipped. */
  const files = walk().filter((x) => x.startsWith('components/'));
  const indexDirs = new Set(files.filter((f) => f.endsWith('/index.js'))
    .map((f) => f.slice(0, -'/index.js'.length)));
  const byComp = {};
  const orphans = [];
  for (const f of files) {
    let dir = f.slice(0, f.lastIndexOf('/'));
    while (dir.includes('/') && !indexDirs.has(dir)) dir = dir.slice(0, dir.lastIndexOf('/'));
    if (!indexDirs.has(dir)) { orphans.push(f); continue; }
    (byComp[dir] = byComp[dir] || []).push(f);
  }
  return Object.entries(byComp).sort().map(([dir, fls]) => {
    const s = fls.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
    return { f: dir.replace(/^components\//, ''), files: fls, s, orphans,
             id: (s.match(/id: '([a-z][a-z0-9-]*)'/) || [])[1],
             hooks: HOOKS.filter((h) => calls(s, h)) };
  });
};

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
 * THE THREE SPECIES, derived from hooks — named by the direction of flow.
 *
 *   COMPONENT — reads the page, produces content INTO SERVICES for your eyes:
 *               badge/compact/annotate, audit/auditPage
 *   SOURCE    — input side: turns your clicks into what components work ON
 *               (pins, groups): groups/listRows/pendingIndex
 *   ACTION    — input side: turns a click into a DIRECT effect, no component
 *               in between: intercept
 *
 * The SERVICES are the four core-owned collectors a component fills from
 * inside its own file: badge, ⌕ findings, ⧉ report, ⚙ settings.
 *
 * Plural on purpose — a tool in two bands would be listed in both.
 */
const bandsOf = (t) => {
  const has = (h) => t.hooks.includes(h);
  const out = [];
  if (has('badge') || has('compact') || has('annotate') ||
      has('audit') || has('auditPage')) out.push('COMPONENT');
  if (has('groups') || has('listRows') || has('pendingIndex')) out.push('SOURCE');
  if (has('intercept')) out.push('ACTION');
  return out;
};

/**
 * SERVICE FAMILIES. A service can carry more than one KIND of content, and the
 * badge is the first with a named family. The facet is not a new mechanism —
 * CURRENT and ISSUE are what badge/compact and annotate already were, and
 * RECOMMENDATION is content inside the same lens, shipped WITH its first
 * producer (grid's `suggest` toggle) because nothing here is created for a
 * consumer that is not there.
 */
const FACETS = {
  badge: [
    { key: 'CURRENT', example: 'p 7', means: "the component's own fields",
      via: 'badge / compact' },
    { key: 'ISSUE', example: 'p 7⚠', means: 'a lens marking a value that fails',
      via: 'annotate' },
    { key: 'RECOMMENDATION', example: 'p 7⚠→8', means: 'what would pass — off by default',
      via: "annotate + the lens's suggest option" },
  ],
};

/** Every import specifier in a src file, resolved to src-relative paths. */
const importsOf = (file) => {
  const s = fs.readFileSync(path.join(SRC, file), 'utf8');
  const out = [];
  for (const m of s.matchAll(/from '([^']+)'/g)) {
    const abs = path.normalize(path.join(path.dirname(file), m[1]));
    out.push(abs.replace(/\\/g, '/'));
  }
  return out;
};

module.exports = { SRC, HOOKS, SURFACES, FACETS, strip, calls, walk, registered, bandsOf, importsOf };
