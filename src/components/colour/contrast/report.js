import { Colour } from './service.js';

export function report(i) {
        const c = Colour.measure(i);
        if (!c) return [];
        if (c.unknown) return [`  contrast: not measured — ${Colour.why[c.unknown]}`];
        return [`  contrast: ${c.ratio.toFixed(2)}:1 vs required ${c.need} (${c.isLarge ? 'large' : 'normal'} text) → ${c.pass ? 'PASS' : 'FAIL'}`];
}
