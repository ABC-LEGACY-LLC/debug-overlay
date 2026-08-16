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
- Tunable numbers go in `src/01-config.js`. Never inline a magic number. If it
  is a number a *user* would want different on their project — a grid step, a
  threshold — CONFIG holds the default and the tool exposes it via `options()`
  so nobody needs a rebuild to change their mind.
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
- A tool declares nothing about what it IS. Its hooks are the declaration,
  and everything dispatches on them via `Tools.withHook(name, armed)`. There
  was a `kind` field; it could only repeat what the hooks said, and one label
  per tool made roles exclusive for no reason. Roles compose — grid decorates
  other tools' numbers *and* produces findings.
- Every name in `HOOKS` must be consumed by some file. A hook nothing calls
  is a contract nobody honours: a tool could implement it, pass the audit,
  and never run.

## The panel is the only control surface
One install link, and everything after it is handled by the update chain — so
anything a user can change has to be reachable from the panel. A tool that
needs a rebuild to configure has moved a setup step back onto them.

`options()` is that hook: `[{ key, label, values, def, suffix }]`, one row each
under ⚙, read back with `Tools.setting(this, 'key')`. Three things it must keep
doing, each of which was a real way to get it wrong:

- **Defaults resolve once, at boot** (`Controller.loadSettings`), so
  `Tools.setting` stays a lookup. Grid asks per number on pages with thousands.
- **A saved value only survives if the tool still offers it**, and a live value
  the tool does not list is carried into the picker as its own choice. Falling
  back to choice 0 leaves the picker showing one thing while the rule uses
  another — a control lying about what it controls.
- **Changing a setting clears `State.sweep`.** Those findings were judged under
  the old value, and a stale audit is the same lie here as after the page moves.

Nothing may state a setting's value where it will not be re-read: grid's title
said "2px" and contrast's said "(AA)", and both would have gone on saying it
after the user chose otherwise. Put the live value in the message, not the
label.

`audit.js` fails a tool with no `icon` or `title` — the panel paints both
straight into the bar, and a button reading `undefined` is not a control.

## We run in a sandbox now, so never ask a window who it is
The header grants `GM_getValue`/`GM_setValue`, because `localStorage` is scoped
to one origin and `@match` is every site — so everything the user chose was
chosen again on the next domain. `Store` (in `02-state.js`) is the only way to
persist anything; it falls back to `localStorage` where the API is absent (dev
page, tests) and adopts existing `localStorage` values on first run, so an
upgrade never resets somebody. Do not call `localStorage` directly again.

Asking for any GM API moves the script into the manager's sandbox, where
`window` is a wrapper around the page's. Two consequences, both already handled
in `00-banner.js` and both silent if reintroduced:

- **Never compare window identities.** `window.top !== window.self` can be true
  in the *top* frame under a sandbox — the overlay would vanish everywhere and
  report nothing. The frame check reads `window.frameElement`, which is null at
  top level in every context, and `@noframes` handles cross-origin frames.
- **Ask the document, not a flag.** A soft-navigation re-injection can arrive
  in a fresh sandbox with the same page, so the single-instance guard looks for
  an existing `#__dbgov-root` before it trusts `window.__DBG_OVERLAY__`.

Anything else that assumed page context is now suspect. `unsafeWindow` reaches
the real page window if something ever genuinely needs it — nothing does yet.

## The version has to be visible
`@grant none` means no `GM_info`, so `src/01-config.js` carries a `__VERSION__`
placeholder that `build.js` substitutes into the bundle, and the panel shows it
in the ⏻ tooltip. The build **fails** if the placeholder is missing. Do not
hand-write a version into `src/` — that is a second copy, and it will drift
from `userscript.json`. This exists because a stale install and a current one
otherwise look identical, which is the same failure as a dead `@updateURL`
seen from the other end.

## A rule has three answers, not two
Pass, fail, and **`verdict: 'review'`** — I tried and could not tell. The third
is not a nicety: silence was the first fix and it turned out to be its own
lie. Scraping numbers out of `oklch(0.985 0 0)` read near-white as near-black
and shipped `1.00:1 FAIL`; going quiet instead stopped the wrong answer but
folded every unmeasurable element in with the passes, so a page of
gradient-backed text audited clean.

Distinguish *not applicable* from *not known*. An element with no text has no
contrast to have — that is silence, correctly. A colour space we cannot read,
a gradient behind the text, a missing canvas: those are reviews, and each
carries a reason the reader can act on. Get this wrong in the other direction
and every container on the page becomes a review row.

Reviews group by reason and sort below anything measured, so two hundred
elements over one gradient are one line, under the things you can act on.

So contrast resolves a colour by painting one pixel of it on a 1×1 canvas and
reading the bytes back — the browser knows every colour space, this file does
not have to. `_colour()` returns null for anything still unreadable, `_bg()`
returns null rather than falling through to its white default when it meets
one, and `_measure()` treats either as "say nothing". Results are memoised by
string: a page has tens of colours and thousands of nodes.

That is also why the colour helpers live in the tool and not in `03-utils.js`
— reading a colour honestly needs the DOM, and utils may not have it. Each of
them only ever had one caller.

## The sweep
`15-sweep.js` runs every active `rule` over every visible element in one
read-only pass. It stays tool-agnostic: it gates on `display`/`visibility`/
`opacity`, reads `getComputedStyle` once per element and hands that same
object to the rules, and asks nothing else about them.

Two things carry the cost. `U.info`'s `r` is a getter, so a rule that only
reads colours never triggers a layout read — over a page that is thousands of
them. And `Sweep.group` collapses findings by `key` before anyone sees them:
15 000 elements can yield 5 000 raw findings that are *one* problem repeated,
and a list nobody can read is a list nobody uses. Measured: 5 000 → 1 line.

`getComputedStyle` is ~77% of the pass, so before optimising anything else,
check whether you are adding calls to it.

## The stylesheet (test.js enforces this)
A CSS parser raises nothing when it gives up. It drops the broken rule and
every rule after it **in that sheet**, silently. Everything used to be
concatenated into one sheet, so an unclosed `(` in grid cost grid *and*
contrast their styling entirely — that shipped once. Measured again while
splitting them: one broken paren in grid took contrast's 8 rules with it.

`07-dom.js` now emits one `<style data-tool="…">` per tool plus one for the
core, so the blast radius is the author's own file. `test.js` checks every
sheet separately — braces and parens balance, and the parsed rule count
matching what was written — and names the tool that broke. Keep those checks,
and keep the sheets separate.

## Versioning
`build.js` bumps `@version` automatically. Tampermonkey only updates when the
version increases, so never hand-edit the version in `userscript.json` down,
and never commit `dist/` without running the build.

## Escalate to the human instead of guessing
- A change that would require relaxing an audit rule.
- Anything touching `@match`, `@grant`, or the update URLs.
- Restructuring sections or renaming files (build order depends on filenames).
