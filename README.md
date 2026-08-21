# Debug Overlay

A screenshot-friendly UI inspector that runs on any page via Tampermonkey.
Hover to read sizes, Shift+click two elements to measure between them, then
copy a structured report to paste into an AI chat alongside the screenshot.

Edited as many small files, shipped as one userscript that every machine
updates by itself after a `git push`.

---

## Everyday use

```bash
npm install            # once — jsdom (tests) + esbuild (bundler)
npm run dev            # local page + rebuild on save — look at it first
npm run check          # rebuild (no bump) + architecture rules + fake-DOM boot
node build.js          # patch bump + bundle + syntax check
node build.js --minor  # feature bump
```

`npm run check` deliberately builds with `--same`, so verifying a change never
inflates the version. The bump belongs to the release step — `node build.js` —
right before you commit.

Then:

```bash
git add -A && git commit -m "measure: fix diagonal spans" && git push
```

Every machine picks the new version up on its own. No copy-paste.

---

## Seeing a change before shipping it

Tampermonkey is production: it only ever runs what has been built, bumped,
committed and pushed. For anything visual that round trip is far too slow, so
there is a local one:

```bash
npm run dev        # http://localhost:8080  (PORT=3000 npm run dev to move it)
```

It serves `development/index.html` with the built bundle loaded by a plain `<script>`
tag. The script asks for `GM_getValue`/`GM_setValue` but never assumes them —
`Store` falls back to `localStorage`, which is what happens here. `build.js --watch` runs alongside it, and the page reloads itself when a
rebuild lands, so saving a file in `src/` is the entire loop.

The page carries something for each tool on purpose: padding and gaps off the
the spacing grid, a paragraph that fails AA contrast, and boxes worth measuring
between.

Open it in a **real browser tab**. The bundle skips frames by design
(`banner.js`), so an embedded editor preview renders the page with no
overlay at all — the page says so if it detects it is framed.

The dev loop never bumps the version: `--watch` builds with `--same`, so it
cannot burn version numbers that Tampermonkey would then skip past.

---

## Setup

The repo side is done: `ABC-LEGACY-LLC/debug-overlay` is public (public
matters — Tampermonkey fetches the raw URL without credentials) and
`userscript.json` already points at it:

```json
"rawBase": "https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/script"
```

**Install once per machine** — open this URL in the browser:

```
https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/script/debug-overlay.user.js
```

The repo was once `AlonurKomilov/debug-overlay-abc`, and GitHub still redirects
that name here. Do not use it: the redirect dies the moment anyone creates a
repo at the old address, and a dead `@updateURL` fails the way this project
fails worst — silently, with the overlay simply never changing.

Tampermonkey offers to install it. Done — that machine now self-updates.

### The second gate: an unpacked browser extension (optional)

The same build also emits `dist/browser-extension/` — a Manifest V3 extension whose
`content.js` is byte-for-byte the userscript's bundle (a suite assertion
locks that). For machines where you would rather not run a userscript
manager:

1. Download the one link:
   `https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/browser-extension/debug-overlay-extension.zip`
2. Extract it somewhere permanent (e.g. `~/debug-overlay-extension/`)
3. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → that folder

That is the floor the browser allows: Chrome refuses URL-installs outside its
store, but happily loads an extracted folder. After the one-time updater
setup below, every later update is one press inside the overlay.

Updates: the userscript self-updates on push. The unpacked extension has its
own SELF-UPDATER — one-time setup on its options page ("grant Debug Overlay its
install folder", the browser's File System Access permission), and from then
on the ⏻ update menu's "Update to vX" opens the updater, one press fetches
the new files from the repo, writes them, and reloads the extension. Rules it
lives by: only the pinned repo base, only a version that increases, fetch
everything before writing anything, and never silently — that is the store's
job. Load a COPY of `dist-extension/` from outside the repo (the updater writes
files, and writes inside a checkout would dirty it). Firefox has no File
System Access API, so there the notification means `git pull`.

**Optional but recommended — Tampermonkey Sync.** Dashboard → Settings →
Sync to Google Drive / Dropbox / OneDrive. A brand-new machine then only needs
you to sign in; the script arrives on its own and keeps updating from GitHub.

Forking this for a different account? Change `rawBase` in `userscript.json`,
run `node build.js`, and push — the header is generated from that one field.

### What lives where in dist/

```
dist/
  script/                the userscript — canonical home
    debug-overlay.user.js
    debug-overlay.meta.js
  browser-extension/     the extension gate
    manifest.json  content.js  sw.js  options.html  options.js
    debug-overlay-extension.zip     ← the one-link install
  debug-overlay.user.js  LEGACY BRIDGE — never delete: installs from before
  debug-overlay.meta.js  the restructure poll this path forever; these
                         byte-identical copies point at script/, so an old
                         install's next update migrates it automatically
```

### How the auto-update actually works

`build.js` writes two files into `dist/`:

| file | purpose |
|---|---|
| `debug-overlay.user.js` | the script itself (`@downloadURL`) |
| `debug-overlay.meta.js` | header only (`@updateURL`) — a few hundred bytes, so update checks are cheap |

Tampermonkey periodically fetches the meta file and **only installs the new
version if `@version` is higher**. That is why `build.js` bumps the version
automatically — forgetting to bump is the classic reason "I pushed but nothing
updated".

Two things to expect:

- GitHub's raw CDN caches for a few minutes, so updates are not instant.
  Tampermonkey dashboard → the script's row → *Check for updates* forces it.
- Chrome requires **Developer mode** (`chrome://extensions`) for Tampermonkey
  to run userscripts at all under Manifest V3.

### What syncs

Panel position, which tools are armed, and everything chosen under ⚙ are kept
with `GM_setValue`, which is scoped to the **script** rather than to one
origin. Choose an 8px grid on one site and every other site already knows. They
ride Tampermonkey's own sync to a new machine too, so a fresh laptop needs the
sign-in and nothing else.

This is why the header carries `@grant GM_getValue` / `@grant GM_setValue`
instead of `@grant none`. `localStorage` is scoped to one origin, and with
`@match *://*/*` that meant every new domain started from the defaults again —
a setup step handed back to the user on each site they visited.

The grant is not free. Asking for any GM API moves the script from page context
into the manager's **sandbox**, where `window` is a wrapper rather than the
page's own object. Two things in `src/banner.js` exist because of it:

- the frame check reads `window.frameElement` rather than comparing
  `window.top` to `window.self` — that comparison can be true in the *top*
  frame under a sandbox, which would disable the overlay everywhere, silently.
  `@noframes` covers the cross-origin frames the script cannot recognise.
- the single-instance guard asks the **document** for an existing root, not
  just a flag on `window`. A re-injection on soft navigation can arrive with a
  fresh sandbox and the same page.

`Store` in `src/core/state.js` falls back to `localStorage` wherever the GM API
is absent — the dev page, the tests, a manager that does not implement it — and
adopts anything already in `localStorage` on first run, so upgrading does not
reset what you had.

---

## Architecture

[ARCHITECTURE.md](ARCHITECTURE.md) is the reference: the pipeline (input →
components → services → your eyes), the three species derived from hooks
(COMPONENT / SOURCE / ACTION), the four SERVICES a component fills from inside
its own file, the three layers of every surface, and what `audit.js` enforces
about each. `npm run map` prints
the living version from the same shared definition (`hooks.js`).

## Layout

```
src/
  banner.js            the guard — injected by build.js around the bundle
  boot.js              the entry module: init order + wiring
  tools/               ← one FOLDER per armable TOOL, auto-discovered
    colour/            ← DOMAIN folder (no index.js): the colour family
      contrast/        index · service (Colour) · badge · rule · draw · report
    geometry/          ← DOMAIN folder: the geometry family
      measure/         index · badge · report · draw
    dupid/             index · badge · rule · draw · report
    grid/              index · service (Scale) · badge · lens · rule · draw
                       · report · options
    pin/               index · keep — SELECTION chooses, this KEEPS the choice
    select/            index · service · form · rows
  services/            the four collectors — never edited for a new tool
    badge/  findings/  report/  settings/
  subjects/
    geometry.js        shared drawing maths — measure and select both consult it
  core/                config · state+Store · utils · registry
  ui/                  styles · dom · controls · list · panel · placement
                       · renderer
  app/                 interactions · controller
```

Real ES modules, bundled by esbuild into the same single userscript. Execution
order is the import graph; `build.js` generates `src/manifest.js` (gitignored)
importing every `tools/*/index.js`, so a new tool is one new folder
and nothing else. The migration that produced this tree was verified phase by
phase with `node compare.js <old> <new>` — one scripted session, 24
observation groups, zero behavioural differences end to end.

## Adding a tool

Make `src/tools/zindex/` with an `index.js`:

```js
import { defineTool } from '../../core/registry.js';
import { badge } from './badge.js';

defineTool({
  id: 'zindex',
  icon: '≡',
  title: 'Stacking — z-index & position',
  badge,
});
```

and put `badge()` in `badge.js` beside it. That is everything — the button,
⚙ rows, right-click menu and report arrive through the registry. Grow it by
adding files to the folder (`rule.js`, `draw.js`, `service.js` for its
backend), never by editing anything outside it.

## Rules the audit enforces

- `core/utils.js` is pure — it never reads state, builds DOM, or owns markup.
- No component imports or names another — no `Tools.byId('grid')`, no
  `t.id === 'grid'`. A lens reaches the tools; the tools never reach back.
- Every name in `HOOKS` is consumed by some file — no hook exists that
  nothing would ever call.
- `subjects/geometry.js` knows only rectangles, never tools or the panel.
- `ui/panel.js` never touches state and never learns what a "pair" is.
- `ui/renderer.js`, `app/interactions.js`, `app/controller.js` never hardcode a
  tool id; they go through hooks and `CONFIG.PIN_KIND`.

Each rule is there because that boundary was broken once already.
