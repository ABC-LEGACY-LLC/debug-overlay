  /* ======================================================================
    CONTROLLER — the only glue
     ====================================================================== */
  const Controller = {
    setPower(v) {
      State.enabled = v;
      if (!v) State.hoverEl = null;
      // A selection the page already had would be extended by the first
      // shift-click instead of measured from, so start the session clean.
      if (v) { try { getSelection()?.removeAllRanges(); } catch {} }
      if (!v) State.sweep = null;   // the page moves on; a stale audit lies
      Panel.setSwept(!!State.sweep);
      Panel.setOn(v);
      Render.schedule();
    },
    togglePower() { Controller.setPower(!State.enabled); },

    /**
     * Audit the whole page rather than the elements under the cursor. The
     * result is kept so the report and any findings surface read the same
     * pass — sweeping again per reader would give two different answers on a
     * page that moved in between.
     */
    sweep() {
      if (!State.enabled) return;
      State.sweep = Sweep.run();
      // the grouped count, not the raw one: "3" is a page with three problems,
      // "5000" is the same page with one of them on every row
      Panel.flash(`${Sweep.group(State.sweep.findings).length}`, '[data-sweep]');
      Panel.setSwept(true);
      Panel.toggleList(true, 'findings');
      Render.schedule();   // the marks are new; nothing else would ask for them
    },

    /** Rows for whichever view the panel is showing. */
    rows(view) {
      if (view === 'settings') return Settings.rows();
      return view === 'findings' ? Controller.findingRows() : Controller.pinList();
    },

    /**
     * A row changed. Which row depends on the view showing, so this asks for
     * that view's rows — indexing settings by a number that came from the pin
     * list would write the wrong setting entirely.
     */
    changeRow(i, raw) {
      const row = Controller.rows(Panel.view())[i];
      if (!row) return;
      // a tool's own row carries its own handler; a settings row carries the
      // option it was built from
      if (row.onChange) {
        row.onChange(raw);
        Render.schedule();
        Controller.refreshList();
        return;
      }
      if (!row.opt) return;
      const v = Settings.fromControl(row, raw);
      if (v === null) { Controller.refreshList(); return; }   // put the field back
      Settings.apply(row, v);
      /* The last sweep was judged under the OLD setting — but only a setting
         that feeds a rule can have changed a verdict. Discarding the audit
         because somebody switched what Ctrl+click copies threw away the most
         expensive thing the tool does (~77% getComputedStyle over every
         element) for a preference no rule consults. `affects` already says
         which is which. */
      if (row.opt.affects === 'detect') { State.sweep = null; Panel.setSwept(false); }
      Render.schedule();
      Controller.refreshList();
    },
    /** One row per distinct problem, worst first. No pin, so nothing to remove. */
    findingRows() {
      const rows = Sweep.group(State.sweep ? State.sweep.findings : []).map((g) => ({
        tag: (g.verdict === 'review' ? 'review' : g.severity) + (g.n > 1 ? ` ×${g.n}` : ''),
        label: g.message,
        // the leaf, not the whole path: a row has to be scannable, and the
        // full ancestor chain is in the copied report where there is room
        detail: U.selectorOf(g.el).split(' > ').pop(),
        accent: g.verdict === 'review' ? 'review' : g.severity,
        el: g.el,
      }));
      /* A cap nobody is told about reads as "this is everything on the page".
         Only say it when it actually bit: a rule that DRAWS and is armed and
         found more than it can paint. Asking per drawing tool rather than of
         the raw total keeps the message true — the limit is per rule, and a
         rule with no draw() paints nothing to cap. */
      const capped = State.sweep ? Tools.withHook('draw', true)
        .map((t) => (State.sweep.byTool[t.id] || []).length)
        .filter((n) => n > CONFIG.MARK_LIMIT) : [];
      if (capped.length) {
        rows.unshift({
          heading: `${Math.max(...capped)} found by one rule`,
          detail: `the page shows the first ${CONFIG.MARK_LIMIT} of each — this list is complete`,
        });
      }
      return rows;
    },
    /**
     * Three different silences, and they must not share a sentence. Nobody has
     * asked yet; nothing could ask, because no rule exists; or every rule ran
     * and had nothing to say. Only the third is good news.
     */
    emptyFor(view) {
      if (view === 'settings') return 'No tool has anything to configure.';
      if (view !== 'findings') return 'No pins yet — click to inspect, Shift+click to measure.';
      const s = State.sweep;
      if (!s) return 'Press ⌕ to audit the page.';
      if (!s.rules) return 'No rules are installed, so nothing was checked.';
      return `No findings — ${s.rules} rule${s.rules === 1 ? '' : 's'} ` +
             `over ${s.elements} elements.`;
    },

    toggleTool(id) {
      if (!Tools.byId(id)) return;
      State.tools.has(id) ? State.tools.delete(id) : State.tools.add(id);
      Panel.setTool(id, State.tools.has(id));
      Store.set(CONFIG.TOOLS_KEY, JSON.stringify([...State.tools]));
      Render.schedule();
      Controller.refreshList();
    },
    /**
     * Which tools are armed. A saved set wins; failing that, each tool decides
     * for itself with `startsOn`. Ids only ever come from the registry or from
     * something the registry already vouched for, so no core file spells one.
     */
    loadTools() {
      const registered = TOOLS.map((t) => t.id);
      let ids = TOOLS.filter((t) => t.startsOn).map((t) => t.id);
      let seen = null;
      try {
        const s = JSON.parse(Store.get(CONFIG.SEEN_KEY) || 'null');
        if (Array.isArray(s)) seen = s;
      } catch {}
      try {
        const saved = JSON.parse(Store.get(CONFIG.TOOLS_KEY) || 'null');
        if (Array.isArray(saved)) {
          /* A saved set answers for the tools that existed when it was
             written. Treating it as the whole answer meant a capability
             shipped later arrived switched off and unmentioned — under an
             update model whose entire promise is that nothing needs doing.
             So a tool this install has never met gets its own say; one it has
             met keeps whatever the user decided, including "off". */
          const known = seen || registered;   // first run after this shipped: nothing is new
          ids = saved.filter((id) => Tools.byId(id));
          for (const t of TOOLS) if (t.startsOn && !known.includes(t.id)) ids.push(t.id);
        }
      } catch {}
      Store.set(CONFIG.SEEN_KEY, JSON.stringify(registered));
      State.tools = new Set(ids.filter((id) => Tools.byId(id)));
      TOOLS.forEach((t) => Panel.setTool(t.id, State.tools.has(t.id)));
    },

    // kind: CONFIG.PIN_KIND.PLAIN → inspect only, no measuring
    //       CONFIG.PIN_KIND.SHIFT → joins the pairing queue and draws lines
    togglePin(el, kind = CONFIG.PIN_KIND.PLAIN) {
      const i = State.pins.findIndex((p) => p.el === el);
      if (i >= 0) {
        // same modifier → unpin; different modifier → switch this pin's role
        if (State.pins[i].kind === kind) State.pins.splice(i, 1);
        else State.pins[i].kind = kind;
      } else {
        State.pins.push({ el, id: ++State.pinSeq, kind });
      }
      Render.schedule();
      Controller.refreshList();
    },
    setRemoveMode(v) {
      State.removeMode = v;
      if (!v) State.removeTarget = null;
      if (v) State.hoverEl = null;
      Panel.setRemoveMode(v);
      Render.schedule();
    },
    removePin(pin) {
      const i = State.pins.indexOf(pin);
      if (i >= 0) State.pins.splice(i, 1);
      State.removeTarget = null;
      Render.schedule();
      Controller.refreshList();
    },
    /**
     * The panel's pin list. Active tools claim the pins they own (measure
     * claims its pairs); whatever is left over gets a plain row. The panel
     * itself never learns what a "pair" is.
     */
    pinList() {
      const rows = [];
      const claimed = new Set();
      for (const t of Tools.active()) {
        for (const row of (t.listRows?.call(t) || [])) {
          row.pins.forEach((p) => claimed.add(p));
          rows.push(row);
        }
      }
      for (const p of State.pins) {
        if (claimed.has(p)) continue;
        if (!document.contains(p.el)) continue;
        const r = p.el.getBoundingClientRect();
        rows.push({ tag: `#${p.id}`, label: U.labelOf(p.el),
                    detail: `${Math.round(r.width)}×${Math.round(r.height)}`, pins: [p] });
      }
      const first = (row) => Math.min(...row.pins.map((p) => p.id));
      // every row here owns pins, so every row here can drop them — the panel
      // renders a ✕ only where the row says one belongs
      rows.forEach((r) => { r.removable = true; });
      return rows.sort((a, b) => first(a) - first(b));
    },
    refreshList() {
      if (!Panel.isListOpen()) return;
      const view = Panel.view();
      Panel.setList(Controller.rows(view), Controller.emptyFor(view));
    },
    revealRow(i) {
      const row = Controller.rows(Panel.view())[i];
      if (!row) return;
      // A finding has no pin, so clicking one pins the element on the way to
      // it. That is the useful move anyway: the badge, the measurements and
      // the copied report all pick it up from there.
      let pins = row.pins;
      if (!pins) {
        if (!row.el || !document.contains(row.el)) return;
        const had = State.pins.find((p) => p.el === row.el);
        if (!had) Controller.togglePin(row.el, CONFIG.PIN_KIND.PLAIN);
        pins = [State.pins.find((p) => p.el === row.el)];
      }
      const el = pins[0].el;
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      State.flashPins = pins;
      Render.schedule();
      clearTimeout(Controller._flash);
      Controller._flash = setTimeout(() => { State.flashPins = null; Render.schedule(); }, 900);
    },
    removeRow(i) {
      const row = Controller.pinList()[i];
      if (!row) return;
      row.pins.forEach((p) => {
        const k = State.pins.indexOf(p);
        if (k >= 0) State.pins.splice(k, 1);
      });
      Render.schedule();
      Controller.refreshList();
    },
    /**
     * Clears everything the overlay has put ON the page — pins and the audit's
     * outlines. It used to clear pins only, so an audit's 200 outlines had no
     * exit at all: the ⌕ flash expired, the bar looked idle, and the page
     * stayed covered with no control that admitted it.
     */
    clearPins() {
      State.pins = [];
      State.pinSeq = 0;
      State.sweep = null;
      Panel.setSwept(false);
      Render.schedule();
      Controller.refreshList();
    },
    toggleDetail() {
      State.detail = !State.detail;
      Panel.setDetail(State.detail);
      Render.schedule();
    },
  };
