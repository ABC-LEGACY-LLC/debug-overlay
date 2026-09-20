# Changelog

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
