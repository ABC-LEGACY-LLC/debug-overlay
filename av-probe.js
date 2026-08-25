#!/usr/bin/env node
/**
 * av-probe.js — find out WHICH construct a security scanner objects to.
 *
 *     node av-probe.js        → dist/av-probe/debug-overlay-av-probe.zip
 *
 * WHY THIS EXISTS. Microsoft Defender quarantines dist/browser-extension/
 * update.js as Trojan:Win32/Fauppod.A!cl and leaves every other shipped
 * file alone — including content.js, which is 24x larger. The verdict is
 * cloud-delivered (!cl), so there is no local signature to read and no rule
 * text to inspect: the only way to learn anything is to present the scanner
 * with subsets and see which ones it takes.
 *
 * This is DIAGNOSIS, not evasion. Two outcomes and they lead opposite ways:
 *
 *   - the trigger is the CORE behaviour (fetch + write to disk). Then no
 *     code change is honest — the file does what it looks like it does —
 *     and the answers are a folder exclusion or a false-positive report to
 *     Microsoft. This script's output is exactly what such a report needs:
 *     the smallest file that reproduces the detection.
 *   - the trigger is INCIDENTAL (a string, a loop shape, base64 handling).
 *     Then the resemblance is accidental and removing it is just fixing
 *     code, not disguising it.
 *
 * NEVER COMMITTED. dist/av-probe/ is gitignored and this script regenerates
 * it, because probe-06 is update.js VERBATIM — the bytes under suspicion.
 * Committing them would hand the experiment to every clone unasked, and on
 * the affected machine the checkout itself would be the experiment. The
 * probe is opt-in or it is not a probe.
 *
 * HOW TO RUN IT. Extract the zip into a scratch folder — NOT the install
 * folder. Extraction alone is enough: Defender scans on write. Wait a
 * minute, then look at which files are still there. Whichever vanished
 * contain the trigger. The two controls tell you whether the run was valid
 * at all.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = fs.readFileSync(
  path.join(ROOT, 'browser-extension-source', 'update', 'update.js'), 'utf8');

/** Pull one top-level function out of update.js by name, verbatim. */
function fn(name) {
  const re = new RegExp(`(?:^|\\n)((?:async )?function ${name}\\b[\\s\\S]*?\\n\\})`, 'm');
  const m = SRC.match(re);
  if (!m) { console.error(`✗ could not extract ${name}()`); process.exit(1); }
  return m[1].trim();
}

const HEAD = "// Debug Overlay AV probe — a SUBSET of update.js, for diagnosis.\n" +
             "// Not loaded by anything. Safe to delete.\n\n";

/* Each probe is REAL code lifted from the shipped file, never rewritten —
   a rewritten probe would answer a question nobody asked. They build up in
   capability so the first one to vanish names the boundary. */
const PROBES = [
  ['00-control-inert',
   'the negative control: no APIs at all. If THIS vanishes, the scanner is\n' +
   '// taking the whole folder and the run tells you nothing about update.js.',
   'const version = "3.8.137";\nconst files = ["manifest.json", "content.js"];\nconsole.log(version, files.length);'],

  ['01-fetch-only',
   'fetches from the network. Writes nothing.',
   fn('fetchSoon') + '\n\nasync function main() {\n' +
   '  const r = await fetchSoon("https://raw.githubusercontent.com/x/y/main/manifest.json");\n' +
   '  return r.text();\n}'],

  ['02-write-only',
   'writes to a user-chosen folder. Fetches nothing.',
   fn('readOwn') + '\n\nasync function writeOne(dir, name, text) {\n' +
   '  const fh = await dir.getFileHandle(name, { create: true });\n' +
   '  const w = await fh.createWritable();\n  await w.write(text);\n  await w.close();\n}'],

  ['03-picker-only',
   'asks for a directory handle and permission. Neither fetches nor writes.',
   'async function pick() {\n  const dir = await showDirectoryPicker({ mode: "readwrite" });\n' +
   '  if (await dir.requestPermission({ mode: "readwrite" }) !== "granted") return null;\n' +
   '  return dir;\n}'],

  ['04-idb-handle',
   'stores a directory handle in IndexedDB across visits.',
   SRC.slice(SRC.indexOf('const DB = ()'), SRC.indexOf('/* ---- screen state'))],

  ['05-fetch-plus-write',
   'THE COMBINATION: downloads remote files and writes them to disk.\n' +
   '// This is the shape a downloader has. If the boundary is here, the\n' +
   '// detection is about what the program DOES, and no rewrite is honest.',
   fn('fetchSoon') + '\n\nasync function update(dir, base, files) {\n' +
   '  const texts = {};\n  for (const f of files) {\n' +
   '    const r = await fetchSoon(base + "/" + f);\n    texts[f] = await r.text();\n  }\n' +
   '  for (const f of files) {\n    const fh = await dir.getFileHandle(f, { create: true });\n' +
   '    const w = await fh.createWritable();\n    await w.write(texts[f]);\n    await w.close();\n  }\n}'],

  ['06-control-full',
   'the positive control: the real update.js, byte for byte. If this does\n' +
   '// NOT vanish, the scanner did not run and every other result is void.',
   SRC],
];

const OUT = path.join(ROOT, 'dist', 'av-probe');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const rows = [];
for (const [name, why, body] of PROBES) {
  const file = `probe-${name}.js`;
  fs.writeFileSync(path.join(OUT, file),
    HEAD + `// ${why}\n\n${body}\n`);
  rows.push([file, fs.statSync(path.join(OUT, file)).size]);
}

fs.writeFileSync(path.join(OUT, 'READ-ME-FIRST.txt'), [
  'Debug Overlay — antivirus probe',
  '',
  'WHAT THIS IS. Seven files, each a real SUBSET of the extension updater.',
  'Nothing here runs, nothing is loaded, nothing is installed. They exist to',
  'be looked at by your antivirus so we can learn which construct it objects',
  'to. Delete the whole folder when you are done.',
  '',
  'HOW TO RUN IT',
  '  1. Extract this zip into a NEW scratch folder.',
  '     NOT your extension install folder.',
  '  2. Wait about a minute. Defender scans on write.',
  '  3. Look at which files are still there.',
  '  4. Send back the list of which SURVIVED and which VANISHED.',
  '',
  'READING THE RESULT',
  '  probe-06-control-full VANISHED  -> the run is valid, keep reading',
  '  probe-06 SURVIVED               -> the scanner never looked; result void',
  '  probe-00-control-inert VANISHED -> the folder is being taken wholesale;',
  '                                     the run tells us nothing specific',
  '',
  '  If 05 vanishes but 01 02 03 04 survive, the trigger is fetch+write',
  '  TOGETHER -- the thing the updater genuinely does. That means no code',
  '  change is honest, and the fix is a folder exclusion or a false-positive',
  '  report to Microsoft (this folder is what such a report should attach).',
  '',
  '  If a single narrow probe vanishes on its own, the resemblance is',
  '  accidental and can simply be removed.',
  '',
  'THE FILES',
  ...rows.map(([f, s]) => `  ${f.padEnd(34)} ${String(s).padStart(6)} bytes`),
  '',
].join('\r\n'));

/* Zipped with the same store-method writer the extension package uses, so
   this needs no tooling the repo does not already have. Store method, no
   compression: a compressed probe is a probe the scanner reads differently. */
const zipStore = require('./build.js').zipStore || null;
if (!zipStore) {
  // build.js does not export it; inline the same 40 lines rather than
  // refactor a working build for a diagnostic
  const CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = -1;
    for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const files = fs.readdirSync(OUT).sort()
    .filter((f) => !f.endsWith('.zip'))
    .map((f) => [f, fs.readFileSync(path.join(OUT, f))]);
  const chunks = []; const cd = []; let off = 0;
  for (const [name, data] of files) {
    const nb = Buffer.from(name, 'utf8');
    const lf = Buffer.alloc(30 + nb.length);
    lf.writeUInt32LE(0x04034b50, 0); lf.writeUInt16LE(20, 4);
    lf.writeUInt32LE(crc32(data), 14);
    lf.writeUInt32LE(data.length, 18); lf.writeUInt32LE(data.length, 22);
    lf.writeUInt16LE(nb.length, 26); nb.copy(lf, 30);
    chunks.push(lf, data);
    const ch = Buffer.alloc(46 + nb.length);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc32(data), 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42); nb.copy(ch, 46);
    cd.push(ch);
    off += lf.length + data.length;
  }
  const cdBuf = Buffer.concat(cd);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
  fs.writeFileSync(path.join(OUT, 'debug-overlay-av-probe.zip'),
    Buffer.concat([...chunks, cdBuf, eocd]));
}

console.log(`✓ ${rows.length} probes + READ-ME-FIRST.txt → dist/av-probe/`);
for (const [f, s] of rows) console.log(`    ${f.padEnd(34)} ${s} bytes`);
