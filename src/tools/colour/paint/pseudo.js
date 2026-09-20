/**
 * THE LAYERS HIT-TESTING CANNOT SEE.
 *
 * elementsFromPoint returns elements, and a ::before is not one — so a
 * pseudo that paints the whole surface of a card never appears in the stack
 * at all. On the case this tool was built for, the two pseudos WERE the
 * answer: a wallpaper in ::before and an edge ring in ::after. Kept apart
 * from the walk because they are not part of it and never can be; what can
 * be done is to say they are there, and where they sit.
 */

/** A pseudo-element that paints but is invisible to elementsFromPoint. */
export function pseudo(el, which) {
  let cs = null;
  try { cs = getComputedStyle(el, which); } catch { return null; }
  if (!cs) return null;
  const content = cs.content;
  if (!content || content === 'none' || content === 'normal') return null;
  const bits = [];
  /* The CONTENT VALUE, not the bare word. `content` is the gate every pseudo
     passes, so printing it said nothing — while the value itself is the
     difference between a decoration layer (content "") and one that paints a
     glyph (content "→"), and between either and content: url(…), which is an
     image. It costs a variable to say which. */
  bits.push(`content ${cs.content}`);
  const bg = cs.backgroundColor;
  if (bg && bg !== 'transparent' && !/^rgba\(0, 0, 0, 0\)$/.test(bg)) bits.push(`bg ${bg}`);
  if (cs.backgroundImage && cs.backgroundImage !== 'none') bits.push('background-image');
  if (cs.maskImage && cs.maskImage !== 'none') bits.push('mask');
  if (parseFloat(cs.borderTopWidth) || parseFloat(cs.borderLeftWidth)) bits.push('border');
  // a paint source the first version missed entirely, and one that reaches
  // OUTSIDE the pseudo's own box, so it can colour a pixel the geometry says
  // it does not cover
  if (cs.boxShadow && cs.boxShadow !== 'none') bits.push(`box-shadow ${cs.boxShadow}`);
  // the gate stays "does it paint" — content alone decorates nothing unless it
  // is text or an image, and a pseudo that paints nothing is not a layer
  const paints = bits.length > 1 || !/^["'](?:)?["']$/.test(cs.content);
  return paints ? { which, bits, geo: geometry(cs) } : null;
}

/**
 * WHERE the pseudo sits, which is the difference between the two that
 * matter. `inset: 0` covers the whole element; `bottom: 0; height: 1px` is
 * a hairline along one edge. Told only that both "may paint here", a reader
 * cannot tell a wallpaper from a border — and on the case this tool was
 * built for, those were the two layers that decided the colour.
 *
 * Read from the getComputedStyle call that already found the pseudo, so it
 * costs nothing extra. `auto` prints as `auto`: it is what the style says,
 * and resolving it would mean claiming a geometry no API reports.
 */
function geometry(cs) {
  const size = `${cs.width || 'auto'} × ${cs.height || 'auto'}`;
  const set = ['top', 'right', 'bottom', 'left']
    .map((k) => [k, cs[k]]).filter(([, v]) => v && v !== 'auto');
  if (!set.length) return `no inset · ${size}`;
  const vals = set.map(([, v]) => v);
  if (set.length === 4 && vals.every((v) => v === vals[0])) return `inset ${vals[0]} · ${size}`;
  return `${set.map(([k, v]) => `${k} ${v}`).join(' ')} · ${size}`;
}
