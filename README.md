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
tag — which works because the userscript grants nothing and uses no `GM_*`
API. `build.js --watch` runs alongside it, and the page reloads itself when a
rebuild lands, so saving a file in `src/` is the entire loop.

The page carries something for each tool on purpose: padding and gaps off the
the spacing grid, a paragraph that fails AA contrast, and boxes worth measuring
between.

Open it in a **real browser tab**. The bundle skips frames by design
(`00-banner.js`), so an embedded editor preview renders the page with no
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
page's own object. Two things in `src/00-banner.js` exist because of it:

- the frame check reads `window.frameElement` rather than comparing
  `window.top` to `window.self` — that comparison can be true in the *top*
  frame under a sandbox, which would disable the overlay everywhere, silently.
  `@noframes` covers the cross-origin frames the script cannot recognise.
- the single-instance guard asks the **document** for an existing root, not
  just a flag on `window`. A re-injection on soft navigation can arrive with a
  fresh sandbox and the same page.

`Store` in `src/02-state.js` falls back to `localStorage` wherever the GM API
is absent — the dev page, the tests, a manager that does not implement it — and
adopts anything already in `localStorage` on first run, so upgrading does not
reset what you had.

---

## Layout

```
src/
  00-banner.js        IIFE open + single-instance guard
  01-config.js        every tunable number and key
  02-state.js         single source of truth, plain data
  03-utils.js         pure helpers (no DOM, no state)
  04-measure.js       dimension-line geometry, tool-agnostic
  05-registry.js      TOOLS array + defineTool() + Tools helper
  tools/
    10-measure.js     sizes, spacing, distances  ← copy this as a template
    20-grid.js        off-grid value warnings
    30-contrast.js    WCAG contrast ratio
    40-dupid.js       duplicate ids — a whole-page question
  06-styles.js        core CSS (tools carry their own)
  07-dom.js           root + drawing layer
  08-panel.js         control panel: drag, snap, tuck, pin list
  09-placement.js     collision-free badge positioning
  10-badges.js        composes badges from active tools
  11-renderer.js      draws one frame from state
  12-report.js        structured text export
  13-interactions.js  page-level mouse and keyboard
  14-controller.js    the only glue between modules
  15-sweep.js         runs every rule over every visible element
  99-boot.js          wiring + IIFE close
```

Files are concatenated in filename order, with `src/tools/*` inserted right
after `05-registry.js`. Adding a file needs no build config change.

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
narrowly — `50-pick.js` takes only Ctrl/⌘+clicks — because a tool that swallows
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

- `03-utils.js` is pure — it never reads state, builds DOM, or owns markup.
- No file in `src/tools/` names another tool — no `Tools.byId('grid')`, no
  `t.id === 'grid'`. A lens reaches the tools; the tools never reach back.
- Every name in `HOOKS` is consumed by some file — no hook exists that
  nothing would ever call.
- `04-measure.js` knows only rectangles, never tools or the panel.
- `08-panel.js` never touches state and never learns what a "pair" is.
- `11-renderer.js`, `13-interactions.js`, `14-controller.js` never hardcode a
  tool id; they go through hooks and `CONFIG.PIN_KIND`.

Each rule is there because that boundary was broken once already.
