import { Tools } from '../../../core/registry.js';
import { U } from '../../../core/utils.js';

export function badge(i) {
        const { el, r, cs } = i;
        // whatever decoration applies here — never "is <some named tool> on"
        const dec = Tools.annotator(i);
        const on = (k) => Tools.setting(this, k);
        const bits = [];
        if (on('size')) bits.push(`<span class="sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`);
        if (on('radius')) { const rad = U.radius(cs); if (rad) bits.push(`<span class="rad">r ${rad}</span>`); }
        if (on('padding')) { const p = U.four(cs, 'padding', dec); if (p) bits.push(`<span class="sp">p ${p.join(' ')}</span>`); }
        if (on('margin')) { const m = U.four(cs, 'margin', dec); if (m) bits.push(`<span class="sp">m ${m.join(' ')}</span>`); }
        if (on('layout') && (cs.display.includes('flex') || cs.display.includes('grid'))) {
          const g = U.px(cs.columnGap) || U.px(cs.gap);
          bits.push(`<span class="sp">${U.esc(cs.display)}${g ? ' gap ' + U.mark(g, dec) : ''}</span>`);
        }
        if (on('font')) bits.push(`<span class="fnt">${U.px(cs.fontSize)}/${U.px(cs.lineHeight) || '–'} ${cs.fontWeight}</span>`);
        // the id is page-authored text on its way to innerHTML — never raw
        if (on('tag')) bits.push(`<span class="tag">${el.tagName.toLowerCase()}${el.id ? '#' + U.esc(el.id) : ''}</span>`);
        return bits.join(' · ');
}

export function compact(i) {
        const { r, cs } = i;
        const dec = Tools.annotator(i);
        const on = (k) => Tools.setting(this, k);
        const bits = [];
        if (on('size')) bits.push(`<span class="sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`);
        if (on('radius')) { const rad = U.radius(cs); if (rad) bits.push(`<span class="rad">r ${rad}</span>`); }
        // deliberately padding only — the compact badge never marked m or gap
        if (on('padding')) { const p = U.four(cs, 'padding', dec); if (p) bits.push(`<span class="sp">p ${p.join(' ')}</span>`); }
        return bits.join(' · ');
}

/**
 * INSPECT, and only INSPECT. The pairing that used to live here is a
 * SELECT tool now; this asks the registry what is grouped and measures
 * between whatever comes back. Drawing the gap between two elements is a
 * measurement — deciding WHICH two is not, and keeping both here is what
 * made this tool two things at once.
 */
/**
 * WHICH FIELDS THE BADGE SHOWS. A full badge reads
 * `92×4 · r 9999 · p 6 8 · m 0 · flex gap 8 · 14/20 500 · div#hero`,
 * which is a lot of ink over the page when you came to look at one
 * number. These decide what is on it.
 *
 * They govern the BADGES only, never `report()`. A badge sits on top of
 * what you are reading, so density costs you something; the copied
 * report is text you paste into a chat, where a line you do not need
 * costs nothing and a line you do need costs a round trip.
 */
export function options() {
        // Written out rather than built by a helper: audit.js counts `key:`
        // against `affects:` to catch an option that declares neither, and a
        // factory would satisfy it once for all seven. Longhand keeps that
        // check honest, and greppable.
        return [
          { key: 'size', label: 'Size', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'radius', label: 'Radius', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'padding', label: 'Padding', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'margin', label: 'Margin', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'layout', label: 'Display & gap', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'font', label: 'Font', def: true, type: 'toggle', affects: 'inspect' },
          { key: 'tag', label: 'Tag & id', def: true, type: 'toggle', affects: 'inspect' },
        ];
}
