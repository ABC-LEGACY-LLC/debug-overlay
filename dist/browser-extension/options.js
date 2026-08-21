// Debug Overlay update screen — template in browser-extension-source/, emitted by
// build.js with the repo base substituted. The one place the extension
// WRITES: its own install folder, through a directory handle the user
// granted once. Updates only ever come from the pinned repo base and only
// on a click — silent self-update is the store's job, and remote-code
// tricks stay refused: the browser runs what is ON DISK after the reload.
//
// Two buttons share one write path: UPDATE requires a newer version to
// exist; REPAIR rewrites the CURRENT version's files — the answer to a
// torn folder (an interrupted update, or an old updater that wrote a new
// manifest without the files it names).
'use strict';
const BASE = 'https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/browser-extension';
// the FALLBACK list — the set this build shipped with. The live list comes
// from the repo's files.json at write time, because the set can change
// between versions (the cockpit arrived in one): an updater writing the new
// manifest by an old list leaves a folder naming files it never fetched.
const FILES = ['manifest.json', 'content.js', 'sw.js', 'options.html', 'options.js',
               'cockpit.html', 'cockpit.js', 'files.json'];

const $ = (id) => document.getElementById(id);
const MINE = chrome.runtime.getManifest().version;

// segment-wise numeric compare — mirrors app/updates.js `newer()`; this file
// is a standalone adapter outside the bundle, so the tiny copy is deliberate
const newer = (a, b) => {
  const A = String(a).split('.').map(Number);
  const B = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] || 0) - (B[i] || 0);
    if (d) return d > 0;
  }
  return false;
};

/* ---- the folder handle, kept across visits ------------------------- */
const DB = () => new Promise((res, rej) => {
  const r = indexedDB.open('debug-overlay-updater', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const kvGet = async (k) => {
  const db = await DB();
  return new Promise((res) => {
    const q = db.transaction('kv').objectStore('kv').get(k);
    q.onsuccess = () => res(q.result);
    q.onerror = () => res(null);
  });
};
const kvSet = async (k, v) => {
  const db = await DB();
  return new Promise((res) => {
    const q = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k);
    q.onsuccess = () => res();
    q.onerror = () => res();
  });
};

/* ---- screen state --------------------------------------------------- */
let remoteVersion = null;   // null = unknown (offline or still checking)
let haveFolder = false;

function log(line, cls) {
  const box = $('log');
  box.classList.add('show');
  const s = document.createElement('span');
  if (cls) s.className = cls;
  s.textContent = line + '\n';
  box.append(s);
}

function status(cls, text, hint) {
  $('status').className = 'card ' + cls;
  $('statusText').textContent = text;
  $('statusHint').textContent = hint || '';
}

function gate() {
  $('apply').disabled = !(haveFolder && remoteVersion && newer(remoteVersion, MINE));
  $('repair').disabled = !haveFolder;
}

async function showFolder() {
  const dir = await kvGet('dir');
  haveFolder = !!dir;
  const el = $('folderState');
  el.textContent = dir ? `— ${dir.name} ✓` : '— not chosen yet';
  el.classList.toggle('set', haveFolder);
  gate();
}

/** Is this folder actually where THIS extension lives? Writing anywhere else
 *  reports success while the browser keeps running the old copy — the silent
 *  miss. An install folder holds a manifest, and that manifest carries our
 *  name; a folder failing either test is the wrong folder, said out loud. */
async function vet(dir) {
  try {
    const fh = await dir.getFileHandle('manifest.json');
    const m = JSON.parse(await (await fh.getFile()).text());
    if (m.name !== chrome.runtime.getManifest().name) {
      return { ok: false, why: `"${dir.name}" holds a different extension ("${m.name}")` };
    }
    return { ok: true, version: m.version };
  } catch {
    return { ok: false, why: `"${dir.name}" holds no extension install (no manifest.json)` };
  }
}

async function check() {
  status('', 'Checking for updates…');
  try {
    const remote = await (await fetch(BASE + '/manifest.json', { cache: 'no-store' })).json();
    remoteVersion = remote.version;
    if (newer(remoteVersion, MINE)) {
      status('upd', `v${remoteVersion} is available.`,
        haveFolder ? 'Press Update — it takes a few seconds.'
                   : 'Choose the install folder below, then press Update.');
    } else {
      status('ok', "You're up to date.",
        `v${MINE} is the latest published version.`);
    }
  } catch {
    remoteVersion = null;
    status('bad', "Couldn't reach the repository.",
      'Check your connection, then reopen this page.');
  }
  gate();
}

/* ---- the one write path --------------------------------------------- */
async function run(repairing) {
  $('apply').disabled = true;
  $('repair').disabled = true;
  try {
    const dir = await kvGet('dir');
    if (!dir) { log('choose the install folder first', 'warn'); return; }
    if (await dir.requestPermission({ mode: 'readwrite' }) !== 'granted') {
      log('folder permission was not granted', 'warn'); return;
    }
    const v = await vet(dir);
    if (!v.ok) {
      log('refusing to write: ' + v.why, 'err');
      log('choose the folder this extension was loaded unpacked from (step 1) — ' +
          'for a fresh install somewhere new, use the install page instead', 'warn');
      return;
    }
    const remote = await (await fetch(BASE + '/manifest.json', { cache: 'no-store' })).json();
    if (!repairing && !newer(remote.version, MINE)) {
      log('already current: v' + MINE, 'good'); return;
    }
    log(repairing ? `repairing — rewriting every v${remote.version} file…`
                  : `v${MINE} → v${remote.version} — fetching…`);
    // the NEW version's own file list, so a version that adds files updates
    // whole; the baked-in list only answers if the repo predates files.json.
    // Plain names only — a list is data, never a path.
    let files = FILES;
    const fl = await fetch(BASE + '/files.json', { cache: 'no-store' });
    if (fl.ok) {
      files = JSON.parse(await fl.text());
      if (!Array.isArray(files) || !files.includes('manifest.json') ||
          !files.every((f) => typeof f === 'string' && /^[a-z0-9_.-]+$/i.test(f))) {
        throw new Error('files.json is not a sane file list');
      }
    }
    // fetch EVERYTHING first, write only when all of it arrived — a half
    // update on disk is a broken extension
    const texts = {};
    for (const f of files) {
      const r = await fetch(BASE + '/' + f, { cache: 'no-store' });
      if (!r.ok) throw new Error(f + ': http ' + r.status);
      texts[f] = await r.text();
      log('↓ fetched ' + f);
    }
    JSON.parse(texts['manifest.json']);   // refuse a torn manifest
    for (const f of files) {
      const fh = await dir.getFileHandle(f, { create: true });
      const w = await fh.createWritable();
      await w.write(texts[f]);
      await w.close();
      log('✓ wrote ' + f, 'good');
    }
    // the banner people must not miss, then the reload — in that order,
    // because chrome.runtime.reload() takes this page with it
    $('doneHead').textContent = repairing
      ? `Repaired — every v${remote.version} file is back in place.`
      : `Updated to v${remote.version}.`;
    $('done').classList.add('show');
    let n = 4;
    const tick = () => {
      n--;
      if (n <= 0) { chrome.runtime.reload(); return; }
      $('doneCount').textContent = `Reloading the extension in ${n}…`;
      setTimeout(tick, 1000);
    };
    tick();
  } catch (e) {
    log('failed: ' + e.message, 'err');
    status('bad', 'That did not work.', e.message);
  } finally {
    gate();
  }
}

/* ---- wire up -------------------------------------------------------- */
$('mine').textContent = 'v' + MINE;
$('pick').addEventListener('click', async () => {
  let dir;
  try {
    dir = await showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    // a closed dialog is a choice, not a failure
    if (e.name === 'AbortError') log('cancelled — the folder is unchanged', 'warn');
    else log('the folder picker could not open: ' + e.message, 'err');
    return;
  }
  await kvSet('dir', dir);
  const v = await vet(dir);
  if (v.ok) {
    log(`✓ folder granted: ${dir.name} — holds this extension (v${v.version})`, 'good');
  } else {
    log('⚠ folder granted, but ' + v.why, 'warn');
    log('if Debug Overlay was loaded unpacked from a different folder, choose that one instead', 'warn');
  }
  await showFolder();
  check();   // the hint under the status may change now a folder exists
});
$('apply').addEventListener('click', () => run(false));
$('repair').addEventListener('click', () => run(true));

showFolder().then(check);
