#!/usr/bin/env node
/**
 * ship.js — the two questions `npm run check` cannot answer.
 *
 *   npm run ship      verify, bump, rebuild — then commit and push
 *   npm run shipped   is what I pushed actually reaching a browser?
 *
 * WHY THIS EXISTS: `check` builds with --same, so it does not bump. A green
 * check followed by a commit and a push ships a version Tampermonkey already
 * has, it decides there is nothing to fetch, and NOTHING REPORTS AN ERROR —
 * the push succeeds, the overlay never changes. That has happened here. The
 * warning about it lived in prose, and prose is not a guard.
 *
 * So: `ship` makes forgetting the bump impossible, and `shipped` asks the
 * update URL what the world can actually see, which is the only answer that
 * counts.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const https = require('https');

const ROOT = __dirname;
const cfg = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'userscript.json'), 'utf8'));

const run = (cmd) => cp.execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
const quiet = (cmd) => { try { return cp.execSync(cmd, { cwd: ROOT }).toString().trim(); } catch { return ''; } };

/** GET a URL as text, or null for anything that is not a clean 200. */
function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

const versionOf = (txt) => (String(txt || '').match(/@version\s+(\S+)/) || [])[1] || null;

/** Is a newer than b? Tampermonkey updates on strictly greater, so do we. */
function newer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function status() {
  const c = cfg();
  const url = `${c.rawBase}/${c.metaFile}`;
  const local = c.version;
  const unpushed = quiet('git log --oneline @{u}..HEAD').split('\n').filter(Boolean);
  const dirty = quiet('git status --porcelain').split('\n').filter(Boolean);

  console.log(`\n  here    v${local}`);
  console.log(`  url     ${url}`);
  const served = versionOf(await get(url));
  console.log(`  live    ${served ? 'v' + served : '(unreachable — offline, or the URL is wrong)'}\n`);

  if (dirty.length) console.log(`  ! ${dirty.length} uncommitted file(s) — not in any push yet`);
  if (unpushed.length) {
    console.log(`  ! ${unpushed.length} commit(s) not pushed:`);
    unpushed.forEach((l) => console.log(`      ${l}`));
  }

  if (!served) {
    console.log('\n  ? cannot tell. If this is not a network problem, the update URL is\n' +
                '    wrong and no install has ever been able to reach it.\n');
    return 0;
  }
  if (served === local) {
    if (!unpushed.length && !dirty.length) {
      console.log(`\n  ✓ v${local} is live. Tampermonkey will pick it up on its next check —\n` +
                  '    GitHub\'s raw CDN caches for a few minutes, so allow for that.\n');
      return 0;
    }
    // THE original bug, caught: work in hand, and the version on it is one the
    // world already has. Push this and every installation decides there is
    // nothing to fetch — silently, with no error anywhere.
    console.log(`\n  ✗ v${local} is live AND is the version sitting on your changes.\n` +
                '    Pushing now would reach nobody: Tampermonkey only fetches on a\n' +
                '    HIGHER @version. Run `npm run ship` to bump before committing.\n');
    return 1;
  }
  if (newer(local, served)) {
    console.log(`\n  ✗ v${local} is here and v${served} is live. Nobody has this yet.\n` +
                (unpushed.length || dirty.length
                  ? '    Commit and push.\n'
                  : '    Pushed already? Then the CDN is still catching up — try again shortly.\n'));
    return 1;
  }
  console.log(`\n  ✗ live is v${served}, ahead of this checkout (v${local}).\n` +
              '    Somebody else pushed. Pull before building anything on top.\n');
  return 1;
}

async function ship() {
  console.log('\n── verifying ──');
  run('node build.js --same && node audit.js && node test.js');

  const before = cfg().version;
  console.log('── bumping ──');
  run(`node build.js ${process.argv.includes('--minor') ? '--minor'
                     : process.argv.includes('--major') ? '--major' : ''}`.trim());
  const after = cfg().version;

  // The whole point of this script. If it ever prints, the bump silently did
  // not happen and the push would have reached nobody.
  if (!newer(after, before)) {
    console.error(`\n  ✗ version did not increase (${before} → ${after}).\n` +
                  '    Tampermonkey only fetches on a HIGHER @version, so this\n' +
                  '    build would install nowhere. Not safe to push.\n');
    process.exit(1);
  }

  const dist = quiet('git status --porcelain dist/').split('\n').filter(Boolean);
  if (!dist.length) {
    console.error('\n  ✗ dist/ is unchanged after a version bump — that cannot be right.\n');
    process.exit(1);
  }

  console.log(`\n  ✓ v${before} → v${after}, dist/ rebuilt. Now:\n\n` +
              '      git add -A && git commit -m "…" && git push\n\n' +
              '  then `npm run shipped` to confirm it actually reached the URL\n' +
              '  Tampermonkey reads. A push is not a release until that says so.\n');
}

(process.argv.includes('--status') ? status().then((c) => process.exit(c)) : ship())
  .catch((e) => { console.error(e.message); process.exit(1); });
