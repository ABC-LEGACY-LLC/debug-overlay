import { Colour } from './service.js';

export function badge(i) {
        const c = Colour.measure(i);
        if (!c) return null;
        // say so on hover too — silence here is what taught the eye to trust
        // a page the tool had not actually checked
        if (c.unknown) return `<span class="dbgov-unk">contrast ?</span>`;
        const cls = c.pass ? 'dbgov-ok' : 'dbgov-bad';
        return `<span class="${cls}">${c.ratio.toFixed(2)}:1 ${c.level}${c.pass ? '✓' : '✗'}</span>`;
}

export function compact(i) {
        const c = Colour.measure(i);
        if (!c || c.unknown || c.pass) return null;   // quiet unless it fails
        return `<span class="dbgov-bad">${c.ratio.toFixed(1)}:1 ✗</span>`;
}

/** Three answers, three colours - pass, fail, and could-not-measure. */
export function legend() {
        /* No level and no ratio in these marks: the level is a SETTING, and a
           legend that spelled "4.5:1 AA" would go on saying it after the user
           chose AAA — the same lie a title claiming "2px" told about the grid
           step. The shape is what a legend is for; the number is on the badge. */
        return [
          { mark: 'ratio \u2713', means: 'green: meets the WCAG level set above' },
          { mark: 'ratio \u2717', means: 'red: below it' },
          { mark: 'contrast ?', means: 'blue italic: not measurable - a gradient, an image, an unreadable colour space' },
        ];
}
