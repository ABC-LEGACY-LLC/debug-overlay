import { CONFIG } from '../../core/config.js';

/**
 * The single place grouping is decided — now from the pins' own KINDS,
 * not from a mode.
 *
 * 'Pin grouping' used to be a setting: pairs OR a chain, globally, chosen
 * in advance. That made the same finger do different things on different
 * days, and two clicks looked identical until the third betrayed which
 * mode was on. A technique is a GESTURE instead — the pin itself says how
 * it wants grouping:
 *
 *   pair (Shift+click)         starts a group, or completes one of two —
 *                              the third Shift+click starts a fresh group,
 *                              so a pin is never silently reused
 *   link (Ctrl/⌘+Shift+click)  joins the previous selection pin, however
 *                              long its run already is — repeat it and a
 *                              chain emerges: ①─②─③
 *
 * And because the kind rides on each pin, the two mix in one session:
 * a paired card gap and a chained row rhythm can sit on one screenshot.
 *
 * The walk builds RUNS (maximal connected sequences), then hands every
 * consecutive segment to the consumers — a run [c,d,e] is the groups
 * [c,d] and [d,e], exactly the two-pin shape groups() always had, so no
 * consumer learns any of this happened.
 */
export function form(pins) {
        const K = CONFIG.PIN_KIND;
        const sel = pins.filter((p) => p.kind === K.SHIFT || p.kind === K.CHAIN);
        const runs = [];
        for (const p of sel) {
          const last = runs[runs.length - 1];
          // a link joins whatever is open; a pair only ever completes a
          // single — past two, a pair pin means "start fresh"
          if (last && (p.kind === K.CHAIN || last.length === 1)) last.push(p);
          else runs.push([p]);
        }
        const groups = [];
        for (const run of runs)
          for (let k = 0; k + 1 < run.length; k++) groups.push([run[k], run[k + 1]]);
        // a run of one is a selection still waiting — for its pair, or for
        // the first link to arrive. Only the last run can be one long: every
        // later selection pin would have joined or closed it.
        const lastRun = runs[runs.length - 1];
        const pending = lastRun && lastRun.length === 1 ? lastRun[0] : null;
        return { groups, pending };
}
