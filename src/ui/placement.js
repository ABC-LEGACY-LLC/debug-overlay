import { CONFIG } from '../core/config.js';
import { U } from '../core/utils.js';
import { layer } from './dom.js';
import { WebPanel } from './web-panel.js';
  /* ======================================================================
     PLACEMENT — collision-free positioning
     ====================================================================== */
  export const Place = (() => {
    let taken = [];
    function put(node, x, y, w, h) {
      node.style.left = x + 'px';
      node.style.top = y + 'px';
      if (w != null) node.style.width = w + 'px';
      if (h != null) node.style.height = h + 'px';
    }
    function claim(x, y, w, h) { taken.push(U.rectOf(x - 2, y - 2, w + 4, h + 4)); }

    function smart(node, anchor, opts = {}) {
      /* opts.size — measured by the caller. offsetWidth/offsetHeight are
         LAYOUT READS, and this is called in a loop that writes styles between
         calls, so each read forced a synchronous layout of the whole
         document. A caller placing many nodes can measure them all in one
         pass (one layout, then free) and hand the numbers in. */
      const w = opts.size ? opts.size.w : node.offsetWidth;
      const h = opts.size ? opts.size.h : node.offsetHeight;
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
        ln.className = 'debug-overlay-leader';
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
        const br = WebPanel.rect();
        taken.push(U.rectOf(br.left - 8, br.top - 8, br.width + 16, br.height + 16));
      },
    };
  })();
