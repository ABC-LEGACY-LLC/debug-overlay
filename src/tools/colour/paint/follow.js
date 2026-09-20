import { Probe } from './probe.js';

/**
 * THE PROBE FOLLOWS THE POINTER — a RUNTIME, so it exists only while the tool
 * is armed and powered, and the listener goes with it.
 *
 * NOT `intercept`. That hook means "this click was mine", and a tool that
 * implements it fills the ACT role — which files it on the input side of the
 * bar, beside pin and group, away from the family it belongs to. This tool
 * changes nothing and claims nothing; it only needs to know where you are
 * pointing, and a runtime is the honest shape for that.
 *
 * IT HOLDS WHEN YOU LEAVE THE PAGE. The report is the deliverable and you copy
 * it by moving to the panel and pressing ⧉ — a probe that followed the pointer
 * there would describe the panel instead of the pixel you asked about. Our
 * root is appended to documentElement rather than body, so "is the pointer
 * still on the page" is one containment test and no id is spelled here.
 */
export function watch(ctx) {
  Probe.redraw = ctx && ctx.redraw;
  Probe.onMove = (e) => {
    if (!document.body || !document.body.contains(e.target)) return;
    const p = Probe.point();
    // a frame is only worth asking for when the pixel actually changed; the
    // renderer rebuilds the whole layer, and a pointer emits far more events
    // than there are frames to draw them in
    if (p && Math.round(p.x) === Math.round(e.clientX) &&
        Math.round(p.y) === Math.round(e.clientY)) return;
    Probe.set(e.clientX, e.clientY);
    Probe.redraw?.();
  };
  addEventListener('pointermove', Probe.onMove, true);
}

export function unwatch() {
  if (Probe.onMove) removeEventListener('pointermove', Probe.onMove, true);
  Probe.onMove = null;
  Probe.redraw = null;
  // a stood-down probe describes nothing: the point was a fact about a
  // session, and keeping it would let the report answer after the tool stopped
  Probe.at = null;
  Probe._cache = null;
}
