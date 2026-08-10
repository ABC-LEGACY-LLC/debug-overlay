// ==UserScript==
// @name         Debug Overlay — AI-friendly UI inspector
// @namespace    alonur.tools
// @version      3.8.6
// @description  Pluggable, screenshot-friendly UI debug overlay. Power switch plus independent tools (measure, grid, contrast). Pin elements, read exact values off the screenshot, copy a structured report for an AI chat.
// @author       Alonur
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/AlonurKomilov/debug-overlay-abc/main/dist/debug-overlay.meta.js
// @downloadURL  https://raw.githubusercontent.com/AlonurKomilov/debug-overlay-abc/main/dist/debug-overlay.user.js
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
                        Set CONFIG.MEASURE_MODE = 'chain' for the old behaviour.
  Click again ......... unpin (or click with the other modifier to switch the
                        pin between inspect and measure)
  Hold X .............. REMOVE mode: a red ✕ appears on every pin and only pins
                        are clickable — click one to delete it. Works even for
                        pins whose element is hard to hit again. Release to exit.
  Hold Alt ............ pass clicks through to the page (links keep working)
  Esc ................. clear pins (press again to power off)
  ≡ ................... compact / full badges
  ⧉ ................... copy structured report → paste into Claude with a screenshot
  Count chip .......... click the pin count to open the pin list: every pin and
                        measured pair in one place, even ones scrolled off
                        screen. Click a row to scroll to it and flash it; click
                        its ✕ to remove (a pair row removes both). Click the
                        chip again to close it before taking a screenshot.
  ✕ ................... clear pins
  Panel ............... drag by ⋮⋮; snaps to nearest edge; while OFF it tucks
                        away after ~2s leaving a 10px peek. Position remembered.

  POWER vs TOOLS
  --------------
  ⏻ is the master switch: it only decides whether the overlay is listening
  at all. WHAT gets measured is decided by the tools below it, each an
  independent toggle you can mix freely:

    📐 measure   sizes, radius, padding/margin, gap, font, pin distances
    ▦ grid       a lens: marks any number another tool prints that is off
                 the 4px grid (⚠)
    ◐ contrast   WCAG text contrast ratio + AA pass/fail

  Active tools are remembered per site.

  ARCHITECTURE — each numbered section is independent; edit one to change
  one behaviour. Sections appear in dependency order: nothing is used before
  it is defined.

    1. CONFIG        every tunable number/key
    2. STATE         single source of truth, plain data only
    3. UTILS         pure functions — no DOM writes, no State reads
    4. MEASURE       dimension-line geometry & drawing (tool-agnostic)
    5. TOOLS         ⭐ the plugin registry — add a debug mode here
    6. STYLES        all CSS in one template string
    7. DOM           root & drawing layer
    8. PANEL         control panel: UI, drag, snap, auto-tuck
    9. PLACEMENT     collision-free badge positioning
   10. BADGES        composes badge HTML from the ACTIVE tools
   11. RENDERER      draws one frame from STATE
   12. REPORT        structured text export, also composed from tools
   13. INTERACTIONS  page-level mouse & keyboard
   14. CONTROLLER    the only glue between modules

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
      id: 'zindex', kind: 'instrument',   // instrument | rule | lens
      icon: '⧉', title: 'Stacking — z-index & position',
      badge:   (i) => `<span class="sp">z ${i.cs.zIndex}</span>`,  // optional
      compact: (i) => null,                                       // optional
      report:  (i) => [`  z-index: ${i.cs.zIndex}`],              // optional
      draw:    (ctx) => {},                                       // optional
      reportTail: () => [],        // optional, summary lines after all pins
      pendingIndex: () => -1,      // optional, pin still being chosen
      // kind: 'lens' only —  annotate: (html, n, i) => html
    }

  The panel button, persistence, badge composition and report inclusion are
  all derived from the registry automatically.
*/

  // ─── src/00-banner.js ──────────────────────────────────────────────────
(function () {
  'use strict';

  if (window.top !== window.self) return; // skip iframes
  if (window.__DBG_OVERLAY__) return;
  window.__DBG_OVERLAY__ = true;

  // ─── src/01-config.js ──────────────────────────────────────────────────
  /* ======================================================================
     1. CONFIG
     ====================================================================== */
  const CONFIG = {
    Z: 2147483647,
    GRID: 4,                  // px grid the "grid" tool checks against
    PEEK: 10,                 // px of panel visible when tucked
    TUCK_DELAY: 2200,         // ms idle before the panel tucks away
    EDGE_MARGIN: 8,
    BADGE_MARGIN: 6,
    POS_KEY: '__dbgov_pos',
    TOOLS_KEY: '__dbgov_tools',
    DEFAULT_TOOLS: ['measure', 'grid'],
    // 'pairs' = every measurement takes two clicks (from → to) and the next
    //           click starts a fresh pair, so a pin is never reused silently.
    // 'chain' = old behaviour: each pin measures to the previous one.
    MEASURE_MODE: 'pairs',
    // A pin's "kind" names which tool consumes it. Defined once here so the
    // input layer, controller and renderer never hardcode a tool's id.
    PIN_KIND: { PLAIN: 'note', SHIFT: 'measure' },
    LANE_SEP: 16,             // px between parallel dimension lines
    HOTKEY: { alt: true, shift: true, ctrl: false, code: 'KeyD' },
    REMOVE_KEY: 'KeyX',       // hold to reveal ✕ on pins and click one to remove
    CONTRAST: { normal: 4.5, large: 3.0, largePx: 24, largeBoldPx: 18.66 },
  };

  // ─── src/02-state.js ───────────────────────────────────────────────────
  /* ======================================================================
     2. STATE
     ====================================================================== */
  const State = {
    enabled: false,      // master power
    detail: false,       // compact vs full badges
    tools: new Set(),    // active tool ids — filled by CONTROLLER on boot
    pins: [],            // [{ el, id, kind }] — kind ∈ CONFIG.PIN_KIND
    hoverEl: null,
    removeMode: false,   // true while the remove key is held
    removeTarget: null,  // pin object under the cursor in remove mode
    flashPins: null,     // pins briefly highlighted after "reveal" from the list
    pinSeq: 0,
  };

  // ─── src/03-utils.js ───────────────────────────────────────────────────
  /* ======================================================================
     3. UTILS — pure helpers
     ====================================================================== */
  const U = {
    px: (v) => Math.round(parseFloat(v) || 0),
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
    selectorOf(el) {
      const part = (e) => {
        if (e.id) return '#' + e.id;
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
        if (e.id) break;
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
    info: (el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }),
    gap(a, b) {
      const dx = Math.max(a.left - b.right, b.left - a.right, 0);
      const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
      return { dx: Math.round(dx), dy: Math.round(dy), d: Math.round(Math.hypot(dx, dy)) };
    },
    rectOf: (x, y, w, h) => ({ l: x, t: y, r: x + w, b: y + h }),
    overlap: (a, b) =>
      Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) *
      Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)),

    // --- colour helpers (used by the contrast tool)
    parseColor(str) {
      const m = String(str).match(/[\d.]+/g);
      if (!m || m.length < 3) return null;
      return { r: +m[0], g: +m[1], b: +m[2], a: m[3] !== undefined ? +m[3] : 1 };
    },
    effectiveBg(el) {
      let e = el;
      while (e && e.nodeType === 1) {
        const c = U.parseColor(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0.05) return c;
        e = e.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    },
    luminance({ r, g, b }) {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    },
    contrastRatio(fg, bg) {
      // flatten a translucent foreground onto the background first
      const a = fg.a == null ? 1 : fg.a;
      const mixed = {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a),
      };
      const l1 = U.luminance(mixed), l2 = U.luminance(bg);
      const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    },
    hasOwnText(el) {
      return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length);
    },
  };

  // ─── src/04-measure.js ─────────────────────────────────────────────────
  /* ======================================================================
     4. MEASURE ENGINE — how a distance between two rects is drawn.
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

  // ─── src/05-registry.js ────────────────────────────────────────────────
  /* ======================================================================
     5. TOOLS — ⭐ the plugin registry

        No tool ever names another tool. When one needs something another
        provides it asks the registry a question with no id in it.

        Every tool declares what it IS. The kind decides which of the two
        exclusive hooks it owns, and audit.js checks the declaration against
        the hooks the file actually implements:
          'instrument'  describes the element under the cursor
          'rule'        judges an element → audit(info)
          'lens'        decorates the numbers other tools print → annotate()

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
          css            → stylesheet text, read from EVERY registered tool
     ====================================================================== */
  const TOOLS = [];
  /** Register a debug tool. One call per file in src/tools/. */
  const defineTool = (t) => { TOOLS.push(t); return t; };

  const Tools = {
    all: TOOLS,
    byId: (id) => TOOLS.find((t) => t.id === id),
    active: () => TOOLS.filter((t) => State.tools.has(t.id)),
    ofKind: (kind) => TOOLS.filter((t) => t.kind === kind && State.tools.has(t.id)),

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
      const lenses = Tools.ofKind('lens');
      if (!lenses.length) return null;
      return (n) => lenses.reduce(
        (html, t) => t.annotate?.call(t, html, n, info) || html, `${n}`);
    },
  };

  // ─── src/tools/10-measure.js ───────────────────────────────────────────
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
      kind: 'instrument',
      icon: '📐',
      title: 'Measure — size, radius, spacing, font, pin distances',
      // this tool owns the geometry read-out and the pin distance lines
      badge(i) {
        const { el, r, cs } = i;
        // whatever decoration applies here — never "is <some named tool> on"
        const dec = Tools.annotator(i);
        const bits = [`<span class="sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`];
        const rad = U.radius(cs); if (rad) bits.push(`<span class="rad">r ${rad}</span>`);
        const p = U.four(cs, 'padding', dec); if (p) bits.push(`<span class="sp">p ${p.join(' ')}</span>`);
        const m = U.four(cs, 'margin', dec);  if (m) bits.push(`<span class="sp">m ${m.join(' ')}</span>`);
        if (cs.display.includes('flex') || cs.display.includes('grid')) {
          const g = U.px(cs.columnGap) || U.px(cs.gap);
          bits.push(`<span class="sp">${cs.display}${g ? ' gap ' + U.mark(g, dec) : ''}</span>`);
        }
        bits.push(`<span class="fnt">${U.px(cs.fontSize)}/${U.px(cs.lineHeight) || '–'} ${cs.fontWeight}</span>`);
        bits.push(`<span class="tag">${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}</span>`);
        return bits.join(' · ');
      },
      compact(i) {
        const { r, cs } = i;
        const dec = Tools.annotator(i);
        const bits = [`<span class="sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`];
        const rad = U.radius(cs); if (rad) bits.push(`<span class="rad">r ${rad}</span>`);
        // deliberately padding only — the compact badge never marked m or gap
        const p = U.four(cs, 'padding', dec); if (p) bits.push(`<span class="sp">p ${p.join(' ')}</span>`);
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
      // only Shift-clicked pins take part in measuring
      measurePins: () => State.pins.filter((p) => p.kind === CONFIG.PIN_KIND.SHIFT),

      // the single place pairing is decided — draw() and reportTail() share it
      pairs() {
        const mp = this.measurePins();
        const step = CONFIG.MEASURE_MODE === 'pairs' ? 2 : 1;
        const out = [];
        for (let k = 0; k + 1 < mp.length; k += step) out.push([mp[k], mp[k + 1]]);
        const pending = (CONFIG.MEASURE_MODE === 'pairs' && mp.length % 2)
          ? mp[mp.length - 1] : null;
        return { pairs: out, pending };
      },

      // hook: which pin (if any) is still waiting for its partner
      pendingIndex() {
        const { pending } = this.pairs();
        return pending ? State.pins.indexOf(pending) : -1;
      },
      // hook: rows this tool contributes to the panel's pin list
      listRows() {
        const { pairs, pending } = this.pairs();
        const rows = pairs.map(([A, B]) => {
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

      // dimension lines between paired pins
      draw({ layer, Place }) {
        Measure.resetLanes();
        for (const [A, B] of this.pairs().pairs) {
          Measure.dimension(layer, Place, A.el.getBoundingClientRect(),
                            B.el.getBoundingClientRect(), `#${A.id}→#${B.id}`);
        }
      },
      reportTail() {
        const { pairs, pending } = this.pairs();
        const out = pairs.map(([A, B]) => {
          const ra = A.el.getBoundingClientRect(), rb = B.el.getBoundingClientRect();
          const g = U.gap(ra, rb);
          const axis = Measure.axisOf(ra, rb);
          return `[#${A.id} → #${B.id}] ${axis.label}: ` +
                 (axis.kind === 'overlap' ? 'elements overlap'
                   : axis.kind === 'diagonal' ? `horizontal ${g.dx}px + vertical ${g.dy}px`
                   : `${axis.kind === 'vertical' ? g.dy : g.dx}px`);
        });
        if (pending) out.push(`[#${pending.id}] waiting for its pair`);
        return out;
      },
    });

  // ─── src/tools/20-grid.js ──────────────────────────────────────────────
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .warn{ color: #ffd54f; }
    `,
      id: 'grid',
      kind: 'lens',
      icon: '▦',
      title: `Grid — flag values off the ${CONFIG.GRID}px grid`,
      // 0 is never off the grid, or every padding:0 would light up
      _off: (n) => n !== 0 && n % CONFIG.GRID !== 0,

      // LENS hook: every number another tool prints comes through here first.
      // `html` is what earlier lenses made of it, so we wrap rather than
      // replace, and the ⚠ markup now sits next to the .warn rule for it.
      annotate(html, n) {
        return this._off(n) ? `<span class="warn">${html}⚠</span>` : html;
      },
      report({ r, cs }) {
        const pad = U.fourPlain(cs, 'padding'), mar = U.fourPlain(cs, 'margin');
        const bad = [];
        const check = (n, v) => { if (this._off(v)) bad.push(`${n}:${v}`); };
        check('w', Math.round(r.width)); check('h', Math.round(r.height));
        ['t', 'r', 'b', 'l'].forEach((k) => { check('pad-' + k, pad[k]); check('mar-' + k, mar[k]); });
        return bad.length ? [`  ⚠ off ${CONFIG.GRID}px grid: ${bad.join(', ')}`] : [];
      },
    });

  // ─── src/tools/30-contrast.js ──────────────────────────────────────────
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .ok  { color: #b5e853; }
    .dbgov-badge .bad { color: #ff6b6b; font-weight: 700; }
    `,
      id: 'contrast',
      kind: 'rule',
      icon: '◐',
      title: 'Contrast — WCAG text contrast ratio (AA)',
      _measure({ el, cs }) {
        if (!U.hasOwnText(el)) return null;
        const fg = U.parseColor(cs.color);
        if (!fg) return null;
        const bg = U.effectiveBg(el.parentElement || el);
        const ratio = U.contrastRatio(fg, bg);
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const isLarge = size >= CONFIG.CONTRAST.largePx ||
                        (bold && size >= CONFIG.CONTRAST.largeBoldPx);
        const need = isLarge ? CONFIG.CONTRAST.large : CONFIG.CONTRAST.normal;
        return { ratio, need, pass: ratio >= need, isLarge };
      },
      badge(i) {
        const c = this._measure(i);
        if (!c) return null;
        const cls = c.pass ? 'ok' : 'bad';
        return `<span class="${cls}">${c.ratio.toFixed(2)}:1 ${c.pass ? 'AA✓' : 'AA✗'}</span>`;
      },
      compact(i) {
        const c = this._measure(i);
        if (!c || c.pass) return null;   // stay quiet unless it actually fails
        return `<span class="bad">${c.ratio.toFixed(1)}:1 ✗</span>`;
      },
      report(i) {
        const c = this._measure(i);
        if (!c) return [];
        return [`  contrast: ${c.ratio.toFixed(2)}:1 vs required ${c.need} (${c.isLarge ? 'large' : 'normal'} text) → ${c.pass ? 'PASS' : 'FAIL'}`];
      },
    });

  // ─── src/06-styles.js ──────────────────────────────────────────────────
  /* ======================================================================
     6. STYLES
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
      background: rgba(88,196,255,.18); animation: dbgov-pulse .9s ease-out; }
    @keyframes dbgov-pulse {
      0% { box-shadow: 0 0 0 0 rgba(88,196,255,.55); }
      100% { box-shadow: 0 0 0 16px rgba(88,196,255,0); } }

    /* pin list popover — opened from the count chip, closed for screenshots */
    #__dbgov-list { position: fixed; display: none; pointer-events: auto;
      min-width: 250px; max-width: 380px; max-height: 60vh; overflow-y: auto;
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
    #__dbgov-list .rm { flex: none; width: 20px; height: 20px; border: 0; cursor: pointer;
      border-radius: 50%; background: #2c2c31; color: #ff8a8a; font-size: 11px;
      display: flex; align-items: center; justify-content: center; }
    #__dbgov-list .rm:hover { background: #ff5c5c; color: #fff; }
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
    #__dbgov-bar button.act.armed { background: #b5e853; color: #1a1a1a; }

    #__dbgov-bar.tucked { opacity: .4; }
    #__dbgov-bar.tucked:hover { opacity: 1; }
  `;

  // ─── src/07-dom.js ─────────────────────────────────────────────────────
  /* ======================================================================
     7. DOM
     ====================================================================== */
  const root = document.createElement('div');
  root.id = '__dbgov-root';
  root.setAttribute('aria-hidden', 'true');
  const style = document.createElement('style');
  // core stylesheet + whatever each registered tool brings with it
  style.textContent = CSS + TOOLS.map((t) => t.css || '').join('\n');
  const layer = document.createElement('div');
  root.append(style, layer);
  document.documentElement.append(root);

  // ─── src/08-panel.js ───────────────────────────────────────────────────
  /* ======================================================================
     8. PANEL — self-contained; talks out only via callbacks
     ====================================================================== */
  const Panel = (() => {
    const el = document.createElement('div');
    el.id = '__dbgov-bar';
    // tool buttons are generated from the registry — never hardcoded
    const toolButtons = TOOLS.map((t) =>
      `<button class="tool whenOn" data-tool="${t.id}" title="${t.title}">${t.icon}</button>`).join('');
    el.innerHTML = `
      <span class="grip" title="Drag to move — snaps to the nearest edge">⋮⋮</span>
      <button class="pwr" title="Power (Alt+Shift+D)">⏻</button>
      <span class="st" data-st>OFF</span>
      <hr class="sep whenOn">
      ${toolButtons}
      <hr class="sep whenOn">
      <button class="cnt whenOn" data-c title="Pinned elements — click for the list">0</button>
      <button class="act whenOn" data-detail title="Compact / full badges">≡</button>
      <button class="act whenOn" data-copy title="Copy report">⧉</button>
      <button class="act whenOn" data-clear title="Clear pins">✕</button>`;
    root.append(el);

    // ---- pin list popover (opened from the count chip) ------------------
    const listEl = document.createElement('div');
    listEl.id = '__dbgov-list';
    root.append(listEl);
    let listOpen = false;

    function placeList() {
      const r = el.getBoundingClientRect();
      const w = listEl.offsetWidth, h = listEl.offsetHeight;
      let x, y;
      if (side === 'left')       { x = r.right + 10; y = r.top; }
      else if (side === 'right') { x = r.left - w - 10; y = r.top; }
      else if (side === 'top')   { x = r.left - w / 2 + r.width / 2; y = r.bottom + 10; }
      else                       { x = r.left - w / 2 + r.width / 2; y = r.top - h - 10; }
      listEl.style.left = Math.max(6, Math.min(x, innerWidth - w - 6)) + 'px';
      listEl.style.top = Math.max(6, Math.min(y, innerHeight - h - 6)) + 'px';
    }

    const api = {
      el,
      onToggle: null, onTool: null, onDetail: null, onCopy: null, onClear: null,
      onListOpen: null, onRowActivate: null, onRowRemove: null,
      setOn(v) {
        el.classList.toggle('on', v);
        el.querySelector('[data-st]').textContent = v ? 'ON' : 'OFF';
        if (!v) api.toggleList(false);
        if (v) { clearTimeout(tuckTimer); untuck(); } else scheduleTuck();
      },
      setTool(id, v) {
        el.querySelector(`[data-tool="${id}"]`)?.classList.toggle('armed', v);
      },
      setDetail(v) { el.querySelector('[data-detail]').classList.toggle('armed', v); },
      setRemoveMode(v) {
        el.classList.toggle('removing', v);
        const st = el.querySelector('[data-st]');
        st.textContent = v ? 'DEL' : (api.isOn() ? 'ON' : 'OFF');
      },
      setCount(n) { el.querySelector('[data-c]').textContent = String(n); },

      isListOpen: () => listOpen,
      toggleList(v) {
        listOpen = v === undefined ? !listOpen : v;
        listEl.classList.toggle('open', listOpen);
        el.querySelector('[data-c]').classList.toggle('armed', listOpen);
        if (listOpen) { api.onListOpen?.(); placeList(); }
      },
      /** rows: [{ tag, label, detail, pins }] — built by CONTROLLER */
      setList(rows) {
        listEl.textContent = '';
        if (!rows.length) {
          const empty = document.createElement('div');
          empty.className = 'empty';
          empty.textContent = 'No pins yet — click to inspect, Shift+click to measure.';
          listEl.append(empty);
          placeList();
          return;
        }
        rows.forEach((row, i) => {
          const r = document.createElement('div');
          r.className = 'row';
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = row.tag;
          const lbl = document.createElement('span');
          lbl.className = 'lbl';
          lbl.textContent = row.label;           // textContent: page text is never HTML here
          const det = document.createElement('span');
          det.className = 'det';
          det.textContent = row.detail || '';
          const rm = document.createElement('button');
          rm.className = 'rm';
          rm.textContent = '✕';
          rm.title = 'Remove';
          rm.addEventListener('click', (e) => { e.stopPropagation(); api.onRowRemove?.(i); });
          r.addEventListener('click', () => api.onRowActivate?.(i));
          r.append(tag, lbl, det, rm);
          listEl.append(r);
        });
        placeList();
      },
      flash(msg) {
        const b = el.querySelector('[data-copy]');
        const old = b.textContent;
        b.textContent = msg;
        setTimeout(() => (b.textContent = old), 1200);
      },
      rect: () => el.getBoundingClientRect(),
      isOn: () => el.classList.contains('on'),
    };

    el.querySelector('.pwr').addEventListener('click', () => api.onToggle?.());
    el.querySelectorAll('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => api.onTool?.(b.dataset.tool)));
    el.querySelector('[data-c]').addEventListener('click', () => api.toggleList());
    el.querySelector('[data-detail]').addEventListener('click', () => api.onDetail?.());
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
      try { localStorage.setItem(CONFIG.POS_KEY, JSON.stringify({ x: p.x, y: p.y, side })); } catch {}
    }
    (function restore() {
      try {
        const s = JSON.parse(localStorage.getItem(CONFIG.POS_KEY) || 'null');
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
      if (api.isOn() || listOpen) { untuck(); return; }
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
      if (listOpen) placeList();
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      el.classList.remove('dragging');
      snap();
      scheduleTuck();
      if (listOpen) placeList();
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    addEventListener('resize', () => { snap(); if (listOpen) placeList(); });

    return api;
  })();

  // ─── src/09-placement.js ───────────────────────────────────────────────
  /* ======================================================================
     9. PLACEMENT — collision-free positioning
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

  // ─── src/10-badges.js ──────────────────────────────────────────────────
  /* ======================================================================
    10. BADGES — composed from ACTIVE tools only
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

  // ─── src/11-renderer.js ────────────────────────────────────────────────
  /* ======================================================================
    11. RENDERER
     ====================================================================== */
  const Render = (() => {
    let raf = 0;

    function now() {
      layer.textContent = '';
      Place.reset();
      if (!State.enabled) return;

      State.pins = State.pins.filter((p) => document.contains(p.el));
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
        const nx = Math.max(2, i.r.left - 10), ny = Math.max(2, i.r.top - 10);
        Place.put(n, nx, ny);
        Place.claim(nx, ny, waiting ? 32 : 22, 22);

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
      const ctx = { layer, Place, State, U };
      for (const t of Tools.active()) t.draw?.call(t, ctx);

      // 3) pin badges — compact unless detail mode or that pin is hovered
      pinInfo.forEach(({ p, i }) => {
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
      schedule() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(now);
      },
    };
  })();

  // ─── src/12-report.js ──────────────────────────────────────────────────
  /* ======================================================================
    12. REPORT — also composed from active tools
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
      State.pins.forEach((p) => {
        const i = U.info(p.el);
        L.push(`[#${p.id}] (${p.kind}) ${U.selectorOf(i.el)}`);
        for (const t of active) L.push(...(t.report?.call(t, i) || []));
        L.push('');
      });
      for (const t of active) {
        const tail = t.reportTail?.call(t) || [];
        if (tail.length) L.push(...tail);
      }
      return L.join('\n');
    },
    async copy() {
      const txt = Report.text();
      try {
        await navigator.clipboard.writeText(txt);
        Panel.flash('✓');
      } catch {
        const t = document.createElement('textarea');
        t.value = txt;
        document.body.append(t);
        t.select();
        document.execCommand('copy');
        t.remove();
        Panel.flash('✓');
      }
    },
  };

  // ─── src/13-interactions.js ────────────────────────────────────────────
  /* ======================================================================
    13. INTERACTIONS
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
        if (e.key === 'Escape' && State.enabled) {
          if (State.removeMode) ctl.setRemoveMode(false);
          else if (State.pins.length) ctl.clearPins();
          else ctl.setPower(false);
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
        ctl.togglePin(el, e.shiftKey ? CONFIG.PIN_KIND.SHIFT : CONFIG.PIN_KIND.PLAIN);
      }, true);

      addEventListener('scroll', Render.schedule, true);
      addEventListener('resize', Render.schedule);
    },
  };

  // ─── src/14-controller.js ──────────────────────────────────────────────
  /* ======================================================================
    14. CONTROLLER — the only glue
     ====================================================================== */
  const Controller = {
    setPower(v) {
      State.enabled = v;
      if (!v) State.hoverEl = null;
      // A selection the page already had would be extended by the first
      // shift-click instead of measured from, so start the session clean.
      if (v) { try { getSelection()?.removeAllRanges(); } catch {} }
      Panel.setOn(v);
      Render.schedule();
    },
    togglePower() { Controller.setPower(!State.enabled); },

    toggleTool(id) {
      if (!Tools.byId(id)) return;
      State.tools.has(id) ? State.tools.delete(id) : State.tools.add(id);
      Panel.setTool(id, State.tools.has(id));
      try { localStorage.setItem(CONFIG.TOOLS_KEY, JSON.stringify([...State.tools])); } catch {}
      Render.schedule();
      Controller.refreshList();
    },
    loadTools() {
      let ids = CONFIG.DEFAULT_TOOLS;
      try {
        const saved = JSON.parse(localStorage.getItem(CONFIG.TOOLS_KEY) || 'null');
        if (Array.isArray(saved)) ids = saved;
      } catch {}
      State.tools = new Set(ids.filter((id) => Tools.byId(id)));
      TOOLS.forEach((t) => Panel.setTool(t.id, State.tools.has(t.id)));
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
        State.pins.push({ el, id: ++State.pinSeq, kind });
      }
      Render.schedule();
      Controller.refreshList();
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
      Render.schedule();
      Controller.refreshList();
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
      return rows.sort((a, b) => first(a) - first(b));
    },
    refreshList() {
      if (Panel.isListOpen()) Panel.setList(Controller.pinList());
    },
    revealRow(i) {
      const row = Controller.pinList()[i];
      if (!row) return;
      const el = row.pins[0].el;
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      State.flashPins = row.pins;
      Render.schedule();
      clearTimeout(Controller._flash);
      Controller._flash = setTimeout(() => { State.flashPins = null; Render.schedule(); }, 900);
    },
    removeRow(i) {
      const row = Controller.pinList()[i];
      if (!row) return;
      row.pins.forEach((p) => {
        const k = State.pins.indexOf(p);
        if (k >= 0) State.pins.splice(k, 1);
      });
      Render.schedule();
      Controller.refreshList();
    },
    clearPins() {
      State.pins = [];
      State.pinSeq = 0;
      Render.schedule();
      Controller.refreshList();
    },
    toggleDetail() {
      State.detail = !State.detail;
      Panel.setDetail(State.detail);
      Render.schedule();
    },
  };

  // ─── src/99-boot.js ────────────────────────────────────────────────────

  /* ======================================================================
    15. BOOT — wire the modules together and start
     ====================================================================== */
  Panel.onToggle = Controller.togglePower;
  Panel.onTool = Controller.toggleTool;
  Panel.onDetail = Controller.toggleDetail;
  Panel.onCopy = Report.copy;
  Panel.onClear = Controller.clearPins;
  Panel.onListOpen = () => Panel.setList(Controller.pinList());
  Panel.onRowActivate = Controller.revealRow;
  Panel.onRowRemove = Controller.removeRow;

  Controller.loadTools();
  Interactions.install(Controller);
  Controller.setPower(false);
})();
