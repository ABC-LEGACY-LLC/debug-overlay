import { Settings } from '../services/settings/index.js';
import { BadgeFace } from '../services/badge/options.js';
import { Sweep } from '../services/findings/index.js';
import { CONFIG } from '../core/config.js';
import { TOOLS, Tools } from '../core/registry.js';
import { State, Store } from '../core/state.js';
import { U } from '../core/utils.js';
import { Panel } from '../ui/panel.js';
import { Render } from '../ui/renderer.js';
  /* ======================================================================
    CONTROLLER — the only glue
     ====================================================================== */
  export const Controller = {
    setPower(v) {
      State.enabled = v;
      if (!v) State.hoverEl = null;
      // A selection the page already had would be extended by the first
      // shift-click instead of measured from, so start the session clean.
      if (v) { try { getSelection()?.removeAllRanges(); } catch {} }
      if (!v) State.sweep = null;   // the page moves on; a stale audit lies
      Panel.setSwept(!!State.sweep, 0);
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
      // "5000" is the same page with one of them on every row. It RESTS on the
      // button rather than flashing, so the bar keeps answering the question.
      Panel.setSwept(true, Sweep.group(State.sweep.findings).length);
      Panel.toggleList(true, 'findings');
      Render.schedule();   // the marks are new; nothing else would ask for them
    },

    /** Rows for whichever view the panel is showing. */
    rows(view) {
      const body = view === 'settings' ? Settings.rows()
        : Controller.toolOf(view) ? Settings.rowsFor(Controller.toolOf(view))
          : view === 'findings' ? Controller.findingRows() : Controller.pinList();
      // Only when there IS a body: List shows its empty state on rows.length
      // === 0, and a title alone would suppress the one sentence that explains
      // why the view is empty.
      if (!body.length) return body;
      const t = Controller.viewTitle(view, body);
      return t ? [t, ...body] : body;
    },

    /**
     * One popover shows three unrelated screens with no header, so nothing on
     * screen said what you were looking at — or that opening one destroyed the
     * last. It also labels the two numbers an audit produces: the ⌕ flash
     * counts distinct problems and the report counts occurrences, and neither
     * said which it was.
     */
    /** The tool a `tool:<id>` view names, or null. No id is written here — it
     *  arrives from the button that was clicked. */
    toolOf: (view) => (String(view || '').startsWith('tool:') ? view.slice(5) : null),

    viewTitle(view, body) {
      const owned = Controller.toolOf(view);
      if (owned) {
        const t = Tools.byId(owned);
        return t && { title: (t.family ? t.family[0].toUpperCase() + t.family.slice(1) + ' › ' : '')
                        + t.title.split(/[—·]/)[0].trim(),
                      detail: 'its own options — ⚙ has these and everyone else\'s' };
      }
      if (view === 'settings') return { title: 'Settings', detail: 'what each tool checks and shows' };
      if (view === 'pins') {
        const n = State.pins.length;
        return { title: 'Pins', detail: `${n} pinned element${n === 1 ? '' : 's'}` };
      }
      const s = State.sweep;
      if (!s) return { title: 'Findings', detail: 'no audit has run' };
      const groups = body.filter((r) => !r.heading && !r.title).length;
      return {
        title: 'Findings',
        detail: `${groups} distinct problem${groups === 1 ? '' : 's'} · ` +
                `${s.findings.length} occurrence${s.findings.length === 1 ? '' : 's'}`,
      };
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
      if (row.opt.affects === 'detect') { State.sweep = null; Panel.setSwept(false, 0); }
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
      if (Controller.toolOf(view)) return 'This one has nothing to configure.';
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
      Store.set(CONFIG.SEEN_KEY, JSON.stringify([...registered].sort()));  // a SET, stored stably
      State.tools = new Set(ids.filter((id) => Tools.byId(id)));
      TOOLS.forEach((t) => Panel.setTool(t.id, State.tools.has(t.id)));
    },

    /**
     * Every path that adds or removes a pin ends here.
     *
     * A pin's NUMBER is stable while it exists: removing #2 must not renumber
     * #3, or a screenshot taken a moment earlier stops matching the report
     * beside it. But once nothing is pinned there is no numbering left to be
     * stable about, and the counter kept climbing — pin, unpin, pin and you
     * were looking at "#9" beside a count chip reading 1, a number that
     * referred to nothing and could not be read off a screenshot.
     */
    pinsChanged() {
      Render.schedule();
      Controller.refreshList();
    },

    /**
     * The number a new pin gets: the SMALLEST one not currently in use.
     *
     * It was a counter that only climbed, so four pins on the page could read
     * #1 #2 #6 #9 — numbers with no relation to what you were looking at, on a
     * tool whose point is reading values off a screenshot. Resetting it when
     * the list emptied fixed only the trivial case; unpin and re-pin with
     * anything else still pinned and it kept going.
     *
     * Derived from the live pins rather than stored, so there is no counter
     * left to drift. Existing pins keep their numbers — renumbering #3 to #2
     * because #1 went away would break the screenshot you took a second ago —
     * and the gap that leaves is exactly what the next pin fills.
     */
    nextPinId() {
      const taken = new Set(State.pins.map((p) => p.id));
      let n = 1;
      while (taken.has(n)) n++;
      return n;
    },

    /** The renderer dropped pins whose element left the page; it is mid-frame,
     *  so this must not ask for another one. */
    pinsPruned() {
      Controller.refreshList();
    },

    // kind: CONFIG.PIN_KIND.PLAIN → a note: inspect only, groups with nothing
    //       CONFIG.PIN_KIND.SHIFT → a pair pin: joins whatever grouping is armed
    togglePin(el, kind = CONFIG.PIN_KIND.PLAIN) {
      State.current = null;   // a kept selection supersedes the transient one
      const i = State.pins.findIndex((p) => p.el === el);
      if (i >= 0) {
        // same modifier → unpin; different modifier → switch this pin's role
        if (State.pins[i].kind === kind) State.pins.splice(i, 1);
        else State.pins[i].kind = kind;
      } else {
        State.pins.push({ el, id: Controller.nextPinId(), kind });
      }
      Controller.pinsChanged();
    },
    /**
     * SELECTION chooses; PIN keeps. This is the choosing half on its own:
     * with no armed keeper, a click selects ONE element — outline and badge,
     * no number — and the next click lets it go and selects the next thing.
     * Clicking the selected element again deselects it. The page never
     * accumulates anything; only an armed keeper turns choices into pins.
     */
    setCurrent(el) {
      State.current = State.current === el ? null : el;
      Render.schedule();
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
      Controller.pinsChanged();
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
      /* rows(view), not pinList(): the panel hands back the index of what it
         RENDERED, and that array now carries a title row. Indexing a different
         list is how ✕ removed the wrong pin before. */
      const row = Controller.rows(Panel.view())[i];
      if (!row || !row.pins) return;
      if (!row) return;
      row.pins.forEach((p) => {
        const k = State.pins.indexOf(p);
        if (k >= 0) State.pins.splice(k, 1);
      });
      Controller.pinsChanged();
    },
    /**
     * Clears everything the overlay has put ON the page — pins and the audit's
     * outlines. It used to clear pins only, so an audit's 200 outlines had no
     * exit at all: the ⌕ flash expired, the bar looked idle, and the page
     * stayed covered with no control that admitted it.
     */
    clearPins() {
      State.pins = [];
      State.current = null;
      State.sweep = null;
      Panel.setSwept(false, 0);
      Controller.pinsChanged();
    },
    /**
     * The 🏷 flyout's members — DERIVED from the badge face's own options()
     * so the flyout and the ⚙ rows come from one declaration and cannot
     * drift. A values option becomes a radio (one member per value, the live
     * one armed); a toggle becomes one member that flips. Both write through
     * Settings.apply — the same store the ⚙ row writes — so the two surfaces
     * re-read one value and can never disagree.
     */
    badgeControls() {
      const rows = [];
      for (const o of BadgeFace.options()) {
        const live = Tools.setting(BadgeFace, o.key);
        if (o.values) {
          for (const v of o.values)
            rows.push({ key: `${o.key}:${v}`, glyph: (o.glyphs || {})[v] || String(v),
                        title: `${o.label} — ${v}`, armed: live === v });
        } else {
          rows.push({ key: o.key, glyph: o.glyph || o.label,
                      title: o.label, armed: !!live });
        }
      }
      return rows;
    },
    refreshBadge() { Panel.setBadgeControls(Controller.badgeControls()); },
    badgeControl(key) {
      const [k, v] = key.split(':');
      const opt = BadgeFace.options().find((o) => o.key === k);
      if (!opt) return;
      const next = opt.values ? v : !Tools.setting(BadgeFace, k);
      Settings.apply({ tool: BadgeFace, opt }, next);
      Controller.refreshBadge();
      Controller.refreshList();   // the ⚙ row for the same value, if open
      Render.schedule();
    },
  };
