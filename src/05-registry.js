  /* ======================================================================
     5. TOOLS — ⭐ the plugin registry
        Each tool is fully independent. Hooks (all optional):
          badge(info)   → HTML string for the full badge
          compact(info) → HTML string for the compact badge
          report(info)  → array of report lines
          draw(ctx)     → custom drawing; ctx = { layer, Place, State, U }
     ====================================================================== */
  const TOOLS = [];
  /** Register a debug tool. One call per file in src/tools/. */
  const defineTool = (t) => { TOOLS.push(t); return t; };

  const Tools = {
    all: TOOLS,
    byId: (id) => TOOLS.find((t) => t.id === id),
    active: () => TOOLS.filter((t) => State.tools.has(t.id)),
    isActive: (id) => State.tools.has(id),
  };
