  /* ======================================================================
     1. CONFIG
     ====================================================================== */
  const CONFIG = {
    Z: 2147483647,
    GRID: 4,                  // px grid the "grid" tool checks against
    // Above this, a margin or padding is layout arithmetic rather than a
    // spacing token. getComputedStyle resolves `margin: auto` to the pixels it
    // worked out — 1127px on a real page — and nothing distinguishes that from
    // a value somebody typed. Nobody types 1127px; nobody types past this.
    GRID_MAX: 96,
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
    // Findings vocabulary, shared by every 'rule' tool. The number is only a
    // rank, so a list of findings reads worst-first.
    SEVERITY: { error: 3, warn: 2, info: 1 },
    // Marks drawn per tool per frame. A page can return thousands of findings
    // and this runs at 60fps, so it is a ceiling on cost, not on truth — the
    // list and the report still carry every one of them.
    MARK_LIMIT: 200,
  };
