# Working on dbgov with Claude Code

`npm install` once — jsdom, for the smoke test. Nothing else is needed.

## Before finishing any change
Run `npm run check` — it rebuilds, runs the architecture audit and the jsdom
smoke test. Do not consider a change done until all three pass.

Edit `src/`. Never edit `dist/` — the next build overwrites it.

## Shipping a change (this is where it goes wrong)
`npm run check` builds with `--same`, so it does **not** bump the version.
A green check does not mean a push will reach anybody. The full sequence:

```bash
npm run check     # verify — no bump
node build.js     # bump + rebuild dist/  ← skipping this is the whole bug
git add -A && git commit -m "…" && git push
```

Push without `node build.js` and the version Tampermonkey sees is the one it
already has, so it decides there is nothing to fetch. The push succeeds, the
overlay never changes, and nothing reports an error. If a change appears not
to reach the browser, check `@version` in `dist/debug-overlay.meta.js` first.

## Looking at a change before shipping it
`npm run dev` serves `dev/index.html` with the built bundle and rebuilds on
save. Tampermonkey is production — it only ever sees pushed, version-bumped
builds — so use the dev page for anything visual.

The page carries deliberate fodder for every tool: off-grid padding and gaps,
a failing contrast ratio, boxes to measure between. Open it in a real browser
tab: the bundle skips frames, so an embedded editor preview shows nothing.

## Where things go
- A new debug capability is a NEW FILE in `src/tools/`, never an edit to the
  renderer, panel or controller. If you feel the urge to edit those to add a
  tool, the tool needs a new hook instead — add the hook generically.
- Tunable numbers go in `src/01-config.js`. Never inline a magic number.
- Tool-specific CSS goes in that tool's `css:` field, not `src/06-styles.js`.

## Boundaries (audit.js enforces these)
- `03-utils.js` — pure. No `State.`, no DOM creation, no markup. Callers hand
  in a decorator; the tool that styles a class is the tool that emits it.
- `04-measure.js` — rectangles only. No `Tools.`, no `Panel.`.
- `08-panel.js` — no `State.`, and it must not know what a "pair" is. It
  fires callbacks; the controller handles them.
- `11-renderer.js` / `13-interactions.js` / `14-controller.js` — never
  hardcode a tool id such as `'measure'`. Use hooks and `CONFIG.PIN_KIND`.
  The banned ids are derived from what is registered, so a fourth tool is
  guarded the day it lands.
- `src/tools/*` — no tool names another tool. No `Tools.byId('grid')`, no
  `t.id === 'grid'`. Ask the registry a question with no id in it; a lens
  reaches the tools, the tools never reach back.
- Every tool declares `kind: 'instrument' | 'rule' | 'lens'`, and the audit
  checks it against the hooks the file implements — `annotate` ⇒ lens,
  `audit` ⇒ rule — so the field cannot quietly become a lie.

## A rule that cannot measure says nothing
Silence is a valid answer and the only safe one. `U.parseColor` returns null
for any colour it does not actually understand, and `U.effectiveBg` returns
null rather than falling through to its white default when it meets one — so
contrast skips the element instead of scoring it against a background that
was never there. Scraping numbers out of `oklch(0.985 0 0)` read near-white
as near-black and shipped `1.00:1 FAIL` for text that is fine. A quiet rule
is recoverable; a confidently wrong one teaches you to distrust all of them.

## The stylesheet (test.js enforces this)
Every tool's `css:` is concatenated into one sheet, so malformed CSS in an
early tool makes the parser drop everything after it — including other tools'
rules — without raising anything. That shipped once: an unclosed `(` cost the
grid and contrast tools their styling entirely. `test.js` now checks braces
and parens balance, that the parsed rule count matches what was written, and
that the last tool's CSS survives. Keep those checks.

## Versioning
`build.js` bumps `@version` automatically. Tampermonkey only updates when the
version increases, so never hand-edit the version in `userscript.json` down,
and never commit `dist/` without running the build.

## Escalate to the human instead of guessing
- A change that would require relaxing an audit rule.
- Anything touching `@match`, `@grant`, or the update URLs.
- Restructuring sections or renaming files (build order depends on filenames).
