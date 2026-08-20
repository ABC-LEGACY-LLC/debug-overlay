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
