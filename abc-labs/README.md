# Debug Overlay

A UI inspector that runs on the page itself, not in a devtools panel. Press
**Alt+Shift+D** on any site and a bar appears; everything it measures is drawn
on the page, so a screenshot carries the numbers with it.

## The first minute

- **Hover** anything — a badge shows size, radius, padding, margin, gap and
  font, read off what the browser actually rendered.
- **Click** to keep an element; **Shift+click** two and the distance between
  them is drawn between them.
- **⌕** audits the whole page: findings are marked where they are, and repeats
  collapse — five thousand occurrences of one problem read as one line.
- **⧉** copies a structured report — numbers, findings, and what each rule
  means — ready to paste into a chat beside the screenshot.

## What it checks

Contrast against WCAG AA or AAA, read off painted pixels, so gradients and
`opacity` are handled honestly. Spacing off your project's grid step. Accessible
name, role and keyboard reach. Duplicate ids. Main-thread freezes and the
per-component cost behind them. Every rule answers pass, fail, or **review** —
"I tried and could not tell", with the reason — and an audit states what it did
*not* reach: unrendered elements, iframes, shadow roots. A clean result you
cannot trust is worse than none.

For designers and engineers auditing a live interface, and for anyone handing a
UI to an AI: the copied report is the evidence half of that conversation. It
reads the page and never changes it.
