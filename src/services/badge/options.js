import { CONFIG } from '../../core/config.js';
import { defineService, Tools } from '../../core/registry.js';

/**
 * The badge service's settings face — 🏷 on the bar, rows under ⚙, one
 * store behind both.
 *
 * Two axes, deliberately not one:
 *
 *   VIEW    how much ink — compact or full. Was `State.detail`, a boolean
 *           the ≡ button flipped and a reload forgot; a VALUE in the one
 *           settings store persists like everything else the user chose.
 *   FACETS  which KINDS of content render on badges — ISSUE marks (⚠, the
 *           lenses) and RECOMMENDATIONS (→N, what would pass). Gating is
 *           badge ink only: the report always carries everything, and ⌕
 *           findings are a different service entirely.
 *
 * `was: 'grid'` because `suggest` was the grid tool's option first. A
 * recommendation is a badge-level fact — tomorrow's contrast suggestion
 * must obey the same switch, and two toggles for one facet is the
 * two-settings-cancel trap — so the badge face owns it and adopts what
 * anyone had saved under grid. One control, as before; a different owner.
 *
 * `glyph`/`glyphs` are the flyout's member faces, declared beside the
 * option they belong to so the flyout derives from options() and cannot
 * drift from the ⚙ rows built from the same call.
 */
export const BadgeFace = defineService({
        id: 'badge',
        icon: '🏷',
        title: 'Badge — view and facets',
        was: 'grid',
        options() {
          return [
            { key: 'view', label: 'Badge view', def: CONFIG.BADGE_MODES[0],
              values: CONFIG.BADGE_MODES, glyphs: { compact: '▬', full: '▤' },
              affects: 'inspect' },
            { key: 'issues', label: 'Issue marks (⚠)', def: true,
              type: 'toggle', glyph: '⚠', affects: 'inspect' },
            { key: 'suggest', label: 'Suggest what would pass (→)', def: false,
              type: 'toggle', glyph: '→', affects: 'inspect' },
          ];
        },

        /**
         * The 🏷 flyout, two levels deep: press the mark and you get the two
         * AXES — ◫ View and ◈ Facets — and only pressing an axis reveals its
         * members. Four flat buttons made the two axes read as one soup.
         *
         * DERIVED from options() in this same file, so the flyout and the ⚙
         * rows come from one declaration: the values option is the View
         * axis's radio, every toggle is a Facets member. CURRENT is the one
         * member with no option behind it — it is listed because the family
         * has three facets, and FIXED because switching it off would leave
         * 🏷 controlling nothing: it IS the badge.
         */
        groups() {
          const opts = this.options();
          const view = opts.find((o) => o.values);
          return [
            { key: 'view', glyph: '◫', title: 'View — how much ink; press to choose',
              rows: view.values.map((v) => ({
                key: `${view.key}:${v}`, glyph: (view.glyphs || {})[v] || String(v),
                title: `${view.label} — ${v}`,
                armed: Tools.setting(this, view.key) === v })) },
            { key: 'facets', glyph: '◈', title: 'Facets — which kinds of content render; press to choose',
              rows: [
                { fixed: true, glyph: '＝', armed: true,
                  title: "Current — the component's own fields. Always on: this is the badge itself" },
                ...opts.filter((o) => o.type === 'toggle').map((o) => ({
                  key: o.key, glyph: o.glyph || o.label, title: o.label,
                  armed: !!Tools.setting(this, o.key) })),
              ] },
          ];
        },
});
