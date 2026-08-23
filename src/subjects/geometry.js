import { CONFIG } from '../core/config.js';
import { U } from '../core/utils.js';
import { defineSubject } from '../core/registry.js';
  /* ======================================================================
     GEOMETRY — how a distance between two rects is drawn.
     Pure geometry + drawing rules. Knows nothing about tools, panels or
     reports, so dimension styling can be tuned in isolation.

     A SUBJECT, promoted from core/ by this project's own rule: a backend two
     tools consult is a subject — measure draws its dimension lines from it
     and select words its pair rows with it. The promotion is also what gives
     the geometry FAMILY its head: 📏 is the family's mark on the bar, never a
     member's glyph (measure keeps 📐). No options, so it has no ⚙ rows.
     ====================================================================== */
  export const Measure = defineSubject({
    id: 'geometry',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" /><path d="m14.5 12.5 2-2" /><path d="m11.5 9.5 2-2" /><path d="m8.5 6.5 2-2" /><path d="m17.5 15.5 2-2" /></svg>',   // lucide 'ruler' (ISC) — the geometry family's mark
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
      line.className = 'debug-overlay-line';
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
      tick.className = 'debug-overlay-cap';
      if (vertical) Place.put(tick, Math.round(x1) - 6, Math.round(y1) - 1, 12, 2);
      else Place.put(tick, Math.round(x1) - 1, Math.round(y1) - 6, 2, 12);
      layer.append(tick);

      // end: arrowhead pointing into the target — reads as direction, not a stub
      if (endArrow) {
        const a = document.createElement('div');
        a.className = 'debug-overlay-arrow debug-overlay-' + dir;
        const P = { up:    [Math.round(x2) - 5, Math.round(y2)],
                    down:  [Math.round(x2) - 5, Math.round(y2) - 7],
                    left:  [Math.round(x2),     Math.round(y2) - 5],
                    right: [Math.round(x2) - 7, Math.round(y2) - 5] }[dir];
        Place.put(a, P[0], P[1]);
        layer.append(a);
      } else {
        const c = document.createElement('div');
        c.className = 'debug-overlay-cap';
        if (vertical) Place.put(c, Math.round(x2) - 6, Math.round(y2) - 1, 12, 2);
        else Place.put(c, Math.round(x2) - 1, Math.round(y2) - 6, 2, 12);
        layer.append(c);
      }

      // label sits beside the midpoint, offset perpendicular to the span
      const mx = vertical ? x1 + 12 : (x1 + x2) / 2;
      const my = vertical ? (y1 + y2) / 2 : y1 - 12;
      const lbl = document.createElement('div');
      lbl.className = 'debug-overlay-dist' + (vertical ? ' debug-overlay-vert' : '');
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
      e.className = 'debug-overlay-ext' + (horizontal ? '' : ' debug-overlay-v');
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
        lbl.className = 'debug-overlay-dist';
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
  });
