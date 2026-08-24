# Working on Debug Overlay with Claude Code

`npm install` once — jsdom (smoke test) and esbuild (the bundler).

## Before finishing any change
Run `npm run check` — it rebuilds, runs the architecture audit and the jsdom
smoke test. **Judge it by the exit code, never by reading the output.** A
crashing suite prints a stack trace and no `✗` at all, so grepping the output
for failures finds none and calls it green — that shipped twice, and half the
assertions had not run either time. `test.js` now prints `✗ SUITE CRASHED` on
an uncaught throw, but the exit code is still the only thing that cannot lie.

Edit `src/`. Never edit `dist/` — the next build overwrites it.

## Shipping a change
```bash
npm run ship      # verify, bump, rebuild — refuses if the version did not move
git add -A && git commit -m "…" && git push
npm run shipped   # did it actually reach the URL Tampermonkey reads?
```

`npm run check` builds with `--same`, so it does **not** bump. A green check
does not mean a push will reach anybody: Tampermonkey only fetches on a HIGHER
`@version`, so pushing an un-bumped build succeeds, changes nothing, and
reports no error anywhere. That is why `ship` exists — it makes forgetting the
bump impossible, and `shipped` asks the update URL what the world can actually
see, which is the only answer that counts. `npm run shipped` names this exact
state ("v3.8.28 is live AND is the version sitting on your changes") and exits
non-zero.

`check` is still the right thing to run while working. `ship` is for when you
mean it.

## Looking at a change before shipping it
`npm run dev` serves `development/index.html` with the built bundle and rebuilds on
save. Tampermonkey is production — it only ever sees pushed, version-bumped
builds — so use the dev page for anything visual.

The page carries deliberate fodder for every tool: off-grid padding and gaps,
a failing contrast ratio, boxes to measure between. Open it in a real browser
tab: the bundle skips frames, so an embedded editor preview shows nothing.

## Where things go
- A new debug capability is a NEW FOLDER under `src/tools/` — an
  `index.js` that registers, hook files beside it — never an edit to the
  renderer, panel, controller or any `services/` folder. If you feel that
  urge, the component needs a new hook instead — add the hook generically.
  What a component cannot import (see the import boundaries), it receives:
  capabilities ride in through the hook ctx, like intercept's `redraw`.
- Files split when they grow two jobs, and the split keeps the caller's
  surface identical: `ui/controls.js` and `ui/list.js` came out of the panel,
  `app/settings.js` out of the controller, and `WebPanel.setList` / `WebPanel.view`
  still exist because nothing outside should have to learn that.
- **Load order is the import graph.** src/ is real ES modules; `boot.js` is
  the entry, esbuild bundles, and a new core file is imported by whoever needs
  it — no ORDER list, no prefixes. `subjects/*` and `tools/*` stay
  auto-discovered through the generated `src/manifest.js` (gitignored), so a
  new capability is still one new file. `banner.js` is NOT a module: its guard
  must abort before any module evaluates and imports hoist, so `build.js`
  injects its text at the top of the wrapper IIFE. `ui/dom.js`, `ui/list.js`
  and `ui/web-panel.js` build DOM, so they export `init*()` called from boot in
  order rather than constructing at import time.
- The 220-line advisory is per FILE, and the folder split dissolved the one
  standing exception: contrast is now index/badge/rule/draw/report plus
  `service.js` (Colour), every file under the line. A component whose single
  file grows past it splits by CONCERN inside its folder, never into a second
  component.
- A rule's bounds have two sides. `v <= max` let every negative through, so a
  page reported `-1127px` as a spacing decision while ignoring `+1127px`.
- `U.info`'s `r` is a getter. **Never destructure it in a parameter list** —
  `scan({ r, cs }, …)` evaluates it whether or not the body wants it, and turned
  a styles-only sweep into one `getBoundingClientRect` per element.
- An owner that changes the id its settings are stored under declares `was:`.
  Moving `step` from the grid tool to the scale subject silently reset everyone
  who had chosen an 8px grid; the owner names its own former id, so no core
  file holds a list of what things used to be called.
- Tunable numbers go in `src/core/config.js`. Never inline a magic number. If it
  is a number a *user* would want different on their project — a grid step, a
  threshold — CONFIG holds the default and the tool exposes it via `options()`
  so nobody needs a rebuild to change their mind.
- Tool-specific CSS goes in that tool's `css:` field, not `src/ui/styles.js`.

## The architecture reference
`ARCHITECTURE.md` is the prose map, opening with the pipeline: input side
(SOURCE select, ACTION pick) → COMPONENTS (measure, grid, contrast, dupid) →
SERVICES (badge, findings, report, settings) → your eyes. Species are derived
in `hooks.js` `bandsOf`; surfaces have three layers; the audit is a flow, not
a place. Keep it and `npm run map` agreeing by editing `hooks.js`, not either
output. A flat component list is what made every earlier matrix wrong —
select and measure are different species, not different-shaped rows.

## Two structures, on purpose — and how to see both
The **folder** says what kind of file a thing is. The **role** says what a tool
does. They are not the same axis and neither is written in the other:

| folder | what it is | where it shows up on the panel |
|---|---|---|
| `core/` | shared foundations | nowhere — no user surface at all |
| `tools/` | a capability the user can arm | its own button, and its rows under ⚙ |
| `ui/` | a surface or a widget | the panel is made of these |
| `app/` | a page-level operation, or glue | what the panel's buttons DO |

`tools/` is deliberately **not** sub-foldered by role, and will not be. A role
is DERIVED from hooks; a folder path is declared. Foldering by a derived thing
means editing a file's contents silently makes its location wrong and nothing
ever moves it — add a `badge()` to dupid and `tools/detect/dupid.js` becomes a
half-truth no test can catch. The audit cannot rescue it either: it could check
that a file in `detect/` has `audit`, but not that it has *only* detect hooks,
without banning composition. Roles are plural on purpose — grid and contrast
are each Inspect *and* Detect.

Splitting a composed tool to make role-folders work was considered and is
worse. grid's `_off(n)` reads the `step` setting and both `annotate` and
`audit` go through it; contrast's `_measure()` feeds `badge`, `compact`,
`report` AND `audit`, over a memoised `_cache` and one 1×1 canvas. Two files
could not share either, because no tool may name another — so each would
declare its own `step` / `level`, the user would set the same thing twice, and
the badge could say a value passes while the audit says it fails. Contrast
would also carry two colour caches and two canvases over a page with thousands
of nodes. The directory would be tidy and the software would be worse; that is
structure serving the filesystem instead of the problem.

When `tools/` does outgrow one directory, subdivide by **subject** — `layout/`,
`a11y/`, `content/` — which is stable and human-declared, the same reason
`core/ ui/ app/` work. `build.js` globs and `audit.js` walks `tools/`
recursively, so that move costs nothing; the audit prints an advisory past 20
files so the decision gets made rather than forgotten.

### Three layers, not two
Every surface EXISTS with no tool armed — core draws it, and a tool ADDS to it.
Miss that and the map comes out wrong: `select` looks like it owns the pin chip
because it is the only tool touching that surface, when `ui/renderer.js` draws
the outline AND the `#N` for every pin and select only appends the `…` through
`pendingIndex`. The same `#N` appears on the badge, also from the renderer.

`hooks.js` holds the hook vocabulary and the surface map, and BOTH `audit.js`
(which enforces it) and `map.js` (which prints it) read it — one definition
rather than two that agree until they quietly do not. That file exists because
this table was written by hand twice and was wrong twice.

`npm run map` boots the built bundle and prints the bar, every tool's derived
roles with the file it came from, and the grouped ⚙ view. Use it to answer
"where will this show up" instead of guessing — it asks the running registry
rather than re-deriving the roles, because a second copy of that mapping is
exactly what the `kind` field died of.

## Boundaries (audit.js enforces these)
- `core/utils.js` — pure. No `State.`, no DOM creation, no markup. Callers hand
  in a decorator; the tool that styles a class is the tool that emits it.
- `subjects/geometry.js` — rectangles only; a subject (two consumers: measure, select), and the geometry family's mark 📏.
- `ui/web-panel.js` — no `State.`, and it must not know what a "pair" is. It
  fires callbacks; the controller handles them.
- `ui/renderer.js` / `app/interactions.js` / `app/controller.js` — never
  hardcode a tool id such as `'measure'`. Use hooks and `CONFIG.PIN_KIND`.
  The banned ids are derived from what is registered, so a fourth tool is
  guarded the day it lands.
- A tool in a domain folder declares `family:`, audited to equal that folder —
  the runtime has no folders, so the declaration exists for the tooltip and
  menu title (`Colour › Contrast`), and the audit is what stops it drifting.
  The family subject's icon is the FAMILY's mark (🎨), never a member's glyph.
- A tool is the nearest folder holding an `index.js`, so domain folders
  (`tools/colour/contrast/` beside `…/palette/`) already work — grouped
  and judged correctly, proven by probe. A backend two tools want is a
  SUBJECT: the import audit fails the cross-import with the promotion steps in
  the message. A file under `tools/` that no index claims fails loudly.
- `src/tools/*` — no tool names another. No `Tools.byId('grid')`, no
  `t.id === 'grid'`. Ask the registry a question with no id in it; a lens
  reaches the tools, the tools never reach back.
- A tool declares nothing about what it IS. Its hooks are the declaration,
  and everything dispatches on them via `Tools.withHook(name, armed)`. There
  was a `kind` field; it could only repeat what the hooks said, and one label
  per tool made roles exclusive for no reason. Roles compose — grid decorates
  other tools' numbers *and* produces findings.
- The layers hold in one direction only: `core/` never mentions `WebPanel.`,
  `Render.`, `Controller.` or `Settings.`; `ui/` never mentions `Controller.`,
  `Sweep.` or `Report.`; and nothing outside `tools/` calls `defineTool()`.
  All three were true by habit before the audit checked them, which is the
  state a boundary is in right before it stops being true.
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

Options come in three kinds — `values:` for a picker, `type: 'number'` with
`min`/`max`/`step`, `type: 'toggle'` — so a setting is never forced into a list
it does not fit. A number field accepts `""` and `"e"`; `Settings.fromControl`
returns null for those and the row is redrawn from the value still in force,
because a rule must never be handed NaN.

`startsOn: true` on the tool replaced `CONFIG.DEFAULT_TOOLS`. That list named
tool ids in a core file, which made "a new tool is one new file" not quite
true; now nothing central knows the name of anything.

## Two doors into one room
Settings are reachable two ways and stored once. ⚙ renders every row grouped by
`affects`; right-clicking a tool button opens `tool:<id>`, which is the same
rows filtered to that owner. Both call `Settings.row(owner, option)` — the
second is a FILTER of the first, never a copy, so they cannot drift.

Both doors run through ONE loop (`Settings.rows(only?)`) and one row builder
(`Settings.row`) — the menu is ⚙ filtered, so grouping, headings and ORDER
cannot differ between them. The owner order is the bar's: each subject is
anchored just ahead of the first tool that `uses:` it, so "WCAG level" sits
above "Grid step" because ◐ sits before ▦ — a rule, where it used to be the
accident of alphabetical folder names.

Why both: "what is the grid step on this project" is a settings-screen
question, asked once. "Take radius off this badge" is asked mid-task, about the
tool you are already using, and making someone open a global list of everyone's
options to answer it is the wrong shape. Neither door is a menu a tool built
for itself — a tool shipped tomorrow appears in both automatically.

The view name carries the id (`tool:measure`) the way `pins` and `findings`
carry theirs: opaque to `ui/`, handed straight back, resolved by
`Controller.toolOf`. No id is written in a core file.

A tool whose settings live on a SUBJECT declares `uses: [Scale]`, and its menu
shows them. "Grid step" is grid's setting to anyone holding it; that `scale`
owns it so the lens and the rule cannot disagree is an internal matter, and
right-clicking ▦ to be told "nothing to configure" was the panel lying about
its most configurable tool. `uses:` is a dependency the tool already has —
grid literally calls `Scale.off()` — and a subject is not a tool, so this is
not one tool naming another. A tool with neither `options` nor `uses` does not
advertise the gesture at all; dupid genuinely has nothing to configure.

`audit.js` counts `key:` against `affects:` as QUOTED LITERALS, so options must
be written out rather than built by a factory or from constants — that check is
what stops an option shipping with no category, and a helper would satisfy it
once for seven.

## Subjects — shared measurement, and the settings that govern it
`src/subjects/*` holds what more than one component needs to agree about:
`scale.js` owns `step`/`max`/`boxes` and the off-grid test; `colour.js`
owns the WCAG `level`, the colour resolution, the memoised cache and the 1×1
canvas.

They moved out of grid and contrast because they were never really theirs. A
2px step is a fact about the PROJECT; the ⚠ on a badge and the finding in a
sweep are two things that consult it. Leaving it on one meant the other could
not see it, and giving each a copy would let a badge say a value passes over a
finding saying it fails — plus two colour caches resolving every colour twice
on a page with thousands of nodes.

A subject is **not a component**: no icon in the bar, no arming, no hooks. It
is called by components and calls nothing back — the same one-way rule `core/`
lives under, and `audit.js` checks it. It declares `options()` like a tool does
and `Tools.settingOwners()` collects both, so a subject's settings appear under
⚙ exactly as a tool's do.

`defineSubject` is the registration. Ids share one settings store with tools,
so the audit rejects a subject id that collides with a tool's.

## Four roles, derived — and one category that has to be declared
`ROLES` in `core/registry.js` is the vocabulary: **Select · Inspect · Detect ·
Act**. A tool's roles come from the hooks it implements and are never written
down, because a label can only repeat what the hooks say and then drift — that
is exactly how the old `kind` field died. They are also plural: grid is Inspect
*and* Detect, so anything forcing one label per tool will be wrong about most
of the toolset. `report` belongs to no role; every tool has it, so it
distinguishes nothing.

The bar's bands are the PIPELINE, top to bottom: input side (⬚ ⌖), then the
components (plain read-outs before the dotted ones), then ⌕ ⚙ in a band of
their own, then review-and-take-away. "Feeds ⌕" is the green dot per tool, not
a separator's meaning — one mark per fact. Roles stay plural in the tooltip.
Height-neutral by construction: the fourth separator was paid for by one gap
pixel (7→6px) across the bar's ~17 children, so the bar got slightly shorter.

A **setting** is the one thing that cannot be derived: no hook distinguishes a
detection threshold from a display preference. So every `options()` entry
declares `affects: '<role key>'`, the ⚙ view groups on it, and `audit.js` fails
a tool whose option count and `affects:` count disagree, or that names a role
the registry does not have. Without that check the list silently reverts to one
flat run ordered by filename.

**One tool, one role, unless it genuinely does two things.** Pairing used to
live in measure, which made it a read-out *and* the thing deciding what was
selected — and no second way of selecting could be added without editing the
tool that draws badges. `tools/select.js` owns grouping and publishes it
through `groups()`; measure asks `Tools.groups()` and measures between whatever
comes back. A lasso or a select-by-query is now one new file that every
consumer picks up, and neither side learns the other's id.

## A rule must show WHERE
`audit.js` fails a tool with `audit`/`auditPage` and no `draw`. contrast and
dupid outlined their findings; grid drew nothing, so setting the step to 4px on
a Tailwind page gave a list of thousands over a blank page and every row had to
be clicked to find out where it was. A finding you cannot locate is half a
finding — and this is the difference between three rules behaving the same way
and two of them happening to.

The mark classes (`.debug-overlay-flag` and the severity modifiers) live in
`ui/styles.js`, not in whichever tool needed them first, because more than one
rule paints them.

## Every tool must be worth arming alone
`audit.js` fails a tool whose only hooks are `annotate`, `report` or a rule.
None of those carry a tool by itself: a lens decorates what OTHER tools print,
report text is not on screen, and findings reach the ⌕ list whether the rule is
armed or not. Measured, not assumed — armed by themselves, grid produced zero
badges and zero ⚠, and dupid changed nothing at all. A tool that is correct,
armed and silent is indistinguishable from a broken one, and a button that does
nothing is worse than no button.

So a tool needs one of `badge`, `compact`, `draw`, `listRows`, `intercept`.
grid gained its own badge (it summarises where measure enumerates, so both
armed is not redundant); dupid gained `draw`, which is also why `.debug-overlay-flag`
moved to `ui/styles.js` — more than one rule paints findings, so those classes
cannot live in whichever tool needed them first.

Enhancing another component stays welcome; it just may not be the whole reason
a component exists.

**Nothing may be created for a consumer that is not there.** A shift-click made
a lime `measure` pin whether or not anything grouped it — numbered, promising a
measurement that could never arrive. `app/interactions.js` asks whether any
armed tool publishes `groups` and makes an ordinary pin if not. A capability
question, never an id, so a lasso shipped tomorrow answers it unchanged.

## The panel must not lie about itself
Six defects a live audit found, each now guarded by a test:

- **The bar paints AND hit-tests above the popover** (later sibling, both
  `z-index: auto`), so an overlap eats clicks meant for rows. `List.place()`
  clamps four candidates into the viewport and takes the first that still
  clears the bar. Do not fix this by restacking — putting the popover on top
  buries the button that closes it.
- **A `WebPanel.flash` is transient, so it cannot be the only sign of state.** The
  ⌕ count expired and the bar then looked idle while the page still wore 200
  outlines per rule, with no control that removed them. `WebPanel.setSwept` and
  ✕-clears-the-audit are one state, driven together.
- **A cap must say so**, and only when it bit — asked per armed drawing rule,
  because the limit is per rule and a rule with no `draw()` caps nothing.
- **Escape closes the top layer, never the session.** It used to fall through to
  `setPower(false)` whenever nothing was pinned. Its only guard is
  `Interactions.typing(e)` — a `!root.contains(e.target)` guard was added too
  and silenced the commonest path of all: clicking a bar button leaves focus on
  that button, inside root, so Escape did nothing after opening the panel with
  the mouse. `typing()` already covers every ⚙ control, which is all that guard
  was for.
- **A count that matters must rest, not flash.** `WebPanel.flash` expires, so the
  bar could not answer "does this page have problems?" without opening the
  panel. The ⌕ button holds the grouped count while a sweep is showing. Two
  bare numbers on one bar was the original complaint and the fix for that was
  LABELLING them, not hiding one — the panel header names both quantities and
  the button's own title says which it is.
- **Nothing clamped to a viewport edge may describe an off-screen element.** A
  pin scrolled away parked its badge and number on the page's own header. Off
  screen, they are simply not drawn; the pin list is what reaches them.
- **The root is named, not `aria-hidden`.** It holds 13 tabbable buttons, so
  hiding it was `aria-hidden-focus` (WCAG 4.1.2). Decoration carries
  `aria-hidden` instead. Toggles carry `aria-pressed`, and there is a
  `:focus-visible` rule — there was none at all.
- **Never `inert` the root.** v3.8.48 did, to drop the overlay out of the tab
  order when powered off, and it took the ⏻ button and the ⋮⋮ grip with it —
  the panel could not be switched back on by mouse at all, only by the hotkey.
  It was redundant too: `.whenOn` and the popover are already `display: none`
  when off, which removes them from the tab order by itself. **jsdom sets the
  attribute without implementing its semantics**, so no test here can catch
  this by behaviour — the suite asserts the attribute is absent, and that
  exactly one button (⏻) is reachable when off.

Row indices are the recurring hazard: `rows(view)` is what the panel renders,
so **every callback must resolve against `rows(view)`**, never a narrower list.
A view title added at index 0 is all it takes to make `✕` delete the wrong pin.

## The one hook that writes
`intercept({ type, ev, el })` is offered to armed tools before a click becomes
a pin — `app/interactions.js` is where input enters, so it is the only place
that can hand it on, and it does so by hook with no tool named. Return true and
the click was yours; the pin does not also happen, because the overlay doing
two things for one click is its own bug.

Claim narrowly. `pick.js` takes only Ctrl/⌘+clicks; a tool that swallows
every click has taken the overlay away from everything else. Meta as well as
Ctrl, because Ctrl+click is the context menu on macOS.

## We run in a sandbox now, so never ask a window who it is
The header grants `GM_getValue`/`GM_setValue`, because `localStorage` is scoped
to one origin and `@match` is every site — so everything the user chose was
chosen again on the next domain. `Store` (in `core/state.js`) is the only way to
persist anything; it picks its backend in order — GM, then
`chrome.storage.local` (the extension gate's per-install store; async-only, so
boot defers on that ONE backend via `Store.init()`), then `localStorage` (dev
page, tests) — and adopts existing per-origin values on first use of a better
backend, so an upgrade never resets somebody. Do not call `localStorage`
directly again, and keep the non-ext paths synchronous: the suite, map.js and
compare.js all read the DOM in the same breath as eval.

Asking for any GM API moves the script into the manager's sandbox, where
`window` is a wrapper around the page's. Two consequences, both already handled
in `banner.js` and both silent if reintroduced:

- **Never compare window identities.** `window.top !== window.self` can be true
  in the *top* frame under a sandbox — the overlay would vanish everywhere and
  report nothing. The frame check reads `window.frameElement`, which is null at
  top level in every context, and `@noframes` handles cross-origin frames.
- **Ask the document, not a flag.** A soft-navigation re-injection can arrive
  in a fresh sandbox with the same page, so the single-instance guard looks for
  an existing `#__debug-overlay-root` before it trusts `window.__DEBUG_OVERLAY__`.

Anything else that assumed page context is now suspect. `unsafeWindow` reaches
the real page window if something ever genuinely needs it — nothing does yet.

## The version has to be visible
`@grant none` means no `GM_info`, so `src/core/config.js` carries a `__VERSION__`
placeholder that `build.js` substitutes into the bundle, and the panel shows it
in the ⏻ tooltip. The build **fails** if the placeholder is missing. Do not
hand-write a version into `src/` — that is a second copy, and it will drift
from `userscript.json`. This exists because a stale install and a current one
otherwise look identical, which is the same failure as a dead `@updateURL`
seen from the other end.

## Things a rule got wrong, and must not again
- **Read `opacity`.** `color:#000; opacity:.1` was reported 21:1 PASS while the
  identical `rgba(0,0,0,.1)` was reported 1.25:1 FAIL. The sweep's gate only
  skips the exact string `'0'`, so anything fainter still arrives here.
- **A first-truthy chain is not a check of both axes.** `rowGap || columnGap`
  meant an off-grid column gap beside an on-grid row gap was invisible.
- **`Math.round` breaks ties toward +Infinity**, so `+2.5` and `-2.5` got
  opposite grid verdicts. `U.px` rounds half away from zero.
- **One judgement, asked in one place.** `Scale.judges(n)` is off-grid AND
  within the ceiling; the badge and the sweep both call it. When the ceiling
  lived only in the rule, a resolved `margin:auto` got a ⚠ and no finding.
- **Two settings must not silently cancel.** The 96px spacing ceiling applied
  to width and height too, so arming "Judge width & height" produced nothing.
- **Only `affects: 'detect'` invalidates a sweep.** Throwing away the most
  expensive thing the tool does because a copy preference changed is not caution.

## A pin's number is derived, never counted
`Controller.nextPinId()` returns the **smallest number not currently in use**.
There is no counter — `State.pinSeq` is gone, and with it anything that could
drift from what is actually pinned.

Two rules pull against each other and both matter. A live pin keeps its number:
renumbering #3 to #2 because #1 was removed breaks the screenshot taken a
second earlier, on a tool whose whole point is reading values off one. But the
set has to stay dense, or four pins read `#1 #2 #6 #9` — numbers with no
relation to what is on screen.

Deriving satisfies both: nothing renumbers, and the gap a removal leaves is
exactly what the next pin fills. Resetting a counter at zero was the first fix
and it only covered the trivial case — unpin and re-pin with anything else
still pinned and it kept climbing.

## The list renders by index, so the index must stay true
`List.set` binds each row to its position and hands that position back. The
renderer prunes pins whose element left the page, and doing that without
telling the list left every later row resolving one position too far — ✕ on
`#3` deleted `#2`. `ui/` may not call `app/`, so the renderer announces
(`Render.onPinsPruned`) and `boot.js` decides who listens. Any future path that
mutates `State.pins` outside the controller owes the same announcement.

Escape belongs to whatever has focus: guarded by `Interactions.typing(e)` AND
`root.contains(e.target)`, because the ⚙ controls are inputs inside the
overlay's own root and abandoning an edit used to clear every pin.

## An update must not take anything away
- A saved armed set answers for the tools that existed when it was written.
  `CONFIG.SEEN_KEY` records which ids this install has met, so a capability
  shipped later gets its `startsOn` say while one the user switched off stays
  off. Without it a new tool arrived invisible.
- An owner that changes the id its settings are stored under declares `was:`.
- Settings whose owner this build cannot name are carried untouched
  (`Settings.carried`) rather than pruned on the next unrelated write — or no
  later version could migrate what an earlier one saved.

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

That is also why the colour helpers live in the tool and not in `core/utils.js`
— reading a colour honestly needs the DOM, and utils may not have it. Each of
them only ever had one caller.

## The sweep
`app/sweep.js` runs every active `rule` over every visible element in one
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

`ui/dom.js` now emits one `<style data-tool="…">` per tool plus one for the
core, so the blast radius is the author's own file. `test.js` checks every
sheet separately — braces and parens balance, and the parsed rule count
matching what was written — and names the tool that broke. Keep those checks,
and keep the sheets separate.

## Versioning
`build.js` bumps `@version` automatically. Tampermonkey only updates when the
version increases, so never hand-edit the version in `userscript.json` down,
and never commit `dist/` without running the build.

## The design system (audit.js and test.js enforce the guards)

There wasn't one, and the audit that found that counted the cost: 47 colour
literals in `ui/styles.js` alone, 23 distinct dark neutrals across the four
surfaces, eleven radius values. Two greys — `#3a3a40` and `#3a3a41` — differed
by one digit and did the same job. Nobody chose any of it; each call site
invented its own value because nothing named the alternatives.

**Colour and radius are tokens now, and literals are a test failure.** The
tokens live in two places, deliberately:

- `ui/styles.js` declares them on `#__debug-overlay-root` — never `:root`. A
  host page's custom properties must not reach in and ours must not leak out,
  the same reason every class carries the namespace.
- `browser-extension-source/shared.css` declares the same names for the three
  extension pages, and `build.js` INLINES it into each page's `<style>`. It is
  not a shipped file on purpose: another file in the package means another
  entry in `files.json`, in the installer's embed, and in the updater's write
  list — real machinery for one stylesheet.

| token | means |
|---|---|
| `--debug-overlay-accent` | armed · success · primary |
| `--debug-overlay-warn` | asks for a decision |
| `--debug-overlay-danger` | destructive · failure |
| `--debug-overlay-info` | focus · in progress |
| `--debug-overlay-ink` / `-ink-dim` / `-muted` | text, three weights |
| `--debug-overlay-ground` / `-surface` / `-raised` / `-raised-hi` / `-line` | the four-step neutral ramp |
| `--debug-overlay-r-chip / -r-inner / -r-control / -r-card` | the radius ladder; `999px` pill and `50%` circle stay literal |

**Two kinds of colour, and only one of them is a token.** A THEME value says
how the product feels — recolour it and everything follows. An IDENTITY value
says *which thing this is*: a pin's kind, a badge field, a severity. Those must
NOT move when the theme moves, so they stay literals and live in the test's
allow-list, where each one carries a reason. Adding to that list is a decision;
leaving a literal at a call site is a failure.

**The guards are cheap because the sheets are already parsed** for brace
balance and for the namespace — this is one more regex over text being read
anyway, which is what makes a rule outlive its author. Both were verified by
reintroducing real drift: a stray `#7c7c88` and an off-ladder `9px` each fail
by name.

**Three shapes must be three LADDER steps apart.** The bar's first attempt at
one-shape-per-role used `11px` for inputs and `9px` for actions — which the
design-system audit then flagged as one value wearing two names. It was right:
at 34px those are the same picture, and the distinction existed only in the
source.


## The instrument declaration — for UX audit skills

This block is a **project value**, in the sense the ABC skill family means it:
the skills carry the METHOD ("Mode D: audit the rendered arrangement";
"Measure, don't vibe"), and each project's CLAUDE.md names the instrument
that method should use here. The skills already read CLAUDE.md in their
grounding step, so nothing in them has to know this tool exists — which is
what keeps them universal. **Copy this section verbatim into any project you
audit with those skills.**

**Instrument:** Debug Overlay — install from
`github.com/ABC-LEGACY-LLC/debug-overlay` (userscript or extension; the
README's Option A/B). It runs on any page, reads the RENDERED result, and is
the answer whenever an audit needs a number off a live surface rather than
an inference from source.

**What it can answer, by audit:**

| the skill asks for | arm | it reports |
|---|---|---|
| geometry, gaps, enclosure (composition-layout, Mode D) | hover, or 📌 pin + Shift+click two elements | exact box, padding/margin, and the measured distance BETWEEN two elements |
| off-token spacing (compliance-design-system) | ▦ grid | every value off the project's step, with the step configurable under ⚙ |
| contrast (compliance-design-system) | ◐ contrast | computed ratio and pass/fail at the chosen WCAG level, read off painted pixels — so gradients and `opacity` are handled, and unreadable cases return `review` rather than a wrong number |
| duplicate accessible ids (any) | # dupid | every duplicate id, marked in place |
| freezes, jank, per-component cost (performance-interaction) | ⚡ perf | freeze log with tier and blame, plus `mut/s`, `resp`, `shift` for a pinned subtree, and page-load timings |

**Getting the evidence out:** ⌕ audits the whole page and marks every finding
where it is; ⧉ copies a structured text report of everything on screen. Paste
that report into the audit — it is the `[ui]` evidence Mode D asks for, and
it carries the numbers in a form a finding can quote.

**Honesty properties worth relying on** (they are enforced by that project's
own suite, not promised): a rule returns pass, fail, or `review` — never a
guess; findings are grouped, so 5 000 occurrences of one problem read as one
line; and every rule that reports also DRAWS, so a finding can always be
located on the page rather than only listed.

**What it does NOT replace:** hidden-state geometry. Empty zones, mid-drag
states and overflow cases exist only in the code, so the instrument joins the
source read (`[code+ui]`) and never substitutes for it — the layout skill's
own rule.

## Escalate to the human instead of guessing
- A change that would require relaxing an audit rule.
- Anything touching `@match`, `@grant`, or the update URLs.
- Moving a file between `core/`, `ui/` and `app/`, or anything that changes
  when a module's side effects run relative to boot's init sequence.
