// Debug Overlay self-updater — template in browser-extension/, emitted by build.js with the repo
// base substituted. The one place the extension WRITES: its own install
// folder, through a directory handle the user granted once. Updates only
// ever come from the pinned repo base, only when the version INCREASES, and
// only on a click — silent self-update is the store's job, and remote-code
// tricks stay refused: the browser runs what is ON DISK after the reload.
'use strict';
const BASE = '__EXT_BASE__';
const FILES = ['manifest.json', 'content.js', 'sw.js', 'options.html', 'options.js'];
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
    // fetch EVERYTHING first, write only when all of it arrived — a half
    // update on disk is a broken extension
    const texts = {};
    for (const f of FILES) {
      const r = await fetch(BASE + '/' + f, { cache: 'no-store' });
      if (!r.ok) throw new Error(f + ': http ' + r.status);
      texts[f] = await r.text();
    }
    JSON.parse(texts['manifest.json']);   // refuse a torn manifest
    for (const f of FILES) {
      const fh = await dir.getFileHandle(f, { create: true });
      const w = await fh.createWritable();
      await w.write(texts[f]);
      await w.close();
      log('wrote ' + f);
    }
    log('reloading extension…');
    chrome.runtime.reload();
  } catch (e) { log('failed: ' + e.message); }
};
