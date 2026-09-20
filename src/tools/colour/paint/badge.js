import { Probe } from './probe.js';

/**
 * THE VERDICT ON WHAT YOU ARE POINTING AT, at the probe point.
 *
 * Only speaks when the probe is inside this element's BOX — that is precisely
 * when the question is live: your box covers the pixel, so do you actually
 * paint it? Silence elsewhere is correct; the element has nothing to do with
 * that pixel.
 */
export function badge(i) {
  const p = Probe.point();
  if (!p) return null;
  const r = i.r;
  if (p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom) return null;
  const L = Probe.layer(i.el, p.x, p.y);
  if (L.clip) {
    return `<span class="debug-overlay-paint-no">⛏ clipped here</span>` +
           `<span class="debug-overlay-paint-k"> by ${esc(L.clip.sel)}</span>`;
  }
  if (!L.inShape) {
    const why = L.radius ? `outside r ${esc(L.radius)}` : 'outside the painted shape';
    return `<span class="debug-overlay-paint-no">⛏ box only — not painted here</span>` +
           `<span class="debug-overlay-paint-k"> ${why}</span>`;
  }
  /* The same three answers the report gives. A transparent wrapper reading
     "paints here" is the badge and the report disagreeing about one pixel,
     which is the contradiction a shared Probe.layer() exists to prevent — so
     the wording has to follow it too. */
  const where = `<span class="debug-overlay-paint-k"> ${esc(L.from.replace('background-color', 'bg'))} ${esc(L.colour)}</span>`;
  if (L.alpha === null) return `<span class="debug-overlay-paint-no">⛏ colour not read</span>${where}`;
  if (L.alpha === 0 && !L.bgImage) {
    return `<span class="debug-overlay-paint-no">⛏ transparent here</span>` +
           `<span class="debug-overlay-paint-k"> contributes nothing</span>`;
  }
  const a = L.alpha < 1 ? `<span class="debug-overlay-paint-k"> alpha ${L.alpha}</span>` : '';
  return `<span class="debug-overlay-paint-yes">⛏ paints here</span>${a}${where}`;
}

/** Compact: only the case nothing else can see. */
export function compact(i) {
  const p = Probe.point();
  if (!p) return null;
  const r = i.r;
  if (p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom) return null;
  const L = Probe.layer(i.el, p.x, p.y);
  if (L.clip) return `<span class="debug-overlay-paint-no">⛏ clipped</span>`;
  if (!L.inShape) return `<span class="debug-overlay-paint-no">⛏ box only</span>`;
  // a transparent layer is the other way a box can sit over a pixel and have
  // nothing to do with its colour — the compact badge is for exactly those
  if (L.alpha === 0 && !L.bgImage) return `<span class="debug-overlay-paint-no">⛏ transparent</span>`;
  return null;
}

export function legend() {
  return [
    { mark: '⛏ paints here', means: 'green: this element really does paint the probed pixel' },
    { mark: '⛏ box only', means: 'amber: the probe is inside its box but outside its rounded shape — the colour there is somebody else’s' },
    { mark: '⛏ clipped here', means: 'amber: an ancestor’s overflow removes this element at that point' },
    { mark: '⛏ transparent here', means: 'amber: its box is over the pixel, but it contributes no colour at all' },
    { mark: 'alpha 0.06', means: 'it paints, but only partly — what you see is a blend of it and what is behind' },
  ];
}

/** The probe is a gesture core does not already advertise. */
export function gestures() {
  return [{ keys: 'Point at a pixel (⛏ armed)',
            does: 'the paint probe follows, and HOLDS when you move onto the panel — so ⧉ reports the pixel you meant' }];
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
