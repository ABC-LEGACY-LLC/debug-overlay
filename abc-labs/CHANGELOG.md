# Changelog

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
