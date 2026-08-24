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
const BASE = '__EXT_BASE__';
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
/* The page ships this warning VISIBLE. Reaching this line means the script
   loaded, so it is not true, so it goes away. Anything that stops the script
   loading leaves it on screen — which is the one case the page could not
   otherwise report, having no script to report it with. */
$('noScript').hidden = true;
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

/* PROGRESS, AND PROOF OF LIFE. Two different questions get two different
   answers: a download of N files has a real percentage, while a single
   request has none — so that one gets an indeterminate bar and a ticking
   elapsed count instead. The ticking is the point. A number that moves is
   the difference between "still working" and "wedged", and without it a
   long wait and a dead page look exactly alike — which is precisely how a
   dead page was mistaken for a slow one here. */
let tick = 0;
function progress(pct) {           // null = indeterminate, 0..100 = real
  const bar = $('bar');
  bar.hidden = false;
  bar.classList.toggle('indet', pct == null);
  if (pct != null) $('barFill').style.width = Math.round(pct) + '%';
}
function progressDone() {
  clearInterval(tick);
  $('bar').hidden = true;
  $('bar').classList.remove('indet');
  $('barFill').style.width = '0';
}
/** Run `label` with a live "…Ns" counter until something stops it. */
function ticking(label, limitMs) {
  clearInterval(tick);
  const t0 = Date.now();
  const paint = () => {
    const s = Math.round((Date.now() - t0) / 1000);
    $('statusHint').textContent =
      `${label} — ${s}s${limitMs ? ` (gives up at ${Math.round(limitMs / 1000)}s)` : ''}`;
  };
  paint();
  tick = setInterval(paint, 1000);
}

/* DISABLE WITH A REASON, NEVER IN SILENCE. Both buttons used to grey out
   with nothing saying why, while step 1 above them looked finished enough to
   ignore — so a disabled Update read as a broken Update. (Audit C3; also
   walked into for real.) Every disabled state now names the thing that would
   enable it, in the sentence right under the buttons. */
function gate() {
  const canUpdate = haveFolder && remoteVersion && newer(remoteVersion, MINE);
  $('apply').disabled = !canUpdate;
  $('repair').disabled = !haveFolder;
  const why = !haveFolder
    ? 'Both buttons need step 1 first — choose the folder this extension was loaded from.'
    : !remoteVersion
      ? 'Update needs a successful check — press Check now above. Verify & repair works regardless.'
      : !newer(remoteVersion, MINE)
        ? `Nothing to update — v${MINE} is the newest published version. Verify & repair still works.`
        : '';
  $('gateWhy').textContent = why;
  $('gateWhy').hidden = !why;
  // and the step number stops looking un-done once it is done (audit P2)
  $('step1').classList.toggle('done', haveFolder);
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

/** What the folder currently holds for one file, or null. Read-only. */
async function readOwn(dir, name) {
  try { return await (await (await dir.getFileHandle(name)).getFile()).text(); }
  catch { return null; }
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

/** A fetch that cannot hang. Without this a stalled connection leaves the
 *  page on "Checking for updates…" with no end and no explanation — which is
 *  indistinguishable, to the person watching it, from the page being dead. */
async function fetchSoon(url, ms = 15000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { cache: 'no-store', signal: ac.signal }); }
  finally { clearTimeout(timer); }
}

async function check() {
  $('check').disabled = true;
  status('', 'Checking for updates…');
  progress(null);
  ticking('asking ' + new URL(BASE).host, 15000);
  try {
    const remote = await (await fetchSoon(BASE + '/manifest.json')).json();
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
  progressDone();
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
    const remote = await (await fetchSoon(BASE + '/manifest.json')).json();
    if (!repairing && !newer(remote.version, MINE)) {
      log('already current: v' + MINE, 'good'); return;
    }
    log(repairing ? `repairing — rewriting every v${remote.version} file…`
                  : `v${MINE} → v${remote.version} — fetching…`);
    // the NEW version's own file list, so a version that adds files updates
    // whole; the baked-in list only answers if the repo predates files.json.
    // Plain names only — a list is data, never a path.
    let files = FILES;
    const fl = await fetchSoon(BASE + '/files.json');
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
    let got = 0;
    const steps = files.length * 2;   // every file is fetched, then written
    for (const f of files) {
      got++;
      status('busy', `Downloading ${got} of ${files.length} — ${f}`);
      progress((got / steps) * 100);
      ticking('fetching ' + f, 15000);
      const r = await fetchSoon(BASE + '/' + f);
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
    /* THIS FILE GOES LAST, and it does go. Both extremes were wrong.
       Writing it FIRST-among-equals and tolerating the failure destroyed it
       — a blocked or quarantined write leaves nothing, the page 404s its own
       script, and the updater is dead. Refusing to write it at all was worse
       in a way that took longer to see: a bug IN this file then becomes
       permanent, because the one thing that could ship the fix is the thing
       that is broken. That is what happened — a typo here survived two
       releases because the updater kept skipping itself.

       So: everything else lands first, the manifest commits, and only then
       is this file replaced. A failure at that point costs the updater page
       and nothing else — every other file is already updated and the version
       is already committed — and the page SAYS so, with the one-line manual
       fix. update.html ships its warning visible for exactly this case. */
    const SELF = 'update.js';
    const selfStale = texts[SELF] !== undefined &&
                      texts[SELF] !== await readOwn(dir, SELF);
    let put = 0;
    for (const f of order) {
      if (f === SELF) continue;
      put++;
      status('busy', `Writing ${put} of ${order.length - 1} — ${f}`);
      progress(((files.length + put) / steps) * 100);
      ticking('writing ' + f);
      const fh = await dir.getFileHandle(f, { create: true });
      const w = await fh.createWritable();
      await w.write(texts[f]);
      await w.close();
      log('✓ wrote ' + f, 'good');
    }
    /* …and now this file, after the commit. Verified by reading it back:
       a write that "succeeds" and is then quarantined looks identical to one
       that worked, and the difference is whether this page exists tomorrow. */
    let selfLost = null;
    if (selfStale && texts[SELF] !== undefined) {
      status('busy', `Replacing ${SELF}…`);
      ticking('writing ' + SELF);
      try {
        const fh = await dir.getFileHandle(SELF, { create: true });
        const w = await fh.createWritable();
        await w.write(texts[SELF]);
        await w.close();
        const back = await readOwn(dir, SELF);
        if (back !== texts[SELF]) throw new Error('written, but it did not read back');
        log('✓ wrote ' + SELF + ' (this page — reload it to run the new one)', 'good');
      } catch (e) {
        selfLost = e.message;
        log('⚠ could not replace ' + SELF + ' — ' + e.message, 'warn');
        log('  everything ELSE is updated and committed. Copy update.js out of the ' +
            'ZIP into your install folder to finish.', 'warn');
      }
    }
    /* Written, and NOT reloaded. This used to count down and then call
       reload the extension itself. Fetch, write, and then restart the
       program you just wrote is the complete shape of a downloader, and the
       last step is the one that buys the least: it saves a single click.
       Chrome activates the new files on the next reload either way, so the
       button that does it is one the user presses — on the page that is
       already open in front of them. */
    /* The headline states what is TRUE, not what was attempted. It used to
       lead with "every file is on disk" and then take it back in the next
       sentence — while a write had in fact been refused. A summary that
       needs its own footnote to stop being wrong is a wrong summary. */
    $('doneHead').textContent = selfLost
      ? (repairing
          ? `Repaired — every v${remote.version} file is on disk except this page.`
          : `v${remote.version} is on disk, except this page.`)
      : (repairing
          ? `Repaired — every v${remote.version} file is on disk.`
          : `v${remote.version} is on disk.`);
    if (selfLost) {
      $('doneHead').textContent +=
        ' This page could not be replaced (' + selfLost + '). Everything else is' +
        ' updated and committed — copy update.js out of the ZIP into your install' +
        ' folder to finish the job.';
    }
    $('doneCount').textContent =
      'One step left: reload the extension so Chrome reads the new files. ' +
      'Then refresh any tabs you had open.';
    $('done').classList.add('show');
    $('reloadExt').hidden = false;
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
    /* CLASSIFY BY WHAT CHROME ACTUALLY SAYS, and never by a loose word. This
       matched /blocked/ anywhere, so when a bug in this file threw
       "selfBlocked is not defined" the page announced a security block that
       had not happened — after an update that had in fact fully succeeded.
       A wrong diagnosis is worse than a raw error message: it sends someone
       to fight their antivirus over a typo. */
    const isBug = e instanceof ReferenceError || e instanceof TypeError;
    const blocked = !isBug && /Safe Browsing|security policy|not allowed|NotAllowedError/i
      .test(e.name + ' ' + e.message);
    status('bad',
      isBug ? 'This update page hit a bug in itself.'
            : blocked ? 'A security check blocked the write.' : 'That did not work.',
      isBug
        ? 'Not a security problem and not your install — the files above that say ' +
          '"wrote" did land. Please report this message: ' + e.name + ': ' + e.message
        : blocked
          ? 'Nothing is broken: the manifest is written last, so the folder still ' +
            'runs the version it had. Press Update again — and if it keeps failing, ' +
            'this machine is scanning the write; install from the ZIP instead. (' + e.message + ')'
          : e.message);
  } finally {
    progressDone();
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
/* THE RELOAD, ON A BUTTON. This used to happen by itself on a countdown,
   and was removed because fetch-write-delete-RESTART is the shape security
   software reads as a downloader. Removing it was right; leaving the user
   with "copy this address, paste it, find the row, press the icon" was not —
   that is four steps to replace one, and I was not the one making them.

   A button is the honest middle. The distinction is real rather than
   cosmetic: a downloader restarts what it installed silently and without
   consent, and nothing here happens unless someone presses this. If a
   scanner ever objects to the extension again, THIS is the first thing to
   remove — it is the only piece of that shape left. */
$('reloadExt').addEventListener('click', () => {
  $('doneCount').textContent =
    'Reloading — this page will close. Reopen it from chrome://extensions → ' +
    'Details → Extension options if you need it.';
  setTimeout(() => chrome.runtime.reload(), 400);
});
$('copyExt').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('chrome://extensions'); } catch {}
  $('copyExt').textContent = 'Copied ✓ — paste it in the address bar';
});
$('check').addEventListener('click', check);
$('apply').addEventListener('click', () => run(false));
$('repair').addEventListener('click', () => run(true));

showFolder().then(check);
