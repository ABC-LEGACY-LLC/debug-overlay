# dbgov — Debug Overlay

A screenshot-friendly UI inspector that runs on any page via Tampermonkey.
Hover to read sizes, Shift+click two elements to measure between them, then
copy a structured report to paste into an AI chat alongside the screenshot.

Edited as many small files, shipped as one userscript that every machine
updates by itself after a `git push`.

---

## Everyday use

```bash
npm install            # once — jsdom, for the smoke test
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

It serves `dev/index.html` with the built bundle loaded by a plain `<script>`
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
"rawBase": "https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist"
```

**Install once per machine** — open this URL in the browser:

```
https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/debug-overlay.user.js
```

The repo was once `AlonurKomilov/debug-overlay-abc`, and GitHub still redirects
that name here. Do not use it: the redirect dies the moment anyone creates a
repo at the old address, and a dead `@updateURL` fails the way this project
fails worst — silently, with the overlay simply never changing.

Tampermonkey offers to install it. Done — that machine now self-updates.

**Optional but recommended — Tampermonkey Sync.** Dashboard → Settings →
Sync to Google Drive / Dropbox / OneDrive. A brand-new machine then only needs
you to sign in; the script arrives on its own and keeps updating from GitHub.

Forking this for a different account? Change `rawBase` in `userscript.json`,
run `node build.js`, and push — the header is generated from that one field.

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
  banner.js            opens the closure + single-instance guard
  core/
    config.js          every tunable number and key
    state.js           State, plus Store — the part that outlives the page
    utils.js           pure helpers (no DOM, no state)
    geometry.js        dimension-line geometry, tool-agnostic
    registry.js        defineTool(), the Tools helpers, the four ROLES
  subjects/            ← auto-discovered; shared measurement + its settings
    colour.js          colour resolution, the cache, and the WCAG level
    scale.js           what counts as on-grid, and step/max/boxes
  tools/               ← auto-discovered; one file per capability
    contrast.js        WCAG contrast ratio
    dupid.js           duplicate ids — a whole-page question
    grid.js            off-grid value warnings
    measure.js         sizes, spacing, distances  ← copy this as a template
    pick.js            Ctrl+click copies a selector
    select.js          how pinned elements group up
  ui/
    styles.js          core CSS (tools carry their own)
    dom.js             root + drawing layer
    controls.js        one widget from a description of it
    list.js            the popover the panel opens
    panel.js           the bar: buttons, drag, snap, tuck
    placement.js       collision-free badge positioning
    badges.js          composes badges from active tools
    renderer.js        draws one frame from state
  app/
    report.js          structured text export
    interactions.js    page-level mouse and keyboard
    controller.js      the only glue between modules
    settings.js        the ⚙ view, and what a tool's options mean
    sweep.js           runs every rule over every visible element
  boot.js              wiring, start, and the closing brace
```

The bundle is **one IIFE with no imports**, so load order is a real dependency:
`banner.js` opens the closure, `boot.js` closes it, and a file evaluated too
early is a `ReferenceError` at boot — a blank overlay on every site.

That order lives in **`ORDER` in `build.js`**, and nowhere else. It used to be
encoded in numeric filename prefixes, which made renaming dangerous, meant the
same convention said *load order* in `src/` and *display order* in
`src/tools/`, and left folders unusable for anything ordered.

Adding a core file means putting it in `core/`, `ui/` or `app/` **and** into
`ORDER` at the point its dependencies allow. The build fails if it is in one
and not the other, in either direction — a file that exists but ships in no
bundle is exactly the kind of silence this project keeps designing out.

`tools/*` is still globbed, so **a new tool is one new file and nothing else**.
No filename anywhere carries a number now. Where a tool appears in the bar is
derived from the first ROLE it fills, then by id — so the order is a fact about
what a component does, not about how it was spelled, and it cannot go stale
against the thing it describes.

## Adding a tool

Create `src/tools/40-yourtool.js`:

```js
defineTool({
  id: 'zindex',
  icon: '⧉',
  title: 'Stacking — z-index & position',
  css: `
    .dbgov-badge .zi { color: #ffb86c; }
  `,
  badge:   (i) => `<span class="zi">z ${i.cs.zIndex}</span>`,
  compact: (i) => (i.cs.zIndex === 'auto' ? null : `<span class="zi">z ${i.cs.zIndex}</span>`),
  report:  (i) => [`  z-index: ${i.cs.zIndex} | position: ${i.cs.position}`],
});
```

Then `node build.js`. The panel button, persistence, badge composition and
report inclusion all follow from the registry — no other file changes.

A tool declares no type. The hooks it implements are what it is, and it may
have any combination of them — `grid` decorates the numbers other tools print
*and* produces findings, which one label per tool could never express.

A `rule`'s `audit(info)` returns `{ el, verdict, severity, rule, message, key }`
and says nothing when the element is fine. `verdict` is `fail` or `review` —
a rule that could not measure something has to say so, or an unreadable page
reports clean. Findings are grouped by `key` and ranked worst-first, reviews
last, so a nav of 40 identical links is one line, not forty.

The ⌕ button audits the whole page. It runs every rule that exists, armed or
not: arming decides what is drawn on screen, never what is checked.

Available hooks, all optional: `badge`, `compact`, `report`, `reportTail`,
`draw`, `listRows`, `pendingIndex`, `annotate`, `audit`, `auditPage`,
`options`, `intercept`, `css`.

`startsOn: true` arms the tool on a fresh install. It is a field on the tool
rather than a list in `CONFIG`, so shipping a tool never means editing a core
file to name it.

`intercept({ type, ev, el })` is the only hook that **acts** on the page rather
than describing it. Armed tools are offered each click before it becomes a pin;
returning true means the click was yours and no pin lands underneath. Claim
narrowly — `pick.js` takes only Ctrl/⌘+clicks — because a tool that swallows
every click has taken the overlay away from everything else.

`options()` makes a tool adjustable without a rebuild — one row each under the
panel's ⚙, read back with `Tools.setting(this, 'key')`:

```js
options() {
  return [{ key: 'step', label: 'Grid step', def: CONFIG.GRID,
            values: [1, 2, 4, 8], suffix: 'px', affects: 'detect' }];
}
```

`affects` is the one category in this codebase that is declared rather than
derived — `select`, `inspect`, `detect` or `act`. A tool's own **roles** come
from its hooks and are never written down; no hook, though, can tell you
whether a knob is a detection threshold or a display preference. The ⚙ view
groups on it, and the audit fails an option that omits it. Options also come in
three shapes: `values:` for a picker, `type: 'number'` with `min`/`max`/`step`,
and `type: 'toggle'`.

`def` belongs in `CONFIG`, so that file still says what a fresh install does
while the panel says what this one is doing now. Never state the value in a
`title` or a rule's `help` — those are built once and would go on claiming the
old number. Changing an option clears the last sweep, because those findings
were judged under the previous value.

Three kinds of option, so a setting is not forced into a list it does not fit:

| declared | control |
|---|---|
| `values: [1, 2, 4, 8]` | a picker |
| `type: 'number', min, max, step` | a threshold you type |
| `type: 'toggle'` | on or off |

`audit(info)` judges one element; `auditPage(all)` runs once per sweep with
every visible element, for questions no single element can answer. A tool's
`rules` map documents each rule it owns — the report prints that under every
finding, so a copied report explains itself.

## Rules the audit enforces

- `core/utils.js` is pure — it never reads state, builds DOM, or owns markup.
- No file in `src/tools/` names another tool — no `Tools.byId('grid')`, no
  `t.id === 'grid'`. A lens reaches the tools; the tools never reach back.
- Every name in `HOOKS` is consumed by some file — no hook exists that
  nothing would ever call.
- `core/geometry.js` knows only rectangles, never tools or the panel.
- `ui/panel.js` never touches state and never learns what a "pair" is.
- `ui/renderer.js`, `app/interactions.js`, `app/controller.js` never hardcode a
  tool id; they go through hooks and `CONFIG.PIN_KIND`.

Each rule is there because that boundary was broken once already.
