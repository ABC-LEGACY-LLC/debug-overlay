# Changelog

## 3.8.196 — 2026-09-20

- **New: an AI can drive the overlay itself.** A third door into the same
  room: `mcp/` is an MCP server Claude Code starts over stdio, and the
  extension dials in from the side panel's new **AI session** section with
  the token the server prints. From then on the AI arms tools, changes
  settings, pins by selector, clicks, drags and points as a hand would, runs
  ⌕, and reads the report ⧉ would copy — as text, with nobody relaying.
- **One session, one token, one browser.** The server binds to `127.0.0.1`,
  holds one token and accepts one browser; a second AI runs a second server
  on a second port. Nothing is shared, so nothing can leak across. The
  extension connects OUT, only when a person presses Connect, only to the
  address they typed. A wrong token is refused and told so; a second browser
  is refused; a command with no browser answers with what to type where.
- **Built for the browser and the AI being on different machines.** The
  browser reaches the server, never the reverse — the SSH / VSCode-remote
  arrangement, where the port is forwarded to the person's machine
  automatically.
- The AI gets the overlay's own answers and nothing else: no screenshots, no
  DOM dumps, no other tabs. `report` is the deliverable, as it is for a
  person.
- Under the hood: `Report.build()` is `copy()` without the clipboard, and
  `Controller.sweep()` now answers with a promise of the result so a caller
  that cannot see the screen can wait for ⌕ to finish.

- **Fixed: the paint report stated both halves of a contradiction.** A doubt
  is raised while the fold runs, before anything has verified it, so each one
  carried its own hedge — "the colour above may not be the one on screen". A
  sample answers that question, and the hedge stayed anyway: a report could
  say *they agree — the walk accounted for everything that paints here* four
  lines above a note saying the colour may be wrong.
- The doubt now states only the fact it knows — that the fold leaves that
  layer out. What the fact turned out to MEAN is framed by the measurement,
  from the same judgement the ΔRGB lines are computed from, so the two cannot
  disagree: **flagged, but the sample AGREES exactly, so none of these painted
  at this pixel** when ΔRGB is 0, and **the sample DISAGREES by N, and this is
  the likely cause** when it is not.
- Nothing is deleted on agreement. The thing is really there, and a different
  pixel, viewport or page state may still make it bite — demoted, not hidden.
- With no sample the hedge survives unchanged, because then nothing has
  looked.

## 3.8.194 — 2026-09-20

- **The lasso can take an element bigger than the drag.** Enclosing is the
  usual reading of a marquee and it cannot reach a full-width wallpaper at
  all: enclosing one means dragging a box around it, and it may be larger than
  the screen. **A box takes what it** is now its own setting — `enclosed` (the
  default) or `touched`, which takes anything the box overlaps down to one
  pixel, so a large element is taken by dragging inside it.
- **…and keeps the** is a second setting, because these were one four-valued
  option and that made them silently dependent: picking overlap also picked
  "prune nothing", which under overlap means every wrapper between `<body>`
  and the thing you wanted. `touched` + `deepest` is the pairing for one big
  element.
- **Fixed: a box could pin the overlay's own buttons.** The root lives in the
  page's own body, so the sweep reached it. Under `touched` that would have
  been the common case rather than the odd one.

## 3.8.193 — 2026-09-20

- **Fixed: the lasso button was dressed as a component, not an input.** Roles
  are derived from hooks, and every hook the lasso implements is generic — a
  runtime, a rectangle, a claim on the click its own drag caused. So a tool
  whose entire product is pins derived the role *Act*, off that claim. The bar
  gave it the component shape, and its own "A box keeps" setting sat under a
  Select heading its role contradicted. A tool can now declare that it makes
  selections of its own; nothing else could tell you.

## 3.8.192 — 2026-09-20

- **New: ▭ lasso — drag a box, keep everything inside it.** Selection was one
  element per click, which is the wrong shape for "pin this whole card" and no
  shape at all for an element a click cannot reach. A box asks where things
  ARE rather than what is under a point, so it takes layers the hit test skips
  — `pointer-events: none`, or a painted shape the pointer misses — the same
  ones ⛏ paint lists as unreachable.
- What a box keeps is configurable under ⚙ or by right-clicking the button:
  OUTERMOST (the default — the things in the region, not every node inside
  them), LEAVES, EVERY, TOUCHING.
- Off by default, and a press that moves less than a few pixels still behaves
  exactly as it did: arming the lasso costs single-click pinning nothing.

## 3.8.191 — 2026-09-20

- **Fixed: the pixel capture was aimed at the wrong window.** It asked Chrome
  for "the current window", which from a service worker is the last-focused one
  — not necessarily the window holding the tab that asked. With two Chrome
  windows open, `activeTab` is granted for a tab in one of them and the capture
  goes to the other, where there is no grant. Chrome then says the permission
  is required, which reads as a manifest that forgot to ask for it. It now
  captures the window the request came from.
- A refused capture carries the tab and window ids, so the next one can be
  diagnosed from the report instead of guessed at.

## 3.8.190 — 2026-09-20

- **The toolbar button is ours again, and that is what makes the pixel sample
  work.** Chrome was handling the click itself to open the side panel, so the
  extension was never "invoked" and `activeTab` was never granted — which is
  how a build whose manifest asks for activeTab came to be told that activeTab
  was required. The click now reaches the extension, which opens the panel in
  the same breath, so pressing the toolbar button grants the permission the way
  the report says it does. If the panel cannot be opened that way, the old
  behaviour is restored on the spot: one click lost at worst, never the button.
- The refusal message names the exact button — Chrome's toolbar icon, not the
  bar on the page or anything in the side panel — and says to press it even
  when the panel is already open, because the click is the grant, not the panel.

## 3.8.189 — 2026-09-20

- When a pixel capture is refused, ⛏ paint now says **which button to press**.
  Chrome's own message — "Either the '<all_urls>' or 'activeTab' permission is
  required" — is true and useless, because the manifest *does* ask for
  activeTab: it is granted by invoking the extension from the toolbar, covers
  that one tab, and is dropped when the tab changes origin. Pressing ⧉ on the
  page is not an invocation, so it never grants anything on its own. The report
  says that, and keeps Chrome's wording as the evidence behind it.

## 3.8.188 — 2026-09-20

- ⛏ **Paint can now check its own arithmetic against the screen.** Turn on
  "Sample the real pixel" under ⚙ and ⧉ reads the actual rendered pixel, then
  prints it beside the computed one with **ΔRGB** — the size of the
  disagreement is the finding, since a couple of units is a saturate and forty
  is a whole layer nobody accounted for.
- It is gated, deliberately: off until you turn it on, only on an explicit ⧉
  (a hover never captures), one pixel read and the image dropped in the same
  breath — nothing stored, nothing sent — and the report says when a capture
  was taken. The permission is `activeTab`, granted by pressing the toolbar
  button and covering that one tab, rather than a standing claim on every site
  you visit.

## 3.8.186 — 2026-09-20

- ⛏ **Paint now shows the layers the browser's hit test skipped** — the gap the
  tool was built for, and the one it shared. Hit-testing respects the painted
  shape, so a point inside a card's box but outside its rounded corner is not a
  hit on that card: it never reached the stack, and nothing said it could have.
  Those elements are listed as `[—]` with the reason — the corner and radius
  that cut it out, `pointer-events: none`, an ancestor's clipping, or
  `visibility: hidden`. One symptom, four causes, none of them visible before.
- Faster everywhere a selector is built — the copied report, and every finding
  a page audit produces. Working out an element's `:nth-of-type` copied all of
  its siblings into an array; on a list with two thousand children that made
  the whole report quadratic. Measured on 2 000 elements: 2 659ms → 33ms.

## 3.8.185 — 2026-09-20

- The copied report now lists pinned elements **by number** — the order the
  page and the panel's list both show. A pin's number is the smallest one free,
  so unpinning #1 and pinning again used to put a pin numbered 1 at the end,
  and the report read `#2 #3 #4 #1` while the screen read 1 2 3 4.
- ⛏ Paint's "not accounted for" notes now name the **row** they belong to, so
  a doubt can be matched to its layer without re-reading a truncated selector.
  The one shared note — an ancestor's `opacity` — stays unnumbered, because it
  is one fact about everything beneath it rather than about any single row.

## 3.8.184 — 2026-09-20

- ⛏ **Paint no longer contradicts itself.** A real report marked a layer
  `← the colour you see` while the very next line said that layer carried a
  full-coverage `::after` no hit test can reach. A pseudo paints OVER its
  element, so the confident half of that pair was the wrong half. The marker
  now says `a pseudo paints over it, unseen`, keeps the blend count beside it,
  and the fold names the pseudo it could not include.
- A pseudo now prints its **content value** rather than the bare word
  `content` — `content ""` is a decoration layer, `content "→"` paints a glyph,
  `content: url(…)` is an image — and `box-shadow` on a pseudo is reported,
  which was missed entirely and can colour a pixel outside the pseudo's own box.

## 3.8.183 — 2026-09-20

- The updater no longer files `install.html` under the same verdict as inert
  leftovers. A retired page or a superseded updater is harmless and "safe to
  delete" is the whole truth about them; the installer is not harmless — it
  carries a frozen copy of every file from the version you FIRST installed and
  its one button writes them back over the current one. It now gets its own
  warning saying so.

## 3.8.182 — 2026-09-20

- ⛏ **Paint no longer makes the page feel stuck.** Its stack walk asked two
  questions per LAYER that are really facts about an ANCESTOR — what clips the
  point, and what fades it — so a 27-deep stack cost about 800 style reads for
  a single frame, and the frame runs on every pointer move. One ancestor pass
  brought that to about 100, and the walk is now cached by its point, so a
  frame with the pointer held still costs nothing at all.

## 3.8.180 — 2026-09-20

- The build now emits a **Chrome Web Store package** alongside the sideload
  ZIP, so both channels can run in parallel — the store install is one click
  and updates itself, the sideload path puts a change in a browser today rather
  than after a review queue. `content.js` and `side-panel.js` are byte-identical
  between them; only the declarations differ, and each difference is a
  permission the store build does not need: no host permission (the store does
  the updating), no options page, no updater, no fetch door in its worker.
- `versions.json` names both packages and both hashes, so nobody has to guess
  which ZIP is the download and which is the upload.

## 3.8.179 — 2026-09-20

- **You can now tell which build you downloaded.** The ZIP link always serves
  the newest version and its filename never changes, so two downloads looked
  identical and the only way to tell them apart was to extract one and read its
  manifest. `versions.json` now sits beside the ZIP naming the published
  version, the build date and the archive's SHA-256 — and since one version is
  one file, that hash is checkable against your download. The installer page
  states the same version in its own title.

## 3.8.178 — 2026-09-20

- ⛏ **Paint** stops calling transparent layers painters. Three answers now,
  not one word: a visible colour is `PAINTS`, alpha 0 is `transparent —
  contributes nothing`, and part-way is `PAINTS · alpha 0.06`. That also makes
  the blend count mean something — transparent layers drop out of it, so the
  number is the answer rather than a row tally.
- A `::before` or `::after` now prints **where it sits**. `inset 0` is a
  wallpaper covering the element; `bottom 0 · auto × 1px` is a hairline ring.
  Told only that both "may paint here", you could not tell them apart.
- Three more things the fold cannot model are named instead of folded in
  silently: the element's own `filter`, `mix-blend-mode`, and an ancestor's
  `opacity` — which fades a whole subtree as one group, and is reported once
  against the element that sets it rather than once per layer beneath it.

## 3.8.177 — 2026-09-20

- ⛏ **Paint** now answers the two questions a deep stack raises. Every row
  carries its rect — a short selector like `div.flex.flex-1.min-h-0` can occur
  dozens of times on one page, and size is what tells them apart — and the
  layer the colour actually comes from is marked `← the colour you see`,
  instead of leaving you to fold twelve layers by hand.
- And it now says what it could **not** see, rather than stopping quietly: the
  overlay's own layers removed from the top, a stack that stopped at a shadow
  host (at least that many, since a closed root cannot be detected at all),
  and any frame it could not cross. A walk that stops silently is a partial
  answer wearing a complete one.

## 3.8.176 — 2026-09-20

- New **Paint** tool (⛏, in the 🎨 colour family, off until you arm it): which
  element actually paints the pixel you are pointing at. Inspect answers "the
  topmost element here", which is a different question — on a rounded card the
  topmost element is often the one *not* painting there, because the point sits
  inside its box but outside its rounded shape, and the colour you see belongs
  to whatever is behind. The report carries the whole stack top to bottom, each
  layer marked painted / `box only — not painted here` / clipped away by an
  ancestor's overflow, with its colour — plus `::before`/`::after` and
  `backdrop-filter`, the two things hit-testing cannot see. The probe follows
  the pointer and holds when you move onto the panel, so ⧉ reports the pixel
  you meant.

## 3.8.175 — 2026-09-18

- **The Tampermonkey userscript is withdrawn.** The extension is the only way
  in now: it has the side panel, it survives a page refresh, and it is what
  the project is developed against. If you run the userscript, v3.8.174 is
  your last build — it tells you so on the bar and points you here. Its files
  stay published for ever so that message keeps arriving; nothing rebuilds
  them.
- The update check now reads the extension's published manifest instead of the
  userscript header — the file a release actually moves. Without that change
  the extension would have believed 3.8.174 was the newest version for ever,
  with nothing reporting the mistake.

## 3.8.174 — 2026-09-18

- The last Tampermonkey userscript build, and it says so itself: it stops
  checking for updates, rests an amber mark on ⏻, and carries one line telling
  you to move to the browser extension. Right-click ⏻ for the instructions.
  Nothing else changed.

## 3.8.173 — 2026-08-28

- The grouping tool is now called **Group**, not Select. Selecting is what a
  click has always done; this tool only decides how kept elements pair up
  (Shift+click) and chain (Ctrl/⌘+Shift+click). Nothing about the gestures
  changed, and nobody loses the tool on upgrade.

## 3.8.172 — 2026-08-28

- A page audit now says what it did **not** check — elements that were not
  rendered, counted by reason, plus iframes and shadow roots it cannot enter.
  It prints only when there is something to say, on the audit and in the
  copied report.
- Fixed: elements inside a `display:none` or `opacity:0` subtree were still
  being audited, so a closed menu produced findings about text nobody can see.

## 3.8.169 — 2026-08-27

- New **Accessibility** tool (off until you arm it): the accessible name, role
  and keyboard reach of whatever you point at. Its rules flag focusable
  elements with no name, focusable content inside `aria-hidden="true"`, and
  images with no `alt` attribute — and say "not determined" rather than
  guessing when the name cannot be read from here.

## 3.8.161 — 2026-08-26

- Large pages no longer freeze while auditing: the pass yields to input
  instead of blocking until it finishes, so scrolling and clicking keep
  working through it.
- Dragging the bar, and moving the pointer over an audited page, stopped
  costing a full page layout per frame.
