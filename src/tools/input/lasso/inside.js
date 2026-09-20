import { Tools } from '../../../core/registry.js';
import { CONFIG } from '../../../core/config.js';

/**
 * WHAT A DRAWN RECTANGLE TAKES — geometry, and no hit test anywhere.
 *
 * That is the whole reason this exists beside clicking. A click asks the
 * browser "what is under this point", and the browser answers with what it
 * would DELIVER an event to — which silently omits anything outside its own
 * painted shape, anything behind `pointer-events: none`, and anything an
 * ancestor's overflow has clipped away. ⛏ paint lists those as `[—]` because
 * they are real and unreachable. A rectangle reaches them: it asks where
 * things ARE, which is a different question with a different answer.
 *
 * TWO QUESTIONS, NOT ONE. Which boxes count, and which of those to keep, are
 * independent — and shipping them as one four-valued setting got it wrong.
 * `touching` sat as a fourth value beside outermost/leaves/every, so choosing
 * it also silently chose "no pruning at all": every wrapper between <body>
 * and the thing you wanted, because under overlap an ancestor is taken for
 * free. Split, every pairing is expressible and each value means one thing.
 */

/** REACH — which boxes count as in the rectangle. */
const REACH = {
  /** Entirely inside it. What a marquee usually means, and useless for an
   *  element bigger than the drag — or bigger than the viewport. */
  enclosed: (r, b) => b.left >= r.left && b.right <= r.right &&
                      b.top >= r.top && b.bottom <= r.bottom,
  /** Overlapping it at all, down to one pixel. This is how you take something
   *  large by dragging INSIDE it, which enclosed can never do. */
  touched: (r, b) => !(r.right < b.left || r.left > b.right ||
                       r.bottom < b.top || r.top > b.bottom),
};

/** KEEP — which of the matched boxes survive. */
const KEEP = {
  /* A rectangle over one card matches the card AND every node inside it — on
     a real page dozens of pins for one drag, with the one you wanted buried
     among them. Dropping anything whose ancestor also matched leaves "the
     things in this region". Under `touched` this reads differently and says
     so: every ancestor up to <body> overlaps, so outermost returns the
     outermost of THOSE — one page wrapper. That is a true answer to a
     question few people are asking, which is why it is not the default. */
  outermost: (hit, taken) => hit.filter((el) => {
    for (let e = el.parentElement; e; e = e.parentElement) if (taken.has(e)) return false;
    return true;
  }),
  /* The deepest matches — nothing kept that has a match inside it. Paired
     with `touched` this is the answer for a large element: drag inside the
     wallpaper and the wallpaper is the deepest thing the box reaches, while
     every wrapper above it is dropped for having a matched child. */
  deepest: (hit, taken) => hit.filter((el) => ![...el.children].some((c) => taken.has(c))),
  /** The honest raw answer, pruned by nothing. */
  every: (hit) => hit,
};

export function inside(rect, { keep, reach } = {}) {
  let all = [];
  try { all = document.body ? [...document.body.querySelectorAll('*')] : []; } catch { return []; }
  /* OUR OWN CHROME IS NOT THE PAGE. The root lives in the page's body, so a
     box drawn over the bar pinned the overlay's own buttons — and `touched`
     would have made that the common case rather than the odd one. */
  const ours = document.getElementById(CONFIG.ROOT_ID);
  const fits = REACH[reach] || REACH.enclosed;
  const hit = [];
  for (const el of all) {
    if (ours && (el === ours || ours.contains(el))) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;          // nothing laid out to take
    if (fits(rect, b)) hit.push(el);
  }
  return (KEEP[keep] || KEEP.outermost)(hit, new Set(hit));
}

/** The two settings the panel currently offers, asked through the registry so
 *  this file never learns which tool declared them. */
export const modeOf = (tool) => ({ keep: Tools.setting(tool, 'take'),
                                   reach: Tools.setting(tool, 'reach') });
