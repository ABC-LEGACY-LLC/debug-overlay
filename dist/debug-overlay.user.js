// ==UserScript==
// @name         Debug Overlay — AI-friendly UI inspector
// @namespace    alonur.tools
// @version      3.8.60
// @description  Pluggable, screenshot-friendly UI debug overlay. Power switch plus independent tools (measure, grid, contrast). Pin elements, read exact values off the screenshot, copy a structured report for an AI chat.
// @author       Alonur
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/debug-overlay.meta.js
// @downloadURL  https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/debug-overlay.user.js
// ==/UserScript==

/*
HOW TO USE
  ----------
  Alt+Shift+D ......... power on/off (or click ⏻ on the panel)
  Hover ............... live badge for the element under the cursor
  Click ............... INSPECT one element (orange, dashed). Its badge freezes
                        in place. No measuring, no green line.
  Shift+Click ......... MEASURE (lime, solid). These pin in PAIRS: the 1st is
                        "from" (cyan, marked 1…), the 2nd is "to" and draws the
                        dimension. The 3rd starts a brand new pair — nothing is
                        ever chained off your previous selection.
                        Set Pin grouping to 'chain' under ⚙ for the old behaviour.
  Click again ......... unpin (or click with the other modifier to switch the
                        pin between inspect and measure)
  Hold X .............. REMOVE mode: a red ✕ appears on every pin and only pins
                        are clickable — click one to delete it. Works even for
                        pins whose element is hard to hit again. Release to exit.
  Hold Alt ............ pass clicks through to the page (links keep working)
  Esc ................. closes the top layer: an open panel first, then remove
                        mode, then pins. It never powers the tool off — that is
                        the ⏻ button and Alt+Shift+D, both of which say so.
  ≡ ................... compact / full badges
  ⌕ ................... audit the WHOLE page — every active rule runs over every
                        visible element, and the button shows how many distinct
                        problems came back. Repeats collapse: a nav of 40
                        identical links is one finding, not forty. The result
                        rides along in the next report you copy, and every
                        finding is outlined on the page by the tool that found
                        it — dashed for a failure, dotted for a review. Turn a
                        tool off and its outlines go; its findings stay.
  ⚙ ................... tool settings — every option any tool declares, in one
                        list. Changing one takes effect immediately and is
                        remembered per site; it also drops the last ⌕ result,
                        because those findings were judged under the old
                        setting and nothing on screen would say so. Press ⌕
                        again to re-audit.
  ⧉ ................... copy structured report → paste into Claude with a screenshot
  Count chip .......... click the pin count to open the pin list: every pin and
                        measured pair in one place, even ones scrolled off
                        screen. Click a row to scroll to it and flash it; click
                        its ✕ to remove (a pair row removes both). Click the
                        chip again to close it before taking a screenshot.
  ✕ ................... clear pins AND the audit's outlines. Those outlines used
                        to have no exit at all: the ⌕ flash expires after a
                        second, so the bar looked idle while the page stayed
                        covered. ⌕ now keeps a green ring while an audit is
                        showing.
  Panel ............... drag by ⋮⋮; snaps to nearest edge; while OFF it tucks
                        away after ~2s leaving a 10px peek. Position remembered.

  POWER vs TOOLS
  --------------
  ⏻ is the master switch: it only decides whether the overlay is listening
  at all. WHAT gets measured is decided by the tools below it, each an
  independent toggle you can mix freely:

    ⬚ select    how pinned elements group up — pairs or a chain. Pairing
                 lives here and not in measure, so a new way of selecting is
                 one new file and everything that measures picks it up.
    📐 measure   sizes, radius, padding/margin, gap, font, and the distance
                 between whatever the selection tools have grouped. Right-click
                 it to choose which of those the badge shows — a full badge is
                 a lot of ink over a page you came to read one number off. The
                 copied report always carries everything, because there the
                 line you did not want costs nothing and the one you did costs
                 a round trip.
    ▦ grid       marks any number another tool prints that is off the
                 spacing step (⚠ — 2px by default, change it under ⚙). Its
                 "Suggest nearest step" option adds the fix after each mark:
                 p 7⚠ becomes p 7⚠→8. Off by default — a suggestion doubles
                 every marked number. In ⌕ it
                 judges AUTHORED spacing only — padding, margin, gap — never
                 width or height, which layout produces rather than anyone
                 choosing, and nothing above CONFIG.GRID_MAX, where
                 margin:auto lands.
    ◐ contrast   WCAG text contrast ratio, against AA or AAA (⚙)
    ⌗ dupid      the same id used more than once — a page-wide question
    ⌖ pick       Ctrl+click (⌘+click) copies what you clicked — its selector,
                 or its text (⚙). Off by default: it takes a click over, and
                 that should be something you asked for.

  Every tool fills one or more of four ROLES, derived from the hooks it
  implements and shown in its tooltip: Select (what you are looking at),
  Inspect (what is shown about it), Detect (what counts as a problem), Act
  (what the overlay does to the page or the clipboard). A tool declares none
  of this — grid says "Inspect · Detect" because it annotates AND audits. The
  ⚙ list is grouped the same way: by what a setting CHANGES, not by which tool
  happens to own it.

  A tool's settings have two doors into the same room. ⚙ lists every one of
  them grouped by what it CHANGES; RIGHT-CLICK a tool's button for just that
  tool's, without everyone else's. The second is a filter of the first — the
  same options() call, the same control, the same value — so nothing can be set
  in one place and stale in the other. Neither is a menu a tool built for
  itself: a tool added tomorrow is configurable through both the moment it
  appears, with nothing installed or wired up.

  The rule between the toggles is not decoration. Tools below it carry a green
  dot and feed ⌕ — which is why ⌕ sits with them. Tools above it only draw.
  Arming decides what you SEE; ⌕ checks every rule either way, so a toggle you
  forgot can never quietly shorten an audit.

  Active tools, panel position and everything under ⚙ are remembered for the
  SCRIPT, not for the site — set them once and every other site already agrees,
  and Tampermonkey's own sync carries them to a new machine.

  ARCHITECTURE — each file is independent; edit one to change one behaviour.
  They are concatenated into a single closure in the order listed by ORDER in
  build.js, which is the one place that order is written down. Filenames carry
  no numbers, because a filename should say what a thing IS, not when it loads.

    banner.js        opens the closure everything else lives in
    core/config      every tunable number/key
    core/state       single source of truth, plus STORE, the part of it
                     that outlives the page
    core/utils       pure functions — no DOM writes, no State reads
    core/geometry    dimension-line geometry & drawing (tool-agnostic)
    core/registry    ⭐ the plugin registry, and the four ROLES
    subjects/*       shared measurement plus the settings that govern it —
                     called by components, never calls back
    tools/*          ⭐ one file per debug capability, auto-discovered
    ui/styles        core CSS (tools carry their own)
    ui/dom           root & drawing layer
    ui/controls      one widget from a description of it
    ui/list          the popover the panel opens
    ui/panel         the bar: buttons, drag, snap, auto-tuck
    ui/placement     collision-free badge positioning
    ui/badges        composes badge HTML from the ACTIVE tools
    ui/renderer      draws one frame from STATE
    app/report       structured text export, composed from tools
    app/interactions page-level mouse & keyboard
    app/controller   the only glue between modules
    app/settings     the ⚙ view, and what a tool's options mean
    app/sweep        runs the rules over the whole page
    boot.js          wires it together, starts it, closes the closure

  RULES that keep it from turning to mush:
    · UTILS is pure. It never reads State and never asks "is tool X on?" —
      callers hand in a decorator (see U.mark(n, dec)).
    · No tool names another tool. A "lens" (grid) decorates the numbers other
      tools print, reached through Tools.annotator() — never by id.
    · Tool-specific behaviour lives in that tool, never in RENDERER. If the
      renderer needs to know something, the tool exposes a hook and the
      renderer asks every active tool (see pendingIndex).
    · PANEL never touches State. It fires callbacks; CONTROLLER handles them.
    · MEASURE knows nothing about tools, panels or reports — only rectangles.
    · CONTROLLER is the one place modules are wired together.

  ADDING A NEW DEBUG TOOL — one object in section 5, nothing else:

    {
      id: 'zindex',
      icon: '⧉', title: 'Stacking — z-index & position',
      startsOn: false,             // optional, armed on a fresh install?
      badge:   (i) => `<span class="sp">z ${i.cs.zIndex}</span>`,  // optional
      compact: (i) => null,                                       // optional
      report:  (i) => [`  z-index: ${i.cs.zIndex}`],              // optional
      draw:    (ctx) => {},                                       // optional
      reportTail: () => [],        // optional, summary lines after all pins
      pendingIndex: () => -1,      // optional, pin still being chosen
      annotate: (html, n, i) => html,   // optional, decorate other tools' numbers
      audit: (i) => [{ el, verdict, severity, rule, message, key }],  // optional
      auditPage: (all) => [],  // optional, once per sweep with every element
      options: () => [{ key: 'depth', label: 'Stack depth',   // optional
                        def: CONFIG.DEPTH, values: [1, 2, 3],
                        affects: 'inspect' }],
      intercept: ({ type, ev, el }) => false,   // optional, act on a click
      rules: { 'my-rule': { help, why, docs } },   // optional, what a rule IS
    }

    Every option declares `affects` — 'select', 'inspect', 'detect' or 'act' —
    and the ⚙ view files the row under that heading. It is the ONE category in
    this codebase that is declared rather than derived: a tool's roles come
    from its hooks and cannot go stale, but no hook can tell you whether a knob
    is a detection threshold or a display preference. audit.js fails an option
    without one.

    options() is how a tool becomes adjustable without a rebuild. Each entry
    gets a row under ⚙; `def` is the shipped default and belongs in CONFIG, so
    that file still answers "what does a fresh install do" while the panel
    answers "what is this one doing now". Read the live value back with
    Tools.setting(this, 'depth') — `this`, never an id, like every other
    question the registry answers. Do not cache it: the user can change it
    between two frames. Three kinds of option:

      values: [1, 2, 3]                     a picker
      type: 'number', min, max, step        a threshold you type
      type: 'toggle'                        on or off

    intercept() is the only hook that ACTS on the page rather than describing
    it. Armed tools are offered each click before it becomes a pin; return true
    to say it was yours, and no pin lands underneath. Return false and nothing
    changed. Claim narrowly — a modifier, a shape of element — because a tool
    that swallows every click has taken the overlay away from everything else.

    Whatever a tool puts in `title`, `icon` or an option `label` is the only
    thing a user ever sees of it, and audit.js now fails a tool that omits the
    first two — a panel button reading "undefined" is not a control surface.

    A tool declares no type. Its hooks are what it is, and it may have any
    combination of them — grid decorates other tools' numbers AND audits.

    audit() has three answers, not two: the element passed (say nothing), it
    failed, or it could not be measured. The last one has to be said out loud,
    with a reason, or a page nobody could read reports clean.
      verdict  ∈ fail | review
      severity ∈ error | warn | info   (CONFIG.SEVERITY — the sort order)
      rule      a rule id, not a tool id; one tool may own several
      key       which findings collapse into one line. Without one they
                collapse by rule + message.

    audit(info) sees one element. auditPage(all) runs once at the end of a
    sweep with every visible element's info, for the questions a single
    element cannot answer — a duplicated id, a spacing scale nobody kept to,
    two things that only conflict with each other. It is only gathered when
    some tool implements the hook, so a page with no relational rule pays
    nothing for one.

    `rules` documents a rule as opposed to one instance of it. The message
    says "2.76:1"; help/why/docs say what the rule is and where to read more.
    The report gathers them into a "## rules" section at the end — once per
    rule, not once per finding, which made a real report unreadable.

  The panel button, persistence, badge composition and report inclusion are
  all derived from the registry automatically.
*/

  // ─── src/banner.js ─────────────────────────────────────────────────────
(function () {
  'use strict';

  /**
   * NOT `window.top !== window.self`. With @grant the manager runs this in a
   * sandbox where `window` is a wrapper, and that comparison can be true in
   * the TOP frame — which would disable the overlay everywhere, silently, on
   * every site. frameElement is null at top level in every context, so this
   * cannot misfire in the one direction that matters. @noframes is what keeps
   * us out of cross-origin frames, where frameElement reads null anyway.
   */
  let framed = false;
  try { framed = !!window.frameElement; } catch { framed = true; }
  if (framed) return;

  /**
   * Ask the DOCUMENT first. A re-injection on soft navigation can arrive in a
   * fresh sandbox — a new `window`, the same page — and a window flag alone
   * would have missed that and built a second panel fighting the first for the
   * same hotkey. The flag stays as the cheap path and as what the tests read.
   */
  if (document.getElementById('__dbgov-root')) return;
  if (window.__DBG_OVERLAY__) return;
  window.__DBG_OVERLAY__ = true;

  // ─── src/core/config.js ────────────────────────────────────────────────
  /* ======================================================================
     CONFIG
     ====================================================================== */
  /**
   * Anything a tool exposes through its options() hook takes its DEFAULT from
   * here and its current value from the panel. So this file still answers "what
   * does a fresh install do", and the ⚙ view answers "what is this one doing
   * now" — without a second copy of the number living anywhere.
   */
  const CONFIG = {
    // Substituted by build.js at bundle time. A userscript with @grant none
    // cannot read GM_info, and an overlay that cannot say which version it is
    // makes a stale install look exactly like a current one — which is the
    // failure this project has already had once, from the other end.
    VERSION: '3.8.60',
    Z: 2147483647,
    // The step the "grid" tool checks against. 2, not 4, because that is what
    // the scale in front of us actually is: Tailwind's default spacing has
    // half-steps (0.5 = 2px, 1.5 = 6px, 2.5 = 10px) and a real page used them
    // 2,681 times. A rule has to check the scale a project HAS; making the
    // project match the rule is the wrong way round. Set it to 4 or 8 for a
    // project that keeps to whole steps.
    GRID: 2,
    // Above this, a margin or padding is layout arithmetic rather than a
    // spacing token. getComputedStyle resolves `margin: auto` to the pixels it
    // worked out — 1127px on a real page — and nothing distinguishes that from
    // a value somebody typed. Nobody types 1127px; nobody types past this.
    GRID_MAX: 96,
    PEEK: 10,                 // px of panel visible when tucked
    TUCK_DELAY: 2200,         // ms idle before the panel tucks away
    EDGE_MARGIN: 8,
    BADGE_MARGIN: 6,
    POS_KEY: '__dbgov_pos',
    TOOLS_KEY: '__dbgov_tools',
    SETTINGS_KEY: '__dbgov_settings',
    // Which tool ids this install has already met. Without it a saved armed
    // set answers for tools that no longer exist and stays silent about ones
    // shipped since — so a new capability arrives switched off and invisible.
    SEEN_KEY: '__dbgov_seen',
    FLASH_MS: 1200,           // how long a button shows a transient message
    LIST_GAP: 10,             // px between the bar and the popover it opens
    LIST_PAD: 6,              // px the popover keeps from the viewport edge
    // No DEFAULT_TOOLS list here any more. It named tool ids in a core file,
    // so shipping a tool that should start armed meant editing this — the one
    // place "a new tool is one new file" was not literally true. A tool says
    // `startsOn: true` about itself instead, and nothing central has to know
    // the name of anything.
    // 'pairs' = every measurement takes two clicks (from → to) and the next
    //           click starts a fresh pair, so a pin is never reused silently.
    // 'chain' = old behaviour: each pin measures to the previous one.
    PAIR_MODE: 'pairs',
    // A pin's "kind" names which tool consumes it. Defined once here so the
    // input layer, controller and renderer never hardcode a tool's id.
    PIN_KIND: { PLAIN: 'note', SHIFT: 'measure' },
    PICK_FLASH: 700,          // ms an element stays outlined after being picked
    LANE_SEP: 16,             // px between parallel dimension lines
    HOTKEY: { alt: true, shift: true, ctrl: false, code: 'KeyD' },
    REMOVE_KEY: 'KeyX',       // hold to reveal ✕ on pins and click one to remove
    // `level` is the default the panel starts on; `levels` is what it offers.
    // The two thresholds move together — a rule that checked AAA for body text
    // and AA for headings would be neither.
    CONTRAST: {
      largePx: 24, largeBoldPx: 18.66,
      level: 'AA',
      levels: { AA: { normal: 4.5, large: 3.0 }, AAA: { normal: 7.0, large: 4.5 } },
    },
    // Findings vocabulary, shared by every 'rule' tool. The number is only a
    // rank, so a list of findings reads worst-first.
    SEVERITY: { error: 3, warn: 2, info: 1 },
    // Marks drawn per tool per frame. A page can return thousands of findings
    // and this runs at 60fps, so it is a ceiling on cost, not on truth — the
    // list and the report still carry every one of them.
    MARK_LIMIT: 200,
  };

  // ─── src/core/state.js ─────────────────────────────────────────────────
  /* ======================================================================
     STATE — what is known now, and what is kept between visits

        STORE is here rather than in a section of its own because it is the
        same concern: State is what the overlay knows, Store is the part of
        that which outlives the page.

        WHY IT EXISTS: localStorage is scoped to one origin, and this script
        matches every site. So arming a tool or choosing a grid step on one
        domain taught the overlay nothing about the next one — every new site
        started from the defaults again, which is a setup step handed back to
        the user on every domain they visit. GM_getValue is per SCRIPT, and it
        rides Tampermonkey's own sync to a new machine.

        Both backends store the same JSON strings, so what is already in
        localStorage is readable as-is and gets adopted on first run.
     ====================================================================== */
  const Store = {
    /**
     * The manager only defines these when the header asks for them, and the
     * dev page, the tests and any manager without them have to keep working —
     * so every path falls back rather than losing what it was asked to keep.
     * `typeof` on an undeclared name is the only safe way to ask.
     */
    _gm: typeof GM_getValue === 'function' && typeof GM_setValue === 'function',

    /** The stored string for `key`, or null. Never throws. */
    get(key) {
      try {
        if (!Store._gm) return localStorage.getItem(key);
        const v = GM_getValue(key);
        if (v !== undefined && v !== null) return String(v);
        // First run after the grant landed. Adopt whatever this origin already
        // had, so nobody's tools and settings reset on the day it shipped —
        // and write it through, so the next origin inherits it too.
        const old = localStorage.getItem(key);
        if (old !== null) {
          GM_setValue(key, old);
          // and remove the original. Adoption used to copy and leave, so every
          // site the script had ever touched kept a stale duplicate that went
          // wrong the moment the GM copy changed — two answers to one question,
          // with only one of them read.
          try { localStorage.removeItem(key); } catch {}
          return old;
        }
        return null;
      } catch { return null; }
    },

    /** Persist `value` (a string). Storage being unavailable is not an error. */
    set(key, value) {
      try {
        if (Store._gm) GM_setValue(key, value);
        else localStorage.setItem(key, value);
      } catch {}
    },
  };

  /* ======================================================================
     STATE
     ====================================================================== */
  const State = {
    enabled: false,      // master power
    detail: false,       // compact vs full badges
    tools: new Set(),    // active tool ids — filled by CONTROLLER on boot
    // { toolId: { key: value } } for every option any tool declares. Filled
    // once on boot from the tools' own defaults, then overlaid with whatever
    // was saved, so the hot path is a lookup and never a hook call: grid asks
    // for its step once per number on a page with thousands of them.
    settings: {},
    pins: [],            // [{ el, id, kind }] — kind ∈ CONFIG.PIN_KIND
    hoverEl: null,
    removeMode: false,   // true while the remove key is held
    removeTarget: null,  // pin object under the cursor in remove mode
    flashPins: null,     // pins briefly highlighted after "reveal" from the list
    // Last whole-page sweep: { findings, rules, elements }, or null if none
    // has been run. It carries what RAN, not only what was found, because a
    // zero that means "nothing was checked" and a zero that means "nothing is
    // wrong" must not print the same sentence. Cleared on power off: the DOM
    // moves on, and a stale page audit is worse than no audit.
    sweep: null,
  };

  // ─── src/core/utils.js ─────────────────────────────────────────────────
  /* ======================================================================
     UTILS — pure helpers
     ====================================================================== */
  const U = {
    /**
     * Math.round breaks ties toward +Infinity, so +2.5 became 3 (off a 2px
     * grid) and -2.5 became -2 (on it) — the SIGN of a half-pixel decided the
     * verdict rather than its distance from the grid. Fractional computed
     * margins are ordinary on fractional-DPR displays. Half away from zero
     * treats a margin and its mirror image alike.
     */
    px: (v) => {
      const n = parseFloat(v) || 0;
      return Math.sign(n) * Math.round(Math.abs(n));
    },

    /**
     * Anything the PAGE controls has to come through here before it is
     * interpolated into badge markup, because badges reach the DOM through
     * innerHTML. An element's id is page-authored text, and a hostile — or
     * merely careless — one closed the span and opened a tag of its own.
     */
    esc: (s) => String(s).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    // `dec` is a decorator, (n) => html, handed in by the caller. UTILS never
    // reads State, and never learns what decorating a number means.
    mark: (n, dec) => (dec ? dec(n) : `${n}`),

    four(cs, prop, dec) {
      const t = U.px(cs[prop + 'Top']), r = U.px(cs[prop + 'Right']),
            b = U.px(cs[prop + 'Bottom']), l = U.px(cs[prop + 'Left']);
      if (!t && !r && !b && !l) return null;
      if (t === b && r === l)
        return t === r ? [U.mark(t, dec)] : [U.mark(t, dec), U.mark(r, dec)];
      return [U.mark(t, dec), U.mark(r, dec), U.mark(b, dec), U.mark(l, dec)];
    },
    fourPlain(cs, prop) {
      return {
        t: U.px(cs[prop + 'Top']), r: U.px(cs[prop + 'Right']),
        b: U.px(cs[prop + 'Bottom']), l: U.px(cs[prop + 'Left']),
      };
    },
    radius(cs) {
      const c = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']
        .map((k) => U.px(cs['border' + k + 'Radius']));
      if (!c.some(Boolean)) return null;
      return c.every((v) => v === c[0]) ? `${c[0]}` : c.join('/');
    },
    /**
     * An id a person chose is the best address there is. A generated one is
     * the worst: React and base-ui emit things like `base-ui-:r1t9:`, which
     * changes on the next render, so a report that says #base-ui-:r1t9: names
     * an element nobody can find twice. A bare CSS identifier is the test —
     * a colon is not legal in one unescaped, so nobody typed it.
     */
    stableId: (id) => /^[A-Za-z][\w-]*$/.test(id),
    selectorOf(el) {
      const part = (e) => {
        if (e.id && U.stableId(e.id)) return '#' + e.id;
        let s = e.tagName.toLowerCase();
        const cls = [...e.classList].filter((c) => !c.startsWith('__dbgov')).slice(0, 2);
        if (cls.length) s += '.' + cls.join('.');
        const p = e.parentElement;
        if (p) {
          const same = [...p.children].filter((x) => x.tagName === e.tagName);
          if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
        }
        return s;
      };
      const chain = [];
      let e = el;
      while (e && e.tagName && chain.length < 3) {
        chain.unshift(part(e));
        // only a real id ends the walk — a generated one anchors nothing, so
        // keep climbing for ancestors that actually locate the element
        if (e.id && U.stableId(e.id)) break;
        e = e.parentElement;
      }
      return chain.join(' > ');
    },
    // human-readable name for a pin row: the element's own text, else a selector
    labelOf(el) {
      const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
      if (t) return t.length <= 34 ? t : t.slice(0, 31) + '…';
      const cls = [...el.classList].filter((c) => !c.startsWith('__dbgov'))[0];
      return el.tagName.toLowerCase() + (el.id ? '#' + el.id : cls ? '.' + cls : '');
    },
    /**
     * `r` is a getter: a rule that only reads colours never pays for a
     * layout read, which over a whole page is thousands of them. `cs` can be
     * handed in by a caller that has already read it.
     */
    info(el, cs) {
      let r = null;
      return {
        el,
        cs: cs || getComputedStyle(el),
        get r() { return r || (r = el.getBoundingClientRect()); },
      };
    },
    gap(a, b) {
      const dx = Math.max(a.left - b.right, b.left - a.right, 0);
      const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
      return { dx: Math.round(dx), dy: Math.round(dy), d: Math.round(Math.hypot(dx, dy)) };
    },
    rectOf: (x, y, w, h) => ({ l: x, t: y, r: x + w, b: y + h }),
    overlap: (a, b) =>
      Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) *
      Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)),
  };
  // Colour and contrast helpers used to live here. Every one of them had a
  // single caller, and reading a colour properly needs a canvas — which this
  // file may not create. They moved into the tool that owns the subject.

  // ─── src/core/geometry.js ──────────────────────────────────────────────
  /* ======================================================================
     MEASURE ENGINE — how a distance between two rects is drawn.
     Pure geometry + drawing rules. Knows nothing about tools, panels or
     reports, so dimension styling can be tuned in isolation.
     ====================================================================== */
  const Measure = {
    // --- lanes: keep parallel dimension lines off each other -------------
    lanes: { v: [], h: [] },
    resetLanes() { Measure.lanes = { v: [], h: [] }; },

    /**
     * Reserve a column (vertical span) or row (horizontal span) at `pos`.
     * If another span already occupies that position AND their spans overlap
     * along the measured axis, shift sideways in LANE_SEP steps until clear.
     * Returns the position actually granted.
     */
    reserveLane(vertical, pos, from, to) {
      const SEP = CONFIG.LANE_SEP;
      const list = vertical ? Measure.lanes.v : Measure.lanes.h;
      const lo = Math.min(from, to), hi = Math.max(from, to);
      const offsets = [0];
      for (let s = 1; s <= 10; s++) offsets.push(s * SEP, -s * SEP);
      for (const off of offsets) {
        const cand = pos + off;
        const clash = list.some((L) =>
          Math.abs(L.pos - cand) < SEP - 1 && !(hi < L.lo - 2 || lo > L.hi + 2));
        if (!clash) { list.push({ pos: cand, lo, hi }); return cand; }
      }
      list.push({ pos, lo, hi });
      return pos;
    },

    // Which axis does this gap actually live on?
    axisOf(ra, rb) {
      const xOv = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const yOv = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (xOv > 0 && yOv > 0) return { kind: 'overlap', label: 'overlap', xOv, yOv };
      if (xOv > 0) return { kind: 'vertical', label: 'vertical gap', xOv, yOv };
      if (yOv > 0) return { kind: 'horizontal', label: 'horizontal gap', xOv, yOv };
      return { kind: 'diagonal', label: 'diagonal gap', xOv, yOv };
    },

    // one straight measured span: tick at the start, arrowhead at the target
    span(layer, Place, { x1, y1, x2, y2, text, vertical, endArrow = true }) {
      const len = vertical ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
      const dir = vertical ? (y2 >= y1 ? 'down' : 'up') : (x2 >= x1 ? 'right' : 'left');

      const line = document.createElement('div');
      line.className = 'dbgov-line';
      if (vertical) {
        Place.put(line, Math.round(x1) - 1, Math.min(y1, y2), 2, Math.max(len, 1));
        Place.claim(Math.round(x1) - 5, Math.min(y1, y2), 10, Math.max(len, 1));
      } else {
        Place.put(line, Math.min(x1, x2), Math.round(y1) - 1, Math.max(len, 1), 2);
        Place.claim(Math.min(x1, x2), Math.round(y1) - 5, Math.max(len, 1), 10);
      }
      layer.append(line);

      // start: perpendicular tick — "measurement begins exactly here"
      const tick = document.createElement('div');
      tick.className = 'dbgov-cap';
      if (vertical) Place.put(tick, Math.round(x1) - 6, Math.round(y1) - 1, 12, 2);
      else Place.put(tick, Math.round(x1) - 1, Math.round(y1) - 6, 2, 12);
      layer.append(tick);

      // end: arrowhead pointing into the target — reads as direction, not a stub
      if (endArrow) {
        const a = document.createElement('div');
        a.className = 'dbgov-arrow ' + dir;
        const P = { up:    [Math.round(x2) - 5, Math.round(y2)],
                    down:  [Math.round(x2) - 5, Math.round(y2) - 7],
                    left:  [Math.round(x2),     Math.round(y2) - 5],
                    right: [Math.round(x2) - 7, Math.round(y2) - 5] }[dir];
        Place.put(a, P[0], P[1]);
        layer.append(a);
      } else {
        const c = document.createElement('div');
        c.className = 'dbgov-cap';
        if (vertical) Place.put(c, Math.round(x2) - 6, Math.round(y2) - 1, 12, 2);
        else Place.put(c, Math.round(x2) - 1, Math.round(y2) - 6, 2, 12);
        layer.append(c);
      }

      // label sits beside the midpoint, offset perpendicular to the span
      const mx = vertical ? x1 + 12 : (x1 + x2) / 2;
      const my = vertical ? (y1 + y2) / 2 : y1 - 12;
      const lbl = document.createElement('div');
      lbl.className = 'dbgov-dist' + (vertical ? ' vert' : '');
      lbl.textContent = text;
      layer.append(lbl);
      Place.smart(lbl, { left: mx, top: my, right: mx, bottom: my, width: 0, height: 0 },
                  { leader: true });
    },

    // thin dashed line extending an element's edge out to the measured span
    extension(layer, Place, { x1, y1, x2, y2 }) {
      if (Math.round(x1) === Math.round(x2) && Math.round(y1) === Math.round(y2)) return;
      const e = document.createElement('div');
      const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      e.className = 'dbgov-ext' + (horizontal ? '' : ' v');
      if (horizontal) Place.put(e, Math.min(x1, x2), Math.round(y1), Math.abs(x2 - x1) || 1, 1);
      else Place.put(e, Math.round(x1), Math.min(y1, y2), 1, Math.abs(y2 - y1) || 1);
      layer.append(e);
    },

    // dashed guides running along each element's edge out to a shifted lane
    guideTo(layer, Place, rect, vertical, pos, edgeCoord) {
      if (vertical) {
        const clamped = Math.max(rect.left, Math.min(pos, rect.right));
        Measure.extension(layer, Place, { x1: clamped, y1: edgeCoord, x2: pos, y2: edgeCoord });
      } else {
        const clamped = Math.max(rect.top, Math.min(pos, rect.bottom));
        Measure.extension(layer, Place, { x1: edgeCoord, y1: clamped, x2: edgeCoord, y2: pos });
      }
    },

    dimension(layer, Place, ra, rb, tag) {
      const axis = Measure.axisOf(ra, rb);
      const g = U.gap(ra, rb);

      if (axis.kind === 'overlap') {
        const lbl = document.createElement('div');
        lbl.className = 'dbgov-dist';
        lbl.textContent = `${tag} · overlapping`;
        layer.append(lbl);
        const mx = (Math.max(ra.left, rb.left) + Math.min(ra.right, rb.right)) / 2;
        const my = (Math.max(ra.top, rb.top) + Math.min(ra.bottom, rb.bottom)) / 2;
        Place.smart(lbl, { left: mx, top: my, right: mx, bottom: my, width: 0, height: 0 });
        return;
      }

      if (axis.kind === 'vertical') {
        // measure straight down (or up) through the shared column
        const down = rb.top >= ra.bottom;
        const y1 = down ? ra.bottom : ra.top;
        const y2 = down ? rb.top : rb.bottom;
        const mid = (Math.max(ra.left, rb.left) + Math.min(ra.right, rb.right)) / 2;
        const x = Measure.reserveLane(true, mid, y1, y2);
        Measure.guideTo(layer, Place, ra, true, x, y1);
        Measure.guideTo(layer, Place, rb, true, x, y2);
        Measure.span(layer, Place, {
          x1: x, y1, x2: x, y2, vertical: true,
          text: `${tag} · ${down ? '↓' : '↑'} ${g.dy} px`,
        });
        return;
      }

      if (axis.kind === 'horizontal') {
        const right = rb.left >= ra.right;
        const x1 = right ? ra.right : ra.left;
        const x2 = right ? rb.left : rb.right;
        const mid = (Math.max(ra.top, rb.top) + Math.min(ra.bottom, rb.bottom)) / 2;
        const y = Measure.reserveLane(false, mid, x1, x2);
        Measure.guideTo(layer, Place, ra, false, y, x1);
        Measure.guideTo(layer, Place, rb, false, y, x2);
        Measure.span(layer, Place, {
          x1, y1: y, x2, y2: y, vertical: false,
          text: `${tag} · ${right ? '→' : '←'} ${g.dx} px`,
        });
        return;
      }

      // Diagonal: two honest, independent measurements — never one fake
      // hypotenuse, and never an elbow whose drawn length disagrees with its
      // own label. Each span runs edge-to-edge for exactly the gap it reports;
      // dashed guides tie each span back to the element it belongs to.
      const right = rb.left >= ra.right;
      const down = rb.top >= ra.bottom;

      // horizontal span: A's near edge → B's near edge, length === g.dx
      const hx1 = right ? ra.right : ra.left;
      const hx2 = right ? rb.left : rb.right;
      const hy = Measure.reserveLane(false, (ra.top + ra.bottom) / 2, hx1, hx2);

      // vertical span: A's near edge → B's near edge, length === g.dy
      const vy1 = down ? ra.bottom : ra.top;
      const vy2 = down ? rb.top : rb.bottom;
      const vx = Measure.reserveLane(true, right ? rb.left : rb.right, vy1, vy2);

      // guides: element edge → the span that measures it
      Measure.guideTo(layer, Place, ra, false, hy, hx1);
      Measure.guideTo(layer, Place, rb, false, hy, hx2);
      Measure.guideTo(layer, Place, ra, true, vx, vy1);
      Measure.guideTo(layer, Place, rb, true, vx, vy2);

      Measure.span(layer, Place, {
        x1: hx1, y1: hy, x2: hx2, y2: hy, vertical: false,
        text: `${tag} · ${right ? '→' : '←'} ${g.dx} px`,
      });
      Measure.span(layer, Place, {
        x1: vx, y1: vy1, x2: vx, y2: vy2, vertical: true,
        text: `${tag} · ${down ? '↓' : '↑'} ${g.dy} px`,
      });
    },
  };

  // ─── src/core/registry.js ──────────────────────────────────────────────
  /* ======================================================================
     TOOLS — ⭐ the plugin registry

        No tool ever names another tool. When one needs something another
        provides it asks the registry a question with no id in it.

        A tool declares nothing about what it IS. What it can do is the set of
        hooks it implements, and that is what everything dispatches on — a
        label would only repeat it, and could go stale against it.

        Roles are not exclusive. A tool may decorate other tools' numbers AND
        produce findings; grid does both.

        Hooks, all optional, all invoked as hook.call(tool, …):
          badge(info)    → HTML string for the full badge
          compact(info)  → HTML string for the compact badge
          report(info)   → array of report lines
          reportTail()   → array of summary lines, after every pin block
          draw(ctx)      → custom drawing; ctx = { layer, Place, State, U }
          listRows()     → panel list rows { tag, label, detail, pins }
          pendingIndex() → index into State.pins of a pin still being chosen
          annotate(html, n, info) → 'lens': wrap one number's html
          audit(info)    → 'rule': [{ el, severity, rule, message, key }]
          options()      → [{ key, label, values, def }] the panel can change
          css            → stylesheet text, read from EVERY registered tool
     ====================================================================== */
  /**
   * The four things a component can be.
   *
   * ROLES ARE DERIVED. A tool's hooks already say what it does, so a label on
   * the tool could only repeat them and then drift out of step — which is
   * exactly how the old `kind` field failed. Nothing declares a role.
   *
   * They are also PLURAL. grid annotates other tools' numbers and produces
   * findings; contrast describes an element and judges it. One label per tool
   * would have to be wrong about most of the toolset.
   *
   * A SETTING is the one case that cannot be derived: no hook can tell you
   * whether grid's `max` is a detection scope or a display preference. So an
   * option declares `affects`, and audit.js refuses one that does not.
   *
   * `report` is in no role on purpose — every tool contributes to the copied
   * report, so it says nothing about what any of them is.
   *
   * The order is the order the ⚙ view reads in: what you pick, what you are
   * shown about it, what is judged wrong with it, what happens when you act.
   */
  const ROLES = [
    { key: 'select', label: 'Select',
      note: 'how what you click becomes what you are looking at',
      has: (t) => !!(t.groups || t.listRows || t.pendingIndex) },
    { key: 'inspect', label: 'Inspect',
      note: 'what gets shown about it',
      has: (t) => !!(t.badge || t.compact || t.annotate) },
    { key: 'detect', label: 'Detect',
      note: 'what counts as a problem',
      has: (t) => !!(t.audit || t.auditPage) },
    { key: 'act', label: 'Act',
      note: 'what the overlay does to the page or the clipboard',
      has: (t) => !!t.intercept },
  ];
  const role = (key) => ROLES.find((r) => r.key === key);

  /**
   * Presentation order, derived — which button sits where, which ⚙ row is
   * first. Filenames used to carry this as numeric prefixes, which meant a
   * name said when a thing displays rather than what it is, and left the last
   * numbers in a tree that had otherwise stopped using them.
   *
   * By the first ROLE a component fills, then by id. That reproduces the bar
   * as it was — pick after measure, dupid after the two that also describe —
   * without anything being spelled. Roles are plural and this takes the first,
   * which is a display decision only: nothing is claimed about the others, and
   * being wrong costs an ordering, never a verdict.
   */
  const byRole = (a, b) => {
    const rank = (t) => {
      const i = ROLES.findIndex((r) => r.has(t));
      return i < 0 ? ROLES.length : i;
    };
    return rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };

  /**
   * SUBJECTS — a shared measurement, and the settings that govern it.
   *
   * WHY: `step` was grid's setting and `level` was contrast's, but neither is
   * a property of a read-out. The spacing step is a property of the PROJECT,
   * and both the ⚠ on a badge and the finding in a sweep have to agree about
   * it or the overlay contradicts itself. Same for the WCAG level, and for the
   * memoised colour cache underneath it — a page has tens of colours and
   * thousands of nodes, and resolving them twice is real work done twice.
   *
   * A subject is not a component: no icon in the bar, no arming, no hooks. It
   * is called BY components and never calls back — the same one-way rule the
   * core files live under. That is what lets two components share a
   * measurement without naming each other.
   */
  const SUBJECTS = [];
  /** Register a shared subject. One call per file in src/subjects/. */
  const defineSubject = (s) => { SUBJECTS.push(s); return s; };

  const TOOLS = [];
  /** Register a debug tool. One call per file in src/tools/. */
  const defineTool = (t) => { TOOLS.push(t); return t; };

  const Tools = {
    all: TOOLS,
    byId: (id) => TOOLS.find((t) => t.id === id),
    active: () => TOOLS.filter((t) => State.tools.has(t.id)),

    /**
     * Tools are asked what they can DO, never what they are. A `kind` field
     * used to answer this, and it could only ever repeat what the hooks
     * already said — audit.js checked it by grepping for the hook, which is
     * the tell. Worse, one label per tool forced roles to be exclusive, so
     * grid could decorate numbers or produce findings but not both, for no
     * reason beyond the shape of the label.
     *
     * `armed` matters for anything the user SEES and not for anything that
     * gets CHECKED, so the caller says which it wants.
     */
    withHook: (h, armed) =>
      TOOLS.filter((t) => t[h] && (!armed || State.tools.has(t.id))),

    /**
     * The tools, split into runs for the panel to draw with a rule between
     * them. Two toggles that look identical and mean different things is the
     * problem here: arming one changes what the page audit finds and arming
     * the other does not, and nothing said so.
     *
     * The split lives here because this is the file that knows what a hook
     * is. The panel renders the runs it is handed and never learns what
     * separates them — a third run would need no panel change at all.
     */
    runs() {
      // The one axis a BUTTON can carry. A button sits in exactly one place,
      // and most tools hold two roles — filing grid under Detect would tell
      // you it is not also the thing putting ⚠ on your padding. This asks a
      // yes/no question instead, which composition cannot make false, and the
      // full role list goes in the tooltip where there is room to be plural.
      const checks = role('detect').has;
      const inOrder = TOOLS.slice().sort(byRole);
      return [
        { cls: '', note: '', tools: inOrder.filter((t) => !checks(t)) },
        { cls: 'checks', note: ' · also runs in the page audit',
          tools: inOrder.filter(checks) },
      ].filter((r) => r.tools.length);
    },

    /**
     * What one of a tool's own options is currently set to.
     *
     * A tool asks with `this`, never with an id, so this stays as id-free as
     * every other question the registry answers. CONTROLLER has already
     * resolved defaults into State.settings by the time anything calls this —
     * deliberately, because the callers are hot: grid asks per number, and
     * re-deriving the answer from options() there would run the hook thousands
     * of times per sweep to be told the same thing.
     */
    /**
     * What one of an owner's own options is currently set to. The owner is a
     * tool or a subject — anything with an id that declared the option. Asked
     * with `this`, never with an id, so this stays as id-free as every other
     * question the registry answers.
     */
    setting: (t, key) => State.settings[t.id]?.[key],

    /**
     * Everything that declares settings, subjects first.
     *
     * Subjects lead because a setting that governs a shared measurement is the
     * more general fact: "the spacing step is 2px" is true of the project, and
     * what any one component does with it comes after.
     */
    settingOwners: () => [...SUBJECTS, ...TOOLS.slice().sort(byRole)]
      .filter((o) => o.options),

    /** Every role a tool fills, in ROLES order. Plural by construction. */
    rolesOf: (t) => ROLES.filter((r) => r.has(t)).map((r) => r.label),

    /**
     * Every grouping the armed selection tools have formed.
     *
     * WHY THIS EXISTS: measure used to pair pins itself, which made it a
     * read-out AND the thing that decides what is selected — two roles in one
     * tool, and no way to add a second way of selecting without editing it.
     * Anything that draws or reports BETWEEN elements asks this instead, so a
     * lasso or a select-by-query reaches every consumer the day it lands and
     * no consumer ever learns who made the group.
     */
    groups() {
      const out = [];
      for (const t of Tools.withHook('groups', true))
        out.push(...(t.groups.call(t) || []));
      return out;
    },

    /**
     * WHY THIS EXISTS: measure used to ask whether one specific NAMED tool was
     * switched on before it printed a padding, which made this file's claim
     * that tools are independent a lie. It asks this instead — "how does a
     * number want decorating here?" — and neither side learns the other's id,
     * because the only thing that knows both of them is the registry.
     *
     * Returns null when no lens is on, which is what keeps undecorated output
     * byte-for-byte what it was. Lenses fold in registry order (= filename
     * order), each one wrapping the previous one's html.
     */
    annotator(info) {
      const lenses = Tools.withHook('annotate', true);
      if (!lenses.length) return null;
      return (n) => lenses.reduce(
        (html, t) => t.annotate?.call(t, html, n, info) || html, `${n}`);
    },
  };

  // ─── src/subjects/colour.js ────────────────────────────────────────────
  /**
   * COLOUR — resolving a colour honestly, and the level to judge it against.
   *
   * This moved out of the contrast tool for the same reason the spacing step
   * moved out of grid: the WCAG level is a decision about the project, and the
   * badge on hover and the finding in a sweep must not be able to disagree
   * about it. The cache is the other half — a page has tens of distinct
   * colours and thousands of nodes, and two copies of this would resolve every
   * one of them twice.
   *
   * It lives here rather than in UTILS because reading a colour honestly needs
   * a canvas, and UTILS may not touch the DOM.
   */
  const Colour = defineSubject({
    id: 'colour',
    was: 'contrast',   // its settings lived under this id before the subject existed
    icon: '◐',

    /**
     * AA is the level nearly everyone is held to; AAA is what accessibility
     * commitments and public-sector procurement actually ask for. Both
     * thresholds move together — a check wanting AAA of body text and AA of
     * headings would be reporting against no standard at all.
     */
    options() {
    return [{ key: 'level', label: 'WCAG level', def: CONFIG.CONTRAST.level,
                values: Object.keys(CONFIG.CONTRAST.levels), affects: 'detect' }];
    },

    cache: new Map(),      // 20-50 distinct colours per page, 1000s of nodes
    ctx: undefined,        // undefined = not tried yet, null = no canvas

    /** A 1×1 scratch context, or null where canvas is unavailable. */
    paint() {
        if (this.ctx !== undefined) return this.ctx;
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 1;
          this.ctx = c.getContext('2d', { willReadFrequently: true }) || null;
        } catch { this.ctx = null; }
        return this.ctx;
      },

    /**
     * Any CSS colour → sRGB, by asking the browser to paint one pixel of it.
     * That covers oklch(), lab(), color(display-p3 …) and whatever ships
     * next, without this file knowing the maths for any of them.
     *
     * Guessing is what made this necessary: scraping the numbers out of
     * oklch(0.985 0 0) read near-white as near-black and reported 1.00:1
     * for text measuring 10.9:1. Anything still unreadable returns null,
     * and null must stay "unknown" all the way up.
     */
    colour(str) {
        const s = String(str || '');
        if (!s) return null;
        if (this.cache.has(s)) return this.cache.get(s);

        let out = null;
        const m = /^rgba?\(/.test(s) && s.match(/[\d.]+/g);
        if (m && m.length >= 3) {
          // the common case, and exact — no need to rasterise it
          out = { r: +m[0], g: +m[1], b: +m[2], a: m[3] !== undefined ? +m[3] : 1 };
        } else {
          const ctx = this.paint();
          // Two probes: a rejected colour leaves fillStyle on whichever probe
          // was there, so the readbacks differ. An accepted one lands on the
          // same value both times — including when it really is black.
          if (ctx) {
            ctx.fillStyle = '#000'; ctx.fillStyle = s; const a = ctx.fillStyle;
            ctx.fillStyle = '#fff'; ctx.fillStyle = s; const b = ctx.fillStyle;
            if (a === b) {
              ctx.clearRect(0, 0, 1, 1);
              ctx.fillRect(0, 0, 1, 1);
              const d = ctx.getImageData(0, 0, 1, 1).data;
              out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
            }
          }
        }
        this.cache.set(s, out);
        return out;
      },

    /** Composite `over` (with alpha) onto the opaque colour `base`. */
    over(over, base) {
        const a = over.a == null ? 1 : over.a;
        return {
          r: over.r * a + base.r * (1 - a),
          g: over.g * a + base.g * (1 - a),
          b: over.b * a + base.b * (1 - a),
          a: 1,
        };
      },

    /**
     * What the text is actually painted on, or `{ unknown }` naming what
     * stopped it — the caller turns that into a finding rather than silence.
     *
     * Starts at the element, not its parent: an element that sets its own
     * background paints it behind its own text, so every button, chip and
     * alert was previously scored against whatever was behind the card
     * instead. Translucent layers are collected and composited rather than
     * taken as if opaque — the first layer over 5% alpha used to be returned
     * outright, which is a different colour from what a reader sees.
     */
    bg(el) {
        const layers = [];               // nearest the viewer first
        let e = el;
        while (e && e.nodeType === 1) {
          const cs = getComputedStyle(e);
          // An image or gradient can be any colour at the pixel under the
          // text, and nothing here can sample it. Unknown, not white.
          if (cs.backgroundImage && cs.backgroundImage !== 'none') return { unknown: 'bg-image' };
          const raw = cs.backgroundColor;
          const c = this.colour(raw);
          // A colour we cannot read is not the same as no colour. Walking past
          // it lands on the white default below and turns "I don't know" into
          // a confident verdict against a background that was never there.
          if (!c) {
            if (raw && raw !== 'transparent')
              return { unknown: this.paint() ? 'bg-colour' : 'no-canvas' };
          } else if (c.a >= 0.999) {
            return layers.reduceRight((base, l) => this.over(l, base), c);
          } else if (c.a > 0) layers.push(c);
          e = e.parentElement;
        }
        // nothing opaque anywhere: the canvas underneath a page is white
        return layers.reduceRight((base, l) => this.over(l, base),
                                  { r: 255, g: 255, b: 255, a: 1 });
      },

    lum({ r, g, b }) {
        const f = (v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      },
    ratio(fg, bg) {
        // flatten a translucent foreground onto the background first
        const a = fg.a == null ? 1 : fg.a;
        const mixed = {
          r: fg.r * a + bg.r * (1 - a),
          g: fg.g * a + bg.g * (1 - a),
          b: fg.b * a + bg.b * (1 - a),
        };
        const l1 = this.lum(mixed), l2 = this.lum(bg);
        const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
      },
    // Walked rather than spread: this is the first thing asked of every
    // element in a page sweep, and [...childNodes] allocates an array for
    // each one only to look at the first text node.
    ownText(el) {
        for (let n = el.firstChild; n; n = n.nextSibling)
          if (n.nodeType === 3 && n.nodeValue.trim()) return true;
        return false;
      },

    // Why a measurement could not be made. These reach the user, so they say
    // what happened rather than naming the branch that produced them.
    why: {
        'fg-colour': 'the text colour is in a colour space this cannot read',
        'bg-colour': 'the background colour is in a colour space this cannot read',
        'bg-image': 'it sits on an image or gradient, so the pixel under the text is unknown',
        'no-canvas': 'no canvas is available to resolve colours',
      },

    measure({ el, cs }) {
        // NOT APPLICABLE is not the same as NOT KNOWN. An element with no text
        // of its own has no contrast to have — reporting that as "review"
        // would put every container on the page in the list and bury the real
        // ones. Only the three below are things we tried to measure and failed.
        if (!this.ownText(el)) return null;
        const fg = this.colour(cs.color);
        if (!fg) return { unknown: this.paint() ? 'fg-colour' : 'no-canvas' };
        const bg = this.bg(el);
        if (bg.unknown) return bg;
        // CSS opacity, which nothing here used to read. `color: rgba(0,0,0,.1)`
        // was correctly reported 1.25:1 while the visually identical
        // `color: #000; opacity:.1` was reported 21.00:1 PASS — a confident
        // wrong answer about text nobody can read, which is the one outcome
        // the three-answer design exists to rule out. The sweep's own gate
        // only skips the exact string '0', so 0.01 reaches here.
        //
        // Folding it into the foreground alpha is exact when the element paints
        // no background of its own, which is the ordinary case for text. Where
        // it does, both text and that background fade together and this
        // understates the ratio — erring toward reporting a problem, which is
        // the safe direction for a rule about readability.
        const faded = { ...fg, a: (fg.a == null ? 1 : fg.a) * this.opacityOf(el) };
        const ratio = this.ratio(faded, bg);
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const isLarge = size >= CONFIG.CONTRAST.largePx ||
                        (bold && size >= CONFIG.CONTRAST.largeBoldPx);
        // carried out with the verdict, not read again by each caller: the
        // badge, the report and the finding must all name the same level they
        // were actually judged against
        const level = Tools.setting(this, 'level');
        const want = CONFIG.CONTRAST.levels[level];
        const need = isLarge ? want.large : want.normal;
        return { ratio, need, pass: ratio >= need, isLarge, fg: faded, bg, level, want };
      },
    /** Cumulative CSS opacity: every ancestor multiplies what is painted. */
    opacityOf(el) {
      let o = 1;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const v = parseFloat(getComputedStyle(e).opacity);
        if (Number.isFinite(v) && v < 1) o *= Math.max(0, v);
        if (o === 0) break;
      }
      return o;
    },

    rgb: (c) => `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`,
  });

  // ─── src/subjects/scale.js ─────────────────────────────────────────────
  /**
   * THE SPACING SCALE — what counts as "on the grid", and the settings for it.
   *
   * These moved out of the grid tool because they were never really its. A
   * step of 2px is a fact about the project you are looking at; the ⚠ on a
   * badge and the finding in a sweep are two things that consult it. Leaving
   * the setting on one of them would mean the other could not see it, and a
   * split that gave each its own copy would let a badge say a value is fine
   * while the audit says it is not.
   */
  const Scale = defineSubject({
    id: 'scale',
    was: 'grid',   // its settings lived under this id before the subject existed
    icon: '▦',

    options() {
      return [
        // 2, not 4, because that is what the scale in front of us actually is:
        // Tailwind's default spacing has half-steps (0.5 = 2px, 1.5 = 6px) and
        // a real page used them 2,681 times. A rule has to check the scale a
        // project HAS; making the project match the rule is the wrong way round.
        { key: 'step', label: 'Grid step', def: CONFIG.GRID,
          values: [1, 2, 4, 8], suffix: 'px', affects: 'detect' },
        // Where a spacing token stops and layout arithmetic begins.
        // getComputedStyle resolves `margin: auto` to the pixels it worked out
        // — 1127px on a real page — and nothing distinguishes that from a value
        // somebody typed. Nobody types 1127px.
        { key: 'max', label: 'Ignore above', def: CONFIG.GRID_MAX,
          type: 'number', min: 8, max: 2000, step: 8, suffix: 'px', affects: 'detect' },
        // OFF, and it stays off by default: width and height are what layout
        // produced, not what anyone typed, and judging them turned one real
        // signal into 2,215 findings about icon geometry on a real page.
        { key: 'boxes', label: 'Judge width & height', def: false,
          type: 'toggle', affects: 'detect' },
      ];
    },

    step() { return Tools.setting(this, 'step'); },
    max() { return Tools.setting(this, 'max'); },
    boxes() { return Tools.setting(this, 'boxes'); },

    /** 0 is never off the grid, or every padding:0 would light up. */
    off(n) {
      const step = this.step();
      return n !== 0 && n % step !== 0;
    },

    /**
     * Off the grid AND close enough to be something somebody typed.
     *
     * The ceiling used to live only in the rule, so a resolved `margin: auto`
     * of 1127px got a ⚠ on the badge and no finding in the sweep — the badge
     * and the audit disagreeing about one number, which is the exact
     * contradiction this subject exists to make impossible. Every consumer
     * asks this, so there is one answer.
     */
    judges(n) {
      return this.off(n) && Math.abs(n) <= this.max();
    },

    /**
     * The nearest value that WOULD pass — the RECOMMENDATION facet's answer.
     *
     * On the subject, not in the lens, for the same reason judges() is: the
     * ⚠ and the →8 must come from one place or they could disagree about the
     * same number. Half away from zero, matching U.px, so 7 on a 2px step
     * suggests 8 and -7 suggests -8 — a margin and its mirror image get
     * mirror advice.
     */
    nearest(n) {
      const step = this.step();
      return Math.sign(n) * Math.round(Math.abs(n) / step) * step;
    },

    /**
     * Off-grid numbers on one element, as [name, value] pairs. `boxes` adds
     * width and height — true when somebody pointed at this element and asked,
     * false when a sweep is judging the page.
     */
    scan(info, boxes) {
      // NOT `scan({ r, cs }, …)`. `r` on U.info is a getter that runs
      // getBoundingClientRect, and destructuring it in the parameter list
      // evaluates it whether or not the body ever wants it — so the page sweep
      // was forcing a layout read for every visible element to answer a
      // question about padding. Measured: 62 rect reads over 60 elements, with
      // `boxes` off, which is the default. Read it inside the branch that uses
      // it and a colours-only pass pays nothing.
      const cs = info.cs;
      const pad = U.fourPlain(cs, 'padding'), mar = U.fourPlain(cs, 'margin');
      const out = [];
      // Spacing carries the ceiling; a box does not. `max` exists to keep
      // resolved layout arithmetic out of a list of typed spacing tokens, and
      // at its 96px default it silently cancelled the "Judge width & height"
      // toggle outright — almost every real element is wider than that, so
      // arming the control produced nothing at all and no setting said why.
      const check = (n, v) => { if (this.judges(v)) out.push([n, v]); };
      if (boxes) {
        const r = info.r;
        const box = (n, v) => { if (this.off(v)) out.push([n, v]); };
        box('w', Math.round(r.width)); box('h', Math.round(r.height));
      }
      ['t', 'r', 'b', 'l'].forEach((k) => { check('pad-' + k, pad[k]); check('mar-' + k, mar[k]); });
      // BOTH axes. `rowGap || columnGap || gap` is a first-truthy chain, so a
      // non-zero row gap won the test and the column gap was never looked at —
      // an off-grid column gap beside an on-grid row gap was invisible to the
      // badge, the report and the sweep alike. Named per axis too, so the
      // report can say which one it meant.
      const row = U.px(cs.rowGap), col = U.px(cs.columnGap);
      if (row || col) {
        if (row) check('gap-row', row);
        if (col) check('gap-col', col);
      } else {
        // jsdom, and anything else that leaves the shorthand unresolved
        const gap = U.px(cs.gap);
        if (gap) check('gap', gap);
      }
      return out;
    },
  });

  // ─── src/tools/contrast.js ─────────────────────────────────────────────
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .ok  { color: #b5e853; }
    .dbgov-badge .bad { color: #ff6b6b; font-weight: 700; }
    .dbgov-badge .unk { color: #8ab4f8; font-style: italic; }
    `,
      id: 'contrast',
      icon: '◐',
      // the level is the user's choice now, so it cannot be stated here
      title: 'Contrast — WCAG text contrast ratio',
      uses: [Colour],   // its settings are Colour's, and belong on its own menu

      // What each rule IS, separate from what any one element measured. The
      // instance message says 2.76:1; this says why, and what to do.
      rules: {
        'contrast-aa': {
          help: 'Body text needs 4.5:1 against its background, or 7:1 at AAA; ' +
                '3:1 once it is 24px or 18.66px bold, or 4.5:1 at AAA. Which ' +
                'level this checks is in the panel under ⚙.',
          why: 'Below that, text stops being readable in bright light, on a bad ' +
               'screen, or to anyone with reduced contrast sensitivity — which ' +
               'is most people eventually.',
          docs: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum',
        },
      },

      // RULE hook: the verdict badge() shows, as data instead of prose. A
      // passing element produces nothing — a findings list is a list of
      // problems, which is what lets the same hook run over a whole page.
      audit(i) {
        const c = Colour.measure(i);
        if (!c) return [];              // no text of its own — nothing to judge
        if (c.unknown) return [{
          el: i.el,
          // Not a failure: a failure is a fact, this is an absence of one. It
          // used to be folded into the same empty array as "passed", so a page
          // of gradient-backed text audited clean. Whatever else this tool
          // gets wrong, it must not report a verdict it never reached.
          verdict: 'review',
          severity: 'info',
          rule: 'contrast-aa',
          message: `not measured — ${Colour.why[c.unknown]}`,
          // one row per reason, page-wide: 200 elements over one gradient are
          // one thing to go and look at, not 200
          key: `contrast-aa|review|${c.unknown}`,
        }];
        if (c.pass) return [];
        return [{
          el: i.el,
          verdict: 'fail',
          // below the large-text floor nobody can read it; above it, a near
          // miss that a size or weight change might fix
          severity: c.ratio < c.want.large ? 'error' : 'warn',
          rule: 'contrast-aa',
          message: `${c.ratio.toFixed(2)}:1 — ${c.level} needs ${c.need} for ` +
                   `${c.isLarge ? 'large' : 'normal'} text`,
          // one line per colour pair, not per element: a 40-link nav is ONE
          // problem. Only the rule knows what "the same problem" means.
          key: `contrast-aa|${Colour.rgb(c.fg)}|${Colour.rgb(c.bg)}|${c.isLarge}`,
        }];
      },
      // Findings become places on the page, not just rows in a list. `found`
      // is this tool's own, handed over by the renderer; the layer is cleared
      // every frame, so there is nothing to undo and nothing of anyone else's
      // to step on.
      draw({ layer, Place, found }) {
        for (const f of found.slice(0, CONFIG.MARK_LIMIT)) {
          if (!document.contains(f.el)) continue;   // the page moved on
          // No size gate: the sweep already dropped display:none and
          // visibility:hidden, and a degenerate box draws a degenerate
          // outline — invisible, and cheaper than the branch that skips it.
          const r = f.el.getBoundingClientRect();
          const box = document.createElement('div');
          // review is not failure, and must not be painted as though it were
          box.className = 'dbgov-box dbgov-flag ' +
                          (f.verdict === 'review' ? 'review' : f.severity);
          Place.put(box, r.left, r.top, r.width, r.height);
          layer.append(box);
        }
      },
      badge(i) {
        const c = Colour.measure(i);
        if (!c) return null;
        // say so on hover too — silence here is what taught the eye to trust
        // a page the tool had not actually checked
        if (c.unknown) return `<span class="unk">contrast ?</span>`;
        const cls = c.pass ? 'ok' : 'bad';
        return `<span class="${cls}">${c.ratio.toFixed(2)}:1 ${c.level}${c.pass ? '✓' : '✗'}</span>`;
      },
      compact(i) {
        const c = Colour.measure(i);
        if (!c || c.unknown || c.pass) return null;   // quiet unless it fails
        return `<span class="bad">${c.ratio.toFixed(1)}:1 ✗</span>`;
      },
      report(i) {
        const c = Colour.measure(i);
        if (!c) return [];
        if (c.unknown) return [`  contrast: not measured — ${Colour.why[c.unknown]}`];
        return [`  contrast: ${c.ratio.toFixed(2)}:1 vs required ${c.need} (${c.isLarge ? 'large' : 'normal'} text) → ${c.pass ? 'PASS' : 'FAIL'}`];
      },
    });

  // ─── src/tools/dupid.js ────────────────────────────────────────────────
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .dup { color: #ff8a65; font-weight: 700; }
    `,
      id: 'dupid',
      // not ⧉ — the copy button already uses that glyph, and two identical
      // icons in one bar is a bar you have to read twice
      icon: '⌗',
      title: 'Duplicate ids — the same id used more than once',

      rules: {
        'dup-id': {
          help: 'An id must be unique in a document.',
          why: 'getElementById, label[for], aria-labelledby and every #anchor ' +
               'resolve to the first match and silently ignore the rest, so the ' +
               'bug shows up as a control that does nothing rather than an error.',
          docs: 'https://developer.mozilla.org/docs/Web/HTML/Global_attributes/id',
        },
      },

      /**
       * PAGE hook. This is the shape of question audit(info) cannot ask: an
       * element with a duplicated id looks perfectly correct on its own, and
       * only the second one makes either of them wrong. Nothing about the
       * element is the problem — the page is.
       */
      auditPage(all) {
        const by = new Map();
        for (const i of all) {
          const id = i.el.id;
          if (!id) continue;
          (by.get(id) || by.set(id, []).get(id)).push(i.el);
        }
        const out = [];
        for (const [id, els] of by) {
          if (els.length < 2) continue;
          out.push({
            el: els[0],
            verdict: 'fail',
            // a broken label or anchor is a control that does nothing, and
            // nothing on screen says so
            severity: 'error',
            rule: 'dup-id',
            message: `id "${id}" is used ${els.length} times`,
            // by id, not by element: the duplicates are one mistake
            key: `dup-id|${id}`,
          });
        }
        return out;
      },

      /**
       * What it has to say about the element you are pointing AT. It knew this
       * all along and only ever said it in the copied report — hover a element
       * whose id is used three times and the badge was silent, which is the
       * one place you were looking.
       */
      badge({ el }) {
        if (!el.id) return null;
        const n = document.querySelectorAll(
          `[id="${CSS.escape ? CSS.escape(el.id) : el.id}"]`).length;
        return n > 1 ? `<span class="dup">⌗ id ×${n}</span>` : null;
      },
      compact(i) { return this.badge(i); },

      /**
       * ITS OWN SURFACE. Findings reach the ⌕ list whether a rule is armed or
       * not, so a rule with no draw() changed nothing at all when you switched
       * it on — measured: armed alone, zero badges, zero marks, zero lines. A
       * toggle that does nothing is worse than no toggle.
       *
       * `found` is this tool's own findings, handed over by the renderer. The
       * mark classes are core: more than one rule paints them, so they cannot
       * belong to whichever tool needed them first.
       */
      draw({ layer, Place, found }) {
        for (const f of found.slice(0, CONFIG.MARK_LIMIT)) {
          if (!document.contains(f.el)) continue;
          const r = f.el.getBoundingClientRect();
          const box = document.createElement('div');
          box.className = 'dbgov-box dbgov-flag ' + f.severity;
          Place.put(box, r.left, r.top, r.width, r.height);
          layer.append(box);
        }
      },

      report({ el }) {
        if (!el.id) return [];
        const n = document.querySelectorAll(`[id="${CSS.escape ? CSS.escape(el.id) : el.id}"]`).length;
        return n > 1 ? [`  ⧉ id "${el.id}" is used ${n} times on this page`] : [];
      },
    });

  // ─── src/tools/grid.js ─────────────────────────────────────────────────
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .warn{ color: #ffd54f; }
    `,
      id: 'grid',
      icon: '▦',
      // No number in the title: the step is the user's now, and a title baked
      // at boot would still be claiming 2px long after they picked 8.
      title: 'Grid — flag values off the spacing grid',
      startsOn: true,      // the ⚠ on a badge is what makes the read-out useful
      uses: [Scale],   // its settings are Scale's, and belong on its own menu

      /**
       * The lens's display preference — the RECOMMENDATION facet. Off by
       * default: a suggestion doubles every marked number, so it has to be
       * asked for. It lives here and not on the scale subject because "show me
       * the fix" is about this lens's ink, not a fact about the project.
       */
      options() {
        return [
          { key: 'suggest', label: 'Suggest nearest step', def: false, type: 'toggle', affects: 'inspect' },
        ];
      },

      rules: {
        'grid-off': {
          help: 'Spacing should be a multiple of the grid step — change which ' +
                'step this checks in the panel under ⚙.',
          why: 'One-off values are how a spacing scale erodes: each looks ' +
               'harmless alone, and together they are why nothing lines up.',
        },
      },

      /**
       * ITS OWN SURFACE — the thing this tool was missing.
       *
       * annotate() below is a LENS: it decorates numbers other tools print, so
       * with nothing else armed it had nothing to decorate and this tool showed
       * absolutely nothing. Correct, silent and indistinguishable from broken —
       * a measured fact: armed alone it produced zero badges and zero ⚠.
       *
       * A component has to be worth arming by itself. This says what is off the
       * grid without needing anyone else to have printed it first, and stays
       * useful next to measure because it summarises where measure enumerates.
       */
      badge(i) {
        const bad = Scale.scan(i, true);
        if (!bad.length) return null;
        // by value, not by side: 7px used on three edges is one decision
        const vals = [...new Set(bad.map(([, v]) => v))];
        return `<span class="warn">⚠ ${vals.join(' ')} off ${Scale.step()}px</span>`;
      },
      compact(i) {
        const bad = Scale.scan(i, true);
        return bad.length ? `<span class="warn">⚠${bad.length}</span>` : null;
      },

      /**
       * LENS hook: every number another tool prints comes through here first.
       * `html` is what earlier lenses made of it, so we wrap rather than
       * replace, and the ⚠ markup sits next to the .warn rule for it.
       *
       * The judgement itself is the subject's — this decides how to SHOW an
       * off-grid number, not what one is. That is the whole point of the
       * split: the rule below reaches the same verdict through the same call.
       */
      annotate(html, n) {
        if (!Scale.judges(n)) return html;
        // ISSUE always; RECOMMENDATION only when asked. Both answers come from
        // the subject, so the mark and the suggestion cannot disagree.
        const fix = Tools.setting(this, 'suggest') ? `→${Scale.nearest(n)}` : '';
        return `<span class="warn">${html}⚠${fix}</span>`;
      },

      report(i) {
        const bad = Scale.scan(i, true);
        return bad.length
          ? [`  ⚠ off ${Scale.step()}px grid: ` +
             `${bad.map(([n, v]) => `${n}:${v}`).join(', ')}`]
          : [];
      },

      /**
       * RULE hook. This tool decorates other tools' numbers AND produces
       * findings — two roles at once, which the old one-label-per-tool
       * taxonomy made impossible for no reason but the shape of the label.
       *
       * Keyed by VALUE, not by element: one 13px used in forty places is one
       * decision someone made, not forty mistakes. That is the page-wide
       * pattern a per-element read-out could never show you — it is why this
       * belongs in a sweep and not only on a badge.
       */
      /**
       * WHERE the off-grid spacing is. grid was the only rule that produced
       * findings and drew nothing — set the step to 4px on a Tailwind page and
       * the list filled with thousands while the page stayed blank, so every
       * row had to be clicked to find out where it was. contrast and dupid
       * both marked theirs; this was the odd one out.
       *
       * `found` is this tool's own findings, handed over by the renderer. The
       * mark classes are core, because more than one rule paints them.
       */
      draw({ layer, Place, found }) {
        for (const f of found.slice(0, CONFIG.MARK_LIMIT)) {
          if (!document.contains(f.el)) continue;
          const r = f.el.getBoundingClientRect();
          const box = document.createElement('div');
          box.className = 'dbgov-box dbgov-flag ' + f.severity;
          Place.put(box, r.left, r.top, r.width, r.height);
          layer.append(box);
        }
      },

      audit(i) {
        // An <svg> path has a bounding box and no authored anything. Judging
        // those turned one real signal into 2,215 findings about icon
        // geometry on a real page.
        if (!(i.el instanceof HTMLElement)) return [];
        // Width and height are the OUTPUT of layout — a text span is as wide
        // as its text, a scroll container as tall as its content. Neither is
        // a decision anyone made, and sweeping them buried the findings that
        // were. Padding, margin and gap are typed by a person; those are the
        // spacing scale.
        // No filter here any more. The ceiling — and the fact that it has two
        // sides, and that it must not apply to a width or a height — all
        // belong to Scale.judges, so the badge and this reach the same verdict
        // through the same call and cannot disagree about one number.
        return Scale.scan(i, Scale.boxes())
          .map(([n, v]) => ({
          el: i.el,
          verdict: 'fail',
          // a spacing system is a convention, not a rule anyone can be hurt
          // by breaking — it ranks below anything a reader actually suffers
          severity: 'info',
          rule: 'grid-off',
          // the VALUE, not the side it appeared on: these group by value, and
          // "pad-t ×24" would read as 24 top paddings when it is one number
          // used in twenty-four places. The sides are in the per-pin report.
          message: `${v}px is off the ${Scale.step()}px grid`,
          key: `grid-off|${v}`,
        }));
      },
    });

  // ─── src/tools/measure.js ──────────────────────────────────────────────
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-leader { position: fixed; pointer-events: none; background: rgba(255,255,255,.55); }
    .dbgov-line { position: fixed; pointer-events: none; background: rgba(181,232,83,.85);
      border-radius: 1px; box-shadow: 0 0 0 .5px rgba(0,0,0,.4); }
    .dbgov-cap { position: fixed; pointer-events: none; background: #b5e853;
      border-radius: 1px; box-shadow: 0 0 0 .5px rgba(0,0,0,.5); }
    .dbgov-arrow { position: fixed; pointer-events: none; width: 0; height: 0;
      filter: drop-shadow(0 0 .5px rgba(0,0,0,.6)); }
    .dbgov-arrow.up    { border-left: 5px solid transparent; border-right: 5px solid transparent;
                         border-bottom: 7px solid #b5e853; }
    .dbgov-arrow.down  { border-left: 5px solid transparent; border-right: 5px solid transparent;
                         border-top: 7px solid #b5e853; }
    .dbgov-arrow.left  { border-top: 5px solid transparent; border-bottom: 5px solid transparent;
                         border-right: 7px solid #b5e853; }
    .dbgov-arrow.right { border-top: 5px solid transparent; border-bottom: 5px solid transparent;
                         border-left: 7px solid #b5e853; }
    .dbgov-ext { position: fixed; pointer-events: none;
      background: repeating-linear-gradient(to right,
        rgba(181,232,83,.7) 0 4px, transparent 4px 8px); }
    .dbgov-ext.v { background: repeating-linear-gradient(to bottom,
        rgba(181,232,83,.7) 0 4px, transparent 4px 8px); }
    .dbgov-dist { position: fixed; pointer-events: none;
      background: rgba(24,28,14,.95); color: #b5e853; border-radius: 7px;
      padding: 3px 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .dbgov-dist.vert { border-left: 2px solid #b5e853; }
    `,
      id: 'measure',
      icon: '📐',
      title: 'Measure — size, radius, spacing, font, distances',
      startsOn: true,      // the read-out is what the overlay is FOR
      /**
       * INSPECT, and only INSPECT. The pairing that used to live here is a
       * SELECT tool now; this asks the registry what is grouped and measures
       * between whatever comes back. Drawing the gap between two elements is a
       * measurement — deciding WHICH two is not, and keeping both here is what
       * made this tool two things at once.
       */
      /**
       * WHICH FIELDS THE BADGE SHOWS. A full badge reads
       * `92×4 · r 9999 · p 6 8 · m 0 · flex gap 8 · 14/20 500 · div#hero`,
       * which is a lot of ink over the page when you came to look at one
       * number. These decide what is on it.
       *
       * They govern the BADGES only, never `report()`. A badge sits on top of
       * what you are reading, so density costs you something; the copied
       * report is text you paste into a chat, where a line you do not need
       * costs nothing and a line you do need costs a round trip.
       */
      options() {
        // Written out rather than built by a helper: audit.js counts `key:`
        // against `affects:` to catch an option that declares neither, and a
        // factory would satisfy it once for all seven. Longhand keeps that
        // check honest, and greppable.
        return [
          { key: 'size', label: 'Size', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'radius', label: 'Radius', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'padding', label: 'Padding', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'margin', label: 'Margin', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'layout', label: 'Display & gap', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'font', label: 'Font', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'tag', label: 'Tag & id', def: true, type: 'toggle', affects: 'inspect' },
        ];
      },

      badge(i) {
        const { el, r, cs } = i;
        // whatever decoration applies here — never "is <some named tool> on"
        const dec = Tools.annotator(i);
        const on = (k) => Tools.setting(this, k);
        const bits = [];
        if (on('size')) bits.push(`<span class="sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`);
        if (on('radius')) { const rad = U.radius(cs); if (rad) bits.push(`<span class="rad">r ${rad}</span>`); }
        if (on('padding')) { const p = U.four(cs, 'padding', dec); if (p) bits.push(`<span class="sp">p ${p.join(' ')}</span>`); }
        if (on('margin')) { const m = U.four(cs, 'margin', dec); if (m) bits.push(`<span class="sp">m ${m.join(' ')}</span>`); }
        if (on('layout') && (cs.display.includes('flex') || cs.display.includes('grid'))) {
          const g = U.px(cs.columnGap) || U.px(cs.gap);
          bits.push(`<span class="sp">${U.esc(cs.display)}${g ? ' gap ' + U.mark(g, dec) : ''}</span>`);
        }
        if (on('font')) bits.push(`<span class="fnt">${U.px(cs.fontSize)}/${U.px(cs.lineHeight) || '–'} ${cs.fontWeight}</span>`);
        // the id is page-authored text on its way to innerHTML — never raw
        if (on('tag')) bits.push(`<span class="tag">${el.tagName.toLowerCase()}${el.id ? '#' + U.esc(el.id) : ''}</span>`);
        return bits.join(' · ');
      },
      compact(i) {
        const { r, cs } = i;
        const dec = Tools.annotator(i);
        const on = (k) => Tools.setting(this, k);
        const bits = [];
        if (on('size')) bits.push(`<span class="sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`);
        if (on('radius')) { const rad = U.radius(cs); if (rad) bits.push(`<span class="rad">r ${rad}</span>`); }
        // deliberately padding only — the compact badge never marked m or gap
        if (on('padding')) { const p = U.four(cs, 'padding', dec); if (p) bits.push(`<span class="sp">p ${p.join(' ')}</span>`); }
        return bits.join(' · ');
      },
      report({ r, cs }) {
        const pad = U.fourPlain(cs, 'padding'), mar = U.fourPlain(cs, 'margin');
        return [
          `  box: ${Math.round(r.width)}×${Math.round(r.height)} @ (${Math.round(r.left)}, ${Math.round(r.top)})`,
          `  padding: ${pad.t} ${pad.r} ${pad.b} ${pad.l} | margin: ${mar.t} ${mar.r} ${mar.b} ${mar.l} | radius: ${U.radius(cs) || 0}`,
          `  display: ${cs.display}${U.px(cs.gap) ? ' gap:' + U.px(cs.gap) : ''} | position: ${cs.position} | overflow: ${cs.overflow}`,
          `  font: ${U.px(cs.fontSize)}px/${U.px(cs.lineHeight) || 'normal'} ${cs.fontWeight} ${cs.fontFamily.split(',')[0]}`,
          `  color: ${cs.color} | bg: ${cs.backgroundColor}`,
        ];
      },
      /**
       * A pair has a distance; a group of five does not have one distance.
       * Anything that is not two elements is something this tool has nothing
       * to say about, and it says so by drawing nothing rather than guessing
       * which two of them were meant.
       */
      _pairs: () => Tools.groups().filter((g) => g.length === 2),

      // dimension lines between grouped pins
      draw({ layer, Place }) {
        Measure.resetLanes();
        for (const [A, B] of this._pairs()) {
          Measure.dimension(layer, Place, A.el.getBoundingClientRect(),
                            B.el.getBoundingClientRect(), `#${A.id}→#${B.id}`);
        }
      },
      reportTail() {
        return this._pairs().map(([A, B]) => {
          const ra = A.el.getBoundingClientRect(), rb = B.el.getBoundingClientRect();
          const g = U.gap(ra, rb);
          const axis = Measure.axisOf(ra, rb);
          return `[#${A.id} → #${B.id}] ${axis.label}: ` +
                 (axis.kind === 'overlap' ? 'elements overlap'
                   : axis.kind === 'diagonal' ? `horizontal ${g.dx}px + vertical ${g.dy}px`
                   : `${axis.kind === 'vertical' ? g.dy : g.dx}px`);
        });
      },
    });

  // ─── src/tools/pick.js ─────────────────────────────────────────────────
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-picked { outline: 2px solid #b5e853; outline-offset: 1px;
      background: rgba(181,232,83,.12); }
    `,
      id: 'pick',
      icon: '⌖',
      title: 'Pick — Ctrl+click (⌘+click) copies what you clicked',
      // OFF by default: it takes over a click, and a tool that changes what
      // clicking does should be something you asked for.

      /**
       * What Ctrl+click puts on the clipboard. A selector is the address you
       * paste into a chat or a test; the text is what you paste into a bug
       * report or a translation file. Both are things you would otherwise
       * select by hand and get wrong at the edges.
       */
      /** Its own gesture, declared where the gesture lives. */
      gestures() {
        return [{ keys: 'Ctrl/⌘+click', does: 'copy what you clicked' }];
      },

      options() {
        return [{ key: 'what', label: 'Ctrl+click copies', def: 'selector',
                  values: ['selector', 'text'], affects: 'act' }];
      },

      /**
       * INPUT hook — the only one that acts on the page rather than describing
       * it. Returning true means this click was ours: the pin that would
       * normally follow does not happen, because landing a pin under an action
       * is the overlay doing two things for one click.
       *
       * Meta as well as Ctrl: Ctrl+click is the context menu on macOS, so the
       * modifier that means "modified click" there is ⌘.
       */
      intercept({ type, ev, el }) {
        if (type !== 'click' || !(ev.ctrlKey || ev.metaKey)) return false;
        const txt = Tools.setting(this, 'what') === 'text'
          ? (el.textContent || '').trim()
          : U.selectorOf(el);
        if (!txt) return false;     // nothing to copy is not a click we took
        Report.toClipboard(txt);
        this._hit = el;
        // The clipboard is invisible. Without this the only difference between
        // a copy that worked and one that silently did not is what turns up
        // when you paste, which is too late to notice.
        clearTimeout(this._timer);
        this._timer = setTimeout(() => { this._hit = null; Render.schedule(); },
                                 CONFIG.PICK_FLASH);
        Render.schedule();
        return true;
      },

      draw({ layer, Place }) {
        if (!this._hit || !document.contains(this._hit)) return;
        const r = this._hit.getBoundingClientRect();
        const box = document.createElement('div');
        box.className = 'dbgov-box dbgov-picked';
        Place.put(box, r.left, r.top, r.width, r.height);
        layer.append(box);
      },

      report({ el }) {
        return [`  selector: ${U.selectorOf(el)}`];
      },
    });

  // ─── src/tools/select.js ───────────────────────────────────────────────
  defineTool({
      id: 'select',
      // `mode` was measure's option before the select/measure split, so anyone
      // who chose 'chain' had it silently reset. Same miss as scale and colour,
      // caught one release later — an owner names its own former id.
      was: 'measure',
      icon: '⬚',
      title: 'Select — how pinned elements group up',
      startsOn: true,

      /**
       * SELECT, and only SELECT. This came out of measure, which had been the
       * read-out AND the thing deciding what was selected — so a second way of
       * selecting could not be added without editing the tool that draws
       * badges. Nothing here describes an element; it decides which elements
       * belong together, and hands that to whoever wants to say something
       * about the pair.
       */
      options() {
        return [{ key: 'mode', label: 'Pin grouping', def: CONFIG.PAIR_MODE,
                  values: ['pairs', 'chain'], affects: 'select' }];
      },

      // only Shift-clicked pins take part — a plain click is "inspect this",
      // and silently roping it into a measurement is not what was asked
      _pins: () => State.pins.filter((p) => p.kind === CONFIG.PIN_KIND.SHIFT),

      /**
       * The single place grouping is decided.
       *
       * 'pairs' — every group takes two clicks and the next starts a fresh
       * one, so a pin is never silently reused. 'chain' — each new pin groups
       * with the previous one.
       */
      _form() {
        const mp = this._pins();
        const mode = Tools.setting(this, 'mode');
        const step = mode === 'pairs' ? 2 : 1;
        const out = [];
        for (let k = 0; k + 1 < mp.length; k += step) out.push([mp[k], mp[k + 1]]);
        const pending = (mode === 'pairs' && mp.length % 2) ? mp[mp.length - 1] : null;
        return { groups: out, pending };
      },

      /** Hook: what is grouped, for anything that draws or reports BETWEEN
       *  elements. Consumers never learn who grouped them. */
      groups() { return this._form().groups; },

      /** Hook: which pin is still waiting for its partner. */
      pendingIndex() {
        const { pending } = this._form();
        return pending ? State.pins.indexOf(pending) : -1;
      },

      /**
       * Hook: rows for the panel's pin list. The distance in the detail column
       * comes from core geometry, not from a read-out hook — this tool
       * describes its own grouping, which is still selection, and implements
       * no badge or annotate to claim otherwise.
       */
      listRows() {
        const { groups, pending } = this._form();
        const rows = groups.map(([A, B]) => {
          const ra = A.el.getBoundingClientRect(), rb = B.el.getBoundingClientRect();
          const g = U.gap(ra, rb);
          const axis = Measure.axisOf(ra, rb);
          const detail = axis.kind === 'overlap' ? 'overlapping'
            : axis.kind === 'diagonal' ? `→ ${g.dx} · ↓ ${g.dy} px`
            : axis.kind === 'vertical' ? `↕ ${g.dy} px` : `↔ ${g.dx} px`;
          return { tag: `#${A.id}→#${B.id}`,
                   label: `${U.labelOf(A.el)} ↔ ${U.labelOf(B.el)}`,
                   detail, pins: [A, B] };
        });
        if (pending) rows.push({ tag: `#${pending.id}…`, label: U.labelOf(pending.el),
                                 detail: 'pick its pair', pins: [pending] });
        return rows;
      },

      /** A half-finished selection is a fact about the report's scope. */
      reportTail() {
        const { pending } = this._form();
        return pending ? [`[#${pending.id}] waiting for its pair`] : [];
      },
    });

  // ─── src/ui/styles.js ──────────────────────────────────────────────────
  /* ======================================================================
     STYLES
     ====================================================================== */
  const CSS = `
    #__dbgov-root { position: fixed; inset: 0; z-index: ${CONFIG.Z}; pointer-events: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    #__dbgov-root * { box-sizing: border-box; }

    .dbgov-box { position: fixed; pointer-events: none; }
    .dbgov-hover  { outline: 1.5px solid #58c4ff; outline-offset: -1px; background: rgba(88,196,255,.06); }
    /* note pin = plain click (inspect only) · measure pin = Shift+click */
    .dbgov-pinbox { outline: 1.5px dashed #ff8a65; outline-offset: -1px; }
    .dbgov-pinbox.measure { outline-style: solid; outline-color: #b5e853; }
    .dbgov-pinbox.waiting { outline-color: #58c4ff; }
    .dbgov-pinbox.rmtarget { outline: 2px solid #ff5c5c; background: rgba(255,92,92,.10); }
    .dbgov-pinbox.flash { outline: 2.5px solid #58c4ff;
      background: rgba(88,196,255,.18); }
    @media (prefers-reduced-motion: no-preference) {
      .dbgov-pinbox.flash { animation: dbgov-pulse .9s ease-out; }
    }
    @keyframes dbgov-pulse {
      0% { box-shadow: 0 0 0 0 rgba(88,196,255,.55); }
      100% { box-shadow: 0 0 0 16px rgba(88,196,255,0); } }

    /* pin list popover — opened from the count chip, closed for screenshots */
    #__dbgov-list { position: fixed; display: none; pointer-events: auto;
      min-width: 250px; max-width: 460px; max-height: 60vh; overflow-y: auto;
      background: rgba(18,18,20,.97); border-radius: 12px; padding: 6px;
      box-shadow: 0 6px 24px rgba(0,0,0,.6); color: #fff; font-size: 12px; }
    #__dbgov-list.open { display: block; }
    #__dbgov-list .empty { padding: 10px 8px; color: #8f8f96; line-height: 1.5; }
    #__dbgov-list .row { display: flex; align-items: center; gap: 8px;
      padding: 6px 8px; border-radius: 8px; cursor: pointer; }
    #__dbgov-list .row:hover { background: rgba(255,255,255,.08); }
    #__dbgov-list .tag { flex: none; color: #ff8a65; font-weight: 800; }
    #__dbgov-list .lbl { flex: 1 1 auto; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    #__dbgov-list .det { flex: none; color: #b5e853; font-weight: 700; }
    /* A row may carry an opaque accent; the panel copies it onto the element
       without knowing what any of the values mean. */
    #__dbgov-list .row[data-accent="error"] .tag { color: #ff6b6b; }
    #__dbgov-list .row[data-accent="warn"]  .tag { color: #ffd54f; }
    #__dbgov-list .row[data-accent="info"]  .tag { color: #9ad0ff; }
    /* not a verdict — something the tool could not measure and you have to
       look at yourself; italic so it never reads as a failure */
    #__dbgov-list .row[data-accent="review"] .tag { color: #8ab4f8; font-style: italic; }
    /* The verdict reads first and the selector says where to look, so a
       finding puts its message in .lbl — which already takes the room and
       ellipsises — and the element in .det. No direction tricks: rtl reorders
       the neutral characters in a CSS selector and prints '#id' backwards. */
    #__dbgov-list .row[data-accent] .det { color: #8f8f96; font-weight: 400; }
    /* A settings row's picker. font: inherit because a bare <select> takes the
       PAGE's font on some sites and the row stops lining up; the overlay must
       look the same wherever it is injected. */
    #__dbgov-list .opt { flex: none; cursor: pointer; font: inherit;
      background: #2c2c31; color: #b5e853; font-weight: 700; border: 0;
      border-radius: 6px; padding: 3px 6px; }
    #__dbgov-list .opt:hover { background: #3a3a41; }
    /* what the settings under it change — the category, not the owning tool */
    /* which of the three screens this is — one slot showed findings, pins and
       settings with no header at all, so nothing said what you were reading */
    #__dbgov-list .viewhead { padding: 4px 8px 8px; color: #fff; font-size: 13px;
      font-weight: 800; border-bottom: 1px solid rgba(255,255,255,.10); margin-bottom: 4px; }
    #__dbgov-list .viewhead .note { display: block; margin-top: 2px; color: #8f8f96;
      font-size: 10px; font-weight: 400; }
    #__dbgov-list .head { padding: 10px 8px 4px; color: #8f8f96;
      font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
    #__dbgov-list .head:first-child { padding-top: 4px; }
    #__dbgov-list .head .note { display: block; margin-top: 2px;
      font-size: 10px; font-weight: 400; letter-spacing: 0; text-transform: none; }
    /* stored and waiting — the tool that reads it is switched off */
    #__dbgov-list .row.inert .lbl, #__dbgov-list .row.inert .tag { opacity: .45; }
    #__dbgov-list .num { flex: none; display: flex; align-items: center; gap: 4px; }
    #__dbgov-list .num .opt { width: 68px; text-align: right; }
    #__dbgov-list .unit { color: #8f8f96; font-weight: 400; }
    /* accent-color rather than a hand-built switch: the native control already
       knows focus, keyboard and the platform's own hit target */
    #__dbgov-list .tick { width: 15px; height: 15px; padding: 0; accent-color: #b5e853; }
    #__dbgov-list .rm { flex: none; width: 20px; height: 20px; border: 0; cursor: pointer;
      border-radius: 50%; background: #2c2c31; color: #ff8a8a; font-size: 11px;
      display: flex; align-items: center; justify-content: center; }
    #__dbgov-list .rm:hover { background: #ff5c5c; color: #fff; }
    /* Where the findings actually are. Dashed, never filled: a mark points at
       a problem, it must not hide the thing it is pointing at.
       CORE, not one tool's: every rule may mark its own findings, and this was
       contrast's private CSS until dupid needed to mark its own too. A class
       more than one tool emits cannot live in either one's sheet. */
    .dbgov-flag { outline-offset: 1px; }
    .dbgov-flag.error  { outline: 2px dashed #ff6b6b; }
    .dbgov-flag.warn   { outline: 2px dashed #ffd54f; }
    .dbgov-flag.info   { outline: 2px dashed #9ad0ff; }
    .dbgov-flag.review { outline: 2px dotted #8ab4f8; }
    /* an audit is on the page right now — distinct from .armed, which only
       means the findings VIEW is the one open. No backticks in here: this
       whole sheet is a template literal. */
    #__dbgov-bar .act.swept { box-shadow: inset 0 0 0 2px #b5e853; }
    /* There was no designed focus indicator anywhere in this sheet — a
       keyboard user could tab through 13 controls with nothing to show where
       they were. :focus-visible only, so a mouse click does not draw one. */
    #__dbgov-root :focus-visible { outline: 2px solid #58c4ff; outline-offset: 2px; }
    /* WCAG 2.5.8 wants 24x24. These three were 18x21, 20x20 and 15x15. */
    #__dbgov-bar .cnt { min-width: 24px; min-height: 24px; }
    #__dbgov-list .rm { width: 24px; height: 24px; }
    #__dbgov-list .tick { width: 24px; height: 24px; }
    #__dbgov-bar .cnt.armed { background: #ff8a65; color: #1a1a1a; }

    .dbgov-badge { position: fixed; pointer-events: none; max-width: 92vw;
      background: rgba(18,18,20,.94); color: #fff; border-radius: 8px;
      padding: 4px 9px; font-size: 12px; line-height: 1.45; white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0,0,0,.45); }
    .dbgov-badge .sz  { color: #ffffff; font-weight: 700; }
    .dbgov-badge .rad { color: #ff8a65; }
    .dbgov-badge .sp  { color: #9ad0ff; }
    .dbgov-badge .fnt { color: #d7c4ff; }
    .dbgov-badge .tag { color: #8f8f96; }

    .dbgov-pin-num { position: fixed; pointer-events: none;
      min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px;
      background: #ff8a65; color: #1a1a1a; font-size: 12px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.5); }
    .dbgov-pin-num.measure { background: #b5e853; color: #16200a; }
    .dbgov-pin-num.waiting { background: #58c4ff; color: #0d1b24; }
    .dbgov-pin-num.rmtarget { background: #ff5c5c; color: #fff; }

    /* remove mode: ✕ chips appear only while the remove key is held */
    .dbgov-rm { position: fixed; pointer-events: none;
      width: 18px; height: 18px; border-radius: 50%; background: #ff5c5c; color: #fff;
      font-size: 11px; font-weight: 800; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,.5); transition: transform .1s ease; }
    .dbgov-rm.target { transform: scale(1.3); background: #ff2f2f; }

    #__dbgov-bar { position: fixed; right: 14px; top: 50%;
      pointer-events: auto; display: flex; flex-direction: column; align-items: center;
      gap: 7px; background: rgba(18,18,20,.96); border-radius: 999px; padding: 8px;
      box-shadow: 0 4px 18px rgba(0,0,0,.55); user-select: none; touch-action: none;
      transition: transform .22s cubic-bezier(.2,.8,.3,1), opacity .22s ease; }
    #__dbgov-bar.dragging { transition: none; opacity: .9; }
    #__dbgov-bar .grip { width: 22px; height: 12px; cursor: grab; flex: none;
      display: flex; align-items: center; justify-content: center;
      color: #6a6a72; font-size: 11px; letter-spacing: 1px; line-height: 1; }
    #__dbgov-bar.dragging .grip { cursor: grabbing; }

    /* master power */
    #__dbgov-bar .pwr { width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
      font-size: 15px; background: #3a3a40; color: #9a9aa2;
      display: flex; align-items: center; justify-content: center; transition: background .15s; }
    #__dbgov-bar.on .pwr { background: #b5e853; color: #1a1a1a; }
    #__dbgov-bar .st { font-size: 10px; font-weight: 800; letter-spacing: .5px; color: #8f8f96; }
    #__dbgov-bar.on .st { color: #b5e853; }
    #__dbgov-bar.removing .pwr { background: #ff5c5c; color: #fff; }
    #__dbgov-bar.removing .st { color: #ff5c5c; }

    /* things that only make sense once powered on */
    #__dbgov-bar .whenOn { display: none; }
    #__dbgov-bar.on .whenOn { display: flex; align-items: center; justify-content: center; }
    #__dbgov-bar.on .cnt.whenOn { display: block; }
    #__dbgov-bar hr.sep { width: 20px; height: 1px; border: 0; margin: 1px 0;
      background: rgba(255,255,255,.14); }
    #__dbgov-bar .cnt { font-size: 11px; font-weight: 700; color: #ff8a65;
      border: 0; background: transparent; cursor: pointer; padding: 2px 6px;
      border-radius: 999px; font-family: inherit; }
    #__dbgov-bar .cnt:hover { background: #2c2c31; }

    /* tool + action buttons */
    #__dbgov-bar button.tool, #__dbgov-bar button.act {
      width: 34px; height: 34px; border-radius: 50%; border: 0; cursor: pointer;
      background: #2c2c31; color: #fff; font-size: 15px; }
    #__dbgov-bar button.tool:hover, #__dbgov-bar button.act:hover { background: #3a3a40; }
    #__dbgov-bar button.tool.armed { background: #58c4ff; color: #0d1b24; }
    /* A tool in the run that feeds ⌕ carries a dot. Armed or not, it is still
       swept — the dot says "this contributes findings", the fill says "this
       is drawn". They are different questions and used to look the same. */
    #__dbgov-bar button.tool.checks { position: relative; }
    #__dbgov-bar button.tool.checks::after {
      content: ''; position: absolute; right: 2px; bottom: 2px;
      width: 4px; height: 4px; border-radius: 50%; background: #b5e853; }
    #__dbgov-bar button.act.armed { background: #b5e853; color: #1a1a1a; }

    #__dbgov-bar.tucked { opacity: .4; }
    #__dbgov-bar.tucked:hover { opacity: 1; }
  `;

  // ─── src/ui/dom.js ─────────────────────────────────────────────────────
  /* ======================================================================
     DOM
     ====================================================================== */
  const root = document.createElement('div');
  root.id = '__dbgov-root';
  /* NOT aria-hidden. This root holds 13 tabbable buttons, so hiding it told
     assistive tech the subtree does not exist while keyboard focus could still
     land inside it — axe's aria-hidden-focus, WCAG 4.1.2. The decorative
     layers get it instead (see the layer below and .dbgov-box/.dbgov-badge/
     .dbgov-flag, all pointer-events:none), and the whole root goes `inert`
     while powered off, which hides it from AT AND takes it out of the tab
     order — the thing aria-hidden alone could never do. */
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Debug overlay');
  /**
   * One sheet per tool, plus the core — not one sheet for all of them.
   *
   * A CSS parser raises nothing when it gives up: it drops the broken rule
   * and everything after it in the same sheet. Concatenated, that meant an
   * unclosed paren in an early tool silently cost every later tool its
   * styling. That shipped once, and cost grid and contrast theirs entirely.
   * Separate sheets make the blast radius the author's own file.
   */
  const sheet = (css, owner) => {
    const s = document.createElement('style');
    if (owner) s.dataset.tool = owner;   // so a broken one can be named
    s.textContent = css;
    root.append(s);
  };
  sheet(CSS);
  for (const t of TOOLS) if (t.css) sheet(t.css, t.id);
  const layer = document.createElement('div');
  // everything painted onto the page is decoration: no text an AT user needs,
  // and already unclickable
  layer.setAttribute('aria-hidden', 'true');
  root.append(layer);
  document.documentElement.append(root);

  // ─── src/ui/controls.js ────────────────────────────────────────────────
  /* ======================================================================
    CONTROLS — one widget, from a description of it

        Split out of PANEL because it never needed anything PANEL owns: no
        element, no state, no callbacks of its own. Everything it makes is
        determined by its argument, which also makes it the one piece of the
        panel that can be reasoned about without reading the rest of it.

        `kind` is the entire vocabulary here. This file never learns which
        setting it is drawing, what the value means, or who owns it — it
        reports what the widget produced and the row's author decides what
        that was.
     ====================================================================== */
  const Controls = {
    /**
     * An unknown kind renders an empty span rather than guessing. A row asking
     * for something this cannot draw should be visibly missing, not silently
     * approximated by whichever branch happened to fall through.
     */
    build(c, onChange) {
      const fn = Controls[c.kind];
      return fn ? fn(c, onChange) : document.createElement('span');
    },

    choice(c, onChange) {
      const sel = document.createElement('select');
      sel.className = 'opt';
      c.choices.forEach((label, k) => {
        const o = document.createElement('option');
        o.value = String(k);
        o.textContent = label;               // a tool's own label, still not HTML
        sel.append(o);
      });
      sel.selectedIndex = c.selected || 0;
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', () => onChange(sel.selectedIndex));
      return sel;
    },

    number(c, onChange) {
      const wrap = document.createElement('span');
      wrap.className = 'num';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'opt';
      inp.value = c.value;
      if (c.min !== undefined) inp.min = String(c.min);
      if (c.max !== undefined) inp.max = String(c.max);
      if (c.step !== undefined) inp.step = String(c.step);
      inp.addEventListener('click', (e) => e.stopPropagation());
      // 'change', not 'input': every keystroke of "120" would otherwise be a
      // separate value — 1, then 12 — each one re-running the rule behind it
      inp.addEventListener('change', () => onChange(inp.value));
      wrap.append(inp);
      if (c.suffix) {
        const u = document.createElement('span');
        u.className = 'unit';
        u.textContent = c.suffix;
        wrap.append(u);
      }
      return wrap;
    },

    toggle(c, onChange) {
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.className = 'opt tick';
      inp.checked = !!c.on;
      inp.addEventListener('click', (e) => e.stopPropagation());
      inp.addEventListener('change', () => onChange(inp.checked));
      return inp;
    },
  };

  // ─── src/ui/list.js ────────────────────────────────────────────────────
  /* ======================================================================
    LIST — the popover the panel opens

        Split out of PANEL, which was doing two jobs: a bar of buttons that
        drags and snaps, and a list that renders rows. They share only an
        anchor — the popover has to know where the bar is and which edge it
        sits against — so that is all this is given, as a small object PANEL
        hands over.

        Defined BEFORE the panel so nothing here is in scope before it exists;
        the panel attaches to it on the way up.
     ====================================================================== */
  const List = (() => {
    const el = document.createElement('div');
    el.id = '__dbgov-list';
    root.append(el);
    let open = false;
    let view = null;      // opaque name of whichever view is showing
    let anchor = null;    // { el, side(), mark(view) } — supplied by PANEL

    /**
     * Put the popover beside the bar, and NEVER under it.
     *
     * The bar is the later sibling in the root and neither declares a z-index,
     * so inside the root's stacking context the bar paints — and hit-tests —
     * above this. An overlap is therefore not cosmetic: the bar swallows
     * clicks meant for the rows beneath it. Restacking is the wrong fix, since
     * putting the popover on top would bury the button you close it with.
     *
     * So: four candidate placements, each clamped into the viewport FIRST and
     * only then tested for whether it still clears the bar. Preference follows
     * the edge the bar snapped to, which keeps the ordinary case exactly where
     * it has always been; the rest are fallbacks for when the clamp bites.
     */
    function place() {
      if (!anchor) return;
      const r = anchor.el.getBoundingClientRect();
      const w = el.offsetWidth, h = el.offsetHeight;
      const G = CONFIG.LIST_GAP, P = CONFIG.LIST_PAD;
      const at = (x, y) => ({
        x: Math.max(P, Math.min(x, innerWidth - w - P)),
        y: Math.max(P, Math.min(y, innerHeight - h - P)),
      });
      const beside = {
        right: () => at(r.left - w - G, r.top),
        left: () => at(r.right + G, r.top),
        below: () => at(r.left + r.width / 2 - w / 2, r.bottom + G),
        above: () => at(r.left + r.width / 2 - w / 2, r.top - h - G),
      };
      const side = anchor.side();
      const order = side === 'left' ? ['left', 'right', 'below', 'above']
        : side === 'right' ? ['right', 'left', 'below', 'above']
          : side === 'top' ? ['below', 'right', 'left', 'above']
            : ['above', 'right', 'left', 'below'];
      const clears = (c) => c.x + w <= r.left || c.x >= r.right ||
                            c.y + h <= r.top || c.y >= r.bottom;
      const tried = order.map((k) => beside[k]());
      const pick = tried.find(clears) || tried[0];
      el.style.left = pick.x + 'px';
      el.style.top = pick.y + 'px';
    }

    const api = {
      onOpen: null, onRowActivate: null, onRowRemove: null, onRowChange: null,

      /** PANEL says where it is and how to light up the button that opened us. */
      attach(a) { anchor = a; },

      isOpen: () => open,
      /**
       * One popover, several views. `view` is an opaque name off the button
       * that opened it — this carries it and hands it back, and never learns
       * what any of them mean.
       */
      view: () => view,
      place,

      toggle(v, name = 'pins') {
        const same = open && view === name;
        open = v === undefined ? !same : !!v;
        view = open ? name : null;
        el.classList.toggle('open', open);
        anchor?.mark(view);
        if (open) { api.onOpen?.(view); place(); }
      },

      /**
       * rows: [{ tag, label, detail, removable }] — built by CONTROLLER, which
       * is also where the empty-state wording comes from, because only it
       * knows what this view is a list of.
       *
       * A row may carry a `control` description instead of a detail. This
       * draws it and hands back whatever the widget produced — an index, a
       * string, a boolean. It cannot learn what the setting is or what type
       * its value has, and so cannot start deciding any of that.
       */
      set(rows, empty = '') {
        el.textContent = '';
        if (!rows.length) {
          const e = document.createElement('div');
          e.className = 'empty';
          e.textContent = empty;
          el.append(e);
          place();
          return;
        }
        rows.forEach((row, i) => {
          /* A heading is a row like any other so that INDICES STILL LINE UP:
             the panel hands back the index it was given, and if headings were
             a separate structure every row under one would be off by however
             many came before it — changing the wrong setting entirely. It is
             not clickable and carries no control, so nothing can be fired
             from it. */
          if (row.title || row.heading) {
            const h = document.createElement('div');
            h.className = row.title ? 'viewhead' : 'head';
            h.textContent = row.title || row.heading;
            if (row.detail) {
              const n = document.createElement('span');
              n.className = 'note';
              n.textContent = row.detail;
              h.append(n);
            }
            el.append(h);
            return;
          }
          const r = document.createElement('div');
          r.className = 'row';
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = row.tag;
          const lbl = document.createElement('span');
          lbl.className = 'lbl';
          lbl.textContent = row.label;         // textContent: page text is never HTML here
          // carried, not interpreted — the stylesheet decides what it means
          if (row.accent) r.dataset.accent = row.accent;
          if (row.inert) r.classList.add('inert');
          r.addEventListener('click', () => api.onRowActivate?.(i));
          if (row.control) {
            r.append(tag, lbl, Controls.build(row.control, (raw) => api.onRowChange?.(i, raw)));
          } else {
            const det = document.createElement('span');
            det.className = 'det';
            det.textContent = row.detail || '';
            r.append(tag, lbl, det);
          }
          // Only rows that own something can drop it. A finding is a fact
          // about the page; there is nothing there for a ✕ to remove.
          if (row.removable) {
            const rm = document.createElement('button');
            rm.className = 'rm';
            rm.textContent = '✕';
            rm.title = 'Remove';
            rm.addEventListener('click', (e) => { e.stopPropagation(); api.onRowRemove?.(i); });
            r.append(rm);
          }
          el.append(r);
        });
        place();
      },
    };
    return api;
  })();

  // ─── src/ui/panel.js ───────────────────────────────────────────────────
  /* ======================================================================
     PANEL — self-contained; talks out only via callbacks
     ====================================================================== */
  const Panel = (() => {
    const el = document.createElement('div');
    el.id = '__dbgov-bar';
    // Tool buttons come from the registry — never hardcoded — and so does the
    // grouping. This file draws the runs it is handed, in order, with a rule
    // between them; what puts a tool in one run rather than another is not
    // its business.
    const toolRuns = Tools.runs().map((run) => run.tools.map((t) =>
      // The roles go in the tooltip, not in the grouping: a button sits in one
      // place and most tools fill two, so this is where it can say both.
      `<button class="tool whenOn ${run.cls}" data-tool="${t.id}"` +
      ` title="${t.title}\n${Tools.rolesOf(t).join(' · ')}${run.note}` +
      // the tool says so itself, so a tool with nothing to configure does not
      // advertise a menu that would open empty
      `${t.options || t.uses ? '\nright-click for its options' : ''}">${t.icon}</button>`).join(''))
      .join('<hr class="sep whenOn">');
    el.innerHTML = `
      <span class="grip" title="Drag to move — snaps to the nearest edge">⋮⋮</span>
      <button class="pwr" title="Power (Alt+Shift+D) · v${CONFIG.VERSION}">⏻</button>
      <span class="st" data-st>OFF</span>
      <hr class="sep whenOn">
      ${toolRuns}
      <!-- next to the run it acts on, so proximity says what it sweeps -->
      <button class="act whenOn" data-sweep data-view="findings" title="Audit the whole page">⌕</button>
      <!-- with the tools it configures, not with the panel's own actions -->
      <button class="act whenOn" data-settings data-view="settings" title="Tool settings">⚙</button>
      <hr class="sep whenOn">
      <button class="cnt whenOn" data-c data-view="pins" title="Pinned elements — click for the list">0</button>
      <button class="act whenOn" data-detail title="Compact / full badges">≡</button>
      <button class="act whenOn" data-copy title="Copy report">⧉</button>
      <button class="act whenOn" data-clear title="Clear pins and the audit's marks">✕</button>`;
    root.append(el);

    // The popover is LIST's; this says where it hangs and lights up whichever
    // button opened it. Nothing else about it is the bar's business.
    List.attach({
      el,
      side: () => side,
      mark: (view) => el.querySelectorAll('[data-view]').forEach(
        (b) => {
          const on = !!view && b.dataset.view === view;
          b.classList.toggle('armed', on);
          b.setAttribute('aria-pressed', String(on));
        }),
    });

    // button -> { original, timer } while a transient message is showing
    const flashing = new Map();

    const api = {
      el,
      onToggle: null, onTool: null, onDetail: null, onCopy: null, onClear: null,
      onListOpen: null, onRowActivate: null, onRowRemove: null, onSweep: null,
      onRowChange: null,
      setOn(v) {
        /* NO `inert` here, ever. It was added to take the overlay out of the
           tab order when powered off — but inert covers the WHOLE subtree, and
           that includes the two controls which must never stop working: the ⏻
           button and the ⋮⋮ grip. Shipped in v3.8.48 and it left the panel dead
           to the mouse when off, reachable only by the hotkey.

           It was redundant as well as harmful: `.whenOn` and the popover are
           already `display: none` when off, which removes them from the tab
           order and the accessibility tree by itself. */
        el.classList.toggle('on', v);
        el.querySelector('[data-st]').textContent = v ? 'ON' : 'OFF';
        if (!v) api.toggleList(false);
        if (v) { clearTimeout(tuckTimer); untuck(); } else scheduleTuck();
      },
      setTool(id, v) {
        const b = el.querySelector(`[data-tool="${id}"]`);
        b?.classList.toggle('armed', v);
        b?.setAttribute('aria-pressed', String(!!v));
      },
      setDetail(v) {
        const b = el.querySelector('[data-detail]');
        b.classList.toggle('armed', v);
        b.setAttribute('aria-pressed', String(!!v));
      },
      /**
       * Whether an audit is currently showing on the page. The ⌕ flash is
       * transient by design, so once it expired the bar said "no audit has
       * run" while the page was still wearing its outlines, and nothing in
       * the bar admitted they existed or removed them. One state now drives
       * both the button and the marks.
       */
      /**
       * Whether an audit is showing, and how much it found.
       *
       * The count used to be a 1.2s flash, so once it expired the bar could not
       * answer "does this page have problems?" without opening the panel — and
       * the marks stayed on the page with nothing admitting they were there.
       * It rests on the button now. It is safe to show a bare number here only
       * because the panel header names both quantities ("N distinct problems ·
       * M occurrences"); two unlabelled numbers on one bar was the original
       * complaint, and the label is what fixed it, not hiding one of them.
       */
      setSwept(v, n) {
        const b = el.querySelector('[data-sweep]');
        b.classList.toggle('swept', !!v);
        b.textContent = v ? String(n) : '⌕';
        const what = v ? `Audit: ${n} distinct problem${n === 1 ? '' : 's'} — click to re-run`
          : 'Audit the whole page';
        b.title = what;
        b.setAttribute('aria-label', what);
      },
      setRemoveMode(v) {
        el.classList.toggle('removing', v);
        const st = el.querySelector('[data-st]');
        st.textContent = v ? 'DEL' : (api.isOn() ? 'ON' : 'OFF');
      },
      setCount(n) { el.querySelector('[data-c]').textContent = String(n); },

      // The popover's own surface, forwarded so CONTROLLER and BOOT still have
      // one thing to talk to. What it renders is LIST's business, not this
      // file's — that is the whole point of the split.
      isListOpen: List.isOpen,
      view: List.view,
      toggleList: List.toggle,
      setList: List.set,

      /**
       * Two flashes on one button inside the window left the message there for
       * good: the second captured the first's text as "the original" and its
       * timer, firing last, wrote that back. ⌕ twice in a second was enough,
       * and the button then read "0" forever.
       */
      flash(msg, sel = '[data-copy]') {
        const b = el.querySelector(sel);
        if (!b) return;
        const live = flashing.get(b);
        const original = live ? live.original : b.textContent;
        if (live) clearTimeout(live.timer);
        b.textContent = msg;
        flashing.set(b, {
          original,
          timer: setTimeout(() => {
            b.textContent = original;
            flashing.delete(b);
          }, CONFIG.FLASH_MS),
        });
      },
      rect: () => el.getBoundingClientRect(),
      isOn: () => el.classList.contains('on'),
    };

    // LIST's events arrive as the panel's own, so BOOT still wires one object
    // and nothing outside had to learn that the popover moved house.
    List.onOpen = (v) => api.onListOpen?.(v);
    List.onRowActivate = (i) => api.onRowActivate?.(i);
    List.onRowRemove = (i) => api.onRowRemove?.(i);
    List.onRowChange = (i, raw) => api.onRowChange?.(i, raw);

    /* A glyph is not a name. Every control carries a title for sighted users;
       the first clause of it is the accessible name, and every toggle says
       whether it is on — a screen reader had no way to tell an armed tool from
       a disarmed one, because "armed" was a CSS class and nothing else. */
    el.querySelectorAll('button').forEach((b) => {
      const name = (b.title || '').split(/[\n·—]/)[0].trim();
      if (name) b.setAttribute('aria-label', name);
    });
    el.querySelectorAll('[data-tool], [data-detail], [data-view]')
      .forEach((b) => b.setAttribute('aria-pressed', 'false'));

    el.querySelector('.pwr').addEventListener('click', () => api.onToggle?.());
    el.querySelectorAll('[data-tool]').forEach((b) => {
      b.addEventListener('click', () => api.onTool?.(b.dataset.tool));
      /* Right-click opens THIS tool's options and nothing else. The view name
         carries the id the way 'pins' and 'findings' carry theirs — opaque to
         this file, handed straight back, so the panel still never learns what
         any of them mean. preventDefault because the browser menu over our own
         button helps nobody; the PAGE's menu is untouched. */
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        api.toggleList(undefined, `tool:${b.dataset.tool}`);
      });
    });
    el.querySelector('[data-c]').addEventListener('click', () => api.toggleList(undefined, 'pins'));
    el.querySelector('[data-settings]').addEventListener('click', () => api.toggleList(undefined, 'settings'));
    el.querySelector('[data-detail]').addEventListener('click', () => api.onDetail?.());
    el.querySelector('[data-sweep]').addEventListener('click', () => api.onSweep?.());
    el.querySelector('[data-copy]').addEventListener('click', () => api.onCopy?.());
    el.querySelector('[data-clear]').addEventListener('click', () => api.onClear?.());

    // --- position: restore / clamp / snap / persist
    let side = 'right';
    function applyPos(x, y) {
      const r = el.getBoundingClientRect();
      x = Math.max(4, Math.min(x, innerWidth - r.width - 4));
      y = Math.max(4, Math.min(y, innerHeight - r.height - 4));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.right = 'auto';
      return { x, y };
    }
    function snap() {
      const r = el.getBoundingClientRect();
      const d = { left: r.left, right: innerWidth - r.right, top: r.top, bottom: innerHeight - r.bottom };
      side = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b));
      let x = r.left, y = r.top;
      if (side === 'left') x = CONFIG.EDGE_MARGIN;
      if (side === 'right') x = innerWidth - r.width - CONFIG.EDGE_MARGIN;
      if (side === 'top') y = CONFIG.EDGE_MARGIN;
      if (side === 'bottom') y = innerHeight - r.height - CONFIG.EDGE_MARGIN;
      const p = applyPos(x, y);
      Store.set(CONFIG.POS_KEY, JSON.stringify({ x: p.x, y: p.y, side }));
    }
    (function restore() {
      try {
        const s = JSON.parse(Store.get(CONFIG.POS_KEY) || 'null');
        if (s) { side = s.side || 'right'; applyPos(s.x, s.y); return; }
      } catch {}
      applyPos(innerWidth - 60, innerHeight / 2 - 110);
    })();

    // --- auto-tuck (only while powered off)
    let tuckTimer = 0;
    function untuck() { el.classList.remove('tucked'); el.style.transform = ''; }
    function tuck() {
      untuck();
      const r = el.getBoundingClientRect();
      let t = '';
      if (side === 'right')  t = `translateX(${Math.round(innerWidth - CONFIG.PEEK - r.left)}px)`;
      if (side === 'left')   t = `translateX(${Math.round(CONFIG.PEEK - r.right)}px)`;
      if (side === 'bottom') t = `translateY(${Math.round(innerHeight - CONFIG.PEEK - r.top)}px)`;
      if (side === 'top')    t = `translateY(${Math.round(CONFIG.PEEK - r.bottom)}px)`;
      el.classList.add('tucked');
      el.style.transform = t;
    }
    function scheduleTuck() {
      clearTimeout(tuckTimer);
      if (api.isOn() || List.isOpen()) { untuck(); return; }
      tuckTimer = setTimeout(() => {
        if (!api.isOn() && !el.matches(':hover')) tuck();
      }, CONFIG.TUCK_DELAY);
    }
    el.addEventListener('pointerenter', () => { clearTimeout(tuckTimer); untuck(); });
    el.addEventListener('pointerleave', scheduleTuck);

    // --- drag (buttons keep working)
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      untuck();
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      el.classList.add('dragging');
      applyPos(e.clientX - drag.dx, e.clientY - drag.dy);
      if (List.isOpen()) List.place();
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      el.classList.remove('dragging');
      snap();
      scheduleTuck();
      if (List.isOpen()) List.place();
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    addEventListener('resize', () => { snap(); if (List.isOpen()) List.place(); });

    return api;
  })();

  // ─── src/ui/placement.js ───────────────────────────────────────────────
  /* ======================================================================
     PLACEMENT — collision-free positioning
     ====================================================================== */
  const Place = (() => {
    let taken = [];
    function put(node, x, y, w, h) {
      node.style.left = x + 'px';
      node.style.top = y + 'px';
      if (w != null) node.style.width = w + 'px';
      if (h != null) node.style.height = h + 'px';
    }
    function claim(x, y, w, h) { taken.push(U.rectOf(x - 2, y - 2, w + 4, h + 4)); }

    function smart(node, anchor, opts = {}) {
      const w = node.offsetWidth, h = node.offsetHeight;
      const M = CONFIG.BADGE_MARGIN, PAD = 4;
      const cands = [
        { x: anchor.left, y: anchor.bottom + M, cost: 0 },
        { x: anchor.left, y: anchor.top - h - M, cost: 1 },
        { x: anchor.right - w, y: anchor.bottom + M, cost: 2 },
        { x: anchor.right - w, y: anchor.top - h - M, cost: 3 },
        { x: anchor.right + M, y: anchor.top, cost: 4 },
        { x: anchor.left - w - M, y: anchor.top, cost: 5 },
        { x: anchor.left + M, y: anchor.top + M, cost: 8 },
      ];
      // nudge offsets: alternate down/up, then sideways, growing outward
      const NUDGES = [{ x: 0, y: 0 }];
      for (let s = 1; s <= 5; s++) {
        NUDGES.push({ x: 0, y: s * (h + PAD) }, { x: 0, y: -s * (h + PAD) });
        NUDGES.push({ x: s * (w * 0.55 + PAD), y: 0 }, { x: -s * (w * 0.55 + PAD), y: 0 });
      }

      let best = null;
      outer:
      for (const c of cands) {
        for (let n = 0; n < NUDGES.length; n++) {
          const x = Math.max(PAD, Math.min(c.x + NUDGES[n].x, innerWidth - w - PAD));
          const y = Math.max(PAD, Math.min(c.y + NUDGES[n].y, innerHeight - h - PAD));
          const r = U.rectOf(x, y, w, h);
          let score = c.cost + n * 1.5;
          for (const t of taken) score += U.overlap(r, t) / 90;   // hard penalty
          if (opts.avoid)
            score += U.overlap(r, U.rectOf(opts.avoid.left, opts.avoid.top,
                                           opts.avoid.width, opts.avoid.height)) / 900;
          if (!best || score < best.score) best = { x, y, score };
          if (score < 0.5) break outer;
        }
      }
      put(node, best.x, best.y);
      claim(best.x, best.y, w, h);

      const near = best.y <= anchor.bottom + M + 2 && best.y + h >= anchor.top - M - 2 &&
                   best.x <= anchor.right + M + 2 && best.x + w >= anchor.left - M - 2;
      if (!near && opts.leader !== false) {
        const ax = Math.max(anchor.left, Math.min(best.x + w / 2, anchor.right));
        const ay = Math.max(anchor.top, Math.min(best.y + h / 2, anchor.bottom));
        const bx = Math.max(best.x, Math.min(ax, best.x + w));
        const by = Math.max(best.y, Math.min(ay, best.y + h));
        const ln = document.createElement('div');
        ln.className = 'dbgov-leader';
        if (Math.abs(bx - ax) >= Math.abs(by - ay))
          put(ln, Math.min(ax, bx), Math.round(ay), Math.abs(bx - ax) || 1, 1);
        else put(ln, Math.round(ax), Math.min(ay, by), 1, Math.abs(by - ay) || 1);
        layer.append(ln);
      }
    }

    return {
      put, claim, smart,
      reset() {
        taken = [];
        const br = Panel.rect();
        taken.push(U.rectOf(br.left - 8, br.top - 8, br.width + 16, br.height + 16));
      },
    };
  })();

  // ─── src/ui/badges.js ──────────────────────────────────────────────────
  /* ======================================================================
    BADGES — composed from ACTIVE tools only
     ====================================================================== */
  const Badges = {
    build(info, compact) {
      const parts = [];
      for (const t of Tools.active()) {
        const fn = compact ? (t.compact || null) : (t.badge || null);
        if (!fn) continue;
        const html = fn.call(t, info);
        if (html) parts.push(html);
      }
      return parts.join(' · ');
    },
  };

  // ─── src/ui/renderer.js ────────────────────────────────────────────────
  /* ======================================================================
    RENDERER
     ====================================================================== */
  const Render = (() => {
    let raf = 0;

    function now() {
      layer.textContent = '';
      Place.reset();
      if (!State.enabled) return;

      // The popover renders rows by index and hands that index back. Dropping
      // a pin here without telling it left every row after the gap resolving
      // one position too far — clicking ✕ on #3 deleted #2. UI may not call
      // APP, so it announces and BOOT decides who listens.
      const had = State.pins.length;
      State.pins = State.pins.filter((p) => document.contains(p.el));
      if (State.pins.length !== had) Render.onPinsPruned?.();
      const pinned = new Set(State.pins.map((p) => p.el));

      // a tool may mark one pin as "still being chosen" — the renderer just asks
      let pendingIdx = -1;
      for (const t of Tools.active()) {
        const idx = t.pendingIndex?.call(t) ?? -1;
        if (idx >= 0) { pendingIdx = idx; break; }
      }

      // 1) outlines + pin numbers, styled by pin kind
      const pinInfo = State.pins.map((p, idx) => {
        const waiting = idx === pendingIdx;
        // class comes straight from the pin's kind — no tool ids in here
        const isTarget = State.removeMode && State.removeTarget === p;
        const isFlash = State.flashPins && State.flashPins.includes(p);
        const kindCls = ` ${p.kind}` + (waiting ? ' waiting' : '') +
                        (isTarget ? ' rmtarget' : '') + (isFlash ? ' flash' : '');
        const i = U.info(p.el);
        const box = document.createElement('div');
        box.className = 'dbgov-box dbgov-pinbox' + kindCls;
        Place.put(box, i.r.left, i.r.top, i.r.width, i.r.height);
        const n = document.createElement('div');
        n.className = 'dbgov-pin-num' + kindCls;
        n.textContent = waiting ? p.id + '…' : p.id;
        layer.append(box, n);
        /* A pin scrolled out of view used to have its number CLAMPED to the
           viewport edge, so two stranded chips ended up sitting on the page's
           own header reading as though they described it. The box tracks the
           true rect correctly; it is the clamp that lies. Off-screen pins are
           the pin list's job — it exists to reach exactly those. */
        // STRICTLY outside: an element touching an edge, or a degenerate 0x0
        // rect at the origin, is still somewhere you can look at.
        const onScreen = !(i.r.bottom < 0 || i.r.top > innerHeight ||
                           i.r.right < 0 || i.r.left > innerWidth);
        if (onScreen) {
          const nx = Math.max(2, i.r.left - 10), ny = Math.max(2, i.r.top - 10);
          Place.put(n, nx, ny);
          Place.claim(nx, ny, waiting ? 32 : 22, 22);
        } else {
          n.remove();
        }

        // remove mode: a ✕ chip on every pin, enlarged on the one under the cursor
        if (State.removeMode) {
          const rm = document.createElement('div');
          rm.className = 'dbgov-rm' + (isTarget ? ' target' : '');
          rm.textContent = '✕';
          layer.append(rm);
          const rx = Math.min(innerWidth - 20, Math.max(2, i.r.right - 9));
          const ry = Math.max(2, i.r.top - 9);
          Place.put(rm, rx, ry);
          Place.claim(rx, ry, 18, 18);
        }
        return { p, i };
      });

      const hoverLive = !State.removeMode && State.hoverEl &&
                        document.contains(State.hoverEl) && !pinned.has(State.hoverEl);
      if (hoverLive) {
        const i = U.info(State.hoverEl);
        const box = document.createElement('div');
        box.className = 'dbgov-box dbgov-hover';
        Place.put(box, i.r.left, i.r.top, i.r.width, i.r.height);
        layer.append(box);
      }

      // 2) let each active tool draw its own layer (lines, guides, ...)
      // `found` is that tool's own findings from the last sweep and nobody
      // else's — the sweep stamped them, so the renderer hands them over
      // without learning what any of them mean. Only ARMED tools draw: a
      // sweep is what gets checked, arming is what gets shown.
      const ctx = { layer, Place, State, U, found: [] };
      for (const t of Tools.active()) {
        ctx.found = (State.sweep && State.sweep.byTool[t.id]) || [];
        t.draw?.call(t, ctx);
      }

      // 3) pin badges — compact unless detail mode or that pin is hovered
      pinInfo.forEach(({ p, i }) => {
        // same reason as the number chip above: a badge clamped to the edge
        // describes an element nobody can see, next to elements it is not about
        if (i.r.bottom < 0 || i.r.top > innerHeight ||
            i.r.right < 0 || i.r.left > innerWidth) return;
        const full = State.detail || State.hoverEl === p.el;
        const html = Badges.build(i, !full);
        if (!html) return;
        const b = document.createElement('div');
        b.className = 'dbgov-badge';
        b.innerHTML = `<span class="rad">#${p.id}</span> · ${html}`;
        layer.append(b);
        Place.smart(b, i.r, { avoid: i.r });
      });

      // 4) hover badge last — slots into whatever space is left
      if (hoverLive) {
        const i = U.info(State.hoverEl);
        const html = Badges.build(i, false);
        if (html) {
          const b = document.createElement('div');
          b.className = 'dbgov-badge';
          b.innerHTML = html;
          layer.append(b);
          Place.smart(b, i.r, { avoid: i.r });
        }
      }

      Panel.setCount(State.pins.length);
    }

    return {
      now,
      onPinsPruned: null,
      schedule() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(now);
      },
    };
  })();

  // ─── src/app/report.js ─────────────────────────────────────────────────
  /* ======================================================================
    REPORT — also composed from active tools
     ====================================================================== */
  const Report = {
    text() {
      const active = Tools.active();
      const L = [
        `# UI debug report`,
        `url: ${location.href}`,
        `viewport: ${innerWidth}×${innerHeight} @ dpr ${devicePixelRatio}`,
        `tools: ${active.map((t) => t.id).join(', ') || 'none'}`,
        '',
      ];
      const found = [];
      State.pins.forEach((p) => {
        const i = U.info(p.el);
        L.push(`[#${p.id}] (${p.kind}) ${U.selectorOf(i.el)}`);
        for (const t of active) L.push(...(t.report?.call(t, i) || []));
        // same info, judged rather than described — rules only speak up when
        // something is wrong, so this is usually empty. Stamped by the same
        // helper the sweep uses, so a finding always knows its producer no
        // matter which path made it.
        found.push(...Sweep.collect(active, 'audit', i));
        L.push('');
      });
      for (const t of active) {
        const tail = t.reportTail?.call(t) || [];
        if (tail.length) L.push(...tail);
      }
      // A sweep already covered every element, pinned ones included, so it
      // replaces the per-pin collection rather than adding to it — counting
      // both would report the same problem twice.
      const list = State.sweep ? State.sweep.findings : found;
      // Its own section: per-pin lines carry no attribution, so loose finding
      // lines up there would be indistinguishable from a tool's description.
      const groups = Sweep.group(list);
      // A sweep that found nothing still prints its heading. "No findings"
      // over a stated scope is a result; an absent section is indistinguishable
      // from never having looked.
      if (State.sweep || groups.length) {
        // The panel calls these "N distinct problems · M occurrences"; this
        // said "findings (M)" for the same audit, so one number had two names
        // depending on where you read it.
        L.push('', `## findings — ${groups.length} problem${groups.length === 1 ? '' : 's'}` +
                   ` · ${list.length} occurrence${list.length === 1 ? '' : 's'}${Report.scope()}`);
        for (const g of groups) {
          // 'review' outranks the severity in the label: what matters first is
          // whether this is a verdict or the absence of one
          const tag = g.verdict === 'review' ? 'review' : g.severity;
          L.push(`[${tag}] ${g.rule}${g.n > 1 ? ` ×${g.n}` : ''}: ${g.message}`);
          L.push(`    ${U.selectorOf(g.el)}`);
        }
        if (!groups.length) L.push('(none)');

        // What each rule IS, as opposed to what any one finding measured —
        // once, at the end. Printed under every finding it made a real report
        // unreadable: ninety findings carrying the same three lines.
        const docs = new Map();
        for (const g of groups) {
          const d = Tools.byId(g.tool)?.rules?.[g.rule];
          if (d && !docs.has(g.rule)) docs.set(g.rule, d);
        }
        if (docs.size) {
          L.push('', '## rules');
          for (const [id, d] of docs) {
            L.push(id);
            if (d.help) L.push(`  ${d.help}`);
            if (d.why) L.push(`  ${d.why}`);
            if (d.docs) L.push(`  ${d.docs}`);
          }
        }
      }
      return L.join('\n');
    },
    /** What the findings above cover, so a zero among them can be read. */
    scope() {
      const s = State.sweep;
      if (!s) return ' · pinned elements only';
      return ` · whole page · ${s.rules} rule${s.rules === 1 ? '' : 's'}` +
             ` · ${s.elements} elements` +
             // the page could not show them all; this text can
             (Object.values(s.byTool).some((f) => f.length > CONFIG.MARK_LIMIT)
               ? ` · outlines capped at ${CONFIG.MARK_LIMIT} per rule` : '');
    },
    /**
     * Put text on the clipboard. Separate from copy() because it is not only
     * the report that ever wants this — a tool that picks something off the
     * page needs the same two-step, and a second copy of the fallback is a
     * second thing to get wrong.
     */
    async toClipboard(txt) {
      try {
        await navigator.clipboard.writeText(txt);
      } catch {
        // no clipboard permission, or an insecure origin
        const t = document.createElement('textarea');
        t.value = txt;
        document.body.append(t);
        t.select();
        document.execCommand('copy');
        t.remove();
      }
    },
    async copy() {
      await Report.toClipboard(Report.text());
      Panel.flash('✓');
    },
  };

  // ─── src/app/interactions.js ───────────────────────────────────────────
  /* ======================================================================
    INTERACTIONS
     ====================================================================== */
  const Interactions = {
    // is the user typing? then keys belong to the page, not to us
    typing(e) {
      const t = e.target;
      return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
    },

    // Is this pointer event ours to swallow? Alt is the page's escape hatch,
    // and the panel handles its own clicks.
    ours(e) {
      return State.enabled && !e.altKey && !root.contains(e.target);
    },

    /**
     * Offer an event to the armed tools before the overlay's own default.
     *
     * WHY: every hook until now was read-or-render — a tool could describe the
     * page and judge it, but nothing could act on it, so anything that changes
     * what you clicked had nowhere to live. This is the one place input enters,
     * so it is the one place that can hand it on, and it does so by hook: no
     * tool is named here and none ever will be.
     *
     * The first tool to say it consumed the event ends it. Two tools acting on
     * one click is a page doing two things nobody asked for, and a pin landing
     * underneath an edit is the same bug wearing the overlay's own clothes.
     */
    claimed(type, ev, el) {
      for (const t of Tools.withHook('intercept', true))
        if (t.intercept.call(t, { type, ev, el })) return true;
      return false;
    },

    // in remove mode only pins are targetable — pick the innermost one
    pinAt(x, y) {
      let best = null, bestArea = Infinity;
      for (const p of State.pins) {
        if (!document.contains(p.el)) continue;
        const r = p.el.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const area = r.width * r.height;
        if (area < bestArea) { best = p; bestArea = area; }
      }
      return best;
    },

    install(ctl) {
      addEventListener('keydown', (e) => {
        const H = CONFIG.HOTKEY;
        if (e.altKey === H.alt && e.shiftKey === H.shift && e.ctrlKey === H.ctrl && e.code === H.code) {
          e.preventDefault();
          ctl.togglePower();
          return;
        }
        if (e.code === CONFIG.REMOVE_KEY && State.enabled && !State.removeMode &&
            !e.ctrlKey && !e.metaKey && !e.altKey && !Interactions.typing(e)) {
          e.preventDefault();
          ctl.setRemoveMode(true);
          return;
        }
        /* Escape inside a FIELD is "abandon this edit", not "close things" —
           and typing() already says which those are (INPUT, TEXTAREA, SELECT,
           contenteditable), which covers every ⚙ control there is.
           `!root.contains(e.target)` used to guard it too, and that was wrong:
           clicking any bar button leaves focus on that button, inside root, so
           the guard swallowed Escape in the single most common path — open the
           panel with the mouse, press Escape, nothing happens. It silenced
           exactly the gesture the KEYS legend advertises. */
        if (e.key === 'Escape' && State.enabled && !Interactions.typing(e)) {
          /* Escape closes the TOP LAYER, and never the session. It used to
             fall through to setPower(false) whenever nothing was pinned, so
             reading a page with the findings list open and no pins, one press
             took the panel, the audit and the session with it — for a key
             whose universal meaning is "close this". Power stays on the button
             and on Alt+Shift+D, both of which say so. */
          if (State.removeMode) ctl.setRemoveMode(false);
          else if (Panel.isListOpen()) Panel.toggleList(false);
          else if (State.pins.length) ctl.clearPins();
        }
      }, true);

      addEventListener('keyup', (e) => {
        if (e.code === CONFIG.REMOVE_KEY && State.removeMode) ctl.setRemoveMode(false);
      }, true);
      // releasing the key outside the page would otherwise strand us in remove mode
      addEventListener('blur', () => { if (State.removeMode) ctl.setRemoveMode(false); });

      addEventListener('mousemove', (e) => {
        if (!State.enabled) return;
        if (State.removeMode) {
          const p = Interactions.pinAt(e.clientX, e.clientY);
          if (p !== State.removeTarget) { State.removeTarget = p; Render.schedule(); }
          return;
        }
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || root.contains(el)) {
          if (State.hoverEl) { State.hoverEl = null; Render.schedule(); }
          return;
        }
        if (el !== State.hoverEl) { State.hoverEl = el; Render.schedule(); }
      }, true);

      // Swallowing only the click is too late. The browser starts a text
      // selection on mousedown, and a shift-click extends whatever is already
      // selected — so measuring from one element to another also dragged a
      // selection across everything between them. The page's own focus and
      // drag handling starts there too, which is the other half of the same
      // symptom: the overlay's clicks were reaching the page underneath.
      for (const type of ['mousedown', 'mouseup', 'dblclick']) {
        addEventListener(type, (e) => {
          // primary button only: no other one starts a selection, and taking
          // them all would swallow the context menu with them
          if (e.button !== 0 || !Interactions.ours(e)) return;
          e.preventDefault();
          e.stopPropagation();
        }, true);
      }

      addEventListener('click', (e) => {
        if (!Interactions.ours(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (State.removeMode) {
          const p = Interactions.pinAt(e.clientX, e.clientY);
          if (p) ctl.removePin(p);
          return;
        }
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || root.contains(el)) return;
        if (Interactions.claimed('click', e, el)) return;
        /* A SHIFT pin exists to be grouped and measured. With no armed tool
           publishing groups there is nothing to group it, so it used to sit
           there numbered and lime — promising a measurement that could never
           arrive, which is what "it just counts 1, 2, 3, 4" was. Ask whether
           anyone is listening; if not, a shift-click is simply a pin.

           A capability question, not an id: whatever publishes groups tomorrow
           answers it without this file learning a name. */
        const grouped = e.shiftKey && Tools.withHook('groups', true).length > 0;
        ctl.togglePin(el, grouped ? CONFIG.PIN_KIND.SHIFT : CONFIG.PIN_KIND.PLAIN);
      }, true);

      addEventListener('scroll', Render.schedule, true);
      addEventListener('resize', Render.schedule);
    },
  };

  // ─── src/app/controller.js ─────────────────────────────────────────────
  /* ======================================================================
    CONTROLLER — the only glue
     ====================================================================== */
  const Controller = {
    setPower(v) {
      State.enabled = v;
      if (!v) State.hoverEl = null;
      // A selection the page already had would be extended by the first
      // shift-click instead of measured from, so start the session clean.
      if (v) { try { getSelection()?.removeAllRanges(); } catch {} }
      if (!v) State.sweep = null;   // the page moves on; a stale audit lies
      Panel.setSwept(!!State.sweep, 0);
      Panel.setOn(v);
      Render.schedule();
    },
    togglePower() { Controller.setPower(!State.enabled); },

    /**
     * Audit the whole page rather than the elements under the cursor. The
     * result is kept so the report and any findings surface read the same
     * pass — sweeping again per reader would give two different answers on a
     * page that moved in between.
     */
    sweep() {
      if (!State.enabled) return;
      State.sweep = Sweep.run();
      // the grouped count, not the raw one: "3" is a page with three problems,
      // "5000" is the same page with one of them on every row. It RESTS on the
      // button rather than flashing, so the bar keeps answering the question.
      Panel.setSwept(true, Sweep.group(State.sweep.findings).length);
      Panel.toggleList(true, 'findings');
      Render.schedule();   // the marks are new; nothing else would ask for them
    },

    /** Rows for whichever view the panel is showing. */
    rows(view) {
      const body = view === 'settings' ? Settings.rows()
        : Controller.toolOf(view) ? Settings.rowsFor(Controller.toolOf(view))
          : view === 'findings' ? Controller.findingRows() : Controller.pinList();
      // Only when there IS a body: List shows its empty state on rows.length
      // === 0, and a title alone would suppress the one sentence that explains
      // why the view is empty.
      if (!body.length) return body;
      const t = Controller.viewTitle(view, body);
      return t ? [t, ...body] : body;
    },

    /**
     * One popover shows three unrelated screens with no header, so nothing on
     * screen said what you were looking at — or that opening one destroyed the
     * last. It also labels the two numbers an audit produces: the ⌕ flash
     * counts distinct problems and the report counts occurrences, and neither
     * said which it was.
     */
    /** The tool a `tool:<id>` view names, or null. No id is written here — it
     *  arrives from the button that was clicked. */
    toolOf: (view) => (String(view || '').startsWith('tool:') ? view.slice(5) : null),

    viewTitle(view, body) {
      const owned = Controller.toolOf(view);
      if (owned) {
        const t = Tools.byId(owned);
        return t && { title: t.title.split(/[—·]/)[0].trim(),
                      detail: 'its own options — ⚙ has these and everyone else\'s' };
      }
      if (view === 'settings') return { title: 'Settings', detail: 'what each tool checks and shows' };
      if (view === 'pins') {
        const n = State.pins.length;
        return { title: 'Pins', detail: `${n} pinned element${n === 1 ? '' : 's'}` };
      }
      const s = State.sweep;
      if (!s) return { title: 'Findings', detail: 'no audit has run' };
      const groups = body.filter((r) => !r.heading && !r.title).length;
      return {
        title: 'Findings',
        detail: `${groups} distinct problem${groups === 1 ? '' : 's'} · ` +
                `${s.findings.length} occurrence${s.findings.length === 1 ? '' : 's'}`,
      };
    },

    /**
     * A row changed. Which row depends on the view showing, so this asks for
     * that view's rows — indexing settings by a number that came from the pin
     * list would write the wrong setting entirely.
     */
    changeRow(i, raw) {
      const row = Controller.rows(Panel.view())[i];
      if (!row) return;
      // a tool's own row carries its own handler; a settings row carries the
      // option it was built from
      if (row.onChange) {
        row.onChange(raw);
        Render.schedule();
        Controller.refreshList();
        return;
      }
      if (!row.opt) return;
      const v = Settings.fromControl(row, raw);
      if (v === null) { Controller.refreshList(); return; }   // put the field back
      Settings.apply(row, v);
      /* The last sweep was judged under the OLD setting — but only a setting
         that feeds a rule can have changed a verdict. Discarding the audit
         because somebody switched what Ctrl+click copies threw away the most
         expensive thing the tool does (~77% getComputedStyle over every
         element) for a preference no rule consults. `affects` already says
         which is which. */
      if (row.opt.affects === 'detect') { State.sweep = null; Panel.setSwept(false, 0); }
      Render.schedule();
      Controller.refreshList();
    },
    /** One row per distinct problem, worst first. No pin, so nothing to remove. */
    findingRows() {
      const rows = Sweep.group(State.sweep ? State.sweep.findings : []).map((g) => ({
        tag: (g.verdict === 'review' ? 'review' : g.severity) + (g.n > 1 ? ` ×${g.n}` : ''),
        label: g.message,
        // the leaf, not the whole path: a row has to be scannable, and the
        // full ancestor chain is in the copied report where there is room
        detail: U.selectorOf(g.el).split(' > ').pop(),
        accent: g.verdict === 'review' ? 'review' : g.severity,
        el: g.el,
      }));
      /* A cap nobody is told about reads as "this is everything on the page".
         Only say it when it actually bit: a rule that DRAWS and is armed and
         found more than it can paint. Asking per drawing tool rather than of
         the raw total keeps the message true — the limit is per rule, and a
         rule with no draw() paints nothing to cap. */
      const capped = State.sweep ? Tools.withHook('draw', true)
        .map((t) => (State.sweep.byTool[t.id] || []).length)
        .filter((n) => n > CONFIG.MARK_LIMIT) : [];
      if (capped.length) {
        rows.unshift({
          heading: `${Math.max(...capped)} found by one rule`,
          detail: `the page shows the first ${CONFIG.MARK_LIMIT} of each — this list is complete`,
        });
      }
      return rows;
    },
    /**
     * Three different silences, and they must not share a sentence. Nobody has
     * asked yet; nothing could ask, because no rule exists; or every rule ran
     * and had nothing to say. Only the third is good news.
     */
    emptyFor(view) {
      if (Controller.toolOf(view)) return 'This one has nothing to configure.';
      if (view === 'settings') return 'No tool has anything to configure.';
      if (view !== 'findings') return 'No pins yet — click to inspect, Shift+click to measure.';
      const s = State.sweep;
      if (!s) return 'Press ⌕ to audit the page.';
      if (!s.rules) return 'No rules are installed, so nothing was checked.';
      return `No findings — ${s.rules} rule${s.rules === 1 ? '' : 's'} ` +
             `over ${s.elements} elements.`;
    },

    toggleTool(id) {
      if (!Tools.byId(id)) return;
      State.tools.has(id) ? State.tools.delete(id) : State.tools.add(id);
      Panel.setTool(id, State.tools.has(id));
      Store.set(CONFIG.TOOLS_KEY, JSON.stringify([...State.tools]));
      Render.schedule();
      Controller.refreshList();
    },
    /**
     * Which tools are armed. A saved set wins; failing that, each tool decides
     * for itself with `startsOn`. Ids only ever come from the registry or from
     * something the registry already vouched for, so no core file spells one.
     */
    loadTools() {
      const registered = TOOLS.map((t) => t.id);
      let ids = TOOLS.filter((t) => t.startsOn).map((t) => t.id);
      let seen = null;
      try {
        const s = JSON.parse(Store.get(CONFIG.SEEN_KEY) || 'null');
        if (Array.isArray(s)) seen = s;
      } catch {}
      try {
        const saved = JSON.parse(Store.get(CONFIG.TOOLS_KEY) || 'null');
        if (Array.isArray(saved)) {
          /* A saved set answers for the tools that existed when it was
             written. Treating it as the whole answer meant a capability
             shipped later arrived switched off and unmentioned — under an
             update model whose entire promise is that nothing needs doing.
             So a tool this install has never met gets its own say; one it has
             met keeps whatever the user decided, including "off". */
          const known = seen || registered;   // first run after this shipped: nothing is new
          ids = saved.filter((id) => Tools.byId(id));
          for (const t of TOOLS) if (t.startsOn && !known.includes(t.id)) ids.push(t.id);
        }
      } catch {}
      Store.set(CONFIG.SEEN_KEY, JSON.stringify(registered));
      State.tools = new Set(ids.filter((id) => Tools.byId(id)));
      TOOLS.forEach((t) => Panel.setTool(t.id, State.tools.has(t.id)));
    },

    /**
     * Every path that adds or removes a pin ends here.
     *
     * A pin's NUMBER is stable while it exists: removing #2 must not renumber
     * #3, or a screenshot taken a moment earlier stops matching the report
     * beside it. But once nothing is pinned there is no numbering left to be
     * stable about, and the counter kept climbing — pin, unpin, pin and you
     * were looking at "#9" beside a count chip reading 1, a number that
     * referred to nothing and could not be read off a screenshot.
     */
    pinsChanged() {
      Render.schedule();
      Controller.refreshList();
    },

    /**
     * The number a new pin gets: the SMALLEST one not currently in use.
     *
     * It was a counter that only climbed, so four pins on the page could read
     * #1 #2 #6 #9 — numbers with no relation to what you were looking at, on a
     * tool whose point is reading values off a screenshot. Resetting it when
     * the list emptied fixed only the trivial case; unpin and re-pin with
     * anything else still pinned and it kept going.
     *
     * Derived from the live pins rather than stored, so there is no counter
     * left to drift. Existing pins keep their numbers — renumbering #3 to #2
     * because #1 went away would break the screenshot you took a second ago —
     * and the gap that leaves is exactly what the next pin fills.
     */
    nextPinId() {
      const taken = new Set(State.pins.map((p) => p.id));
      let n = 1;
      while (taken.has(n)) n++;
      return n;
    },

    /** The renderer dropped pins whose element left the page; it is mid-frame,
     *  so this must not ask for another one. */
    pinsPruned() {
      Controller.refreshList();
    },

    // kind: CONFIG.PIN_KIND.PLAIN → inspect only, no measuring
    //       CONFIG.PIN_KIND.SHIFT → joins the pairing queue and draws lines
    togglePin(el, kind = CONFIG.PIN_KIND.PLAIN) {
      const i = State.pins.findIndex((p) => p.el === el);
      if (i >= 0) {
        // same modifier → unpin; different modifier → switch this pin's role
        if (State.pins[i].kind === kind) State.pins.splice(i, 1);
        else State.pins[i].kind = kind;
      } else {
        State.pins.push({ el, id: Controller.nextPinId(), kind });
      }
      Controller.pinsChanged();
    },
    setRemoveMode(v) {
      State.removeMode = v;
      if (!v) State.removeTarget = null;
      if (v) State.hoverEl = null;
      Panel.setRemoveMode(v);
      Render.schedule();
    },
    removePin(pin) {
      const i = State.pins.indexOf(pin);
      if (i >= 0) State.pins.splice(i, 1);
      State.removeTarget = null;
      Controller.pinsChanged();
    },
    /**
     * The panel's pin list. Active tools claim the pins they own (measure
     * claims its pairs); whatever is left over gets a plain row. The panel
     * itself never learns what a "pair" is.
     */
    pinList() {
      const rows = [];
      const claimed = new Set();
      for (const t of Tools.active()) {
        for (const row of (t.listRows?.call(t) || [])) {
          row.pins.forEach((p) => claimed.add(p));
          rows.push(row);
        }
      }
      for (const p of State.pins) {
        if (claimed.has(p)) continue;
        if (!document.contains(p.el)) continue;
        const r = p.el.getBoundingClientRect();
        rows.push({ tag: `#${p.id}`, label: U.labelOf(p.el),
                    detail: `${Math.round(r.width)}×${Math.round(r.height)}`, pins: [p] });
      }
      const first = (row) => Math.min(...row.pins.map((p) => p.id));
      // every row here owns pins, so every row here can drop them — the panel
      // renders a ✕ only where the row says one belongs
      rows.forEach((r) => { r.removable = true; });
      return rows.sort((a, b) => first(a) - first(b));
    },
    refreshList() {
      if (!Panel.isListOpen()) return;
      const view = Panel.view();
      Panel.setList(Controller.rows(view), Controller.emptyFor(view));
    },
    revealRow(i) {
      const row = Controller.rows(Panel.view())[i];
      if (!row) return;
      // A finding has no pin, so clicking one pins the element on the way to
      // it. That is the useful move anyway: the badge, the measurements and
      // the copied report all pick it up from there.
      let pins = row.pins;
      if (!pins) {
        if (!row.el || !document.contains(row.el)) return;
        const had = State.pins.find((p) => p.el === row.el);
        if (!had) Controller.togglePin(row.el, CONFIG.PIN_KIND.PLAIN);
        pins = [State.pins.find((p) => p.el === row.el)];
      }
      const el = pins[0].el;
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      State.flashPins = pins;
      Render.schedule();
      clearTimeout(Controller._flash);
      Controller._flash = setTimeout(() => { State.flashPins = null; Render.schedule(); }, 900);
    },
    removeRow(i) {
      /* rows(view), not pinList(): the panel hands back the index of what it
         RENDERED, and that array now carries a title row. Indexing a different
         list is how ✕ removed the wrong pin before. */
      const row = Controller.rows(Panel.view())[i];
      if (!row || !row.pins) return;
      if (!row) return;
      row.pins.forEach((p) => {
        const k = State.pins.indexOf(p);
        if (k >= 0) State.pins.splice(k, 1);
      });
      Controller.pinsChanged();
    },
    /**
     * Clears everything the overlay has put ON the page — pins and the audit's
     * outlines. It used to clear pins only, so an audit's 200 outlines had no
     * exit at all: the ⌕ flash expired, the bar looked idle, and the page
     * stayed covered with no control that admitted it.
     */
    clearPins() {
      State.pins = [];
      State.sweep = null;
      Panel.setSwept(false, 0);
      Controller.pinsChanged();
    },
    toggleDetail() {
      State.detail = !State.detail;
      Panel.setDetail(State.detail);
      Render.schedule();
    },
  };

  // ─── src/app/settings.js ───────────────────────────────────────────────
  /* ======================================================================
    SETTINGS — the ⚙ view, and what a tool's options mean

        Split out of CONTROLLER, which had grown two jobs: wiring the modules
        together, and being the whole of the settings system. This is the
        second one. CONTROLLER still owns the dispatch — which view is showing,
        which row changed — because that is glue and glue is its job.

        Nothing here knows what any option MEANS. The tool named it, gave it
        its choices and supplied the default; this turns that into rows, and
        turns whatever the panel's widget produced back into the tool's own
        value.
     ====================================================================== */
  const Settings = {
    carried: {},   // saved values whose owner this build does not know
    /**
     * ONE row builder, so the two doors into these settings cannot drift.
     * ⚙ shows every row grouped by what it changes; right-clicking a tool
     * shows that tool's subset. The second is a FILTER of the first, never a
     * copy — same options() call, same control, same value.
     */
    row(t, o) {
      return {
        tag: t.icon,
        label: o.label,
        control: Settings.controlFor(o, Tools.setting(t, o.key)),
        /* A tool's own option does nothing while that tool is disarmed —
           stored and waiting, not live. Hiding the row would be wrong, since
           the value applies the moment you arm it; looking active was the
           confusion, so it is dimmed. A SUBJECT has no armed state: its
           settings feed the sweep, which runs every rule either way. */
        inert: Tools.all.includes(t) && !State.tools.has(t.id),
        tool: t, opt: o,
      };
    },

    /**
     * This one tool's rows — the per-tool door.
     *
     * INCLUDING the subjects it consults. "Grid step" is obviously grid's
     * setting to anyone using it; that it is owned by the `scale` subject so
     * the lens and the rule cannot disagree about it is an internal matter,
     * and right-clicking ▦ to be told "nothing to configure" was the panel
     * lying about the most configurable tool it has.
     *
     * The tool declares what it consults with `uses:`, which is a dependency
     * it already has — grid literally calls Scale.off(). A subject is not a
     * tool, so this is not one tool naming another.
     */
    rowsFor(id) {
      const t = Tools.byId(id);
      if (!t) return [];
      return [t, ...(t.uses || [])]
        .filter((o) => o.options)
        .flatMap((o) => o.options.call(o).map((opt) => Settings.row(o, opt)));
    },

    /**
     * One row per option, under a heading for what that option CHANGES.
     *
     * Grouped by category, not by owning tool. Ordered by filename, the list
     * read as one flat run of six unrelated knobs: how clicks pair up sat next
     * to a WCAG threshold sat next to what lands on the clipboard, and nothing
     * said they were different kinds of thing. The tool's icon still labels
     * every row, so which tool owns what is not lost — it is just no longer
     * the only structure on offer.
     *
     * An empty category prints no heading. A tool that adds the first ACT
     * option makes that section appear, and nothing here changes.
     */
    rows() {
      const out = [];
      for (const r of ROLES) {
        const rows = [];
        for (const t of Tools.settingOwners()) {
          for (const o of t.options.call(t)) {
            if (o.affects !== r.key) continue;
            rows.push({
              tag: t.icon,
              label: o.label,
              control: Settings.controlFor(o, Tools.setting(t, o.key)),
              /* A tool's own option does nothing while that tool is disarmed —
                 stored and waiting, not live. Hiding the row would be wrong,
                 since the value applies the moment you arm it; looking active
                 was the confusion, so it is dimmed. A SUBJECT has no armed
                 state: its settings feed the sweep, which runs every rule
                 either way, so those are never inert. */
              inert: Tools.all.includes(t) && !State.tools.has(t.id),
              tool: t, opt: o,
            });
          }
        }
        if (!rows.length) continue;
        out.push({ heading: r.label, detail: r.note });
        out.push(...rows);
      }
      const keys = Settings.gestureRows();
      if (keys.length) {
        out.push({ heading: 'Keys', detail: 'the parts of this that are not buttons' });
        out.push(...keys);
      }
      return out;
    },

    /**
     * THE GESTURES. Three of them — Alt+click, the remove key, Escape — existed
     * nowhere in the running UI at all: a user who had not read the source
     * could not find them, which for Alt+click meant the pass-through everyone
     * asks for looked like a missing feature.
     *
     * Key NAMES come from CONFIG so they cannot drift from what is bound, and a
     * tool that claims a gesture of its own declares it, so nothing central has
     * to keep a list of what the tools do.
     */
    gestureRows() {
      const H = CONFIG.HOTKEY;
      const hot = [H.ctrl && 'Ctrl', H.alt && 'Alt', H.shift && 'Shift',
                   H.code.replace('Key', '')].filter(Boolean).join('+');
      const rows = [
        ['Click', 'pin an element'],
        ['Shift+click', 'pin it for measuring'],
        ['Alt+click', 'let the click through to the page'],
        [`Hold ${CONFIG.REMOVE_KEY.replace('Key', '')}`, 'show ✕ on every pin'],
        ['Esc', 'close the panel, then the pins'],
        ['Right-click a tool', 'its own options, without the others'],
        [hot, 'power on and off'],
      ];
      for (const t of Tools.withHook('gestures'))
        for (const g of t.gestures.call(t) || []) rows.push([g.keys, g.does]);
      return rows.map(([keys, does]) => ({ tag: keys, label: does, detail: '' }));
    },

    /**
     * How one option wants drawing. An option with `values` is a choice; the
     * two typed kinds are for the settings a list cannot express — a threshold
     * somebody has to type, a thing that is simply on or off.
     */
    controlFor(o, cur) {
      if (o.type === 'number') {
        return { kind: 'number', value: String(cur), suffix: o.suffix || '',
                 min: o.min, max: o.max, step: o.step };
      }
      if (o.type === 'toggle') return { kind: 'toggle', on: !!cur };
      // A default the tool does not list among its own choices would show as
      // choice 0 while the rule went on using something else — a picker
      // quietly disagreeing with the thing it claims to control. Carry the
      // live value as a choice instead, so what is in force is always on
      // screen and always selectable.
      const values = o.values.includes(cur) ? o.values : [cur, ...o.values];
      return { kind: 'choice', values,
               choices: values.map((v) => `${v}${o.suffix || ''}`),
               selected: values.indexOf(cur) };
    },

    /** Is `v` something this option could actually be set to? */
    valid(o, v) {
      if (v === undefined || v === null) return false;
      if (o.type === 'number') {
        return typeof v === 'number' && Number.isFinite(v) &&
               v >= (o.min ?? -Infinity) && v <= (o.max ?? Infinity);
      }
      if (o.type === 'toggle') return typeof v === 'boolean';
      return o.values.includes(v);
    },

    /**
     * Whatever the panel's widget produced, turned back into the option's own
     * value. Returns null for anything that is not a legal setting — a number
     * field accepts empty and "e", and neither may reach a rule.
     */
    fromControl(row, raw) {
      const o = row.opt;
      if (o.type === 'number') {
        const n = Number(raw);
        if (raw === '' || !Number.isFinite(n)) return null;
        // clamp rather than reject: the input's own min/max are advisory, and
        // a typed 5000 should land on the ceiling, not silently do nothing
        return Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, n));
      }
      if (o.type === 'toggle') return !!raw;
      const v = row.control.values[raw];
      return v === undefined ? null : v;
    },

    /** Write one option through, and persist the lot. */
    apply(row, v) {
      (State.settings[row.tool.id] ||= {})[row.opt.key] = v;
      Store.set(CONFIG.SETTINGS_KEY, JSON.stringify({ ...Settings.carried, ...State.settings }));
    },

    /**
     * Every option's default comes from the tool, and a saved value only
     * overrides it if the tool still offers it. Resolved once, here, so that
     * Tools.setting() stays a lookup: grid asks for its step once per number
     * on a page that has thousands of them.
     */
    load() {
      let saved = {};
      try { saved = JSON.parse(Store.get(CONFIG.SETTINGS_KEY) || '{}') || {}; } catch {}
      const out = {};
      for (const t of Tools.settingOwners()) {
        // An owner may say what it used to be called. Moving `step` out of the
        // grid tool and into the scale subject renamed the key it is stored
        // under, and without this every user who had chosen an 8px grid or AAA
        // contrast was silently returned to the defaults on upgrade — the same
        // reset Store's localStorage adoption exists to prevent, arriving by a
        // different door. The owner declares its own former name; no core file
        // holds a list of what anything used to be.
        const prev = saved[t.id] || (t.was && saved[t.was]) || null;
        out[t.id] = {};
        for (const o of t.options.call(t)) {
          const was = prev?.[o.key];
          out[t.id][o.key] = Settings.valid(o, was) ? was : o.def;
        }
      }
      /* Anything saved under an id this build does not register — a renamed
         owner, a removed tool, a downgrade — is kept aside and written back
         untouched. Rebuilding the blob from the registered owners alone
         destroyed it on the next unrelated change, so no later version could
         migrate what an earlier one had stored. */
      Settings.carried = {};
      for (const id of Object.keys(saved)) if (!(id in out)) Settings.carried[id] = saved[id];
      State.settings = out;
    },
  };

  // ─── src/app/sweep.js ──────────────────────────────────────────────────
  /* ======================================================================
    SWEEP — run the rules over the whole page instead of one element
     ====================================================================== */
  const Sweep = {
    /**
     * One read-only pass. Rules only speak when something is wrong, so what
     * comes back is a list of problems, not a list of elements.
     *
     * The overlay's root is appended to documentElement, so walking body's
     * subtree already excludes it — no per-element containment check.
     *
     * EVERY tool that can judge runs, armed or not. Arming decides what is
     * drawn on screen and nothing else. Tying the two together meant one
     * control carried two meanings, and the failure was silent in the worst
     * direction: with the only rule disarmed, a page full of problems audited
     * clean. You can always narrow a list of findings; you can never find
     * what was not checked.
     */
    /**
     * Call one hook across some tools and stamp the producer onto whatever
     * comes back, so no rule has to name itself and no consumer has to guess.
     * It is what lets draw() be handed only its own findings — and the report
     * look up the rule's own documentation.
     */
    collect(tools, hook, arg) {
      const out = [];
      for (const t of tools) {
        const f = t[hook]?.call(t, arg);
        if (!f || !f.length) continue;
        for (const one of f) one.tool = t.id;
        out.push(...f);
      }
      return out;
    },

    run() {
      const perEl = Tools.withHook('audit');        // not `armed` — see above
      const perPage = Tools.withHook('auditPage');
      const all = [...new Set([...perEl, ...perPage])];
      // byTool is built here, once, rather than filtered per frame by the
      // renderer: a page can return thousands of findings and draw() runs at
      // 60fps.
      const result = { findings: [], rules: all.length, elements: 0, byTool: {} };
      if (!all.length || !document.body) return result;
      for (const t of all) result.byTool[t.id] = [];

      // Only gathered when a page-level rule actually exists. Holding every
      // element's info costs real memory on a large page, and a page with no
      // relational rule should not pay for one.
      const seen = perPage.length ? [] : null;

      for (const el of document.body.querySelectorAll('*')) {
        // One getComputedStyle per element, reused as the gate AND handed to
        // the rules, so nobody reads it twice. It is the dominant cost of the
        // pass — a rule that needs geometry pays for it lazily, on request.
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        result.elements++;
        const i = U.info(el, cs);
        if (seen) seen.push(i);
        for (const f of Sweep.collect(perEl, 'audit', i)) {
          result.findings.push(f);
          result.byTool[f.tool].push(f);
        }
      }

      // Then the questions no single element can answer: a duplicate id, a
      // spacing scale nobody kept to, two things that only conflict with each
      // other. audit(info) is blind to all of them by construction.
      for (const f of Sweep.collect(perPage, 'auditPage', seen || [])) {
        result.findings.push(f);
        result.byTool[f.tool].push(f);
      }
      return result;
    },

    /**
     * Collapse repeats, then rank worst-first. `key` says which findings are
     * the same problem; only the rule that produced them knows, so it supplies
     * it and this falls back to rule + message when it does not.
     *
     * This is not cosmetic. A page can hand back thousands of findings that
     * are one problem repeated — a nav of identical links, a table of
     * identical cells — and a list nobody can read is a list nobody uses.
     */
    group(findings) {
      const by = new Map();
      findings.forEach((f, seq) => {
        const k = f.key || `${f.rule}|${f.message}`;
        const g = by.get(k);
        if (g) { g.n++; return; }
        by.set(k, { ...f, n: 1, seq });
      });
      // Anything measured outranks anything merely to be looked at, whatever
      // its severity: a finding you can act on beats one you have to go and
      // check by eye. Within each, worst first, then discovery order.
      const said = (g) => (g.verdict === 'review' ? 0 : 1);
      const rank = (g) => CONFIG.SEVERITY[g.severity] ?? 0;
      return [...by.values()].sort((a, b) =>
        said(b) - said(a) || rank(b) - rank(a) || a.seq - b.seq);
    },
  };

  // ─── src/boot.js ───────────────────────────────────────────────────────

  /* ======================================================================
    BOOT — wire the modules together and start
     ====================================================================== */
  Panel.onToggle = Controller.togglePower;
  Panel.onTool = Controller.toggleTool;
  Panel.onDetail = Controller.toggleDetail;
  Panel.onCopy = Report.copy;
  Panel.onSweep = Controller.sweep;
  Panel.onClear = Controller.clearPins;
  Panel.onListOpen = (view) =>
    Panel.setList(Controller.rows(view), Controller.emptyFor(view));
  Panel.onRowActivate = Controller.revealRow;
  Panel.onRowRemove = Controller.removeRow;
  Panel.onRowChange = Controller.changeRow;

  // before loadTools: a tool's options decide what its rules do, and arming
  // one immediately schedules a render that asks
  // the page can remove a pinned element at any time; the list must not go on
  // showing rows that no longer index into anything
  Render.onPinsPruned = Controller.pinsPruned;

  Settings.load();
  Controller.loadTools();
  Interactions.install(Controller);
  Controller.setPower(false);
})();
