  /* ======================================================================
     1. CONFIG
     ====================================================================== */
  /**
   * Anything a tool exposes through its options() hook takes its DEFAULT from
   * here and its current value from the panel. So this file still answers "what
   * does a fresh install do", and the ⚙ view answers "what is this one doing
   * now" — without a second copy of the number living anywhere.
   */
  const CONFIG = {
    // Substituted by build.js at bundle time. A userscript with @grant none
    // cannot read GM_info, and an overlay that cannot say which version it is
    // makes a stale install look exactly like a current one — which is the
    // failure this project has already had once, from the other end.
    VERSION: '__VERSION__',
    Z: 2147483647,
    // The step the "grid" tool checks against. 2, not 4, because that is what
    // the scale in front of us actually is: Tailwind's default spacing has
    // half-steps (0.5 = 2px, 1.5 = 6px, 2.5 = 10px) and a real page used them
    // 2,681 times. A rule has to check the scale a project HAS; making the
    // project match the rule is the wrong way round. Set it to 4 or 8 for a
    // project that keeps to whole steps.
    GRID: 2,
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
    SETTINGS_KEY: '__dbgov_settings',
    // No DEFAULT_TOOLS list here any more. It named tool ids in a core file,
    // so shipping a tool that should start armed meant editing this — the one
    // place "a new tool is one new file" was not literally true. A tool says
    // `startsOn: true` about itself instead, and nothing central has to know
    // the name of anything.
    // 'pairs' = every measurement takes two clicks (from → to) and the next
    //           click starts a fresh pair, so a pin is never reused silently.
    // 'chain' = old behaviour: each pin measures to the previous one.
    MEASURE_MODE: 'pairs',
    // A pin's "kind" names which tool consumes it. Defined once here so the
    // input layer, controller and renderer never hardcode a tool's id.
    PIN_KIND: { PLAIN: 'note', SHIFT: 'measure' },
    PICK_FLASH: 700,          // ms an element stays outlined after being picked
    LANE_SEP: 16,             // px between parallel dimension lines
    HOTKEY: { alt: true, shift: true, ctrl: false, code: 'KeyD' },
    REMOVE_KEY: 'KeyX',       // hold to reveal ✕ on pins and click one to remove
    // `level` is the default the panel starts on; `levels` is what it offers.
    // The two thresholds move together — a rule that checked AAA for body text
    // and AA for headings would be neither.
    CONTRAST: {
      largePx: 24, largeBoldPx: 18.66,
      level: 'AA',
      levels: { AA: { normal: 4.5, large: 3.0 }, AAA: { normal: 7.0, large: 4.5 } },
    },
    // Findings vocabulary, shared by every 'rule' tool. The number is only a
    // rank, so a list of findings reads worst-first.
    SEVERITY: { error: 3, warn: 2, info: 1 },
    // Marks drawn per tool per frame. A page can return thousands of findings
    // and this runs at 60fps, so it is a ceiling on cost, not on truth — the
    // list and the report still carry every one of them.
    MARK_LIMIT: 200,
  };
