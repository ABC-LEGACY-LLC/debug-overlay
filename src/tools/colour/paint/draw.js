import { Probe } from './probe.js';

/**
 * THE PROBE, ON THE PAGE — so a screenshot says which pixel the report is
 * about. Without it the report names coordinates and the reader has to trust
 * them; with it the crosshair and the text are one piece of evidence.
 *
 * The TOPMOST PAINTING layer is outlined too, because that is the answer:
 * the element whose colour that pixel is.
 */
export function draw({ layer, Place }) {
  const p = Probe.point();
  if (!p) return;
  const dot = document.createElement('div');
  dot.className = 'debug-overlay-paint-dot';
  Place.put(dot, p.x - 5, p.y - 5, 10, 10);
  Place.claim(p.x - 7, p.y - 7, 14, 14);
  layer.append(dot);

  /* The BASE, not merely the topmost painter — that is the layer the colour
     comes from, and it is what the report marks too. One answer, two faces. */
  const layers = Probe.walk(p.x, p.y).layers;
  const painter = layers[Probe.base(layers).at];
  if (!painter || !document.contains(painter.el)) return;
  const r = painter.el.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'debug-overlay-box debug-overlay-paint-box';
  Place.put(box, r.left, r.top, r.width, r.height);
  layer.append(box);
}
