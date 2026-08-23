import { Scale } from './service.js';

/**
 * LENS hook: every number another tool prints comes through here first.
 * `html` is what earlier lenses made of it, so we wrap rather than
 * replace, and the ⚠ markup sits next to the .warn rule for it.
 *
 * The judgement itself is the subject's — this decides how to SHOW an
 * off-grid number, not what one is. That is the whole point of the
 * split: the rule below reaches the same verdict through the same call.
 */
export function annotate(html, n, info) {
        if (!Scale.judges(n)) return html;
        // ISSUE always (the badge service's issues gate sits upstream, over
        // every lens at once); RECOMMENDATION only when the badge facet asks.
        // `suggest` was this tool's own option — it moved to the badge face,
        // where every future lens's suggestion obeys the same switch, and it
        // rides in on the stamped info so neither side learns a name. The
        // suggestion itself still comes from the subject, so the mark and
        // the fix cannot disagree.
        const fix = info?.facets?.suggest ? `→${Scale.nearest(n)}` : '';
        return `<span class="debug-overlay-warn">${html}⚠${fix}</span>`;
}
