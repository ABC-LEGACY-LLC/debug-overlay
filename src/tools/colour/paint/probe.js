import { Colour } from '../../../subjects/colour.js';
import { U } from '../../../core/utils.js';
import { radii, inRounded, sideAt, shadowAt } from './shape.js';
import { ancestry, clippedBy } from './ancestry.js';
import { pseudo } from './pseudo.js';

/**
 * WHO PAINTED THIS PIXEL — the question DevTools cannot answer.
 *
 * Inspect returns the TOPMOST element at a point, which is the right answer to
 * a different question. When a colour appears on screen and you need to know
 * which element produced it, the topmost element is very often not the one:
 * it may be transparent there, or rounded away from there, or clipped away by
 * an ancestor. This walks the whole stack and says, per layer, whether it
 * paints at that exact point and what it contributes.
 *
 * The probe point is stored in PAGE coordinates and converted back on every
 * read, so it stays on the same pixel of the same content when the page
 * scrolls — the point you chose, not the point on the glass.
 */
const EMPTY = { layers: [], dropped: 0, hosts: [], frames: [] };
/** How long a walk stands while the pointer holds still. Short, because the
 *  page can move under a still cursor; long enough that a motionless frame
 *  costs nothing, which is the whole point. */
const CACHE_MS = 250;

/** A colour's alpha, or null when the colour space cannot be read. Unreadable
 *  is not zero: one is an absence of information, the other is a fact. */
const alphaOf = (v) => {
  const c = Colour.colour(v);
  return c ? (c.a == null ? 1 : c.a) : null;
};
/** This element's OWN opacity, when it sets one below 1. */
function ownFade(cs, el) {
  const v = parseFloat(cs.opacity);
  return Number.isFinite(v) && v < 1 ? { el, sel: U.selectorOf(el), v } : null;
}

export const Probe = {
  at: null,        // { px, py } in page coordinates, or null
  _cache: null,    // the last walk, keyed by the point it answered for

  set(clientX, clientY) {
    Probe.at = { px: clientX + scrollX, py: clientY + scrollY };
    Probe._cache = null;   // a new point is a new answer
  },
  /** The probe in viewport coordinates, or null. */
  point() {
    if (!Probe.at) return null;
    return { x: Probe.at.px - scrollX, y: Probe.at.py - scrollY };
  },

  /**
   * Everything the OVERLAY drew is not the page. Our root is appended to
   * documentElement rather than body — the same fact the sweep leans on to
   * exclude itself without a per-element check — so containment in body is
   * exactly the test, and no id is spelled here.
   */
  ofPage: (el) => !!(document.body && document.body.contains(el)),

  /**
   * EVERY element that clips this point away, found once.
   *
   * Whether a clipper excludes a point is a fact about the CLIPPER, not about
   * each layer beneath it — and asking it per layer walked the whole ancestor
   * chain once for every layer in the stack. On a 27-deep stack that is 800
   * getComputedStyle calls for one frame, and the frame runs on every pointer
   * move: ~48 000 style resolutions a second, which is a page that feels
   * stuck. Reading properties is the cost in this codebase; this counts them.
   *
   * Walked once per element, and a chain already seen ends the walk — if an
   * element has been tested, everything above it has too, because every walk
   * goes to the root.
   */
  /**
   * The stack at a viewport point, top → bottom, each layer judged.
   *
   * elementsFromPoint is hit-testing, so it already answers "is the point in
   * the box" — and answers nothing else. Everything below is the difference
   * between that and what is painted.
   */
  stack(x, y) { return Probe.walk(x, y).layers; },

  /**
   * The stack, AND EVERY WAY IT IS INCOMPLETE. A walk that stops silently is
   * the worst answer this tool can give: the reader takes a partial stack for
   * the whole one and reasons from a wrong picture. Same discipline the page
   * sweep already lives by — say what was not checked, or the count reads as
   * the whole page.
   */
  walk(x, y) {
    /* MEMOISED BY POINT. draw() runs on every frame and the renderer is
       driven by the pointer, so a still cursor was paying for a full stack
       walk sixty times a second to be told the same thing — the identical
       shape the perf tool was caught in, re-deriving a watch set that only
       changes on a pin. A short TTL rather than none, because the PAGE can
       move under a still pointer and a stack from a second ago would then be
       describing something that is no longer there. */
    const now = performance.now();
    const c = Probe._cache;
    if (c && c.x === x && c.y === y && now - c.at < CACHE_MS) return c.value;
    let els = [];
    try { els = document.elementsFromPoint(x, y) || []; } catch { return EMPTY; }
    const page = els.filter(Probe.ofPage);
    const anc = ancestry(x, y, page);
    const layers = page.map((el) => Probe.layer(el, x, y, anc));
    const value = {
      layers,
      // our own root hangs off documentElement, so anything dropped here is
      // the overlay's own furniture sitting over the pixel
      dropped: els.length - page.length,
      /* elementsFromPoint retargets to the HOST and never enters a shadow
         tree, so a stack that meets a web component stops there. An open root
         can at least be named; a CLOSED one cannot be detected at all, which
         is why the report says "at least". */
      hosts: layers.filter((L) => L.el.shadowRoot).map((L) => L.sel),
      // a frame is a whole document this walk cannot cross into, and a
      // cross-origin one could not be read even with permission
      frames: layers.filter((L) => /^(IFRAME|FRAME)$/.test(L.el.tagName)).map((L) => L.sel),
    };
    Probe._cache = { x, y, at: now, value };
    return value;
  },

  /**
   * ONE element, judged at one point. Split out because the badge asks it of
   * whatever you are pointing at — which may not be in the stack at all — and
   * two copies of this judgement is how a badge comes to disagree with the
   * report about the same pixel.
   */
  layer(el, x, y, anc) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const bw = { t: parseFloat(cs.borderTopWidth) || 0, r: parseFloat(cs.borderRightWidth) || 0,
                   b: parseFloat(cs.borderBottomWidth) || 0, l: parseFloat(cs.borderLeftWidth) || 0 };
      const rad = radii(cs, r.width, r.height);
      const inShape = inRounded(x, y, r, rad);
      const A = anc || ancestry(x, y, [el]);
      const clip = clippedBy(el, A.blockers);
      const side = inShape ? sideAt(x, y, r, bw) : null;
      const bgImage = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : null;
      const backdrop = [cs.backdropFilter, cs.webkitBackdropFilter]
        .find((v) => v && v !== 'none') || null;
      return {
        el, cs, sel: U.selectorOf(el),
        /* THE RECT, because a short selector is often not unique — one real
           app has dozens of div.flex.flex-1.min-h-0, and from the text alone
           there is no telling which one this is. Size and position tell them
           apart, and they are already measured here. */
        rect: { x: Math.round(r.left), y: Math.round(r.top),
                w: Math.round(r.width), h: Math.round(r.height) },
        paints: inShape && !clip,
        inBox: true,                      // elementsFromPoint said so
        inShape, clip, side,
        // the border wins where the point is in it: that is the colour the
        // pixel gets, and a card's ring is exactly where a wedge tends to be
        colour: side ? cs[`border${side[0].toUpperCase()}${side.slice(1)}Color`] : cs.backgroundColor,
        from: side ? `border-${side}-color` : 'background-color',
        bgImage, backdrop,
        /* THE ALPHA, resolved once. "PAINTS" over rgba(0,0,0,0) is a lie —
           a transparent layer contributes nothing, and calling it a painter
           puts it in the blend count too, where it makes the count mean
           nothing. null is a colour this cannot read, which is its own
           answer and not a zero. */
        alpha: alphaOf(side ? cs[`border${side[0].toUpperCase()}${side.slice(1)}Color`]
                            : cs.backgroundColor),
        /* The same class as backdrop-filter: things the fold cannot model,
           each of which makes the composite quietly wrong if left unsaid.
           `filter` is the element's OWN — it transforms everything the
           element paints, after the fact. */
        filter: cs.filter && cs.filter !== 'none' ? cs.filter : null,
        blend: cs.mixBlendMode && cs.mixBlendMode !== 'normal' ? cs.mixBlendMode : null,
        /* The NEAREST element that actually sets opacity — itself or an
           ancestor — rather than this layer's cumulative value. One faded
           wrapper made every layer beneath it report the same number, which
           is four lines for one fact: the same repetition Sweep.group exists
           to collapse. Named by its owner, it collapses to one. */
        /* The nearest element at or above this one that sets opacity below 1
           — itself, or the first fader above it. Opacity fades a whole
           subtree AS ONE GROUP, which is precisely what a colour-over-colour
           fold cannot express, so the element that SETS it is the fact worth
           reporting, once. */
        fader: ownFade(cs, el) || A.faders.find((f) => f.el.contains(el)) || null,
        shadow: inShape ? null : shadowAt(x, y, r, cs),
        pseudo: [pseudo(el, '::before'), pseudo(el, '::after')].filter(Boolean),
        radius: U.radius(cs),
      };
  },

};
