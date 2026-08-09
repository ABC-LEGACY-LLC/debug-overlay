# Working on dbgov with Claude Code

## Before finishing any change
Run `npm run check` — it rebuilds, runs the architecture audit and the jsdom
smoke test. Do not consider a change done until all three pass.

## Where things go
- A new debug capability is a NEW FILE in `src/tools/`, never an edit to the
  renderer, panel or controller. If you feel the urge to edit those to add a
  tool, the tool needs a new hook instead — add the hook generically.
- Tunable numbers go in `src/01-config.js`. Never inline a magic number.
- Tool-specific CSS goes in that tool's `css:` field, not `src/06-styles.js`.

## Boundaries (audit.js enforces these)
- `03-utils.js` — pure. No `State.`, no DOM creation. Callers pass flags in.
- `04-measure.js` — rectangles only. No `Tools.`, no `Panel.`.
- `08-panel.js` — no `State.`, and it must not know what a "pair" is. It
  fires callbacks; the controller handles them.
- `11-renderer.js` / `13-interactions.js` / `14-controller.js` — never
  hardcode a tool id such as `'measure'`. Use hooks and `CONFIG.PIN_KIND`.

## Versioning
`build.js` bumps `@version` automatically. Tampermonkey only updates when the
version increases, so never hand-edit the version in `userscript.json` down,
and never commit `dist/` without running the build.

## Escalate to the human instead of guessing
- A change that would require relaxing an audit rule.
- Anything touching `@match`, `@grant`, or the update URLs.
- Restructuring sections or renaming files (build order depends on filenames).
