  /* ======================================================================
    14. CONTROLLER — the only glue
     ====================================================================== */
  const Controller = {
    setPower(v) {
      State.enabled = v;
      if (!v) State.hoverEl = null;
      // A selection the page already had would be extended by the first
      // shift-click instead of measured from, so start the session clean.
      if (v) { try { getSelection()?.removeAllRanges(); } catch {} }
      if (!v) State.sweep = null;   // the page moves on; a stale audit lies
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
      Panel.toggleList(true, 'findings');
      Render.schedule();   // the marks are new; nothing else would ask for them
    },

    /** Rows for whichever view the panel is showing. */
    rows(view) {
      if (view === 'settings') return Controller.settingRows();
      return view === 'findings' ? Controller.findingRows() : Controller.pinList();
    },

    /**
     * One row per option per tool, in registry order. Nothing here knows what
     * any option MEANS — the tool named it, gave it its choices and supplied
     * the default; this turns that into rows and turns a chosen index back
     * into the tool's own value.
     */
    settingRows() {
      const rows = [];
      for (const t of Tools.withHook('options')) {
        for (const o of t.options.call(t)) {
          const cur = Tools.setting(t, o.key);
          // A default the tool does not list among its own choices would show
          // as choice 0 while the rule went on using something else — a picker
          // quietly disagreeing with the thing it claims to control. Carry the
          // live value as a choice instead, so what is in force is always on
          // screen and always selectable.
          const values = o.values.includes(cur) ? o.values : [cur, ...o.values];
          rows.push({
            tag: t.icon,
            label: o.label,
            choices: values.map((v) => `${v}${o.suffix || ''}`),
            selected: values.indexOf(cur),
            tool: t, opt: o, values,
          });
        }
      }
      return rows;
    },
    changeSetting(i, choice) {
      const row = Controller.settingRows()[i];
      if (!row) return;
      const v = row.values[choice];   // the list the panel was shown, not the raw one
      if (v === undefined) return;
      (State.settings[row.tool.id] ||= {})[row.opt.key] = v;
      Store.set(CONFIG.SETTINGS_KEY, JSON.stringify(State.settings));
      // The last sweep was judged under the OLD setting. Leaving it up would
      // keep findings on screen that the rule would no longer make, with
      // nothing saying why — the same lie as a stale audit after the page
      // moves on, and it costs one click to run again.
      State.sweep = null;
      Render.schedule();
      Controller.refreshList();
    },
    /**
     * Every option's default comes from the tool, and the saved value only
     * overrides it if the tool still offers it. Resolved once, here, so that
     * Tools.setting() stays a lookup: grid asks for its step once per number
     * on a page that has thousands of them.
     */
    loadSettings() {
      let saved = {};
      try { saved = JSON.parse(Store.get(CONFIG.SETTINGS_KEY) || '{}') || {}; } catch {}
      const out = {};
      for (const t of Tools.withHook('options')) {
        out[t.id] = {};
        for (const o of t.options.call(t)) {
          const was = saved[t.id]?.[o.key];
          out[t.id][o.key] = o.values.includes(was) ? was : o.def;
        }
      }
      State.settings = out;
    },
    /** One row per distinct problem, worst first. No pin, so nothing to remove. */
    findingRows() {
      return Sweep.group(State.sweep ? State.sweep.findings : []).map((g) => ({
        tag: (g.verdict === 'review' ? 'review' : g.severity) + (g.n > 1 ? ` ×${g.n}` : ''),
        label: g.message,
        // the leaf, not the whole path: a row has to be scannable, and the
        // full ancestor chain is in the copied report where there is room
        detail: U.selectorOf(g.el).split(' > ').pop(),
        accent: g.verdict === 'review' ? 'review' : g.severity,
        el: g.el,
      }));
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
    loadTools() {
      let ids = CONFIG.DEFAULT_TOOLS;
      try {
        const saved = JSON.parse(Store.get(CONFIG.TOOLS_KEY) || 'null');
        if (Array.isArray(saved)) ids = saved;
      } catch {}
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
    clearPins() {
      State.pins = [];
      State.pinSeq = 0;
      Render.schedule();
      Controller.refreshList();
    },
    toggleDetail() {
      State.detail = !State.detail;
      Panel.setDetail(State.detail);
      Render.schedule();
    },
  };
