import { State } from '../../../core/state.js';
import { CONFIG } from '../../../core/config.js';
import { inside, modeOf } from './inside.js';

/**
 * THE GESTURE — press, drag, release. A RUNTIME, so the listeners exist only
 * while the tool is armed and go with it.
 *
 * A DRAG IS NOT A CLICK, and telling them apart is the whole of the wiring.
 * Both begin with a pointerdown on the page, so this waits for real movement
 * before it believes a rectangle is being drawn; under that threshold it
 * never started one, the click runs as it always has, and nothing this tool
 * does costs the single-click gesture anything.
 */
export const Drag = {
  from: null,      // page coords where the press landed
  rect: null,      // the live rectangle in viewport coords, or null
  drew: false,     // a rectangle was completed — the click that follows is ours
  _ctx: null,

  /** Viewport rect from two page points, normalised so either drag direction
   *  gives the same box. */
  box(a, b) {
    return { left: Math.min(a.px, b.px) - scrollX, right: Math.max(a.px, b.px) - scrollX,
             top: Math.min(a.py, b.py) - scrollY, bottom: Math.max(a.py, b.py) - scrollY };
  },
};

export function watch(ctx) {
  Drag._ctx = ctx;
  const page = (e) => !!(document.body && document.body.contains(e.target));

  Drag._down = (e) => {
    // the same exits the overlay's own input layer keeps: not ours while
    // powered off, and Alt is the page's escape hatch everywhere
    if (!State.enabled || e.button !== 0 || e.altKey || !page(e)) return;
    Drag.from = { px: e.clientX + scrollX, py: e.clientY + scrollY };
    Drag.rect = null;
    Drag.drew = false;
  };
  Drag._move = (e) => {
    if (!Drag.from) return;
    const now = { px: e.clientX + scrollX, py: e.clientY + scrollY };
    /* Under the threshold this is a click that wobbled, and a rectangle that
       appears for two pixels of tremor would take the click away from
       everything else. */
    if (!Drag.rect &&
        Math.hypot(now.px - Drag.from.px, now.py - Drag.from.py) < CONFIG.LASSO_MIN) return;
    Drag.rect = Drag.box(Drag.from, now);
    ctx.redraw?.();
  };
  Drag._up = () => {
    const r = Drag.rect;
    Drag.from = null;
    Drag.rect = null;
    if (!r) return;                       // never became a drag
    Drag.drew = true;                     // the click about to fire is ours
    const els = inside(r, modeOf(Drag.tool));
    ctx.pin?.(els);
    ctx.redraw?.();
  };
  /* Capture, like every other listener the overlay installs: the page must
     not be able to stop the gesture before it reaches us. */
  addEventListener('pointerdown', Drag._down, true);
  addEventListener('pointermove', Drag._move, true);
  addEventListener('pointerup', Drag._up, true);
  // a release outside the window would otherwise leave a rectangle mid-air
  addEventListener('blur', Drag._up);
}

export function unwatch() {
  removeEventListener('pointerdown', Drag._down, true);
  removeEventListener('pointermove', Drag._move, true);
  removeEventListener('pointerup', Drag._up, true);
  removeEventListener('blur', Drag._up);
  Drag.from = Drag.rect = null;
  Drag.drew = false;
  Drag._ctx = null;
}

/**
 * Hook: the click that ends a drag is OURS, and claiming it is what stops the
 * gesture also pinning whatever happened to be under the release. A click
 * that ended no drag is not touched, so single-click pinning is untouched.
 */
export function intercept({ type }) {
  if (type !== 'click' || !Drag.drew) return false;
  Drag.drew = false;
  return true;
}
