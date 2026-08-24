# Debug Overlay

A screenshot-friendly UI inspector that runs on any page. Hover to read sizes,
click to pin, Shift+click two elements to measure between them, run a
whole-page audit, then copy a structured report to paste into an AI chat
alongside the screenshot.

One codebase, two ways to install: a **Tampermonkey userscript** that updates
itself after every `git push`, and a **browser extension** built from the
byte-identical bundle, which adds a browser side panel that outlives page
reloads. Sessions survive a page refresh; a performance monitor (⚡) can watch
a pinned component's cost live.

**Jump to:** [Install](#install) ·
[First 60 seconds](#first-60-seconds-after-installing) ·
[The two panels](#the-two-panels) ·
[Troubleshooting](#if-something-looks-wrong) ·
[Developing](#developing) · [Architecture](#architecture) ·
[Adding a tool](#adding-a-tool)

---

## Install

Two ways to run it. **Pick ONE per browser** — they are the same overlay, and
two copies would fight over the page.

| | A · Userscript | B · Browser extension |
|---|---|---|
| needs | Tampermonkey | nothing extra (Chrome/Edge) |
| install | open 1 link | download ZIP, load a folder once |
| updates | automatic after every push | one button in the update screen |
| side panel | no | **yes** |

---

### Option A — Userscript with Tampermonkey *(recommended)*

**Step 1.** Install the Tampermonkey extension from your browser's store
(Chrome Web Store / Edge Add-ons / Firefox Add-ons — search "Tampermonkey").

**Step 2 (Chrome/Edge only).** Open `chrome://extensions` and switch
**Developer mode** ON (top-right). Chrome requires it for userscripts to run
at all — without this, Tampermonkey installs but stays silent.

**Step 3.** Open this link in the browser:

```
https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/script/debug-overlay.user.js
```

**Step 4.** Tampermonkey opens its install page → press **Install**.

**Step 5.** Open any website and press **Alt+Shift+D** — the panel appears.
Done: this machine now updates itself after every `git push`.

*Getting updates:* automatic (checked daily). To force one: right-click the
⏻ button → **Check for updates now** → **Update to vX** → Tampermonkey's
dialog → then press **↻ Refresh page** in the same menu, because an open tab
keeps running the old version until it reloads.

---

### Option B — Browser extension *(recommended)*

Same overlay, plus a side panel that survives page reloads and an update
screen that fetches new files and writes them into your install folder — so
updating is a button, not a download-and-extract round trip. This is what the
project develops against.

It **deletes nothing and restarts nothing**. It used to do both, and that was
the mistake: fetch, write, delete, then restart the program you just wrote is
the complete shape of a downloader, and security software read it that way —
quarantining the files, which removed them from disk and made Chrome drop the
extension. Sweeping stale filenames was cosmetic (Chrome loads only what the
manifest names) and the auto-reload saved a single click. What is left is
fetch and write, which *is* the update. If a scanner still objects on your
machine, tell the updater to skip that one file by installing from the ZIP
instead — everything else still updates.

**Step 1.** Download the ZIP:

```
https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/browser-extension/debug-overlay-extension.zip
```

**Step 2.** Extract the ZIP anywhere and double-click **`install.html`** —
it opens in the browser (no command prompt involved, so it works even where
administrators disable cmd), and its one button writes the extension into a
permanent folder you choose — for example a new `debug-overlay-extension`
folder in Documents. It then walks the remaining clicks. *(Windows machines
where cmd IS allowed can use `install.bat` instead; or do it by hand —
extract to a permanent folder yourself, not Downloads, not a git checkout.)*

**Step 3.** On the page that opened: **Developer mode** ON →
**Load unpacked** → select that folder. These two clicks are the browser's
own security law — no installer anywhere may add an extension silently.

**Step 4.** Open any website and press **Alt+Shift+D** — the **web panel**
appears (the bar on the page itself). The extension also has a **side panel**: click the Debug Overlay toolbar button
and the same panel opens in the browser's side panel — bigger, and it
survives page refreshes (the in-page bar steps aside while it is open, and
comes back when you close it).

**Step 5 — one-time updater setup** (makes every future update one press):
`chrome://extensions` → Debug Overlay → **Details** → **Extension options** (the update screen) →
**"Choose install folder…"** → pick the same folder from Step 2 → Allow.

*Getting updates:* an amber dot rests on ⏻ when one exists. Right-click ⏻ →
**Update to vX** → the updater page opens → press **Check & apply** — it
fetches the new files from the repo, writes them, reloads the extension —
then refresh your open tabs. (Its safety rules: only this repo's URL, only a
version that increases, fetch everything before writing anything, never
silently.)

*Why the ZIP-and-folder dance:* Chrome refuses URL-installs outside its Web
Store — the browser's law, not ours. This is the floor it allows, and it is
one-time.

*Firefox:* has no File System Access API and no persistent unpacked installs —
use Option A there.

---

### The two panels

| | **web panel** | **side panel** |
|---|---|---|
| where | on the page itself — the floating bar | the browser's side panel |
| available in | **both** installs | the extension only |
| survives a page refresh | no | **yes** |
| open it with | **Alt+Shift+D** | the toolbar button |

They show the same overlay and the same state; the side panel is simply the
bigger, steadier place to put it. While the side panel is open the web
panel's bar steps aside so two controls never claim one state — everything
the overlay draws *on* the page (pins, marks, badges) stays exactly where it
was. Close the side panel and the bar comes back.

**Want both at once?** Press the ▣ button in the side panel's header. Useful
when you are capturing a screenshot for an AI: the bar belongs in the
picture, and the side panel does not. The choice is remembered.

### First 60 seconds after installing

| press | you get |
|---|---|
| **Alt+Shift+D** | power on / off |
| hover | live badge with sizes, spacing, font |
| click | select an element (📌 armed = it pins) |
| Shift+click ×2 | measure between two elements |
| Ctrl+Shift+click | chain to the previous pin — read a rhythm off one screenshot |
| ⌕ | audit the whole page, findings marked and labelled in place |
| ⚡ (arm it first) | freezes, FPS, and a pinned component's live cost |
| ⧉ | copy a structured report for an AI chat |
| right-click a target | copy its selector or text |
| right-click ⏻ | updates: check now / install / refresh |

Every mark and abbreviation the overlay prints is explained under
⚙ → **Legend**. Refreshing the page keeps your session: power stays on (per
site) and pins come back by selector, with losses counted.

**Optional but recommended — Tampermonkey Sync** (Option A): Dashboard →
Settings → Sync to Google Drive / Dropbox / OneDrive. A brand-new machine
then only needs you to sign in; the script arrives on its own.

### If something looks wrong

- **Panel does not appear:** is Developer mode on (`chrome://extensions`)?
  Are you in a real tab, not an editor preview (the overlay skips frames on
  purpose)?
- **"I pushed but nothing updated":** did the version bump (`npm run ship`)?
  GitHub's raw CDN also caches for a few minutes — right-click ⏻ → *Check for
  updates now* forces it, and `npm run shipped` answers what the world sees.
- **Updated but nothing changed:** the open tab still runs the old code —
  press **↻ Refresh page** in the ⏻ menu.
- **Antivirus flags the update, or removed the extension:** this happened on
  a real managed machine — the quarantine deleted the updater's files, and an
  unpacked extension whose files vanish is dropped by Chrome. The updater was
  reduced in response and no longer **deletes** anything or **restarts** the
  extension; fetch-write-delete-restart is the full shape of a downloader,
  and only the first two are the update. Sweeping stale filenames was
  cosmetic (Chrome loads only what the manifest names) and the auto-reload
  saved one click, so both went. If a scanner still objects on your machine,
  install from the ZIP instead. For the record: the extension contains no
  `eval`, no remote code execution, and reaches exactly one host,
  `raw.githubusercontent.com`; `npm run check` verifies the published files
  are byte-identical to a build from source.
- **"A security check blocked the write":** the update screen's own file is
  the one write allowed to fail — everything else still updates, and the
  manifest is written last, so a blocked write never leaves a folder naming
  files that are not there. Press Update again.
- **Extension updater says "Updated" but the version stays put:** the granted
  folder is not the one Chrome loads — a second copy swallows updates
  silently. Find the real folder at `chrome://extensions` → Debug Overlay →
  **Details** → **Source**, then re-do **Choose install folder…** with that
  exact folder. The updater now proves the folder is live (it writes a probe
  and fetches it through the extension's own URL) and refuses a dead copy.

### For a different account / fork

The repo must be **public** (Tampermonkey fetches raw URLs without
credentials). Change `rawBase` in `userscript.json`, run `npm run ship`,
push — every URL (header, checker, installer, updater) derives from that one
field. The repo was once `AlonurKomilov/debug-overlay-abc`; do not use the
old name — the redirect dies the day anyone claims it, silently.

### The permanent fix for install and update friction

### What lives where in dist/

```
dist/
  script/                the userscript — canonical home
    debug-overlay.user.js
    debug-overlay.meta.js
  browser-extension/     the extension gate
    manifest.json  content.js  sw.js       the extension itself
    side-panel.html  side-panel.js           the side panel
    update.html  update.js                  the update & repair screen
    icon16/32/48/128.png  files.json       the face, and the updater's file list
    install.html  install.bat              the no-cmd installer (+ cmd variant)
    debug-overlay-extension.zip     ← the one-link install
  debug-overlay.user.js  LEGACY BRIDGE — never delete: installs from before
  debug-overlay.meta.js  the restructure poll this path forever; these
                         byte-identical copies point at script/, so an old
                         install's next update migrates it automatically
```

### How the auto-update actually works

`build.js` writes the userscript twice — `dist/script/` (canonical) and the
legacy-bridge copies at `dist/` — each as two files:

| file | purpose |
|---|---|
| `debug-overlay.user.js` | the script itself (`@downloadURL`) |
| `debug-overlay.meta.js` | header only (`@updateURL`) — a few hundred bytes, so update checks are cheap |

Tampermonkey periodically fetches the meta file and **only installs the new
version if `@version` is higher**. That is why the build bumps the version
automatically — forgetting to bump is the classic reason "I pushed but nothing
updated". The overlay also checks that same meta file itself, daily and on
demand (right-click ⏻), so a stale install announces itself instead of
looking current.

Two things to expect:

- GitHub's raw CDN caches for a few minutes, so updates are not instant.
- Chrome requires **Developer mode** (`chrome://extensions`) for Tampermonkey
  to run userscripts at all under Manifest V3.

### What syncs, what stays per site

Which tools are armed, the panel position, and everything under ⚙ are kept
in a store that follows the **install**, not the site — under Tampermonkey
that is `GM_setValue` (scoped to the script, carried to new machines by the
manager's own sync); under the browser extension it is
`chrome.storage.local` (scoped to the extension). Choose an 8px grid on one
site and every other site already knows. Before the extension gate had this,
it fell back to per-origin `localStorage` and choices silently split across
sites — arm ⚡ on one origin and it arrived disarmed on the next.

Two things are deliberately **not** global: power (per site — debugging one
site must not switch the overlay on across the whole browser) and pins (per
page, saved as selectors and re-resolved on reload). They stay per-site by
carrying the origin in their storage **key**, so the global backend does not
globalise them.

The grants are not free. `GM_getValue`/`GM_setValue` exist because
`localStorage` is per-origin and `@match *://*/*` would reset settings on
every new domain; `GM_xmlhttpRequest` + `@connect raw.githubusercontent.com`
exist so the update check works even on pages whose CSP blocks outbound
fetches — and can call that one host, nowhere else. Any GM grant moves the
script into the manager's **sandbox**, where `window` is a wrapper; two
things in `src/banner.js` exist because of it (the `frameElement` frame check
and the ask-the-document single-instance guard). `Store` in
`src/core/state.js` picks its backend in order — GM, then
`chrome.storage.local`, then `localStorage` (the dev page and the tests) —
and adopts existing per-origin values on first use of a better backend, so
an upgrade never resets anybody. `chrome.storage` is async-only, so on that
one backend boot waits for a single storage snapshot before initialising;
everywhere else it stays synchronous.

---

## Developing

```bash
npm install          # once — jsdom (tests) + esbuild (bundler)
npm run dev          # local harness at http://localhost:8080, rebuilds on save
npm run check        # rebuild (no bump) + architecture audit + jsdom suite
npm run map          # what the panel looks like, asked of the running registry
npm run ship         # verify, BUMP, rebuild — the release step, run before commit
npm run shipped      # did the push actually reach the URL installs poll?
```

The everyday loop:

```bash
npm run check                                   # judge by EXIT CODE, not output
npm run ship
git add -A && git commit -m "…" && git push
npm run shipped                                 # "vX is live" is the only proof
```

`check` builds with `--same` so verifying never burns a version number;
Tampermonkey only updates on a HIGHER `@version`, which is why `ship` refuses
to finish if the version did not move.

### Seeing a change before shipping it

Installed copies are production: they only ever run what was built, bumped
and pushed. The local loop is `npm run dev` — it serves
`development/index.html` with the built bundle in a plain `<script>` tag and
reloads the page when a rebuild lands, so saving a file in `src/` is the
entire loop. The harness page carries deliberate fodder for every tool:
off-grid gaps, a failing-contrast line, boxes to measure between, and
buttons that hurt the page in honest ways for ⚡ (a 400ms block, a mutation
storm). Open it in a **real browser tab** — the bundle skips frames by
design, so an embedded editor preview shows nothing.

`development/perf-probe.user.js` is a standalone instrument: install it in
Tampermonkey for a minute to see which performance-observer tiers actually
fire under the manager's sandbox on a given browser.

---

## Architecture

[ARCHITECTURE.md](ARCHITECTURE.md) is the reference: the pipeline (input →
components → services → your eyes), the three species derived from hooks
(COMPONENT / SOURCE / ACTION), the four SERVICES a component fills from
inside its own file, the three layers of every surface, and what `audit.js`
enforces about each. `npm run map` prints the living version from the same
shared definition (`hooks.js`), so the document and the enforcement cannot
quietly disagree.

## Layout

```
src/                        the overlay — everything here becomes the bundle
  banner.js                 the guard — injected by build.js around the bundle
  boot.js                   the entry module: init order + wiring
  tools/                    ← one FOLDER per armable TOOL, auto-discovered
    colour/contrast/        index · service (Colour) · badge · rule · draw · report
    geometry/measure/       index · badge · report · draw
    dupid/                  index · badge · rule · draw · report
    grid/                   index · service (Scale) · badge · lens · rule · draw · report
    perf/                   index · service (Monitor) · target · badge · rows · rule · draw
    pin/                    index · keep — SELECTION chooses, this KEEPS the choice
    select/                 index · service · form · rows
  services/                 the four collectors — never edited for a new tool
    badge/ (index · options — the 🏷 face) · findings/ · report/ · settings/
  subjects/
    geometry.js             shared rectangle maths — measure and select consult it
  core/                     config · state+Store · utils · registry · protocol
                            (protocol = the panel's contract on a wire — shared
                            with the side panel, the one vocabulary both speak)
  ui/                       styles · dom · controls · list · menu · panel
                            · placement · renderer
  app/                      interactions · controller · updates · bridge
                            (bridge = the side panel adapter; inert as a userscript)

browser-extension-source/   the extension gate's own faces, one folder each —
  side-panel/               the side panel (bundled; imports core/protocol.js)
  update/                   the update & repair screen
  installer/                the no-cmd install page, and the .bat variant
  icons/                    the PNGs, and make-icons.js which draws them
                            build.js substitutes, bundles and flattens all of
                            it into dist/browser-extension/
development/                the dev harness, its server, and the perf probe —
                            instruments that never ship
dist/                       build output only — never edit (see table above)

hooks.js                    ONE definition of hooks/surfaces/species — audit.js
                            enforces it, map.js prints it, test.js checks by it
audit.js · test.js          the architecture rules and the jsdom suite
compare.js                  boots two bundles through one scripted session and
                            diffs 24 observation groups — the migration gate
build.js · ship.js          bundle both gates · bump-and-verify release step
```

Real ES modules, bundled by esbuild. Execution order is the import graph;
`build.js` generates `src/manifest.js` (gitignored) importing every
`tools/*/index.js`, so **a new tool is one new folder and nothing else** —
the same bundle ships as the userscript and as the extension's
`content.js`, byte-identical, with a suite assertion locking the identity.

## Adding a tool

Make `src/tools/zindex/` with an `index.js`:

```js
import { defineTool } from '../../core/registry.js';
import { badge } from './badge.js';

defineTool({
  id: 'zindex',
  icon: '<svg viewBox="0 0 24 24" …>…</svg>',   // an inline Lucide SVG, declared as a literal
  title: 'Stacking — z-index & position',
  badge,
});
```

and put `badge()` in `badge.js` beside it. That is everything — the button,
⚙ rows, right-click menu, report and audit arrive through the registry. Grow
it by adding files to the folder: `rule.js` + `draw.js` to produce findings,
`options()` for settings, `legend()` to document its marks, `service.js` for
its backend, `watch()`/`unwatch()` if it needs a runtime — never by editing
anything outside its folder.

## Rules the audit and the suite enforce

- `core/utils.js` is pure — it never reads state, builds DOM, or owns markup.
- No tool imports or names another — no `Tools.byId('grid')`, no
  `t.id === 'grid'`. Capabilities ride in through hook contexts (`redraw`,
  `marks`, `toClipboard`); a lens reaches the tools, the tools never reach
  back.
- A tool imports only `core/`, `subjects/` and its own folder — a backend two
  tools want is a SUBJECT.
- Every name in `HOOKS` is consumed by some core file — no hook exists that
  nothing would ever call.
- `ui/web-panel.js` never touches state and never learns what a "pair" is;
  `ui/` never imports `app/`.
- Every class the overlay emits or styles carries the `debug-overlay-` namespace, and
  the suite proves a hostile host stylesheet changes nothing — our elements
  live in the page's cascade, and a bare class name is an invitation.
- A rule must show WHERE (findings mark and label their elements), a tool must
  be worth arming alone, and a count that matters rests instead of flashing.

Each rule is there because that boundary was broken once already.
