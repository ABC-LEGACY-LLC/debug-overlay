import { Tools } from '../../core/registry.js';
import { BadgeFace } from './options.js';
  /* ======================================================================
    BADGES — composed from ACTIVE tools only
     ====================================================================== */
  export const Badges = {
    /** The VIEW axis's live value — the renderer asks per frame. */
    view: () => Tools.setting(BadgeFace, 'view'),

    /** The FACETS, as the neutral contract object build() stamps onto the
     *  info it hands the tools. Lenses read it from there (and the ISSUE
     *  gate sits in Tools.annotator), so no tool ever imports this file. */
    facets: () => ({ issues: !!Tools.setting(BadgeFace, 'issues'),
                     suggest: !!Tools.setting(BadgeFace, 'suggest') }),

    build(info, compact) {
      // Stamped here and only here: the report path hands tools the same
      // info UNstamped, so gating stays badge ink and nothing else.
      info.facets = Badges.facets();
      const parts = [];
      for (const t of Tools.active()) {
        const fn = compact ? (t.compact || null) : (t.badge || null);
        if (!fn) continue;
        const html = fn.call(t, info);
        if (html) parts.push(html);
      }
      return parts.join(' · ');
    },
  };
