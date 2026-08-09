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
npm run check          # rebuild (no bump) + architecture rules + fake-DOM boot
node build.js          # patch bump + bundle + syntax check
node build.js --minor  # feature bump
node build.js --watch  # rebuild on save (no bump — local testing)
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

## Setup

The repo side is done: `AlonurKomilov/debug-overlay-abc` is public (public
matters — Tampermonkey fetches the raw URL without credentials) and
`userscript.json` already points at it:

```json
"rawBase": "https://raw.githubusercontent.com/AlonurKomilov/debug-overlay-abc/main/dist"
```

**Install once per machine** — open this URL in the browser:

```
https://raw.githubusercontent.com/AlonurKomilov/debug-overlay-abc/main/dist/debug-overlay.user.js
```

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

### What does *not* sync

Panel position and which tools are active live in `localStorage`, per browser
profile and per site. To sync those too, switch `localStorage` in
`src/08-panel.js` and `src/14-controller.js` to `GM_setValue` / `GM_getValue`
and add the matching `@grant` lines in `build.js`.

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
  06-styles.js        core CSS (tools carry their own)
  07-dom.js           root + drawing layer
  08-panel.js         control panel: drag, snap, tuck, pin list
  09-placement.js     collision-free badge positioning
  10-badges.js        composes badges from active tools
  11-renderer.js      draws one frame from state
  12-report.js        structured text export
  13-interactions.js  page-level mouse and keyboard
  14-controller.js    the only glue between modules
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

Available hooks, all optional: `badge`, `compact`, `report`, `reportTail`,
`draw`, `listRows`, `pendingIndex`, `css`.

## Rules the audit enforces

- `03-utils.js` is pure — it never reads state and never builds DOM.
- `04-measure.js` knows only rectangles, never tools or the panel.
- `08-panel.js` never touches state and never learns what a "pair" is.
- `11-renderer.js`, `13-interactions.js`, `14-controller.js` never hardcode a
  tool id; they go through hooks and `CONFIG.PIN_KIND`.

Each rule is there because that boundary was broken once already.
