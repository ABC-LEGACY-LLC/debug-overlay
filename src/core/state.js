  /* ======================================================================
     STATE — what is known now, and what is kept between visits

        STORE is here rather than in a section of its own because it is the
        same concern: State is what the overlay knows, Store is the part of
        that which outlives the page.

        WHY IT EXISTS: localStorage is scoped to one origin, and this script
        matches every site. So arming a tool or choosing a grid step on one
        domain taught the overlay nothing about the next one — every new site
        started from the defaults again, which is a setup step handed back to
        the user on every domain they visit. GM_getValue is per SCRIPT, and it
        rides Tampermonkey's own sync to a new machine.

        Both backends store the same JSON strings, so what is already in
        localStorage is readable as-is and gets adopted on first run.
     ====================================================================== */
  const Store = {
    /**
     * The manager only defines these when the header asks for them, and the
     * dev page, the tests and any manager without them have to keep working —
     * so every path falls back rather than losing what it was asked to keep.
     * `typeof` on an undeclared name is the only safe way to ask.
     */
    _gm: typeof GM_getValue === 'function' && typeof GM_setValue === 'function',

    /** The stored string for `key`, or null. Never throws. */
    get(key) {
      try {
        if (!Store._gm) return localStorage.getItem(key);
        const v = GM_getValue(key);
        if (v !== undefined && v !== null) return String(v);
        // First run after the grant landed. Adopt whatever this origin already
        // had, so nobody's tools and settings reset on the day it shipped —
        // and write it through, so the next origin inherits it too.
        const old = localStorage.getItem(key);
        if (old !== null) { GM_setValue(key, old); return old; }
        return null;
      } catch { return null; }
    },

    /** Persist `value` (a string). Storage being unavailable is not an error. */
    set(key, value) {
      try {
        if (Store._gm) GM_setValue(key, value);
        else localStorage.setItem(key, value);
      } catch {}
    },
  };

  /* ======================================================================
     STATE
     ====================================================================== */
  const State = {
    enabled: false,      // master power
    detail: false,       // compact vs full badges
    tools: new Set(),    // active tool ids — filled by CONTROLLER on boot
    // { toolId: { key: value } } for every option any tool declares. Filled
    // once on boot from the tools' own defaults, then overlaid with whatever
    // was saved, so the hot path is a lookup and never a hook call: grid asks
    // for its step once per number on a page with thousands of them.
    settings: {},
    pins: [],            // [{ el, id, kind }] — kind ∈ CONFIG.PIN_KIND
    hoverEl: null,
    removeMode: false,   // true while the remove key is held
    removeTarget: null,  // pin object under the cursor in remove mode
    flashPins: null,     // pins briefly highlighted after "reveal" from the list
    pinSeq: 0,
    // Last whole-page sweep: { findings, rules, elements }, or null if none
    // has been run. It carries what RAN, not only what was found, because a
    // zero that means "nothing was checked" and a zero that means "nothing is
    // wrong" must not print the same sentence. Cleared on power off: the DOM
    // moves on, and a stale page audit is worse than no audit.
    sweep: null,
  };
