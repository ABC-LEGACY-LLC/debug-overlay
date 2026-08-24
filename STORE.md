# Publishing Debug Overlay to the Chrome Web Store

**Why this exists.** An unpacked extension can only be updated by writing its
files to disk, and a program that fetches files from the internet and writes
them to disk *is* a downloader — which is what security software calls it,
correctly, and always will. That is not a bug in our code and no amount of
clean code fixes it; it is the shape of the thing. Published through the Web
Store, Chrome does the updating itself, and the entire problem disappears:

| | unpacked (today) | Web Store |
|---|---|---|
| install | Developer mode → Load unpacked → pick a folder | one click |
| updates | our updater writes files to disk | Chrome, silently |
| antivirus | flags the updater as a dropper | never involved |
| managed machines | policy can block the writes | unaffected |
| what can go wrong | wrong folder, torn write, blocked write | nothing to get wrong |

`npm run ship` builds the package at **`dist/browser-extension-store/`** —
upload `debug-overlay-clean.zip`.

---

## What the store package deliberately does NOT contain

It sheds every piece of update machinery, because the store forbids
extensions that update themselves and because that machinery is the part
security software objects to:

- no `update.js` / `update.html` — the store updates it
- no `install.html` / `install.bat` — one click replaces them
- no `files.json` — nothing reads a file list any more
- **no host permissions at all** — the only one ever requested
  (`raw.githubusercontent.com`) existed solely for the update check
- a service worker that only opens the side panel; no network door

What remains asks for exactly what a page inspector needs. `content.js` is
the same bundle as the other two gates, byte for byte, so the three cannot
drift; it still contains the update-checker code, which in this build cannot
reach anything — there is no host permission and no fetch relay. The suite
asserts all of the above (`npm run check`, section **THE STORE PACKAGE**).

**Two files exist only for people installing this ZIP before it is on the
store: `INSTALL.txt` and `guide.html`.** Neither belongs in the store upload
conceptually (the store's own "Add to Chrome" button replaces them), but
neither hurts it either — `install.html`/`install.bat` were excluded above
because they *write files*; these two only display text and copy a string to
the clipboard. They exist because this same ZIP is also README's Option B —
a real install route for a machine whose security software quarantined the
self-updating build (see the git history for that incident). Once the store
listing is live and is the recommendation, these can be dropped from the
store upload if a reviewer objects to unrelated files; they were never
required for the review itself, and the manifest never references them.

---

## One-time setup

1. Go to the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).
2. Sign in with the account that should own the listing.
3. Pay the **one-time $5** registration fee.

## Publishing

1. **New item** → upload `dist/browser-extension-store/debug-overlay-clean.zip`.
2. Fill in the listing (copy below).
3. **Visibility:** choose **Unlisted** if this is for your team — it does not
   appear in search and is installable only by people who have the link.
   Public if you want anyone to find it.
4. Submit. Review usually takes a few days; broad permissions can add time.
5. Every later release: bump with `npm run ship`, upload the new ZIP, submit.
   Installed copies update themselves within hours.

---

## Listing copy

**Name:** Debug Overlay — AI-friendly UI inspector

**Short description** (132 max — the build refuses a longer one):
> Inspect any page: sizes, spacing, contrast, grid. Pin elements, audit the
> page, copy an AI-ready report.

**Detailed description:**

> Debug Overlay is a UI inspector that runs on any page and is designed to be
> read off a screenshot — which makes it useful on its own, and useful when
> you are handing a screenshot to an AI assistant.
>
> • Hover any element for a live badge: exact size, padding, margin, font.
> • Click to pin. Shift+click two elements to measure the distance between
>   them. Ctrl+Shift+click to chain pins and read a rhythm off one picture.
> • Audit the whole page for contrast failures (WCAG AA/AAA), off-grid
>   spacing, and duplicate ids — every finding marked in place, not just
>   listed.
> • Watch performance: page freezes, jank, and the live cost of a single
>   pinned component.
> • Copy a structured text report of everything on screen, ready to paste
>   into a chat.
> • Open the side panel for a larger view that survives page reloads and
>   keeps a timeline of what happened.
>
> Everything runs locally in your browser. No account, no telemetry, and
> nothing is ever sent anywhere.

**Category:** Developer Tools
**Language:** English

---

## Permission justifications

The review asks for these in the dashboard. Answer plainly:

**`sidePanel`**
> The extension's main interface is a browser side panel, which shows the
> inspector's controls and readings without covering the page being
> inspected.

**Host permission / content script on all sites (`<all_urls>`)**
> This is a page inspector: it reads layout, computed styles and colours of
> elements on whatever page the developer is looking at, so it must be able to
> run on any site they choose to inspect. It reads the page and draws an
> overlay on top of it. It does not transmit page content anywhere — there is
> no server, and the extension makes no network requests in this build.

**Single purpose**
> Inspecting and measuring the user interface of web pages, and reporting what
> it finds.

**Data use** — tick nothing collected, and:
> This extension does not collect, transmit, or sell any user data.
> Everything it reads stays in the browser; settings are stored locally with
> chrome.storage. It contacts no server.

**Remote code:** answer **No**. The extension executes no remote code: it
contains no `eval`, no `new Function`, and loads no external scripts. This is
verified by the test suite on every build.

---

## After it is published

- Add the store link to the README as **Option C**, and make it the
  recommendation for anyone who is not developing the overlay itself.
- Keep the userscript gate: it is still the right answer for Firefox and for
  anyone who wants the overlay without an extension.
- Keep the unpacked gate: it is how *this project* is developed and tested,
  and `npm run dev` depends on nothing else.
