import { Colour } from '../../../subjects/colour.js';
import { Probe } from './probe.js';
import { base, composite } from './verdict.js';
import { skipped } from './skipped.js';
import { Sample } from './sample.js';

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

  const { at, over } = base(layers);
  const covered = at >= 0 && layers.slice(0, at + 1).some((x) => x.pseudo.length);
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
      /* THREE ANSWERS, because "PAINTS" over rgba(0,0,0,0) is a lie and it
         was told on every transparent wrapper in the stack. A fourth is
         forced by this project's own rule: a colour we could not read is not
         a zero, and must not be filed with the ones we could. */
      const a = x.alpha;
      const img = x.bgImage ? ` · background-image ${x.bgImage}` : '';
      if (a === null) verdict = `colour NOT READ (${x.colour}) — a colour space this cannot resolve${img}`;
      else if (a === 0 && !x.bgImage) verdict = `transparent — contributes nothing · ${x.from} ${x.colour}`;
      else if (a < 1) verdict = `PAINTS · alpha ${a} · ${x.from} ${x.colour}${img}`;
      else verdict = `PAINTS · ${x.from} ${x.colour}${img}`;
    }
    /* The row says its own gap. The scope note at the end lists them all,
       but a reader looking at row [3] should not have to match a selector
       against a paragraph to learn that its contents were never walked. */
    if (x.el.shadowRoot) verdict += ' · shadow content NOT walked';
    if (/^(IFRAME|FRAME)$/.test(x.el.tagName)) verdict += ' · frame contents NOT walked';
    /* THE ANSWER, MARKED. The composite is stated below, but working out
       which of twelve rows produced it is arithmetic the reader should not
       have to do — and it is the question they came with. */
    /* The marker must not out-claim the doubts beneath it, and must not drop
       what it already knew to say so. A pseudo on or above the base paints
       over it unseen — "the colour you see" would be the report contradicting
       its own next paragraph — but the blend count is still the answer to a
       different question, so both are named. */
    const notes = [];
    if (over) notes.push(`${over} layer${over === 1 ? '' : 's'} blend over it`);
    if (covered) notes.push('a pseudo paints over it, unseen');
    const win = i !== at ? ''
      : notes.length ? `  ← base · ${notes.join(' · ')}`
                     : '  ← the colour you see';
    L.push(`  [${i + 1}] ${sel}  ${boxes[i].padEnd(bw)}  ${verdict}${win}`);
    if (x.backdrop) {
      L.push(`      backdrop-filter: ${x.backdrop} — the pixel here is FILTERED, not`);
      L.push(`      composited; the walk below cannot account for it`);
    }
    for (const ps of x.pseudo) {
      /* The GEOMETRY is what tells the two apart. `inset 0` covers the whole
         element; `bottom 0px · auto × 1px` is a hairline along one edge — and
         "may paint this pixel" said exactly the same thing about both. */
      L.push(`      ${ps.which} — ${ps.bits.join(' · ')}`);
      L.push(`      ${' '.repeat(ps.which.length)}   ${ps.geo} — NOT in the stack;` +
             ' no hit test reaches it');
    }
  });

  /* WHAT THE HIT TEST LEFT OUT, after the stack it produced. Listed here
     rather than woven in, because these were never given a paint order — the
     browser never put them in one, and inventing one would be the report
     claiming to know something it does not. */
  const gone = skipped(p.x, p.y, layers.map((x) => x.el));
  if (gone.length) {
    L.push('in the box, NOT in the stack — the hit test skipped these:');
    for (const g of gone) {
      const sel = g.sel.length > w ? '…' + g.sel.slice(-(w - 1)) : g.sel.padEnd(w);
      const box = `(${Math.round(g.r.left)}, ${Math.round(g.r.top)}, ` +
                  `${Math.round(g.r.width)} × ${Math.round(g.r.height)})`;
      L.push(`  [—] ${sel}  ${box.padEnd(bw)}  box contains the point, hit test SKIPPED it`);
      L.push(`      ${g.why}`);
    }
  }

  const { colour, doubts } = composite(layers);
  L.push(`composited bottom → top: rgb(${Colour.rgb(colour)})`);
  if (at < 0) {
    L.push('no fully opaque layer in the stack — the page canvas (white) shows through,');
    L.push('   which is where the composite above starts.');
  }
  L.push(...sampleLines(colour));
  if (doubts.length) {
    L.push('not accounted for:');
    for (const d of doubts) L.push(`   ${d}`);
  }
  L.push(...scope(dropped, hosts, frames));
  return L;
}

/**
 * THE COMPOSITE AGAINST THE SCREEN — and the SIZE of any disagreement.
 *
 * A yes/no mismatch flag loses the only thing that matters here: how big it
 * is says what was hidden. Two or three units is a saturate or a rounding; a
 * few tens is a whole layer nobody accounted for. So the two colours go side
 * by side and the difference is a number per channel and a maximum.
 *
 * With no sample the composite is still printed — as a CLAIM, in as many
 * words. Silence there would let a derived answer read as a measured one,
 * which is the one thing this tool may not do.
 */
function sampleLines(colour) {
  const got = Sample.current();
  if (!got) {
    return ['sampled pixel: not taken — the composite above is a CLAIM computed from',
            `   the walk, and nothing here has verified it${Sample.why ? ` (${Sample.why})` : ''}.`,
            '   Turn on "Sample the real pixel" under ⚙ to have ⧉ read the screen.'];
  }
  const c = { r: Math.round(colour.r), g: Math.round(colour.g), b: Math.round(colour.b) };
  const d = { r: Math.abs(c.r - got.rgb.r), g: Math.abs(c.g - got.rgb.g), b: Math.abs(c.b - got.rgb.b) };
  const worst = Math.max(d.r, d.g, d.b);
  const L = [`sampled pixel: rgb(${got.rgb.r},${got.rgb.g},${got.rgb.b})   (capture taken, one pixel read, discarded)`,
             `   composite   rgb(${c.r},${c.g},${c.b})`,
             `   ΔRGB        ${d.r},${d.g},${d.b}   worst ${worst}`];
  /* THE MOST VALUABLE LINE THERE IS. A disagreement means something paints
     that the walk did not account for — and the doubts printed below are the
     list of candidates for what. Naming the size is what turns it from a flag
     into a lead. */
  if (worst === 0) L.push('   they agree — the walk accounted for everything that paints here');
  else if (worst <= 3) L.push('   near-agreement: a rounding, a colour-space conversion, or a saturate');
  else L.push(`   THEY DISAGREE by ${worst} — something paints here that the walk did not` +
              ' account for; the notes below are the candidates');
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
