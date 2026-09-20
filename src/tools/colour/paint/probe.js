import { Colour } from '../../../subjects/colour.js';
import { U } from '../../../core/utils.js';
import { radii, inRounded, padBox, padRadii, sideAt, shadowAt } from './shape.js';

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

export const Probe = {
  at: null,        // { px, py } in page coordinates, or null

  set(clientX, clientY) {
    Probe.at = { px: clientX + scrollX, py: clientY + scrollY };
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
   * An ancestor whose overflow removes this element AT THIS POINT, or null.
   *
   * This is the other half of the rounded-card case: the card clips, the child
   * paints, and in the corner the child is simply not there. Walking to the
   * root rather than stopping at the first clipper, because a page can nest
   * them and only the innermost one that actually excludes the point matters.
   */
  clipper(el, x, y) {
    for (let e = el.parentElement; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      /* NAMED positively, never as "not visible". An unknown or empty
         overflow is an absence of information, and reading it as a clip
         invents a verdict — the test caught exactly that, reporting a card
         as clipped away by <html>. These are the values that actually
         establish a clipping box. */
      const clips = /\b(hidden|clip|auto|scroll|overlay)\b/.test(cs.overflow || '') ||
                    (cs.clipPath && cs.clipPath !== 'none');
      if (!clips) continue;
      const r = e.getBoundingClientRect();
      const bw = { t: parseFloat(cs.borderTopWidth) || 0, r: parseFloat(cs.borderRightWidth) || 0,
                   b: parseFloat(cs.borderBottomWidth) || 0, l: parseFloat(cs.borderLeftWidth) || 0 };
      const pb = padBox(r, bw);
      const pr = padRadii(radii(cs, r.width, r.height), bw);
      // clip-path is arbitrary geometry this cannot evaluate; say so rather
      // than claim the point survived it
      if (cs.clipPath && cs.clipPath !== 'none')
        return { el: e, sel: U.selectorOf(e), why: `clip-path: ${cs.clipPath}`, sure: false };
      if (!inRounded(x, y, pb, pr))
        return { el: e, sel: U.selectorOf(e), why: `overflow: ${cs.overflow}`, sure: true };
    }
    return null;
  },

  /** A pseudo-element that paints but is invisible to elementsFromPoint. */
  pseudo(el, which) {
    let cs = null;
    try { cs = getComputedStyle(el, which); } catch { return null; }
    if (!cs) return null;
    const content = cs.content;
    if (!content || content === 'none' || content === 'normal') return null;
    const bits = [];
    const bg = cs.backgroundColor;
    if (bg && bg !== 'transparent' && !/^rgba\(0, 0, 0, 0\)$/.test(bg)) bits.push(`bg ${bg}`);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') bits.push('background-image');
    if (cs.maskImage && cs.maskImage !== 'none') bits.push('mask');
    if (parseFloat(cs.borderTopWidth) || parseFloat(cs.borderLeftWidth)) bits.push('border');
    return bits.length ? { which, bits } : null;
  },

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
    let els = [];
    try { els = document.elementsFromPoint(x, y) || []; } catch { return EMPTY; }
    const page = els.filter(Probe.ofPage);
    const layers = page.map((el) => Probe.layer(el, x, y));
    return {
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
  },

  /**
   * WHICH ROW IS THE COLOUR YOU SEE.
   *
   * Painting runs bottom → top, so a fully opaque layer wipes out everything
   * painted before it — everything BELOW it in this list. The last opaque one
   * to paint (the smallest index here) is therefore the floor, and only the
   * layers above it can still change the answer. Obvious in a stack of three;
   * in a stack of twelve it is arithmetic the reader should not have to do.
   */
  base(layers) {
    let at = -1;
    const opaque = (L) => {
      if (!L.paints || L.bgImage) return false;
      const c = Colour.colour(L.colour);
      return !!c && (c.a == null || c.a >= 0.999);
    };
    for (let i = layers.length - 1; i >= 0; i--) if (opaque(layers[i])) at = i;
    const over = at < 0 ? 0 : layers.slice(0, at).filter((L) => {
      if (!L.paints) return false;
      const c = Colour.colour(L.colour);
      return !!c && (c.a == null || c.a > 0);
    }).length;
    return { at, over };
  },

  /**
   * ONE element, judged at one point. Split out because the badge asks it of
   * whatever you are pointing at — which may not be in the stack at all — and
   * two copies of this judgement is how a badge comes to disagree with the
   * report about the same pixel.
   */
  layer(el, x, y) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const bw = { t: parseFloat(cs.borderTopWidth) || 0, r: parseFloat(cs.borderRightWidth) || 0,
                   b: parseFloat(cs.borderBottomWidth) || 0, l: parseFloat(cs.borderLeftWidth) || 0 };
      const rad = radii(cs, r.width, r.height);
      const inShape = inRounded(x, y, r, rad);
      const clip = Probe.clipper(el, x, y);
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
        shadow: inShape ? null : shadowAt(x, y, r, cs),
        pseudo: [Probe.pseudo(el, '::before'), Probe.pseudo(el, '::after')].filter(Boolean),
        radius: U.radius(cs),
      };
  },

  /**
   * Fold the painting layers bottom → top. Returns the composite and every
   * reason it might be wrong — a reader who cannot see the reasons cannot
   * tell a computed answer from a guess.
   */
  composite(layers) {
    const doubts = [];
    // the canvas under a page is white; anything below the stack is not ours
    let out = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      if (!L.paints) continue;
      if (L.bgImage) doubts.push(`${L.sel} paints a background-image — its pixel here is unknown`);
      if (L.backdrop) doubts.push(`${L.sel} has backdrop-filter: ${L.backdrop} — the pixel here is FILTERED, not composited`);
      const c = Colour.colour(L.colour);
      if (!c) { doubts.push(`${L.sel} ${L.from} is a colour space this cannot read`); continue; }
      if (c.a === 0) continue;
      out = Colour.over(c, out);
    }
    return { colour: out, doubts };
  },
};
