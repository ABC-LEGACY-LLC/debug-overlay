/**
 * THE PAINTED SHAPE, as against the box — pure geometry, no DOM reads.
 *
 * Every layout tool in existence answers "is the point in the box". The
 * question nothing answers is "is the point in what the element actually
 * PAINTS", and on a rounded card those differ by exactly the wedge this tool
 * was asked for: inside the border box, outside the rounded shape, so the
 * colour you see there belongs to whatever is behind it.
 */

/**
 * The four corner radii as [rx, ry] pixel pairs.
 *
 * Percentages resolve against the box, because `getComputedStyle` hands some
 * of them back unresolved, and a `50%` read as `50px` makes a pill test as a
 * rectangle — the one shape whose corners matter most.
 */
export function radii(cs, w, h) {
  const pair = (v) => {
    const p = String(v || '0').trim().split(/\s+/);
    const n = (s, base) => (String(s).endsWith('%')
      ? ((parseFloat(s) || 0) / 100) * base : parseFloat(s) || 0);
    return [Math.max(0, n(p[0], w)), Math.max(0, n(p[1] === undefined ? p[0] : p[1], h))];
  };
  const r = { tl: pair(cs.borderTopLeftRadius), tr: pair(cs.borderTopRightRadius),
              br: pair(cs.borderBottomRightRadius), bl: pair(cs.borderBottomLeftRadius) };
  /* CSS Backgrounds §5.5: if the two radii on any edge overrun that edge,
     EVERY radius scales by the same factor. Skipping this reads `9999px` as
     literal, so a pill's corners test as square and the wedge never appears. */
  const ratio = (sum, len) => (sum > 0 ? len / sum : Infinity);
  const f = Math.min(ratio(r.tl[0] + r.tr[0], w), ratio(r.bl[0] + r.br[0], w),
                     ratio(r.tl[1] + r.bl[1], h), ratio(r.tr[1] + r.br[1], h), 1);
  if (f < 1) for (const k of ['tl', 'tr', 'br', 'bl']) r[k] = [r[k][0] * f, r[k][1] * f];
  return r;
}

/** Is (x, y) inside the rectangle `b` once its corners are rounded by `rad`? */
export function inRounded(x, y, b, rad) {
  if (x < b.left || x > b.right || y < b.top || y > b.bottom) return false;
  // outside the corner's quarter-ellipse — the only way to be in the box and
  // not in the shape
  const corner = (zone, cx, cy, rx, ry) => {
    if (!zone || rx <= 0 || ry <= 0) return true;
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };
  return corner(x < b.left + rad.tl[0] && y < b.top + rad.tl[1],
                b.left + rad.tl[0], b.top + rad.tl[1], rad.tl[0], rad.tl[1])
      && corner(x > b.right - rad.tr[0] && y < b.top + rad.tr[1],
                b.right - rad.tr[0], b.top + rad.tr[1], rad.tr[0], rad.tr[1])
      && corner(x > b.right - rad.br[0] && y > b.bottom - rad.br[1],
                b.right - rad.br[0], b.bottom - rad.br[1], rad.br[0], rad.br[1])
      && corner(x < b.left + rad.bl[0] && y > b.bottom - rad.bl[1],
                b.left + rad.bl[0], b.bottom - rad.bl[1], rad.bl[0], rad.bl[1]);
}

/** The padding box, which is what `overflow` clips to — and its own radii,
 *  each shrunk by the border it sits behind. */
export function padBox(b, bw) {
  return { left: b.left + bw.l, top: b.top + bw.t,
           right: b.right - bw.r, bottom: b.bottom - bw.b };
}
export function padRadii(rad, bw) {
  const sub = (v, n) => Math.max(0, v - n);
  return { tl: [sub(rad.tl[0], bw.l), sub(rad.tl[1], bw.t)],
           tr: [sub(rad.tr[0], bw.r), sub(rad.tr[1], bw.t)],
           br: [sub(rad.br[0], bw.r), sub(rad.br[1], bw.b)],
           bl: [sub(rad.bl[0], bw.l), sub(rad.bl[1], bw.b)] };
}

/**
 * WHICH CORNER cut the point out, when the shape excludes it.
 *
 * The bare fact that a point is outside the painted shape is the finding; the
 * corner is what lets a reader look at the right 14 pixels of the screen
 * instead of four candidates. Only meaningful once inRounded has said no.
 */
export function cornerAt(x, y, b, rad) {
  const zones = [
    ['top-left', x < b.left + rad.tl[0] && y < b.top + rad.tl[1], rad.tl],
    ['top-right', x > b.right - rad.tr[0] && y < b.top + rad.tr[1], rad.tr],
    ['bottom-right', x > b.right - rad.br[0] && y > b.bottom - rad.br[1], rad.br],
    ['bottom-left', x < b.left + rad.bl[0] && y > b.bottom - rad.bl[1], rad.bl],
  ];
  const hit = zones.find(([, inZone]) => inZone);
  return hit ? { corner: hit[0], r: Math.round(hit[2][0]) } : null;
}

/** Which border the point falls in, or null for the padding box. Only
 *  meaningful once the point is known to be inside the border box. */
export function sideAt(x, y, b, bw) {
  if (bw.t && y < b.top + bw.t) return 'top';
  if (bw.b && y > b.bottom - bw.b) return 'bottom';
  if (bw.l && x < b.left + bw.l) return 'left';
  if (bw.r && x > b.right - bw.r) return 'right';
  return null;
}

/**
 * Does any of the element's box-shadows reach this point?
 *
 * Offset and SPREAD are modelled; blur is not — a blurred edge has no single
 * boundary, and claiming one would be the confident wrong answer this project
 * refuses. The reported value carries the blur so a reader can judge it.
 */
export function shadowAt(x, y, b, cs) {
  const raw = String(cs.boxShadow || 'none');
  if (raw === 'none' || !raw) return null;
  // split on commas that are not inside rgb()/rgba()/color()
  const parts = raw.split(/,(?![^(]*\))/);
  for (const part of parts) {
    const s = part.trim();
    if (/\binset\b/.test(s)) continue;          // inset paints inside, not here
    const nums = (s.match(/-?[\d.]+px/g) || []).map(parseFloat);
    if (nums.length < 2) continue;
    const [dx, dy, , spread = 0] = nums;
    const r = { left: b.left + dx - spread, top: b.top + dy - spread,
                right: b.right + dx + spread, bottom: b.bottom + dy + spread };
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return s;
  }
  return null;
}
