#!/usr/bin/env node
/**
 * test.js — boots the built bundle in a fake DOM.
 *
 * Not a unit-test suite: it is the smoke test that catches the failure that
 * actually happens, which is the bundle throwing on load and leaving the page
 * with no overlay at all. A userscript has no console anyone reads, so a boot
 * that dies is silent until you notice the panel never appears.
 *
 * Everything the bundle exposes is closed over by the IIFE, so the assertions
 * go through the only two things it makes observable: window.__DEBUG_OVERLAY__
 * and the DOM it appends.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'userscript.json'), 'utf8'));
const bundlePath = path.join(ROOT, 'dist', cfg.distFile);

if (!fs.existsSync(bundlePath)) {
  console.error(`✗ ${path.relative(ROOT, bundlePath)} missing — run node build.js first`);
  process.exit(1);
}
const source = fs.readFileSync(bundlePath, 'utf8');

/**
 * The tools as they exist on disk. Derived, never listed: a test that names
 * the four tools it expects fails the day a fifth lands, which trains everyone
 * to edit the expectation instead of reading it — and the next real regression
 * gets edited away with it.
 */
const { registered } = require('./hooks.js');
const TOOLS_ON_DISK = registered().map((t) => ({
  id: t.id,
  // the same test the panel groups by: either hook contributes findings
  judges: t.hooks.includes('audit') || t.hooks.includes('auditPage'),
  css: /\bcss:\s*`/.test(t.s),

}));
const idsOnDisk = TOOLS_ON_DISK.map((t) => t.id).sort();

/**
 * A crash is not a pass. This suite died mid-run for two releases and printed
 * no ✗ anywhere — just a stack trace — so anything reading the output for
 * failures found none and called it green. The summary line is the contract:
 * if the run ends without one, it ended badly.
 */
process.on('uncaughtException', (e) => {
  console.log(`\n✗ SUITE CRASHED — ${e.message}`);
  console.log(`    ${(e.stack || '').split('\n')[1] || ''}`.trimEnd());
  console.log('\n✗ the run stopped here, so nothing after this point was checked\n');
  process.exit(1);
});

/** Checks that need a painted frame. Run inside the final block, never on a
 *  timer of their own — a second timer racing the summary decides the exit
 *  code by luck. */
const pendingChecks = [];

let failed = 0;
function ok(name, cond, detail) {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

/** A page with enough of a layout for the overlay to have something to read. */
function makeDom() {
  const vc = new VirtualConsole();       // swallow page noise, keep real throws
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <div id="a" style="width:100px;height:40px;padding:8px">alpha</div>
       <div id="b" style="width:60px;height:20px;margin:12px">beta</div>
       <p id="c" style="color:#bbb">faint text nobody can read</p>
       <div style="background:oklch(0.275 0 0)">
         <p id="d" style="color:oklch(0.985 0 0)">near-white on dark, ~10.9:1</p>
       </div>
       <div style="background:rgb(20,20,20)">
         <p id="e" style="background:rgb(240,240,240);color:rgb(200,200,200)">a chip on a dark page</p>
       </div>
       <p id="f" style="background-image:linear-gradient(red,blue);color:#777">on a gradient</p>
       <p id="h" style="display:none;color:#bbb">unreadable, and nobody can see it</p>
     </body></html>`,
    { url: 'https://example.test/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc },
  );
  return dom;
}

console.log('\nBOOT');
const dom = makeDom();
const { window } = dom;

let bootError = null;
try {
  window.eval(source);
} catch (e) {
  bootError = e;
}
ok('bundle evaluates without throwing', !bootError, bootError && bootError.stack.split('\n')[0]);
if (bootError) { console.log(''); process.exit(1); }

ok('single-instance flag set', window.__DEBUG_OVERLAY__ === true);

const root = window.document.getElementById('__debug-overlay-root');
const bar0 = window.document.getElementById('__debug-overlay-bar');
ok('root element appended', !!root);
/* This asserted aria-hidden="true" on the root, which was the DEFECT: the root
   holds 13 tabbable buttons, so it told assistive tech the subtree did not
   exist while keyboard focus could still land in it (axe aria-hidden-focus,
   WCAG 4.1.2). The right invariants are that the root is named, the decorative
   layer is hidden, and the whole thing is inert while powered off. */
ok('the root is named, not hidden',
  root && root.getAttribute('aria-hidden') === null &&
  root.getAttribute('aria-label') === 'Debug overlay',
  `aria-hidden=${root && root.getAttribute('aria-hidden')}`);
ok('the decorative layer is hidden from a11y',
  !!root && [...root.children].some((c) =>
    c.tagName === 'DIV' && c.getAttribute('aria-hidden') === 'true'),
  'the painted layer carries no text anyone needs announced');
/* NEVER inert. jsdom sets the attribute without implementing its semantics, so
   this can only assert the attribute is absent — but in a real browser inert
   disables the whole subtree, and that includes ⏻ and the grip. v3.8.48 shipped
   with it and the panel could not be switched back on by mouse at all. What
   inert was meant to achieve is already true: everything that should be
   unreachable when off is `display: none`. */
ok('the overlay is never made inert', root && !root.hasAttribute('inert'),
  'inert would take the power button and the drag grip with it');

/* LAYOUT AUDIT (ux-audit-composition-layout v1.1.0, 2026-08-24).
   S3 — the shape declares the role. Every control in the bar was one 34px
   circle, so nothing but a 1px hairline separated an input from a detector
   from a DESTRUCTIVE action. Three silhouettes now, same box, and the class
   comes from the derived Select role — no tool id anywhere, so a lasso
   shipped tomorrow is shaped correctly without this file learning its name. */
{
  const barCss = [...window.document.querySelectorAll('#__debug-overlay-root style')]
    .map((s) => s.textContent).join('\n');
  const radius = (sel) => {
    const i = barCss.indexOf(sel);
    if (i < 0) return null;
    const m = barCss.slice(i).match(/border-radius:\s*([^;]+);/);
    return m && m[1].trim();
  };
  const detector = radius('button.debug-overlay-tool, #__debug-overlay-bar button.debug-overlay-act');
  const input = radius('button.debug-overlay-tool.debug-overlay-input');
  const action = radius('#__debug-overlay-bar button.debug-overlay-act {');
  ok('inputs, detectors and actions do not share one silhouette',
    !!detector && !!input && !!action && new Set([detector, input, action]).size === 3,
    `detector=${detector} input=${input} action=${action}`);
  ok('and the input shape comes from the ROLE, never from a tool id',
    /rolesOf\(t\)\.includes\("Select"\)|rolesOf\(t\)\.includes\('Select'\)/.test(source),
    'a lasso shipped tomorrow must get the right shape without being named here');
  /* S5 — 24px is a FLOOR, not a target. The grip was 22x12 while being the
     control that positions the whole overlay. Ink size and target size are
     separate: this sweeps every fixed box the bar declares. */
  const tooSmall = [...barCss.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, sel]) => /#__debug-overlay-bar/.test(sel))
    // interactive only: a button, or the grip that drags the whole bar.
    // svg/::after/hr are ink and dividers — the floor is about hit areas.
    .filter(([, sel]) => /button|debug-overlay-grip/.test(sel) &&
                         !/svg|::after|::before|\bhr\b/.test(sel))
    .map(([, sel, body]) => [sel, body.match(/width:\s*(\d+)px/),
                             body.match(/height:\s*(\d+)px/)])
    .filter(([, w, h]) => (w && Number(w[1]) < 24) || (h && Number(h[1]) < 24))
    .map(([sel, w, h]) => `${sel.trim().slice(-28)} ${w && w[1]}x${h && h[1]}`);
  ok('nothing interactive in the bar sits below the 24px floor',
    tooSmall.length === 0, `below floor: ${tooSmall.join(', ')}`);
}
/* THE RENAME'S ONE SILENT DANGER. During an update an OLD instance can be
   live in the page while a new build injects into a fresh sandbox: the
   window flag is gone but the old root is still in the DOM. A guard that
   only knew the new id would miss it and build a SECOND panel, fighting the
   first for the hotkey. Both spellings are checked; this proves it. */
{
  const legacyDom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://legacy.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const lw = legacyDom.window;
  const ghost = lw.document.createElement('div');
  ghost.id = '__dbgov-root';                    // what a pre-rename build built
  lw.document.body.append(ghost);
  lw.eval(source);
  ok('a pre-rename overlay already in the page still blocks a second one',
    !lw.document.getElementById('__debug-overlay-root'),
    'two overlays would fight over one hotkey, silently');
  legacyDom.window.close();
}
const shownOff = () => [...(bar0 ? bar0.querySelectorAll('button') : [])]
  .filter((b) => window.getComputedStyle(b).display !== 'none');
ok('and powered off, only the power control is reachable',
  shownOff().length === 1 && shownOff()[0].classList.contains('debug-overlay-pwr'),
  shownOff().map((b) => b.className).join(', ') || 'nothing reachable at all');

const sheets = root ? [...root.querySelectorAll('style')] : [];
const cssOf = (who) => (sheets.find((s) => (s.dataset.tool || 'core') === who) || {}).textContent || '';
ok('stylesheet injected', sheets.length > 0 && sheets[0].textContent.length > 0);
// One sheet per tool is the containment: a parser that gives up takes the
// rest of ITS sheet with it and nothing else.
ok('each tool ships its own sheet',
  ['measure', 'contrast', 'dupid'].every((id) => cssOf(id).length > 0),
  sheets.map((s) => s.dataset.tool || 'core').join(', '));
ok('tool CSS reached its sheet', cssOf('measure').includes('.debug-overlay-line'),
  'measure tool css missing');
// grid's lens and perf's pulse both emit <span class="debug-overlay-warn">, so the
// rule that colours it is CORE — a class two tools emit lives in neither
ok('the shared warn ink is core\'s', cssOf('core').includes('.debug-overlay-badge .debug-overlay-warn'),
  'the warn rule left the core sheet');

console.log('\nHOST CSS CANNOT REACH IN');
/**
 * The overlay injects a <style> into the PAGE, so our elements and the host's
 * rules share one cascade: every bare class we emit is a class the host can
 * style. Measured, not theorised — a Tailwind page's own `.fixed{position:
 * fixed}` matched the badge flyout's always-on chip, lifted it out of flow onto
 * its neighbour's slot and, being positioned, won the hit test, so the "Issue"
 * facet could not be switched off with the mouse at all. Bootstrap's `.row`
 * and Bulma's `.tag` reached the popover the same way.
 *
 * Specificity is NOT the defence — an unopposed declaration wins at any
 * specificity. Only a name nobody else uses is. So: every class we emit and
 * every class we style carries the debug-overlay- namespace, and the last check is
 * differential — same bundle, same script, one clean host and one that defines
 * every name we ever used bare, then diff the computed styles.
 */
{
  const BARE = ['fixed', 'static', 'absolute', 'relative', 'hidden', 'block', 'flex', 'grid',
    'row', 'col', 'tag', 'note', 'head', 'open', 'active', 'card', 'sub', 'warn', 'ok', 'bad',
    'empty', 'inert', 'tool', 'act', 'link', 'pair', 'target', 'flash', 'on', 'lbl', 'det', 'rm',
    'sep', 'grip', 'pwr', 'st', 'cnt', 'opt', 'num', 'unit', 'tick', 'sz', 'fnt', 'rad', 'sp',
    'dup', 'unk', 'error', 'info', 'review', 'up', 'down', 'left', 'right', 'v', 'vert', 'axis',
    'checks', 'armed', 'swept', 'viewhead', 'waiting', 'bctl', 'fam', 'flyout', 'subfly',
    'whenOn', 'box', 'badge', 'line', 'cap', 'arrow', 'dist', 'ext', 'leader', 'pinbox', 'flag'];
  const HOSTILE = BARE.map((c) =>
    `.${c}{position:fixed!important;display:none!important;margin:-15px!important;` +
    `font-size:99px!important;float:left!important;opacity:.01!important}`).join('\n') +
    /* THE OTHER AXIS, and the one that actually reached us. A namespace only
       defends class selectors; these match our elements whatever we call them,
       and every one is real: Bootstrap 5 Reboot's hr and Tailwind Preflight's
       svg verbatim, the standard visually-hidden-checkbox pattern, and an
       inherited property on <html>, which the root is a child of. No
       !important here — none of those frameworks use it, and nothing could
       defend against a host that did. */
    `
    html{letter-spacing:4px;text-transform:uppercase;line-height:3;font-style:italic}
    hr{margin:1rem 0;color:inherit;border:0;border-top:1px solid;opacity:.25}
    img,svg,video,canvas{display:block;vertical-align:middle}
    input[type="checkbox"]{position:absolute;opacity:0;width:1px;height:1px;margin:-1px}
    select{width:100%;appearance:none;padding:12px;text-transform:uppercase}
    button{text-transform:uppercase;letter-spacing:2px;margin:4px}
    div,span{float:left}`;
  const PAGE = '<div id="ha" style="padding:7px">alpha</div><div id="hb">beta</div>';
  // this section runs before WIRING defines `hot`
  const HOTKEY = cfg.hotkey || { altKey: true, shiftKey: true, ctrlKey: false, code: 'KeyD' };

  const drive = (hostCss) => {
    const d = new JSDOM(
      `<!doctype html><html><head><style>${hostCss}</style></head><body>${PAGE}</body></html>`,
      { url: 'https://probe.test/', pretendToBeVisual: true,
        runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    const w = d.window;
    w.eval(source);
    w.dispatchEvent(new w.KeyboardEvent('keydown', { ...HOTKEY, bubbles: true }));
    const b = w.document.getElementById('__debug-overlay-bar');
    const el = w.document.getElementById('ha');
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
    b.querySelector('[data-sweep]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    b.querySelector('[data-settings]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    b.querySelector('[data-badge] button').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return w;
  };

  const wClean = drive('');
  // every class we STYLE is namespaced
  const css = [...wClean.document.querySelectorAll('#__debug-overlay-root style')]
    .map((s) => s.textContent).join('\n');
  const styled = [...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
  const badSel = [...new Set(styled)].filter((c) => !c.startsWith('debug-overlay-'));
  ok('every class the overlay styles is namespaced', badSel.length === 0, badSel.join(' '));
  // every class we EMIT is namespaced
  const live = new Set();
  wClean.document.getElementById('__debug-overlay-root').querySelectorAll('*')
    .forEach((n) => n.classList.forEach((c) => live.add(c)));
  const badTok = [...live].filter((c) => !c.startsWith('debug-overlay-'));
  ok('every class the overlay emits is namespaced', badTok.length === 0, badTok.join(' '));
  ok('and the census actually saw the overlay', live.size > 20, `${live.size} classes seen`);

  // the differential proof: a hostile host may change nothing at all
  const wDirty = drive(HOSTILE);
  const PROPS = ['position', 'display', 'marginLeft', 'fontSize', 'float', 'opacity',
                 'flexWrap', 'fontStyle', 'textTransform'];
  const census = (w) => {
    const out = new Map();
    const walk = (n, path) => {
      const key = `${path}>${n.tagName.toLowerCase()}.${String(n.className)}`;
      const cs = w.getComputedStyle(n);
      out.set(key, PROPS.map((p) => `${p}:${cs[p]}`).join(' '));
      [...n.children].forEach((c, i) => walk(c, `${key}[${i}]`));
    };
    walk(w.document.getElementById('__debug-overlay-root'), '');
    return out;
  };
  pendingChecks.push(() => {
    const clean = census(wClean), dirty = census(wDirty);
    const diffs = [];
    for (const [k, v] of clean) {
      const d = dirty.get(k);
      if (d === undefined) diffs.push(`missing: ${k}`);
      else if (d !== v) diffs.push(`${k.split('>').pop()} → ${d}`);
    }
    ok('a hostile host stylesheet changes nothing in the overlay',
      diffs.length === 0 && clean.size > 50,
      diffs.slice(0, 3).join(' | ') || `only ${clean.size} elements compared`);
    wClean.close(); wDirty.close();
  });
}

console.log('\nTHE PROTOCOL');
/**
 * core/protocol.js is the bar's callback contract made transportable — the
 * vocabulary the side panel and the content script must agree on. It is pure
 * ESM shared by both bundles, so the suite exercises it directly in a module
 * subprocess: packing must strip everything structured clone would choke on,
 * and read() must ignore every message that is not ours.
 */
{
  const out = cp.execSync('node --input-type=module -e "' + `
    import { Protocol, packRow, PROTOCOL_VERSION } from './src/core/protocol.js';
    const el = { fake: 'dom' };
    const row = { tag: '#1', label: 'alpha', detail: '12x4', accent: 'warn',
                  activatable: true, removable: true, el,
                  pins: [{ el, id: 1 }, { el, id: 2 }],
                  tool: { id: 'x' }, opt: { key: 'k' },
                  onChange: () => {}, control: { kind: 'toggle', on: true } };
    const m = Protocol.state('rows', 'pins', [row], 'empty text');
    const r = Protocol.read(JSON.parse(JSON.stringify(m)));
    const packed = r.args[1][0];
    const results = {
      roundtrips: r.kind === 'state' && r.name === 'rows' && r.args[0] === 'pins',
      stripped: !('el' in packed) && !('pins' in packed) && !('tool' in packed) &&
                !('opt' in packed) && !('onChange' in packed),
      kept: packed.tag === '#1' && packed.label === 'alpha' &&
            packed.control.kind === 'toggle' && packed.pinCount === 2 &&
            packed.activatable === true,
      cmdOk: Protocol.read(Protocol.cmd('rowActivate', 'pins', 3)) !== null,
      foreignIgnored: Protocol.read({ type: 'debug-overlay-fetch', url: 'x' }) === null &&
                      Protocol.read(null) === null && Protocol.read({}) === null,
      unknownThrows: (() => { try { Protocol.cmd('nope'); return false; }
                              catch { return true; } })(),
      staleDetected: Protocol.stale({ debugOverlay: PROTOCOL_VERSION + 1 }) &&
                     !Protocol.stale({ debugOverlay: PROTOCOL_VERSION }) &&
                     !Protocol.stale({ type: 'other' }),
      legacyFieldDetected: Protocol.stale({ dbgov: PROTOCOL_VERSION }) &&
                           Protocol.read({ dbgov: PROTOCOL_VERSION, kind: 'state',
                                           name: 'on', args: [true] }) === null,
    };
    console.log(JSON.stringify(results));
  `.replace(/"/g, '\\"') + '"', { cwd: __dirname }).toString();
  const r = JSON.parse(out.trim());
  ok('a message survives the wire (JSON roundtrip) intact', r.roundtrips, out.trim());
  ok('packing strips what structured clone would choke on', r.stripped, out.trim());
  ok('and keeps everything a renderer needs — pins as a count', r.kept, out.trim());
  ok('commands read back; foreign messages are ignored, never thrown on',
    r.cmdOk && r.foreignIgnored, out.trim());
  ok('an unknown name throws at BUILD time, not on the wire', r.unknownThrows, out.trim());
  ok('a version mismatch is DETECTED, for a "refresh this page" answer',
    r.staleDetected, out.trim());
  /* the rename crosses the wire too: a pre-rename peer speaks the old
     envelope field. It must be REFUSED as a message and RECOGNISED as
     stale — otherwise the two sides ignore each other in silence and the
     side panel just says "waiting" forever with no reason given. */
  ok('a pre-rename peer is refused as a message, but named as stale',
    r.legacyFieldDetected, out.trim());
}

console.log('\nTWO GATES, ONE CORE');
/**
 * The userscript and the unpacked extension are two wrappers around ONE
 * bundle — byte-identical inside, which is what makes drift impossible.
 * These assertions are the lock on that claim.
 */
{
  const extDir = path.join(__dirname, 'dist', 'browser-extension');
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  const content = fs.readFileSync(path.join(extDir, 'content.js'), 'utf8');
  const cfgNow = JSON.parse(fs.readFileSync(path.join(__dirname, 'userscript.json'), 'utf8'));
  ok('the extension manifest carries the shipped version',
    manifest.version === cfgNow.version, `${manifest.version} vs ${cfgNow.version}`);
  // strip each gate's wrapper commentary; the IIFE bodies must be identical
  const body = (s) => s.slice(s.indexOf('(function () {'));
  ok('the two gates carry the SAME bundle, byte for byte',
    body(content) === body(source),
    'the extension content script drifted from the userscript');
  ok("the worker's fetch door is pinned to the repo host",
    (manifest.host_permissions || []).length === 1 &&
    /raw\.githubusercontent\.com/.test(manifest.host_permissions[0]),
    JSON.stringify(manifest.host_permissions));
  // the self-updater: emitted, syntax-checked by the build, and PINNED —
  // its runtime is browser-only (FS Access API), so what a suite can hold
  // is the contract: where it may fetch from, and what it may write
  /* Derived, never spelled. The updater is version-named now — that is the
     whole mechanism by which it can be delivered at all — so a test that
     opens 'update.js' is asserting the design that was removed. It also
     catches the failure this rename could most easily cause: exactly one
     such file must exist, and update.html must point at that one. */
  const updName = (fs.existsSync(path.join(extDir, 'updater'))
    ? fs.readdirSync(path.join(extDir, 'updater')).map((f) => 'updater/' + f) : [])
    .filter((f) => /\.js$/.test(f));
  const updJs = fs.readFileSync(path.join(extDir, ...updName[0].split('/')), 'utf8');
  const updHtml = fs.readFileSync(path.join(extDir, 'update.html'), 'utf8');
  // the shared token/primitive sheet — build.js INLINES it into each page, so
  // the source is what to assert against; there is no shipped file to read
  const sharedCss = fs.readFileSync(
    path.join(__dirname, 'browser-extension-source', 'shared.css'), 'utf8');
  ok('the updater exists and its base is the pinned repo, nowhere else',
    manifest.options_ui?.page === 'update.html' &&
    /const BASE = 'https:\/\/raw\.githubusercontent\.com\/[^']*\/browser-extension'/.test(updJs),
    (updJs.match(/const BASE = '[^']*'/) || ['no BASE'])[0]);
  ok('and it writes exactly the files the gate ships',
    ['manifest.json', 'content.js', 'sw.js', 'update.html',
     'side-panel.html', 'side-panel.js']
      .every((f) => fs.existsSync(path.join(extDir, f))),
    'the FILES list and the emitted files disagree');
  /* THE VERSIONED UPDATER, and the three ways this rename could break.

     Replacing a file called update.js is refused outright by Chrome on at
     least one real install, and every route the API offers destroys it in
     the process — so the updater is version-named and nothing replaces it.
     That buys an automatic self-update and costs one new invariant: EXACTLY
     one such file must exist, update.html must point at that one, and
     files.json must list it. Get any of the three wrong and the page 404s
     its own script — the identical dead-page symptom the whole apparatus
     was built to survive, arriving instead through a typo. */
  /* THE FILE LIST IS UNTRUSTED DATA. files.json comes off the network and
     decides every path this page writes to, so it was checked against
     /^[a-z0-9_.-]+$/ — plain names, no slash, nothing that could climb out
     of the folder the user picked.

     Moving the updater into updater/ made that guard reject the extension's
     own list, and the update stopped before it started. The property that
     mattered was never "no slashes"; it was "cannot escape". So: at most one
     folder, no leading slash, and a filename that must begin with a word
     character, which is what keeps `..` and dotfiles out.

     Run, not read. A regex asserted by matching the source proves it was
     typed, not that it holds — and every character this accepts is a
     character an attacker's files.json may contain. */
  {
    const m = updJs.match(/const SAFE = (\/.*\/i);/);
    ok('the file-list guard is still there', !!m, 'no SAFE pattern in the updater');
    if (m) {
      const SAFE = eval(m[1]);
      const allow = ['manifest.json', 'content.js', 'files.json', 'updater/abc123def.js'];
      const deny = ['../../etc/passwd', '/etc/passwd', 'a/b/c.js', '..', '.hidden',
                    'updater/../../x.js', 'C:\\windows\\x.js', 'updater/', './x.js', ''];
      ok('and it passes every path the extension actually ships',
        allow.every((s) => SAFE.test(s)),
        'wrongly refused: ' + allow.filter((s) => !SAFE.test(s)).join(', '));
      ok('and cannot be talked out of the folder the user chose',
        deny.every((s) => !SAFE.test(s)),
        'wrongly allowed: ' + deny.filter((s) => SAFE.test(s)).join(', '));
    }
  }
  /* EVERY CONTROL MUST BE WIRED. The probe's card outlived its function by
     eight releases: the diagnostic was removed when the design it was meant
     to choose between got settled, and its <button> stayed on the page —
     visible in every screenshot since, inviting a press that did nothing.

     This project already refuses to ship a tool whose button does nothing,
     because a control that is correct, present and inert is
     indistinguishable from a broken one. The same rule was never applied to
     the extension's own pages, and that is exactly where it broke. Asked of
     the built page against the built script, so deleting either half fails
     it. */
  {
    const ids = [...updHtml.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1]);
    const dead = ids.filter((i) => !updJs.includes(`$('${i}').addEventListener`));
    ok('every button on the update page has something listening',
      ids.length > 0 && dead.length === 0,
      dead.length ? 'nothing listens to: ' + dead.join(', ') : 'no buttons found at all');
  }
  ok('exactly one versioned updater is emitted',
    updName.length === 1, updName.join(', ') || 'none');
  ok('and the page loads that exact file',
    updHtml.includes(`src="${updName[0]}"`),
    (updHtml.match(/<script src="[^"]*"/) || ['no script tag'])[0]);
  /* THE BOOTSTRAP RULE, and it cost a release to learn.

     files.json is consumed by the updater ALREADY INSTALLED, never by the
     one being shipped alongside it. So relaxing the list's validator and
     USING the relaxation in the same release deadlocks every install that
     exists: it refuses the list, stops before its first fetch, and the fix
     for its validator is inside the file it just refused to fetch. Observed
     exactly that way — "failed: files.json is not a sane file list", twice,
     on a machine whose only route to the fix was the thing that failed.

     The list must therefore satisfy the STRICTEST validator any shipped
     install might still be running, which is the original plain-name one.
     Ship the reader first; use the format a release later. The path-walking
     and the folder-tolerant validator are already out there doing nothing,
     which is what makes that later release a one-line change. */
  /* THE BOOTSTRAP RULE, and the floor it is measured against.

     files.json is consumed by the updater ALREADY INSTALLED, never by the
     one shipping beside it. v3.8.155 relaxed the validator and used the
     relaxation in the same release, so every install refused the list and
     stopped before its first fetch — with the fix inside the file it had
     just refused. Observed exactly that way, twice, on the one machine
     whose only route to the remedy was the thing that failed.

     v3.8.157 shipped the reader and used none of it. This is the release
     that uses it, so the floor moves to 3.8.157 — deliberately, and it is
     a real cliff: an older install cannot be updated past this point, only
     reinstalled from the ZIP. Nothing shipped now can soften the message it
     prints, because that message comes from code already on its disk.

     What the guard enforces is the discipline, not a fixed pattern: this
     expression must be the validator of the OLDEST install still supported,
     and it may only be loosened one release after that loosening ships
     unused. */
  ok('files.json is readable by every install this build still supports',
    JSON.parse(fs.readFileSync(path.join(extDir, 'files.json'), 'utf8'))
      .every((f) => /^(?:[a-z0-9_-]+\/)?[a-z0-9_-][a-z0-9_.-]*$/i.test(f)),
    'a format only the version shipping it can read cannot be delivered');
  ok('and files.json names it, so an installed copy can fetch it',
    (() => { const s = JSON.parse(fs.readFileSync(path.join(extDir, 'files.json'), 'utf8'));
             return s.includes(updName[0]) && !s.includes('update.js'); })(),
    fs.readFileSync(path.join(extDir, 'files.json'), 'utf8'));
  /* …and nothing is skipped any more. The loop used to pass over SELF and
     hand it to four hundred lines of special handling; the count it printed
     said "of N-1" to match. Both are gone, so a run writing everything it
     fetched is the assertion. */
  ok('the write loop skips nothing — every fetched file is written',
    !/if \(f === SELF\) continue;/.test(updJs) &&
    /Writing \$\{put\} of \$\{order\.length\}/.test(updJs),
    'a file handled apart is a file that can go missing without a line about it');
  /* the file SET travels with the version: the updater asks the SERVER what
     to write (files.json), because a baked-in list answers for the build
     that shipped it — the v3.8.98 five-name list would have written the
     side panel's manifest while never fetching the side panel */
  const shipped = JSON.parse(fs.readFileSync(path.join(extDir, 'files.json'), 'utf8'));
  /* a rename leaves the old names dead in the install folder; the updater
     clears a NAMED list rather than deleting by exclusion — the folder is
     one the user picked, and delete-what-I-do-not-recognise is one bad pick
     away from deleting their documents */
  /* THE MANIFEST IS THE COMMIT. Fetch-all-then-write survives a dead
     download; it does not survive a dead WRITE, and one happened — a
     security product blocked a file mid-run and left a folder whose new
     manifest named a side panel that had never been written, which Chrome
     refuses to load at all. Written last, the manifest decides which
     version the folder claims to be, so a blocked write leaves the old
     version whole and every file it names still on disk. */
  /* ONE file may fail to write without taking the update with it. Measured
     live: of everything shipped, only update.js fetches AND writes to disk
     AND deletes AND reloads — the behaviour of a downloader — so a scanner
     reading its bytes refuses that write while every other file goes through.
     It is also the one file nothing structural depends on: the updater reads
     its file list from the repo at run time, so an older copy still updates
     everything else correctly. */
  /* …and when it cannot, the instruction is one rename, not a download. The
     staged file is already on disk with the right contents — telling someone
     to go and fetch a ZIP for bytes sitting in the folder they are looking
     at is work invented by the page. */
  /* Chrome's own dangerous-file-type modal is part of this path, and an
     unexplained modal mid-update is something a careful person declines —
     which IS the failure. Announced before it can appear, and the failure
     message names both answers, because they arrive as the same string. */
  /* warn means "asks for a decision". Two of gate()'s three reasons name
     something the reader must go and do; the third says there is nothing to
     do, and it wore the same attention colour as the two that were blocking
     something. A palette where the good state and the blocked state look
     alike has stopped carrying information. */
  ok('being up to date is not painted as a warning',
    /#gateWhy\.calm \{ color: var\(--debug-overlay-muted\)/.test(updHtml) &&
    /classList\.toggle\('calm', haveFolder && !!remoteVersion\)/.test(updJs),
    'the happy path and the blocked path were the same colour');
  /* …and the fail-visible banner must offer the file already sitting beside
     it. It sent the reader to download a ZIP for bytes the failed run had
     just written into the same folder. */
  ok('the dead-page banner leads with the rename, not a download',
    updHtml.indexOf('rename\n      it to <code>update.js</code>') <
    updHtml.indexOf('debug-overlay-extension.zip') ||
    /update-rehearsal\.js<\/code> is in that folder/.test(updHtml),
    'the staged file was in the folder the whole time');

  /* the page must be able to report its own script being gone — the state it
     was in when this was found, where every button rendered and none worked */
  /* NOTHING MAY HANG WITHOUT SAYING SO. "Checking for updates…" with no
     timeout looks identical to a dead page, which is how a real user spent
     minutes staring at one. Every network call is bounded, and the multi-file
     download counts itself so the wait is legibly progress and not a stall. */
  ok('every fetch is bounded — a stall ends in a message, not a spinner',
    /AbortController/.test(updJs) && /signal: ac\.signal/.test(updJs) &&
    !/await fetch\(BASE/.test(updJs),
    'an unbounded fetch is indistinguishable from a dead page');
  ok('and a multi-file download reports which file it is on',
    /Downloading \$\{got\} of \$\{files\.length\}/.test(updJs) &&
    /Writing \$\{put\} of/.test(updJs),
    'a long silent wait reads as broken');
  /* PROOF OF LIFE, not just progress. A single request has no percentage to
     show, so it gets an indeterminate bar and a ticking elapsed count — a
     number that MOVES is what separates "still working" from "wedged". A
     dead page was mistaken for a slow one here precisely because nothing on
     screen was changing. */
  ok('a long wait shows a live elapsed count, so stuck looks different from slow',
    /setInterval\(paint, 1000\)/.test(updJs) &&
    /gives up at \$\{Math\.round\(limitMs \/ 1000\)\}s/.test(updJs),
    'without a moving number, waiting and wedged are the same picture');
  ok('and the multi-file run drives a REAL percentage bar',
    /const steps = files\.length \* 2;/.test(updJs) &&
    /progress\(\(\(files\.length \+ put\) \/ steps\) \* 100\)/.test(updJs),
    'a bar that is not tied to the work is decoration');
  /* the ids this page uses must be unique — the fail-visible banner reused
     statusText/statusHint, getElementById returned the HIDDEN one, and every
     status update went into an invisible element while the visible card kept
     its initial "Checking for updates…" forever. The overlay ships a tool
     that finds exactly this; the page it ships in did not have it run on it. */
  {
    const ids = [...updHtml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
    ok('the update page has no duplicate ids',
      dupes.length === 0,
      `duplicated: ${[...new Set(dupes)].join(', ')} — getElementById returns the first, silently`);
  }
  ok('the page warns FAIL-VISIBLE when its script never loads',
    /id="noScript"/.test(updHtml) &&
    /updater\/[^<]*\.js<\/code> is missing/.test(updHtml) &&
    /\$\('noScript'\)\.hidden = true;/.test(updJs),
    'a dead page that looks alive is the worst version of broken');
  /* THE OTHER HALF OF FAIL-VISIBLE, and the half that was missing: warning
     is not enough while the rest of the page goes on performing. Shipped
     markup is the ENTIRE product when the script is gone, so every claim in
     it must be true unaided and every control inert. It shipped saying
     "Checking for updates…" — a prediction about showFolder().then(check) —
     so a scripted-out page sat claiming to be busy forever, with Check now
     live to press. Both are assertions about the HTML alone; neither can be
     satisfied by anything update.js does.

     It is the PROGRESSIVE form that is banned, not the word: "Not checked
     yet." is a true resting state and contains "checked". A first cut read
     /Check/i and failed on the fix itself — the tense is where the lie
     lives, because only "…ing" asserts something is happening right now. */
  ok('the page makes no claim its own markup cannot keep',
    !/id="statusText">[^<]*Checking/i.test(updHtml) &&
    /status\('', 'Checking for updates…'\)/.test(updJs),
    'the static status predicted the script; with no script the prediction never expires');
  ok('every control ships inert and the script is what arms them',
    /id="check"[^>]*\sdisabled/.test(updHtml) &&
    /id="apply"[^>]*\sdisabled/.test(updHtml) &&
    /id="repair"[^>]*\sdisabled/.test(updHtml) &&
    /\$\('check'\)\.disabled = false;/.test(updJs),
    'a button that cannot act must not look like one that can');
  /* …and "cannot act" has to SURVIVE the accent. opacity:.45 was the whole
     disabled treatment, and the accent means armed — so the dead Update
     button on that quarantined page was still the greenest thing on screen.
     Proven by removing the rule: the assertion fails. */
  ok('a disabled primary stops wearing the accent, not merely dims it',
    /button\.primary\[disabled\][^{]*\{[^}]*background:\s*var\(--debug-overlay-raised\)/.test(sharedCss),
    'dimming an affordance is not withdrawing it');
  ok('and update.js is the ONLY shipped file with the downloader shape',
    ['content.js', 'sw.js', 'side-panel.js'].every((f) => {
      const s = fs.readFileSync(path.join(extDir, f), 'utf8');
      return !/createWritable|getFileHandle|removeEntry|runtime\.reload/.test(s);
    }),
    'another file grew the same shape and will start being blocked too');
  ok('the manifest is written LAST — it is the commit, not the first step',
    /const order = \[\.\.\.files\.filter\(\(f\) => f !== 'manifest\.json'\), 'manifest\.json'\]/.test(updJs) &&
    updJs.includes('for (const f of order)'),
    'a blocked write would leave a manifest naming files that do not exist');
  ok('and a blocked write says so, and says it is safe to retry',
    /Safe Browsing\|security policy/.test(updJs) &&
    updJs.includes('A security check blocked the write.'),
    'the commonest real failure would read as an unexplained crash');
  /* …but ONLY a real one. The classifier matched /blocked/ anywhere, so a
     bug in this file throwing "selfBlocked is not defined" announced a
     security block that never happened — after an update that had actually
     succeeded. A wrong diagnosis sends someone to fight their antivirus over
     a typo, which is worse than showing the raw error. */
  ok('and a bug in the page is called a bug, not a security block',
    /e instanceof ReferenceError \|\| e instanceof TypeError/.test(updJs) &&
    updJs.includes('This update page hit a bug in itself.') &&
    !/\|blocked\//.test(updJs),
    'our own crash was being reported to the user as their antivirus');
  /* THE UPDATER DELETES NOTHING, AND RESTARTS NOTHING. It used to do both:
     sweep retired filenames after a write, and reload the extension itself
     on a countdown. Fetch, write, delete, restart is the complete shape of a
     downloader, and security software read it exactly that way — it
     quarantined the files, which removed them from disk and made Chrome drop
     the whole extension, twice, on a real machine.

     Both were optional. A leftover file is inert (Chrome loads only what the
     manifest names) and the reload saves exactly one click. What remains is
     fetch and write, which IS the update and cannot be given up. This is a
     real reduction in what the program does — not the same actions wearing a
     disguise, which would deserve the detection. */
  ok('the updater deletes nothing — no sweep, no probe cleanup, nothing',
    !/removeEntry/.test(updJs),
    'deleting files after writing them is the most recognisable move a dropper makes');
  /* IT NEVER RESTARTS ITSELF; it offers a button that does. The automatic
     countdown-then-reload was removed because fetch-write-delete-RESTART is
     what a downloader looks like — but replacing one click with "copy this
     address, paste it, find the row, press the icon" was a bad trade made by
     someone who was not making those four steps. The line that matters is
     consent, not the API: a dropper restarts what it installed silently.
     So the call may exist ONLY inside a click handler, and never on a timer. */
  ok('it never restarts itself — the reload is a button the user presses',
    /\$\('reloadExt'\)\.addEventListener\('click'/.test(updJs) &&
    (updJs.match(/chrome\.runtime\.reload\s*\(/g) || []).length === 1 &&
    !/const tick = \(\) => \{[\s\S]*?chrome\.runtime\.reload/.test(updJs),
    'an automatic restart after writing files is the shape, and the consent is the difference');
  ok('the updater learns its file list from the repo, not from itself',
    updJs.includes("'/files.json'") &&
    shipped.includes('files.json') &&
    shipped.every((f) => fs.existsSync(path.join(extDir, f))),
    'a version that adds a file would update into a broken folder');
  /* the update screen's three promises: it can put a TORN folder right
     (write current files without needing a newer version — the rescue for
     an old updater that wrote a manifest naming files it never fetched),
     it checks on open rather than making the user press to find out, and
     its page keeps all behaviour in options.js (MV3 forbids inline). */
  ok('the update screen can repair a torn install',
    /repairing/.test(updJs) && updJs.includes('!repairing && !newer') &&
    updHtml.includes('id="repair"'),
    'a broken folder would have no way back but a reinstall');
  ok('and it checks for updates on open, not on demand',
    updJs.includes('showFolder().then(check)'),
    'staleness the user must ask about goes unasked');
  /* …and ON DEMAND as well: the automatic check answers once, but "did my
     push land yet?" is asked minutes later, and reloading a settings page to
     find out is not an answer. Every reply carries the time it was given, so
     re-checking an unchanged answer still visibly happened. */
  /* AUDIT FIXES (ux-audit-psychology, 2026-08-24) — each pins a finding.
     C3: a disabled control that says nothing reads as a broken control; both
     buttons here grey out from a cause one card above them. P2: a step that
     is done must stop looking like a step that is waiting. */
  ok('every disabled state names what would enable it',
    updJs.includes("$('gateWhy')") &&
    /Both buttons need step 1 first/.test(updJs) &&
    /Nothing to update/.test(updJs),
    'a silently disabled button is indistinguishable from a broken one');
  ok('and a finished step stops looking unfinished',
    /\$\('step1'\)\.classList\.toggle\('done', haveFolder\)/.test(updJs) &&
    /\.step\.done::after \{ content: '✓'/.test(updHtml),
    'numbered steps that never complete give no sense of progress');
  /* P1 + C3 on the install flow: a blank decision at the worst moment, and a
     browser requirement whose consequence was never stated. */
  {
    const inst2 = fs.readFileSync(path.join(extDir, 'install.html'), 'utf8');
    ok('the installer names a concrete folder instead of "somewhere permanent"',
      /Documents\\debug-overlay/.test(inst2),
      'the strongest default is the one the user does not have to invent');
    ok('and explains Developer mode, including that turning it off breaks things',
      /Chrome requires it for any/.test(inst2) &&
      /disables Debug Overlay/.test(inst2),
      'a user tidying their browser later loses the product with no idea why');
    ok('and says what the thing DOES before asking for five steps of setup',
      /What you are installing/.test(inst2) && inst2.indexOf('What you are installing') <
        inst2.indexOf('Step 2 — write the files'),
      'all give and no get, before the first pixel of value');
  }
  ok('the update screen can be asked again, by hand',
    updHtml.includes('id="check"') && updJs.includes("$('check').addEventListener('click', check)"),
    'the only way to re-check would be reloading the page');
  ok('and every answer says WHEN it was given',
    updJs.includes('checkedAt()') && /toLocaleTimeString/.test(updJs),
    'repainting the same sentence reads as a button that did nothing');
  ok('the button cannot be pressed twice into the same check',
    /\$\('check'\)\.disabled = true;/.test(updJs) &&
    /\$\('check'\)\.disabled = false;/.test(updJs),
    'a second press mid-flight races the first');
  ok('and its page carries no inline script',
    (updHtml.match(/<script\b/g) || []).length === 1 &&
    /src="updater\/[^"]*\.js"/.test(updHtml),
    'MV3 CSP would silently refuse it');
  const inst = fs.readFileSync(path.join(extDir, 'install.html'), 'utf8');
  /* what a real install walked into, one guard each:
     — success rendered red: an error set style.color inline and it stuck
       for every later message; status must be class-driven, no inline colour
     — a plain cancel shown as a raw exception: AbortError is a choice
     — the silent miss: files written to the PARENT of a live install
       report success while the browser keeps reading the old copy — both
       writers vet the folder (installer scans for a nested install and
       makes overriding explicit; updater refuses a folder without OUR
       manifest in it) */
  ok('neither writer paints status with sticky inline colour',
    !inst.includes('style.color') && !updJs.includes('style.color'),
    'one error would colour every success after it');
  ok('a cancelled picker is a choice, not a failure — on both pages',
    inst.includes("'AbortError'") && updJs.includes("'AbortError'"),
    'a closed dialog would read as a crash');
  ok('the installer catches the picked-the-parent mistake',
    inst.includes('subInstalls') && inst.includes('id="override"') &&
    inst.includes('.entries()'),
    'writing beside a live install would report success and change nothing');
  ok('the installer narrates the write, file by file',
    inst.includes('Writing ${i} of'),
    'a stall would look identical to progress');
  ok('the updater refuses a folder this extension does not live in',
    updJs.includes('holds no extension install') &&
    updJs.includes('refusing to write'),
    'an update into the wrong folder is a success message over nothing');
  /* the wrong-COPY trap, caught on a real machine: the granted folder held a
     genuine install of this extension, so the name check passed — but Chrome
     was loaded from a different folder, so every "successful" update changed
     nothing and v3.8.101 kept running. Still checked, now WITHOUT writing:
     the manifest on disk is compared to the manifest chrome.runtime.getURL()
     serves, which reads out of the folder Chrome actually loaded. The old
     version proved it by dropping a probe file and deleting it afterwards,
     on every update, forever — accuracy bought at the price of looking
     exactly like a dropper. */
  ok('the updater still proves the folder, and does it read-only',
    updJs.includes('proveLive') && updJs.includes('chrome.runtime.getURL(') &&
    !/removeEntry/.test(updJs) &&
    /onDisk\.trim\(\) === served\.trim\(\)/.test(updJs),
    'a second copy of the install would swallow updates forever');
  ok('and refuses a proven-dead copy, pointing at Details → Source',
    updJs.includes('Chrome is not running from') &&
    updJs.includes('"Source" names the loaded path'),
    'the refusal must say where the real folder is written down');
  ok('the version cross-check backs the probe up',
    updJs.includes('v.mismatch'),
    'a copy holding v3.8.100 under a running v3.8.101 was the live signature');
  // the side panel's knock on a tab with no content script is its NORMAL retry
  // path — unread, every knock lands on the Errors page as a scary entry
  const ckJs = fs.readFileSync(path.join(extDir, 'side-panel.js'), 'utf8');
  ok('the side panel acknowledges lastError — no Errors-page noise',
    ckJs.includes('chrome.runtime.lastError'),
    'a morning of retries filled the Errors page on a real install');
  ok('the worker can open the updater for the content script',
    fs.readFileSync(path.join(extDir, 'sw.js'), 'utf8').includes('openOptionsPage'),
    'no route from the ⏻ menu to the options page');
  // the no-cmd installer: a page carrying the runtime files INSIDE itself —
  // an embedded copy is a second copy, so the suite holds it byte-identical
  const fjson = (inst.match(/const FILES = (\{.*\});/) || [])[1];
  ok('install.html embeds the runtime files, byte-identical to disk',
    !!fjson && (() => {
      const files = JSON.parse(fjson.replace(/<\\\//g, '</'));
      return JSON.stringify(Object.keys(files).sort()) === JSON.stringify([...shipped].sort()) &&
        shipped.every((f) => /\.png$/.test(f)
          ? files[f].b64 === fs.readFileSync(path.join(extDir, f)).toString('base64')
          : files[f] === fs.readFileSync(path.join(extDir, f), 'utf8'));
    })(),
    'the installer would write files that differ from the gate it ships in');
  /* THE ICON — the options page's bug logo as the extension's own face,
     generated to PNG (a manifest icon must be one) and carried BINARY
     through both writers: text-decoding a PNG is a silent corruption that
     ships a folder Chrome refuses to load. */
  ok('the manifest wears the icon at every size, toolbar included',
    [16, 32, 48, 128].every((n) =>
      manifest.icons?.[n] === `icon${n}.png` &&
      manifest.action?.default_icon?.[n] === `icon${n}.png`),
    JSON.stringify({ icons: manifest.icons, action: manifest.action }));
  ok('every icon is a real PNG of its stated size',
    [16, 32, 48, 128].every((n) => {
      const b = fs.readFileSync(path.join(extDir, `icon${n}.png`));
      return b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(16) === n;
    }),
    'a wrong-sized or corrupt icon loads as a broken puzzle piece');
  ok('both writers carry binaries as bytes, never as text',
    updJs.includes('arrayBuffer') && inst.includes('atob('),
    'a PNG through r.text() arrives corrupt and the folder stops loading');
  ok('and no embedded file can close the installer\'s script tag',
    !!fjson && !fjson.includes('</script>'), 'unescaped </script> in the JSON');
  // the one-link install: a real ZIP at a stable raw URL
  const zip = fs.readFileSync(path.join(extDir, 'debug-overlay-extension.zip'));
  ok('the extension ships as a ZIP too',
    zip.length > 1000 && zip.readUInt32LE(0) === 0x04034b50 &&
    zip.includes(Buffer.from('manifest.json')),
    `zip ${zip.length} bytes, magic ${zip.readUInt32LE(0).toString(16)}`);
  /* the emitted folder is CLEARED each build, not merged: a rename would
     otherwise leave both spellings on disk and inside the shipped ZIP,
     which is how a dead file reaches an install folder in the first place */
  ok('the shipped ZIP carries only what this build emits',
    (() => {
      /* the local-file-header signature as BYTES: Buffer.indexOf given a
         number searches for one byte, not a four-byte word */
      const SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const names = [];
      let i = zip.indexOf(SIG);
      while (i !== -1 && i + 30 <= zip.length) {
        const n = zip.readUInt16LE(i + 26);
        if (i + 30 + n > zip.length) break;
        names.push(zip.subarray(i + 30, i + 30 + n).toString());
        i = zip.indexOf(SIG, i + 4);
      }
      return names.length > 0 &&
             names.every((n) => shipped.includes(n) || n === 'install.html') &&
             !names.includes('install.bat');
    })(),
    'a retired file rode along inside the one-link install');
  // the side panel: declared in the manifest, opened by the toolbar button
  ok('the manifest declares the side panel as the side panel',
    manifest.side_panel?.default_path === 'side-panel.html' &&
    (manifest.permissions || []).includes('sidePanel'),
    JSON.stringify({ side_panel: manifest.side_panel, permissions: manifest.permissions }));
  ok('the toolbar button opens it',
    !!manifest.action &&
    fs.readFileSync(path.join(extDir, 'sw.js'), 'utf8').includes('openPanelOnActionClick'),
    'an installed side panel nobody can reach is not shipped');
}

console.log('\nTHE SIDE PANEL — ONE PANEL, TWO FACES');
/**
 * The extension's side panel renders the SAME panel state the in-page bar
 * does, over a port speaking core/protocol.js. This block runs the whole
 * loop for real: a content window whose bridge accepts the connection, a
 * side panel window running the shipped side-panel.js, and a fake port pair
 * between them that JSON-roundtrips every message — so anything packing
 * failed to strip (a DOM node, a closure) breaks HERE, not in Chrome.
 * Async because the side panel binds its tab with an await; the final gate
 * waits on sidePanelChecked like it waits on the perf stages.
 */
let sidePanelChecked = false;
{
  const extDir = path.join(__dirname, 'dist', 'browser-extension');
  const sidePanelSrc = fs.readFileSync(path.join(extDir, 'side-panel.js'), 'utf8');
  const sidePanelHtml = fs.readFileSync(path.join(extDir, 'side-panel.html'), 'utf8');
  // read the REAL shipped manifests rather than hand-copy their shape — a
  // fake chrome.runtime.getManifest() that drifts from what build.js
  // actually emits would pass tests against a build nobody ships
  const fullManifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  /* A manifest with nothing behind the two optional controls, derived from
     the real one by removing exactly those keys. Built here rather than read
     off disk: this asserts what the CODE does with a manifest shape, so
     isolating the two variables is the point, and it does not go stale when
     the set of shipped packages changes. */
  const cleanManifest = (() => {
    const m = JSON.parse(JSON.stringify(fullManifest));
    delete m.options_ui;        // nothing for the gear to open
    delete m.host_permissions;  // no way to reach the update host
    return m;
  })();

  // the content side: a page window whose chrome looks like a content script's.
  // manifest defaults to the FULL gate's shape — this rig is testing
  // dist/browser-extension, so Updates.capable/optionsCapable must read TRUE
  // here or the existing gear/check-now assertions below would be exercising
  // a button that only LOOKS clickable in jsdom, never in a real browser.
  // `id` defaults to absent — c1/c2/c3 rely on that: fetchText()'s extension
  // branch is gated on chrome.runtime?.id, and leaving it unset is what lets
  // those windows fall through to the plain-fetch stub instead of needing a
  // sendMessage relay mock. A REAL content script always has `id` populated
  // BEFORE any of its code runs, so a window that needs `Updates.capable` to
  // read truthfully must have it set here, before eval — not after, which
  // is too late for a value the bundle computes once at module load.
  const bootContent = (manifest = fullManifest, id) => {
    const d = makeDom();
    const w = d.window;
    let onConnect = null;
    w.chrome = { runtime: { onConnect: { addListener: (f) => { onConnect = f; } },
                            getManifest: () => manifest, ...(id ? { id } : {}) } };
    w.eval(source);
    // reveal scrolls the page; jsdom needs a spy where a browser has motion
    w.eval('Element.prototype.scrollIntoView = function () {' +
           ' document.__scrolled = (document.__scrolled || 0) + 1; };');
    return { d, w, bar: w.document.getElementById('__debug-overlay-bar'),
             accept: (end) => onConnect && onConnect(end),
             ready: () => typeof onConnect === 'function' };
  };
  const c1 = bootContent();
  ok('the bridge listens where a real content script lives',
    c1.ready(), 'chrome.runtime.onConnect was offered and nothing subscribed');
  ok('no side panel yet — the bar stands', !c1.bar.classList.contains('debug-overlay-hidden'));
  c1.accept({ name: 'someone-else', onMessage: { addListener() {} },
              onDisconnect: { addListener() {} }, postMessage() {}, disconnect() {} });
  ok('a foreign port name is refused', !c1.bar.classList.contains('debug-overlay-hidden'),
    'any extension noise on the runtime would have docked the bar');

  /* a port pair that behaves like Chrome's: messages JSON-roundtrip (the
     structured-clone honesty check) and disconnect() reaches only the peer */
  const mkPipe = () => {
    const wire = (x, peer) => {
      x._m = []; x._d = [];
      x.onMessage = { addListener: (f) => x._m.push(f) };
      x.onDisconnect = { addListener: (f) => x._d.push(f) };
      x.postMessage = (m) => { const c = JSON.parse(JSON.stringify(m)); peer()._m.forEach((f) => f(c)); };
      x.disconnect = () => peer()._d.forEach((f) => f());
    };
    const a = {}, b = {};
    wire(a, () => b); wire(b, () => a);
    return [a, b];
  };

  // the side-panel side: the shipped page + bundle over a fake chrome.tabs
  const domK = new JSDOM(sidePanelHtml, { url: 'https://side-panel.test/',
    pretendToBeVisual: true, runScripts: 'outside-only',
    virtualConsole: new VirtualConsole() });
  const w2 = domK.window;
  let target = c1;                  // which content window connect() reaches
  let lastPair = null;
  let fireUpdated = null;
  w2.chrome = { runtime: {}, tabs: {
    query: async () => [{ id: 7 }],
    connect: (id, opts) => {
      const [contentEnd, sidePanelEnd] = mkPipe();
      contentEnd.name = opts.name;
      lastPair = [contentEnd, sidePanelEnd];
      target.accept(contentEnd);
      return sidePanelEnd;
    },
    onActivated: { addListener() {} },
    onUpdated: { addListener: (f) => { fireUpdated = f; } },
  } };
  w2.eval(sidePanelSrc);
  const k = w2.document;

  whenPainted(() => k.body.dataset.mode === 'main' &&
                    k.querySelectorAll('#tools button').length > 0, () => {
    console.log('\nTHE SIDE PANEL (after connect)');
    ok('connecting docks the bar — one panel shows at a time',
      c1.bar.classList.contains('debug-overlay-hidden'),
      'both faces on screen is two controls claiming one state');
    const barTools = c1.bar.querySelectorAll('[data-tool]').length;
    const kTools = k.querySelectorAll('#tools [data-tool]').length;
    ok('the roster mirrors the bar, tool for tool',
      kTools === barTools && kTools > 0, `bar ${barTools} vs side panel ${kTools}`);
    ok('tool buttons carry the real icons, not placeholders',
      [...k.querySelectorAll('#tools [data-tool]')].every((b) => b.querySelector('svg')),
      'the roster arrived without its faces');
    ok('the badge axes crossed the wire',
      k.querySelectorAll('#badge .grp').length >= 2,
      'setBadgeControls state was not replayed on hello');
    ok('power starts where the page is: OFF',
      k.body.dataset.on !== '1' &&
      k.querySelector('#power').getAttribute('aria-pressed') === 'false');

    // the loop, side panel → page → side panel: one click, both faces agree
    k.querySelector('#power').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
    ok('the side panel power button powers the PAGE overlay',
      c1.bar.querySelector('[data-st]').textContent === 'ON',
      'the command did not reach Controller.togglePower');
    ok('and the echo lights the side panel',
      k.body.dataset.on === '1' &&
      k.querySelector('#power').getAttribute('aria-pressed') === 'true',
      'state flowed one way only — the faces now disagree');

    const first = k.querySelector('#tools [data-tool]');
    const id = first.dataset.tool;
    const wasArmed = first.getAttribute('aria-pressed') === 'true';
    first.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
    ok('arming from the side panel arms the page tool',
      c1.bar.querySelector(`[data-tool="${id}"]`).classList.contains('debug-overlay-armed') === !wasArmed,
      `${id} did not toggle on the page`);
    ok('and the side panel button shows the echoed truth',
      (first.getAttribute('aria-pressed') === 'true') === !wasArmed,
      'the side panel assumed instead of listening');

    k.querySelector('[data-sweep]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
    ok('a sweep run from the side panel reports back',
      k.querySelector('[data-sweep]').classList.contains('swept') &&
      /problem/.test(k.querySelector('[data-sweep] .n').textContent),
      'swept state never echoed');

    // wire-shape locks: these literals ARE the compatibility contract
    lastPair[0].postMessage({ debugOverlay: 1, kind: 'state', name: 'flash', args: ['✓', '[data-copy]'] });
    ok('a flash crosses as a flash', /✓/.test(k.querySelector('[data-copy]').textContent));
    lastPair[0].postMessage({ debugOverlay: 1, kind: 'state', name: 'no-such-state', args: [] });
    ok('an unknown state name is dropped, not fatal', k.body.dataset.mode === 'main');

    /* THE POINT OF THE WHOLE SURFACE: the page dies, the side panel does not.
       A refresh kills the content script; the side panel reconnects to the
       fresh one and shows THAT page's truth, not a ghost of the old. */
    const c2 = bootContent();
    target = c2;
    lastPair[0].disconnect();       // the old page is gone
    ok('losing the page is announced, not hidden',
      k.body.dataset.mode === 'waiting', 'the side panel kept rendering a dead page');
    fireUpdated(7, { status: 'complete' });   // the reload finished loading
    ok('the side panel survives the refresh and reconnects',
      k.body.dataset.mode === 'main' && c2.bar.classList.contains('debug-overlay-hidden'),
      'the DevTools property — the reason the side panel exists — is broken');
    ok('and shows the NEW page truth — fresh boot, power off again',
      k.body.dataset.on !== '1',
      'a ghost of the old page state survived the reload');

    console.log('\nTHE SIDE PANEL LISTS (phase 2)');
    /* The list views, from the side of the wire the user sits on: the view
       travels with every row command and the index resolves page-side
       against rows(view) — the row-index law crossing the port. Every
       push here is command-triggered, so all of it asserts synchronously. */
    const click2 = () => new w2.MouseEvent('click', { bubbles: true });
    const badgeBox = k.querySelector('#badge');
    ok('badge chips draw icons, never markup-as-text',
      badgeBox.querySelectorAll('svg').length >= 3 &&
      !badgeBox.textContent.includes('<svg'),
      'the first live install showed raw <svg …> strings as chip labels');
    ok('and each member says its short name',
      /compact/.test(badgeBox.textContent) && /Issue/.test(badgeBox.textContent),
      'two chips both reading "Badge view" told nobody apart');

    /* THE TIMELINE — history the page cannot hold. Wire-shape locks first:
       these literals ARE the events contract. */
    const tlBox = k.querySelector('#timeline');
    lastPair[0].postMessage({ debugOverlay: 1, kind: 'state', name: 'events',
      args: ['perf', [{ kind: 'freeze', at: 8300, ms: 412, via: 'task', blame: null }], false] });
    ok('a live event becomes a timeline row, stamped in page time',
      /\+8\.3s/.test(tlBox.textContent) && /freeze 412ms/.test(tlBox.textContent),
      'the events message never rendered');
    lastPair[0].postMessage({ debugOverlay: 1, kind: 'state', name: 'events',
      args: ['x', [{ kind: 'load', at: 0, server: 120, fcp: 800, dom: 900, done: 1500 }], true] });
    ok('a backlog lands as history — the load with its timings',
      /server 120ms/.test(tlBox.textContent) && /first paint 800ms/.test(tlBox.textContent),
      'load timings never rendered');
    lastPair[0].postMessage({ debugOverlay: 1, kind: 'state', name: 'events',
      args: ['x', [{ kind: 'load', at: 0, server: 130, fcp: 800, dom: 900, done: 1500 }], true] });
    ok('and a repeated backlog REPLACES, never doubles',
      /server 130ms/.test(tlBox.textContent) && !/server 120ms/.test(tlBox.textContent),
      'reconnect or re-arm would stack the same history twice');

    k.querySelector('#power').dispatchEvent(click2());
    k.querySelector('[data-sweep]').dispatchEvent(click2());
    k.querySelector('#views [data-view="findings"]').dispatchEvent(click2());
    const rowsBox = k.querySelector('#rowsBox');
    ok('a view opens with rows pushed in the same breath',
      rowsBox.classList.contains('show') && rowsBox.querySelectorAll('.rrow').length > 0,
      'openView answered with nothing');
    const act = [...rowsBox.querySelectorAll('.rrow')].find((r) => r.querySelector('.go'));
    ok('a finding row is activatable across the wire', !!act,
      'activatable never survived packing');
    act.querySelector('.go').dispatchEvent(click2());
    ok('activating it reveals the element ON THE PAGE',
      (c2.w.document.__scrolled || 0) >= 1,
      'the command did not reach Controller.revealRow');

    k.querySelector('#views [data-view="pins"]').dispatchEvent(click2());
    ok('the reveal pinned on the way, and the pins view lists it',
      /#1/.test(rowsBox.textContent),
      'rows(pins) never showed the pin the reveal created');
    const rm = rowsBox.querySelector('.rrow .rm');
    ok('the pin row carries its ✕', !!rm, 'removable never crossed');
    rm.dispatchEvent(click2());
    ok('removing it from the side panel empties the page pins',
      !!rowsBox.querySelector('.empty') && !/#1/.test(rowsBox.textContent),
      '(view, index) resolved against the wrong list');

    k.querySelector('#views [data-view="settings"]').dispatchEvent(click2());
    ok('settings arrive grouped under their headings',
      rowsBox.querySelectorAll('.rowhead').length >= 2,
      'the affects grouping flattened in transit');
    ok('rows carry the owners\' real icons',
      rowsBox.querySelectorAll('.rrow .tag svg').length > 0,
      'svg tags were not gated through');
    const sel = rowsBox.querySelector('.rrow select');
    ok('a choice renders as a select', !!sel, 'control descriptors lost their kind');
    const to = (sel.selectedIndex + 1) % sel.options.length;
    sel.selectedIndex = to;
    sel.dispatchEvent(new w2.Event('change', { bubbles: true }));
    const sel2 = rowsBox.querySelector('.rrow select');
    ok('changing it writes the PAGE setting and the echo agrees',
      sel2 && sel2 !== sel && sel2.selectedIndex === to,
      'the side panel shows a value the page is not using — a control lying');
    ok('and toggles render as checkboxes',
      !!rowsBox.querySelector('.rrow input[type="checkbox"]'),
      'toggle descriptors fell through to the unknown-kind span');

    k.querySelector('#views [data-view="settings"]').dispatchEvent(click2());
    ok('pressing the open view again closes it',
      !rowsBox.classList.contains('show'), 'a list with no exit');

    /* the OPEN VIEW survives the refresh too: reconnect re-requests it */
    k.querySelector('#views [data-view="findings"]').dispatchEvent(click2());
    const c3 = bootContent();
    target = c3;
    lastPair[0].disconnect();
    fireUpdated(7, { status: 'complete' });
    ok('the open view rides through a reload — re-requested, fresh truth',
      k.body.dataset.mode === 'main' && rowsBox.classList.contains('show') &&
      !!rowsBox.querySelector('.empty'),
      'the fresh page has no sweep, so the honest answer is the empty text');
    ok('and the reload draws its divider in the timeline',
      !!tlBox.querySelector('.tl-reload') &&
      /freeze 412ms/.test(tlBox.textContent),
      'history from before the reload must survive it, separated, not erased');

    /* END TO END: a REAL freeze on the fresh page, armed from the side panel,
       detected by the Monitor's heartbeat, handed up through ctx.event,
       across the port, into the timeline — the whole phase in one row. */
    k.querySelector('#power').dispatchEvent(click2());
    k.querySelector('#tools [data-tool="perf"]').dispatchEvent(click2());
    c3.w.eval('setTimeout(function () { var t0 = Date.now(); while (Date.now() - t0 < 400) ; }, 60);');
    whenPainted(() => k.querySelectorAll('#timeline .tlrow.freeze').length >= 2, () => {
      console.log('\nTHE SIDE PANEL TIMELINE (after a real freeze)');
      ok('a real freeze crosses the whole seam into the timeline',
        k.querySelectorAll('#timeline .tlrow.freeze').length >= 2,
        'Monitor → ctx.event → bridge → port → side panel broke somewhere');

      console.log('\nTHE SIDE PANEL POLISH (phase 5)');
      ok('the header names whose page this is',
        /example\.test/.test(k.querySelector('#status').textContent),
        'a side panel that does not say which page it controls invites mistakes');
      // Escape closes the open view — the same one-layer ladder the bar keeps
      ok('a view is open before Escape', k.querySelector('#rowsBox').classList.contains('show'));
      k.dispatchEvent(new w2.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      ok('Escape closes the open view, and only that',
        !k.querySelector('#rowsBox').classList.contains('show') &&
        k.body.dataset.mode === 'main',
        'Escape must peel the top layer, never the session');
      let optOpened = 0;
      w2.chrome.runtime.openOptionsPage = () => { optOpened++; };
      k.querySelector('#optBtn').dispatchEvent(click2());
      ok('the header gear opens the extension options', optOpened === 1,
        'the updater must be one press away from the side panel');

      /* THE TWO PANELS, BOTH AT ONCE — on purpose, and only on purpose.
         Hiding the bar is right by default (two controls claiming one state
         is a lie about which is in charge), but a screenshot for an AI wants
         the bar IN the picture and the side panel is not in the picture. */
      const webBtn = k.querySelector('#webBtn');
      ok('the bar is hidden by default while the side panel drives',
        c3.bar.classList.contains('debug-overlay-hidden') &&
        webBtn.getAttribute('aria-pressed') === 'false',
        'the default must stay one-panel-at-a-time');
      webBtn.dispatchEvent(click2());
      ok('the toggle brings the web panel back ON THE PAGE',
        !c3.bar.classList.contains('debug-overlay-hidden'),
        'the command never reached WebPanel.setVisible');
      ok('and the button shows the echoed truth, not the click',
        webBtn.getAttribute('aria-pressed') === 'true',
        'the side panel assumed instead of listening');
      /* PERSISTED, so the next page opens the way this one was left. Asserted
         at the store rather than by booting a second window: jsdom gives each
         window its own localStorage, so only the writer could ever see it —
         and that Store hands values to a fresh boot is already proven above. */
      ok('the choice is written to the store, not just to the screen',
        c3.w.localStorage.getItem('__debug_overlay_webpanel') === '1',
        'a preference that forgets itself on reload is not a preference');
      webBtn.dispatchEvent(click2());
      ok('and toggling back hides the bar again, and says so',
        c3.bar.classList.contains('debug-overlay-hidden') &&
        webBtn.getAttribute('aria-pressed') === 'false' &&
        c3.w.localStorage.getItem('__debug_overlay_webpanel') === '0',
        'the toggle only went one way');

      /* updates, both answers. The content window has no network; the stub
         IS the wire format the checker parses. */
      const CUR = JSON.parse(fs.readFileSync(path.join(__dirname, 'userscript.json'), 'utf8')).version;
      c3.w.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('// @version ' + CUR) });
      k.querySelector('[data-upd]').dispatchEvent(click2());
      whenPainted(() => /✓ current/.test(k.querySelector('[data-upd]').textContent), () => {
        ok('a check that finds nothing still answers: ✓ current',
          /✓ current/.test(k.querySelector('[data-upd]').textContent),
          'a button that does nothing visible is worse than no button');
        c3.w.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('// @version 99.9.9') });
        k.querySelector('[data-upd]').dispatchEvent(click2());
        whenPainted(() => k.querySelector('#upd').classList.contains('show'), () => {
          ok('a found update raises the banner — and the page ⏻ dot agrees',
            /99\.9\.9/.test(k.querySelector('#updTxt').textContent) &&
            c3.bar.querySelector('.debug-overlay-pwr').classList.contains('debug-overlay-upd'),
            'the two faces must tell one update story');
          k.querySelector('#updGo').dispatchEvent(click2());
          ok('opening the updater says the next step out loud',
            /refresh this page/.test(k.querySelector('#updTxt').textContent),
            'the page cannot know the install finished; the words must say so');

          // a message from a different protocol version answers "reload this page"
          lastPair[0].postMessage({ debugOverlay: 999, kind: 'state', name: 'on', args: [true] });
          ok('a version mismatch is named, never half-worked-around',
            k.body.dataset.mode === 'stale', 'mixed versions would limp along silently');

          // undock on disconnect: side panel closed → the bar comes back
          lastPair[1].disconnect();
          ok('closing the side panel gives the page its bar back',
            !c3.bar.classList.contains('debug-overlay-hidden'),
            'the bar stayed hidden with nothing left to replace it');

          /* THE BUG A REAL INSTALL FOUND, and the gap in the first fix for
             it. The clean/store build ships no options page and no host
             permission — so the gear opened nothing (silently), and "Check
             for updates" could never reach the update host yet reported that
             failure as "✓ current": a confident wrong answer, not a visible
             absence.

             The first fix had the PAGE tell the side panel over the wire,
             which left both controls visible until a page connected — so a
             side panel sitting on "waiting for a page" still showed them,
             still dead, which is the very symptom. They are facts about the
             EXTENSION (one manifest for both halves), so the side panel now
             reads its own. Proved the strong way: a side panel with the
             clean manifest, with NO page connected at all. */
          console.log('\nTHE CLEAN BUILD HAS NOTHING TO LIE WITH');
          const cleanDom = new JSDOM(sidePanelHtml, { url: 'https://side-panel-clean.test/',
            pretendToBeVisual: true, runScripts: 'outside-only',
            virtualConsole: new VirtualConsole() });
          const wc = cleanDom.window;
          wc.chrome = { runtime: { getManifest: () => cleanManifest },
                        tabs: { query: async () => [], connect: () => { throw new Error('no tab'); },
                                onActivated: { addListener() {} }, onUpdated: { addListener() {} } } };
          wc.eval(sidePanelSrc);
          /* COMPUTED STYLE, not the attribute. Setting el.hidden only adds an
             attribute whose entire effect is `display: none` in the UA
             stylesheet — and ANY author rule with a display beats it.
             `.iconbtn` and `#actions button` both set one, so the first
             version of this shipped with the attribute set and the buttons
             still on screen, while a test asserting `.hidden` passed. Ask
             what the browser would actually paint. */
          const gone = (w, sel) => w.getComputedStyle(w.document.querySelector(sel)).display === 'none';
          ok('the gear is GONE with no page connected — computed, not just attributed',
            gone(wc, '#optBtn'),
            'a side panel on "waiting for a page" showed a gear that opens nothing');
          ok('and so is "Check for updates" — it could only ever fail',
            gone(wc, '[data-upd]'),
            'this is the one that lied: it reported "✓ current" without ever asking');
          /* the same page, built the FULL way, must still offer both — a
             capability check that hides everything everywhere is not a fix */
          const fullDom = new JSDOM(sidePanelHtml, { url: 'https://side-panel-full.test/',
            pretendToBeVisual: true, runScripts: 'outside-only',
            virtualConsole: new VirtualConsole() });
          const wf = fullDom.window;
          wf.chrome = { runtime: { getManifest: () => fullManifest },
                        tabs: { query: async () => [], connect: () => { throw new Error('no tab'); },
                                onActivated: { addListener() {} }, onUpdated: { addListener() {} } } };
          wf.eval(sidePanelSrc);
          ok('while the full build still shows both — the check hides what is absent, not everything',
            !gone(wf, '#optBtn') && !gone(wf, '[data-upd]'),
            'the updater gate is the full build\'s main update path; hiding it would be worse');

          // the SAME honesty on the on-page ⏻ menu, which is its own surface
          const c5 = bootContent(cleanManifest, 'clean-test-id');
          const rclickPwr = (w) => w.document.querySelector('#__debug-overlay-bar .debug-overlay-pwr')
            .dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
          const menuRows = (w) => [...w.document.querySelectorAll('#__debug-overlay-menu button')]
            .map((b) => b.textContent);
          c5.w.dispatchEvent(new c5.w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
          rclickPwr(c5.w);
          ok('the on-page ⏻ menu says the same thing, not "Check for updates now"',
            !menuRows(c5.w).some((x) => /Check for updates now|Check again/.test(x)) &&
            menuRows(c5.w).some((x) => /cannot check for updates/.test(x)),
            menuRows(c5.w).join(' | ') || '(no menu)');

          c1.d.window.close();
          c2.d.window.close();
          c3.d.window.close();
          c5.d.window.close();
          w2.close();
          /* These two close a tick late, on purpose. side-panel.js starts with
             an async bind() whose continuation lands after this synchronous
             block — closing the window first left that continuation calling
             document.querySelector on a torn-down window, which crashed the
             suite AFTER its assertions had already passed. Neither has a
             pending reconnect timer (query returns no tab, so connect() bails
             before scheduling one), so one macrotask is enough. */
          setTimeout(() => { cleanDom.window.close(); fullDom.window.close(); }, 0);
          sidePanelChecked = true;
        });
      });
    });
  });
}

console.log('\nONE STORAGE, TWO GATES');
/**
 * The extension gate's Store now rides chrome.storage.local — the one store
 * a content script has that follows the EXTENSION rather than the origin.
 * This is the fix for a failure measured live: ⚡ armed on one site arrived
 * disarmed on the next, because the fallback (localStorage) is per origin.
 * Async backend, so these stages wait on the deferred boot; every other
 * backend boots synchronously, which the rest of this suite proves by
 * asserting against the DOM in the same breath as eval.
 */
let storageChecked = false;
{
  const mkExtWin = (bag, url) => {
    const dom = new JSDOM('<!doctype html><html><body><div id="a">x</div></body></html>',
      { url, pretendToBeVisual: true, runScripts: 'outside-only',
        virtualConsole: new VirtualConsole() });
    const w = dom.window;
    w.chrome = { runtime: {}, storage: {
      local: {
        get: (q, cb) => cb(Object.assign({}, bag)),
        set: (obj, cb) => { Object.assign(bag, obj); if (cb) cb(); },
        remove: (k, cb) => { delete bag[k]; if (cb) cb(); },
      },
      onChanged: { addListener() {} },
    } };
    w.eval(source);
    return { dom, w, bar: () => w.document.getElementById('__debug-overlay-bar') };
  };
  const hotkey = (w) => w.dispatchEvent(new w.KeyboardEvent('keydown',
    { altKey: true, shiftKey: true, ctrlKey: false, code: 'KeyD', bubbles: true }));

  const bag = {};
  const s1 = mkExtWin(bag, 'https://a.test/');
  whenPainted(() => !!s1.bar(), () => {
    console.log('\nONE STORAGE (after the deferred boot)');
    ok('the extension gate boots — one tick late, then whole',
      !!s1.bar(), 'chrome.storage present and no bar: the deferred start never ran');
    ok('boot already wrote through — the seen set is in extension storage',
      typeof bag['__debug_overlay_seen'] === 'string', Object.keys(bag).join(', '));
    hotkey(s1.w);
    s1.bar().querySelector('[data-tool="perf"]')
      .dispatchEvent(new s1.w.MouseEvent('click', { bubbles: true }));
    ok('arming ⚡ on site A lands in extension storage',
      (bag['__debug_overlay_tools'] || '').includes('perf'), bag['__debug_overlay_tools']);

    const s2 = mkExtWin(bag, 'https://b.test/');
    whenPainted(() => !!s2.bar(), () => {
      ok('site B boots with ⚡ STILL ARMED — the split is over',
        s2.bar().querySelector('[data-tool="perf"]').classList.contains('debug-overlay-armed'),
        'the exact live failure: armed on one origin, disarmed on the next');
      ok('while power stays per site, carried by its KEY',
        !s2.bar().classList.contains('debug-overlay-on'),
        'a global backend must not globalise a per-site choice');

      // adoption: an install that lived the per-origin life keeps its choices
      const bag2 = {};
      const s3 = mkExtWin(bag2, 'https://c.test/');
      s3.w.localStorage.setItem('__debug_overlay_tools', JSON.stringify(['grid']));
      const s3b = mkExtWin(bag2, 'https://c.test/');
      whenPainted(() => !!s3b.bar(), () => {
        ok('per-origin values are ADOPTED into extension storage, then removed',
          (bag2['__debug_overlay_tools'] || '').includes('grid') &&
          s3b.w.localStorage.getItem('__debug_overlay_tools') === null,
          'an upgrade reset somebody, or left two answers to one question');

        /* THE RENAME MUST NOT RESET ANYBODY. Every key was __dbgov_* before
           it; an install that armed ⚡ under the old names must arrive with
           ⚡ still armed under the new ones, and the value must be rewritten
           forward so the legacy name is read once and never again. */
        /* ONE window, deliberately: this is one install UPGRADING and
           reading its own legacy keys. (Two windows cannot test it — jsdom
           gives each its own localStorage, so only the first would ever see
           the old value.) The setItem lands before boot because the deferred
           start resolves on a microtask. */
        const bag3 = {};
        const s4 = mkExtWin(bag3, 'https://d.test/');
        s4.w.localStorage.setItem('__dbgov_tools', JSON.stringify(['perf']));
        whenPainted(() => !!s4.bar(), () => {
          ok('choices saved under the PRE-RENAME key names are carried forward',
            s4.bar().querySelector('[data-tool="perf"]')
              .classList.contains('debug-overlay-armed'),
            'the rename reset the user — exactly what the legacy read exists to stop');
          ok('and they are rewritten under the new name, read once and done',
            (bag3['__debug_overlay_tools'] || '').includes('perf'),
            'the legacy key would be re-read forever instead of migrated');
          ok('and the legacy NAME is never written into the new store',
            !Object.keys(bag3).some((k) => k.includes('dbgov')),
            'adopting a legacy key under its own name stores junk and erases the source');
          s1.dom.window.close();
          s2.dom.window.close();
          s3.dom.window.close();
          s3b.dom.window.close();
          s4.dom.window.close();
          storageChecked = true;
        });
      });
    });
  });
}

console.log('\nTHE UPDATER, ACTUALLY RUN');
/**
 * Every previous assertion about this file greps its SOURCE. That is why a
 * plain ReferenceError shipped: `selfBlocked` was renamed in one place and
 * left behind in two others, `node --check` saw valid syntax, every regex
 * still matched, and the page crashed at the end of a successful update —
 * reporting it, thanks to a loose classifier, as a security block that had
 * not happened.
 *
 * So drive the real thing: the shipped update.html + update.js, over mocked
 * chrome / fetch / IndexedDB / directory handle, and press the buttons. A
 * crash anywhere in the path now fails here instead of on someone's machine.
 */
let updaterRan = false;
let capChecked = false;   // the sliced-sweep page finishes a turn later
let settleChecked = false;
{
  const extDir = path.join(__dirname, 'dist', 'browser-extension');
  const html = fs.readFileSync(path.join(extDir, 'update.html'), 'utf8');
  const js = fs.readFileSync(path.join(extDir, 'updater',
    fs.readdirSync(path.join(extDir, 'updater'))[0]), 'utf8');
  const localManifest = fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8');
  const shippedList = JSON.parse(fs.readFileSync(path.join(extDir, 'files.json'), 'utf8'));
  const MINE = JSON.parse(localManifest).version;

  /** One updater page, wired to a fake disk and a fake repo. */
  const rig = (remoteVersion) => {
    const dom = new JSDOM(html, { url: 'chrome-extension://test/update.html',
      pretendToBeVisual: true, runScripts: 'outside-only',
      virtualConsole: new VirtualConsole() });
    const w = dom.window;
    const disk = new Map([['manifest.json', localManifest]]);
    const remoteManifest = localManifest.replace(`"version": "${MINE}"`,
                                                 `"version": "${remoteVersion}"`);
    /* A DIRECTORY TREE, because the updater writes into one now. The mock
       was flat, so a path like "updater/abc.js" resolved to a root file whose
       NAME contained a slash — which no filesystem call treats as an error,
       and which nothing here would have noticed. The disk stays one Map
       keyed by full path; a handle is a prefix over it. */
    const mkDir = (prefix) => ({
      name: prefix ? prefix.slice(0, -1) : 'debug-overlay',
      requestPermission: async () => 'granted',
      getDirectoryHandle: async (n, opts) => {
        const p = prefix + n + '/';
        if (!opts?.create && ![...disk.keys()].some((k) => k.startsWith(p)))
          throw new Error('NotFoundError');
        return mkDir(p);
      },
      keys: async function* () {
        const seen = new Set();
        for (const k of disk.keys()) {
          if (!k.startsWith(prefix)) continue;
          const seg = k.slice(prefix.length).split('/')[0];
          if (!seen.has(seg)) { seen.add(seg); yield seg; }
        }
      },
      getFileHandle: async (name, opts) => {
        let at = prefix + name;
        if (!disk.has(at) && !opts?.create) throw new Error('NotFoundError');
        return {
          getFile: async () => ({ text: async () => disk.get(at),
                                   size: String(disk.get(at) ?? '').length }),
          createWritable: async () => {
            disk.set(at, '');   // truncates at open, as the real one does
            return {
              write: async (d) => disk.set(at, typeof d === 'string' ? d : '<binary>'),
              close: async () => {},
            };
          },
          move: async (to) => { disk.set(prefix + to, disk.get(at)); disk.delete(at); at = prefix + to; },
        };
      },
    });
    const dirHandle = mkDir('');
    // IndexedDB, only enough of it: this page stores exactly one handle
    const store = new Map([['dir', dirHandle]]);
    w.indexedDB = { open: () => {
      const req = {};
      setTimeout(() => {
        req.result = { createObjectStore() {}, transaction: () => ({ objectStore: () => ({
          get: (k) => { const r = {}; setTimeout(() => { r.result = store.get(k); r.onsuccess?.(); }, 0); return r; },
          put: (v, k) => { const r = {}; store.set(k, v); setTimeout(() => r.onsuccess?.(), 0); return r; },
        }) }) };
        req.onsuccess?.();
      }, 0);
      return req;
    } };
    w.chrome = { runtime: {
      id: 'test-id',
      getManifest: () => JSON.parse(localManifest),
      getURL: (p) => 'chrome-extension://test/' + p,
    } };
    w.fetch = async (url) => {
      const name = String(url).split('/').pop();
      // what Chrome SERVES is our own manifest — that is what proveLive compares
      if (String(url).startsWith('chrome-extension://')) {
        return { ok: true, text: async () => disk.get(name) };
      }
      if (name === 'manifest.json') return { ok: true, text: async () => remoteManifest,
                                             json: async () => JSON.parse(remoteManifest) };
      if (name === 'files.json') return { ok: true, text: async () => JSON.stringify(shippedList) };
      return { ok: true, text: async () => `/* ${name} @ ${remoteVersion} */`,
               arrayBuffer: async () => new ArrayBuffer(8) };
    };
    /* The page is a plain script with no module system and nothing to
       export, so its declarations are not reachable from out here. Naming
       the one helper this suite drives directly is a smaller lie than
       either alternative: a production export nothing uses, or a test that
       waits out the real 60s schedule to observe it. */
    w.eval(js + '\n;window.__drive = { settle };');
    return { w, dom, disk, dirHandle, store,
             logText: () => w.document.getElementById('log').textContent };
  };

  // 1) REPAIR — same version, rewrites everything. This is the exact run that
  //    wrote all eleven files and then died on the last line.
  const r = rig(MINE);
  r.disk.set('install.bat', '@echo off');   // a real install folder still has it
  // wait for boot: the folder handle loads from IndexedDB and the opening
  // check runs, and only then is Verify & repair live
  whenPainted(() => !r.w.document.getElementById('repair').disabled, () => {
    r.w.document.getElementById('repair').dispatchEvent(new r.w.MouseEvent('click', { bubbles: true }));
    // …then for the run to finish: the banner is the last thing it writes
    whenPainted(() => r.w.document.getElementById('doneHead').textContent.length > 0 ||
                      /failed:/.test(r.logText()), () => {
      console.log('\nTHE UPDATER, ACTUALLY RUN');
      const log = r.logText();
      ok('a repair writes every shipped file',
        shippedList.filter((f) => f !== 'update.js').every((f) => log.includes('wrote ' + f)),
        log.slice(-300));
      /* RETIRED was a dead constant for three releases — declared, commented
         as feeding a page nobody wrote, read by nothing. It therefore said
         nothing about install.bat, which sat in every install folder being
         the most flagged file in the package. Named now, never deleted. */
      ok('a run NAMES retired files still in the folder, and deletes nothing',
        /install\.bat/.test(js) &&
        /not used by the extension — safe to delete/.test(r.logText()) &&
        /install\.bat/.test(r.logText()) &&
        r.disk.has('install.bat'),
        'a list nothing reads is a comment wearing a constant');
  /* …and the INSTALLER belongs on that list, for a different reason than the
     rest. It still ships, so it is not retired — but it is not part of a
     running install either, and it carries an inline snapshot of every
     runtime file that the updater never refreshes (it is not in files.json).
     The copy in a folder is frozen at whatever version was installed first,
     so opening it there writes that snapshot back over everything: a silent
     downgrade of the whole extension, from a page whose only button says
     Install. Seen on a real folder — every file at v3.8.149, install.html
     still at the version from a dozen releases earlier. */
  ok('the stale installer is named too — its one action is a downgrade',
    /'install\.html',/.test(js) &&
    !shippedList.includes('install.html') &&
    /'update\.js'\]/.test(js),   // …and the pre-versioning orphan beside it
    'a page that rewrites every file from a frozen snapshot, and is never refreshed');
      ok('and it finishes without throwing — no "failed:" at the end',
        !/failed:/.test(log),
        log.slice(-300));
      ok('the completion banner actually renders',
        /is on disk/.test(r.w.document.getElementById('doneHead').textContent),
        r.w.document.getElementById('doneHead').textContent || '(empty)');
      ok('and the manifest landed LAST, so a partial run never commits',
        log.lastIndexOf('wrote manifest.json') > log.lastIndexOf('wrote content.js'),
        'manifest first would leave a folder naming files that are not there');
      r.dom.window.close();
      updaterRan = true;
    });
  });

  /* 3) THE SETTLE CHECK. Every other assertion about writing is synchronous,
        which is precisely the blind spot: a scanner that quarantines lets the
        write succeed, lets the read-back match, and removes the file a few
        seconds later. The page reported "on disk" accurately about a folder
        that no longer held update.js — true when written, false when read.

        Driven directly rather than through a run, with setTimeout collapsed:
        what is under test is what it REPORTS, not that it can wait 60s. The
        Map is the disk, so "quarantined" is a delete, which is what it is.

        kept.js is the half that keeps the rig honest. The mock File had no
        .size until this test needed it, so an unfaithful rig would have
        called every file missing and this assertion would have passed
        without the code working at all. */
  {
    const s = rig(MINE);
    s.w.setTimeout = (fn) => { fn(); return 0; };
    s.disk.set('kept.js', 'still here');
    s.disk.set('taken.js', 'written fine');
    s.disk.delete('taken.js');            // …and a second later, it is not
    s.w.__drive.settle(s.dirHandle, ['kept.js', 'taken.js']).then(() => {
      const note = s.w.document.getElementById('settleNote');
      ok('a file written and then TAKEN is named, not reported as success',
        !note.hidden && /taken\.js/.test(note.textContent),
        'quarantine is asynchronous; every other check in the file is not');
      ok('and a file that stayed is not accused',
        !/kept\.js/.test(note.textContent) && /removed from disk/.test(note.textContent),
        'a check that flags everything has measured nothing');
      settleChecked = true;
    }, (e) => { ok('the settle check runs', false, e.message); settleChecked = true; });
  }
}

/* AUDIT FIX (C3 — first-run comprehension). Powered on with nothing pinned,
   the bar showed eleven controls and no instruction. The sentence explaining
   the core gesture DID exist — inside the pin popover, reachable only by
   clicking the chip a new user has no reason to press. It is on the surface
   now, and it leaves the moment the gesture is used: taught, not dismissed.

   Its own window, because it needs the overlay POWERED ON and the rest of
   this section is written against a booted-but-off bar. */
{
  const d = makeDom();
  const w = d.window;
  w.eval(source);
  w.dispatchEvent(new w.KeyboardEvent('keydown',
    { altKey: true, shiftKey: true, ctrlKey: false, code: 'KeyD', bubbles: true }));
  const hint = () => w.document.querySelector('.debug-overlay-hint');
  ok('a first-run user is told the core gesture, without opening anything',
    !!hint() && /Shift\+click two to measure/.test(hint().textContent),
    'the one instruction that mattered was hidden behind the control it explains');
  ok('and it cannot eat a click meant for the page',
    !!hint() && w.getComputedStyle(hint()).pointerEvents === 'none',
    'an instruction is not a control');
  // jsdom has no elementFromPoint, and the click path resolves its target
  // through it — the same stub every other pinning test here uses
  const target = w.document.getElementById('a');
  w.document.elementFromPoint = () => target;
  target.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok('using the gesture retires the instruction',
    !hint(), 'a hint that outstays its welcome becomes furniture');
  ok('and it stays retired on the next visit',
    w.localStorage.getItem('__debug_overlay_taught') === '1',
    'teaching the same thing twice is not teaching');
  d.window.close();
}

console.log('\nTHE DESIGN SYSTEM');
/**
 * There was none: 47 colour literals in the overlay sheet, 23 distinct dark
 * neutrals across four surfaces, eleven radius values — including #3a3a40
 * and #3a3a41, one digit apart doing the same job, and 9/10/11/12px, four
 * ways to say "a control". Nobody chose any of that; each call site invented
 * its own, because nothing named the alternatives.
 *
 * These guards are cheap for one reason: the sheets are ALREADY parsed here
 * for brace balance and for the namespace. This is one more regex over text
 * that is being read anyway, which is what makes a rule survive its author.
 */
{
  const overlayCss = [...window.document.querySelectorAll('#__debug-overlay-root style')]
    .map((s) => s.textContent).join('\n');
  // the token block itself is the one place literals are allowed to live
  const body = overlayCss.slice(overlayCss.indexOf('--debug-overlay-r-card'));

  const strays = [...new Set([...body.matchAll(/(#[0-9a-fA-F]{3,8})\b/g)].map((m) => m[1]))];
  /* A short allow-list, each entry a DOCUMENTED exception rather than a
     leftover: tool-identity colours (a pin's kind, a finding's severity)
     carry meaning of their own and are not theme values. Naming them here
     is what makes them exceptions instead of drift. */
  const allowed = new Set([
    // IDENTITY colours: they say WHICH thing this is, not how the theme
    // feels. A pin's kind, a badge field, a severity — recolouring the
    // theme must not recolour these, so they are not theme values.
    '#ff8a65',   // pin count
    '#9ad0ff', '#8ab4f8', '#d7c4ff', '#c084fc',  // badge fields · pin kinds
    '#ff6b6b', '#ff2f2f',                        // severity · armed remove chip
    '#16200a', '#241333',                        // text tinted to ITS fill
    '#fff',                                      // pure white, deliberate
    '#232328', '#3f3f46', '#0d1b24',             // one-off chrome
  ]);
  const rogue = strays.filter((c) => !allowed.has(c));
  ok('no un-tokenised colour outside the token block',
    rogue.length === 0, `stray literals: ${rogue.join(' ')}`);

  const radii = [...new Set([...body.matchAll(/border-radius:\s*([0-9]+px)/g)].map((m) => m[1]))];
  /* 999px is the pill and 1px is a hairline — neither is a step anyone can
     land one off. Everything between them must be a named ladder value. */
  const okRadius = new Set(['999px', '1px']);
  ok('every radius is on the ladder, or is the pill',
    radii.every((r) => okRadius.has(r)),
    `off-ladder: ${radii.filter((r) => !okRadius.has(r)).join(' ')}`);
}

console.log('\nSTYLESHEET');
// Malformed CSS never fails loudly: the parser drops the broken rule and
// every rule after it in that sheet, and raises nothing. Each sheet is
// checked on its own, and a failure names the file that has to fix it.
function readCss(text) {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '""');
  let depth = 0, parens = 0, topLevel = 0, stray = false;
  for (const ch of bare) {
    if (ch === '(') parens++;
    else if (ch === ')') parens--;
    else if (parens > 0) continue;        // braces inside gradient()/url() are data
    else if (ch === '{') { if (depth === 0) topLevel++; depth++; }
    else if (ch === '}') { if (--depth < 0) { stray = true; depth = 0; } }
  }
  return { depth, parens, topLevel, stray };
}
const broken = { braces: [], parens: [], dropped: [] };
for (const s of sheets) {
  const who = s.dataset.tool || 'core';
  const m = readCss(s.textContent);
  if (m.depth !== 0 || m.stray) broken.braces.push(who);
  if (m.parens !== 0) broken.parens.push(who);
  const kept = s.sheet ? s.sheet.cssRules.length : 0;
  if (kept !== m.topLevel) broken.dropped.push(`${who}: wrote ${m.topLevel}, kept ${kept}`);
}
ok('braces balance in every sheet', !broken.braces.length, broken.braces.join(', '));
ok('parens balance in every sheet', !broken.parens.length, broken.parens.join(', '));
ok('no rule dropped by the parser', !broken.dropped.length, broken.dropped.join('; '));

// the tool registered last is the one a shared sheet used to eat first
const lastSheet = sheets[sheets.length - 1];
const lastWrote = readCss(lastSheet.textContent).topLevel;
const lastKept = lastSheet.sheet ? lastSheet.sheet.cssRules.length : 0;
ok('the last tool\'s CSS survives', lastWrote > 0 && lastKept === lastWrote,
  `${lastSheet.dataset.tool} wrote ${lastWrote}, kept ${lastKept}`);

console.log('\nPANEL');
const bar = window.document.getElementById('__debug-overlay-bar');
ok('panel built', !!bar);
const status = bar && bar.querySelector('[data-st]');
ok('boots powered off', !!status && status.textContent === 'OFF');

const buttons = bar ? [...bar.querySelectorAll('button.debug-overlay-tool')] : [];
const ids = buttons.map((b) => b.dataset.tool).sort();
ok('a button per registered tool', ids.length === idsOnDisk.length,
  `got ${ids.length}: ${ids.join(', ')} — src/tools has ${idsOnDisk.length}`);
ok('tool ids match the registry',
  ids.join(',') === idsOnDisk.join(','), `${ids.join(',')} vs ${idsOnDisk.join(',')}`);
// Two toggles that look identical and mean different things was the problem:
// arming grid or contrast changes what ⌕ finds, arming measure does not.
const checks = buttons.filter((b) => b.classList.contains('debug-overlay-checks')).map((b) => b.dataset.tool).sort();
const judgesOnDisk = TOOLS_ON_DISK.filter((t) => t.judges).map((t) => t.id).sort();
ok('the tools that feed the audit are marked as such',
  checks.join(',') === judgesOnDisk.join(','),
  `${checks.join(',') || 'none marked'} vs ${judgesOnDisk.join(',')}`);
ok('and they are separated from the ones that only draw',
  bar.querySelectorAll('button.debug-overlay-tool + hr.debug-overlay-sep, hr.debug-overlay-sep + button.debug-overlay-tool').length >= 2,
  'the runs are not divided by a rule');
/* Was "⌕ sits with the run it sweeps" — proximity carried the feeds-⌕ fact
   when the separator axis was that boolean. The bands are the PIPELINE now
   (input · components · run&configure · take away), the green dot carries the
   fact per tool, and ⌕ has a band of its own with ⚙ — so the invariant is a
   separator before it, not a neighbour. */
ok('⌕ and ⚙ are their own band, not filed among the tools',
  bar.querySelector('[data-sweep]').previousElementSibling?.matches('hr.debug-overlay-sep') &&
  bar.querySelector('[data-settings]').previousElementSibling?.matches('[data-sweep]'),
  `before ⌕: ${bar.querySelector('[data-sweep]').previousElementSibling?.tagName}`);
ok('and the input side leads the bar, before the components',
  bar.querySelector('button.debug-overlay-tool')?.dataset.tool ===
    [...bar.querySelectorAll('button.debug-overlay-tool')].find((b) => !b.classList.contains('debug-overlay-checks'))?.dataset.tool &&
  ['pin', 'select', 'pick'].includes(bar.querySelector('button.debug-overlay-tool')?.dataset.tool),
  `first tool: ${bar.querySelector('button.debug-overlay-tool')?.dataset.tool}`);

console.log('\nWIRING');
// the hotkey is the one path that proves interactions → controller → panel
const hot = cfg.hotkey || { altKey: true, shiftKey: true, ctrlKey: false, code: 'KeyD' };
window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
ok('hotkey powers the overlay on', !!status && status.textContent === 'ON',
  status && `status reads ${status.textContent}`);

window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
ok('hotkey powers it back off', !!status && status.textContent === 'OFF',
  status && `status reads ${status.textContent}`);

console.log('\nMOUSE');
// The overlay used to swallow only the click, which is after the browser has
// already started a selection and after the page has already reacted.
const target = window.document.getElementById('a');
let pageSawIt = false;
target.addEventListener('mousedown', () => { pageSawIt = true; });
const down = (el, opts) => {
  const e = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, ...opts });
  el.dispatchEvent(e);
  return e;
};

ok('powered off, the page keeps its mouse', !down(target).defaultPrevented);

window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
pageSawIt = false;
ok('inspecting, mousedown is swallowed', down(target).defaultPrevented,
  'a text selection starts here — shift-click would drag one across the page');
ok('inspecting, the page never sees it', !pageSawIt);
ok('alt hands the page back', !down(target, { altKey: true }).defaultPrevented);
ok('right-click is left alone', !down(target, { button: 2 }).defaultPrevented,
  'swallowing it would take the context menu too');
ok('the panel keeps its own clicks',
  !down(bar.querySelector('button.debug-overlay-pwr')).defaultPrevented);
window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));

console.log('\nREPORT');
// The report is the only place a rule's audit() hook is observable from
// outside the IIFE: stub the clipboard and read what it was handed.
let copied = null;
Object.defineProperty(window.navigator, 'clipboard',
  { value: { writeText: async (t) => { copied = t; } }, configurable: true });
window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
// derived: naming a tool here is how this file crashed when one was renamed
const judge = TOOLS_ON_DISK.find((t) => t.judges && /contrast/.test(t.id));
ok('a contrast rule exists to arm', !!judge, idsOnDisk.join(', '));
bar.querySelector(`[data-tool="${judge.id}"]`).dispatchEvent(
  new window.MouseEvent('click', { bubbles: true }));
const pin = (id) => {
  window.document.elementFromPoint = () => window.document.getElementById(id);
  window.document.getElementById(id).dispatchEvent(
    new window.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
};
pin('c');            // 1.92:1 — fails AA
pin('a');            // black on white — passes
pin('d');            // oklch on oklch — a colour space we cannot read
bar.querySelector('[data-copy]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('the report is built and copied', typeof copied === 'string', String(copied).slice(0, 40));
ok('a failing element produces a finding',
  /## findings/.test(copied || '') && /\[error\] contrast-aa/.test(copied || ''),
  'audit() hook produced nothing');
ok('a passing element produces none',
  ((copied || '').match(/\[error\]|\[warn\]/g) || []).length === 1,
  'the readable element was reported as a problem too');
// Three pins: one fails, one passes, one cannot be measured at all. The last
// used to be folded into the same empty array as the pass, so a page the tool
// could not read came back clean. It is a third answer and it says so.
ok('what cannot be measured is put up for review, not passed',
  /\[review\] contrast-aa/.test(copied || ''),
  'the unmeasurable element was silently counted as fine');
ok('and the review says what stopped it',
  /not measured — no canvas is available/.test(copied || ''),
  ((/not measured[^\n]*/.exec(copied || '') || [])[0]) || 'no reason given');

console.log('\nBACKGROUND');
// #e is light grey text on a light chip, and the chip sits on a dark page.
// Reading the background from the PARENT scores it against the dark page and
// calls 11:1 — the reader sees 1.4:1. An element paints its own background
// behind its own text.
const only = (id) => {
  window.document.querySelectorAll('button.debug-overlay-act[data-clear]')
    .forEach((b) => b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  pin(id);
  bar.querySelector('[data-copy]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return copied || '';
};
const chip = only('e');
const chipRatio = parseFloat((/contrast: ([\d.]+):1/.exec(chip) || [])[1]);
ok('an element is scored on its own background', chipRatio > 1 && chipRatio < 2,
  `got ${chipRatio} — above 10 means it read the page behind the chip`);
ok('and that is a finding', /\[error\] contrast-aa/.test(chip),
  'unreadable text on a chip has to be reported');

const grad = only('f');
ok('a background image is unknown, not white',
  /contrast: not measured — it sits on an image or gradient/.test(grad),
  'reading through a gradient to the white default is the confident wrong answer');

console.log('\nSWEEP');
// The whole point is that this needs nothing pinned.
window.document.querySelectorAll('#__debug-overlay-bar [data-clear]')
  .forEach((b) => b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
bar.querySelector('[data-sweep]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
bar.querySelector('[data-copy]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const swept = copied || '';
ok('a sweep audits the page with nothing pinned',
  /## findings — 4 problems · 4 occurrences · whole page/.test(swept),
  swept.slice(swept.indexOf('## findings')).split('\n')[0] || 'no findings section');
// two it measured and two it could not, and the two kinds do not blur
ok('measured and unmeasurable are separate counts',
  (swept.match(/\[error\]|\[warn\]/g) || []).length === 2 &&
  (swept.match(/\[review\]/g) || []).length === 2,
  swept.slice(swept.indexOf('## findings')));
ok('reviews sort below anything measured',
  swept.indexOf('[review]') > swept.lastIndexOf('[error]'),
  'a thing to go and look at outranked a thing you can act on');
// A zero that means "nothing was checked" and a zero that means "nothing is
// wrong" must not print the same line, so the scope travels with the count.
ok('the report says what was checked',
  /· whole page · 4 rules · \d+ elements/.test(swept),
  swept.slice(swept.indexOf('## findings')).split('\n')[0]);
// Arming decides what is DRAWN. With the only rule disarmed the page still
// has the same problems, and the audit still has to find them.
bar.querySelector('[data-tool="contrast"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
bar.querySelector('[data-sweep]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
bar.querySelector('[data-copy]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('a disarmed rule is still swept', /## findings — 4 problems/.test(copied || ''),
  'the sweep followed the toggle instead of the page');
bar.querySelector('[data-tool="contrast"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('two different colour pairs stay two findings',
  (swept.match(/\[error\] contrast-aa/g) || []).length === 2,
  'they collapsed — key is not distinguishing them');
// display:none is gated before any rule runs: invisible text is not a
// contrast problem, and a rule would pay a full ancestor walk to find out.
ok('a hidden element is skipped', !/#h/.test(swept), 'display:none was audited');
ok('the pin blocks are gone but the audit remains', !/\[#1\]/.test(swept),
  'a sweep does not need pins, and clearing them must not clear it');

console.log('\nTWO ROLES');
// grid decorates other tools' numbers AND produces findings. The old
// one-label-per-tool taxonomy made that impossible for no reason but the
// shape of the label.
{
  const g = new JSDOM('<!doctype html><html><body>' +
    '<div style="padding:7px"><p style="color:#000">a</p></div>' +
    '<div style="padding:11px"><p style="color:#000">b</p></div>' +
    '<div style="padding:7px"><p style="color:#000">c</p></div>' +
    // what ml-auto arrives as, and a real token just under the ceiling
    '<div style="margin-left:1127px">layout worked this out</div>' +
    '<div style="padding:95px">somebody typed this</div></body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true, runScripts: 'outside-only',
      virtualConsole: new VirtualConsole() });
  const wg = g.window;
  wg.HTMLElement.prototype.scrollIntoView = function () {};
  let gcopy = null;
  Object.defineProperty(wg.navigator, 'clipboard',
    { value: { writeText: async (t) => { gcopy = t; } }, configurable: true });
  wg.eval(source);
  const barg = wg.document.getElementById('__debug-overlay-bar');
  wg.dispatchEvent(new wg.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  barg.querySelector('[data-sweep]').dispatchEvent(new wg.MouseEvent('click', { bubbles: true }));
  barg.querySelector('[data-copy]').dispatchEvent(new wg.MouseEvent('click', { bubbles: true }));
  ok('a lens can also be a rule', /grid-off/.test(gcopy || ''),
    'grid produced no findings, so the sweep still cannot see it');
  // width and height are what layout PRODUCED; padding, margin and gap are
  // what somebody typed. Sweeping the first buried the second on a real page.
  ok('the audit judges authored spacing, not computed size',
    !/\d+px is off[\s\S]*?\n {4}span/.test(gcopy || '') &&
    /gap|7px|11px/.test(gcopy || ''),
    ((/\[info\][^\n]*/.exec(gcopy || '') || [])[0]) || 'nothing');
  // getComputedStyle resolves margin:auto to the pixels it worked out, and
  // nothing distinguishes that from a typed value — except that nobody types
  // 1127px. Above the ceiling is layout arithmetic.
  ok('layout arithmetic is not a spacing decision',
    !/1127px/.test(gcopy || ''), 'an auto margin was reported as off-grid');
  ok('and a real token just under the ceiling survives',
    /95px is off the 2px grid/.test(gcopy || ''),
    'the ceiling is swallowing values somebody actually typed');
  // keyed by value: 7px used twice is one decision, not two mistakes. Two
  // divs at 7px and one at 11px = 8 raw findings, 2 lines.
  ok('off-grid values group by value, not by element',
    /grid-off ×8: 7px is off the 2px grid/.test(gcopy || ''),
    ((/\[info\][^\n]*/.exec(gcopy || '') || [])[0]) || 'no grid finding');
  g.window.close();
}

console.log('\nPAGE RULES');
// audit(info) is blind to this by construction: each of these elements is
// perfectly correct on its own, and only the second one makes either wrong.
{
  const dup = new JSDOM('<!doctype html><html><body>' +
    '<label for="email">Email</label><input id="email">' +
    '<div id="email">a second one</div><span id="email">a third</span>' +
    '<p id="unique">fine</p>' +
    // what React and base-ui emit: a new one on every render
    '<div id="base-ui-:r1t9:"><p style="color:#999">faint</p></div></body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true, runScripts: 'outside-only',
      virtualConsole: new VirtualConsole() });
  const wd = dup.window;
  wd.HTMLElement.prototype.scrollIntoView = function () {};
  let dcopy = null;
  Object.defineProperty(wd.navigator, 'clipboard',
    { value: { writeText: async (t) => { dcopy = t; } }, configurable: true });
  wd.eval(source);
  const bard = wd.document.getElementById('__debug-overlay-bar');
  wd.dispatchEvent(new wd.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bard.querySelector('[data-sweep]').dispatchEvent(new wd.MouseEvent('click', { bubbles: true }));
  bard.querySelector('[data-copy]').dispatchEvent(new wd.MouseEvent('click', { bubbles: true }));
  ok('a page-wide rule sees what no element could',
    /\[error\] dup-id: id "email" is used 3 times/.test(dcopy || ''),
    ((/dup-id[^\n]*/.exec(dcopy || '') || [])[0]) || 'no dup-id finding');
  ok('a unique id is not a finding', !/"unique"/.test(dcopy || ''),
    'every id was reported, not just the repeated one');
  // the report has to make sense to whoever picks up the ticket, not only to
  // the person who already knew the rule
  // once, in its own section — under every finding it made a real report
  // unreadable, ninety of them carrying the same three lines
  ok('the report documents its rules',
    /## rules[\s\S]*An id must be unique in a document\./.test(dcopy || '') &&
    /https:\/\/developer\.mozilla\.org/.test(dcopy || ''),
    'the rule id is bare — no help, no link');
  ok('and documents each one once',
    ((dcopy || '').match(/An id must be unique/g) || []).length === 1,
    `${((dcopy || '').match(/An id must be unique/g) || []).length} copies`);
  // A generated id is the worst address in the document: it changes on the
  // next render, so a finding that names one cannot be found twice.
  ok('a generated id is not used as an address',
    !/^ {4}#base-ui/m.test(dcopy || ''),
    ((/^ {4}#base-ui.*/m.exec(dcopy || '') || [])[0]) || '');
  ok('and an id a person chose still is', /^ {4}#email$/m.test(dcopy || ''),
    'the best address there is was thrown away with the generated ones');
  dup.window.close();
}

console.log('\nHONEST ZERO');
// The sentence a clean page gets is the most-read line in the product, and it
// used to claim "every rule is happy" on pages where no rule had run at all.
{
  const clean = new JSDOM('<!doctype html><html><body><p style="color:#000">readable</p></body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true, runScripts: 'outside-only',
      virtualConsole: new VirtualConsole() });
  const wc = clean.window;
  wc.HTMLElement.prototype.scrollIntoView = function () {};
  wc.eval(source);
  const barc = wc.document.getElementById('__debug-overlay-bar');
  wc.dispatchEvent(new wc.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  barc.querySelector('[data-sweep]').dispatchEvent(new wc.MouseEvent('click', { bubbles: true }));
  const msg = (wc.document.querySelector('#__debug-overlay-list .debug-overlay-empty') || {}).textContent || '';
  ok('a clean page reports its scope, not a mood', /4 rules over \d+ elements/.test(msg), msg);
  ok('and never claims every rule is happy', !/happy/.test(msg), msg);
  clean.window.close();
}

console.log('\nFINDINGS LIST');
window.HTMLElement.prototype.scrollIntoView = function () {};   // jsdom has none
const listEl = window.document.getElementById('__debug-overlay-list');
ok('the sweep opens its own view', listEl.classList.contains('debug-overlay-open'));
const rows = () => [...listEl.querySelectorAll('.debug-overlay-row')];
ok('one row per distinct problem', rows().length === 4, `${rows().length} rows`);
ok('worst first', (rows()[0]?.querySelector('.debug-overlay-tag') || {}).textContent === 'error');
ok('reviews are marked as such, and come last',
  rows().slice(-2).every((r) => r.dataset.accent === 'review'),
  rows().map((r) => r.dataset.accent).join(', '));
ok('a finding has no remove button', !listEl.querySelector('.debug-overlay-rm'),
  'there is no pin behind a finding for a ✕ to drop');
// A finding is a place on the page. Clicking one should take you there and
// leave something behind that the badge and the report can both use.
rows()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
// the count chip is painted by the renderer on the next frame, so ask the
// pin list instead — it is rebuilt synchronously
bar.querySelector('[data-c]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('clicking a finding pins its element', rows().length === 1,
  `${rows().length} pin rows after clicking one finding`);
ok('and the chip still means pins', !!listEl.querySelector('.debug-overlay-rm'),
  'switching views lost the remove button');
window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));

console.log('\nCANVAS');
// jsdom has no canvas, so the section above only proves the fallback stays
// quiet. This proves the other half: given a context, the same oklch that
// used to read as 1.00:1 FAIL is measured correctly instead.
{
  const dom2 = makeDom();
  const w2 = dom2.window;
  const PAINT = {                       // what a browser would rasterise these to
    'oklch(0.985 0 0)': [250, 250, 250, 255],
    'oklch(0.275 0 0)': [58, 58, 58, 255],
  };
  const realCreate = w2.document.createElement.bind(w2.document);
  w2.document.createElement = (tag) => {
    if (String(tag).toLowerCase() !== 'canvas') return realCreate(tag);
    let fill = '#000000';
    const ctx = {
      // a real context keeps its previous value when handed a colour it does
      // not understand — that is what the two-probe check detects
      get fillStyle() { return fill; },
      set fillStyle(v) {
        if (PAINT[v]) fill = v;
        else if (/^#[0-9a-f]{3,8}$/i.test(v)) fill = v.length === 4
          ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v.toLowerCase();
      },
      clearRect() {}, fillRect() {},
      getImageData: () => ({ data: PAINT[fill] || [0, 0, 0, 255] }),
    };
    return { width: 0, height: 0, getContext: () => ctx };
  };

  let copied2 = null;
  Object.defineProperty(w2.navigator, 'clipboard',
    { value: { writeText: async (t) => { copied2 = t; } }, configurable: true });
  w2.eval(source);
  const bar2 = w2.document.getElementById('__debug-overlay-bar');
  w2.dispatchEvent(new w2.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar2.querySelector('[data-tool="contrast"]').dispatchEvent(
    new w2.MouseEvent('click', { bubbles: true }));
  w2.document.elementFromPoint = () => w2.document.getElementById('d');
  w2.document.getElementById('d').dispatchEvent(
    new w2.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  bar2.querySelector('[data-copy]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));

  const ratio = parseFloat((/contrast: ([\d.]+):1/.exec(copied2 || '') || [])[1]);
  ok('a painted colour gets a verdict', ratio > 0, 'no contrast line at all');
  ok('oklch resolves to the real ratio', ratio > 10 && ratio < 12,
    `got ${ratio} — 1.00 is the old misreading, 10.9 is the truth`);
  ok('and so produces no finding', !/## findings/.test(copied2 || ''),
    'near-white on dark passes AA — a finding here means it was misread');
  dom2.window.close();
}

console.log('\nGUARD');
// running twice must not build a second panel — Tampermonkey can inject again
// on soft navigations, and two overlays fighting over the same keys is worse
// than none.
window.eval(source);
ok('second evaluation is a no-op',
  window.document.querySelectorAll('#__debug-overlay-bar').length === 1,
  `${window.document.querySelectorAll('#__debug-overlay-bar').length} panels`);

console.log('\nSETTINGS');
/**
 * The panel is meant to be the only place a tool is controlled. That is only
 * true if moving a picker changes what the RULE DOES — a control surface that
 * merely remembers what you picked is a preferences screen wired to nothing.
 * 12px is on a 2px grid and off an 8px one, so the same element has to change
 * verdict when nothing about it changed but the setting.
 */
{
  const page = `<!doctype html><html><body>
     <div id="p" style="padding:12px">twelve</div></body></html>`;
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const d4 = new JSDOM(page, opts);
  const w4 = d4.window;
  w4.eval(source);
  const bar4 = w4.document.getElementById('__debug-overlay-bar');
  const list4 = w4.document.getElementById('__debug-overlay-list');
  const hit = (sel) => bar4.querySelector(sel)
    .dispatchEvent(new w4.MouseEvent('click', { bubbles: true }));
  const rowsOf = () => [...list4.querySelectorAll('.debug-overlay-row')];
  const labelled = (t) => rowsOf().find((r) => r.querySelector('.debug-overlay-lbl').textContent === t);
  const messages = () => rowsOf().map((r) => r.querySelector('.debug-overlay-lbl').textContent).join(' | ');

  // built by build.js, so the assertion is against the bundle, not the source
  ok('the version placeholder is substituted', !source.includes(['__VER', 'SION__'].join('')),
    'it shipped unreplaced — the overlay cannot say which version it is');
  ok('and the panel states the version', bar4.querySelector('.debug-overlay-pwr').title.includes(`v${cfg.version}`),
    bar4.querySelector('.debug-overlay-pwr').title);

  w4.dispatchEvent(new w4.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  hit('[data-settings]');
  ok('⚙ opens a view of its own', list4.classList.contains('debug-overlay-open') && rowsOf().length > 0,
    `${rowsOf().length} rows`);
  // Rows under a ROLE heading are settings and must be controls. Rows under a
  // REFERENCE heading — Keys (the gestures) and Legend (what the marks mean) —
  // are deliberately read-only: neither a gesture nor a colour is something you
  // set. Matched by the set of reference headings, not by one literal, so the
  // next one does not silently get counted as a broken settings row.
  const REFERENCE = ['Keys', 'Legend'];
  const settingRows = () => {
    const out = [];
    let inRef = false;
    for (const n of list4.children) {
      if (n.classList.contains('debug-overlay-head')) {
        inRef = REFERENCE.includes(n.childNodes[0].textContent); continue;
      }
      if (n.classList.contains('debug-overlay-viewhead')) continue;
      if (!inRef) out.push(n);
    }
    return out;
  };
  ok('every setting is a control, not a read-out',
    settingRows().length > 0 && settingRows().every((r) => r.querySelector('.debug-overlay-opt')),
    settingRows().filter((r) => !r.querySelector('.debug-overlay-opt'))
      .map((r) => r.querySelector('.debug-overlay-lbl').textContent).join(', ') || 'none missing');
  ok('and the gestures are listed where the user already is',
    [...list4.querySelectorAll('.debug-overlay-row .debug-overlay-tag')].some((t) => /Alt\+click/.test(t.textContent)),
    'Alt+click, the remove key and Esc existed nowhere in the running UI');
  // a list cannot express a threshold you type or a thing that is simply on
  ok('a choice, a number and a toggle all render',
    !!labelled('Grid step').querySelector('select.debug-overlay-opt') &&
    labelled('Ignore above').querySelector('input.debug-overlay-opt').type === 'number' &&
    labelled('Judge width & height').querySelector('input.debug-overlay-opt').type === 'checkbox',
    rowsOf().map((r) => (r.querySelector('.debug-overlay-opt') || {}).tagName).join(', '));
  const step = labelled('Grid step');
  ok('a tool contributes its own options', !!step, messages());
  ok('and the picker shows what is actually in force',
    !!step && step.querySelector('select').selectedOptions[0].textContent === '2px',
    step ? step.querySelector('select').selectedOptions[0].textContent : 'no row');

  hit('[data-sweep]');
  ok('12px is on the 2px grid to begin with', !/off the 2px grid/.test(messages()), messages());

  // The only opener for the findings view is the sweep button, which would
  // re-audit and hide exactly what this is checking. The report states its own
  // scope, so ask there instead.
  let copied4 = null;
  Object.defineProperty(w4.navigator, 'clipboard',
    { value: { writeText: async (t) => { copied4 = t; } }, configurable: true });
  hit('[data-copy]');
  ok('a live sweep reports its scope', /· whole page/.test(copied4 || ''),
    'without this the next assertion passes for the wrong reason');

  hit('[data-settings]');
  const sel4 = labelled('Grid step').querySelector('select');
  sel4.selectedIndex = [...sel4.options].findIndex((o) => o.textContent === '8px');
  sel4.dispatchEvent(new w4.Event('change'));

  hit('[data-copy]');
  ok('changing a setting drops the sweep it invalidated',
    !/· whole page/.test(copied4 || ''),
    'findings judged under the old setting outlived it');

  hit('[data-sweep]');
  ok('the rule now judges by the new setting', /off the 8px grid/.test(messages()), messages());

  // The point of the subject. The per-pin line comes from the lens's read-out
  // path and the finding comes from the rule's audit path; they are two
  // consumers of one `step`, so one report has to state the same number twice.
  const p4 = w4.document.getElementById('p');
  w4.document.elementFromPoint = () => p4;
  p4.dispatchEvent(new w4.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  hit('[data-copy]');
  ok('and the lens and the rule read the one value',
    /⚠ off 8px grid/.test(copied4 || '') && /is off the 8px grid/.test(copied4 || ''),
    (copied4 || '').split('\n').filter((l) => /grid/.test(l)).join(' | ') || 'no grid lines');

  // ---- a typed number is not a choice, and can arrive broken ---------------
  hit('[data-settings]');
  const numOf = () => labelled('Ignore above').querySelector('input.debug-overlay-opt');
  const setNum = (v) => {
    const n = numOf();
    n.value = v;
    n.dispatchEvent(new w4.Event('change'));
  };
  setNum('120');
  ok('a typed number is taken', numOf().value === '120', numOf().value);
  setNum('99999');
  ok('and clamped to what the option allows rather than dropped',
    numOf().value === '2000', `${numOf().value} — a typed 5000 should land on the ceiling`);
  setNum('');
  ok('an empty field changes nothing', numOf().value === '2000', numOf().value);
  setNum('abc');
  ok('and neither does a non-number', numOf().value === '2000', numOf().value);

  const tick = () => labelled('Judge width & height').querySelector('input.debug-overlay-opt');
  ok('a toggle starts off', tick().checked === false, 'width and height are layout output');
  tick().checked = true;
  tick().dispatchEvent(new w4.Event('change'));
  ok('and can be turned on', tick().checked === true, 'the toggle did not stick');

  const saved = w4.localStorage.getItem('__debug_overlay_settings');
  ok('the choice is persisted', !!saved && /"step":8/.test(saved), String(saved));
  // The step is owned by the SUBJECT, not by whichever component reads it. Two
  // owners would mean two rows in ⚙ and two values, and a badge could then say
  // 13px is fine over a finding saying it is not.
  ok('and it belongs to the subject, not to one of its consumers',
    /"scale":\{[^}]*"step":8/.test(saved) && !/"grid":\{[^}]*"step"/.test(saved),
    String(saved));
  ok('and so are the typed and toggled ones',
    /"max":2000/.test(saved) && /"boxes":true/.test(saved), String(saved));

  // "install once and never set anything up again" is only true if the choice
  // outlives the page it was made on
  const d5 = new JSDOM(page, opts);
  d5.window.localStorage.setItem('__debug_overlay_settings', saved);
  d5.window.eval(source);
  const bar5 = d5.window.document.getElementById('__debug-overlay-bar');
  d5.window.dispatchEvent(new d5.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar5.querySelector('[data-settings]')
    .dispatchEvent(new d5.window.MouseEvent('click', { bubbles: true }));
  const back = [...d5.window.document.querySelectorAll('#__debug-overlay-list .debug-overlay-row')]
    .find((r) => r.querySelector('.debug-overlay-lbl').textContent === 'Grid step');
  ok('and it is restored on the next load',
    !!back && back.querySelector('select').selectedOptions[0].textContent === '8px',
    back ? back.querySelector('select').selectedOptions[0].textContent : 'no row');

  // A value the tool no longer offers must not silently read as choice 0 —
  // the picker would then disagree with the rule it claims to drive.
  const d6 = new JSDOM(page, opts);
  // keyed by the OWNER that actually stores it. Naming 'grid' here made this
  // vacuous the day `step` moved to the scale subject: the load took its
  // "nothing saved" branch and never reached the validity check below.
  d6.window.localStorage.setItem('__debug_overlay_settings', '{"scale":{"step":37}}');
  d6.window.eval(source);
  const bar6 = d6.window.document.getElementById('__debug-overlay-bar');
  d6.window.dispatchEvent(new d6.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar6.querySelector('[data-settings]')
    .dispatchEvent(new d6.window.MouseEvent('click', { bubbles: true }));
  const stale = [...d6.window.document.querySelectorAll('#__debug-overlay-list .debug-overlay-row')]
    .find((r) => r.querySelector('.debug-overlay-lbl').textContent === 'Grid step');
  ok('a value the tool dropped falls back to its default',
    !!stale && stale.querySelector('select').selectedOptions[0].textContent === '2px',
    stale ? stale.querySelector('select').selectedOptions[0].textContent : 'no row');

  d4.window.close(); d5.window.close(); d6.window.close();
}

console.log('\nSTORAGE');
/**
 * localStorage is scoped to one origin and this script matches every site, so
 * everything the user chose had to be chosen again on the next domain. The
 * grant buys storage that is per SCRIPT — at the price of running in the
 * manager's sandbox, which is what the guard assertions below are about.
 */
{
  const meta = fs.readFileSync(path.join(ROOT, 'dist', cfg.metaFile), 'utf8');
  ok('the header asks for the storage API',
    /@grant\s+GM_getValue/.test(meta) && /@grant\s+GM_setValue/.test(meta),
    'without the grant the API is not defined and nothing syncs');
  ok('and leaves frames to the manager', /@noframes/m.test(meta),
    'a sandboxed script cannot reliably recognise a cross-origin frame itself');

  const page = `<!doctype html><html><body><div id="p">x</div></body></html>`;
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const withGm = (dom) => {
    const store = new Map();
    dom.window.GM_getValue = (k) => (store.has(k) ? store.get(k) : undefined);
    dom.window.GM_setValue = (k, v) => { store.set(k, v); };
    return store;
  };
  const armedIn = (w) => [...w.document.querySelectorAll('#__debug-overlay-bar button.debug-overlay-tool.debug-overlay-armed')]
    .map((b) => b.dataset.tool).sort().join(',');

  // ---- writes go to the script store, not the origin ----------------------
  const d7 = new JSDOM(page, opts);
  const gm7 = withGm(d7);
  d7.window.eval(source);
  const bar7 = d7.window.document.getElementById('__debug-overlay-bar');
  d7.window.dispatchEvent(new d7.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar7.querySelector('[data-tool="contrast"]')
    .dispatchEvent(new d7.window.MouseEvent('click', { bubbles: true }));
  // against the bar rather than a literal list: what matters is that the store
  // and the buttons agree, and a spelled-out default breaks every time a tool
  // ships without saying anything true having changed
  ok('a choice is written where every site can read it',
    JSON.parse(gm7.get('__debug_overlay_tools') || '[]').sort().join(',') === armedIn(d7.window),
    `stored ${gm7.get('__debug_overlay_tools')} vs armed ${armedIn(d7.window)}`);
  ok('and not into this one origin',
    d7.window.localStorage.getItem('__debug_overlay_tools') === null,
    'writing both leaves two answers to the same question');

  // ---- a soft navigation may re-inject into a FRESH sandbox ---------------
  // Same document, new window: the flag the old guard relied on is gone, and
  // two overlays on one page fight over the same hotkey.
  delete d7.window.__DEBUG_OVERLAY__;
  d7.window.eval(source);
  ok('a fresh sandbox on the same page builds no second panel',
    d7.window.document.querySelectorAll('#__debug-overlay-bar').length === 1,
    `${d7.window.document.querySelectorAll('#__debug-overlay-bar').length} panels`);

  // ---- nobody loses what they already had ---------------------------------
  const d8 = new JSDOM(page, opts);
  const gm8 = withGm(d8);
  d8.window.localStorage.setItem('__debug_overlay_tools', '["contrast"]');
  d8.window.eval(source);
  ok('what an origin already had is adopted, not discarded',
    gm8.get('__debug_overlay_tools') === '["contrast"]',
    'shipping the grant would have reset every existing user');
  ok('and it is actually in force', armedIn(d8.window) === 'contrast',
    armedIn(d8.window) || '(nothing armed)');

  // ---- and it still works where the API does not exist --------------------
  // the dev page, the tests, and any manager without GM_* — falling back is
  // what keeps those from silently forgetting everything
  const d9 = new JSDOM(page, opts);
  d9.window.eval(source);
  const bar9 = d9.window.document.getElementById('__debug-overlay-bar');
  d9.window.dispatchEvent(new d9.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar9.querySelector('[data-tool="contrast"]')
    .dispatchEvent(new d9.window.MouseEvent('click', { bubbles: true }));
  ok('with no GM API it falls back to the origin',
    JSON.parse(d9.window.localStorage.getItem('__debug_overlay_tools') || '[]').sort().join(',')
      === armedIn(d9.window),
    `stored ${d9.window.localStorage.getItem('__debug_overlay_tools')} vs armed ${armedIn(d9.window)}`);

  // ---- the frame check, exercised directly --------------------------------
  // frameElement is the identity-free half of this; @noframes is the other.
  const d10 = new JSDOM(page, opts);
  Object.defineProperty(d10.window, 'frameElement',
    { value: d10.window.document.createElement('iframe'), configurable: true });
  d10.window.eval(source);
  ok('a framed document gets no overlay',
    !d10.window.document.getElementById('__debug-overlay-bar'),
    'the overlay started inside a frame');

  [d7, d8, d9, d10].forEach((d) => d.window.close());
}

console.log('\nTHE TARGET MENU');
/**
 * Copy is a take-away action, not a tool: there is no arming, the way ⧉ has
 * none. Right-click a target and Report's rows open on core's menu surface;
 * Ctrl/⌘+C copies the hovered target's selector. The `pick` tool that
 * armoured this behind a button and a Ctrl+click is gone — and Ctrl+click
 * is a plain pin click again.
 */
{
  const d11 = new JSDOM(
    `<!doctype html><html><body><div id="q" class="card">hello</div><input id="f"></body></html>`,
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = d11.window;
  let picked = null;
  Object.defineProperty(w.navigator, 'clipboard',
    { value: { writeText: async (t) => { picked = t; } }, configurable: true });
  w.eval(source);
  const bar11 = w.document.getElementById('__debug-overlay-bar');
  const list11 = w.document.getElementById('__debug-overlay-list');
  const menu = () => w.document.getElementById('__debug-overlay-menu');
  const el = w.document.getElementById('q');
  w.document.elementFromPoint = () => el;
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));

  const chip = () => bar11.querySelector('[data-c]')
    .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  // the count chip is painted a frame later; the list is rebuilt synchronously
  const pins = () => { chip(); const n = list11.querySelectorAll('.debug-overlay-row').length; chip(); return n; };
  const rclick = (opt) => {
    const ev = new w.MouseEvent('contextmenu',
      { bubbles: true, cancelable: true, clientX: 8, clientY: 8, ...opt });
    el.dispatchEvent(ev);
    return ev;
  };

  rclick({});
  ok('right-click opens the target menu', menu().classList.contains('debug-overlay-open'),
    'no menu \u2014 the surface never opened');
  const labels = [...menu().querySelectorAll('button')].map((b) => b.textContent);
  ok('with the two copy rows', labels.join(' \u00b7 ') === 'Copy selector \u00b7 Copy text',
    labels.join(' \u00b7 ') || '(empty menu)');
  menu().querySelectorAll('button')[0]
    .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('Copy selector copies the selector', picked === '#q', JSON.stringify(picked));
  ok('and the menu closed on use', !menu().classList.contains('debug-overlay-open'), 'still open');
  ok('and no pin landed under any of it', pins() === 0, `${pins()} pins`);

  // Escape closes the menu FIRST — the newest top layer, never the pins
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  rclick({});
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Escape closes the menu and only the menu',
    !menu().classList.contains('debug-overlay-open') && pins() === 1,
    `menu ${menu().classList.contains('debug-overlay-open') ? 'open' : 'closed'}, ${pins()} pins`);

  // Alt is the same escape hatch it is for every click
  const evAlt = rclick({ altKey: true });
  ok("Alt+right-click stays the page's own menu",
    !menu().classList.contains('debug-overlay-open') && !evAlt.defaultPrevented,
    'the overlay took a gesture Alt reserves for the page');

  // powered OFF, right-click is nobody's business but the page's
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  const evOff = rclick({});
  ok('powered off, right-click is untouched',
    !menu().classList.contains('debug-overlay-open') && !evOff.defaultPrevented, 'not off enough');
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));

  // Ctrl/⌘+C copies the HOVERED target's selector — the universal key
  picked = null;
  el.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }));
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ctrlKey: true, code: 'KeyC', bubbles: true }));
  ok("Ctrl+C copies the hovered target's selector", picked === '#q', JSON.stringify(picked));

  // …but never inside a field: typing() keeps copy native there
  picked = null;
  w.document.getElementById('f').dispatchEvent(
    new w.KeyboardEvent('keydown', { ctrlKey: true, code: 'KeyC', bubbles: true }));
  ok('Ctrl+C inside a field stays native', picked === null, JSON.stringify(picked));

  // with pick gone, Ctrl+click is a plain pin click again
  picked = null;
  bar11.querySelector('[data-clear]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  el.dispatchEvent(new w.MouseEvent('click',
    { bubbles: true, clientX: 5, clientY: 5, ctrlKey: true }));
  ok('Ctrl+click pins \u2014 the gesture is free again',
    picked === null && pins() === 1, `copied ${JSON.stringify(picked)}, ${pins()} pins`);

  d11.window.close();
}

console.log('\nCATEGORIES');
/**
 * Roles are derived from hooks and settings declare what they change. The two
 * assertions that matter: a component fills ONE role unless it genuinely does
 * two things, and the ⚙ list is filed by what a setting changes rather than by
 * whichever tool happens to own it.
 */
{
  const dc = new JSDOM(
    `<!doctype html><html><body>
       <div id="one" style="width:40px;height:20px">one</div>
       <div id="two" style="width:40px;height:20px;margin-top:30px">two</div>
     </body></html>`,
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dc.window;
  w.eval(source);
  const bar = w.document.getElementById('__debug-overlay-bar');
  const list = w.document.getElementById('__debug-overlay-list');
  const hit = (sel) => bar.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));

  // ---- the ⚙ view, filed by what each setting changes ---------------------
  hit('[data-settings]');
  const heads = [...list.querySelectorAll('.debug-overlay-head')].map((h) => h.childNodes[0].textContent);
  // No Select heading since 'Pin grouping' retired (a technique is a gesture
  // now), and no Act heading since pick retired with its option (copy is a
  // take-away action, not a tool) — a heading with no settings under it would
  // be furniture. Each comes back the day something declares one.
  ok('the ⚙ view is grouped by what a setting changes',
    heads.join(' → ') === 'Inspect → Detect → Keys → Legend',
    heads.join(' → ') || '(no headings)');
  // the grid rows are not adjacent to each other because they own the tool —
  // they are adjacent because all three change what counts as a problem
  const under = (h) => {
    const out = [];
    let seen = false;
    for (const n of list.children) {
      if (n.classList.contains('debug-overlay-head')) { seen = n.childNodes[0].textContent === h; continue; }
      if (seen) out.push(n.querySelector('.debug-overlay-lbl').textContent);
    }
    return out;
  };
  // A set, not a sequence: order inside a category is derived now, and an
  // assertion on the sequence would fail the day a role is added without
  // anything true having changed.
  /* Was "Inspect prints no heading", which only held while nothing had an
     inspect setting — measure's field toggles fill that category now. The
     invariant underneath is what mattered: a heading over nothing is worse
     than no heading, so assert it of EVERY heading rather than of the one
     that happened to be empty. */
  const empties = heads.filter((h) => under(h).length === 0);
  ok('and no heading stands over an empty section', !empties.length, empties.join(', '));

  ok('settings from different owners share a category',
    under('Detect').slice().sort().join(', ')
      === 'Churn threshold, Freeze threshold, Grid step, Ignore above, Judge width & height, WCAG level',
    under('Detect').join(', '));

  // ---- roles, derived from hooks, plural only where that is true ----------
  const roleOf = (id) => bar.querySelector(`[data-tool="${id}"]`).title.split('\n')[1];
  ok('select fills one role', roleOf('select') === 'Select', roleOf('select'));
  ok('and measure fills one role', roleOf('measure') === 'Inspect', roleOf('measure'));
  ok('a tool that really does two things still says both',
    roleOf('grid').startsWith('Inspect · Detect'), roleOf('grid'));

  // ---- and the split holds at runtime -------------------------------------
  // Pairing moved to SELECT; measuring stayed with INSPECT. Disarming the
  // selection tool must take the grouping with it and leave the read-out.
  const shiftPin = (id) => {
    const el = w.document.getElementById(id);
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click',
      { bubbles: true, clientX: 5, clientY: 5, shiftKey: true }));
  };
  shiftPin('one'); shiftPin('two');
  hit('[data-c]');
  const pairRow = () => [...list.querySelectorAll('.debug-overlay-row')]
    .find((r) => /→/.test(r.querySelector('.debug-overlay-tag').textContent));
  ok('the selection tool groups the pins it owns', !!pairRow(),
    [...list.querySelectorAll('.debug-overlay-row .debug-overlay-tag')].map((t) => t.textContent).join(', '));
  hit('[data-tool="select"]');
  ok('and disarming it takes the grouping with it', !pairRow(),
    'the pairing outlived the tool that forms it');
  ok('while the pins themselves stay', list.querySelectorAll('.debug-overlay-row').length === 2,
    `${list.querySelectorAll('.debug-overlay-row').length} rows — selection is not the same as pinning`);
  dc.window.close();
}

console.log('\nREGRESSIONS');
/**
 * Three defects found on a real page and by review, each with the shape this
 * project keeps meeting: a rule that is confidently wrong, work done that
 * nobody asked for, and a silent reset on upgrade.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };

  // ---- the ceiling has two sides -----------------------------------------
  // `v <= max` bounded large positives only, so a page reported -1127px as a
  // spacing decision while ignoring +1127px. Both are layout arithmetic.
  const dn = new JSDOM(`<!doctype html><html><body>
      <div id="near" style="margin-left:-1px">a pixel someone typed</div>
      <div id="far" style="margin-left:-1127px">what layout worked out</div>
      <div id="pos" style="margin-left:1127px">the same, positive</div>
    </body></html>`, opts);
  const wn = dn.window;
  wn.eval(source);
  let copiedN = null;
  Object.defineProperty(wn.navigator, 'clipboard',
    { value: { writeText: async (t) => { copiedN = t; } }, configurable: true });
  const barN = wn.document.getElementById('__debug-overlay-bar');
  wn.dispatchEvent(new wn.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  barN.querySelector('[data-sweep]').dispatchEvent(new wn.MouseEvent('click', { bubbles: true }));
  barN.querySelector('[data-copy]').dispatchEvent(new wn.MouseEvent('click', { bubbles: true }));
  ok('a small negative is still judged', /-1px is off/.test(copiedN || ''),
    'someone types -1px; it is a spacing decision like any other');
  ok('a large negative is layout, not a decision', !/-1127px is off/.test(copiedN || ''),
    'the ceiling bounded the positive side only');
  ok('and the positive one stays ignored', !/\b1127px is off/.test(copiedN || ''),
    'this half always worked — it is the control for the two above');
  dn.window.close();

  // ---- the lazy rect stays lazy ------------------------------------------
  // U.info's `r` is a getter so a rule reading only styles never triggers
  // layout. Destructuring it in a parameter list evaluates it anyway.
  const rows = Array.from({ length: 40 }, (_, i) => `<p style="padding:8px">r${i}</p>`).join('');
  const dl = new JSDOM(`<!doctype html><html><body>${rows}</body></html>`, opts);
  const wl = dl.window;
  const realRect = wl.Element.prototype.getBoundingClientRect;
  let rects = 0;
  wl.Element.prototype.getBoundingClientRect = function () {
    rects++; return realRect.apply(this, arguments);
  };
  wl.eval(source);
  const barL = wl.document.getElementById('__debug-overlay-bar');
  wl.dispatchEvent(new wl.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  rects = 0;
  barL.querySelector('[data-sweep]').dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
  ok('a sweep does not force a layout read per element', rects < 10,
    `${rects} getBoundingClientRect calls over 40 elements — the getter is being evaluated eagerly`);
  dl.window.close();

  // ---- an upgrade does not reset anybody ---------------------------------
  // Moving `step` into the scale subject renamed the key it is stored under.
  const du = new JSDOM('<!doctype html><html><body><div id="x">x</div></body></html>', opts);
  du.window.localStorage.setItem('__debug_overlay_settings',
    '{"grid":{"step":8,"max":96,"boxes":false},"contrast":{"level":"AAA"}}');
  du.window.eval(source);
  const barU = du.window.document.getElementById('__debug-overlay-bar');
  du.window.dispatchEvent(new du.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  barU.querySelector('[data-settings]').dispatchEvent(new du.window.MouseEvent('click', { bubbles: true }));
  const valueOf = (label) => {
    const r = [...du.window.document.querySelectorAll('#__debug-overlay-list .debug-overlay-row')]
      .find((x) => x.querySelector('.debug-overlay-lbl').textContent === label);
    const c = r && r.querySelector('.debug-overlay-opt');
    return c ? (c.tagName === 'SELECT' ? c.selectedOptions[0].textContent : c.value) : null;
  };
  ok('a setting stored under an owner\'s former id is adopted',
    valueOf('Grid step') === '8px', String(valueOf('Grid step')));
  ok('and so is the one that moved with it',
    valueOf('WCAG level') === 'AAA', String(valueOf('WCAG level')));
  // (the tool-changed-owner case — select's `mode`, was measure's — retired
  //  with the 'Pin grouping' setting itself: a technique is a gesture now.
  //  The was: mechanism stays covered by the two subject adoptions above.)
  du.window.close();
}

console.log('\nREVIEW FIXES');
/**
 * Defects an adversarial review turned up at v3.8.38, each verified against a
 * running bundle before it was fixed and pinned here after.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const boot = (html, ls) => {
    const d = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, opts);
    if (ls) Object.entries(ls).forEach(([k, v]) => d.window.localStorage.setItem(k, v));
    d.window.eval(source);
    return d.window;
  };
  const swept = (w) => {
    const b = w.document.getElementById('__debug-overlay-bar');
    let out = null;
    Object.defineProperty(w.navigator, 'clipboard',
      { value: { writeText: async (t) => { out = t; } }, configurable: true });
    w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    b.querySelector('[data-sweep]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    b.querySelector('[data-copy]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return out || '';
  };

  // opacity: two visually identical renderings must not get opposite verdicts
  const wo = boot(`<div style="background:rgb(255,255,255)">
      <p id="alpha" style="color:rgba(0,0,0,.1)">alpha</p>
      <p id="op" style="color:rgb(0,0,0);opacity:.1">opacity</p></div>`);
  const ro = swept(wo);
  ok('CSS opacity reaches the contrast verdict', /contrast-aa ×2/.test(ro),
    (/## findings[^\n]*/.exec(ro) || ['no findings'])[0] +
    ' — faded text used to be reported 21:1 PASS');
  wo.close();

  // a first-truthy chain looked at one axis and called it the gap
  const wg = boot('<div style="display:flex;row-gap:12px;column-gap:13px">x</div>');
  ok('an off-grid column gap is seen past an on-grid row gap',
    /13px is off/.test(swept(wg)), 'the row gap won the || and the column gap was never tested');
  wg.close();

  // Math.round breaks ties toward +Infinity, so the sign decided the verdict
  const wr = boot('<div style="margin-left:2.5px">a</div><div style="margin-left:-2.5px">b</div>');
  const rr = swept(wr);
  ok('a half-pixel is judged by distance, not by sign',
    /3px is off/.test(rr) && /-3px is off/.test(rr), rr.match(/-?\dpx is off[^\n]*/g)?.join(' | '));
  wr.close();

  // two settings that silently cancelled: every real box is wider than 96px
  const wb = boot('<div id="w">x</div>', { __debug_overlay_settings: '{"scale":{"step":2,"max":96,"boxes":true}}' });
  wb.document.getElementById('w').getBoundingClientRect =
    () => ({ width: 301, height: 101, left: 0, top: 0, right: 301, bottom: 101 });
  ok('the spacing ceiling does not cancel "Judge width & height"',
    /301px is off/.test(swept(wb)), 'arming the toggle produced nothing at the default ceiling');
  wb.close();

  // the popover renders by index and hands the index back
  const wp = boot('<div id="a">A</div><div id="b">B</div><div id="c">C</div>');
  const barP = wp.document.getElementById('__debug-overlay-bar');
  const listP = wp.document.getElementById('__debug-overlay-list');
  wp.dispatchEvent(new wp.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  for (const id of ['a', 'b', 'c']) {
    const el = wp.document.getElementById(id);
    wp.document.elementFromPoint = () => el;
    el.dispatchEvent(new wp.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  }
  barP.querySelector('[data-c]').dispatchEvent(new wp.MouseEvent('click', { bubbles: true }));
  wp.document.getElementById('b').remove();
  wp.dispatchEvent(new wp.MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }));

  // Escape belongs to whatever has focus
  const we = boot('<div id="a">A</div><div id="b">B</div>');
  const barE = we.document.getElementById('__debug-overlay-bar');
  const listE = we.document.getElementById('__debug-overlay-list');
  we.dispatchEvent(new we.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  for (const id of ['a', 'b']) {
    const el = we.document.getElementById(id);
    we.document.elementFromPoint = () => el;
    el.dispatchEvent(new we.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  }
  barE.querySelector('[data-settings]').dispatchEvent(new we.MouseEvent('click', { bubbles: true }));
  const numE = [...listE.querySelectorAll('.debug-overlay-row')]
    .find((r) => r.querySelector('input[type=number]')).querySelector('input');
  numE.dispatchEvent(new we.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  barE.querySelector('[data-c]').dispatchEvent(new we.MouseEvent('click', { bubbles: true }));
  ok('Escape in a panel field abandons the edit, not the pins',
    listE.querySelectorAll('.debug-overlay-row').length === 2,
    `${listE.querySelectorAll('.debug-overlay-row').length} pins left`);
  we.close();

  // a capability shipped after the user last chose must still appear
  const wn2 = boot('<div id="a">A</div>', {
    __debug_overlay_tools: '["measure","select"]',
    __debug_overlay_seen: '["measure","select","contrast","dupid","pick"]',
  });
  const armedN = [...wn2.document.querySelectorAll('#__debug-overlay-bar button.debug-overlay-tool.debug-overlay-armed')]
    .map((b) => b.dataset.tool);
  ok('a tool this install has never met gets its own default',
    armedN.includes('grid'), armedN.join(', ') || '(none)');
  ok('and one it has met keeps what the user decided',
    !armedN.includes('dupid'), armedN.join(', '));
  wn2.close();

  // settings this build cannot name must survive somebody changing another one
  const wk = boot('<div id="a">A</div>',
    { __debug_overlay_settings: '{"scale":{"step":8},"ghost":{"threshold":42}}' });
  const barK = wk.document.getElementById('__debug-overlay-bar');
  wk.dispatchEvent(new wk.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  barK.querySelector('[data-settings]').dispatchEvent(new wk.MouseEvent('click', { bubbles: true }));
  const selK = [...wk.document.querySelectorAll('#__debug-overlay-list .debug-overlay-row')]
    .find((r) => r.querySelector('.debug-overlay-lbl').textContent === 'WCAG level').querySelector('select');
  selK.selectedIndex = 1; selK.dispatchEvent(new wk.Event('change'));
  ok('a setting whose owner this build does not know is not destroyed',
    /"ghost"/.test(wk.localStorage.getItem('__debug_overlay_settings') || ''),
    wk.localStorage.getItem('__debug_overlay_settings'));
  wk.close();

  // Deliberately NOT its own timer. The summary below prints and exits on a
  // timer of its own, so a second one racing it decides the exit code by luck —
  // which is the same "green by accident" this suite has already been caught
  // by once. It runs inside that block instead, before the count is read.
  pendingChecks.push(() => {
    const tags = [...listP.querySelectorAll('.debug-overlay-row .debug-overlay-tag')].map((t) => t.textContent);
    const rows = [...listP.querySelectorAll('.debug-overlay-row')];
    const target = tags[tags.length - 1];
    rows[rows.length - 1].querySelector('.debug-overlay-rm')
      .dispatchEvent(new wp.MouseEvent('click', { bubbles: true }));
    const left = [...listP.querySelectorAll('.debug-overlay-row .debug-overlay-tag')].map((t) => t.textContent);
    ok('the list drops rows whose element left the page',
      tags.join(' ') === '#1 #3', tags.join(' '));
    ok('so ✕ removes the pin that was clicked', !left.includes(target),
      `clicked ${target}, left ${left.join(' ')}`);
    wp.close();
  });
}

console.log('\nSTANDS ALONE');
/**
 * Every tool must be worth arming by itself. Measured, not assumed: armed
 * alone, grid used to produce zero badges and zero ⚠ because `annotate` only
 * decorates what OTHER tools print, and dupid changed nothing at all because
 * findings reach the ⌕ list whether a rule is armed or not. Correct, silent
 * and indistinguishable from broken.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const ALL = JSON.stringify(idsOnDisk);
  const only = (armed, html) => {
    const d = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, opts);
    d.window.localStorage.setItem('__debug_overlay_tools', JSON.stringify(armed));
    d.window.localStorage.setItem('__debug_overlay_seen', ALL);   // nothing counts as new
    d.window.eval(source);
    d.window.dispatchEvent(new d.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    return d.window;
  };
  const pinIt = (w, id, mods = {}) => {
    const el = w.document.getElementById(id);
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5, ...mods }));
  };

  // grid, with nothing else to lean on
  const wg = only(['grid'], '<div id="a" style="padding:7px">alpha</div>');
  pinIt(wg, 'a');
  pendingChecks.push(() => {
    const root = wg.document.getElementById('__debug-overlay-root');
    ok('grid says something with no other tool armed',
      /⚠/.test(root.innerHTML) && root.querySelectorAll('.debug-overlay-badge').length > 0,
      `${root.querySelectorAll('.debug-overlay-badge').length} badges, ⚠ ${/⚠/.test(root.innerHTML)}`);
    wg.close();
  });

  // dupid, whose findings reach the list either way — arming it must still do something
  const wd = only(['dupid'], '<p id="dup">one</p><p id="dup">two</p>');
  wd.document.getElementById('__debug-overlay-bar').querySelector('[data-sweep]')
    .dispatchEvent(new wd.MouseEvent('click', { bubbles: true }));
  pendingChecks.push(() => {
    ok('arming a rule changes something on screen',
      wd.document.querySelectorAll('#__debug-overlay-root .debug-overlay-flag').length > 0,
      'a toggle that paints nothing is worse than no toggle');
    wd.close();
  });

  // a shift-click with nothing to group it must not promise a measurement
  const wn = only(['measure', 'pin'], '<div id="a">a</div><div id="b">b</div>');
  pinIt(wn, 'a', { shiftKey: true });
  pinIt(wn, 'b', { shiftKey: true });
  let copiedN = null;
  Object.defineProperty(wn.navigator, 'clipboard',
    { value: { writeText: async (t) => { copiedN = t; } }, configurable: true });
  wn.document.getElementById('__debug-overlay-bar').querySelector('[data-copy]')
    .dispatchEvent(new wn.MouseEvent('click', { bubbles: true }));
  ok('no grouping armed, so a shift-click is simply a pin',
    !/\(pair\)/.test(copiedN || '') && /\(note\)/.test(copiedN || ''),
    (copiedN || '').match(/\((note|pair)\)/g)?.join(' ') || 'no pins');
  wn.close();

  // and with a grouping armed it means what it always meant
  const wy = only(['measure', 'select', 'pin'], '<div id="a">a</div><div id="b">b</div>');
  pinIt(wy, 'a', { shiftKey: true });
  pinIt(wy, 'b', { shiftKey: true });
  let copiedY = null;
  Object.defineProperty(wy.navigator, 'clipboard',
    { value: { writeText: async (t) => { copiedY = t; } }, configurable: true });
  wy.document.getElementById('__debug-overlay-bar').querySelector('[data-copy]')
    .dispatchEvent(new wy.MouseEvent('click', { bubbles: true }));
  ok('with a grouping armed, a shift-click still joins one',
    /\(pair\)/.test(copiedY || ''),
    (copiedY || '').match(/\((note|pair)\)/g)?.join(' ') || 'no pins');
  wy.close();
}

console.log('\nPANEL AUDIT FIXES');
/**
 * Four defects a live audit of the panel found, each reproduced before the fix.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const boot = (html, ls) => {
    const d = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, opts);
    if (ls) Object.entries(ls).forEach(([k, v]) => d.window.localStorage.setItem(k, v));
    d.window.eval(source);
    d.window.dispatchEvent(new d.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    return d.window;
  };

  // 1. the popover must never sit under the bar, which paints and hit-tests
  //    above it and would eat clicks meant for the rows
  const wl = boot('<div id="a">a</div>');
  const barL = wl.document.getElementById('__debug-overlay-bar');
  const listL = wl.document.getElementById('__debug-overlay-list');
  barL.getBoundingClientRect = () => ({ left: 620, top: 8, right: 672, bottom: 604,
                                        width: 52, height: 596 });
  Object.defineProperty(listL, 'offsetWidth', { value: 460, configurable: true });
  Object.defineProperty(listL, 'offsetHeight', { value: 255, configurable: true });
  const overlapsBar = () => {
    const x = parseFloat(listL.style.left), y = parseFloat(listL.style.top);
    const b = barL.getBoundingClientRect();
    return !(x + 460 <= b.left || x >= b.right || y + 255 <= b.top || y >= b.bottom);
  };
  const misses = [];
  for (const side of ['right', 'left', 'top', 'bottom']) {
    wl.__side = side;
    barL.querySelector('[data-settings]').dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
    barL.querySelector('[data-settings]').dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
    barL.querySelector('[data-settings]').dispatchEvent(new wl.MouseEvent('click', { bubbles: true }));
    if (overlapsBar()) misses.push(`${side} @ ${listL.style.left},${listL.style.top}`);
  }
  ok('the popover never lands under the bar', !misses.length, misses.join(' | '));
  wl.close();

  // 2. an audit on the page must be visible in the bar and removable from it
  const wa = boot('<p style="color:#bbb">faint</p>', { __debug_overlay_tools: '["contrast"]' });
  const barA = wa.document.getElementById('__debug-overlay-bar');
  barA.querySelector('[data-sweep]').dispatchEvent(new wa.MouseEvent('click', { bubbles: true }));
  ok('the bar says an audit is showing',
    barA.querySelector('[data-sweep]').classList.contains('debug-overlay-swept'),
    'the ⌕ flash expires, so the marks outlived any sign of them');
  ok('the bar carries a resting problem count',
    /^\d+$/.test(barA.querySelector('[data-sweep]').textContent) &&
    /distinct problem/.test(barA.querySelector('[data-sweep]').title),
    `${barA.querySelector('[data-sweep]').textContent} — ${barA.querySelector('[data-sweep]').title}`);
  barA.querySelector('[data-clear]').dispatchEvent(new wa.MouseEvent('click', { bubbles: true }));
  ok('and ✕ is the way out of it',
    !barA.querySelector('[data-sweep]').classList.contains('debug-overlay-swept'),
    'clearing pins used to leave the outlines with no control at all');
  wa.close();

  // 3. a cap nobody is told about reads as "this is everything"
  const many = Array.from({ length: 420 }, () => '<p style="color:#bbb;padding:7px">x</p>').join('');
  const wc = boot(many, { __debug_overlay_tools: '["contrast"]' });
  // a Promise created during the sweep is the yield; nothing else in the pass
  // makes one, so its existence IS the evidence that slicing engaged
  let sliced = false;
  const RealPromise = wc.Promise;
  wc.Promise = new Proxy(RealPromise, {
    construct(T, args) { sliced = true; return new T(...args); },
  });
  const barC = wc.document.getElementById('__debug-overlay-bar');
  const listC = wc.document.getElementById('__debug-overlay-list');
  let copiedC = null;
  Object.defineProperty(wc.navigator, 'clipboard',
    { value: { writeText: async (t) => { copiedC = t; } }, configurable: true });
  /* THE ONLY PAGE IN THIS SUITE BIG ENOUGH TO BE SLICED, which is why it is
     the only one that has to wait. 420 elements crosses the sweep's yield
     threshold, so run() hands back a promise and the result lands a turn
     later — exactly the behaviour that keeps a 15 000-element page from
     freezing, observed here because the fixture is finally large enough to
     trigger it. Everything smaller finishes inside one slice and stays
     synchronous, which is why no other sweep site in this file changed. */
  barC.querySelector('[data-sweep]').dispatchEvent(new wc.MouseEvent('click', { bubbles: true }));
  whenPainted(() => barC.querySelector('[data-sweep]').classList.contains('debug-overlay-swept'), () => {
    barC.querySelector('[data-copy]').dispatchEvent(new wc.MouseEvent('click', { bubbles: true }));
    ok('the findings list says the page could not show them all',
      /marks the first 200 findings/.test((listC.querySelector('.debug-overlay-head') || {}).textContent || ''),
      (listC.querySelector('.debug-overlay-head') || {}).textContent || '(no heading)');
    ok('and so does the copied report',
      /marks from the first 200 findings per rule/.test(copiedC || ''),
      (/## findings[^\n]*/.exec(copiedC || '') || ['none'])[0]);
    /* …and the slice actually happened. Without this the two assertions above
       would still pass on a build that never yields — they would simply have
       run synchronously and nobody would know the difference. */
    ok('and a page that large was swept in slices, not one blocking task',
      sliced === true, 'run() returned a result directly — the pass never yielded');
    wc.close();
    capChecked = true;
  });

  // 4. Escape closes the top layer, never the session
  const we = boot('<p style="color:#bbb">faint</p>');
  const barE = we.document.getElementById('__debug-overlay-bar');
  const listE = we.document.getElementById('__debug-overlay-list');
  const esc = () => we.document.body
    .dispatchEvent(new we.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  barE.querySelector('[data-sweep]').dispatchEvent(new we.MouseEvent('click', { bubbles: true }));
  esc();
  // From the ⚙ BUTTON, which is where focus lands when you open the panel with
  // the mouse. A `!root.contains(e.target)` guard used to swallow exactly this.
  barE.querySelector('[data-settings]').dispatchEvent(new we.MouseEvent('click', { bubbles: true }));
  barE.querySelector('[data-settings]')
    .dispatchEvent(new we.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Escape closes a panel opened with the mouse', !listE.classList.contains('debug-overlay-open'),
    'focus sits on the button that opened it, inside the overlay root');
  barE.querySelector('[data-sweep]').dispatchEvent(new we.MouseEvent('click', { bubbles: true }));
  esc();
  ok('Escape closes the open panel', !listE.classList.contains('debug-overlay-open') && barE.classList.contains('debug-overlay-on'),
    `list ${listE.classList.contains('debug-overlay-open') ? 'open' : 'closed'}, power ${barE.classList.contains('debug-overlay-on') ? 'ON' : 'OFF'}`);
  esc(); esc();
  ok('and never powers the tool off', barE.classList.contains('debug-overlay-on'),
    'Escape used to end the session whenever nothing was pinned');
  we.close();
}

console.log('\nPIN NUMBERS');
/**
 * A pin's number is stable while it exists — removing #2 must not renumber #3,
 * or a screenshot stops matching the report beside it. But the counter only
 * ever climbed, so pin/unpin/pin left "#9" sitting beside a count chip reading
 * 1: a number that referred to nothing and could not be read off a screenshot.
 */
{
  const d = new JSDOM('<!doctype html><html><body>' +
    ['a', 'b', 'c', 'd'].map((i) => `<div id="${i}">${i}</div>`).join('') + '</body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = d.window;
  w.eval(source);
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  const bar = w.document.getElementById('__debug-overlay-bar');
  const list = w.document.getElementById('__debug-overlay-list');
  const hit = (id) => {
    const el = w.document.getElementById(id);
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  };
  const tags = () => {
    bar.querySelector('[data-c]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const t = [...list.querySelectorAll('.debug-overlay-row .debug-overlay-tag')].map((x) => x.textContent).join(' ');
    bar.querySelector('[data-c]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return t || '(none)';
  };

  hit('a'); hit('a');            // pin then unpin — nothing is pinned now
  hit('a');
  ok('numbering restarts once nothing is pinned', tags() === '#1', tags());

  hit('b');
  ok('and a second pin follows it', tags() === '#1 #2', tags());
  hit('a');
  ok('while removing one does NOT renumber the other', tags() === '#2', tags());

  /* The case that resetting-at-empty did not cover, and the one actually seen
     on a real page: with pins still there, unpin and re-pin and the number kept
     climbing — four pins reading #1 #2 #6 #9. A new pin takes the smallest
     number not in use, so the set stays dense however you got there. */
  hit('a');
  ok('a freed number is reused, not skipped', tags() === '#1 #2', tags());
  hit('c'); hit('d');
  ok('and the set stays dense as it grows', tags() === '#1 #2 #3 #4', tags());
  hit('c');                       // frees #3 from the middle
  ok('removing from the middle leaves the others alone', tags() === '#1 #2 #4', tags());
  hit('c');
  ok('and the next pin fills that gap', tags() === '#1 #2 #3 #4', tags());
  ['a', 'b', 'c', 'd'].forEach(hit);   // empty again
  ok('unpinning the last one empties it', tags() === '(none)', tags());
  hit('a');
  ok('and numbering starts from 1 again', tags() === '#1', tags());

  // and via ✕ clear, which always reset, plus the row ✕, which did not
  hit('b');
  bar.querySelector('[data-c]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  // one at a time, re-querying: the list re-renders after each removal, so a
  // cached NodeList holds nodes that are no longer in the document
  for (let guard = 0; guard < 20; guard++) {
    const rm = list.querySelector('.debug-overlay-row .debug-overlay-rm');
    if (!rm) break;
    rm.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  }
  bar.querySelector('[data-c]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  hit('a');
  ok('including emptying it from the pin list', tags() === '#1', tags());
  w.close();
}

console.log('\nPER-TOOL OPTIONS');
/**
 * Two doors, one room. ⚙ shows every setting grouped by what it changes;
 * right-clicking a tool shows that tool's subset. The second is a FILTER of
 * the first — same options() call — so they cannot drift apart.
 */
{
  const d = new JSDOM('<!doctype html><html><body>' +
    // longhands, because jsdom does not expand the border-radius shorthand, and
    // a stubbed rect, because it has no layout at all
    '<div id="a" style="padding:6px 8px;border-top-left-radius:9px;' +
    'border-top-right-radius:9px;border-bottom-right-radius:9px;' +
    'border-bottom-left-radius:9px">a</div>' +
    '</body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = d.window;
  w.eval(source);
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  const bar = w.document.getElementById('__debug-overlay-bar');
  const list = w.document.getElementById('__debug-overlay-list');
  const labels = () => [...list.querySelectorAll('.debug-overlay-row .debug-overlay-lbl')].map((x) => x.textContent);

  bar.querySelector('[data-tool="measure"]')
    .dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const mine = labels();
  ok('right-clicking a tool opens its own options', mine.length > 0 && list.classList.contains('debug-overlay-open'),
    `${mine.length} rows`);
  ok('and shows only that tool\'s',
    mine.includes('Radius') && !mine.includes('Grid step') && !mine.includes('WCAG level'),
    mine.join(', '));
  ok('the menu keeps ⚙\'s grouping — it is a filter, not a rebuild',
    [...list.querySelectorAll('.debug-overlay-head')].some((h) => /Inspect/.test(h.textContent)),
    'the per-tool door used to flatten the rows and invert the category order');
  ok('a family tool announces its family, zero pixels spent',
    /^Colour › Contrast/.test(w.document.querySelector('#__debug-overlay-bar [data-tool="contrast"]')?.title || '') &&
    /^Grid —/.test(w.document.querySelector('#__debug-overlay-bar [data-tool="grid"]')?.title || ''),
    'family in the tooltip; a tool without a domain folder stays plain');
  ok('the family mark is its own, not a member tool\'s',
    (() => { bar.querySelector('[data-settings]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const r = [...list.querySelectorAll('.debug-overlay-row')].find((x) => x.querySelector('.debug-overlay-lbl').textContent === 'WCAG level');
      // icons are inline SVGs now — compare markup against the family
      // subject's own declared icon, taken from the fam-btn that wears it
      const tag = r && r.querySelector('.debug-overlay-tag').innerHTML;
      const mark = bar.querySelector('.debug-overlay-fam[data-fam="colour"] .debug-overlay-fam-btn').innerHTML;
      bar.querySelector('[data-tool="measure"]').dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      return !!tag && tag === mark; })(),
    'the WCAG level row wore a member\'s icon — the subject looked like one of its tools');
  ok('titled with the tool, not with "Settings"',
    /Measure/.test((list.querySelector('.debug-overlay-viewhead') || {}).textContent || ''),
    (list.querySelector('.debug-overlay-viewhead') || {}).textContent || '(none)');

  // the same rows are still in ⚙, because one is a filter of the other
  bar.querySelector('[data-settings]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const all = labels();
  ok('the same rows are still in ⚙', mine.every((l) => all.includes(l)),
    mine.filter((l) => !all.includes(l)).join(', ') || 'all present');

  /* A tool whose settings live on a SUBJECT must still show them. "Grid step"
     is grid's setting to anyone using it; that scale owns it so the lens and
     the rule cannot disagree is internal, and right-clicking ▦ to be told
     "nothing to configure" was the panel lying about its most configurable
     tool. */
  bar.querySelector('[data-tool="grid"]')
    .dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const gridRows = labels();
  ok('a tool surfaces the subject settings it consults',
    gridRows.includes('Grid step') && gridRows.includes('Ignore above'),
    gridRows.join(', ') || (list.querySelector('.debug-overlay-empty') || {}).textContent);
  ok('and still not another tool\'s', !gridRows.includes('WCAG level'),
    gridRows.join(', '));
  ok('while the tooltip only offers it where there is something',
    /right-click/.test(bar.querySelector('[data-tool="grid"]').title) &&
    !/right-click/.test(bar.querySelector('[data-tool="dupid"]').title),
    'dupid genuinely has nothing, and must not advertise an empty menu');

  // and the toggle governs the badge
  const el = w.document.getElementById('a');
  el.getBoundingClientRect = () => ({ left: 10, top: 10, right: 50, bottom: 30,
                                      width: 40, height: 20 });
  w.document.elementFromPoint = () => el;
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  bar.querySelector('[data-tool="measure"]')
    .dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const radiusRow = [...list.querySelectorAll('.debug-overlay-row')]
    .find((r) => r.querySelector('.debug-overlay-lbl').textContent === 'Radius');
  const tick = radiusRow.querySelector('input[type=checkbox]');
  tick.checked = false;
  tick.dispatchEvent(new w.Event('change'));
  pendingChecks.push(() => {
    const badge = w.document.querySelector('#__debug-overlay-root .debug-overlay-badge');
    ok('turning a field off takes it off the badge',
      !!badge && !/\br 9\b/.test(badge.textContent),
      badge ? badge.textContent : '(no badge)');
    ok('and leaves the rest of the badge alone',
      !!badge && /40×20/.test(badge.textContent),
      badge ? badge.textContent : '(no badge)');
    w.close();
  });
}

console.log('\nEVERY RULE SHOWS WHERE');
/**
 * Three rules, and only two of them marked their findings: grid produced
 * thousands and drew nothing, so the list was full and the page blank. And
 * dupid knew the element under the cursor had a duplicated id but only ever
 * said so in the copied report.
 */
{
  const d = new JSDOM('<!doctype html><html><body>' +
    '<p id="dup" style="padding:7px">one</p><p id="dup">two</p></body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = d.window;
  w.localStorage.setItem('__debug_overlay_tools', '["grid","dupid","measure"]');
  w.localStorage.setItem('__debug_overlay_seen', JSON.stringify(idsOnDisk));
  w.eval(source);
  const bar = w.document.getElementById('__debug-overlay-bar');
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  const el = w.document.getElementById('dup');
  w.document.elementFromPoint = () => el;
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  // full badges via the 🏷 flyout — two levels: open the View axis, then its
  // member, each found by title so a new control cannot silently retarget this
  [...bar.querySelectorAll('[data-badge-fly] button')].find((b) => /^View/.test(b.title))
    .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  [...bar.querySelectorAll('[data-badge-fly] button')].find((b) => /full/.test(b.title))
    .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  bar.querySelector('[data-sweep]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  pendingChecks.push(() => {
    const root = w.document.getElementById('__debug-overlay-root');
    const badge = (root.querySelector('.debug-overlay-badge') || {}).textContent || '';
    ok('dupid says so on the badge, not only in the report', /id ×2/.test(badge), badge);
    ok('grid marks where its findings are',
      root.querySelectorAll('.debug-overlay-flag').length > 0,
      'a finding you cannot locate is half a finding');
    w.close();
  });
}

console.log('\nBADGE FACETS');
/**
 * The badge's three kinds of content: CURRENT (the component's fields), ISSUE
 * (the lens's ⚠), RECOMMENDATION (the fix — off by default, because a
 * suggestion doubles every marked number). ⚠ and →8 both come from the Scale
 * subject, so they cannot disagree about one number.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const facet = (settings, done) => {
    const d = new JSDOM('<!doctype html><html><body>' +
      '<div id="a" style="padding:7px">seven</div></body></html>', opts);
    const w = d.window;
    w.localStorage.setItem('__debug_overlay_tools', '["measure","grid"]');
    w.localStorage.setItem('__debug_overlay_seen', JSON.stringify(idsOnDisk));
    if (settings) w.localStorage.setItem('__debug_overlay_settings', JSON.stringify(settings));
    w.eval(source);
    w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    const el = w.document.getElementById('a');
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
    pendingChecks.push(() => {
      const b = w.document.querySelector('#__debug-overlay-root .debug-overlay-badge');
      done((b || {}).textContent || '(no badge)');
      w.close();
    });
  };
  facet(null, (text) => {
    ok('the ISSUE facet is on by default', /7⚠/.test(text), text);
    ok('and the RECOMMENDATION facet is not', !/→/.test(text),
      text + ' — a suggestion has to be asked for');
  });
  // Seeded under GRID's id on purpose: `suggest` moved to the badge face
  // with `was: 'grid'`, so this passing is the migration itself — an install
  // that chose the suggestion under the old owner keeps it under the new.
  facet({ grid: { suggest: true } }, (text) => {
    ok('asked for, the fix appears after the mark', /7⚠→8/.test(text),
      text + ' — Scale.nearest(7) on a 2px step is 8, half away from zero');
  });
  // the same value under the new owner works directly, of course
  facet({ badge: { suggest: true } }, (text) => {
    ok('and the badge face owns it now', /7⚠→8/.test(text), text);
  });
  // The ISSUE gate strips LENS ink from badges — the ⚠ after a number.
  // grid's own '⚠4' summary field stays: that is its CURRENT facet, and
  // arming grid is the control for it, not this toggle.
  facet({ badge: { issues: false } }, (text) => {
    ok('issues off: no number wears a lens mark', /p 7(?!⚠)/.test(text) && !/7⚠/.test(text), text);
  });
  {
    const d = new JSDOM('<!doctype html><html><body>' +
      '<div id="a" style="padding:7px">seven</div></body></html>', opts);
    const w = d.window;
    w.localStorage.setItem('__debug_overlay_tools', '["measure","grid","pin"]');
    w.localStorage.setItem('__debug_overlay_seen', JSON.stringify(idsOnDisk));
    w.localStorage.setItem('__debug_overlay_settings', '{"badge":{"issues":false}}');
    w.eval(source);
    w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    const el = w.document.getElementById('a');
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
    let rep = null;
    Object.defineProperty(w.navigator, 'clipboard',
      { value: { writeText: async (t) => { rep = t; } }, configurable: true });
    w.document.getElementById('__debug-overlay-bar').querySelector('[data-copy]')
      .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('…but the report still carries the ⚠ — facets gate badge ink only',
      /⚠ off 2px grid/.test(rep || ''), (rep || '').split('\n').find((l) => /⚠/.test(l)) || 'no ⚠ anywhere');
    w.close();
  }
  // the VIEW is a value in the one settings store — ≡ used to forget on reload
  {
    const d = new JSDOM('<!doctype html><html><body><div id="a">a</div></body></html>', opts);
    const w = d.window;
    w.eval(source);
    w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    const fly = (win) => [...win.document.querySelectorAll('[data-badge-fly] button')];
    const openAxis = (win, re) => fly(win).find((b) => re.test(b.title))
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    // two levels: at rest the flyout is the two AXES and nothing else
    ok('🏷 opens to two axes, not a soup of members',
      fly(w).length === 2 && /^View/.test(fly(w)[0].title) && /^Facets/.test(fly(w)[1].title),
      fly(w).map((b) => b.title.split(' — ')[0]).join(', '));
    openAxis(w, /^View/);
    fly(w).find((b) => /full/.test(b.title))
      .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const blob = w.localStorage.getItem('__debug_overlay_settings') || '';
    ok('choosing a badge view writes the store', /"view":"full"/.test(blob), blob);
    // the Facets axis: CURRENT is listed, armed, and not a control
    openAxis(w, /^Facets/);
    const cur = fly(w).find((b) => /^Current/.test(b.title));
    ok('Facets lists Current — armed, fixed, information not a control',
      !!cur && cur.classList.contains('debug-overlay-armed') && cur.getAttribute('aria-disabled') === 'true',
      fly(w).map((b) => b.title.split(' — ')[0]).join(', '));
    // a second boot over the same store wakes up already in that view
    const d2 = new JSDOM('<!doctype html><html><body><div id="a">a</div></body></html>', opts);
    const w2 = d2.window;
    w2.localStorage.setItem('__debug_overlay_settings', blob);
    w2.eval(source);
    openAxis(w2, /^View/);
    ok('and a reload remembers it',
      fly(w2).find((b) => /full/.test(b.title))?.classList.contains('debug-overlay-armed'),
      fly(w2).map((b) => `${b.textContent}${b.classList.contains('debug-overlay-armed') ? '*' : ''}`).join(' '));
    w.close(); w2.close();
  }
}

console.log('\nSELECTION CHOOSES, PIN KEEPS');
/**
 * Pinning used to be welded to the click: choosing an element and keeping it
 * were one gesture. 📌 pin is the keeper now — armed (its shipped default),
 * clicks pin exactly as they always did; off, a click SELECTS: one outline,
 * one badge, no number, replaced by the next click. These are the off-state's
 * guarantees, none of which the compare gate can see (it runs with pin armed).
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const boot = (armed, seen, html) => {
    const d = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, opts);
    d.window.localStorage.setItem('__debug_overlay_tools', JSON.stringify(armed));
    d.window.localStorage.setItem('__debug_overlay_seen', JSON.stringify(seen));
    d.window.eval(source);
    d.window.dispatchEvent(new d.window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    return d.window;
  };
  const clickOn = (w, id, mods = {}) => {
    const el = w.document.getElementById(id);
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5, ...mods }));
  };
  const copyText = (w) => {
    let out = null;
    Object.defineProperty(w.navigator, 'clipboard',
      { value: { writeText: async (t) => { out = t; } }, configurable: true });
    w.document.getElementById('__debug-overlay-bar').querySelector('[data-copy]')
      .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return out;
  };

  // 1) pin off: clicks select and REPLACE — the report labels, never numbers
  const w1 = boot(['measure'], idsOnDisk, '<div id="a">a</div><div id="b">b</div>');
  clickOn(w1, 'a');
  clickOn(w1, 'b');
  const rep1 = copyText(w1) || '';
  ok('with no keeper armed, a click is a SELECTION — labelled, not numbered',
    /\[selected\] #b/.test(rep1) && !/\[#\d/.test(rep1),
    rep1.split('\n').find((l) => l.startsWith('[')) || 'no selection block');
  ok('and the next selection replaced the last — #a let go',
    !/\[selected\] #a/.test(rep1), 'both #a and #b reported');
  // one home for pin things: the count chip sits right after the keeper's
  // button, wherever that tool is — attached by capability, not by id
  ok('the pin count chip lives with the keeper',
    w1.document.querySelector('#__debug-overlay-bar [data-c]')
      .previousElementSibling?.dataset.tool === 'pin',
    'chip follows: ' + (w1.document.querySelector('#__debug-overlay-bar [data-c]')
      .previousElementSibling?.dataset.tool || 'nothing'));
  pendingChecks.push(() => {
    ok('on the page: one outline and NO number chip',
      w1.document.querySelectorAll('#__debug-overlay-root .debug-overlay-pinbox').length === 1 &&
      w1.document.querySelectorAll('#__debug-overlay-root .debug-overlay-pin-num').length === 0,
      `${w1.document.querySelectorAll('#__debug-overlay-root .debug-overlay-pinbox').length} boxes, ` +
      `${w1.document.querySelectorAll('#__debug-overlay-root .debug-overlay-pin-num').length} chips`);
    w1.close();
  });

  // 2) a modifier must not smuggle persistence past a disarmed keeper
  const w2 = boot(['measure', 'select'], idsOnDisk, '<div id="a">a</div>');
  clickOn(w2, 'a', { shiftKey: true });
  const rep2 = copyText(w2) || '';
  ok('shift+click with no keeper falls back to a bare selection',
    /\[selected\]/.test(rep2) && !/\((pair|note)\)/.test(rep2),
    rep2.split('\n').find((l) => l.startsWith('[')) || 'nothing reported');
  w2.close();

  // 3) switching the keeper OFF must not take kept pins away
  const w3 = boot(['measure', 'select', 'pin'], idsOnDisk,
    '<div id="a">a</div><div id="b">b</div><div id="c">c</div>');
  clickOn(w3, 'a', { shiftKey: true });
  clickOn(w3, 'b', { shiftKey: true });
  w3.document.getElementById('__debug-overlay-bar').querySelector('[data-tool="pin"]')
    .dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  clickOn(w3, 'c');   // pin is off now: c is selected, never kept
  pendingChecks.push(() => {
    const bar3 = w3.document.getElementById('__debug-overlay-bar');
    ok('disarming pin keeps existing pins — off stops NEW keeping only',
      bar3.querySelector('[data-c]').textContent === '2',
      'pin count ' + bar3.querySelector('[data-c]').textContent);
    w3.close();
  });

  // 4) Escape releases the selection the way it clears pins
  const w4 = boot(['measure'], idsOnDisk, '<div id="a">a</div>');
  clickOn(w4, 'a');
  w4.dispatchEvent(new w4.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const rep4 = copyText(w4) || '';
  ok('Escape releases a bare selection',
    !/\[selected\]/.test(rep4), 'selection survived Escape');
  w4.close();

  // 5) an install from before 📌 meets it for the first time
  const w5 = boot(['measure'], idsOnDisk.filter((id) => id !== 'pin'),
    '<div id="a">a</div>');
  clickOn(w5, 'a');
  const rep5 = copyText(w5) || '';
  ok('an existing install still pins by default — SEEN gave startsOn its say',
    /\[#1\] \(note\)/.test(rep5),
    rep5.split('\n').find((l) => l.startsWith('[')) || 'nothing reported');
  w5.close();

  // 5b) the pin list's header ✕ clears ALL pins and ONLY pins — the bar's ✕
  // is the page-wide broom (pins AND audit marks); this is pin's own, so an
  // audit on screen survives dropping the pins that anchored your reading
  const w5b = boot(['measure', 'grid', 'pin'], idsOnDisk,
    '<div id="a" style="padding:7px">a</div><div id="b">b</div>');
  const bar5b = w5b.document.getElementById('__debug-overlay-bar');
  bar5b.querySelector('[data-sweep]').dispatchEvent(new w5b.MouseEvent('click', { bubbles: true }));
  clickOn(w5b, 'a');
  clickOn(w5b, 'b');
  bar5b.querySelector('[data-c]').dispatchEvent(new w5b.MouseEvent('click', { bubbles: true }));
  const head5b = w5b.document.querySelector('#__debug-overlay-list .debug-overlay-viewhead .debug-overlay-rm');
  ok('the pin list header carries its own clear-all', !!head5b,
    'no ✕ on the Pins header');
  head5b.dispatchEvent(new w5b.MouseEvent('click', { bubbles: true }));
  const rep5b = copyText(w5b) || '';
  ok('it clears every pin…', !/\[#\d/.test(rep5b),
    rep5b.match(/\[#\d+\]/g)?.join(' ') || 'no pins — good');
  ok('…and the audit stays on the page', /whole page/.test(rep5b),
    'the sweep died with the pins — that is the bar ✕\'s job, not this one\'s');
  w5b.close();

  // 6) a technique is a GESTURE, not a mode — pairs and chains mix in one
  // session. Shift+click pairs ①②, a fresh Shift+click opens ③, and two
  // Ctrl+Shift+clicks chain ③─④─⑤. The retired 'Pin grouping' mode could
  // only ever do one of these per session.
  const w6 = boot(['measure', 'select', 'pin'], idsOnDisk,
    '<div id="a">a</div><div id="b">b</div><div id="c">c</div>' +
    '<div id="d">d</div><div id="e">e</div>');
  clickOn(w6, 'a', { shiftKey: true });
  clickOn(w6, 'b', { shiftKey: true });
  clickOn(w6, 'c', { shiftKey: true });
  clickOn(w6, 'd', { shiftKey: true, ctrlKey: true });
  clickOn(w6, 'e', { shiftKey: true, ctrlKey: true });
  const rep6 = copyText(w6) || '';
  ok('a chained pin reports as (link)',
    /\(link\)/.test(rep6),
    rep6.match(/\((note|pair|link)\)/g)?.join(' ') || 'no pins');
  ok('one session holds a pair AND a chain',
    /\[#1 → #2\]/.test(rep6) && /\[#3 → #4\]/.test(rep6) && /\[#4 → #5\]/.test(rep6),
    rep6.match(/\[#\d → #\d\]/g)?.join(' ') || 'no measurements');
  ok('and the pair boundary held — nothing measured #2 to #3',
    !/\[#2 → #3\]/.test(rep6),
    'the third click was chained to the pair it should have started fresh from');
  w6.close();
}

console.log('\nWHAT A LIVE UX AUDIT FOUND');
/**
 * Five defects an external UX audit measured against the running overlay,
 * each reproduced here before it was fixed. None of them had any coverage:
 * jsdom has no layout and no :hover, and compare.js observes neither
 * visibility nor the tab order, which is exactly why they shipped.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const boot = (html, armed) => {
    const d = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, opts);
    const w = d.window;
    if (armed) w.localStorage.setItem('__debug_overlay_tools', JSON.stringify(armed));
    w.localStorage.setItem('__debug_overlay_seen', JSON.stringify(idsOnDisk));
    w.eval(source);
    w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    return w;
  };

  // 1) the message is the content and must never be the cell that collapses
  const w1 = boot('<div id="a">a</div>');
  const css1 = [...w1.document.querySelectorAll('#__debug-overlay-root style')]
    .map((s) => s.textContent).join('\n');
  const lblRule = (/\.debug-overlay-lbl \{[^}]*\}/.exec(css1) || [''])[0];
  const detRule = (/\.debug-overlay-det \{[^}]*\}/.exec(css1) || [''])[0];
  ok('the finding text has a width floor', /min-width:\s*\d/.test(lblRule), lblRule || '(no rule)');
  ok('and the selector is the half that truncates',
    /min-width:\s*0/.test(detRule) && /ellipsis/.test(detRule), detRule || '(no rule)');

  // 2) a row that acts answers the keyboard; one that does not is not a button
  const w2 = boot('<div id="a" style="padding:7px">a</div>', ['measure', 'grid', 'pin']);
  const bar2 = w2.document.getElementById('__debug-overlay-bar');
  const el2 = w2.document.getElementById('a');
  w2.document.elementFromPoint = () => el2;
  el2.dispatchEvent(new w2.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  bar2.querySelector('[data-c]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  const pinRow = w2.document.querySelector('#__debug-overlay-list .debug-overlay-row');
  /* The ROW is not the button — its CONTENT is. A pin row carries its own ✕,
     and a real <button> inside a [role=button] is the same nesting violation
     as one inside a <button>: the ancestor's keydown swallows Enter meant for
     the ✕ and runs the row's action instead. Two siblings, two jobs. */
  ok('a pin row is keyboard-operable and says what it is',
    !!pinRow?.querySelector('button.debug-overlay-go') && !pinRow.getAttribute('role'),
    `go=${!!pinRow?.querySelector('.debug-overlay-go')} role=${pinRow?.getAttribute('role')}`);
  ok('and its ✕ is a sibling of that button, not inside it',
    !!pinRow?.querySelector(':scope > button.debug-overlay-rm') &&
    !pinRow?.querySelector('.debug-overlay-go .debug-overlay-rm'),
    'the remove button nests inside the row action');
  ok('and it carries both halves for the hover the ellipsis needs',
    (pinRow?.title || '').includes('\n'), JSON.stringify(pinRow?.title));
  // Enter activates it — the click path, reached without a mouse
  // Enter on the row's BUTTON does what clicking it does — proven by the
  // scroll it performs, SYNCHRONOUSLY, so no other test's timing can eat the
  // evidence (a 900ms flash did not survive the perf test's real freeze).
  // jsdom implements no scrollIntoView; the spy is also the stub.
  let scrolled = 0;
  el2.scrollIntoView = () => { scrolled++; };
  pinRow.querySelector('.debug-overlay-go').dispatchEvent(
    new w2.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  pinRow.querySelector('.debug-overlay-go').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  ok('activating a row scrolls to the element it points at',
    scrolled >= 1, `scrollIntoView called ${scrolled} times`);
  bar2.querySelector('[data-settings]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  const setRow = [...w2.document.querySelectorAll('#__debug-overlay-list .debug-overlay-row')]
    .find((r) => r.querySelector('.debug-overlay-opt'));
  ok('a settings row is NOT a button — it holds one',
    setRow && !setRow.getAttribute('role') && setRow.tabIndex !== 0,
    `role=${setRow?.getAttribute('role')} tabindex=${setRow?.tabIndex}`);
  ok('and no interactive element nests inside another',
    !w2.document.querySelector('#__debug-overlay-list button button, #__debug-overlay-list [role="button"] button, ' +
                               '#__debug-overlay-list [role="button"] select, #__debug-overlay-list [role="button"] input'),
    'a control inside a control is invalid and breaks the keyboard');
  w2.close();

  // 3) a closed flyout is not in the tab order
  const w3 = boot('<div id="a">a</div>');
  const bar3 = w3.document.getElementById('__debug-overlay-bar');
  const famBtn = bar3.querySelector('.debug-overlay-fam[data-fam] .debug-overlay-fam-btn');
  const member = bar3.querySelector('.debug-overlay-fam[data-fam] .debug-overlay-flyout [data-tool]');
  ok('closed, a flyout member is hidden from the keyboard too',
    w3.getComputedStyle(member).visibility === 'hidden',
    `visibility=${w3.getComputedStyle(member).visibility} — opacity alone leaves it tabbable`);
  famBtn.dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  ok('and open, it is reachable again',
    w3.getComputedStyle(member).visibility === 'visible',
    w3.getComputedStyle(member).visibility);

  // 4) Escape closes the flyout — one dismissal model for every overlay
  ok('the flyout is open before Escape',
    !!bar3.querySelector('.debug-overlay-fam.debug-overlay-open'), 'test setup failed');
  w3.dispatchEvent(new w3.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Escape closes an open flyout',
    !bar3.querySelector('.debug-overlay-fam.debug-overlay-open'),
    'Escape walked past the flyout and cleared what was behind it');
  ok('and the mark it hangs from says so',
    famBtn.getAttribute('aria-expanded') === 'false', famBtn.getAttribute('aria-expanded'));
  w3.close();

  // 5) a mark must say WHAT, not only where. A title cannot: the layer is
  // aria-hidden and pointer-events:none, so no tooltip can ever fire on one.
  const w6 = boot('<div id="a" style="padding:7px">a</div>', ['grid', 'pin']);
  w6.document.getElementById('__debug-overlay-bar').querySelector('[data-sweep]')
    .dispatchEvent(new w6.MouseEvent('click', { bubbles: true }));
  pendingChecks.push(() => {
    const tips = [...w6.document.querySelectorAll('#__debug-overlay-root .debug-overlay-tip')];
    ok('an audit mark names the rule that made it',
      tips.length > 0 && /grid-off/.test(tips[0].textContent), tips.map((t) => t.textContent).join(' | ') || '(no labels)');
    ok('and repeats on one element collapse into its count',
      /×\d/.test(tips[0]?.textContent || ''), tips[0]?.textContent);
    ok('one outline per element, not one per finding',
      w6.document.querySelectorAll('#__debug-overlay-root .debug-overlay-flag').length === tips.length,
      `${w6.document.querySelectorAll('#__debug-overlay-root .debug-overlay-flag').length} outlines, ${tips.length} labels`);
    ok('a label is not itself a finding mark',
      !tips.some((t) => t.classList.contains('debug-overlay-flag')),
      'a labelled sibling wearing .debug-overlay-flag corrupts every count of them');
    w6.close();
  });

  // 6) the badge's vocabulary is written down where the user already is
  const w7 = boot('<div id="a">a</div>');
  w7.document.getElementById('__debug-overlay-bar').querySelector('[data-settings]')
    .dispatchEvent(new w7.MouseEvent('click', { bubbles: true }));
  const heads7 = [...w7.document.querySelectorAll('#__debug-overlay-list .debug-overlay-head')]
    .map((h) => h.childNodes[0].textContent);
  ok('⚙ carries a legend section', heads7.includes('Legend'), heads7.join(' → '));
  const legendText = [...w7.document.querySelectorAll('#__debug-overlay-list .debug-overlay-row')]
    .map((r) => r.querySelector('.debug-overlay-tag')?.textContent + ' ' + r.querySelector('.debug-overlay-lbl')?.textContent)
    .join(' | ');
  ok('and it explains the badge abbreviations and the colours',
    /r 13/.test(legendText) && /12\/16 400/.test(legendText) && /amber/.test(legendText),
    legendText.slice(0, 120));
  // the dynamic flyout buttons are named for a screen reader, by their WHOLE
  // title — first-clause would call both view members "Badge view"
  w7.document.querySelector('[data-badge] button').dispatchEvent(new w7.MouseEvent('click', { bubbles: true }));
  const axis7 = [...w7.document.querySelectorAll('[data-badge-fly] button')];
  ok('every badge control has an accessible name',
    axis7.length > 0 && axis7.every((b) => (b.getAttribute('aria-label') || '').length > 3),
    axis7.map((b) => b.getAttribute('aria-label')).join(' | '));
  axis7.find((b) => /^View/.test(b.title)).dispatchEvent(new w7.MouseEvent('click', { bubbles: true }));
  const names7 = [...w7.document.querySelectorAll('[data-badge-fly] button')]
    .map((b) => b.getAttribute('aria-label'));
  ok('and two members never share one name',
    new Set(names7).size === names7.length, names7.join(' | '));
  w7.close();

  // 6b) what the verification pass caught — each of these shipped for an hour
  const w8 = boot('<div id="a" style="padding:7px;color:#eee;background:#fff">text</div>' +
                  '<div id="dup">x</div><div id="dup">y</div>', ['grid', 'dupid', 'contrast', 'pin']);
  const bar8 = w8.document.getElementById('__debug-overlay-bar');
  const el8 = w8.document.getElementById('a');
  w8.document.elementFromPoint = () => el8;
  el8.dispatchEvent(new w8.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
  bar8.querySelector('[data-c]').dispatchEvent(new w8.MouseEvent('click', { bubbles: true }));
  // the popover's ✕ and the remove-mode page chip are two components; when they
  // shared one class the chip's pointer-events:none made every ✕ dead to the mouse
  const rowX = w8.document.querySelector('#__debug-overlay-list .debug-overlay-row .debug-overlay-rm');
  ok('the popover\'s ✕ can actually be clicked',
    rowX && w8.getComputedStyle(rowX).pointerEvents !== 'none' &&
    w8.getComputedStyle(rowX).position !== 'fixed',
    `pointer-events=${rowX && w8.getComputedStyle(rowX).pointerEvents} position=${rowX && w8.getComputedStyle(rowX).position}`);
  // Escape closes the NEWEST layer: a tool's options are opened FROM a flyout
  bar8.querySelector('.debug-overlay-fam[data-fam] .debug-overlay-fam-btn')
    .dispatchEvent(new w8.MouseEvent('click', { bubbles: true }));
  bar8.querySelector('[data-settings]').dispatchEvent(new w8.MouseEvent('click', { bubbles: true }));
  w8.dispatchEvent(new w8.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Escape closes the popover before the flyout under it',
    !w8.document.getElementById('__debug-overlay-list').classList.contains('debug-overlay-open') &&
    !!bar8.querySelector('.debug-overlay-fam.debug-overlay-open'),
    'the flyout went first and left the popover stranded above nothing');
  // powering off must take every overlay with it — the ladder is gated on
  // State.enabled, so anything still open can never be closed again
  w8.dispatchEvent(new w8.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  ok('power off closes the flyouts too',
    !bar8.querySelector('.debug-overlay-fam.debug-overlay-open'), 'a flyout survived the power cycle');
  w8.dispatchEvent(new w8.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  bar8.querySelector('[data-sweep]').dispatchEvent(new w8.MouseEvent('click', { bubbles: true }));
  pendingChecks.push(() => {
    const tips8 = [...w8.document.querySelectorAll('#__debug-overlay-root .debug-overlay-tip')];
    const many = tips8.find((x) => /\s/.test(x.textContent));
    ok('two rules on one element make ONE label, not two stacked on each other',
      !!many && many.textContent.split(' ').length > 1, tips8.map((x) => x.textContent).join(' | '));
    ok('and the outline reads as the worse of them',
      !!many && many.classList.contains('debug-overlay-error'), many?.className);
    w8.close();
  });

  // 7) the armed count chip must survive being hovered — it is 1.25:1 without
  const w5 = boot('<div id="a">a</div>');
  const css5 = [...w5.document.querySelectorAll('#__debug-overlay-root style')]
    .map((s) => s.textContent).join('\n');
  ok('armed beats hover on the count chip',
    /\.debug-overlay-cnt\.debug-overlay-armed:hover\s*\{[^}]*background/.test(css5),
    'hover strips the amber and leaves near-black text on near-black');
  w5.close();
  w1.close();
}

console.log('\nSTALENESS ANNOUNCES ITSELF');
/**
 * The update checker: one endpoint, three doors (worker / GM_xmlhttpRequest /
 * fetch), daily automatic floor plus a manual "check now" that always answers.
 * jsdom has neither chrome nor GM, so these drive the fetch door with a stub —
 * which is exactly the door the dev page uses.
 */
{
  const opts = { url: 'https://example.test/', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const boot = (metaVersion, fail) => {
    const d = new JSDOM('<!doctype html><html><body><div id="a">a</div></body></html>', opts);
    const w = d.window;
    w.fetch = () => (fail
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ ok: true, text: () => Promise.resolve(
          `// ==UserScript==\n// @version      ${metaVersion}\n// ==/UserScript==`) }));
    let opened = null;
    w.open = (u) => { opened = u; return null; };
    w.eval(source);
    w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
    return { w, opened: () => opened };
  };
  const menuRows = (w) => [...w.document.querySelectorAll('#__debug-overlay-menu button')]
    .map((b) => b.textContent);
  const rclickPwr = (w) => w.document.querySelector('#__debug-overlay-bar .debug-overlay-pwr')
    .dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

  // a newer version, found by the MANUAL check — the user asking
  const hi = boot('99.0.0');
  rclickPwr(hi.w);
  ok('right-click ⏻ opens the update menu with a manual check',
    menuRows(hi.w).some((x) => /Check for updates now/.test(x)),
    menuRows(hi.w).join(' | ') || '(no menu)');
  [...hi.w.document.querySelectorAll('#__debug-overlay-menu button')]
    .find((b) => /Check for updates/.test(b.textContent))
    .dispatchEvent(new hi.w.MouseEvent('click', { bubbles: true }));
  pendingChecks.push(() => {
    ok('a found update RESTS on ⏻ — a dot, and the tooltip says how',
      hi.w.document.querySelector('.debug-overlay-pwr').classList.contains('debug-overlay-upd') &&
      /v99\.0\.0 available/.test(hi.w.document.querySelector('.debug-overlay-pwr').title),
      hi.w.document.querySelector('.debug-overlay-pwr').title);
    rclickPwr(hi.w);
    ok('and the menu now offers the install',
      menuRows(hi.w).some((x) => /Update to v99\.0\.0/.test(x)),
      menuRows(hi.w).join(' | '));
    [...hi.w.document.querySelectorAll('#__debug-overlay-menu button')]
      .find((b) => /Update to/.test(b.textContent))
      .dispatchEvent(new hi.w.MouseEvent('click', { bubbles: true }));
    ok('pressing it opens the pinned install URL — the manager finishes the job',
      /debug-overlay\.user\.js$/.test(hi.w.__opened || hi.opened() || ''),
      String(hi.opened()));
    /* …and the menu reopens ITSELF with the missing step: the page keeps
       running the old code until it reloads, and a user who updated saw
       nothing change and was told nothing. Refresh is now a button. */
    ok('after Update, the menu says the page must refresh — as a button',
      menuRows(hi.w).some((x) => /↻ Refresh page — activate v99\.0\.0/.test(x)),
      menuRows(hi.w).join(' | ') || '(menu closed)');
    hi.w.close();
  });

  // current version: the manual check must still ANSWER
  const same = boot('0.0.1');
  rclickPwr(same.w);
  [...same.w.document.querySelectorAll('#__debug-overlay-menu button')]
    .find((b) => /Check for updates/.test(b.textContent))
    .dispatchEvent(new same.w.MouseEvent('click', { bubbles: true }));
  pendingChecks.push(() => {
    ok('being current is an answer, not silence — and no dot appears',
      !same.w.document.querySelector('.debug-overlay-pwr').classList.contains('debug-overlay-upd'),
      'an old version left a dot, or the check never ran');
    // the answer lives IN the menu that asked — it reopened itself with the
    // result, because a sentence flashed into the round ⏻ painted as smear
    ok('…and the answer appears in the menu, readably',
      menuRows(same.w).some((x) => /✓ current — v/.test(x)),
      menuRows(same.w).join(' | ') || '(menu closed)');
    same.w.close();
  });

  // offline: silent — a false nag teaches the eye to ignore a true one
  const off = boot('99.0.0', true);
  rclickPwr(off.w);
  [...off.w.document.querySelectorAll('#__debug-overlay-menu button')]
    .find((b) => /Check for updates/.test(b.textContent))
    .dispatchEvent(new off.w.MouseEvent('click', { bubbles: true }));
  pendingChecks.push(() => {
    ok('a failed check is silent',
      !off.w.document.querySelector('.debug-overlay-pwr').classList.contains('debug-overlay-upd'),
      'offline produced a nag');
    off.w.close();
  });
}

console.log('\nTHE SESSION SURVIVES THE REFRESH');
/**
 * DevTools survives a reload because it lives outside the page; a userscript
 * cannot, so the session is REBUILT: power per origin, pins by selector,
 * losses counted rather than hidden. Two windows, one storage, is a refresh.
 */
{
  const opts = { url: 'https://example.test/page', pretendToBeVisual: true,
                 runScripts: 'outside-only', virtualConsole: new VirtualConsole() };
  const storage = {};
  const boot = (html) => {
    const d = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, opts);
    const w = d.window;
    for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    w.localStorage.setItem('__debug_overlay_seen', JSON.stringify(idsOnDisk));
    w.eval(source);
    return w;
  };
  const persist = (w) => {
    for (let i = 0; i < w.localStorage.length; i++) {
      const k = w.localStorage.key(i);
      storage[k] = w.localStorage.getItem(k);
    }
  };
  const pinIt = (w, id, mods = {}) => {
    const el = w.document.getElementById(id);
    w.document.elementFromPoint = () => el;
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5, ...mods }));
  };

  // session one: power on, pin two elements
  const w1 = boot('<div id="a">a</div><div id="b">b</div><div id="c">c</div>');
  w1.dispatchEvent(new w1.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  pinIt(w1, 'a');
  pinIt(w1, 'b', { shiftKey: true });
  persist(w1);
  w1.close();

  // "refresh": same page, same storage, a fresh document
  const w2 = boot('<div id="a">a</div><div id="b">b</div><div id="c">c</div>');
  const bar2 = w2.document.getElementById('__debug-overlay-bar');
  ok('power survives the reload — per origin',
    bar2.querySelector('[data-st]').textContent === 'ON',
    bar2.querySelector('[data-st]').textContent);
  bar2.querySelector('[data-c]').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  const tags2 = [...w2.document.querySelectorAll('#__debug-overlay-list .debug-overlay-row .debug-overlay-tag')]
    .map((x) => x.textContent);
  // #2 is a pair pin still waiting for its partner, so select's list row
  // shows it as '#2…' — the pending state survived the reload too
  ok('pins survive by selector, with their numbers',
    tags2.includes('#1') && tags2.some((x) => x.startsWith('#2')),
    tags2.join(' ') || '(no rows)');
  const kinds2 = JSON.parse(w2.localStorage.getItem(
    '__debug_overlay_pins:https://example.test/page') || '{}');
  ok('and a pin keeps its KIND across the reload',
    (kinds2.pins || []).some((p) => p.kind === 'pair'),
    JSON.stringify(kinds2.pins || []));
  persist(w2);
  w2.close();

  // a reload onto a page that CHANGED: #b is gone — dropped, and said
  const w3 = boot('<div id="a">a</div><div id="c">c</div>');
  const bar3 = w3.document.getElementById('__debug-overlay-bar');
  bar3.querySelector('[data-c]').dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  const head3 = w3.document.querySelector('#__debug-overlay-list .debug-overlay-viewhead');
  ok('a pin whose element is gone is dropped AND counted',
    /1 did not survive the reload/.test(head3?.textContent || ''),
    head3?.textContent || '(no header)');
  const tags3 = [...w3.document.querySelectorAll('#__debug-overlay-list .debug-overlay-row .debug-overlay-tag')]
    .map((x) => x.textContent);
  ok('the surviving pin is still #1', tags3.includes('#1') && !tags3.includes('#2'),
    tags3.join(' '));
  // the next user action supersedes the note, and ✕ clears the store
  bar3.querySelector('[data-clear]').dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  ok('✕ clears the persisted session too',
    !(w3.localStorage.getItem('__debug_overlay_pins:https://example.test/page') || ''),
    w3.localStorage.getItem('__debug_overlay_pins:https://example.test/page'));
  // power OFF persists too — the next "reload" must stay off
  w3.dispatchEvent(new w3.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  persist(w3);
  w3.close();
  const w4 = boot('<div id="a">a</div>');
  ok('power OFF survives the reload as well',
    w4.document.querySelector('#__debug-overlay-bar [data-st]').textContent === 'OFF',
    w4.document.querySelector('#__debug-overlay-bar [data-st]').textContent);
  w4.close();

  // THE RUNTIME survives too: ⚡ armed before the reload is armed AND
  // MONITORING after it — watch() re-fires from the restored session, with
  // a fresh log by design (a freeze from before the reload is a stale claim
  // about a dead document; the ## load section covers the page's birth).
  const w5 = boot('<div id="a">a</div>');
  w5.dispatchEvent(new w5.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  w5.document.querySelector('[data-tool="perf"]')
    .dispatchEvent(new w5.MouseEvent('click', { bubbles: true }));
  persist(w5); w5.close();
  const w6 = boot('<div id="a">a</div>');
  let rep6 = null;
  Object.defineProperty(w6.navigator, 'clipboard',
    { value: { writeText: async (x) => { rep6 = x; } }, configurable: true });
  w6.document.querySelector('[data-copy]').dispatchEvent(new w6.MouseEvent('click', { bubbles: true }));
  ok('⚡ survives the reload armed — and the monitor restarted itself',
    w6.document.querySelector('[data-tool="perf"]').classList.contains('debug-overlay-armed') &&
    /## performance/.test(rep6 || '') && /no blocks over the threshold/.test(rep6 || ''),
    (rep6 || '').match(/## performance[^\n]*/)?.[0] || 'no performance section after reload');
  w6.close();
}

console.log('\nPERF MONITOR');
/**
 * The first tool with a RUNTIME: watch() when armed and powered, unwatch()
 * when either stops. And the first test whose fixture is the event loop
 * itself — the freeze below is REAL: a synchronous 400ms block between two
 * heartbeat frames, noticed by the same rAF-gap tier a browser without
 * long-task APIs falls back to. jsdom has neither observer type, so this
 * exercises exactly the tier it claims to.
 */
let perfChecked = false;
{
  const d = new JSDOM('<!doctype html><html><body><div id="a">a</div></body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = d.window;
  w.localStorage.setItem('__debug_overlay_tools', '["perf","pin"]');
  w.localStorage.setItem('__debug_overlay_seen', JSON.stringify(idsOnDisk));
  w.eval(source);
  let repText = null;
  Object.defineProperty(w.navigator, 'clipboard',
    { value: { writeText: async (t) => { repText = t; } }, configurable: true });
  const bar = w.document.getElementById('__debug-overlay-bar');
  const report = () => {
    bar.querySelector('[data-copy]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return repText || '';
  };
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  // the real freeze, on a timer so a few heartbeat frames land first
  w.setTimeout(() => { const t0 = Date.now(); while (Date.now() - t0 < 400); }, 40);

  whenPainted(() => /worst \d/.test(report()), () => {
    const r = report();
    ok('a real 400ms freeze is noticed and measured',
      /worst (3[5-9]\d|[4-9]\d\d)ms/.test(r) || /worst \d+\.\ds/.test(r),
      (r.match(/main thread[^\n]*/) || ['no performance line'])[0]);
    ok('and the report names the tier that measured it',
      /tier: heartbeat/.test(r),
      'jsdom has no long-task observers — anything but heartbeat is a lie here');
    bar.querySelector('[data-c]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const row = [...w.document.querySelectorAll('#__debug-overlay-list .debug-overlay-row')]
      .find((x) => /main thread blocked/.test(x.querySelector('.debug-overlay-lbl')?.textContent || ''));
    ok('the freeze is a row in the panel list', !!row, 'no freeze row');
    ok('a log row is information — nothing to remove, nothing to reveal',
      !!row && !row.querySelector('.debug-overlay-rm') && !row.querySelector('.debug-overlay-go'),
      'a freeze is a WHEN, not a WHERE');
    // the section leaves the report WITH the arming, like everything else
    bar.querySelector('[data-tool="perf"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('disarming removes the performance section',
      !/## performance/.test(report()), 'a disarmed monitor kept reporting');
    // re-arm: a fresh session starts a fresh log — the page moved on
    bar.querySelector('[data-tool="perf"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('re-arming starts a fresh log',
      /no blocks over the threshold/.test(report()),
      (report().match(/main thread[^\n]*/) || ['no line'])[0]);

    /* PHASE 2 — the targeted half, with a REAL MutationObserver. Pin an
       element, storm its subtree the way a re-render loop would, and the
       watch record must read the rate, the badge must go amber, the rule
       must turn it into a finding WITH the element, and a freeze during
       the storm must blame the stormed subtree. */
    const box = w.document.getElementById('a');
    w.document.elementFromPoint = () => box;
    box.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
    // the heartbeat syncs targets on its next frame; then storm ~600 mutations
    whenPainted(() => /watched #a/.test(report()), () => {
      for (let k = 0; k < 300; k++) {
        const d = w.document.createElement('i');
        box.append(d);
        d.remove();
      }
      /* a freeze WHOSE WORK IS the churn — the real shape: a re-render
         loop blocks the thread, and MutationObserver delivers its records
         when the task ends, timestamps inside the freeze window */
      w.setTimeout(() => {
        for (let k = 0; k < 300; k++) {
          const d = w.document.createElement('i');
          box.append(d);
          d.remove();
        }
        const t0 = Date.now();
        while (Date.now() - t0 < 350);
      }, 20);
      /* gate on EVERY artefact asserted below — the correlation line in the
         report AND the live badge in the DOM. The badge repaints on the
         runtime's own 500ms clock, so a gate on the report alone raced it
         and read the DOM one paint too early. */
      const badgeTxt = () => [...w.document.querySelectorAll('#__debug-overlay-root .debug-overlay-badge')]
        .map((b) => b.textContent).join(' | ');
      whenPainted(() => /during the /.test(report()) && /mut \d+\/s/.test(badgeTxt()), () => {
        const r2 = report();
        /* THE LIVE GAUGE, on screen, with NO mouse event in this whole
           window: the runtime's own clock repainted the badge, or this
           text could not exist — renders were otherwise mouse-driven and
           a motionless user watched a stale number wearing a live label */
        ok('the pinned badge shows its live cost without a mouse move',
          /mut \d+\/s/.test(badgeTxt()), badgeTxt().slice(0, 80) || '(no badges painted)');
        ok('a watched element reads its own mutation rate',
          /watched #a: mut [1-9]\d*\/s/.test(r2),
          (r2.match(/watched[^\n]*/) || ['no watched line'])[0]);
        // the storm is a finding on THAT element, through the ordinary sweep
        bar.querySelector('[data-sweep]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        const r3 = report();
        ok('a re-render storm is a finding with a WHERE',
          /perf-churn[^\n]*mutations\/s/.test(r3) && /perf-churn[\s\S]*?#a/.test(r3),
          (r3.match(/\[warn\] perf-churn[^\n]*/) || ['no churn finding'])[0]);
        ok('and the rule documents itself in ## rules',
          /## rules[\s\S]*perf-churn/.test(r3), 'no rules doc');
        /* fmt() prints "600ms" under a second and "1.0s" over it. This regex
           only ever matched the first form, so the assertion failed whenever
           the machine was loaded enough to push the measured block past 1s —
           a real freeze, correctly blamed, reported as a failure. Match what
           the product actually prints, both branches of it. */
        ok('a freeze during the storm blames the stormed subtree',
          /during the [\d.]+m?s block: .*×\d+ mutations/.test(r3) || /during: /.test(r3),
          (r3.match(/during[^\n]*/) || ['no correlation line'])[0]);
        perfChecked = true;
        w.close();
      });
    });
  });
}

console.log('\nFAMILY FLYOUT');
/**
 * A family with a MARK (a subject wearing the family id) renders as one bar
 * button whose members slide out sideways. The members are ordinary tool
 * buttons — same arming, same right-click — just housed in the flyout, so a
 * family that grows shrinks the bar instead of growing it.
 */
{
  const d = new JSDOM('<!doctype html><html><body><div id="x">x</div></body></html>',
    { url: 'https://example.test/', pretendToBeVisual: true,
      runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = d.window;
  w.eval(source);
  const bar = w.document.getElementById('__debug-overlay-bar');
  // icons are SVGs (no textContent), so families are found by the name the
  // panel stamps on the wrapper — the family declaration, not the picture
  const famOf = (name) => bar.querySelector(`.debug-overlay-fam[data-fam="${name}"]`);
  const fam = famOf('colour');
  const btn = fam && fam.querySelector('.debug-overlay-fam-btn');
  ok('the colour family is one mark on the bar',
    !!btn && !!fam.querySelector('[data-tool="contrast"]'),
    'the mark comes from the family subject; contrast lives in its flyout');
  ok('and so is geometry — its head is the promoted subject',
    !!famOf('geometry') && famOf('geometry').querySelector('[data-tool]')?.dataset.tool === 'measure',
    'geometry serves two tools, so it was always a subject by this project\'s own rule');
  ok('while select stays a direct button — it consults geometry, it is not OF it',
    !bar.querySelector('[data-tool="select"]')?.closest('.debug-overlay-fam'),
    'a domain folder is identity; consulting a subject is not membership');
  w.dispatchEvent(new w.KeyboardEvent('keydown', { ...hot, bubbles: true }));
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('clicking the mark opens the flyout',
    fam.classList.contains('debug-overlay-open') && btn.getAttribute('aria-expanded') === 'true',
    fam.className);
  fam.querySelector('[data-tool="contrast"]')
    .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('a member arms from the flyout, and the mark shows it',
    btn.classList.contains('debug-overlay-armed'),
    'the family mark reflects any armed member');
  w.document.body.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true }));
  ok('clicking anywhere else closes it',
    !fam.classList.contains('debug-overlay-open') && btn.getAttribute('aria-expanded') === 'false',
    fam.className);
  w.close();
}

// ---- the sections that need a painted frame ---------------------------------
// Marks and badges only exist after the renderer runs, which is an animation
// frame away. Everything above is synchronous; these are not, so they go last
// and take the summary with them. Asserting before the frame lands passes for
// the wrong reason: no badge, no injected tag either.
const dom3 = makeDom();
const w3 = dom3.window;
const evil = w3.document.createElement('div');
evil.id = '"><img src=x onerror="void 0">';   // page-authored, hostile
evil.textContent = 'hostile id';
w3.document.body.append(evil);
w3.eval(source);
const bar3 = w3.document.getElementById('__debug-overlay-bar');
w3.dispatchEvent(new w3.KeyboardEvent('keydown', { ...hot, bubbles: true }));
[...bar3.querySelectorAll('[data-badge-fly] button')].find((b) => /^View/.test(b.title))
  .dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
[...bar3.querySelectorAll('[data-badge-fly] button')].find((b) => /full/.test(b.title))
  .dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
w3.document.elementFromPoint = () => evil;
evil.dispatchEvent(new w3.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));

// re-sweep the first page so its marks are on screen for the frame below
window.dispatchEvent(new window.KeyboardEvent('keydown', { ...hot, bubbles: true }));
bar.querySelector('[data-sweep]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

/**
 * WAIT FOR THE FRAME, do not assume it. This was a fixed 80ms, which is a bet
 * that the machine is idle — and under load the frame had not landed, so
 * assertions about painted marks failed for a reason that had nothing to do
 * with the code. An intermittently red suite gets re-run until it is green,
 * which is the same "green by luck" the crash guard above exists to stop.
 */
function whenPainted(ready, run, waited = 0) {
  if (ready() || waited > 4000) return run();
  setTimeout(() => whenPainted(ready, run, waited + 25), 25);
}

/* ======================================================================
   INTERACTION PERFORMANCE
   The four mechanisms an interaction-performance audit found, each read
   from SOURCE because each is a shape rather than a value: a read placed
   after a write, a loop that never yields, work repeated per frame that
   changes per session. None of them is visible in output — a fast machine
   absorbs all four and the page looks fine, which is exactly why they
   survived this long.
   ====================================================================== */
console.log('\nINTERACTION PERFORMANCE');
{
  const S = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  const panel = S('ui/web-panel.js'), rend = S('ui/renderer.js');
  const perf = S('tools/perf/service.js'), find = S('services/findings/index.js');

  /* F3 — the grip drag. applyPos() reads getBoundingClientRect() and then
     writes left/top; called from pointermove that is a forced synchronous
     layout per event, and a forced layout costs what the PAGE costs, not
     what the panel costs. Pointer events also outrun frames, so some of
     those layouts were discarded unpainted. */
  const move = panel.slice(panel.indexOf("addEventListener('pointermove'"),
                           panel.indexOf('const endDrag'));
  ok('the grip drag measures once and writes once a frame',
    !/getBoundingClientRect/.test(move) && !/applyPos\(/.test(move) &&
    /requestAnimationFrame/.test(move),
    'a layout read inside pointermove forces a full-document reflow per event');
  ok('and it moves on the compositor, without touching transform',
    /style\.translate =/.test(move) && !/style\.(left|top) =/.test(move) &&
    /style\.transform = t;/.test(panel),
    'left/top relayout every frame; transform is already owned by tuck()');

  /* F2 — the findings layer. It was rebuilt every frame, and each mark did
     read rect → append box → append tip → read offsetWidth: a forced layout
     per mark, up to MARK_LIMIT per armed drawing tool, driven by mousemove
     and scroll. Split so that marks() only reads and paintMarks() only
     writes, then measures the whole batch at once. */
  const collect = rend.slice(rend.indexOf('const marks = (found)'),
                             rend.indexOf('const paintMarks'));
  ok('collecting marks paints nothing — it only reads and merges',
    !/layer\.append|createElement|Place\.(put|smart)/.test(collect) &&
    /getBoundingClientRect/.test(collect),
    'a write between two reads is a forced layout, once per mark');
  ok('and the tips are measured as one batch, not one at a time',
    /for \(const t of tips\) t\.size = \{ w: t\.tip\.offsetWidth/.test(rend) &&
    /Place\.smart\(t\.tip, t\.r, \{ avoid: t\.r, size: t\.size \}\)/.test(rend) &&
    /opts\.size \? opts\.size\.w : node\.offsetWidth/.test(S('ui/placement.js')),
    'offsetWidth after a style write is a layout; per tip that is N layouts');

  /* F1 — the sweep. One synchronous pass with a getComputedStyle per element
     and no yield: on the large pages this tool exists for, seconds of fully
     blocked input. The behavioural proof is above (the 420-element fixture
     genuinely yields); this is the structural half. */
  ok('the sweep yields instead of owning the thread to the end',
    /performance\.now\(\) - since > CONFIG\.SWEEP_SLICE/.test(find) &&
    /setTimeout\(\(\) => \{/.test(find) &&
    !/requestAnimationFrame/.test(find),
    'rAF would run before the click the user is trying to land');
  ok('and a second press cannot start a second pass',
    /Controller\._sweeping/.test(S('app/controller.js')),
    'blocking the thread used to be the mutex; yielding removed it');

  /* F4 — the perf tool re-derived its watch set 60×/second: a new array, a
     new Set and a document.contains() per member, to learn that a set which
     changes on pin/unpin had not changed. */
  ok('the perf tool re-derives what it watches only when it moved',
    /let same = Monitor\._watch\.length/.test(perf) &&
    /if \(!same \|\| t - Monitor\._watchT >= CONFIG\.PERF\.RESYNC\)/.test(perf),
    'per-frame allocation to discover nothing happened');
  ok('and still re-syncs periodically, so a detached node is dropped',
    /RESYNC: \d+/.test(S('core/config.js')),
    'an element can leave the page without the list changing; sync() is what disconnects it');
}

whenPainted(() => perfChecked && sidePanelChecked && storageChecked && updaterRan &&
                  settleChecked && capChecked &&
                 
                  window.document.querySelector('#__debug-overlay-root .debug-overlay-flag') &&
                  w3.document.querySelector('#__debug-overlay-root .debug-overlay-badge'), () => {
  console.log('\nREVIEW FIXES (after a frame)');
  pendingChecks.forEach((fn) => fn());

  console.log('\nMARKS');
  // A findings list says what is wrong; a mark says where. The renderer hands
  // each armed tool its own findings and nobody else's, so the layer stays
  // attributable and there is nothing to undo.
  const marks = () => window.document.querySelectorAll('#__debug-overlay-root .debug-overlay-flag');
  ok('findings are marked on the page', marks().length > 0,
    'the sweep produced findings that appear nowhere on screen');
  ok('a review is not painted as a failure',
    [...marks()].some((m) => m.classList.contains('debug-overlay-review')) &&
    [...marks()].some((m) => m.classList.contains('debug-overlay-error')),
    [...marks()].map((m) => m.className.replace('debug-overlay-box debug-overlay-flag ', '')).join(' / '));
  dom.window.close();

  console.log('\nESCAPING');
  const badge = w3.document.querySelector('#__debug-overlay-root .debug-overlay-badge');
  ok('the badge rendered at all', !!badge,
    'without it the next two assertions prove nothing');
  ok('a hostile id builds no markup',
    w3.document.querySelectorAll('#__debug-overlay-root img').length === 0,
    'the overlay rendered a tag the page authored');
  ok('and the id is still shown, as text',
    !!badge && badge.textContent.includes('<img'),
    badge ? JSON.stringify(badge.textContent.slice(-30)) : 'no badge');
  dom3.window.close();

  console.log(`\n${failed ? '✗' : '✓'} ${failed} failure(s)\n`);
  process.exit(failed ? 1 : 0);
});
