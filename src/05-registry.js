  /* ======================================================================
     5. TOOLS — ⭐ the plugin registry

        No tool ever names another tool. When one needs something another
        provides it asks the registry a question with no id in it.

        A tool declares nothing about what it IS. What it can do is the set of
        hooks it implements, and that is what everything dispatches on — a
        label would only repeat it, and could go stale against it.

        Roles are not exclusive. A tool may decorate other tools' numbers AND
        produce findings; grid does both.

        Hooks, all optional, all invoked as hook.call(tool, …):
          badge(info)    → HTML string for the full badge
          compact(info)  → HTML string for the compact badge
          report(info)   → array of report lines
          reportTail()   → array of summary lines, after every pin block
          draw(ctx)      → custom drawing; ctx = { layer, Place, State, U }
          listRows()     → panel list rows { tag, label, detail, pins }
          pendingIndex() → index into State.pins of a pin still being chosen
          annotate(html, n, info) → 'lens': wrap one number's html
          audit(info)    → 'rule': [{ el, severity, rule, message, key }]
          css            → stylesheet text, read from EVERY registered tool
     ====================================================================== */
  const TOOLS = [];
  /** Register a debug tool. One call per file in src/tools/. */
  const defineTool = (t) => { TOOLS.push(t); return t; };

  const Tools = {
    all: TOOLS,
    byId: (id) => TOOLS.find((t) => t.id === id),
    active: () => TOOLS.filter((t) => State.tools.has(t.id)),

    /**
     * Tools are asked what they can DO, never what they are. A `kind` field
     * used to answer this, and it could only ever repeat what the hooks
     * already said — audit.js checked it by grepping for the hook, which is
     * the tell. Worse, one label per tool forced roles to be exclusive, so
     * grid could decorate numbers or produce findings but not both, for no
     * reason beyond the shape of the label.
     *
     * `armed` matters for anything the user SEES and not for anything that
     * gets CHECKED, so the caller says which it wants.
     */
    withHook: (h, armed) =>
      TOOLS.filter((t) => t[h] && (!armed || State.tools.has(t.id))),

    /**
     * WHY THIS EXISTS: measure used to ask whether one specific NAMED tool was
     * switched on before it printed a padding, which made this file's claim
     * that tools are independent a lie. It asks this instead — "how does a
     * number want decorating here?" — and neither side learns the other's id,
     * because the only thing that knows both of them is the registry.
     *
     * Returns null when no lens is on, which is what keeps undecorated output
     * byte-for-byte what it was. Lenses fold in registry order (= filename
     * order), each one wrapping the previous one's html.
     */
    annotator(info) {
      const lenses = Tools.withHook('annotate', true);
      if (!lenses.length) return null;
      return (n) => lenses.reduce(
        (html, t) => t.annotate?.call(t, html, n, info) || html, `${n}`);
    },
  };
