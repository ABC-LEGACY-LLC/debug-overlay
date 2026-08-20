# dbgov — the architecture, as it actually is

This is the reference the map command prints from. Where a claim here can be
derived from the code, it is — `hooks.js` holds the one definition, and
`audit.js` (which enforces), `map.js` (which prints) and this document all
stand on it. The tables below were written by hand twice before that and were
wrong twice; run `npm run map` for the living version.

---

## The pipeline

```
                YOU
                 │  click · shift+click · ctrl+shift+click · right-click · ctrl+C
                 ▼
        ╔══════ INPUT SIDE ══════╗
        ║ pin    — SOURCE        ║──▶ keeps() — selections persist as pins
        ║ select — SOURCE        ║──▶ State.pins + groups()   (feeds components)
        ╚═══════════╤════════════╝
        (right-click and Ctrl+C go straight to Report's copy actions —
         a take-away like ⧉, owned by a service, so no tool and no arming)
                    ▼
        ╔══════ COMPONENTS ══════╗
        ║ measure grid           ║ ◄── consult SUBJECTS (scale, colour)
        ║ contrast dupid         ║
        ╚═══════════╤════════════╝
                    ▼
        ╔══════ SERVICES ════════╗
        ║ badge · findings       ║
        ║ report · settings      ║
        ╚═══════════╤════════════╝
                    ▼
               YOUR EYES
```

A new capability is a COMPONENT if its output is for your eyes via a service,
a SOURCE if its output is for other components, an ACTION if its output is an
effect.

## Three species, not one list

Every folder under `src/tools/` is a TOOL — something you can arm. "Tool" is
the umbrella, and it is the registry's own word (`defineTool`, `Tools`); the
SPECIES below says which kind each one is. The folder was briefly named
`components/`, and that collided with COMPONENT the species — one spelling,
two meanings — which made "select is in components/ but is not a component"
simultaneously true and absurd. A tool is one of three species:
The bands are DERIVED from the hooks a file implements — nothing declares its
species, so the label cannot drift from the behaviour:

| band | derived from | job |
|---|---|---|
| **COMPONENT** | `badge` / `compact` / `annotate` / `audit` / `auditPage` | reads the page, produces content INTO SERVICES |
| **SOURCE** | `groups` / `listRows` / `pendingIndex` / `keeps` | input side: turns clicks into what components work ON |
| **ACTION** | `intercept` | input side: a click becomes a direct effect |

Today: measure, grid, contrast and dupid are components; select and pin are
the sources. The ACTION band is empty: pick, its one resident, turned out to
be Report's copy capability wearing a button — an on/off switch for "copy"
guards nothing — and retired into the target menu. `intercept` stays in the
vocabulary, consumed by the door, ready for the next real actor. A flat "components" list put all six in one
rowset, and every matrix drawn over it felt wrong — select's row looked broken
next to measure's because they are different species, not because the code was.

Bands are plural on purpose. grid is Inspect *and* Detect — both describer
duties — and a future tool could genuinely sit in two bands; the map would
list it in both rather than force one.

## A component fills four services, from inside its own file

The uniformity is the architecture. Each component carries ALL of its
contributions in its one file, and the service collects them — the same
registration pattern for every service, so a fifth component is one new file
and four cells:

| service | hook | collected by |
|---|---|---|
| badge | `badge` / `compact` | `ui/badges.js`, from ACTIVE tools |
| ⌕ findings | `audit` / `auditPage` | `app/sweep.js`, from ALL tools |
| ⧉ report | `report` / `reportTail` | `app/report.js`, from active tools |
| ⚙ settings | `options` (or `uses:` a subject) | `app/settings.js` |

Two of those lines carry deliberate asymmetries:

- **The sweep runs every rule, armed or not.** Arming decides what you SEE,
  never what is checked — a toggle you forgot must not quietly shorten an
  audit.
- **A component whose settings live on a subject declares `uses:`** so its
  right-click menu can show them. "Grid step" is grid's setting to anyone
  holding grid; that `scale` owns it is an internal matter.

## Service families — the badge carries three kinds of content

| facet | looks like | means | produced through |
|---|---|---|---|
| **CURRENT** | `p 7` | the component's own fields | `badge` / `compact` |
| **ISSUE** | `p 7⚠` | a lens marking a value that fails | `annotate` |
| **RECOMMENDATION** | `p 7⚠→8` | what would pass | `annotate`, behind the lens's `suggest` option |

A facet is a NAME, not a mechanism — CURRENT and ISSUE are what the hooks
already were, and RECOMMENDATION is content inside the same lens. Three rules
hold it together:

- **A facet ships WITH its first producer.** RECOMMENDATION arrived with
  grid's "Suggest nearest step" toggle, not before — nothing here is created
  for a consumer that is not there.
- **RECOMMENDATION is opt-in.** A suggestion doubles every marked number, so
  it must be asked for (`affects: 'inspect'`, default off).
- **Both answers come from the subject.** `Scale.judges(n)` says what fails
  and `Scale.nearest(n)` says what would pass, so the ⚠ and the →8 can never
  disagree about one number — the same one-place rule that put `judges` on the
  subject in the first place.

Other services can grow families the same way, when a producer exists: the
findings list already distinguishes fail from `review` (a verdict vs the
absence of one), which is its own two-facet family in all but name.

## Selection chooses; pin keeps

Two verbs that used to be welded into one click. SELECTION is core's: a click
chooses ONE element — outline, badge, no number — and the next click lets it
go and chooses the next. 📌 pin is the tool that KEEPS a choice: armed (its
shipped default), what you select persists as a numbered pin; off, the page
never accumulates anything. The input layer asks "does any armed tool keep
selections?" through the `keeps` hook — a capability question with no id in
it, like the grouping question beside it. Numbers belong to KEPT selections:
that is why the current selection wears none, and why disarming pin never
deletes the pins you already made — off stops NEW keeping only.

## A technique is a gesture, not a mode

How selection pins GROUP rides on the gesture, never on a setting chosen in
advance: Shift+click pairs (①② then a fresh ③④), Ctrl/⌘+Shift+click links to
the previous pin (repeat for ①─②─③), and the two mix in one session. The
retired 'Pin grouping' mode is the cautionary tale — the same finger did
different things on different days, and two clicks looked identical until the
third betrayed which mode was on. `tools/select/form.js` is the one walk that
turns kinds into runs; consumers still see two-pin groups and never learn any
of this happened. A mode switch is what you reach for only when gestures run
out.

## The source's output is consumed, not shown

select publishes `groups()`; measure asks `Tools.groups()` and draws dimension
lines between whatever comes back. Neither knows the other's name. That is why
select's visible output is so thin — the `…` on a waiting pin, pair rows in
the pin list — its real product feeds another component. A lasso or a
select-by-query is one new file in this band, and every consumer picks it up
unchanged.

Three capability flows exist today, and all are name-free:

| producer | capability | consumer |
|---|---|---|
| pin | `keeps()` | interactions — does a click's choice persist? |
| select | `groups()` | whoever measures between elements |
| grid | `annotate` (the ⚠ lens) | every number any badge prints |

## The action door stays open; the copy actions are Report's

`intercept` — the one hook that can consume a click before it becomes a pin —
remains in the vocabulary, consumed by `app/interactions.js` (input's one
door), though no tool implements it today. When one does: claim narrowly — a
tool that swallows every click has taken the overlay away from everything
else. pick, the door's first resident, retired: its whole behaviour was
Report's `toClipboard` behind a modifier, and copy is a take-away action like
⧉ — always on, nothing to arm.

Where it went: right-click on a target opens the TARGET MENU — the box is
core's (`ui/menu.js`, dumb: rows handed in, Escape or a click elsewhere
closes), the rows are `Report.targetActions(el)` (Copy selector · Copy text),
and `app/` is the door that knows both sides and hands one to the other.
Ctrl/⌘+C copies the hovered target's selector directly. Alt+right-click, like
Alt+click, belongs to the page. The day a tool wants to add a row, a `menu`
hook is a small addition — it is not declared now because nothing would
implement it, and nothing here is created for a consumer that is not there.

## Every surface has three layers

Core draws each surface even with every tool off; a tool only ADDS to it.
Missing this is how the map came out wrong twice — `select` looked like it
owned the pin chip, when the renderer draws the outline and the `#N` for every
pin and select appends only the `…`.

| surface | core draws (always) | tools add |
|---|---|---|
| badge | the box, the `#N` prefix | describers' fields |
| pin marks | outline AND `#N` chip | the `…` on a waiting pin |
| current selection | outline + badge, NO number | nothing yet — 📌 decides if it becomes a pin |
| page marks | the layer, cleared per frame, AND the mark painter (`ctx.marks`) — outline, severity colour, and the rule's label, coalesced per element | which findings to paint (`draw`) |
| pin list | a plain row per pin | pair rows |
| findings | grouping, sort, `×N` | the findings themselves |
| report | header, scope, `## rules` | each tool's lines |
| ⚙ | grouping by `affects`, KEYS, LEGEND | each owner's rows (`options`, `gestures`, `legend`) |
| target menu | the box, position, dismissal — rows from Report | nothing yet — a `menu` hook the day a tool wants a row |
| input | hover, click, right-click, Ctrl+C, the current selection, hotkeys | pin's keeping; `intercept` stays the door |

## Our classes are ours; the page's cascade is not

The overlay injects a `<style>` into the host document, so our elements and
the page's rules share one cascade. Every class we emit is therefore a class
the host can style, and specificity is no defence — an unopposed declaration
wins at any specificity. Measured, not theorised: a Tailwind page's own
`.fixed { position: fixed }` matched the badge flyout's always-on chip, lifted
it out of flow onto its neighbour's slot and won the hit test, so one facet
could not be switched off with a mouse at all; Bootstrap's `.row` reached the
popover's rows the same way. So every class carries the `dbgov-` namespace,
and data that doubles as a class token — a pin's kind, a finding's severity —
is prefixed where the CLASS is built, never in the data. `test.js` proves it
differentially: the same bundle driven identically on a clean host and on one
that defines every name we ever used bare, computed styles diffed over every
element in the overlay.

## The audit is a flow, not a place

⌕ runs `app/sweep.js` once over every visible element and keeps the result in
`State.sweep`. The outlines, the findings list and the report's findings
section are all views of that one snapshot — it is not live, and re-running it
is one click. "Audit" therefore never appears as a column or a folder: it is
the flow that fills specific cells of the surfaces above.

## Subjects — what two tools must agree about

`tools/grid/service.js` (the Scale subject) owns the spacing step and the
off-grid test; `tools/contrast/service.js` (Colour) owns the WCAG level,
colour resolution and the memoised
cache. They moved out of the tools because a badge saying a value passes over
a finding saying it fails is the one contradiction this design exists to rule
out. A subject has no button, no hooks, no surface: it is called and never
calls back, under the same one-way rule as `core/`.

## The colour family — the promotion, scripted for the day it happens

Colour is the fundamental thing; contrast is a relationship BETWEEN colours,
derived from it. The code points the way reality does: the component consults
the subject, never the reverse. Today Colour has ONE consumer, so it lives
inside `tools/contrast/service.js` — a hierarchy is not built over one
child.

The day a second colour component ships (palette, colour-blindness, …):

1. `tools/contrast/service.js` → `subjects/colour.js`. The settings id is
   already `colour`, so nobody's WCAG level resets; both components declare
   `uses: [Colour]`.
2. Optionally group the siblings under a DOMAIN folder:
   `tools/colour/contrast/`, `tools/colour/palette/`. A domain
   folder has no `index.js` — a component is the nearest folder that does, so
   the tooling already understands this shape, proven with a probe.
3. The panel stays flat: each sibling is its own armable button. "These belong
   to colour" reaches the user through the shared ◐ ⚙ rows and menus, not
   through bar hierarchy.

A tool inside a domain folder declares `family: '<domain>'` — the runtime
bundle has no folders, so like `affects:` it is declared, and the audit fails
any declaration that does not equal the folder it sits in. The family shows
where it costs nothing: the tooltip (`Colour › Contrast`) and the right-click
menu's title. A family's SUBJECT carries the family's own mark (🎨), never a
member tool's glyph — the "WCAG level" row wearing contrast's ◐ made the
subject look like one of its tools. A family whose subject carries a
mark renders as ONE bar button (🎨) whose members slide out sideways — toward
the open side of the screen, read off the bar's snap side — with the ordinary
tool buttons inside: same arming, same right-click menu. One button per
family, so a family that grows shrinks the bar. Geometry's head is the promoted
subject `subjects/geometry.js` (📏) — promoted by this project's own rule,
since measure and select both consult it — so measure lives in its flyout
too. select stays a direct button: consulting a subject is not membership;
the domain folder is.

Nobody has to remember this: reaching for another tool's `service.js`
fails the import audit with this exact promotion named in the message. The
trigger enforces itself.

## The folders are the species of FILE, one each

| folder | what it is |
|---|---|
| `tools/<name>/` | one component per folder — `index.js` registers; `badge` / `rule` / `draw` / `report` / `options` beside it; `service.js` is its backend when it has one of its own. A DOMAIN folder (`colour/`, `geometry/`) has no `index.js` — it only groups a family; a component is the nearest folder that has one |
| `subjects/` | a backend SHARED by two tools — `geometry.js` (measure draws with it, select words its rows with it); a sole-consumer backend lives inside its tool until a second consumer appears |
| `services/` | the four collectors — `badge/`, `findings/`, `report/`, `settings/` — never edited when a component is added |
| `ui/` | the panel machinery: bar, popover, controls, renderer, placement, styles, dom |
| `core/`, `app/` | glue — state, config, utils, geometry, the registry; interactions, controller, boot |

`src/` is real ES modules: execution order is the import graph, `boot.js` is
the entry, and `build.js` (esbuild) generates `src/manifest.js` — side-effect
imports of every `tools/*/index.js`, so a new tool is one new folder
that nothing else names. `banner.js` is not a module: its guard must abort
before any module evaluates, so the build injects it around esbuild's output.

## What enforces all of this

`audit.js`, on every `npm run check` — judged by exit code, never by reading
output. A component is judged as a FOLDER (its files' concatenation), through
the same `hooks.js` reading the map prints from. Five import-graph rules hold
the layers: a tool imports only core/, subjects/ and its own folder;
nothing but the manifest names a tool; core imports only core; services
never import app; ui never imports app. What a component cannot import it
receives — capabilities like `redraw` and `toClipboard` ride in through the
hook ctx, the way `draw()` receives `layer` and `Place`. The rules that guard this document's claims: no tool names another
tool; a tool must be worth arming alone (one of `badge`/`compact`/`draw`/
`listRows`/`intercept`); a rule must `draw` where its findings are; every
option declares `affects:` as a quoted literal; subjects never call back;
layers hold one-way; every hook in `HOOKS` has a consumer in core.

## Open, deliberately

- The bar's 13→10 re-sort (a design decision, not a defect).
- Shadow DOM isolation (hardening; the prefix discipline holds for now).
