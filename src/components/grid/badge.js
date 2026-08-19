import { Scale } from './service.js';

/**
 * ITS OWN SURFACE — the thing this tool was missing.
 *
 * annotate() below is a LENS: it decorates numbers other tools print, so
 * with nothing else armed it had nothing to decorate and this tool showed
 * absolutely nothing. Correct, silent and indistinguishable from broken —
 * a measured fact: armed alone it produced zero badges and zero ⚠.
 *
 * A component has to be worth arming by itself. This says what is off the
 * grid without needing anyone else to have printed it first, and stays
 * useful next to measure because it summarises where measure enumerates.
 */
export function badge(i) {
        const bad = Scale.scan(i, true);
        if (!bad.length) return null;
        // by value, not by side: 7px used on three edges is one decision
        const vals = [...new Set(bad.map(([, v]) => v))];
        return `<span class="warn">⚠ ${vals.join(' ')} off ${Scale.step()}px</span>`;
}

export function compact(i) {
        const bad = Scale.scan(i, true);
        return bad.length ? `<span class="warn">⚠${bad.length}</span>` : null;
}
