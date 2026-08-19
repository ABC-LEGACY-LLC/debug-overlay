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
                 │  click · shift+click · ctrl+click
                 ▼
        ╔══════ INPUT SIDE ══════╗
        ║ select — SOURCE        ║──▶ State.pins + groups()   (feeds components)
        ║ pick   — ACTION        ║──▶ clipboard, directly     (bypasses them)
        ╚═══════════╤════════════╝
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

Every file in `src/tools/` is a component, but they are not one kind of thing.
The bands are DERIVED from the hooks a file implements — nothing declares its
species, so the label cannot drift from the behaviour:

| band | derived from | job |
|---|---|---|
| **COMPONENT** | `badge` / `compact` / `annotate` / `audit` / `auditPage` | reads the page, produces content INTO SERVICES |
| **SOURCE** | `groups` / `listRows` / `pendingIndex` | input side: turns clicks into what components work ON |
| **ACTION** | `intercept` | input side: a click becomes a direct effect |

Today: measure, grid, contrast and dupid are components; select is the
source; pick is the action. A flat "components" list put all six in one
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

## The source's output is consumed, not shown

select publishes `groups()`; measure asks `Tools.groups()` and draws dimension
lines between whatever comes back. Neither knows the other's name. That is why
select's visible output is so thin — the `…` on a waiting pin, pair rows in
the pin list — its real product feeds another component. A lasso or a
select-by-query is one new file in this band, and every consumer picks it up
unchanged.

Two capability flows exist today, and both are name-free:

| producer | capability | consumer |
|---|---|---|
| select | `groups()` | whoever measures between elements |
| grid | `annotate` (the ⚠ lens) | every number any badge prints |

## The action claims input, narrowly

pick takes Ctrl/⌘+click through `intercept` — the one hook that can consume a
click before it becomes a pin. `app/interactions.js` is where input enters, so
it is the only file that can hand it on, and it does so by hook with no tool
named. Claim narrowly: a tool that swallows every click has taken the overlay
away from everything else.

## Every surface has three layers

Core draws each surface even with every tool off; a tool only ADDS to it.
Missing this is how the map came out wrong twice — `select` looked like it
owned the pin chip, when the renderer draws the outline and the `#N` for every
pin and select appends only the `…`.

| surface | core draws (always) | tools add |
|---|---|---|
| badge | the box, the `#N` prefix | describers' fields |
| pin marks | outline AND `#N` chip | the `…` on a waiting pin |
| page marks | the layer, cleared per frame | outlines, lines, flashes |
| pin list | a plain row per pin | pair rows |
| findings | grouping, sort, `×N` | the findings themselves |
| report | header, scope, `## rules` | each tool's lines |
| ⚙ | grouping by `affects`, KEYS | each owner's rows |
| input | hover, click, pins, hotkeys | pick's claim |

## The audit is a flow, not a place

⌕ runs `app/sweep.js` once over every visible element and keeps the result in
`State.sweep`. The outlines, the findings list and the report's findings
section are all views of that one snapshot — it is not live, and re-running it
is one click. "Audit" therefore never appears as a column or a folder: it is
the flow that fills specific cells of the surfaces above.

## Subjects — what two components must agree about

`subjects/scale.js` owns the spacing step and the off-grid test;
`subjects/colour.js` owns the WCAG level, colour resolution and the memoised
cache. They moved out of the tools because a badge saying a value passes over
a finding saying it fails is the one contradiction this design exists to rule
out. A subject has no button, no hooks, no surface: it is called and never
calls back, under the same one-way rule as `core/`.

## The folders are the species of FILE, one each

| folder | what it is |
|---|---|
| `tools/` | a component — something you can arm |
| `subjects/` | shared measurement + its settings |
| `ui/` | a surface — where output appears |
| `core/`, `app/` | glue — what connects them |

Load order lives in `ORDER` in `build.js` and nowhere else. `tools/` and
`subjects/` are globbed, so a new component or subject is one new file.

## What enforces all of this

`audit.js`, on every `npm run check` — judged by exit code, never by reading
output. The rules that guard this document's claims: no tool names another
tool; a tool must be worth arming alone (one of `badge`/`compact`/`draw`/
`listRows`/`intercept`); a rule must `draw` where its findings are; every
option declares `affects:` as a quoted literal; subjects never call back;
layers hold one-way; every hook in `HOOKS` has a consumer in core.

## Open, deliberately

- The bar's 13→10 re-sort (a design decision, not a defect).
- Shadow DOM isolation (hardening; the prefix discipline holds for now).
