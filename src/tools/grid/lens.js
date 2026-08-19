import { Scale } from './service.js';
import { Tools } from '../../core/registry.js';

/**
 * LENS hook: every number another tool prints comes through here first.
 * `html` is what earlier lenses made of it, so we wrap rather than
 * replace, and the ⚠ markup sits next to the .warn rule for it.
 *
 * The judgement itself is the subject's — this decides how to SHOW an
 * off-grid number, not what one is. That is the whole point of the
 * split: the rule below reaches the same verdict through the same call.
 */
export function annotate(html, n) {
        if (!Scale.judges(n)) return html;
        // ISSUE always; RECOMMENDATION only when asked. Both answers come from
        // the subject, so the mark and the suggestion cannot disagree.
        const fix = Tools.setting(this, 'suggest') ? `→${Scale.nearest(n)}` : '';
        return `<span class="warn">${html}⚠${fix}</span>`;
}
