  /* ======================================================================
     2. STATE
     ====================================================================== */
  const State = {
    enabled: false,      // master power
    detail: false,       // compact vs full badges
    tools: new Set(),    // active tool ids — filled by CONTROLLER on boot
    pins: [],            // [{ el, id, kind }] — kind ∈ CONFIG.PIN_KIND
    hoverEl: null,
    removeMode: false,   // true while the remove key is held
    removeTarget: null,  // pin object under the cursor in remove mode
    flashPins: null,     // pins briefly highlighted after "reveal" from the list
    pinSeq: 0,
  };
