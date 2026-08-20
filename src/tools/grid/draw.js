import { CONFIG } from '../../core/config.js';

/**
 * RULE hook. This tool decorates other tools' numbers AND produces
 * findings — two roles at once, which the old one-label-per-tool
 * taxonomy made impossible for no reason but the shape of the label.
 *
 * Keyed by VALUE, not by element: one 13px used in forty places is one
 * decision someone made, not forty mistakes. That is the page-wide
 * pattern a per-element read-out could never show you — it is why this
 * belongs in a sweep and not only on a badge.
 */
/**
 * WHERE the off-grid spacing is. grid was the only rule that produced
 * findings and drew nothing — set the step to 4px on a Tailwind page and
 * the list filled with thousands while the page stayed blank, so every
 * row had to be clicked to find out where it was. contrast and dupid
 * both marked theirs; this was the odd one out.
 *
 * `found` is this tool's own findings, handed over by the renderer. The
 * mark classes are core, because more than one rule paints them.
 */
export function draw({ layer, Place, found }) {
        for (const f of found.slice(0, CONFIG.MARK_LIMIT)) {
          if (!document.contains(f.el)) continue;
          const r = f.el.getBoundingClientRect();
          const box = document.createElement('div');
          box.className = 'dbgov-box dbgov-flag dbgov-' + f.severity;
          Place.put(box, r.left, r.top, r.width, r.height);
          layer.append(box);
        }
}
