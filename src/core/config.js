  /* ======================================================================
     CONFIG
     ====================================================================== */
  /**
   * Anything a tool exposes through its options() hook takes its DEFAULT from
   * here and its current value from the panel. So this file still answers "what
   * does a fresh install do", and the ⚙ view answers "what is this one doing
   * now" — without a second copy of the number living anywhere.
   */
  export const CONFIG = {
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
    // PER-ORIGIN, unlike everything else in the store: "debugging THIS site"
    // is a session fact about one origin, where a grid step is a fact about
    // the project. Global power would pop the overlay onto every site the
    // browser visits. Pins add the PATH: a pin on /live-map is not a pin on
    // /settings.
    POWER_KEY: '__dbgov_on',
    PINS_KEY: '__dbgov_pins',
    TOOLS_KEY: '__dbgov_tools',
    SETTINGS_KEY: '__dbgov_settings',
    // Which tool ids this install has already met. Without it a saved armed
    // set answers for tools that no longer exist and stays silent about ones
    // shipped since — so a new capability arrives switched off and invisible.
    SEEN_KEY: '__dbgov_seen',
    FLASH_MS: 1200,           // how long a button shows a transient message
    LIST_GAP: 10,             // px between the bar and the popover it opens
    LIST_PAD: 6,              // px the popover keeps from the viewport edge
    // No DEFAULT_TOOLS list here any more. It named tool ids in a core file,
    // so shipping a tool that should start armed meant editing this — the one
    // place "a new tool is one new file" was not literally true. A tool says
    // `startsOn: true` about itself instead, and nothing central has to know
    // the name of anything.
    // A pin's "kind" names the SELECTION the user made, never a consumer —
    // 'pair' used to be 'measure', which claimed one tool owned selection's
    // pins and leaked that id into a CSS class and the report text. Defined
    // once here so the input layer, controller and renderer share one word.
    //
    // pair and link replaced the 'Pin grouping' MODE. A technique is a
    // GESTURE, not a mode: Shift+click pairs, Ctrl/⌘+Shift+click chains to
    // the previous pin, and the two mix in one session — a mode switch made
    // the same finger do different things on different days, and two clicks
    // looked identical until the third betrayed which mode was on.
    PIN_KIND: { PLAIN: 'note', SHIFT: 'pair', CHAIN: 'link' },
    // The perf monitor's thresholds. FREEZE_MS is what counts as "stuck" —
    // 250ms is where humans stop reading an interaction as instant; a user
    // tunes it per project through the tool's own options().
    // CHURN is mutations/second on a WATCHED subtree before it counts as a
    // re-render storm (a React loop reads in the hundreds); RATE_WINDOW is
    // how far back the rolling rate looks.
    PERF: { FREEZE_MS: 250, LOG_MAX: 30, FPS_WINDOW: 1000,
            CHURN: 60, RATE_WINDOW: 2000 },
    // The badge service's VIEW axis, in order. 'compact' leads because it is
    // the shipped default — a full badge is a lot of ink over a page you came
    // to read one number off. A third view is one new entry here plus its
    // rendering; the 🏷 flyout and the ⚙ row both derive from this list.
    BADGE_MODES: ['compact', 'full'],
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
