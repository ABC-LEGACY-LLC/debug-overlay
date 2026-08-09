  /* ======================================================================
     1. CONFIG
     ====================================================================== */
  const CONFIG = {
    Z: 2147483647,
    GRID: 4,                  // px grid the "grid" tool checks against
    PEEK: 10,                 // px of panel visible when tucked
    TUCK_DELAY: 2200,         // ms idle before the panel tucks away
    EDGE_MARGIN: 8,
    BADGE_MARGIN: 6,
    POS_KEY: '__dbgov_pos',
    TOOLS_KEY: '__dbgov_tools',
    DEFAULT_TOOLS: ['measure', 'grid'],
    // 'pairs' = every measurement takes two clicks (from → to) and the next
    //           click starts a fresh pair, so a pin is never reused silently.
    // 'chain' = old behaviour: each pin measures to the previous one.
    MEASURE_MODE: 'pairs',
    // A pin's "kind" names which tool consumes it. Defined once here so the
    // input layer, controller and renderer never hardcode a tool's id.
    PIN_KIND: { PLAIN: 'note', SHIFT: 'measure' },
    LANE_SEP: 16,             // px between parallel dimension lines
    HOTKEY: { alt: true, shift: true, ctrl: false, code: 'KeyD' },
    REMOVE_KEY: 'KeyX',       // hold to reveal ✕ on pins and click one to remove
    CONTRAST: { normal: 4.5, large: 3.0, largePx: 24, largeBoldPx: 18.66 },
  };
