import { Colour } from '../../../subjects/colour.js';

/**
 * WHAT THE STACK MEANS — arithmetic over layers, and not one DOM read.
 *
 * Split out of probe.js when that file passed the size advisory, and the
 * seam was already there: one half asks the page what sits at a point, the
 * other asks what those answers add up to. Only the second needs to know how
 * colour composites, which is why only this file imports the subject.
 */

/**
 * WHICH ROW IS THE COLOUR YOU SEE.
 *
 * Painting runs bottom → top, so a fully opaque layer wipes out everything
 * painted before it — everything BELOW it in this list. The last opaque one
 * to paint (the smallest index here) is therefore the floor, and only the
 * layers above it can still change the answer. Obvious in a stack of three;
 * in a stack of twelve it is arithmetic the reader should not have to do.
 */
export function base(layers) {
  let at = -1;
  const opaque = (L) => {
    if (!L.paints || L.bgImage) return false;
    const c = Colour.colour(L.colour);
    return !!c && (c.a == null || c.a >= 0.999);
  };
  for (let i = layers.length - 1; i >= 0; i--) if (opaque(layers[i])) at = i;
  /* Only layers that ACTUALLY CONTRIBUTE are counted, so the number IS the
     answer rather than a row tally: transparent ones drop out, and an image
     painter counts even where its own colour is transparent. */
  const over = at < 0 ? 0 : layers.slice(0, at)
    .filter((L) => L.paints && (L.bgImage || (L.alpha != null && L.alpha > 0))).length;
  return { at, over };
}

/**
 * Fold the painting layers bottom → top. Returns the composite and every
 * reason it might be wrong — a reader who cannot see the reasons cannot
 * tell a computed answer from a guess.
 */
export function composite(layers) {
  const doubts = [];
  // the canvas under a page is white; anything below the stack is not ours
  let out = { r: 255, g: 255, b: 255, a: 1 };
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    if (!L.paints) continue;
    if (L.bgImage) doubts.push(`${L.sel} paints a background-image — its pixel here is unknown`);
    if (L.backdrop) doubts.push(`${L.sel} has backdrop-filter: ${L.backdrop} — the pixel here is FILTERED, not composited`);
    /* ONE CLASS, ONE TREATMENT. None of these is expressible as colour over
       colour, which is all this fold does — so each makes the result wrong in
       a way that only saying so can expose. */
    if (L.filter) doubts.push(`${L.sel} has filter: ${L.filter} — it transforms everything the element paints, after the fact`);
    if (L.blend) doubts.push(`${L.sel} has mix-blend-mode: ${L.blend} — it does not composite as colour over colour`);
    if (L.fader) doubts.push(`${L.fader.sel} has opacity ${L.fader.v} — it fades its whole subtree as ONE group, which a colour-over-colour fold cannot express`);
    const c = Colour.colour(L.colour);
    if (!c) { doubts.push(`${L.sel} ${L.from} is a colour space this cannot read`); continue; }
    if (c.a === 0) continue;
    out = Colour.over(c, out);
  }
  /* DEDUPED. One faded wrapper is one fact however many layers sit under it,
     and a list that repeats itself is a list nobody finishes reading. */
  return { colour: out, doubts: [...new Set(doubts)] };
}
