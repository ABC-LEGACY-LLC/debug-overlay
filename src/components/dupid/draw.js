import { CONFIG } from '../../core/config.js';

/**
 * ITS OWN SURFACE. Findings reach the ⌕ list whether a rule is armed or
 * not, so a rule with no draw() changed nothing at all when you switched
 * it on — measured: armed alone, zero badges, zero marks, zero lines. A
 * toggle that does nothing is worse than no toggle.
 *
 * `found` is this tool's own findings, handed over by the renderer. The
 * mark classes are core: more than one rule paints them, so they cannot
 * belong to whichever tool needed them first.
 */
export function draw({ layer, Place, found }) {
        for (const f of found.slice(0, CONFIG.MARK_LIMIT)) {
          if (!document.contains(f.el)) continue;
          const r = f.el.getBoundingClientRect();
          const box = document.createElement('div');
          box.className = 'dbgov-box dbgov-flag ' + f.severity;
          Place.put(box, r.left, r.top, r.width, r.height);
          layer.append(box);
        }
}
