import { U } from '../../../core/utils.js';
import { radii, inRounded, padBox, padRadii } from './shape.js';

/**
 * WHAT THE ANCESTORS DO TO A POINT — clipping, and fading.
 *
 * Split out of probe.js when it passed the size advisory, and the seam was
 * the bug that had just been fixed: both of these are facts about an
 * ANCESTOR, not about each layer beneath it, and asking them per layer was
 * two O(n squared) walks over one chain. Keeping them in a file of their own
 * is what makes that hard to forget — a function here takes the whole stack
 * and answers once, and there is no per-layer entry point to reach for.
 */

export const blockers = (x, y, els) => ancestry(x, y, els).blockers;

/**
 * ONE walk up, BOTH facts. Clipping and opacity are each a property of an
 * ANCESTOR rather than of the layer beneath it, and each was being asked
 * per layer — two independent O(n²) walks over the same chain. Together
 * they were most of a frame's cost.
 */
export function ancestry(x, y, els) {
  const seen = new Set();
  const out = [];
  const faders = [];
  for (const el of els) {
    for (let e = el.parentElement; e && e.nodeType === 1; e = e.parentElement) {
      if (seen.has(e)) break;
      seen.add(e);
      const cs = getComputedStyle(e);
      const op = parseFloat(cs.opacity);
      if (Number.isFinite(op) && op < 1) faders.push({ el: e, sel: U.selectorOf(e), v: op });
      /* NAMED positively, never as "not visible". An unknown or empty
         overflow is an absence of information, and reading it as a clip
         invents a verdict — the test caught exactly that, reporting a card
         as clipped away by <html>. These are the values that actually
         establish a clipping box. */
      const clips = /\b(hidden|clip|auto|scroll|overlay)\b/.test(cs.overflow || '') ||
                    (cs.clipPath && cs.clipPath !== 'none');
      if (!clips) continue;
      if (cs.clipPath && cs.clipPath !== 'none') {
        // arbitrary geometry this cannot evaluate; say so rather than claim
        // the point survived it
        out.push({ el: e, sel: U.selectorOf(e), why: `clip-path: ${cs.clipPath}`, sure: false });
        continue;
      }
      const r = e.getBoundingClientRect();
      const bw = { t: parseFloat(cs.borderTopWidth) || 0, r: parseFloat(cs.borderRightWidth) || 0,
                   b: parseFloat(cs.borderBottomWidth) || 0, l: parseFloat(cs.borderLeftWidth) || 0 };
      if (!inRounded(x, y, padBox(r, bw), padRadii(radii(cs, r.width, r.height), bw))) {
        out.push({ el: e, sel: U.selectorOf(e), why: `overflow: ${cs.overflow}`, sure: true });
      }
    }
  }
  return { blockers: out, faders };
}

/** The nearest of them that actually contains this element, or null. */
export const clippedBy = (el, blockers) =>
blockers.find((b) => b.el !== el && b.el.contains(el)) || null;
