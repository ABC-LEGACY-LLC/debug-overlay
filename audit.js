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

/** file → [ruleName, forbidden regex, why] */
const RULES = [
  ['03-utils.js', /\bState\./, 'UTILS must stay pure — callers pass flags in'],
  ['03-utils.js', /document\.createElement/, 'UTILS must not build DOM'],
  ['04-measure.js', /\bTools\.|\bPanel\./, 'MEASURE is tool-agnostic geometry'],
  ['08-panel.js', /\bState\./, 'PANEL fires callbacks; CONTROLLER owns state'],
  ['08-panel.js', /\bpairs?\b|measurePins/, 'PANEL must not know what a pair is'],
  ['11-renderer.js', /'measure'|'grid'|'contrast'|MEASURE_MODE/, 'RENDERER must ask tools via hooks'],
  ['13-interactions.js', /'measure'|'grid'|'contrast'/, 'INTERACTIONS must use CONFIG.PIN_KIND'],
  ['14-controller.js', /'measure'|'grid'|'contrast'/, 'CONTROLLER must not hardcode tool ids'],
  ['09-placement.js', /\bTools\.|\bState\./, 'PLACEMENT only positions boxes'],
];

let fail = 0;
console.log('\nARCHITECTURE RULES');
for (const [file, pattern, why] of RULES) {
  if (!exists(file)) { console.log(`  ? ${file} missing`); fail++; continue; }
  const m = read(file).match(pattern);
  const label = `${file} — ${why}`;
  if (m) { console.log(`  ✗ ${label}\n      found: ${m[0]}`); fail++; }
  else console.log(`  ✓ ${label}`);
}

console.log('\nTOOL FILES');
const toolDir = path.join(SRC, 'tools');
const tools = fs.readdirSync(toolDir).filter((f) => f.endsWith('.js')).sort();
for (const f of tools) {
  const s = fs.readFileSync(path.join(toolDir, f), 'utf8');
  const calls = (s.match(/defineTool\(/g) || []).length;
  const id = (s.match(/id: '([a-z]+)'/) || [])[1];
  const hooks = ['badge', 'compact', 'report', 'reportTail', 'draw', 'listRows', 'pendingIndex']
    .filter((h) => new RegExp(`\\b${h}\\s*[({]`).test(s));
  const bad = calls !== 1 || !id;
  if (bad) fail++;
  console.log(`  ${bad ? '✗' : '✓'} ${f.padEnd(16)} id=${id || '??'}  ` +
              `${String(s.split('\n').length).padStart(3)} lines  hooks: ${hooks.join(', ') || 'none'}`);
}

console.log('\nFILE SIZES');
const all = [...fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).map((f) => [f, path.join(SRC, f)]),
             ...tools.map((f) => ['tools/' + f, path.join(toolDir, f)])];
const BIG = 220;
for (const [name, p] of all.sort()) {
  const n = fs.readFileSync(p, 'utf8').split('\n').length;
  const flag = n > BIG ? `  ← over ${BIG}, consider splitting` : '';
  console.log(`  ${n > BIG ? '!' : ' '} ${name.padEnd(22)}${String(n).padStart(4)}${flag}`);
}

console.log(`\n${fail ? '✗' : '✓'} ${fail} problem(s)\n`);
process.exit(fail ? 1 : 0);
