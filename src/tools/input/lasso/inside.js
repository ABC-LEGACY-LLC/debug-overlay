import { Tools } from '../../../core/registry.js';

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
 */

/** Boxes overlap at all — the loosest reading of "in the rectangle". */
const meets = (r, b) => !(r.right < b.left || r.left > b.right ||
                          r.bottom < b.top || r.top > b.bottom);
/** The element's box sits entirely inside the rectangle. */
const within = (r, b) => b.left >= r.left && b.right <= r.right &&
                         b.top >= r.top && b.bottom <= r.bottom;

export function inside(rect, mode) {
  let all = [];
  try { all = document.body ? [...document.body.querySelectorAll('*')] : []; } catch { return []; }
  const fits = mode === 'touching' ? meets : within;
  const hit = [];
  for (const el of all) {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;          // nothing laid out to take
    if (fits(rect, b)) hit.push(el);
  }
  /* OUTERMOST, by default, and it is what makes the gesture usable at all.
     A rectangle over one card contains the card AND every node inside it —
     on a real page that is dozens of pins for one drag, and the one you
     wanted is buried among them. Dropping anything whose ancestor was also
     taken leaves "the things in this region" rather than "every node in it".
     The other two readings are there because neither is always wrong: a
     `leaves` sweep is how you reach the text nodes' parents, and `every` is
     the honest raw answer. */
  if (mode === 'every' || mode === 'touching') return hit;
  const taken = new Set(hit);
  if (mode === 'leaves') {
    return hit.filter((el) => ![...el.children].some((c) => taken.has(c)));
  }
  return hit.filter((el) => {
    for (let e = el.parentElement; e && e.nodeType === 1; e = e.parentElement) {
      if (taken.has(e)) return false;
    }
    return true;
  });
}

/** The mode the panel currently offers. Asked through the registry, so this
 *  file never learns which tool declared it. */
export const modeOf = (tool) => Tools.setting(tool, 'take');
