# Changelog

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
