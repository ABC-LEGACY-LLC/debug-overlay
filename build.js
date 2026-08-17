#!/usr/bin/env node
/**
 * build.js — bundles src/ into one Tampermonkey userscript.
 *
 *   node build.js            patch bump   3.8.0 → 3.8.1
 *   node build.js --minor    minor bump   3.8.1 → 3.9.0
 *   node build.js --major    major bump   3.9.0 → 4.0.0
 *   node build.js --same     no bump (local testing only)
 *   node build.js --watch    rebuild on save, no bump
 *
 * WHY THE BUMP MATTERS: Tampermonkey only pulls a new version when @version
 * is HIGHER than what it has installed. Push without bumping and nothing
 * updates on your other machines — so the bump is automatic here.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'userscript.json'), 'utf8'));
/** Placeholder in src/01-config.js, replaced with the real version at bundle time. */
const VERSION_TOKEN = '__VERSION__';

/**
 * THE LOAD ORDER, stated once and in the open.
 *
 * The bundle is a single IIFE with no imports: banner.js opens it, boot.js
 * closes it, and everything between shares one closure. So order is a hard
 * dependency — panel reads CONFIG while it builds its own markup, and a file
 * evaluated too early is a TDZ ReferenceError at boot, which on a userscript
 * means a blank overlay on every site with no console anyone reads.
 *
 * That order used to be encoded in filename prefixes, because the build was
 * `readdirSync().sort()`. It worked, and it cost: renaming a file moved it,
 * the same convention meant load order here and display order in tools/, and
 * folders were unusable for anything ordered. Naming it here instead makes the
 * filenames free and the folders real.
 *
 * '@tools' expands to every file in tools/, still auto-discovered and still
 * sorted — a new debug capability stays ONE NEW FILE with nothing else edited.
 * Tools may not name each other, so their order is presentation only: which
 * button sits where, and which row is first under ⚙.
 */
const ORDER = [
  'banner.js',
  'core/config.js', 'core/state.js', 'core/utils.js',
  'core/geometry.js', 'core/registry.js',
  '@tools',
  'ui/styles.js', 'ui/dom.js', 'ui/controls.js', 'ui/list.js',
  'ui/panel.js', 'ui/placement.js', 'ui/badges.js', 'ui/renderer.js',
  'app/report.js', 'app/interactions.js', 'app/controller.js',
  'app/settings.js', 'app/sweep.js',
  'boot.js',
];

/** Every .js under src/, as paths relative to src/. */
function allSources(dir = SRC, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...allSources(path.join(dir, e.name), rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

/** src files, in the order above. Tools are auto-discovered. */
function sources() {
  const tools = allSources().filter((f) => f.startsWith('tools/')).sort();
  const files = ORDER.flatMap((f) => (f === '@tools' ? tools : [f]));

  // A file nobody listed would otherwise be silently left out of the bundle —
  // the same class of failure as a push that never reaches the browser, and
  // just as invisible. Being in src/ and being shipped must not be two things.
  const missing = allSources().filter((f) => !files.includes(f));
  if (missing.length) {
    console.error(`✗ not in ORDER, so not in the bundle:\n    ${missing.join('\n    ')}\n` +
                  `  Add it to ORDER in build.js, at the point its dependencies allow.`);
    process.exit(1);
  }
  for (const f of files) {
    if (fs.existsSync(path.join(SRC, f))) continue;
    console.error(`✗ ORDER lists src/${f}, which does not exist`);
    process.exit(1);
  }
  return files.map((f) => path.join(SRC, f));
}

function bump(v, kind) {
  const [a, b, c] = v.split('.').map(Number);
  if (kind === 'major') return `${a + 1}.0.0`;
  if (kind === 'minor') return `${a}.${b + 1}.0`;
  if (kind === 'same') return v;
  return `${a}.${b}.${c + 1}`;
}

function metaBlock(version) {
  const raw = `${cfg.rawBase}/${cfg.distFile}`;
  const rows = [
    ['name', cfg.name],
    ['namespace', cfg.namespace],
    ['version', version],
    ['description', cfg.description],
    ['author', cfg.author],
    ...cfg.match.map((m) => ['match', m]),
    // Asking for anything moves the script into the manager's sandbox — that
    // is the cost of GM_getValue, and it is what buys storage that is not
    // scoped to one origin. Nothing here may assume page context.
    ...(cfg.grant?.length ? cfg.grant : ['none']).map((g) => ['grant', g]),
    // The manager keeps us out of frames, including cross-origin ones the
    // script cannot recognise from the inside.
    ...(cfg.noframes ? [['noframes', '']] : []),
    ['run-at', 'document-idle'],
    // these two are what make every machine self-update after a git push
    ['updateURL', `${cfg.rawBase}/${cfg.metaFile}`],
    ['downloadURL', raw],
  ];
  const pad = Math.max(...rows.map(([k]) => k.length)) + 2;
  return ['// ==UserScript==',
    // trimEnd: @noframes is a flag with no value, and a line of trailing
    // padding is not what a metadata block should look like
    ...rows.map(([k, v]) => `// @${k.padEnd(pad)}${v}`.trimEnd()),
    '// ==/UserScript=='].join('\n');
}

function build(kind) {
  const version = bump(cfg.version, kind);
  const files = sources();
  const body = files.map((f) => {
    const rel = path.relative(ROOT, f);
    return `  // ─── ${rel} ${'─'.repeat(Math.max(0, 66 - rel.length))}\n` +
           fs.readFileSync(f, 'utf8').replace(/\s*$/, '\n');
  }).join('\n');

  const docs = fs.readFileSync(path.join(ROOT, 'DOCS.txt'), 'utf8').trim();
  // The overlay has to be able to say which version it is. @grant none means
  // no GM_info, so the number is substituted in here — where it is already
  // known — rather than hand-copied into a source file that would then drift.
  if (!body.includes(VERSION_TOKEN)) {
    console.error(`✗ ${VERSION_TOKEN} not found in src/ — nothing would tell the ` +
                  `overlay its version, and a stale install would look current`);
    process.exit(1);
  }
  const stamped = body.replace(VERSION_TOKEN, version);
  const out = `${metaBlock(version)}\n\n/*\n${docs}\n*/\n\n${stamped}`;

  fs.mkdirSync(DIST, { recursive: true });
  const distPath = path.join(DIST, cfg.distFile);
  fs.writeFileSync(distPath, out);
  fs.writeFileSync(path.join(DIST, cfg.metaFile), metaBlock(version) + '\n');

  // never ship something that does not parse
  try {
    cp.execSync(`node --check "${distPath}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error('✗ syntax error in bundle:\n' + e.stderr.toString());
    process.exit(1);
  }

  if (kind !== 'same') {
    cfg.version = version;
    fs.writeFileSync(path.join(ROOT, 'userscript.json'), JSON.stringify(cfg, null, 2) + '\n');
  }
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log(`✓ v${version}  ${files.length} files → dist/${cfg.distFile}  (${kb} KB)`);
  return distPath;
}

const arg = process.argv[2] || '';
if (arg === '--watch') {
  build('same');
  console.log('watching src/ …');
  let t = null;
  const rebuild = () => { clearTimeout(t); t = setTimeout(() => build('same'), 120); };
  fs.watch(SRC, { recursive: true }, rebuild);
} else {
  build(arg.replace('--', '') || 'patch');
}
