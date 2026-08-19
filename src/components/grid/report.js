import { Scale } from './service.js';

export function report(i) {
        const bad = Scale.scan(i, true);
        return bad.length
          ? [`  ⚠ off ${Scale.step()}px grid: ` +
             `${bad.map(([n, v]) => `${n}:${v}`).join(', ')}`]
          : [];
}
