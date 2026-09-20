import { Colour } from '../../../subjects/colour.js';
import { Probe } from './probe.js';

/**
 * THE DELIVERABLE. The consumer of this tool is a reader working from the
 * copied text, not from the screen — so everything the crosshair and the
 * badge say has to be here too, as exact numbers and selectors. A mark with
 * no line in the report is invisible to that reader.
 *
 * Armed with no probe still prints, briefly: a section that is simply absent
 * cannot be told apart from a tool that was never switched on, and the reader
 * needs to know which so they can ask for the pointer to be moved.
 */
export function reportTail() {
  const p = Probe.point();
  if (!p) return ['', '## paint — no probe yet',
                  'Armed, but the pointer has not been over the page since. Point at the pixel',
                  'in question; the stack at that point appears here.'];

  const L = [];
  L.push('', `## paint — the pixel at (${Math.round(p.x)}, ${Math.round(p.y)})`);
  L.push(`page coordinates (${Math.round(Probe.at.px)}, ${Math.round(Probe.at.py)})` +
         ` · dpr ${devicePixelRatio}`);

  const { layers, dropped, hosts, frames } = Probe.walk(p.x, p.y);
  if (!layers.length) {
    L.push('nothing in the page is under that point.');
    L.push(...scope(dropped, hosts, frames));
    return L;
  }

  const { at, over } = Probe.base(layers);
  const w = Math.min(40, Math.max(...layers.map((x) => x.sel.length)));
  const boxes = layers.map((x) => `(${x.rect.x}, ${x.rect.y}, ${x.rect.w} × ${x.rect.h})`);
  const bw = Math.max(...boxes.map((b) => b.length));

  L.push('stack, top → bottom:');
  layers.forEach((x, i) => {
    const sel = x.sel.length > w ? '…' + x.sel.slice(-(w - 1)) : x.sel.padEnd(w);
    let verdict;
    if (x.clip) {
      verdict = `clipped away here by ${x.clip.sel}` +
                ` (${x.clip.why})${x.clip.sure ? '' : ' — not evaluated, assume it may clip'}`;
    } else if (!x.inShape) {
      /* THE LINE THIS TOOL EXISTS FOR. Inside the box, outside the painted
         shape: the colour at that pixel is somebody else's, and no other
         instrument will tell you so. */
      verdict = `box only — not painted here` +
                (x.radius ? ` (outside r ${x.radius})` : '') +
                (x.shadow ? ` · box-shadow reaches here: ${x.shadow}` : '');
    } else {
      verdict = `PAINTS · ${x.from} ${x.colour}` +
                (x.bgImage ? ` · background-image ${x.bgImage}` : '');
    }
    /* The row says its own gap. The scope note at the end lists them all,
       but a reader looking at row [3] should not have to match a selector
       against a paragraph to learn that its contents were never walked. */
    if (x.el.shadowRoot) verdict += ' · shadow content NOT walked';
    if (/^(IFRAME|FRAME)$/.test(x.el.tagName)) verdict += ' · frame contents NOT walked';
    /* THE ANSWER, MARKED. The composite is stated below, but working out
       which of twelve rows produced it is arithmetic the reader should not
       have to do — and it is the question they came with. */
    const win = i !== at ? ''
      : over ? `  ← base · ${over} layer${over === 1 ? '' : 's'} blend over it`
             : '  ← the colour you see';
    L.push(`  [${i + 1}] ${sel}  ${boxes[i].padEnd(bw)}  ${verdict}${win}`);
    if (x.backdrop) {
      L.push(`      backdrop-filter: ${x.backdrop} — the pixel here is FILTERED, not`);
      L.push(`      composited; the walk below cannot account for it`);
    }
    for (const ps of x.pseudo) {
      L.push(`      ${ps.which} — content + ${ps.bits.join(', ')}` +
             ` — NOT in the stack; it may paint this pixel`);
    }
  });

  const { colour, doubts } = Probe.composite(layers);
  L.push(`composited bottom → top: rgb(${Colour.rgb(colour)})`);
  if (at < 0) {
    L.push('no fully opaque layer in the stack — the page canvas (white) shows through,');
    L.push('   which is where the composite above starts.');
  }
  /* THE HONEST GAP. The request asked for the sampled pixel and for the
     disagreement between it and the walk, because a disagreement is the most
     valuable line there is — it means something paints that the walk did not
     account for. Reading a rendered pixel needs a capture permission this
     build does not ask for, so there is no sample, and saying so is the only
     alternative to letting the composite read as verified when it is not. */
  L.push('sampled pixel: not available — reading the rendered pixel needs a tab-capture');
  L.push('   permission this build does not ask for, so the composite above is a CLAIM,');
  L.push('   computed from the walk, and nothing here has verified it.');
  if (doubts.length) {
    L.push('not accounted for:');
    for (const d of doubts) L.push(`   ${d}`);
  }
  L.push(...scope(dropped, hosts, frames));
  return L;
}

/**
 * WHAT THE WALK DID NOT SEE — silent when there is nothing to say, because a
 * scope note that always prints is furniture and stops being read on exactly
 * the pages where it matters. Same rule the page sweep's `unchecked` follows.
 */
function scope(dropped, hosts, frames) {
  const parts = [];
  /* Said only when it BIT. The reader's question is "why is the topmost
     element missing?", and that question only exists when something was
     actually removed. */
  if (dropped) {
    parts.push(`${dropped} overlay layer${dropped === 1 ? '' : 's'} of our own` +
               ' removed from the top — they are not the page');
  }
  if (hosts.length) {
    parts.push(`stack STOPPED at ${hosts.length} shadow host${hosts.length === 1 ? '' : 's'}` +
               ` (${hosts.join(', ')}) — elementsFromPoint retargets to the`,
               '   host and never enters the tree. AT LEAST that many: a closed root',
               '   cannot be detected at all, so this is a floor, not a total.');
  }
  if (frames.length) {
    parts.push(`${frames.length} frame${frames.length === 1 ? '' : 's'} not entered` +
               ` (${frames.join(', ')}) — a separate document, and a`,
               '   cross-origin one could not be read even with permission.');
  }
  return parts.length ? ['not walked:', ...parts.map((x) => (x.startsWith('   ') ? x : `   ${x}`))] : [];
}
