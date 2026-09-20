import { U } from '../../../core/utils.js';
import { radii, inRounded, cornerAt } from './shape.js';
import { ancestry, clippedBy } from './ancestry.js';

/**
 * THE LAYERS THE HIT TEST LEFT OUT — the wedge, named at last.
 *
 * elementsFromPoint is hit-testing, and hit-testing respects the PAINTED
 * shape: a point inside an element's border box but outside its rounded
 * corner is not a hit on that element, so the browser skips it and the stack
 * silently starts one layer lower. A person meets this as "that area is not
 * selectable"; a reader of the report meets it as an element that simply is
 * not there, with nothing saying it ever could have been.
 *
 * That is the exact case this tool was built for, and until now the tool had
 * the same blind spot as the thing it was built to correct.
 *
 * ONE SYMPTOM, SEVERAL CAUSES, and they are worth telling apart:
 *   outside the painted shape   the corner, with its radius
 *   pointer-events: none        its own, or inherited from an ancestor
 *   clipped by an ancestor      overflow, which removes it at this point
 *   visibility: hidden          present, laid out, and not hit-testable
 * A cause we cannot name is reported as unnamed rather than guessed at.
 *
 * REPORT-ONLY, and deliberately. This reads every element in the document,
 * which is the shape of a page sweep rather than of a pointer-driven probe —
 * so it runs when a report is asked for, once, and never on a frame. The
 * walk that draw() and the badge share stays untouched.
 */
export function skipped(x, y, inStack) {
  const hit = new Set(inStack);
  const out = [];
  let all = [];
  try { all = document.body ? document.body.querySelectorAll('*') : []; } catch { return out; }
  for (const el of all) {
    if (hit.has(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;                    // nothing laid out
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const cs = getComputedStyle(el);
    const why = reason(el, cs, r, x, y);
    if (why) out.push({ el, sel: U.selectorOf(el), r, why });
  }
  /* Innermost first, so the list reads the way the stack above it does —
     top → bottom. Area is the honest proxy: these were never in a paint
     order, because the browser never put them in one. */
  return out.sort((a, b) => (a.r.width * a.r.height) - (b.r.width * b.r.height));
}

function reason(el, cs, r, x, y) {
  if (cs.visibility === 'hidden') return 'visibility: hidden — laid out, and not hit-testable';
  if (cs.pointerEvents === 'none') return 'pointer-events: none — it declines the hit test';
  for (let e = el.parentElement; e && e.nodeType === 1; e = e.parentElement) {
    if (getComputedStyle(e).pointerEvents === 'none') {
      return `pointer-events: none on ${U.selectorOf(e)} — inherited, so this declines too`;
    }
  }
  const clip = clippedBy(el, ancestry(x, y, [el]).blockers);
  if (clip) return `clipped away by ${clip.sel} (${clip.why})`;
  const rad = radii(cs, r.width, r.height);
  if (!inRounded(x, y, r, rad)) {
    const c = cornerAt(x, y, r, rad);
    return 'outside its painted shape' + (c ? ` (r ${c.r}, ${c.corner} corner)` : '') +
           ' — the browser skips it for the same reason, which is why it is not in the stack';
  }
  /* A box that contains the point, was not returned, and none of the known
     causes explains it. Named rather than dropped: an unexplained absence is
     still the reader's business, and guessing at a cause is the one thing
     this tool does not do. */
  return 'skipped, and no cause this can name — worth looking at by hand';
}
