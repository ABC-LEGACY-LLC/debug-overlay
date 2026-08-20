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
        return [
          { mark: '4.5:1 AA\u2713', means: 'green: meets the level set under the settings button' },
          { mark: '2.8:1 AA\u2717', means: 'red: below it' },
          { mark: 'contrast ?', means: 'grey: not measurable - a gradient, an image, an unreadable colour space' },
        ];
}
