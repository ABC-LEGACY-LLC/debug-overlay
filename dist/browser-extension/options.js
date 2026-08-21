// Debug Overlay self-updater — template in browser-extension-source/, emitted by build.js with the repo
// base substituted. The one place the extension WRITES: its own install
// folder, through a directory handle the user granted once. Updates only
// ever come from the pinned repo base, only when the version INCREASES, and
// only on a click — silent self-update is the store's job, and remote-code
// tricks stay refused: the browser runs what is ON DISK after the reload.
'use strict';
const BASE = 'https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/browser-extension';
// the FALLBACK list — the set this build shipped with. The live list comes
// from the repo's files.json at update time, because the set can change
// between versions (the cockpit arrived in one): an updater writing the new
// manifest by an old list leaves a folder naming files it never fetched.
const FILES = ['manifest.json', 'content.js', 'sw.js', 'options.html', 'options.js',
               'cockpit.html', 'cockpit.js', 'files.json'];
const log = (s) => { document.getElementById('log').textContent += s + '\n'; };

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

document.getElementById('pick').onclick = async () => {
  try {
    const dir = await showDirectoryPicker({ mode: 'readwrite' });
    await kvSet('dir', dir);
    log('folder granted: ' + dir.name);
  } catch (e) { log('cancelled: ' + e.message); }
};

document.getElementById('apply').onclick = async () => {
  try {
    const dir = await kvGet('dir');
    if (!dir) { log('choose the install folder first'); return; }
    if (await dir.requestPermission({ mode: 'readwrite' }) !== 'granted') {
      log('permission not granted'); return;
    }
    const mine = chrome.runtime.getManifest().version;
    const remote = await (await fetch(BASE + '/manifest.json', { cache: 'no-store' })).json();
    if (!newer(remote.version, mine)) { log('already current: v' + mine); return; }
    log('v' + mine + ' -> v' + remote.version + ' — fetching…');
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
    }
    JSON.parse(texts['manifest.json']);   // refuse a torn manifest
    for (const f of files) {
      const fh = await dir.getFileHandle(f, { create: true });
      const w = await fh.createWritable();
      await w.write(texts[f]);
      await w.close();
      log('wrote ' + f);
    }
    log('reloading extension — REFRESH your open tabs to run the new version');
    chrome.runtime.reload();
  } catch (e) { log('failed: ' + e.message); }
};
