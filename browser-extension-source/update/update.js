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
   so a run can NAME the ones still present. It does not remove them.

   This list was dead for three releases. It was declared, commented as
   feeding a page that was never written, and read by nothing — so it stayed
   quiet while install.bat sat in every install folder, being the single most
   flagged file in the package. A constant that documents an intention is not
   the same as code that acts on one. */
const RETIRED = ['cockpit.html', 'cockpit.js', 'options.html', 'options.js',
                 'install.bat',
                 /* THE INSTALLER, which is not a retired file — it still ships
                    — but is not part of a running install either, and holding
                    on to a stale one is worse than useless. install.html
                    carries a SNAPSHOT of every runtime file inline, and the
                    updater never refreshes it because it is not in
                    files.json. So the copy in a folder is frozen at whatever
                    version was first installed, and opening it there writes
                    that snapshot back over everything — a silent downgrade of
                    the whole extension, offered by a page whose only button
                    says Install. Measured on a real folder: every file at
                    v3.8.149 and install.html still sitting at the version
                    from four hours and a dozen releases earlier. Nothing
                    loads it, nothing checks it, and its one action is
                    destructive. Named, never deleted, like everything on this
                    list. */
                 'install.html',
                 /* THE ONE-TIME MIGRATION. Every install before v3.8.151 has
                    a plain update.js, and the versioned scheme orphans it:
                    update.html now points at update-<version>.js, files.json
                    no longer lists update.js, and SELF is derived from the
                    version so it names update-<previous>.js, which such a
                    folder does not have. Nothing else would ever mention it
                    again — the single most confusing file to leave behind,
                    given it is the one this whole change is about. */
                 'update.js'];

const $ = (id) => document.getElementById(id);
/* The page ships this warning VISIBLE. Reaching this line means the script
   loaded, so it is not true, so it goes away. Anything that stops the script
   loading leaves it on screen — which is the one case the page could not
   otherwise report, having no script to report it with. */
$('noScript').hidden = true;
/* …and the same handoff in the other direction: every CONTROL ships inert
   and every CLAIM ships true, because the markup is all there is when the
   script is gone. The status used to ship reading "Checking for updates…",
   predicting what showFolder().then(check) would do — so a page with no
   script sat claiming to be busy forever, beside an Update button that
   looked live. A page reporting its own script is missing may not also be
   pretending to work. */
$('check').disabled = false;
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
  /* A NEW HEADLINE RETIRES THE OLD COUNTER. ticking() paints into the same
     hint line on a 1s interval, so a step that changed the headline without
     starting its own counter had the previous step's counter paint over its
     hint a second later. Observed as "Replacing update.js…" above
     "rehearsing update.js — 10s": two steps, one card, both claiming to be
     the current one. Whoever wants a counter starts it right after this. */
  clearInterval(tick);
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
  /* Two of the three reasons name something the reader must go and do; the
     third reports that there is nothing to do. Same sentence slot, opposite
     meanings, and they were the same colour. */
  $('gateWhy').classList.toggle('calm', haveFolder && !!remoteVersion);
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

/* THE SETTLE CHECK — the one verification that cannot be done in line.

   Every check in this file is synchronous: write, read it back, move on. A
   scanner that QUARANTINES does not work that way. The write succeeds, the
   read-back matches, and the file is removed seconds later — so this page
   reported "v3.8.137 is on disk", accurately, about a folder that no longer
   held update.js by the time anyone looked at it. The report was true when
   made and false when read, which is the hardest kind of wrong to chase.

   So after the run finishes, look again. Read-only, three times, out to a
   minute, and say nothing unless something actually went.

   It can catch its own removal, which is the case that matters most here:
   this script is already in memory, so it keeps running perfectly well
   after its file is deleted. The page can therefore watch itself disappear
   and say so, in the same visit, instead of the user finding out on the
   next visit via a banner that can only guess why.

   "Written, then taken" and "refused at write time" are different failures
   with different answers, and until now they produced the same report. */
const SETTLE_AT = [5000, 20000, 60000];

/** Is the file still there and non-empty? Read-only; false on any error. */
async function stillThere(dir, name) {
  try { return (await (await dir.getFileHandle(name)).getFile()).size > 0; }
  catch { return false; }
}

async function settle(dir, names) {
  const gone = [];
  let waited = 0;
  for (const at of SETTLE_AT) {
    await new Promise((r) => setTimeout(r, at - waited));
    waited = at;
    for (const n of names) {
      if (gone.includes(n) || await stillThere(dir, n)) continue;
      gone.push(n);
      log('· ' + n + ' was written, and is no longer on disk (' +
          Math.round(waited / 1000) + 's later)', 'err');
    }
    if (!gone.length) continue;
    const note = $('settleNote');
    note.hidden = false;
    note.textContent =
      gone.length + (gone.length === 1 ? ' file was' : ' files were') +
      ' written successfully and then removed from disk by something on this' +
      ' machine: ' + gone.join(', ') + '. The update itself worked — these were' +
      ' deleted afterwards, which is what security software does when it' +
      ' quarantines. Look in its protection history for those names; that entry' +
      ' names the exact rule, which is the one thing this page cannot see.';
  }
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
    /* NOTHING IS SPECIAL ANY MORE. What stood here was four hundred lines
       of apparatus: skip this file, write it last, rehearse it under another
       name, rename it into place, remember the refusal, re-stage what the
       refusal ate. Every line of it existed because updating the updater
       meant REPLACING the file this page is running, and Chrome refuses that
       on some machines — destructively, by every route the API offers.

       The updater is version-named now, so there is no replacement to
       refuse. This build's script is a file that did not exist a moment ago,
       and writing a new file has never once been refused: update-rehearsal.js
       landed on every run that update.js failed, same page, same folder,
       same bytes. So it goes through the ordinary loop with everything else,
       and update.html arrives in the same run already pointing at it.

       One line of housekeeping is left. The script this page is RUNNING came
       from last version's file, which after this run is nothing to anybody —
       named below as safe to delete, never removed. */
    const SELF = `update-${MINE}.js`;   // the one running now, stale after this

    let put = 0;
    for (const f of order) {
      put++;
      status('busy', `Writing ${put} of ${order.length} — ${f}`);
      progress(((files.length + put) / steps) * 100);
      ticking('writing ' + f);
      const fh = await dir.getFileHandle(f, { create: true });
      const w = await fh.createWritable();
      await w.write(texts[f]);
      await w.close();
      log('✓ wrote ' + f, 'good');
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
    $('doneHead').textContent = repairing
      ? `Repaired — every v${remote.version} file is on disk.`
      : `v${remote.version} is on disk.`;
    $('doneCount').textContent =
      'One step left: reload the extension so Chrome reads the new files. ' +
      'Then refresh any tabs you had open.';
    $('done').classList.add('show');
    $('reloadExt').hidden = false;
    $('copyExt').hidden = false;
    // not awaited: the run IS finished, and its report stands. This only ever
    // adds "…and then this happened", which is a fact about the minute after.
    /* NAMED, NOT REMOVED. Deleting other files is precisely the shape this
       project spent two releases stepping away from, and the reader deleting
       one file by hand costs them a second. Saying nothing cost more. */
    const stale = [];
    /* SELF first: the script this page is running came from last version's
       file, and the run just wrote its replacement under a new name. It is
       inert from the next reload on — nothing references it, and update.html
       now points elsewhere. Named, never removed, like everything here. */
    for (const f of [SELF, ...RETIRED])
      if (f !== `update-${remote.version}.js` && await stillThere(dir, f)) stale.push(f);
    if (stale.length) {
      log('· in the folder but not used by the extension — safe to delete:', 'warn');
      for (const f of stale) log('    ' + f, 'warn');
    }
    /* Every fetched file was written this run — there is no member of the
       list handled apart any more, and so none that might not be there. The
       exclusion that lived here existed because one file could be skipped,
       and getting it wrong meant reporting a file never written as one that
       had vanished. */
    settle(dir, order).catch(() => {});
    /* …and the card comes to rest. Nothing set it after the last step, so it
       froze mid-verb beside a done card announcing the run had finished —
       one moment, two widgets, two different answers. The card above says
       what IS, the card below says what to do next. */
    status('good', `v${remote.version} is on disk.`,
      'Reload the extension to run it.');
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
