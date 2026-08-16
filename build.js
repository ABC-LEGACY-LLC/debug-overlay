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

/** src files, in dependency order. Tools are auto-discovered. */
function sources() {
  const top = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
  const tools = fs.existsSync(path.join(SRC, 'tools'))
    ? fs.readdirSync(path.join(SRC, 'tools')).filter((f) => f.endsWith('.js')).sort()
        .map((f) => path.join('tools', f))
    : [];
  const before = top.filter((f) => f <= '05-registry.js');
  const after = top.filter((f) => f > '05-registry.js');
  return [...before, ...tools, ...after].map((f) => path.join(SRC, f));
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
    ['grant', 'none'],
    ['run-at', 'document-idle'],
    // these two are what make every machine self-update after a git push
    ['updateURL', `${cfg.rawBase}/${cfg.metaFile}`],
    ['downloadURL', raw],
  ];
  const pad = Math.max(...rows.map(([k]) => k.length)) + 2;
  return ['// ==UserScript==',
    ...rows.map(([k, v]) => `// @${k.padEnd(pad)}${v}`),
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
