  /* ======================================================================
    SETTINGS — the ⚙ view, and what a tool's options mean

        Split out of CONTROLLER, which had grown two jobs: wiring the modules
        together, and being the whole of the settings system. This is the
        second one. CONTROLLER still owns the dispatch — which view is showing,
        which row changed — because that is glue and glue is its job.

        Nothing here knows what any option MEANS. The tool named it, gave it
        its choices and supplied the default; this turns that into rows, and
        turns whatever the panel's widget produced back into the tool's own
        value.
     ====================================================================== */
  const Settings = {
    /**
     * One row per option, under a heading for what that option CHANGES.
     *
     * Grouped by category, not by owning tool. Ordered by filename, the list
     * read as one flat run of six unrelated knobs: how clicks pair up sat next
     * to a WCAG threshold sat next to what lands on the clipboard, and nothing
     * said they were different kinds of thing. The tool's icon still labels
     * every row, so which tool owns what is not lost — it is just no longer
     * the only structure on offer.
     *
     * An empty category prints no heading. A tool that adds the first ACT
     * option makes that section appear, and nothing here changes.
     */
    rows() {
      const out = [];
      for (const r of ROLES) {
        const rows = [];
        for (const t of Tools.withHook('options')) {
          for (const o of t.options.call(t)) {
            if (o.affects !== r.key) continue;
            rows.push({
              tag: t.icon,
              label: o.label,
              control: Settings.controlFor(o, Tools.setting(t, o.key)),
              tool: t, opt: o,
            });
          }
        }
        if (!rows.length) continue;
        out.push({ heading: r.label, detail: r.note });
        out.push(...rows);
      }
      return out;
    },

    /**
     * How one option wants drawing. An option with `values` is a choice; the
     * two typed kinds are for the settings a list cannot express — a threshold
     * somebody has to type, a thing that is simply on or off.
     */
    controlFor(o, cur) {
      if (o.type === 'number') {
        return { kind: 'number', value: String(cur), suffix: o.suffix || '',
                 min: o.min, max: o.max, step: o.step };
      }
      if (o.type === 'toggle') return { kind: 'toggle', on: !!cur };
      // A default the tool does not list among its own choices would show as
      // choice 0 while the rule went on using something else — a picker
      // quietly disagreeing with the thing it claims to control. Carry the
      // live value as a choice instead, so what is in force is always on
      // screen and always selectable.
      const values = o.values.includes(cur) ? o.values : [cur, ...o.values];
      return { kind: 'choice', values,
               choices: values.map((v) => `${v}${o.suffix || ''}`),
               selected: values.indexOf(cur) };
    },

    /** Is `v` something this option could actually be set to? */
    valid(o, v) {
      if (v === undefined || v === null) return false;
      if (o.type === 'number') {
        return typeof v === 'number' && Number.isFinite(v) &&
               v >= (o.min ?? -Infinity) && v <= (o.max ?? Infinity);
      }
      if (o.type === 'toggle') return typeof v === 'boolean';
      return o.values.includes(v);
    },

    /**
     * Whatever the panel's widget produced, turned back into the option's own
     * value. Returns null for anything that is not a legal setting — a number
     * field accepts empty and "e", and neither may reach a rule.
     */
    fromControl(row, raw) {
      const o = row.opt;
      if (o.type === 'number') {
        const n = Number(raw);
        if (raw === '' || !Number.isFinite(n)) return null;
        // clamp rather than reject: the input's own min/max are advisory, and
        // a typed 5000 should land on the ceiling, not silently do nothing
        return Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, n));
      }
      if (o.type === 'toggle') return !!raw;
      const v = row.control.values[raw];
      return v === undefined ? null : v;
    },

    /** Write one option through, and persist the lot. */
    apply(row, v) {
      (State.settings[row.tool.id] ||= {})[row.opt.key] = v;
      Store.set(CONFIG.SETTINGS_KEY, JSON.stringify(State.settings));
    },

    /**
     * Every option's default comes from the tool, and a saved value only
     * overrides it if the tool still offers it. Resolved once, here, so that
     * Tools.setting() stays a lookup: grid asks for its step once per number
     * on a page that has thousands of them.
     */
    load() {
      let saved = {};
      try { saved = JSON.parse(Store.get(CONFIG.SETTINGS_KEY) || '{}') || {}; } catch {}
      const out = {};
      for (const t of Tools.withHook('options')) {
        out[t.id] = {};
        for (const o of t.options.call(t)) {
          const was = saved[t.id]?.[o.key];
          out[t.id][o.key] = Settings.valid(o, was) ? was : o.def;
        }
      }
      State.settings = out;
    },
  };
