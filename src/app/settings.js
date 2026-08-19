import { CONFIG } from '../core/config.js';
import { ROLES, Tools } from '../core/registry.js';
import { State, Store } from '../core/state.js';
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
  export const Settings = {
    carried: {},   // saved values whose owner this build does not know
    /**
     * ONE row builder, so the two doors into these settings cannot drift.
     * ⚙ shows every row grouped by what it changes; right-clicking a tool
     * shows that tool's subset. The second is a FILTER of the first, never a
     * copy — same options() call, same control, same value.
     */
    row(t, o) {
      return {
        tag: t.icon,
        label: o.label,
        control: Settings.controlFor(o, Tools.setting(t, o.key)),
        /* A tool's own option does nothing while that tool is disarmed —
           stored and waiting, not live. Hiding the row would be wrong, since
           the value applies the moment you arm it; looking active was the
           confusion, so it is dimmed. A SUBJECT has no armed state: its
           settings feed the sweep, which runs every rule either way. */
        inert: Tools.all.includes(t) && !State.tools.has(t.id),
        tool: t, opt: o,
      };
    },

    /**
     * This one tool's rows — the per-tool door.
     *
     * INCLUDING the subjects it consults. "Grid step" is obviously grid's
     * setting to anyone using it; that it is owned by the `scale` subject so
     * the lens and the rule cannot disagree about it is an internal matter,
     * and right-clicking ▦ to be told "nothing to configure" was the panel
     * lying about the most configurable tool it has.
     *
     * The tool declares what it consults with `uses:`, which is a dependency
     * it already has — grid literally calls Scale.off(). A subject is not a
     * tool, so this is not one tool naming another.
     */
    rowsFor(id) {
      const t = Tools.byId(id);
      if (!t) return [];
      return [t, ...(t.uses || [])]
        .filter((o) => o.options)
        .flatMap((o) => o.options.call(o).map((opt) => Settings.row(o, opt)));
    },

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
        for (const t of Tools.settingOwners()) {
          for (const o of t.options.call(t)) {
            if (o.affects !== r.key) continue;
            rows.push({
              tag: t.icon,
              label: o.label,
              control: Settings.controlFor(o, Tools.setting(t, o.key)),
              /* A tool's own option does nothing while that tool is disarmed —
                 stored and waiting, not live. Hiding the row would be wrong,
                 since the value applies the moment you arm it; looking active
                 was the confusion, so it is dimmed. A SUBJECT has no armed
                 state: its settings feed the sweep, which runs every rule
                 either way, so those are never inert. */
              inert: Tools.all.includes(t) && !State.tools.has(t.id),
              tool: t, opt: o,
            });
          }
        }
        if (!rows.length) continue;
        out.push({ heading: r.label, detail: r.note });
        out.push(...rows);
      }
      const keys = Settings.gestureRows();
      if (keys.length) {
        out.push({ heading: 'Keys', detail: 'the parts of this that are not buttons' });
        out.push(...keys);
      }
      return out;
    },

    /**
     * THE GESTURES. Three of them — Alt+click, the remove key, Escape — existed
     * nowhere in the running UI at all: a user who had not read the source
     * could not find them, which for Alt+click meant the pass-through everyone
     * asks for looked like a missing feature.
     *
     * Key NAMES come from CONFIG so they cannot drift from what is bound, and a
     * tool that claims a gesture of its own declares it, so nothing central has
     * to keep a list of what the tools do.
     */
    gestureRows() {
      const H = CONFIG.HOTKEY;
      const hot = [H.ctrl && 'Ctrl', H.alt && 'Alt', H.shift && 'Shift',
                   H.code.replace('Key', '')].filter(Boolean).join('+');
      const rows = [
        ['Click', 'pin an element'],
        ['Shift+click', 'pin it for measuring'],
        ['Alt+click', 'let the click through to the page'],
        [`Hold ${CONFIG.REMOVE_KEY.replace('Key', '')}`, 'show ✕ on every pin'],
        ['Esc', 'close the panel, then the pins'],
        ['Right-click a tool', 'its own options, without the others'],
        [hot, 'power on and off'],
      ];
      for (const t of Tools.withHook('gestures'))
        for (const g of t.gestures.call(t) || []) rows.push([g.keys, g.does]);
      return rows.map(([keys, does]) => ({ tag: keys, label: does, detail: '' }));
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
      Store.set(CONFIG.SETTINGS_KEY, JSON.stringify({ ...Settings.carried, ...State.settings }));
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
      for (const t of Tools.settingOwners()) {
        // An owner may say what it used to be called. Moving `step` out of the
        // grid tool and into the scale subject renamed the key it is stored
        // under, and without this every user who had chosen an 8px grid or AAA
        // contrast was silently returned to the defaults on upgrade — the same
        // reset Store's localStorage adoption exists to prevent, arriving by a
        // different door. The owner declares its own former name; no core file
        // holds a list of what anything used to be.
        const prev = saved[t.id] || (t.was && saved[t.was]) || null;
        out[t.id] = {};
        for (const o of t.options.call(t)) {
          const was = prev?.[o.key];
          out[t.id][o.key] = Settings.valid(o, was) ? was : o.def;
        }
      }
      /* Anything saved under an id this build does not register — a renamed
         owner, a removed tool, a downgrade — is kept aside and written back
         untouched. Rebuilding the blob from the registered owners alone
         destroyed it on the next unrelated change, so no later version could
         migrate what an earlier one had stored. */
      Settings.carried = {};
      for (const id of Object.keys(saved)) if (!(id in out)) Settings.carried[id] = saved[id];
      State.settings = out;
    },
  };
