import { Tools } from '../core/registry.js';
  /* ======================================================================
    BADGES — composed from ACTIVE tools only
     ====================================================================== */
  export const Badges = {
    build(info, compact) {
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
