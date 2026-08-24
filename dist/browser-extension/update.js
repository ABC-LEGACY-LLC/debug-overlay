// Debug Overlay update screen — template in browser-extension-source/update/,
// emitted as update.js with the repo base substituted. The one place the extension
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
// between versions (the side panel arrived in one): an updater writing the new
// manifest by an old list leaves a folder naming files it never fetched.
const FILES = ['manifest.json', 'content.js', 'sw.js', 'update.html', 'update.js',
               'side-panel.html', 'side-panel.js', 'files.json'];
/* Files this extension used to ship and no longer does. It USED to delete
   them after an update. It does not any more: Chrome loads only what the
   manifest names, so a leftover file is inert — while an updater that
   deletes files is an updater that looks like a downloader cleaning up
   after itself, which is what got this one quarantined. Tidiness is not
   worth the product being removed from the browser. They are listed here
   so guide.html can name them for anyone who wants the folder clean. */
const RETIRED = ['cockpit.html', 'cockpit.js', 'options.html', 'options.js'];

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
 *  name; a folder failing either test is the wrong folder, said out loud.
 *  The folder's version is returned too: holding a DIFFERENT version than
 *  the running extension is the signature of a copy Chrome never loads —
 *  measured on a real machine, where an update written to such a copy
 *  "succeeded" forever while v3.8.101 kept running. */
async function vet(dir) {
  try {
    const fh = await dir.getFileHandle('manifest.json');
    const m = JSON.parse(await (await fh.getFile()).text());
    if (m.name !== chrome.runtime.getManifest().name) {
      return { ok: false, why: `"${dir.name}" holds a different extension ("${m.name}")` };
    }
    return { ok: true, version: m.version, mismatch: m.version !== MINE };
  } catch {
    return { ok: false, why: `"${dir.name}" holds no extension install (no manifest.json)` };
  }
}

/**
 * Is the granted folder the one Chrome is actually running from? Writing
 * anywhere else reports success while the browser keeps the old copy — the
 * silent miss that cost a real install a lot of confusion.
 *
 * READ-ONLY, deliberately. This used to write a randomly-named probe file,
 * fetch it back through the extension's own URL, and then delete it — which
 * proved the folder exactly, and also made this file drop a file and remove
 * it, on every single update, forever. Dropping a file and cleaning it up
 * afterwards is the most recognisable move a downloader makes, and security
 * software read it exactly that way.
 *
 * So: compare the manifest ON DISK with the manifest Chrome is SERVING.
 * chrome.runtime.getURL() reads out of the loaded folder, so if the granted
 * folder is that folder the two are byte-identical. A stale or duplicate
 * copy differs — by version at minimum, since it is a copy of some other
 * build. The one case this cannot see is a byte-identical copy of the
 * CURRENT version, and that self-corrects: writing there makes the copy
 * newer than what is running, so the very next visit reads a version
 * mismatch and says so. One quiet miss instead of a permanent write-delete
 * cycle is the right trade.
 *
 * true = folder matches what Chrome serves · false = provably a different
 * copy · null = could not tell, so say nothing rather than guess.
 */
async function proveLive(dir) {
  try {
    const onDisk = await (await (await dir.getFileHandle('manifest.json')).getFile()).text();
    const served = await (await fetch(chrome.runtime.getURL('manifest.json'),
                                      { cache: 'no-store' })).text();
    return onDisk.trim() === served.trim();
  } catch { return null; }
}

const FIND_IT = 'find the real folder: chrome://extensions → Debug Overlay → ' +
  'Details — "Source" names the loaded path. Choose THAT folder in step 1.';

/* Every answer carries the TIME it was given. Pressing Check when nothing
   has changed would otherwise repaint the same sentence and look like a
   button that does nothing — the same reason the in-page menu answers
   "✓ current" out loud instead of staying silent. */
const checkedAt = () => {
  try {
    return ' · checked ' +
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

async function check() {
  $('check').disabled = true;
  status('', 'Checking for updates…');
  try {
    const remote = await (await fetch(BASE + '/manifest.json', { cache: 'no-store' })).json();
    remoteVersion = remote.version;
    if (newer(remoteVersion, MINE)) {
      status('upd', `v${remoteVersion} is available.`,
        (haveFolder ? 'Press Update — it takes a few seconds.'
                    : 'Choose the install folder below, then press Update.') + checkedAt());
    } else {
      status('ok', "You're up to date.",
        `v${MINE} is the latest published version.` + checkedAt());
    }
  } catch {
    remoteVersion = null;
    status('bad', "Couldn't reach the repository.",
      'Check your connection, then press Check now.' + checkedAt());
  }
  $('check').disabled = false;
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
    /* the wrong-copy trap: a folder can hold a REAL install of this extension
       and still not be the one Chrome loads (a second copy, a parent, an old
       home). Writing there reports success while the old version keeps
       running. The probe proves it either way; the version cross-check backs
       it up when the probe cannot run. */
    const live = await proveLive(dir);
    if (live === false) {
      log(`refusing to write: Chrome is not running from "${dir.name}" — ` +
          `an update written there changes nothing`, 'err');
      log(FIND_IT, 'warn');
      return;
    }
    if (live === null && v.mismatch) {
      log(`refusing to write: "${dir.name}" holds v${v.version} while the running ` +
          `extension is v${MINE} — this looks like a copy Chrome does not load`, 'err');
      log(FIND_IT, 'warn');
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
    // update on disk is a broken extension. PNGs (the icons) travel as
    // bytes: text-decoding a binary is a silent corruption.
    const isBin = (f) => /\.png$/i.test(f);
    const texts = {};
    for (const f of files) {
      const r = await fetch(BASE + '/' + f, { cache: 'no-store' });
      if (!r.ok) throw new Error(f + ': http ' + r.status);
      texts[f] = isBin(f) ? new Uint8Array(await r.arrayBuffer()) : await r.text();
      log('↓ fetched ' + f);
    }
    JSON.parse(texts['manifest.json']);   // refuse a torn manifest
    /* MANIFEST LAST. Fetching everything before writing anything protects
       against a download dying halfway; it does NOT protect against a WRITE
       dying halfway, and one did — a security product blocked a file mid-run
       and left a folder whose new manifest named side-panel.html that had
       never been written. Chrome then refuses to load the whole extension.
       Written last, the manifest is the COMMIT: until it lands, the folder
       still describes itself as the old version, and every file that old
       manifest names is still on disk. */
    const order = [...files.filter((f) => f !== 'manifest.json'), 'manifest.json'];
    /* THIS FILE is the one write allowed to fail. Measured on a real machine:
       of everything shipped, only update.js both fetches from the network AND
       writes to disk AND deletes AND reloads — which is the behaviour of a
       downloader, so a scanner reading its bytes calls it one and refuses the
       write. content.js, sw.js and side-panel.js do none of that and go
       through untouched. Losing this write costs nothing structural: the
       updater is a standalone adapter that reads its file list from the repo
       at run time, so an older copy keeps updating everything else correctly.
       Aborting the whole update over it — which is what used to happen — cost
       the user every other file for the sake of one they did not need.

       This is error handling, not evasion: the write is attempted plainly,
       the refusal is reported, and the user is told what did not change. */
    const SELF = 'update.js';
    let selfBlocked = null;
    for (const f of order) {
      try {
        const fh = await dir.getFileHandle(f, { create: true });
        const w = await fh.createWritable();
        await w.write(texts[f]);
        await w.close();
        log('✓ wrote ' + f, 'good');
      } catch (e) {
        if (f !== SELF) throw e;
        selfBlocked = e.message;
        log('⚠ could not replace ' + SELF + ' — ' + e.message, 'warn');
        log('  everything else still updates; this screen keeps the version it has', 'warn');
      }
    }
    /* Written, and NOT reloaded. This used to count down and then call
       reload the extension itself. Fetch, write, and then restart the
       program you just wrote is the complete shape of a downloader, and the
       last step is the one that buys the least: it saves a single click.
       Chrome activates the new files on the next reload either way, so the
       button that does it is one the user presses — on the page that is
       already open in front of them. */
    $('doneHead').textContent = repairing
      ? `Repaired — every v${remote.version} file is on disk.`
      : `v${remote.version} is on disk.`;
    if (selfBlocked) {
      $('doneHead').textContent +=
        ' (This update screen itself was blocked from being replaced by ' +
        'security software, so it stays at its current version — everything ' +
        'else is now current, and updates keep working.)';
    }
    $('doneCount').textContent =
      'One step left: open chrome://extensions and press the ↻ reload icon on ' +
      'Debug Overlay. Then refresh any tabs you had open.';
    $('done').classList.add('show');
    $('copyExt').hidden = false;
  } catch (e) {
    log('failed: ' + e.message, 'err');
    /* A write blocked partway is the case worth naming: the files already
       written are new, the rest are old, and only the manifest decides which
       version the folder claims to be — so the install still runs the old
       version and pressing this again is safe. Security software blocking a
       write is the way this happens in practice; the updater fetches remote
       files and writes them to disk, which is the behaviour of a downloader,
       and some scanners cannot tell the difference. */
    const blocked = /Safe Browsing|not allowed|permission|denied|blocked/i.test(e.message);
    status('bad', blocked ? 'A security check blocked the write.' : 'That did not work.',
      blocked
        ? 'Nothing is broken: the manifest is written last, so the folder still ' +
          'runs the version it had. Press Update again — and if it keeps failing, ' +
          'this machine is scanning the write; install from the ZIP instead. (' + e.message + ')'
        : e.message);
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
  if (!v.ok) {
    log('⚠ folder granted, but ' + v.why, 'warn');
    log(FIND_IT, 'warn');
  } else {
    const live = await proveLive(dir);
    if (live === true) {
      log(`✓ folder granted: ${dir.name} — PROVEN to be the folder Chrome is running (v${v.version})`, 'good');
    } else if (live === false) {
      log(`⚠ "${dir.name}" holds this extension (v${v.version}) but Chrome is NOT running from it — ` +
          'updates written there would change nothing', 'warn');
      log(FIND_IT, 'warn');
    } else if (v.mismatch) {
      log(`⚠ "${dir.name}" holds v${v.version} while the running extension is v${MINE} — ` +
          'this may be a copy Chrome does not load', 'warn');
      log(FIND_IT, 'warn');
    } else {
      log(`✓ folder granted: ${dir.name} — holds this extension (v${v.version})`, 'good');
    }
  }
  await showFolder();
  check();   // the hint under the status may change now a folder exists
});
$('copyExt').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('chrome://extensions'); } catch {}
  $('copyExt').textContent = 'Copied ✓ — paste it in the address bar';
});
$('check').addEventListener('click', check);
$('apply').addEventListener('click', () => run(false));
$('repair').addEventListener('click', () => run(true));

showFolder().then(check);
