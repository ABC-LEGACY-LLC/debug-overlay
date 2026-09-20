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
 * needs to know which so they can ask for the click.
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

  const layers = Probe.stack(p.x, p.y);
  if (!layers.length) {
    L.push('nothing in the page is under that point.');
    return L;
  }

  const w = Math.min(46, Math.max(...layers.map((x) => x.sel.length)));
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
    L.push(`  [${i + 1}] ${sel}  ${verdict}`);
    if (x.backdrop) L.push(`      backdrop-filter: ${x.backdrop}`);
    for (const ps of x.pseudo) {
      L.push(`      ${ps.which} — content + ${ps.bits.join(', ')}` +
             ` — NOT in the stack; it may paint this pixel`);
    }
  });

  const { colour, doubts } = Probe.composite(layers);
  L.push(`composited bottom → top: rgb(${Colour.rgb(colour)})`);
  /* THE HONEST GAP. The requester asked for the sampled pixel and for the
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
  return L;
}
