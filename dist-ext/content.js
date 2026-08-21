/* dbgov v3.8.89 — extension gate; same bundle as the userscript */
(function () {
  'use strict';
/* NOT a module and NOT bundled: build.js injects this text at the very top
   of the output IIFE, so its early returns abort the whole overlay before a
   single module evaluates. It cannot be an import — imports hoist, so a guard
   inside a module would run after everything it was guarding. */
  /**
   * NOT `window.top !== window.self`. With @grant the manager runs this in a
   * sandbox where `window` is a wrapper, and that comparison can be true in
   * the TOP frame — which would disable the overlay everywhere, silently, on
   * every site. frameElement is null at top level in every context, so this
   * cannot misfire in the one direction that matters. @noframes is what keeps
   * us out of cross-origin frames, where frameElement reads null anyway.
   */
  let framed = false;
  try { framed = !!window.frameElement; } catch { framed = true; }
  if (framed) return;

  /**
   * Ask the DOCUMENT first. A re-injection on soft navigation can arrive in a
   * fresh sandbox — a new `window`, the same page — and a window flag alone
   * would have missed that and built a second panel fighting the first for the
   * same hotkey. The flag stays as the cheap path and as what the tests read.
   */
  if (document.getElementById('__dbgov-root')) return;
  if (window.__DBG_OVERLAY__) return;
  window.__DBG_OVERLAY__ = true;

(() => {
  // src/core/config.js
  var CONFIG = {
    // Substituted by build.js at bundle time. A userscript with @grant none
    // cannot read GM_info, and an overlay that cannot say which version it is
    // makes a stale install look exactly like a current one — which is the
    // failure this project has already had once, from the other end.
    VERSION: "3.8.89",
    // Substituted like VERSION: where the update checker asks, and what the
    // userscript's one-click update opens. One source (userscript.json), no
    // second copy to drift.
    META_URL: "https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/debug-overlay.meta.js",
    INSTALL_URL: "https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/debug-overlay.user.js",
    // daily automatic floor; the manual "check now" row ignores it
    UPDATE: { EVERY: 864e5, BOOT_DELAY: 4e3 },
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
    PEEK: 10,
    // px of panel visible when tucked
    TUCK_DELAY: 2200,
    // ms idle before the panel tucks away
    EDGE_MARGIN: 8,
    BADGE_MARGIN: 6,
    POS_KEY: "__dbgov_pos",
    // PER-ORIGIN, unlike everything else in the store: "debugging THIS site"
    // is a session fact about one origin, where a grid step is a fact about
    // the project. Global power would pop the overlay onto every site the
    // browser visits. Pins add the PATH: a pin on /live-map is not a pin on
    // /settings.
    POWER_KEY: "__dbgov_on",
    PINS_KEY: "__dbgov_pins",
    TOOLS_KEY: "__dbgov_tools",
    SETTINGS_KEY: "__dbgov_settings",
    // Which tool ids this install has already met. Without it a saved armed
    // set answers for tools that no longer exist and stays silent about ones
    // shipped since — so a new capability arrives switched off and invisible.
    SEEN_KEY: "__dbgov_seen",
    FLASH_MS: 1200,
    // how long a button shows a transient message
    LIST_GAP: 10,
    // px between the bar and the popover it opens
    LIST_PAD: 6,
    // px the popover keeps from the viewport edge
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
    PIN_KIND: { PLAIN: "note", SHIFT: "pair", CHAIN: "link" },
    // The perf monitor's thresholds. FREEZE_MS is what counts as "stuck" —
    // 250ms is where humans stop reading an interaction as instant; a user
    // tunes it per project through the tool's own options().
    // CHURN is mutations/second on a WATCHED subtree before it counts as a
    // re-render storm (a React loop reads in the hundreds); RATE_WINDOW is
    // how far back the rolling rate looks.
    PERF: {
      FREEZE_MS: 250,
      LOG_MAX: 30,
      FPS_WINDOW: 1e3,
      CHURN: 60,
      RATE_WINDOW: 2e3
    },
    // The badge service's VIEW axis, in order. 'compact' leads because it is
    // the shipped default — a full badge is a lot of ink over a page you came
    // to read one number off. A third view is one new entry here plus its
    // rendering; the 🏷 flyout and the ⚙ row both derive from this list.
    BADGE_MODES: ["compact", "full"],
    PICK_FLASH: 700,
    // ms an element stays outlined after being picked
    LANE_SEP: 16,
    // px between parallel dimension lines
    HOTKEY: { alt: true, shift: true, ctrl: false, code: "KeyD" },
    REMOVE_KEY: "KeyX",
    // hold to reveal ✕ on pins and click one to remove
    // `level` is the default the panel starts on; `levels` is what it offers.
    // The two thresholds move together — a rule that checked AAA for body text
    // and AA for headings would be neither.
    CONTRAST: {
      largePx: 24,
      largeBoldPx: 18.66,
      level: "AA",
      levels: { AA: { normal: 4.5, large: 3 }, AAA: { normal: 7, large: 4.5 } }
    },
    // Findings vocabulary, shared by every 'rule' tool. The number is only a
    // rank, so a list of findings reads worst-first.
    SEVERITY: { error: 3, warn: 2, info: 1 },
    // Marks drawn per tool per frame. A page can return thousands of findings
    // and this runs at 60fps, so it is a ceiling on cost, not on truth — the
    // list and the report still carry every one of them.
    MARK_LIMIT: 200
  };

  // src/core/utils.js
  var U = {
    /**
     * Math.round breaks ties toward +Infinity, so +2.5 became 3 (off a 2px
     * grid) and -2.5 became -2 (on it) — the SIGN of a half-pixel decided the
     * verdict rather than its distance from the grid. Fractional computed
     * margins are ordinary on fractional-DPR displays. Half away from zero
     * treats a margin and its mirror image alike.
     */
    px: (v) => {
      const n = parseFloat(v) || 0;
      return Math.sign(n) * Math.round(Math.abs(n));
    },
    /**
     * Anything the PAGE controls has to come through here before it is
     * interpolated into badge markup, because badges reach the DOM through
     * innerHTML. An element's id is page-authored text, and a hostile — or
     * merely careless — one closed the span and opened a tag of its own.
     */
    esc: (s) => String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    ),
    // `dec` is a decorator, (n) => html, handed in by the caller. UTILS never
    // reads State, and never learns what decorating a number means.
    mark: (n, dec) => dec ? dec(n) : `${n}`,
    four(cs, prop, dec) {
      const t = U.px(cs[prop + "Top"]), r = U.px(cs[prop + "Right"]), b = U.px(cs[prop + "Bottom"]), l = U.px(cs[prop + "Left"]);
      if (!t && !r && !b && !l) return null;
      if (t === b && r === l)
        return t === r ? [U.mark(t, dec)] : [U.mark(t, dec), U.mark(r, dec)];
      return [U.mark(t, dec), U.mark(r, dec), U.mark(b, dec), U.mark(l, dec)];
    },
    fourPlain(cs, prop) {
      return {
        t: U.px(cs[prop + "Top"]),
        r: U.px(cs[prop + "Right"]),
        b: U.px(cs[prop + "Bottom"]),
        l: U.px(cs[prop + "Left"])
      };
    },
    radius(cs) {
      const c = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((k) => U.px(cs["border" + k + "Radius"]));
      if (!c.some(Boolean)) return null;
      return c.every((v) => v === c[0]) ? `${c[0]}` : c.join("/");
    },
    /**
     * An id a person chose is the best address there is. A generated one is
     * the worst: React and base-ui emit things like `base-ui-:r1t9:`, which
     * changes on the next render, so a report that says #base-ui-:r1t9: names
     * an element nobody can find twice. A bare CSS identifier is the test —
     * a colon is not legal in one unescaped, so nobody typed it.
     */
    stableId: (id) => /^[A-Za-z][\w-]*$/.test(id),
    selectorOf(el2) {
      const part = (e2) => {
        if (e2.id && U.stableId(e2.id)) return "#" + e2.id;
        let s = e2.tagName.toLowerCase();
        const cls = [...e2.classList].filter((c) => !c.startsWith("__dbgov")).slice(0, 2);
        if (cls.length) s += "." + cls.join(".");
        const p = e2.parentElement;
        if (p) {
          const same = [...p.children].filter((x) => x.tagName === e2.tagName);
          if (same.length > 1) s += `:nth-of-type(${same.indexOf(e2) + 1})`;
        }
        return s;
      };
      const chain = [];
      let e = el2;
      while (e && e.tagName && chain.length < 3) {
        chain.unshift(part(e));
        if (e.id && U.stableId(e.id)) break;
        e = e.parentElement;
      }
      return chain.join(" > ");
    },
    // human-readable name for a pin row: the element's own text, else a selector
    labelOf(el2) {
      const t = (el2.innerText || el2.textContent || "").trim().replace(/\s+/g, " ");
      if (t) return t.length <= 34 ? t : t.slice(0, 31) + "…";
      const cls = [...el2.classList].filter((c) => !c.startsWith("__dbgov"))[0];
      return el2.tagName.toLowerCase() + (el2.id ? "#" + el2.id : cls ? "." + cls : "");
    },
    /**
     * `r` is a getter: a rule that only reads colours never pays for a
     * layout read, which over a whole page is thousands of them. `cs` can be
     * handed in by a caller that has already read it.
     */
    info(el2, cs) {
      let r = null;
      return {
        el: el2,
        cs: cs || getComputedStyle(el2),
        get r() {
          return r || (r = el2.getBoundingClientRect());
        }
      };
    },
    gap(a, b) {
      const dx = Math.max(a.left - b.right, b.left - a.right, 0);
      const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
      return { dx: Math.round(dx), dy: Math.round(dy), d: Math.round(Math.hypot(dx, dy)) };
    },
    rectOf: (x, y, w, h) => ({ l: x, t: y, r: x + w, b: y + h }),
    overlap: (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
  };

  // src/core/state.js
  var Store = {
    /**
     * The manager only defines these when the header asks for them, and the
     * dev page, the tests and any manager without them have to keep working —
     * so every path falls back rather than losing what it was asked to keep.
     * `typeof` on an undeclared name is the only safe way to ask.
     */
    _gm: typeof GM_getValue === "function" && typeof GM_setValue === "function",
    /** The stored string for `key`, or null. Never throws. */
    get(key) {
      try {
        if (!Store._gm) return localStorage.getItem(key);
        const v = GM_getValue(key);
        if (v !== void 0 && v !== null) return String(v);
        const old = localStorage.getItem(key);
        if (old !== null) {
          GM_setValue(key, old);
          try {
            localStorage.removeItem(key);
          } catch {
          }
          return old;
        }
        return null;
      } catch {
        return null;
      }
    },
    /** Persist `value` (a string). Storage being unavailable is not an error. */
    set(key, value) {
      try {
        if (Store._gm) GM_setValue(key, value);
        else localStorage.setItem(key, value);
      } catch {
      }
    }
  };
  var State = {
    enabled: false,
    // master power
    // no `detail` flag any more: the badge VIEW is a value in settings —
    // State.settings.badge.view — chosen from CONFIG.BADGE_MODES and
    // persisted like everything else the user picks. The ≡ boolean it
    // replaced forgot itself on every reload.
    tools: /* @__PURE__ */ new Set(),
    // active tool ids — filled by CONTROLLER on boot
    // { toolId: { key: value } } for every option any tool declares. Filled
    // once on boot from the tools' own defaults, then overlaid with whatever
    // was saved, so the hot path is a lookup and never a hook call: grid asks
    // for its step once per number on a page with thousands of them.
    settings: {},
    pins: [],
    // [{ el, id, kind }] — kind ∈ CONFIG.PIN_KIND
    // The CURRENT selection — the element a click chose while nothing armed
    // was keeping selections. One at most: the next click replaces it. It is
    // NOT a pin (no number, never in the list); a pin is a selection some
    // armed tool KEPT, and this is the one nothing did.
    current: null,
    hoverEl: null,
    removeMode: false,
    // true while the remove key is held
    removeTarget: null,
    // pin object under the cursor in remove mode
    flashPins: null,
    // pins briefly highlighted after "reveal" from the list
    // Last whole-page sweep: { findings, rules, elements }, or null if none
    // has been run. It carries what RAN, not only what was found, because a
    // zero that means "nothing was checked" and a zero that means "nothing is
    // wrong" must not print the same sentence. Cleared on power off: the DOM
    // moves on, and a stale page audit is worse than no audit.
    sweep: null
  };

  // src/core/registry.js
  var ROLES = [
    {
      key: "select",
      label: "Select",
      note: "how what you click becomes what you are looking at",
      /* NOT listRows: a row in the panel's list is a service contribution —
         perf's freeze log proved it, when the old predicate filed a monitor
         under Select and sat it at the top of the bar. */
      has: (t) => !!(t.groups || t.pendingIndex || t.keeps)
    },
    {
      key: "inspect",
      label: "Inspect",
      note: "what gets shown about it",
      has: (t) => !!(t.badge || t.compact || t.annotate)
    },
    {
      key: "detect",
      label: "Detect",
      note: "what counts as a problem",
      has: (t) => !!(t.audit || t.auditPage)
    },
    {
      key: "act",
      label: "Act",
      note: "what the overlay does to the page or the clipboard",
      has: (t) => !!t.intercept
    }
  ];
  var role = (key) => ROLES.find((r) => r.key === key);
  var byRole = (a, b) => {
    const rank = (t) => {
      const i = ROLES.findIndex((r) => r.has(t));
      return i < 0 ? ROLES.length : i;
    };
    return rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
  var SUBJECTS = [];
  var defineSubject = (s) => {
    SUBJECTS.push(s);
    return s;
  };
  var TOOLS = [];
  var defineTool = (t) => {
    TOOLS.push(t);
    return t;
  };
  var SERVICES = [];
  var defineService = (s) => {
    SERVICES.push(s);
    return s;
  };
  var ordered = () => TOOLS.slice().sort(byRole);
  var Tools = {
    all: TOOLS,
    ordered,
    byId: (id) => TOOLS.find((t) => t.id === id),
    active: () => ordered().filter((t) => State.tools.has(t.id)),
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
    withHook: (h, armed) => ordered().filter((t) => t[h] && (!armed || State.tools.has(t.id))),
    /**
     * The tools, split into runs for the panel to draw with a rule between
     * them. Two toggles that look identical and mean different things is the
     * problem here: arming one changes what the page audit finds and arming
     * the other does not, and nothing said so.
     *
     * The split lives here because this is the file that knows what a hook
     * is. The panel renders the runs it is handed and never learns what
     * separates them — a third run would need no panel change at all.
     */
    /**
     * The bar's bands, top to bottom, ARE the pipeline: the input side
     * (SOURCE · ACTION — what turns your clicks into something), then the
     * COMPONENTS (what describes the page). The old axis — "does it feed ⌕" —
     * used to be the separator's meaning, which filed measure between the two
     * input tools and said nothing the green dot was not already saying.
     * That fact still shows, per tool, through feedsAudit(); one mark per
     * fact, and the separator is free to mean position in the pipeline.
     *
     * Derived at build like everything else, so a tool that changes species
     * moves band at next boot — being wrong costs an ordering, never a
     * verdict.
     */
    runs() {
      const input = (t) => role("select").has(t) || role("act").has(t);
      const inOrder = ordered();
      const comps = inOrder.filter((t) => !input(t));
      return [
        { tools: inOrder.filter(input) },
        // plain read-outs first, then the dotted ones — inside the band the
        // dot still deserves the eye-track it always had
        { tools: [
          ...comps.filter((t) => !role("detect").has(t)),
          ...comps.filter((t) => role("detect").has(t))
        ] }
      ].filter((r) => r.tools.length);
    },
    /** Does this tool's rule run in the page audit? The green dot, and the
     *  tooltip note — per tool, where the fact lives. */
    feedsAudit: (t) => role("detect").has(t),
    /**
     * The family's MARK — the subject wearing the family's id. A family earns
     * a bar presence of its own only when its head exists to carry the mark;
     * geometry has no subject (its backend is core), so measure stays a direct
     * button until that day.
     */
    familyMark: (name) => SUBJECTS.find((su) => su.id === name)?.icon || null,
    /**
     * What one of a tool's own options is currently set to.
     *
     * A tool asks with `this`, never with an id, so this stays as id-free as
     * every other question the registry answers. CONTROLLER has already
     * resolved defaults into State.settings by the time anything calls this —
     * deliberately, because the callers are hot: grid asks per number, and
     * re-deriving the answer from options() there would run the hook thousands
     * of times per sweep to be told the same thing.
     */
    /**
     * What one of an owner's own options is currently set to. The owner is a
     * tool or a subject — anything with an id that declared the option. Asked
     * with `this`, never with an id, so this stays as id-free as every other
     * question the registry answers.
     */
    setting: (t, key) => State.settings[t.id]?.[key],
    /**
     * Everything that declares settings, subjects first.
     *
     * Subjects lead because a setting that governs a shared measurement is the
     * more general fact: "the spacing step is 2px" is true of the project, and
     * what any one component does with it comes after.
     */
    /**
     * Everything that declares settings, in ONE principled order: the bar's.
     *
     * It used to be [...SUBJECTS, ...tools] — and SUBJECTS register in folder
     * order, which is alphabetical, so "WCAG level" sat above "Grid step" only
     * because contrast/ sorts before grid/. It matched the bar by luck.
     * Now each subject is anchored to the FIRST tool (in bar order) that
     * declares it via `uses:`, just ahead of that tool — the project's facts,
     * then the tool's own preferences — and an orphan subject, if one ever
     * exists, comes last rather than vanishing.
     */
    settingOwners: () => {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const t of TOOLS.slice().sort(byRole)) {
        for (const su of t.uses || []) {
          if (!seen.has(su)) {
            seen.add(su);
            out.push(su);
          }
        }
        out.push(t);
      }
      for (const su of SUBJECTS) if (!seen.has(su)) out.push(su);
      for (const sv of SERVICES) out.push(sv);
      return out.filter((o) => o.options);
    },
    /** Every role a tool fills, in ROLES order. Plural by construction. */
    rolesOf: (t) => ROLES.filter((r) => r.has(t)).map((r) => r.label),
    /**
     * Every grouping the armed selection tools have formed.
     *
     * WHY THIS EXISTS: measure used to pair pins itself, which made it a
     * read-out AND the thing that decides what is selected — two roles in one
     * tool, and no way to add a second way of selecting without editing it.
     * Anything that draws or reports BETWEEN elements asks this instead, so a
     * lasso or a select-by-query reaches every consumer the day it lands and
     * no consumer ever learns who made the group.
     */
    groups() {
      const out = [];
      for (const t of Tools.withHook("groups", true))
        out.push(...t.groups.call(t) || []);
      return out;
    },
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
      if (info.facets && info.facets.issues === false) return null;
      const lenses = Tools.withHook("annotate", true);
      if (!lenses.length) return null;
      return (n) => lenses.reduce(
        (html, t) => t.annotate?.call(t, html, n, info) || html,
        `${n}`
      );
    }
  };

  // src/subjects/geometry.js
  var Measure = defineSubject({
    id: "geometry",
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" /><path d="m14.5 12.5 2-2" /><path d="m11.5 9.5 2-2" /><path d="m8.5 6.5 2-2" /><path d="m17.5 15.5 2-2" /></svg>',
    // lucide 'ruler' (ISC) — the geometry family's mark
    // --- lanes: keep parallel dimension lines off each other -------------
    lanes: { v: [], h: [] },
    resetLanes() {
      Measure.lanes = { v: [], h: [] };
    },
    /**
     * Reserve a column (vertical span) or row (horizontal span) at `pos`.
     * If another span already occupies that position AND their spans overlap
     * along the measured axis, shift sideways in LANE_SEP steps until clear.
     * Returns the position actually granted.
     */
    reserveLane(vertical, pos, from, to) {
      const SEP = CONFIG.LANE_SEP;
      const list = vertical ? Measure.lanes.v : Measure.lanes.h;
      const lo = Math.min(from, to), hi = Math.max(from, to);
      const offsets = [0];
      for (let s = 1; s <= 10; s++) offsets.push(s * SEP, -s * SEP);
      for (const off of offsets) {
        const cand = pos + off;
        const clash = list.some((L) => Math.abs(L.pos - cand) < SEP - 1 && !(hi < L.lo - 2 || lo > L.hi + 2));
        if (!clash) {
          list.push({ pos: cand, lo, hi });
          return cand;
        }
      }
      list.push({ pos, lo, hi });
      return pos;
    },
    // Which axis does this gap actually live on?
    axisOf(ra, rb) {
      const xOv = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const yOv = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (xOv > 0 && yOv > 0) return { kind: "overlap", label: "overlap", xOv, yOv };
      if (xOv > 0) return { kind: "vertical", label: "vertical gap", xOv, yOv };
      if (yOv > 0) return { kind: "horizontal", label: "horizontal gap", xOv, yOv };
      return { kind: "diagonal", label: "diagonal gap", xOv, yOv };
    },
    // one straight measured span: tick at the start, arrowhead at the target
    span(layer2, Place2, { x1, y1, x2, y2, text, vertical, endArrow = true }) {
      const len = vertical ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
      const dir = vertical ? y2 >= y1 ? "down" : "up" : x2 >= x1 ? "right" : "left";
      const line = document.createElement("div");
      line.className = "dbgov-line";
      if (vertical) {
        Place2.put(line, Math.round(x1) - 1, Math.min(y1, y2), 2, Math.max(len, 1));
        Place2.claim(Math.round(x1) - 5, Math.min(y1, y2), 10, Math.max(len, 1));
      } else {
        Place2.put(line, Math.min(x1, x2), Math.round(y1) - 1, Math.max(len, 1), 2);
        Place2.claim(Math.min(x1, x2), Math.round(y1) - 5, Math.max(len, 1), 10);
      }
      layer2.append(line);
      const tick = document.createElement("div");
      tick.className = "dbgov-cap";
      if (vertical) Place2.put(tick, Math.round(x1) - 6, Math.round(y1) - 1, 12, 2);
      else Place2.put(tick, Math.round(x1) - 1, Math.round(y1) - 6, 2, 12);
      layer2.append(tick);
      if (endArrow) {
        const a = document.createElement("div");
        a.className = "dbgov-arrow dbgov-" + dir;
        const P = {
          up: [Math.round(x2) - 5, Math.round(y2)],
          down: [Math.round(x2) - 5, Math.round(y2) - 7],
          left: [Math.round(x2), Math.round(y2) - 5],
          right: [Math.round(x2) - 7, Math.round(y2) - 5]
        }[dir];
        Place2.put(a, P[0], P[1]);
        layer2.append(a);
      } else {
        const c = document.createElement("div");
        c.className = "dbgov-cap";
        if (vertical) Place2.put(c, Math.round(x2) - 6, Math.round(y2) - 1, 12, 2);
        else Place2.put(c, Math.round(x2) - 1, Math.round(y2) - 6, 2, 12);
        layer2.append(c);
      }
      const mx = vertical ? x1 + 12 : (x1 + x2) / 2;
      const my = vertical ? (y1 + y2) / 2 : y1 - 12;
      const lbl = document.createElement("div");
      lbl.className = "dbgov-dist" + (vertical ? " dbgov-vert" : "");
      lbl.textContent = text;
      layer2.append(lbl);
      Place2.smart(
        lbl,
        { left: mx, top: my, right: mx, bottom: my, width: 0, height: 0 },
        { leader: true }
      );
    },
    // thin dashed line extending an element's edge out to the measured span
    extension(layer2, Place2, { x1, y1, x2, y2 }) {
      if (Math.round(x1) === Math.round(x2) && Math.round(y1) === Math.round(y2)) return;
      const e = document.createElement("div");
      const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      e.className = "dbgov-ext" + (horizontal ? "" : " dbgov-v");
      if (horizontal) Place2.put(e, Math.min(x1, x2), Math.round(y1), Math.abs(x2 - x1) || 1, 1);
      else Place2.put(e, Math.round(x1), Math.min(y1, y2), 1, Math.abs(y2 - y1) || 1);
      layer2.append(e);
    },
    // dashed guides running along each element's edge out to a shifted lane
    guideTo(layer2, Place2, rect, vertical, pos, edgeCoord) {
      if (vertical) {
        const clamped = Math.max(rect.left, Math.min(pos, rect.right));
        Measure.extension(layer2, Place2, { x1: clamped, y1: edgeCoord, x2: pos, y2: edgeCoord });
      } else {
        const clamped = Math.max(rect.top, Math.min(pos, rect.bottom));
        Measure.extension(layer2, Place2, { x1: edgeCoord, y1: clamped, x2: edgeCoord, y2: pos });
      }
    },
    dimension(layer2, Place2, ra, rb, tag) {
      const axis = Measure.axisOf(ra, rb);
      const g = U.gap(ra, rb);
      if (axis.kind === "overlap") {
        const lbl = document.createElement("div");
        lbl.className = "dbgov-dist";
        lbl.textContent = `${tag} · overlapping`;
        layer2.append(lbl);
        const mx = (Math.max(ra.left, rb.left) + Math.min(ra.right, rb.right)) / 2;
        const my = (Math.max(ra.top, rb.top) + Math.min(ra.bottom, rb.bottom)) / 2;
        Place2.smart(lbl, { left: mx, top: my, right: mx, bottom: my, width: 0, height: 0 });
        return;
      }
      if (axis.kind === "vertical") {
        const down2 = rb.top >= ra.bottom;
        const y1 = down2 ? ra.bottom : ra.top;
        const y2 = down2 ? rb.top : rb.bottom;
        const mid = (Math.max(ra.left, rb.left) + Math.min(ra.right, rb.right)) / 2;
        const x = Measure.reserveLane(true, mid, y1, y2);
        Measure.guideTo(layer2, Place2, ra, true, x, y1);
        Measure.guideTo(layer2, Place2, rb, true, x, y2);
        Measure.span(layer2, Place2, {
          x1: x,
          y1,
          x2: x,
          y2,
          vertical: true,
          text: `${tag} · ${down2 ? "↓" : "↑"} ${g.dy} px`
        });
        return;
      }
      if (axis.kind === "horizontal") {
        const right2 = rb.left >= ra.right;
        const x1 = right2 ? ra.right : ra.left;
        const x2 = right2 ? rb.left : rb.right;
        const mid = (Math.max(ra.top, rb.top) + Math.min(ra.bottom, rb.bottom)) / 2;
        const y = Measure.reserveLane(false, mid, x1, x2);
        Measure.guideTo(layer2, Place2, ra, false, y, x1);
        Measure.guideTo(layer2, Place2, rb, false, y, x2);
        Measure.span(layer2, Place2, {
          x1,
          y1: y,
          x2,
          y2: y,
          vertical: false,
          text: `${tag} · ${right2 ? "→" : "←"} ${g.dx} px`
        });
        return;
      }
      const right = rb.left >= ra.right;
      const down = rb.top >= ra.bottom;
      const hx1 = right ? ra.right : ra.left;
      const hx2 = right ? rb.left : rb.right;
      const hy = Measure.reserveLane(false, (ra.top + ra.bottom) / 2, hx1, hx2);
      const vy1 = down ? ra.bottom : ra.top;
      const vy2 = down ? rb.top : rb.bottom;
      const vx = Measure.reserveLane(true, right ? rb.left : rb.right, vy1, vy2);
      Measure.guideTo(layer2, Place2, ra, false, hy, hx1);
      Measure.guideTo(layer2, Place2, rb, false, hy, hx2);
      Measure.guideTo(layer2, Place2, ra, true, vx, vy1);
      Measure.guideTo(layer2, Place2, rb, true, vx, vy2);
      Measure.span(layer2, Place2, {
        x1: hx1,
        y1: hy,
        x2: hx2,
        y2: hy,
        vertical: false,
        text: `${tag} · ${right ? "→" : "←"} ${g.dx} px`
      });
      Measure.span(layer2, Place2, {
        x1: vx,
        y1: vy1,
        x2: vx,
        y2: vy2,
        vertical: true,
        text: `${tag} · ${down ? "↓" : "↑"} ${g.dy} px`
      });
    }
  });

  // src/tools/colour/contrast/service.js
  var Colour = defineSubject({
    id: "colour",
    was: "contrast",
    // its settings lived under this id before the subject existed
    // the FAMILY's mark, not contrast's — ◐ is the read-out's glyph, and the
    // "WCAG level" row wearing it made the subject look like one of its tools
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /></svg>',
    // lucide 'palette' (ISC) — the colour family's mark
    /**
     * AA is the level nearly everyone is held to; AAA is what accessibility
     * commitments and public-sector procurement actually ask for. Both
     * thresholds move together — a check wanting AAA of body text and AA of
     * headings would be reporting against no standard at all.
     */
    options() {
      return [{
        key: "level",
        label: "WCAG level",
        def: CONFIG.CONTRAST.level,
        values: Object.keys(CONFIG.CONTRAST.levels),
        affects: "detect"
      }];
    },
    cache: /* @__PURE__ */ new Map(),
    // 20-50 distinct colours per page, 1000s of nodes
    ctx: void 0,
    // undefined = not tried yet, null = no canvas
    /** A 1×1 scratch context, or null where canvas is unavailable. */
    paint() {
      if (this.ctx !== void 0) return this.ctx;
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        this.ctx = c.getContext("2d", { willReadFrequently: true }) || null;
      } catch {
        this.ctx = null;
      }
      return this.ctx;
    },
    /**
     * Any CSS colour → sRGB, by asking the browser to paint one pixel of it.
     * That covers oklch(), lab(), color(display-p3 …) and whatever ships
     * next, without this file knowing the maths for any of them.
     *
     * Guessing is what made this necessary: scraping the numbers out of
     * oklch(0.985 0 0) read near-white as near-black and reported 1.00:1
     * for text measuring 10.9:1. Anything still unreadable returns null,
     * and null must stay "unknown" all the way up.
     */
    colour(str) {
      const s = String(str || "");
      if (!s) return null;
      if (this.cache.has(s)) return this.cache.get(s);
      let out = null;
      const m = /^rgba?\(/.test(s) && s.match(/[\d.]+/g);
      if (m && m.length >= 3) {
        out = { r: +m[0], g: +m[1], b: +m[2], a: m[3] !== void 0 ? +m[3] : 1 };
      } else {
        const ctx = this.paint();
        if (ctx) {
          ctx.fillStyle = "#000";
          ctx.fillStyle = s;
          const a = ctx.fillStyle;
          ctx.fillStyle = "#fff";
          ctx.fillStyle = s;
          const b = ctx.fillStyle;
          if (a === b) {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillRect(0, 0, 1, 1);
            const d = ctx.getImageData(0, 0, 1, 1).data;
            out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
          }
        }
      }
      this.cache.set(s, out);
      return out;
    },
    /** Composite `over` (with alpha) onto the opaque colour `base`. */
    over(over, base) {
      const a = over.a == null ? 1 : over.a;
      return {
        r: over.r * a + base.r * (1 - a),
        g: over.g * a + base.g * (1 - a),
        b: over.b * a + base.b * (1 - a),
        a: 1
      };
    },
    /**
     * What the text is actually painted on, or `{ unknown }` naming what
     * stopped it — the caller turns that into a finding rather than silence.
     *
     * Starts at the element, not its parent: an element that sets its own
     * background paints it behind its own text, so every button, chip and
     * alert was previously scored against whatever was behind the card
     * instead. Translucent layers are collected and composited rather than
     * taken as if opaque — the first layer over 5% alpha used to be returned
     * outright, which is a different colour from what a reader sees.
     */
    bg(el2) {
      const layers = [];
      let e = el2;
      while (e && e.nodeType === 1) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return { unknown: "bg-image" };
        const raw = cs.backgroundColor;
        const c = this.colour(raw);
        if (!c) {
          if (raw && raw !== "transparent")
            return { unknown: this.paint() ? "bg-colour" : "no-canvas" };
        } else if (c.a >= 0.999) {
          return layers.reduceRight((base, l) => this.over(l, base), c);
        } else if (c.a > 0) layers.push(c);
        e = e.parentElement;
      }
      return layers.reduceRight(
        (base, l) => this.over(l, base),
        { r: 255, g: 255, b: 255, a: 1 }
      );
    },
    lum({ r, g, b }) {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    },
    ratio(fg, bg) {
      const a = fg.a == null ? 1 : fg.a;
      const mixed = {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a)
      };
      const l1 = this.lum(mixed), l2 = this.lum(bg);
      const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    },
    // Walked rather than spread: this is the first thing asked of every
    // element in a page sweep, and [...childNodes] allocates an array for
    // each one only to look at the first text node.
    ownText(el2) {
      for (let n = el2.firstChild; n; n = n.nextSibling)
        if (n.nodeType === 3 && n.nodeValue.trim()) return true;
      return false;
    },
    // Why a measurement could not be made. These reach the user, so they say
    // what happened rather than naming the branch that produced them.
    why: {
      "fg-colour": "the text colour is in a colour space this cannot read",
      "bg-colour": "the background colour is in a colour space this cannot read",
      "bg-image": "it sits on an image or gradient, so the pixel under the text is unknown",
      "no-canvas": "no canvas is available to resolve colours"
    },
    measure({ el: el2, cs }) {
      if (!this.ownText(el2)) return null;
      const fg = this.colour(cs.color);
      if (!fg) return { unknown: this.paint() ? "fg-colour" : "no-canvas" };
      const bg = this.bg(el2);
      if (bg.unknown) return bg;
      const faded = { ...fg, a: (fg.a == null ? 1 : fg.a) * this.opacityOf(el2) };
      const ratio = this.ratio(faded, bg);
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const isLarge = size >= CONFIG.CONTRAST.largePx || bold && size >= CONFIG.CONTRAST.largeBoldPx;
      const level = Tools.setting(this, "level");
      const want = CONFIG.CONTRAST.levels[level];
      const need = isLarge ? want.large : want.normal;
      return { ratio, need, pass: ratio >= need, isLarge, fg: faded, bg, level, want };
    },
    /** Cumulative CSS opacity: every ancestor multiplies what is painted. */
    opacityOf(el2) {
      let o = 1;
      for (let e = el2; e && e.nodeType === 1; e = e.parentElement) {
        const v = parseFloat(getComputedStyle(e).opacity);
        if (Number.isFinite(v) && v < 1) o *= Math.max(0, v);
        if (o === 0) break;
      }
      return o;
    },
    rgb: (c) => `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`
  });

  // src/tools/colour/contrast/badge.js
  function badge(i) {
    const c = Colour.measure(i);
    if (!c) return null;
    if (c.unknown) return `<span class="dbgov-unk">contrast ?</span>`;
    const cls = c.pass ? "dbgov-ok" : "dbgov-bad";
    return `<span class="${cls}">${c.ratio.toFixed(2)}:1 ${c.level}${c.pass ? "✓" : "✗"}</span>`;
  }
  function compact(i) {
    const c = Colour.measure(i);
    if (!c || c.unknown || c.pass) return null;
    return `<span class="dbgov-bad">${c.ratio.toFixed(1)}:1 ✗</span>`;
  }
  function legend() {
    return [
      { mark: "ratio ✓", means: "green: meets the WCAG level set above" },
      { mark: "ratio ✗", means: "red: below it" },
      { mark: "contrast ?", means: "blue italic: not measurable - a gradient, an image, an unreadable colour space" }
    ];
  }

  // src/tools/colour/contrast/report.js
  function report(i) {
    const c = Colour.measure(i);
    if (!c) return [];
    if (c.unknown) return [`  contrast: not measured — ${Colour.why[c.unknown]}`];
    return [`  contrast: ${c.ratio.toFixed(2)}:1 vs required ${c.need} (${c.isLarge ? "large" : "normal"} text) → ${c.pass ? "PASS" : "FAIL"}`];
  }

  // src/tools/colour/contrast/rule.js
  var rules = {
    "contrast-aa": {
      help: "Body text needs 4.5:1 against its background, or 7:1 at AAA; 3:1 once it is 24px or 18.66px bold, or 4.5:1 at AAA. Which level this checks is in the panel under ⚙.",
      why: "Below that, text stops being readable in bright light, on a bad screen, or to anyone with reduced contrast sensitivity — which is most people eventually.",
      docs: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum"
    }
  };
  function audit(i) {
    const c = Colour.measure(i);
    if (!c) return [];
    if (c.unknown) return [{
      el: i.el,
      // Not a failure: a failure is a fact, this is an absence of one. It
      // used to be folded into the same empty array as "passed", so a page
      // of gradient-backed text audited clean. Whatever else this tool
      // gets wrong, it must not report a verdict it never reached.
      verdict: "review",
      severity: "info",
      rule: "contrast-aa",
      message: `not measured — ${Colour.why[c.unknown]}`,
      // one row per reason, page-wide: 200 elements over one gradient are
      // one thing to go and look at, not 200
      key: `contrast-aa|review|${c.unknown}`
    }];
    if (c.pass) return [];
    return [{
      el: i.el,
      verdict: "fail",
      // below the large-text floor nobody can read it; above it, a near
      // miss that a size or weight change might fix
      severity: c.ratio < c.want.large ? "error" : "warn",
      rule: "contrast-aa",
      message: `${c.ratio.toFixed(2)}:1 — ${c.level} needs ${c.need} for ${c.isLarge ? "large" : "normal"} text`,
      // one line per colour pair, not per element: a 40-link nav is ONE
      // problem. Only the rule knows what "the same problem" means.
      key: `contrast-aa|${Colour.rgb(c.fg)}|${Colour.rgb(c.bg)}|${c.isLarge}`
    }];
  }

  // src/tools/colour/contrast/draw.js
  function draw({ marks, found }) {
    marks(found);
  }

  // src/tools/colour/contrast/index.js
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .dbgov-ok  { color: #b5e853; }
    .dbgov-badge .dbgov-bad { color: #ff6b6b; font-weight: 700; }
    .dbgov-badge .dbgov-unk { color: #8ab4f8; font-style: italic; }
    `,
    id: "contrast",
    family: "colour",
    // audited: must match the domain folder this sits in
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="12" cy="12" r="10" /><path d="M12 18a6 6 0 0 0 0-12v12z" /></svg>',
    // lucide 'contrast' (ISC)
    // the level is the user's choice now, so it cannot be stated here
    title: "Contrast — WCAG text contrast ratio",
    uses: [Colour],
    // its settings are Colour's, and belong on its own menu
    badge,
    legend,
    compact,
    report,
    rules,
    audit,
    draw
  });

  // src/tools/dupid/badge.js
  function badge2({ el: el2 }) {
    if (!el2.id) return null;
    const n = document.querySelectorAll(
      `[id="${CSS.escape ? CSS.escape(el2.id) : el2.id}"]`
    ).length;
    return n > 1 ? `<span class="dbgov-dup">⌗ id ×${n}</span>` : null;
  }
  function compact2(i) {
    return this.badge(i);
  }
  function legend2() {
    return [{ mark: "⌗ id ×2", means: "orange: this id is used more than once in the document" }];
  }

  // src/tools/dupid/report.js
  function report2({ el: el2 }) {
    if (!el2.id) return [];
    const n = document.querySelectorAll(`[id="${CSS.escape ? CSS.escape(el2.id) : el2.id}"]`).length;
    return n > 1 ? [`  ⧉ id "${el2.id}" is used ${n} times on this page`] : [];
  }

  // src/tools/dupid/rule.js
  var rules2 = {
    "dup-id": {
      help: "An id must be unique in a document.",
      why: "getElementById, label[for], aria-labelledby and every #anchor resolve to the first match and silently ignore the rest, so the bug shows up as a control that does nothing rather than an error.",
      docs: "https://developer.mozilla.org/docs/Web/HTML/Global_attributes/id"
    }
  };
  function auditPage(all) {
    const by = /* @__PURE__ */ new Map();
    for (const i of all) {
      const id = i.el.id;
      if (!id) continue;
      (by.get(id) || by.set(id, []).get(id)).push(i.el);
    }
    const out = [];
    for (const [id, els] of by) {
      if (els.length < 2) continue;
      out.push({
        el: els[0],
        verdict: "fail",
        // a broken label or anchor is a control that does nothing, and
        // nothing on screen says so
        severity: "error",
        rule: "dup-id",
        message: `id "${id}" is used ${els.length} times`,
        // by id, not by element: the duplicates are one mistake
        key: `dup-id|${id}`
      });
    }
    return out;
  }

  // src/tools/dupid/draw.js
  function draw2({ marks, found }) {
    marks(found);
  }

  // src/tools/dupid/index.js
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .dbgov-dup { color: #ff8a65; font-weight: 700; }
    `,
    id: "dupid",
    // not ⧉ — the copy button already uses that glyph, and two identical
    // icons in one bar is a bar you have to read twice
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><line x1="4" x2="20" y1="9" y2="9" /><line x1="4" x2="20" y1="15" y2="15" /><line x1="10" x2="8" y1="3" y2="21" /><line x1="16" x2="14" y1="3" y2="21" /></svg>',
    // lucide 'hash' (ISC)
    title: "Duplicate ids — the same id used more than once",
    badge: badge2,
    legend: legend2,
    compact: compact2,
    report: report2,
    rules: rules2,
    auditPage,
    draw: draw2
  });

  // src/tools/geometry/measure/badge.js
  function badge3(i) {
    const { el: el2, r, cs } = i;
    const dec = Tools.annotator(i);
    const on = (k) => Tools.setting(this, k);
    const bits = [];
    if (on("size")) bits.push(`<span class="dbgov-sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`);
    if (on("radius")) {
      const rad = U.radius(cs);
      if (rad) bits.push(`<span class="dbgov-rad">r ${rad}</span>`);
    }
    if (on("padding")) {
      const p = U.four(cs, "padding", dec);
      if (p) bits.push(`<span class="dbgov-sp">p ${p.join(" ")}</span>`);
    }
    if (on("margin")) {
      const m = U.four(cs, "margin", dec);
      if (m) bits.push(`<span class="dbgov-sp">m ${m.join(" ")}</span>`);
    }
    if (on("layout") && (cs.display.includes("flex") || cs.display.includes("grid"))) {
      const g = U.px(cs.columnGap) || U.px(cs.gap);
      bits.push(`<span class="dbgov-sp">${U.esc(cs.display)}${g ? " gap " + U.mark(g, dec) : ""}</span>`);
    }
    if (on("font")) bits.push(`<span class="dbgov-fnt">${U.px(cs.fontSize)}/${U.px(cs.lineHeight) || "–"} ${cs.fontWeight}</span>`);
    if (on("tag")) bits.push(`<span class="dbgov-tag">${el2.tagName.toLowerCase()}${el2.id ? "#" + U.esc(el2.id) : ""}</span>`);
    return bits.join(" · ");
  }
  function compact3(i) {
    const { r, cs } = i;
    const dec = Tools.annotator(i);
    const on = (k) => Tools.setting(this, k);
    const bits = [];
    if (on("size")) bits.push(`<span class="dbgov-sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`);
    if (on("radius")) {
      const rad = U.radius(cs);
      if (rad) bits.push(`<span class="dbgov-rad">r ${rad}</span>`);
    }
    if (on("padding")) {
      const p = U.four(cs, "padding", dec);
      if (p) bits.push(`<span class="dbgov-sp">p ${p.join(" ")}</span>`);
    }
    return bits.join(" · ");
  }
  function options() {
    return [
      { key: "size", label: "Size", def: true, type: "toggle", affects: "inspect" },
      { key: "radius", label: "Radius", def: true, type: "toggle", affects: "inspect" },
      { key: "padding", label: "Padding", def: true, type: "toggle", affects: "inspect" },
      { key: "margin", label: "Margin", def: true, type: "toggle", affects: "inspect" },
      { key: "layout", label: "Display & gap", def: true, type: "toggle", affects: "inspect" },
      { key: "font", label: "Font", def: true, type: "toggle", affects: "inspect" },
      { key: "tag", label: "Tag & id", def: true, type: "toggle", affects: "inspect" }
    ];
  }
  function legend3() {
    return [
      { mark: "92×24", means: "width × height, rounded" },
      { mark: "r 13", means: "border-radius" },
      { mark: "p / m", means: "padding / margin - top right bottom left, collapsed when equal" },
      { mark: "gap 12", means: "flex or grid gap" },
      { mark: "12/16 400", means: "font-size / line-height, weight" }
    ];
  }

  // src/tools/geometry/measure/report.js
  function report3({ r, cs }) {
    const pad = U.fourPlain(cs, "padding"), mar = U.fourPlain(cs, "margin");
    return [
      `  box: ${Math.round(r.width)}×${Math.round(r.height)} @ (${Math.round(r.left)}, ${Math.round(r.top)})`,
      `  padding: ${pad.t} ${pad.r} ${pad.b} ${pad.l} | margin: ${mar.t} ${mar.r} ${mar.b} ${mar.l} | radius: ${U.radius(cs) || 0}`,
      `  display: ${cs.display}${U.px(cs.gap) ? " gap:" + U.px(cs.gap) : ""} | position: ${cs.position} | overflow: ${cs.overflow}`,
      `  font: ${U.px(cs.fontSize)}px/${U.px(cs.lineHeight) || "normal"} ${cs.fontWeight} ${cs.fontFamily.split(",")[0]}`,
      `  color: ${cs.color} | bg: ${cs.backgroundColor}`
    ];
  }
  function reportTail() {
    return this._pairs().map(([A, B]) => {
      const ra = A.el.getBoundingClientRect(), rb = B.el.getBoundingClientRect();
      const g = U.gap(ra, rb);
      const axis = Measure.axisOf(ra, rb);
      return `[#${A.id} → #${B.id}] ${axis.label}: ` + (axis.kind === "overlap" ? "elements overlap" : axis.kind === "diagonal" ? `horizontal ${g.dx}px + vertical ${g.dy}px` : `${axis.kind === "vertical" ? g.dy : g.dx}px`);
    });
  }

  // src/tools/geometry/measure/draw.js
  function draw3({ layer: layer2, Place: Place2 }) {
    Measure.resetLanes();
    for (const [A, B] of this._pairs()) {
      Measure.dimension(
        layer2,
        Place2,
        A.el.getBoundingClientRect(),
        B.el.getBoundingClientRect(),
        `#${A.id}→#${B.id}`
      );
    }
  }

  // src/tools/geometry/measure/index.js
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-leader { position: fixed; pointer-events: none; background: rgba(255,255,255,.55); }
    .dbgov-line { position: fixed; pointer-events: none; background: rgba(181,232,83,.85);
      border-radius: 1px; box-shadow: 0 0 0 .5px rgba(0,0,0,.4); }
    .dbgov-cap { position: fixed; pointer-events: none; background: #b5e853;
      border-radius: 1px; box-shadow: 0 0 0 .5px rgba(0,0,0,.5); }
    .dbgov-arrow { position: fixed; pointer-events: none; width: 0; height: 0;
      filter: drop-shadow(0 0 .5px rgba(0,0,0,.6)); }
    .dbgov-arrow.dbgov-up    { border-left: 5px solid transparent; border-right: 5px solid transparent;
                         border-bottom: 7px solid #b5e853; }
    .dbgov-arrow.dbgov-down  { border-left: 5px solid transparent; border-right: 5px solid transparent;
                         border-top: 7px solid #b5e853; }
    .dbgov-arrow.dbgov-left  { border-top: 5px solid transparent; border-bottom: 5px solid transparent;
                         border-right: 7px solid #b5e853; }
    .dbgov-arrow.dbgov-right { border-top: 5px solid transparent; border-bottom: 5px solid transparent;
                         border-left: 7px solid #b5e853; }
    .dbgov-ext { position: fixed; pointer-events: none;
      background: repeating-linear-gradient(to right,
        rgba(181,232,83,.7) 0 4px, transparent 4px 8px); }
    .dbgov-ext.dbgov-v { background: repeating-linear-gradient(to bottom,
        rgba(181,232,83,.7) 0 4px, transparent 4px 8px); }
    .dbgov-dist { position: fixed; pointer-events: none;
      background: rgba(24,28,14,.95); color: #b5e853; border-radius: 7px;
      padding: 3px 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .dbgov-dist.dbgov-vert { border-left: 2px solid #b5e853; }
    `,
    id: "measure",
    family: "geometry",
    // audited: must match the domain folder this sits in
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13" /><path d="m8 6 2-2" /><path d="m18 16 2-2" /><path d="m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17" /><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></svg>',
    // lucide 'pencil-ruler' (ISC)
    title: "Measure — size, radius, spacing, font, distances",
    startsOn: true,
    // the read-out is what the overlay is FOR
    /**
     * A pair has a distance; a group of five does not have one distance.
     * Anything that is not two elements is something this tool has nothing
     * to say about, and it says so by drawing nothing rather than guessing
     * which two of them were meant.
     */
    _pairs: () => Tools.groups().filter((g) => g.length === 2),
    badge: badge3,
    legend: legend3,
    compact: compact3,
    options,
    report: report3,
    reportTail,
    draw: draw3
  });

  // src/tools/grid/service.js
  var Scale = defineSubject({
    id: "scale",
    was: "grid",
    // its settings lived under this id before the subject existed
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="m18 8 4 4-4 4" /><path d="M2 12h20" /><path d="m6 8-4 4 4 4" /></svg>',
    // lucide 'move-horizontal' (ISC) — scale is spacing, not the grid tool
    options() {
      return [
        // 2, not 4, because that is what the scale in front of us actually is:
        // Tailwind's default spacing has half-steps (0.5 = 2px, 1.5 = 6px) and
        // a real page used them 2,681 times. A rule has to check the scale a
        // project HAS; making the project match the rule is the wrong way round.
        {
          key: "step",
          label: "Grid step",
          def: CONFIG.GRID,
          values: [1, 2, 4, 8],
          suffix: "px",
          affects: "detect"
        },
        // Where a spacing token stops and layout arithmetic begins.
        // getComputedStyle resolves `margin: auto` to the pixels it worked out
        // — 1127px on a real page — and nothing distinguishes that from a value
        // somebody typed. Nobody types 1127px.
        {
          key: "max",
          label: "Ignore above",
          def: CONFIG.GRID_MAX,
          type: "number",
          min: 8,
          max: 2e3,
          step: 8,
          suffix: "px",
          affects: "detect"
        },
        // OFF, and it stays off by default: width and height are what layout
        // produced, not what anyone typed, and judging them turned one real
        // signal into 2,215 findings about icon geometry on a real page.
        {
          key: "boxes",
          label: "Judge width & height",
          def: false,
          type: "toggle",
          affects: "detect"
        }
      ];
    },
    step() {
      return Tools.setting(this, "step");
    },
    max() {
      return Tools.setting(this, "max");
    },
    boxes() {
      return Tools.setting(this, "boxes");
    },
    /** 0 is never off the grid, or every padding:0 would light up. */
    off(n) {
      const step = this.step();
      return n !== 0 && n % step !== 0;
    },
    /**
     * Off the grid AND close enough to be something somebody typed.
     *
     * The ceiling used to live only in the rule, so a resolved `margin: auto`
     * of 1127px got a ⚠ on the badge and no finding in the sweep — the badge
     * and the audit disagreeing about one number, which is the exact
     * contradiction this subject exists to make impossible. Every consumer
     * asks this, so there is one answer.
     */
    judges(n) {
      return this.off(n) && Math.abs(n) <= this.max();
    },
    /**
     * The nearest value that WOULD pass — the RECOMMENDATION facet's answer.
     *
     * On the subject, not in the lens, for the same reason judges() is: the
     * ⚠ and the →8 must come from one place or they could disagree about the
     * same number. Half away from zero, matching U.px, so 7 on a 2px step
     * suggests 8 and -7 suggests -8 — a margin and its mirror image get
     * mirror advice.
     */
    nearest(n) {
      const step = this.step();
      return Math.sign(n) * Math.round(Math.abs(n) / step) * step;
    },
    /**
     * Off-grid numbers on one element, as [name, value] pairs. `boxes` adds
     * width and height — true when somebody pointed at this element and asked,
     * false when a sweep is judging the page.
     */
    scan(info, boxes) {
      const cs = info.cs;
      const pad = U.fourPlain(cs, "padding"), mar = U.fourPlain(cs, "margin");
      const out = [];
      const check = (n, v) => {
        if (this.judges(v)) out.push([n, v]);
      };
      if (boxes) {
        const r = info.r;
        const box = (n, v) => {
          if (this.off(v)) out.push([n, v]);
        };
        box("w", Math.round(r.width));
        box("h", Math.round(r.height));
      }
      ["t", "r", "b", "l"].forEach((k) => {
        check("pad-" + k, pad[k]);
        check("mar-" + k, mar[k]);
      });
      const row = U.px(cs.rowGap), col = U.px(cs.columnGap);
      if (row || col) {
        if (row) check("gap-row", row);
        if (col) check("gap-col", col);
      } else {
        const gap = U.px(cs.gap);
        if (gap) check("gap", gap);
      }
      return out;
    }
  });

  // src/tools/grid/badge.js
  function badge4(i) {
    const bad = Scale.scan(i, true);
    if (!bad.length) return null;
    const vals = [...new Set(bad.map(([, v]) => v))];
    return `<span class="dbgov-warn">⚠ ${vals.join(" ")} off ${Scale.step()}px</span>`;
  }
  function compact4(i) {
    const bad = Scale.scan(i, true);
    return bad.length ? `<span class="dbgov-warn">⚠${bad.length}</span>` : null;
  }
  function legend4() {
    return [
      { mark: "7⚠", means: "amber: this number is off the spacing step" },
      { mark: "7⚠→8", means: "the nearest on-step value - the Recommendation facet" }
    ];
  }

  // src/tools/grid/lens.js
  function annotate(html, n, info) {
    if (!Scale.judges(n)) return html;
    const fix = info?.facets?.suggest ? `→${Scale.nearest(n)}` : "";
    return `<span class="dbgov-warn">${html}⚠${fix}</span>`;
  }

  // src/tools/grid/report.js
  function report4(i) {
    const bad = Scale.scan(i, true);
    return bad.length ? [`  ⚠ off ${Scale.step()}px grid: ${bad.map(([n, v]) => `${n}:${v}`).join(", ")}`] : [];
  }

  // src/tools/grid/rule.js
  var rules3 = {
    "grid-off": {
      help: "Spacing should be a multiple of the grid step — change which step this checks in the panel under ⚙.",
      why: "One-off values are how a spacing scale erodes: each looks harmless alone, and together they are why nothing lines up."
    }
  };
  function audit2(i) {
    if (!(i.el instanceof HTMLElement)) return [];
    return Scale.scan(i, Scale.boxes()).map(([n, v]) => ({
      el: i.el,
      verdict: "fail",
      // a spacing system is a convention, not a rule anyone can be hurt
      // by breaking — it ranks below anything a reader actually suffers
      severity: "info",
      rule: "grid-off",
      // the VALUE, not the side it appeared on: these group by value, and
      // "pad-t ×24" would read as 24 top paddings when it is one number
      // used in twenty-four places. The sides are in the per-pin report.
      message: `${v}px is off the ${Scale.step()}px grid`,
      key: `grid-off|${v}`
    }));
  }

  // src/tools/grid/draw.js
  function draw4({ marks, found }) {
    marks(found);
  }

  // src/tools/grid/index.js
  defineTool({
    id: "grid",
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></svg>',
    // lucide 'grid-3x3' (ISC)
    // No number in the title: the step is the user's now, and a title baked
    // at boot would still be claiming 2px long after they picked 8.
    title: "Grid — flag values off the spacing grid",
    startsOn: true,
    // the ⚠ on a badge is what makes the read-out useful
    uses: [Scale],
    // its settings are Scale's, and belong on its own menu
    badge: badge4,
    legend: legend4,
    compact: compact4,
    annotate,
    report: report4,
    rules: rules3,
    audit: audit2,
    draw: draw4
    // no options of its own any more: 'Suggest nearest step' was the
    // RECOMMENDATION facet wearing this tool's name, and it moved to the
    // badge face (was: 'grid' there adopts what anyone saved). The step
    // and ceiling were never grid's either — they are Scale's, reached
    // through uses: above.
  });

  // src/tools/perf/target.js
  var Targets = {
    map: /* @__PURE__ */ new Map(),
    // el -> { mo, times: [ts…], worstEvt, shift }
    /** Rolling mutations/second over the rate window. */
    rate(el2) {
      const t = Targets.map.get(el2);
      if (!t) return null;
      const cut = Date.now() - CONFIG.PERF.RATE_WINDOW;
      while (t.times.length && t.times[0] < cut) t.times.shift();
      return Math.round(t.times.length * 1e3 / CONFIG.PERF.RATE_WINDOW);
    },
    /** Mutations inside [from, to] — the freeze-correlation question. */
    countIn(el2, from, to) {
      const t = Targets.map.get(el2);
      if (!t) return 0;
      return t.times.reduce((n, ts) => n + (ts >= from && ts <= to ? 1 : 0), 0);
    },
    stats(el2) {
      const t = Targets.map.get(el2);
      if (!t) return null;
      return { rate: Targets.rate(el2), worstEvt: t.worstEvt, shift: t.shift };
    },
    /** Reconcile with what is targeted NOW. Cheap: pins are user-made
     *  and few, and this only ever attaches/detaches the difference. */
    sync(els) {
      const want = new Set(els.filter((el2) => el2 && document.contains(el2)));
      for (const [el2, t] of Targets.map) {
        if (want.has(el2)) continue;
        t.mo.disconnect();
        Targets.map.delete(el2);
      }
      for (const el2 of want) {
        if (Targets.map.has(el2)) continue;
        const rec = { mo: null, times: [], worstEvt: null, shift: 0 };
        rec.mo = new MutationObserver((muts) => {
          const now = Date.now();
          for (let i = 0; i < muts.length; i++) rec.times.push(now);
          const cut = now - CONFIG.PERF.RATE_WINDOW;
          while (rec.times.length && rec.times[0] < cut) rec.times.shift();
        });
        rec.mo.observe(el2, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true
        });
        Targets.map.set(el2, rec);
      }
    },
    /** A slow-input or layout-shift entry, attributed if its node sits
     *  inside a watched subtree. Called by service.js's observers. */
    attribute(node, kind, value) {
      if (!node) return;
      for (const [el2, t] of Targets.map) {
        if (el2 !== node && !el2.contains(node)) continue;
        if (kind === "event" && value > (t.worstEvt || 0)) t.worstEvt = value;
        if (kind === "shift") t.shift += value;
      }
    },
    clear() {
      for (const [, t] of Targets.map) t.mo.disconnect();
      Targets.map.clear();
    }
  };

  // src/tools/perf/service.js
  var Monitor = {
    running: false,
    tier: null,
    // 'frame-attribution' | 'long-tasks' | 'heartbeat'
    log: [],
    // ring buffer, oldest first: { t, ms, src, via }
    fps: null,
    // rolling frames-per-second, null until measured
    startedAt: 0,
    _owner: null,
    // the tool, for Tools.setting — set by watch()
    _obs: null,
    _obs2: [],
    _raf: 0,
    _last: 0,
    _frames: 0,
    _fpsT: 0,
    _onVis: null,
    _redraw: null,
    _drewT: 0,
    load: null,
    // this navigation's timings — static per page
    pre: [],
    // long tasks from BEFORE arming (buffered entries)
    threshold() {
      const v = Monitor._owner && Tools.setting(Monitor._owner, "freeze");
      return Number(v) || CONFIG.PERF.FREEZE_MS;
    },
    push(ev) {
      let worst = null;
      for (const [el2] of Targets.map) {
        const n = Targets.countIn(el2, ev.t - ev.ms, ev.t);
        if (n && (!worst || n > worst.n)) worst = { el: el2, n };
      }
      if (worst) ev.blame = `${U.labelOf(worst.el)} ×${worst.n}`;
      Monitor.log.push(ev);
      if (Monitor.log.length > CONFIG.PERF.LOG_MAX) Monitor.log.shift();
    },
    worst() {
      return Monitor.log.reduce((m, e) => Math.max(m, e.ms), 0);
    },
    start(owner, redraw) {
      if (Monitor.running) return;
      Monitor.running = true;
      Monitor._owner = owner;
      Monitor._redraw = redraw || null;
      Monitor.log = [];
      Monitor.fps = null;
      Monitor.startedAt = Date.now();
      Monitor._armedAtPerf = performance.now();
      Monitor.pre = [];
      Monitor.load = null;
      try {
        const nav = performance.getEntriesByType?.("navigation")?.[0];
        if (nav) {
          const fcp = performance.getEntriesByType?.("paint")?.find((e) => e.name === "first-contentful-paint");
          Monitor.load = {
            server: Math.round(nav.responseStart - nav.startTime),
            dom: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
            done: nav.loadEventEnd ? Math.round(nav.loadEventEnd - nav.startTime) : null,
            fcp: fcp ? Math.round(fcp.startTime) : null
          };
        }
      } catch {
      }
      const types = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes || [];
      const classify = (e, src) => {
        if (e.startTime + e.duration <= Monitor._armedAtPerf) {
          Monitor.pre.push({ ms: Math.round(e.duration), src });
          if (Monitor.pre.length > 10) Monitor.pre.shift();
        } else if (e.duration >= Monitor.threshold()) {
          Monitor.push({
            t: Date.now(),
            ms: Math.round(e.duration),
            src,
            via: src ? "frame" : "task"
          });
        }
      };
      if (types.includes("long-animation-frame")) {
        Monitor.tier = "frame-attribution";
        Monitor._obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const s = e.scripts && e.scripts[0];
            const src = s && (s.sourceURL || s.invoker || s.name) || null;
            classify(e, src && String(src).split("/").pop().split("?")[0]);
          }
        });
        Monitor._obs.observe({ type: "long-animation-frame", buffered: true });
      } else if (types.includes("longtask")) {
        Monitor.tier = "long-tasks";
        Monitor._obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) classify(e, null);
        });
        Monitor._obs.observe({ type: "longtask", buffered: true });
      } else {
        Monitor.tier = "heartbeat";
      }
      Monitor._obs2 = [];
      if (types.includes("event")) {
        const o = new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            Targets.attribute(e.target, "event", Math.round(e.duration));
        });
        o.observe({ type: "event", durationThreshold: 104 });
        Monitor._obs2.push(o);
      }
      if (types.includes("layout-shift")) {
        const o = new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            for (const s of e.sources || [])
              Targets.attribute(s.node, "shift", e.value);
        });
        o.observe({ type: "layout-shift" });
        Monitor._obs2.push(o);
      }
      Monitor._onVis = () => {
        Monitor._last = 0;
        Monitor._frames = 0;
        Monitor._fpsT = 0;
      };
      document.addEventListener("visibilitychange", Monitor._onVis);
      const tick = (t) => {
        if (!Monitor.running) return;
        if (Monitor._last) {
          const gap = t - Monitor._last;
          Monitor._frames++;
          if (t - Monitor._fpsT >= CONFIG.PERF.FPS_WINDOW) {
            Monitor.fps = Math.round(Monitor._frames * 1e3 / (t - Monitor._fpsT));
            Monitor._frames = 0;
            Monitor._fpsT = t;
          }
          if (Monitor.tier === "heartbeat" && gap >= Monitor.threshold() && document.visibilityState === "visible") {
            Monitor.push({ t: Date.now(), ms: Math.round(gap), src: null, via: "heartbeat" });
          }
        } else {
          Monitor._fpsT = t;
        }
        Monitor._last = t;
        Targets.sync([...State.pins.map((p) => p.el), State.current]);
        if (Monitor._redraw && t - (Monitor._drewT || 0) >= 500 && (Targets.map.size || Monitor.log.length || State.hoverEl)) {
          Monitor._drewT = t;
          Monitor._redraw();
        }
        Monitor._raf = requestAnimationFrame(tick);
      };
      Monitor._raf = requestAnimationFrame(tick);
    },
    stop() {
      if (!Monitor.running) return;
      Monitor.running = false;
      Monitor._obs?.disconnect();
      Monitor._obs = null;
      Monitor._obs2.forEach((o) => o.disconnect());
      Monitor._obs2 = [];
      Targets.clear();
      cancelAnimationFrame(Monitor._raf);
      document.removeEventListener("visibilitychange", Monitor._onVis);
      Monitor._last = 0;
    }
  };
  function fmt(ms) {
    return ms < 1e3 ? `${ms}ms` : `${(ms / 1e3).toFixed(1)}s`;
  }
  function watch(ctx) {
    Monitor.start(this, ctx?.redraw);
  }
  function unwatch() {
    Monitor.stop();
  }

  // src/tools/perf/badge.js
  function badge5(i) {
    if (!Monitor.running) return null;
    const s = Targets.stats(i.el);
    if (s) {
      const churn = Number(Tools.setting(this, "churn")) || CONFIG.PERF.CHURN;
      const mut = s.rate >= churn ? `<span class="dbgov-warn">mut ${s.rate}/s</span>` : `mut ${s.rate}/s`;
      const bits = [`⚡ ${mut}`];
      if (s.worstEvt) bits.push(`resp ${fmt(s.worstEvt)}`);
      if (s.shift > 5e-3) bits.push(`shift ${s.shift.toFixed(2)}`);
      return `<span class="dbgov-sp">${bits.join(" · ")}</span>`;
    }
    const fps = Monitor.fps == null ? "–" : Monitor.fps;
    const n = Monitor.log.length;
    return `<span class="dbgov-sp">⚡ ${fps}fps</span>` + (n ? ` <span class="dbgov-warn">${n}× worst ${fmt(Monitor.worst())}</span>` : "");
  }
  function compact5(i) {
    if (!Monitor.running) return null;
    const s = Targets.stats(i.el);
    const churn = Number(Tools.setting(this, "churn")) || CONFIG.PERF.CHURN;
    if (s && s.rate >= churn) return `<span class="dbgov-warn">⚡mut ${s.rate}/s</span>`;
    if (!s && Monitor.log.length) return `<span class="dbgov-warn">⚡${fmt(Monitor.worst())}</span>`;
    return null;
  }
  function legend5() {
    return [
      { mark: "⚡ 58fps", means: "the PAGE, not this element: frames per second while monitoring" },
      { mark: "⚡1.2s", means: "amber: the longest main-thread freeze since arming" },
      { mark: "⚡ mut 140/s", means: "a PINNED element: DOM mutations per second under it — a re-render storm reads in the hundreds" },
      { mark: "resp 380ms", means: "the slowest input this element answered (where the browser reports it)" },
      { mark: "shift 0.02", means: "layout shift this element caused (where the browser reports it)" }
    ];
  }

  // src/tools/perf/rows.js
  function listRows() {
    const now = Date.now();
    const ago = (t) => {
      const s = Math.round((now - t) / 1e3);
      return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
    };
    return Monitor.log.slice().reverse().map((e) => ({
      tag: "⚡",
      label: `main thread blocked ${fmt(e.ms)}`,
      detail: `${ago(e.t)}${e.src ? " · " + e.src : ""}${e.blame ? " · during: " + e.blame : ""}`
    }));
  }
  function reportTail2() {
    if (!Monitor.running && !Monitor.log.length) return [];
    const secs = Math.round((Date.now() - Monitor.startedAt) / 1e3);
    const L = [`## performance — monitored ${secs}s · tier: ${Monitor.tier}`];
    L.push(Monitor.fps == null ? "fps: (no full window yet)" : `fps: ${Monitor.fps}`);
    if (!Monitor.log.length) {
      L.push(`main thread: no blocks over the threshold`);
    } else {
      const srcs = [...new Set(Monitor.log.map((e) => e.src).filter(Boolean))];
      L.push(`main thread: ${Monitor.log.length} block${Monitor.log.length === 1 ? "" : "s"}, worst ${fmt(Monitor.worst())}` + (srcs.length ? ` — ${srcs.join(", ")}` : ""));
      if (Monitor.tier !== "frame-attribution") {
        L.push("(no script attribution on this browser — Chrome reports which script ate the frame)");
      }
      const blamed = Monitor.log.filter((e) => e.blame);
      for (const e of blamed.slice(-3))
        L.push(`  during the ${fmt(e.ms)} block: ${e.blame} mutations`);
    }
    for (const [el2] of Targets.map) {
      const s = Targets.stats(el2);
      if (!s || !document.contains(el2)) continue;
      const bits = [`mut ${s.rate}/s`];
      if (s.worstEvt) bits.push(`worst input ${fmt(s.worstEvt)}`);
      if (s.shift > 5e-3) bits.push(`layout shift ${s.shift.toFixed(2)}`);
      L.push(`watched ${U.selectorOf(el2)}: ${bits.join(" · ")}`);
    }
    if (Monitor.load || Monitor.pre.length) {
      L.push("", "## load — this navigation");
      const ld = Monitor.load;
      if (ld) {
        const bits = [`server ${fmt(ld.server)}`, `DOM ready ${fmt(ld.dom)}`];
        if (ld.done) bits.push(`loaded ${fmt(ld.done)}`);
        if (ld.fcp) bits.push(`first paint ${fmt(ld.fcp)}`);
        L.push(bits.join(" · "));
      }
      if (Monitor.pre.length) {
        const worst = Monitor.pre.reduce((m, e) => e.ms > m.ms ? e : m);
        L.push(`${Monitor.pre.length} long task${Monitor.pre.length === 1 ? "" : "s"} before arming, worst ${fmt(worst.ms)}` + (worst.src ? ` (${worst.src})` : ""));
      }
    }
    return L;
  }

  // src/tools/perf/rule.js
  function audit3(i) {
    if (!Monitor.running) return [];
    const s = Targets.stats(i.el);
    if (!s) return [];
    const out = [];
    const churn = Number(Tools.setting(this, "churn")) || CONFIG.PERF.CHURN;
    if (s.rate >= churn) {
      out.push({
        el: i.el,
        verdict: "fail",
        severity: "warn",
        rule: "perf-churn",
        message: `${s.rate} mutations/s under this element — a re-render storm`,
        key: `perf-churn:${s.rate}`
      });
    }
    if (s.worstEvt && s.worstEvt >= Monitor.threshold()) {
      out.push({
        el: i.el,
        verdict: "fail",
        severity: "warn",
        rule: "perf-input",
        message: `an input on this element took ${fmt(s.worstEvt)} to answer`,
        key: `perf-input:${s.worstEvt}`
      });
    }
    return out;
  }
  var rules4 = {
    "perf-churn": {
      help: "DOM mutations per second under a watched element, against the churn threshold in ⚙. Only elements you pinned or selected are watched, and only while ⚡ is armed.",
      why: "A component mutating the DOM hundreds of times a second is re-rendering in a loop — work the user cannot see, spent heating the main thread. It is the most common way one component eats a page."
    },
    "perf-input": {
      help: "The slowest input event a watched element answered, against the freeze threshold in ⚙. Reported where the browser supports the Event Timing API.",
      why: "An input that takes hundreds of milliseconds to answer is the stutter a user actually feels — and it names the component responsible, which a page-wide freeze cannot."
    }
  };

  // src/tools/perf/draw.js
  function draw5({ marks, found }) {
    marks(found);
  }

  // src/tools/perf/index.js
  defineTool({
    id: "perf",
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg>',
    // lucide 'activity' (ISC)
    title: "Perf — freezes and jank while armed; the badge shows the page's pulse",
    startsOn: false,
    watch,
    unwatch,
    badge: badge5,
    compact: compact5,
    legend: legend5,
    listRows,
    reportTail: reportTail2,
    audit: audit3,
    rules: rules4,
    draw: draw5,
    options() {
      return [
        {
          key: "freeze",
          label: "Freeze threshold",
          def: CONFIG.PERF.FREEZE_MS,
          type: "number",
          min: 100,
          max: 5e3,
          step: 50,
          suffix: "ms",
          affects: "detect"
        },
        {
          key: "churn",
          label: "Churn threshold",
          def: CONFIG.PERF.CHURN,
          type: "number",
          min: 10,
          max: 1e3,
          step: 10,
          suffix: "/s",
          affects: "detect"
        }
      ];
    }
  });

  // src/tools/pin/keep.js
  function keeps() {
    return true;
  }

  // src/tools/pin/index.js
  defineTool({
    id: "pin",
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></svg>',
    // lucide 'pin' (ISC)
    title: "Pin — keep what you select; off, selections replace each other",
    startsOn: true,
    keeps
  });

  // src/tools/select/service.js
  function groups() {
    return this._form().groups;
  }
  function pendingIndex() {
    const { pending } = this._form();
    return pending ? State.pins.indexOf(pending) : -1;
  }
  function gestures() {
    return [{
      keys: "Ctrl/⌘+Shift+click",
      does: "chain to the previous pin — repeat for ①─②─③"
    }];
  }

  // src/tools/select/form.js
  function form(pins) {
    const K = CONFIG.PIN_KIND;
    const sel = pins.filter((p) => p.kind === K.SHIFT || p.kind === K.CHAIN);
    const runs = [];
    for (const p of sel) {
      const last = runs[runs.length - 1];
      if (last && (p.kind === K.CHAIN || last.length === 1)) last.push(p);
      else runs.push([p]);
    }
    const groups2 = [];
    for (const run of runs)
      for (let k = 0; k + 1 < run.length; k++) groups2.push([run[k], run[k + 1]]);
    const lastRun = runs[runs.length - 1];
    const pending = lastRun && lastRun.length === 1 ? lastRun[0] : null;
    return { groups: groups2, pending };
  }

  // src/tools/select/rows.js
  function listRows2() {
    const { groups: groups2, pending } = this._form();
    const rows = groups2.map(([A, B]) => {
      const ra = A.el.getBoundingClientRect(), rb = B.el.getBoundingClientRect();
      const g = U.gap(ra, rb);
      const axis = Measure.axisOf(ra, rb);
      const detail = axis.kind === "overlap" ? "overlapping" : axis.kind === "diagonal" ? `→ ${g.dx} · ↓ ${g.dy} px` : axis.kind === "vertical" ? `↕ ${g.dy} px` : `↔ ${g.dx} px`;
      return {
        tag: `#${A.id}→#${B.id}`,
        label: `${U.labelOf(A.el)} ↔ ${U.labelOf(B.el)}`,
        detail,
        pins: [A, B]
      };
    });
    if (pending) rows.push({
      tag: `#${pending.id}…`,
      label: U.labelOf(pending.el),
      detail: "pick its pair, or chain to it",
      pins: [pending]
    });
    return rows;
  }
  function reportTail3() {
    const { pending } = this._form();
    return pending ? [`[#${pending.id}] waiting for its pair`] : [];
  }

  // src/tools/select/index.js
  defineTool({
    id: "select",
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M5 3a2 2 0 0 0-2 2" /><path d="M19 3a2 2 0 0 1 2 2" /><path d="M21 19a2 2 0 0 1-2 2" /><path d="M5 21a2 2 0 0 1-2-2" /><path d="M9 3h1" /><path d="M9 21h1" /><path d="M14 3h1" /><path d="M14 21h1" /><path d="M3 9v1" /><path d="M21 9v1" /><path d="M3 14v1" /><path d="M21 14v1" /></svg>',
    // lucide 'box-select' (ISC)
    title: "Select — how pinned elements group up",
    startsOn: true,
    /** The single place grouping is decided — see form.js. */
    _form() {
      return form(State.pins);
    },
    groups,
    pendingIndex,
    gestures,
    listRows: listRows2,
    reportTail: reportTail3
  });

  // src/ui/styles.js
  var CSS2 = `
    /* NAMESPACING DEFENDS THE CLASS AXIS ONLY. A host rule on a TAG or an
       attribute — Bootstrap Reboot's hr, Tailwind Preflight's svg, the usual
       input[type=checkbox] visually-hidden trick — matches our elements no
       matter what we call them, and an INHERITED property set on <html> flows
       straight into us: the root is a child of documentElement. Specificity is
       not the defence; declaring the property is. So the root stops every
       inherited property we rely on, and each element type below re-asserts
       what a host most commonly sets on it. */
    #__dbgov-root { position: fixed; inset: 0; z-index: ${CONFIG.Z}; pointer-events: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px; font-style: normal; font-variant: normal; font-weight: 400;
      line-height: normal; letter-spacing: normal; word-spacing: normal;
      text-transform: none; text-indent: 0; text-shadow: none; text-align: left;
      white-space: normal; direction: ltr; visibility: visible; float: none; }
    #__dbgov-root * { box-sizing: border-box; float: none; }
    /* form controls take their own tag rules — a host styling the button TAG reaches
       every button we draw, whatever we called it */
    #__dbgov-root button, #__dbgov-root input, #__dbgov-root select {
      margin: 0; text-transform: none; letter-spacing: normal;
      word-spacing: normal; text-indent: 0; }

    .dbgov-box { position: fixed; pointer-events: none; }
    .dbgov-hover  { outline: 1.5px solid #58c4ff; outline-offset: -1px; background: rgba(88,196,255,.06); }
    /* note pin = plain click (inspect only) · pair = Shift+click ·
       link = Ctrl/⌘+Shift+click, chained to the previous pin */
    .dbgov-pinbox { outline: 1.5px dashed #ff8a65; outline-offset: -1px; }
    .dbgov-pinbox.dbgov-pair { outline-style: solid; outline-color: #b5e853; }
    .dbgov-pinbox.dbgov-link { outline-style: solid; outline-color: #c084fc; }
    .dbgov-pinbox.dbgov-waiting { outline-color: #58c4ff; }
    .dbgov-pinbox.dbgov-rmtarget { outline: 2px solid #ff5c5c; background: rgba(255,92,92,.10); }
    .dbgov-pinbox.dbgov-flash { outline: 2.5px solid #58c4ff;
      background: rgba(88,196,255,.18); }
    @media (prefers-reduced-motion: no-preference) {
      .dbgov-pinbox.dbgov-flash { animation: dbgov-pulse .9s ease-out; }
    }
    @keyframes dbgov-pulse {
      0% { box-shadow: 0 0 0 0 rgba(88,196,255,.55); }
      100% { box-shadow: 0 0 0 16px rgba(88,196,255,0); } }

    /* pin list popover — opened from the count chip, closed for screenshots */
    /* the target menu — right-click's "what can you do with this element" */
    #__dbgov-menu { position: fixed; display: none; pointer-events: auto;
      min-width: 150px; background: rgba(18,18,20,.97); border-radius: 10px;
      padding: 4px; box-shadow: 0 6px 24px rgba(0,0,0,.6); color: #fff;
      font-size: 12px; }
    #__dbgov-menu.dbgov-open { display: block; }
    #__dbgov-menu button { display: block; width: 100%; text-align: left;
      padding: 7px 12px; background: transparent; border: 0; border-radius: 6px;
      color: inherit; font: inherit; cursor: pointer; }
    #__dbgov-menu button:hover { background: #3a3a41; }
    #__dbgov-list { position: fixed; display: none; pointer-events: auto;
      min-width: 250px; max-width: 460px; max-height: 60vh; overflow-y: auto;
      background: rgba(18,18,20,.97); border-radius: 12px; padding: 6px;
      box-shadow: 0 6px 24px rgba(0,0,0,.6); color: #fff; font-size: 12px; }
    #__dbgov-list.dbgov-open { display: block; }
    #__dbgov-list .dbgov-empty { padding: 10px 8px; color: #8f8f96; line-height: 1.5; }
    #__dbgov-list .dbgov-row { display: flex; align-items: center; gap: 8px;
      padding: 6px 8px; border-radius: 8px; }
    /* only a row that DOES something on click says so — a settings row is a
       label beside a control, and a pointer over it promised an action that
       never came */
    #__dbgov-list .dbgov-row[role="button"] { cursor: pointer; }
    #__dbgov-list .dbgov-row:hover { background: rgba(255,255,255,.08); }
    #__dbgov-list .dbgov-tag { flex: none; color: #ff8a65; font-weight: 800; }
    /* THE MESSAGE IS THE CONTENT AND MUST NOT BE THE CELL THAT COLLAPSES.
       .dbgov-lbl was the only shrinkable item in the row (every sibling is
       flex: none), and its overflow:hidden zeroes its automatic minimum size —
       so a long CSS selector in .dbgov-det ate the whole row and the finding
       rendered with NO TEXT AT ALL: measured 0px wide on 2 of 11 rows. The
       floor keeps the human-readable half; the machine-readable half is what
       truncates, with the whole of it in the row's title. */
    #__dbgov-list .dbgov-lbl { flex: 1 1 auto; min-width: 55%; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    #__dbgov-list .dbgov-det { flex: 0 1 auto; min-width: 0; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
      color: #b5e853; font-weight: 700; }
    /* A row may carry an opaque accent; the panel copies it onto the element
       without knowing what any of the values mean. */
    #__dbgov-list .dbgov-row[data-accent="error"] .dbgov-tag { color: #ff6b6b; }
    #__dbgov-list .dbgov-row[data-accent="warn"]  .dbgov-tag { color: #ffd54f; }
    #__dbgov-list .dbgov-row[data-accent="info"]  .dbgov-tag { color: #9ad0ff; }
    /* not a verdict — something the tool could not measure and you have to
       look at yourself; italic so it never reads as a failure */
    #__dbgov-list .dbgov-row[data-accent="review"] .dbgov-tag { color: #8ab4f8; font-style: italic; }
    /* The verdict reads first and the selector says where to look, so a
       finding puts its message in .dbgov-lbl — which already takes the room and
       ellipsises — and the element in .dbgov-det. No direction tricks: rtl reorders
       the neutral characters in a CSS selector and prints '#id' backwards. */
    #__dbgov-list .dbgov-row[data-accent] .dbgov-det { color: #8f8f96; font-weight: 400; }
    /* A settings row's picker. font: inherit because a bare <select> takes the
       PAGE's font on some sites and the row stops lining up; the overlay must
       look the same wherever it is injected. */
    #__dbgov-list .dbgov-opt { flex: none; cursor: pointer; font: inherit;
      background: #2c2c31; color: #b5e853; font-weight: 700; border: 0;
      border-radius: 6px; padding: 3px 6px;
      width: auto; height: auto; margin: 0; position: static;
      opacity: 1; appearance: auto; text-transform: none; }
    #__dbgov-list .dbgov-opt:hover { background: #3a3a41; }
    /* what the settings under it change — the category, not the owning tool */
    /* which of the three screens this is — one slot showed findings, pins and
       settings with no header at all, so nothing said what you were reading */
    #__dbgov-list .dbgov-viewhead { padding: 4px 8px 8px; color: #fff; font-size: 13px;
      font-weight: 800; border-bottom: 1px solid rgba(255,255,255,.10); margin-bottom: 4px; }
    #__dbgov-list .dbgov-viewhead .dbgov-rm { float: right; }
    #__dbgov-list .dbgov-viewhead .dbgov-note { display: block; margin-top: 2px; color: #8f8f96;
      font-size: 10px; font-weight: 400; }
    #__dbgov-list .dbgov-head { padding: 10px 8px 4px; color: #8f8f96;
      font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
    #__dbgov-list .dbgov-head:first-child { padding-top: 4px; }
    #__dbgov-list .dbgov-head .dbgov-note { display: block; margin-top: 2px;
      font-size: 10px; font-weight: 400; letter-spacing: 0; text-transform: none; }
    /* stored and waiting — the tool that reads it is switched off */
    /* .45 put the label at 2.53:1 against the popover — a permanent state,
       not a transient one, and unreadable in exactly the tool that ships a
       contrast checker. Dimmed enough to read as inactive, light enough to
       read at all. */
    #__dbgov-list .dbgov-row.dbgov-inert .dbgov-lbl, #__dbgov-list .dbgov-row.dbgov-inert .dbgov-tag { opacity: .7; }
    #__dbgov-list .dbgov-num { flex: none; display: flex; align-items: center; gap: 4px; }
    #__dbgov-list .dbgov-num .dbgov-opt { width: 68px; text-align: right; }
    #__dbgov-list .dbgov-unit { color: #8f8f96; font-weight: 400; }
    /* accent-color rather than a hand-built switch: the native control already
       knows focus, keyboard and the platform's own hit target */
    /* Declared, not defaulted: the common host pattern for hiding a native
       checkbox behind a custom one is input[type=checkbox]{position:absolute;
       opacity:0;width:1px}, and a TAG+ATTRIBUTE selector reaches straight past
       a class namespace. Unopposed is what loses, so this opposes it. */
    #__dbgov-list .dbgov-tick { width: 15px; height: 15px; padding: 0; margin: 0;
      position: static; opacity: 1; appearance: auto; accent-color: #b5e853; }
    /* the row's action, when it has one: the CONTENT is the button, so the
       row's ✕ stays a sibling and no interactive element nests in another */
    #__dbgov-list .dbgov-go { flex: 1 1 auto; min-width: 0; display: flex;
      align-items: center; gap: 8px; padding: 0; border: 0; background: none;
      color: inherit; font: inherit; text-align: left; cursor: pointer; }
    #__dbgov-list .dbgov-rm { flex: none; width: 20px; height: 20px; border: 0; cursor: pointer;
      border-radius: 50%; background: #2c2c31; color: #ff8a8a; font-size: 11px;
      display: flex; align-items: center; justify-content: center; }
    #__dbgov-list .dbgov-rm:hover { background: #ff5c5c; color: #fff; }
    /* Where the findings actually are. Dashed, never filled: a mark points at
       a problem, it must not hide the thing it is pointing at.
       CORE, not one tool's: every rule may mark its own findings, and this was
       contrast's private CSS until dupid needed to mark its own too. A class
       more than one tool emits cannot live in either one's sheet. */
    /* the badge's warn ink — CORE, because grid's lens and perf's pulse both
       emit it, and a class more than one tool emits cannot live in either
       one's sheet */
    .dbgov-badge .dbgov-warn { color: #ffd54f; }
    .dbgov-flag { outline-offset: 1px; }
    .dbgov-flag.dbgov-error  { outline: 2px dashed #ff6b6b; }
    .dbgov-flag.dbgov-warn   { outline: 2px dashed #ffd54f; }
    .dbgov-flag.dbgov-info   { outline: 2px dashed #9ad0ff; }
    .dbgov-flag.dbgov-review { outline: 2px dotted #8ab4f8; }
    /* WHAT is wrong, not only where. A dashed box names no rule, and no
       tooltip can ever say: this layer is aria-hidden and pointer-events:none,
       so a title attribute on a mark reaches nobody. So it is painted — the
       rule's own id, one label per element however many findings it drew. */
    .dbgov-tip { position: fixed; pointer-events: none; font-size: 9px;
      font-weight: 700; line-height: 12px; padding: 0 3px; border-radius: 3px;
      background: rgba(18,18,20,.92); white-space: nowrap; }
    .dbgov-tip.dbgov-error  { color: #ff6b6b; }
    .dbgov-tip.dbgov-warn   { color: #ffd54f; }
    .dbgov-tip.dbgov-info   { color: #9ad0ff; }
    .dbgov-tip.dbgov-review { color: #8ab4f8; font-style: italic; }
    /* an audit is on the page right now — distinct from .dbgov-armed, which only
       means the findings VIEW is the one open. No backticks in here: this
       whole sheet is a template literal. */
    #__dbgov-bar .dbgov-act.dbgov-swept { box-shadow: inset 0 0 0 2px #b5e853; }
    /* There was no designed focus indicator anywhere in this sheet — a
       keyboard user could tab through 13 controls with nothing to show where
       they were. :focus-visible only, so a mouse click does not draw one. */
    #__dbgov-root :focus-visible { outline: 2px solid #58c4ff; outline-offset: 2px; }
    /* WCAG 2.5.8 wants 24x24. These three were 18x21, 20x20 and 15x15. */
    #__dbgov-bar .dbgov-cnt { min-width: 24px; min-height: 24px; }
    #__dbgov-list .dbgov-rm { width: 24px; height: 24px; }
    #__dbgov-list .dbgov-tick { width: 24px; height: 24px; }
    #__dbgov-bar .dbgov-cnt.dbgov-armed { background: #ff8a65; color: #1a1a1a; }

    .dbgov-badge { position: fixed; pointer-events: none; max-width: 92vw;
      background: rgba(18,18,20,.94); color: #fff; border-radius: 8px;
      padding: 4px 9px; font-size: 12px; line-height: 1.45; white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0,0,0,.45); }
    .dbgov-badge .dbgov-sz  { color: #ffffff; font-weight: 700; }
    .dbgov-badge .dbgov-rad { color: #ff8a65; }
    .dbgov-badge .dbgov-sp  { color: #9ad0ff; }
    .dbgov-badge .dbgov-fnt { color: #d7c4ff; }
    .dbgov-badge .dbgov-tag { color: #8f8f96; }

    .dbgov-pin-num { position: fixed; pointer-events: none;
      min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px;
      background: #ff8a65; color: #1a1a1a; font-size: 12px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.5); }
    .dbgov-pin-num.dbgov-pair { background: #b5e853; color: #16200a; }
    .dbgov-pin-num.dbgov-link { background: #c084fc; color: #241333; }
    .dbgov-pin-num.dbgov-waiting { background: #58c4ff; color: #0d1b24; }
    .dbgov-pin-num.dbgov-rmtarget { background: #ff5c5c; color: #fff; }

    /* remove mode: ✕ chips appear only while the remove key is held */
    .dbgov-rmchip { position: fixed; pointer-events: none;
      width: 18px; height: 18px; border-radius: 50%; background: #ff5c5c; color: #fff;
      font-size: 11px; font-weight: 800; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,.5); transition: transform .1s ease; }
    .dbgov-rmchip.dbgov-target { transform: scale(1.3); background: #ff2f2f; }

    #__dbgov-bar { position: fixed; right: 14px; top: 50%;
      pointer-events: auto; display: flex; flex-direction: column; align-items: center;
      gap: 6px; background: rgba(18,18,20,.96); border-radius: 999px; padding: 8px;
      box-shadow: 0 4px 18px rgba(0,0,0,.55); user-select: none; touch-action: none;
      transition: transform .22s cubic-bezier(.2,.8,.3,1), opacity .22s ease; }
    #__dbgov-bar.dbgov-dragging { transition: none; opacity: .9; }
    #__dbgov-bar .dbgov-grip { width: 22px; height: 12px; cursor: grab; flex: none;
      display: flex; align-items: center; justify-content: center;
      color: #6a6a72; font-size: 11px; letter-spacing: 1px; line-height: 1; }
    #__dbgov-bar.dbgov-dragging .dbgov-grip { cursor: grabbing; }

    /* master power */
    #__dbgov-bar .dbgov-pwr { width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
      font-size: 15px; background: #3a3a40; color: #9a9aa2;
      display: flex; align-items: center; justify-content: center; transition: background .15s; }
    #__dbgov-bar.dbgov-on .dbgov-pwr { background: #b5e853; color: #1a1a1a; }
    /* a newer version exists — RESTS until updated, like every count that
       matters; amber because it asks for a decision, not because it burns */
    #__dbgov-bar .dbgov-pwr.dbgov-upd::after { content: ''; position: absolute;
      top: 1px; right: 1px; width: 9px; height: 9px; border-radius: 50%;
      background: #ffd54f; border: 2px solid #16161a; }
    #__dbgov-bar .dbgov-pwr { position: relative; }
    #__dbgov-bar .dbgov-st { font-size: 10px; font-weight: 800; letter-spacing: .5px; color: #8f8f96; }
    #__dbgov-bar.dbgov-on .dbgov-st { color: #b5e853; }
    #__dbgov-bar.dbgov-removing .dbgov-pwr { background: #ff5c5c; color: #fff; }
    #__dbgov-bar.dbgov-removing .dbgov-st { color: #ff5c5c; }

    /* things that only make sense once powered on */
    #__dbgov-bar .dbgov-whenOn { display: none; }
    #__dbgov-bar.dbgov-on .dbgov-whenOn { display: flex; align-items: center; justify-content: center; }
    #__dbgov-bar.dbgov-on .dbgov-cnt.dbgov-whenOn { display: block; }
    /* the family flyout: the mark sits in the bar, the members slide out
       sideways — toward the open side of the screen, read off data-side */
    #__dbgov-bar .dbgov-fam, #__dbgov-bar .dbgov-fam-btn { display: none; }
    #__dbgov-bar.dbgov-on .dbgov-fam { position: relative; display: flex; }
    #__dbgov-bar.dbgov-on .dbgov-fam-btn { width: 34px; height: 34px; border-radius: 50%; border: 0;
      cursor: pointer; background: #2c2c31; color: #eaeaea; font-size: 15px;
      display: flex; align-items: center; justify-content: center; position: relative; }
    #__dbgov-bar .dbgov-fam-btn:hover { background: #3a3a41; }
    #__dbgov-bar .dbgov-fam-btn.dbgov-armed { background: #58c4ff; color: #10151a; }
    #__dbgov-bar .dbgov-fam-btn.dbgov-checks::after { content: ''; position: absolute;
      right: 1px; bottom: 1px; width: 7px; height: 7px; border-radius: 50%;
      background: #b5e853; border: 2px solid rgba(18,18,20,.96); }
    /* VERTICAL, like the bar it belongs to — the flyout is a short second
       column beside the head, not a sideways pill. And SEPARATED: no capsule
       background; each member is its own circle wearing its own shadow, the
       same species of button as the bar's. */
    #__dbgov-bar .dbgov-fam .dbgov-flyout { position: absolute; top: 50%;
      transform: translateY(-50%) scale(.9); display: flex;
      flex-direction: column; align-items: center; gap: 6px;
      opacity: 0; pointer-events: none;
      /* VISIBILITY, not just opacity: pointer-events stops the mouse but a
         transparent button keeps its place in the TAB ORDER, so four buttons
         nobody could see answered the keyboard. Delayed to the end of the fade
         so the transition still plays; inert is not an option here — that is
         the v3.8.48 defect, and jsdom implements neither its semantics nor
         display:none inheritance. */
      visibility: hidden;
      transition: opacity .15s ease, transform .15s ease, visibility 0s linear .15s; }
    #__dbgov-bar .dbgov-fam .dbgov-flyout button {
      box-shadow: 0 4px 14px rgba(0,0,0,.55); }
    /* the SECOND layer: a pressed axis grows its members one more step out
       from the bar, its own column beside the head — never mixed into the
       heads' column, or two levels read as one flat run */
    #__dbgov-bar .dbgov-fam .dbgov-flyout .dbgov-sub { position: relative; display: flex; }
    #__dbgov-bar .dbgov-fam .dbgov-flyout .dbgov-subfly { position: absolute; top: 50%;
      transform: translateY(-50%); display: flex; flex-direction: column;
      align-items: center; gap: 6px; }
    #__dbgov-bar[data-side="right"] .dbgov-fam .dbgov-flyout .dbgov-subfly { right: calc(100% + 12px); }
    #__dbgov-bar[data-side="left"] .dbgov-fam .dbgov-flyout .dbgov-subfly,
    #__dbgov-bar[data-side="top"] .dbgov-fam .dbgov-flyout .dbgov-subfly,
    #__dbgov-bar[data-side="bottom"] .dbgov-fam .dbgov-flyout .dbgov-subfly { left: calc(100% + 12px); }
    #__dbgov-bar .dbgov-fam.dbgov-open .dbgov-flyout { opacity: 1; pointer-events: auto;
      visibility: visible; transition-delay: 0s;
      transform: translateY(-50%) scale(1); }
    #__dbgov-bar[data-side="right"] .dbgov-fam .dbgov-flyout { right: calc(100% + 12px); }
    #__dbgov-bar[data-side="left"] .dbgov-fam .dbgov-flyout,
    #__dbgov-bar[data-side="top"] .dbgov-fam .dbgov-flyout,
    #__dbgov-bar[data-side="bottom"] .dbgov-fam .dbgov-flyout { left: calc(100% + 12px); }
    #__dbgov-bar hr.dbgov-sep { width: 20px; height: 1px; border: 0; margin: 1px 0;
      opacity: 1; overflow: visible; color: inherit;
      background: rgba(255,255,255,.14); }
    #__dbgov-bar .dbgov-cnt { font-size: 11px; font-weight: 700; color: #ff8a65;
      border: 0; background: transparent; cursor: pointer; padding: 2px 6px;
      border-radius: 999px; font-family: inherit; }
    #__dbgov-bar .dbgov-cnt:hover { background: #2c2c31; }
    /* ARMED WINS OVER HOVER. The armed chip is dark text on amber; this hover
       rule is declared later at equal specificity, so it replaced the amber
       with #2c2c31 and left the dark text — #1a1a1a on #2c2c31 is 1.25:1, an
       empty-looking circle exactly while its own list is open, and you are
       always hovering the chip you just clicked. In a tool that ships a
       contrast checker. */
    #__dbgov-bar .dbgov-cnt.dbgov-armed:hover { background: #ff8a65; }

    /* tool + action buttons */
    #__dbgov-bar button.dbgov-tool, #__dbgov-bar button.dbgov-act, #__dbgov-bar button.dbgov-bctl {
      width: 34px; height: 34px; border-radius: 50%; border: 0; cursor: pointer;
      background: #2c2c31; color: #fff; font-size: 15px; }
    /* NO display here: .dbgov-whenOn owns display (none ↔ flex with centring), and
       a more specific display on the buttons out-guns the hider — the exact
       mistake the fam flyout already made once. One icon set (lucide, ISC),
       one size; the .dbgov-whenOn / .dbgov-pwr / .dbgov-fam-btn flex does the centring. */
    /* every svg we own, not just the bar's: Preflight sets display on the
       TAG, so a rule scoped to one container leaves the rest of them to it */
    #__dbgov-root svg { display: inline-block; vertical-align: middle; }
    #__dbgov-bar button svg { width: 16px; height: 16px; pointer-events: none; }
    #__dbgov-bar .dbgov-grip svg { width: 14px; height: 14px; display: block; }
    #__dbgov-list .dbgov-tag svg { width: 14px; height: 14px; vertical-align: -3px; }
    #__dbgov-bar button.dbgov-tool:hover, #__dbgov-bar button.dbgov-act:hover { background: #3a3a40; }
    #__dbgov-bar button.dbgov-tool.dbgov-armed,
    #__dbgov-bar button.dbgov-bctl.dbgov-armed { background: #58c4ff; color: #0d1b24; }
    /* an OPEN axis head is a drawer pulled out, not a value in force —
       a ring, not the armed fill, so the two states cannot be confused */
    #__dbgov-bar button.dbgov-bctl.dbgov-axis.dbgov-open { box-shadow: inset 0 0 0 2px #58c4ff; }
    /* a fixed member is information: always on, takes no click */
    #__dbgov-bar button.dbgov-bctl.dbgov-fixed { opacity: .55; cursor: default; }
    /* A tool in the run that feeds ⌕ carries a dot. Armed or not, it is still
       swept — the dot says "this contributes findings", the fill says "this
       is drawn". They are different questions and used to look the same. */
    #__dbgov-bar button.dbgov-tool.dbgov-checks { position: relative; }
    #__dbgov-bar button.dbgov-tool.dbgov-checks::after {
      content: ''; position: absolute; right: 2px; bottom: 2px;
      width: 4px; height: 4px; border-radius: 50%; background: #b5e853; }
    #__dbgov-bar button.dbgov-act.dbgov-armed { background: #b5e853; color: #1a1a1a; }

    #__dbgov-bar.dbgov-tucked { opacity: .4; }
    #__dbgov-bar.dbgov-tucked:hover { opacity: 1; }
  `;

  // src/ui/dom.js
  var root;
  var layer;
  function initDom() {
    root = document.createElement("div");
    root.id = "__dbgov-root";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Debug overlay");
    const sheet = (css, owner) => {
      const s = document.createElement("style");
      if (owner) s.dataset.tool = owner;
      s.textContent = css;
      root.append(s);
    };
    sheet(CSS2);
    for (const t of Tools.ordered()) if (t.css) sheet(t.css, t.id);
    layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    root.append(layer);
    document.documentElement.append(root);
  }

  // src/ui/controls.js
  var Controls = {
    /**
     * An unknown kind renders an empty span rather than guessing. A row asking
     * for something this cannot draw should be visibly missing, not silently
     * approximated by whichever branch happened to fall through.
     */
    /* `name` is the row's own label, handed down so every control has an
       ACCESSIBLE NAME. These are built on every re-render, long after the
       panel's init-time labelling pass — the same gap the badge flyout's
       buttons had. Without it a screen reader announces a bare combo box:
       the label sits in a sibling span, which no native association reaches. */
    build(c, onChange, name) {
      const fn = Controls[c.kind];
      const el2 = fn ? fn(c, onChange) : document.createElement("span");
      const field = el2.matches?.("select, input") ? el2 : el2.querySelector?.("select, input");
      if (field && name) field.setAttribute("aria-label", name);
      return el2;
    },
    choice(c, onChange) {
      const sel = document.createElement("select");
      sel.className = "dbgov-opt";
      c.choices.forEach((label, k) => {
        const o = document.createElement("option");
        o.value = String(k);
        o.textContent = label;
        sel.append(o);
      });
      sel.selectedIndex = c.selected || 0;
      sel.addEventListener("click", (e) => e.stopPropagation());
      sel.addEventListener("change", () => onChange(sel.selectedIndex));
      return sel;
    },
    number(c, onChange) {
      const wrap = document.createElement("span");
      wrap.className = "dbgov-num";
      const inp = document.createElement("input");
      inp.type = "number";
      inp.className = "dbgov-opt";
      inp.value = c.value;
      if (c.min !== void 0) inp.min = String(c.min);
      if (c.max !== void 0) inp.max = String(c.max);
      if (c.step !== void 0) inp.step = String(c.step);
      inp.addEventListener("click", (e) => e.stopPropagation());
      inp.addEventListener("change", () => onChange(inp.value));
      wrap.append(inp);
      if (c.suffix) {
        const u = document.createElement("span");
        u.className = "dbgov-unit";
        u.textContent = c.suffix;
        wrap.append(u);
      }
      return wrap;
    },
    toggle(c, onChange) {
      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.className = "dbgov-opt dbgov-tick";
      inp.checked = !!c.on;
      inp.addEventListener("click", (e) => e.stopPropagation());
      inp.addEventListener("change", () => onChange(inp.checked));
      return inp;
    }
  };

  // src/ui/list.js
  var List;
  function initList() {
    List = (() => {
      const el2 = document.createElement("div");
      el2.id = "__dbgov-list";
      root.append(el2);
      let open = false;
      let view = null;
      let anchor = null;
      function place() {
        if (!anchor) return;
        const r = anchor.el.getBoundingClientRect();
        const w = el2.offsetWidth, h = el2.offsetHeight;
        const G = CONFIG.LIST_GAP, P = CONFIG.LIST_PAD;
        const at = (x, y) => ({
          x: Math.max(P, Math.min(x, innerWidth - w - P)),
          y: Math.max(P, Math.min(y, innerHeight - h - P))
        });
        const beside = {
          right: () => at(r.left - w - G, r.top),
          left: () => at(r.right + G, r.top),
          below: () => at(r.left + r.width / 2 - w / 2, r.bottom + G),
          above: () => at(r.left + r.width / 2 - w / 2, r.top - h - G)
        };
        const side = anchor.side();
        const order = side === "left" ? ["left", "right", "below", "above"] : side === "right" ? ["right", "left", "below", "above"] : side === "top" ? ["below", "right", "left", "above"] : ["above", "right", "left", "below"];
        const clears = (c) => c.x + w <= r.left || c.x >= r.right || c.y + h <= r.top || c.y >= r.bottom;
        const tried = order.map((k) => beside[k]());
        const pick = tried.find(clears) || tried[0];
        el2.style.left = pick.x + "px";
        el2.style.top = pick.y + "px";
      }
      const api = {
        onOpen: null,
        onRowActivate: null,
        onRowRemove: null,
        onRowChange: null,
        /** PANEL says where it is and how to light up the button that opened us. */
        attach(a) {
          anchor = a;
        },
        isOpen: () => open,
        /**
         * One popover, several views. `view` is an opaque name off the button
         * that opened it — this carries it and hands it back, and never learns
         * what any of them mean.
         */
        view: () => view,
        place,
        toggle(v, name = "pins") {
          const same = open && view === name;
          open = v === void 0 ? !same : !!v;
          view = open ? name : null;
          el2.classList.toggle("dbgov-open", open);
          anchor?.mark(view);
          if (open) {
            api.onOpen?.(view);
            place();
          }
        },
        /**
         * rows: [{ tag, label, detail, removable }] — built by CONTROLLER, which
         * is also where the empty-state wording comes from, because only it
         * knows what this view is a list of.
         *
         * A row may carry a `control` description instead of a detail. This
         * draws it and hands back whatever the widget produced — an index, a
         * string, a boolean. It cannot learn what the setting is or what type
         * its value has, and so cannot start deciding any of that.
         */
        set(rows, empty = "") {
          const live = document.activeElement;
          const owner = live && el2.contains(live) ? live.closest(".dbgov-row") : null;
          const focus = owner ? { at: [...el2.children].indexOf(owner), cls: live.className.split(" ")[0] } : null;
          el2.textContent = "";
          const restore = () => {
            if (!focus || focus.at < 0) return;
            const row = el2.children[focus.at];
            (row?.querySelector?.("." + focus.cls) || row?.querySelector?.(".dbgov-go"))?.focus?.();
          };
          if (!rows.length) {
            const e = document.createElement("div");
            e.className = "dbgov-empty";
            e.textContent = empty;
            el2.append(e);
            place();
            return;
          }
          rows.forEach((row, i) => {
            if (row.title || row.heading) {
              const h = document.createElement("div");
              h.className = row.title ? "dbgov-viewhead" : "dbgov-head";
              h.textContent = row.title || row.heading;
              if (row.removable) {
                const rm = document.createElement("button");
                rm.className = "dbgov-rm";
                rm.textContent = "✕";
                rm.title = row.rmTitle || "Remove";
                rm.addEventListener("click", (e) => {
                  e.stopPropagation();
                  api.onRowRemove?.(i);
                });
                h.append(rm);
              }
              if (row.detail) {
                const n = document.createElement("span");
                n.className = "dbgov-note";
                n.textContent = row.detail;
                h.append(n);
              }
              el2.append(h);
              return;
            }
            const r = document.createElement("div");
            r.className = "dbgov-row";
            const tag = document.createElement("span");
            tag.className = "dbgov-tag";
            if (/^<svg[\s>]/.test(row.tag || "")) tag.innerHTML = row.tag;
            else tag.textContent = row.tag;
            const lbl = document.createElement("span");
            lbl.className = "dbgov-lbl";
            lbl.textContent = row.label;
            if (row.accent) r.dataset.accent = row.accent;
            if (row.inert) r.classList.add("dbgov-inert");
            if (row.label || row.detail) {
              r.title = [row.label, row.detail].filter(Boolean).join("\n");
            }
            if (row.control) {
              r.append(tag, lbl, Controls.build(
                row.control,
                (raw) => api.onRowChange?.(i, raw),
                row.label
              ));
            } else {
              const det = document.createElement("span");
              det.className = "dbgov-det";
              det.textContent = row.detail || "";
              if (row.activatable) {
                const go = document.createElement("button");
                go.className = "dbgov-go";
                go.append(tag, lbl, det);
                go.addEventListener("click", (e) => {
                  e.stopPropagation();
                  api.onRowActivate?.(i);
                });
                r.addEventListener("click", () => api.onRowActivate?.(i));
                r.append(go);
              } else {
                r.append(tag, lbl, det);
              }
            }
            if (row.removable) {
              const rm = document.createElement("button");
              rm.className = "dbgov-rm";
              rm.textContent = "✕";
              rm.title = "Remove";
              rm.addEventListener("click", (e) => {
                e.stopPropagation();
                api.onRowRemove?.(i);
              });
              r.append(rm);
            }
            el2.append(r);
          });
          restore();
          place();
        }
      };
      return api;
    })();
  }

  // src/ui/menu.js
  var el = null;
  function initMenu() {
    el = document.createElement("div");
    el.id = "__dbgov-menu";
    root.append(el);
    document.addEventListener("pointerdown", (e) => {
      if (Menu.isOpen() && !(e.target.closest && e.target.closest("#__dbgov-menu")))
        Menu.close();
    }, true);
  }
  var Menu = {
    isOpen: () => !!el && el.classList.contains("dbgov-open"),
    /** rows: [{ label, run }] — label is all this file reads of them. */
    open(x, y, rows) {
      el.textContent = "";
      for (const r of rows) {
        const b = document.createElement("button");
        b.textContent = r.label;
        b.addEventListener("click", () => {
          Menu.close();
          r.run();
        });
        el.append(b);
      }
      el.classList.add("dbgov-open");
      const w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = Math.max(4, Math.min(x, innerWidth - w - 4)) + "px";
      el.style.top = Math.max(4, Math.min(y, innerHeight - h - 4)) + "px";
    },
    close() {
      if (!el) return;
      el.classList.remove("dbgov-open");
      el.textContent = "";
    }
  };

  // src/ui/panel.js
  var Panel;
  function initPanel() {
    Panel = (() => {
      const el2 = document.createElement("div");
      el2.id = "__dbgov-bar";
      const toolBtn = (t) => `<button class="dbgov-tool dbgov-whenOn ${Tools.feedsAudit(t) ? "dbgov-checks" : ""}" data-tool="${t.id}" title="${t.family ? t.family[0].toUpperCase() + t.family.slice(1) + " › " : ""}${t.title}
${Tools.rolesOf(t).join(" · ")}${Tools.feedsAudit(t) ? " · also runs in the page audit" : ""}${t.options || t.uses ? "\nright-click for its options" : ""}">${t.icon}</button>`;
      const toolRuns = Tools.runs().map((run) => {
        const out = [];
        const done = /* @__PURE__ */ new Set();
        for (const t of run.tools) {
          const mark = t.family && Tools.familyMark(t.family);
          if (!mark) {
            out.push(toolBtn(t));
            continue;
          }
          if (done.has(t.family)) continue;
          done.add(t.family);
          const kin = run.tools.filter((x) => x.family === t.family);
          const famName = t.family[0].toUpperCase() + t.family.slice(1);
          out.push(
            `<span class="dbgov-fam dbgov-whenOn" data-fam="${t.family}"><button class="dbgov-fam-btn dbgov-whenOn ${kin.some(Tools.feedsAudit) ? "dbgov-checks" : ""}" aria-expanded="false" title="${famName} family — ${kin.map((x) => x.id).join(", ")}; click to open">${mark}</button><span class="dbgov-flyout">${kin.map(toolBtn).join("")}</span></span>`
          );
        }
        return out.join("");
      }).join('<hr class="dbgov-sep dbgov-whenOn">');
      const SWEEP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>';
      el2.innerHTML = `
      <span class="dbgov-grip" title="Drag to move — snaps to the nearest edge"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" /></svg></span>
      <button class="dbgov-pwr" title="Power (Alt+Shift+D) · v${CONFIG.VERSION}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></svg></button>
      <span class="dbgov-st" data-st>OFF</span>
      <hr class="dbgov-sep dbgov-whenOn">
      ${toolRuns}
      <!-- its own band: ⌕ and ⚙ drive the services, they are not tools -->
      <hr class="dbgov-sep dbgov-whenOn">
      <button class="dbgov-act dbgov-whenOn" data-sweep data-view="findings" title="Audit the whole page">${SWEEP_ICON}</button>
      <!-- with the tools it configures, not with the panel's own actions -->
      <button class="dbgov-act dbgov-whenOn" data-settings data-view="settings" title="Tool settings"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></svg></button>
      <hr class="dbgov-sep dbgov-whenOn">
      <button class="dbgov-cnt dbgov-whenOn" data-c data-view="pins" title="Pinned elements — click for the list">0</button>
      <!-- 🏷 replaces ≡: same fam flyout the domain families use, members
           handed in by the controller (setBadgeControls) — this file renders
           what it is given and never learns what a view or a facet is -->
      <span class="dbgov-fam dbgov-whenOn" data-badge>
        <button class="dbgov-fam-btn dbgov-act" title="Badge — view and facets; click to open"
                aria-haspopup="true" aria-expanded="false"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg></button>
        <span class="dbgov-flyout" data-badge-fly></span>
      </span>
      <button class="dbgov-act dbgov-whenOn" data-copy title="Copy report"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M16 4h2a2 2 0 0 1 2 2v4" /><path d="M21 14H11" /><path d="m15 10-4 4 4 4" /></svg></button>
      <button class="dbgov-act dbgov-whenOn" data-clear title="Clear pins and the audit's marks"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>`;
      root.append(el2);
      List.attach({
        el: el2,
        side: () => side,
        mark: (view) => el2.querySelectorAll("[data-view]").forEach(
          (b) => {
            const on = !!view && b.dataset.view === view;
            b.classList.toggle("dbgov-armed", on);
            b.setAttribute("aria-pressed", String(on));
          }
        )
      });
      const flashing = /* @__PURE__ */ new Map();
      let badgeGroups = [];
      function renderBadgeFly() {
        const fly = el2.querySelector("[data-badge-fly]");
        const open = fly.dataset.open || "";
        fly.textContent = "";
        for (const g of badgeGroups) {
          const sub = document.createElement("span");
          sub.className = "dbgov-sub";
          const h = document.createElement("button");
          h.className = "dbgov-bctl dbgov-whenOn dbgov-axis" + (open === g.key ? " dbgov-open" : "");
          h.innerHTML = g.glyph;
          h.title = g.title;
          h.setAttribute("aria-label", g.title);
          h.setAttribute("aria-expanded", String(open === g.key));
          h.addEventListener("click", () => {
            fly.dataset.open = open === g.key ? "" : g.key;
            renderBadgeFly();
          });
          sub.append(h);
          if (open === g.key) {
            const members = document.createElement("span");
            members.className = "dbgov-subfly";
            for (const r of g.rows) {
              const b = document.createElement("button");
              b.className = "dbgov-bctl dbgov-whenOn" + (r.armed ? " dbgov-armed" : "") + (r.fixed ? " dbgov-fixed" : "");
              b.innerHTML = r.glyph;
              b.title = r.title;
              b.setAttribute("aria-label", r.title);
              b.setAttribute("aria-pressed", String(!!r.armed));
              if (r.fixed) b.setAttribute("aria-disabled", "true");
              else b.addEventListener("click", () => api.onBadgeControl?.(r.key));
              members.append(b);
            }
            sub.append(members);
          }
          fly.append(sub);
        }
      }
      const api = {
        el: el2,
        onToggle: null,
        onTool: null,
        onBadgeControl: null,
        onCopy: null,
        onUpdateMenu: null,
        onClear: null,
        onListOpen: null,
        onRowActivate: null,
        onRowRemove: null,
        onSweep: null,
        onRowChange: null,
        setOn(v) {
          el2.classList.toggle("dbgov-on", v);
          el2.querySelector("[data-st]").textContent = v ? "ON" : "OFF";
          if (!v) {
            api.toggleList(false);
            api.closeFlyouts();
          }
          if (v) {
            clearTimeout(tuckTimer);
            untuck();
          } else scheduleTuck();
        },
        /**
         * Move the pin-count chip to sit right after one tool's button — the
         * controller says which, by an id this file hands straight back the
         * way it hands back view names. Null (no such tool registered) leaves
         * the chip where the template put it, so this cannot strand it.
         */
        attachCount(toolId) {
          const t = toolId && el2.querySelector(`[data-tool="${toolId}"]`);
          if (t) t.insertAdjacentElement("afterend", el2.querySelector("[data-c]"));
        },
        setTool(id, v) {
          const b = el2.querySelector(`[data-tool="${id}"]`);
          b?.classList.toggle("dbgov-armed", v);
          b?.setAttribute("aria-pressed", String(!!v));
          const fam = b?.closest(".dbgov-fam");
          if (fam) fam.querySelector(".dbgov-fam-btn").classList.toggle("dbgov-armed", !!fam.querySelector(".dbgov-tool.dbgov-armed"));
        },
        /**
         * The 🏷 flyout, two levels: AXIS heads at rest, and only the pressed
         * axis shows its members — four flat buttons made two different axes
         * read as one soup. Rendered from whatever the controller hands over:
         * groups of { key, glyph, title, rows: [{ key, glyph, title, armed,
         * fixed }] }. This file never learns what a view or a facet IS — keys
         * go straight back through the callback, the way data-view names do.
         *
         * Which axis is open lives on the flyout element, so re-rendering
         * after a change (armed must show the value in force) does not slam
         * the drawer shut; reopening 🏷 starts collapsed again.
         */
        setBadgeControls(groups2) {
          badgeGroups = groups2;
          renderBadgeFly();
        },
        /**
         * A newer version exists. The mark RESTS (counts rest, never flash)
         * and the tooltip says both what and how — a dot with no explanation
         * is a mystery, and a mystery on the power button is worse.
         */
        setUpdate(v) {
          const b = el2.querySelector(".dbgov-pwr");
          b.classList.add("dbgov-upd");
          b.title = `Power (Alt+Shift+D) · v${CONFIG.VERSION} — v${v} available, right-click to update`;
          b.setAttribute("aria-label", `Power — update to v${v} available`);
        },
        /* A flyout is an overlay, so Escape has to reach it — it did not, and
           the comment above the fam-btn handler claimed otherwise. Shaped like
           Menu's isOpen/close so app/ can put it in the one dismissal ladder
           without ui/ learning anything about app/. Closing collapses the badge
           drawer too: which axis is open is furniture, not a choice. */
        isFlyoutOpen: () => !!el2.querySelector(".dbgov-fam.dbgov-open"),
        closeFlyouts() {
          el2.querySelectorAll(".dbgov-fam.dbgov-open").forEach((f) => {
            f.classList.remove("dbgov-open");
            f.querySelector(".dbgov-fam-btn")?.setAttribute("aria-expanded", "false");
          });
          const fly = el2.querySelector("[data-badge-fly]");
          if (fly && fly.dataset.open) {
            fly.dataset.open = "";
            renderBadgeFly();
          }
        },
        /**
         * Whether an audit is currently showing on the page. The ⌕ flash is
         * transient by design, so once it expired the bar said "no audit has
         * run" while the page was still wearing its outlines, and nothing in
         * the bar admitted they existed or removed them. One state now drives
         * both the button and the marks.
         */
        /**
         * Whether an audit is showing, and how much it found.
         *
         * The count used to be a 1.2s flash, so once it expired the bar could not
         * answer "does this page have problems?" without opening the panel — and
         * the marks stayed on the page with nothing admitting they were there.
         * It rests on the button now. It is safe to show a bare number here only
         * because the panel header names both quantities ("N distinct problems ·
         * M occurrences"); two unlabelled numbers on one bar was the original
         * complaint, and the label is what fixed it, not hiding one of them.
         */
        setSwept(v, n) {
          const b = el2.querySelector("[data-sweep]");
          b.classList.toggle("dbgov-swept", !!v);
          if (v) b.textContent = String(n);
          else b.innerHTML = SWEEP_ICON;
          const what = v ? `Audit: ${n} distinct problem${n === 1 ? "" : "s"} — click to re-run` : "Audit the whole page";
          b.title = what;
          b.setAttribute("aria-label", what);
        },
        setRemoveMode(v) {
          el2.classList.toggle("dbgov-removing", v);
          const st = el2.querySelector("[data-st]");
          st.textContent = v ? "DEL" : api.isOn() ? "ON" : "OFF";
        },
        setCount(n) {
          el2.querySelector("[data-c]").textContent = String(n);
        },
        // The popover's own surface, forwarded so CONTROLLER and BOOT still have
        // one thing to talk to. What it renders is LIST's business, not this
        // file's — that is the whole point of the split.
        isListOpen: List.isOpen,
        view: List.view,
        toggleList: List.toggle,
        setList: List.set,
        /**
         * Two flashes on one button inside the window left the message there for
         * good: the second captured the first's text as "the original" and its
         * timer, firing last, wrote that back. ⌕ twice in a second was enough,
         * and the button then read "0" forever.
         */
        flash(msg, sel = "[data-copy]") {
          const b = el2.querySelector(sel);
          if (!b) return;
          const live = flashing.get(b);
          const original = live ? live.original : b.innerHTML;
          if (live) clearTimeout(live.timer);
          b.textContent = msg;
          flashing.set(b, {
            original,
            timer: setTimeout(() => {
              b.innerHTML = original;
              flashing.delete(b);
            }, CONFIG.FLASH_MS)
          });
        },
        rect: () => el2.getBoundingClientRect(),
        isOn: () => el2.classList.contains("dbgov-on")
      };
      List.onOpen = (v) => api.onListOpen?.(v);
      List.onRowActivate = (i) => api.onRowActivate?.(i);
      List.onRowRemove = (i) => api.onRowRemove?.(i);
      List.onRowChange = (i, raw) => api.onRowChange?.(i, raw);
      el2.querySelectorAll("button").forEach((b) => {
        const name = (b.title || "").split(/[\n·—]/)[0].trim();
        if (name) b.setAttribute("aria-label", name);
      });
      el2.querySelectorAll("[data-tool], [data-view]").forEach((b) => b.setAttribute("aria-pressed", "false"));
      el2.querySelector(".dbgov-pwr").addEventListener("click", () => api.onToggle?.());
      el2.querySelector(".dbgov-pwr").addEventListener("contextmenu", (e) => {
        e.preventDefault();
        api.onUpdateMenu?.(e.clientX, e.clientY);
      });
      el2.querySelectorAll(".dbgov-fam-btn").forEach((b) => {
        b.addEventListener("click", () => {
          const fam = b.parentElement;
          const open = !fam.classList.contains("dbgov-open");
          api.closeFlyouts();
          fam.classList.toggle("dbgov-open", open);
          b.setAttribute("aria-expanded", String(open));
        });
      });
      document.addEventListener("pointerdown", (e) => {
        if (e.target.closest && e.target.closest(".dbgov-fam")) return;
        api.closeFlyouts();
      }, true);
      el2.querySelectorAll("[data-tool]").forEach((b) => {
        b.addEventListener("click", () => api.onTool?.(b.dataset.tool));
        b.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          api.toggleList(void 0, `tool:${b.dataset.tool}`);
        });
      });
      el2.querySelector("[data-badge] .dbgov-fam-btn").addEventListener("click", () => {
        const fly = el2.querySelector("[data-badge-fly]");
        if (fly.dataset.open) {
          fly.dataset.open = "";
          renderBadgeFly();
        }
      });
      el2.querySelector("[data-c]").addEventListener("click", () => api.toggleList(void 0, "pins"));
      el2.querySelector("[data-settings]").addEventListener("click", () => api.toggleList(void 0, "settings"));
      el2.querySelector("[data-sweep]").addEventListener("click", () => api.onSweep?.());
      el2.querySelector("[data-copy]").addEventListener("click", () => api.onCopy?.());
      el2.querySelector("[data-clear]").addEventListener("click", () => api.onClear?.());
      let side = "right";
      function applyPos(x, y) {
        el2.dataset.side = side;
        const r = el2.getBoundingClientRect();
        x = Math.max(4, Math.min(x, innerWidth - r.width - 4));
        y = Math.max(4, Math.min(y, innerHeight - r.height - 4));
        el2.style.left = x + "px";
        el2.style.top = y + "px";
        el2.style.right = "auto";
        return { x, y };
      }
      function snap() {
        const r = el2.getBoundingClientRect();
        const d = { left: r.left, right: innerWidth - r.right, top: r.top, bottom: innerHeight - r.bottom };
        side = Object.keys(d).reduce((a, b) => d[a] <= d[b] ? a : b);
        let x = r.left, y = r.top;
        if (side === "left") x = CONFIG.EDGE_MARGIN;
        if (side === "right") x = innerWidth - r.width - CONFIG.EDGE_MARGIN;
        if (side === "top") y = CONFIG.EDGE_MARGIN;
        if (side === "bottom") y = innerHeight - r.height - CONFIG.EDGE_MARGIN;
        const p = applyPos(x, y);
        Store.set(CONFIG.POS_KEY, JSON.stringify({ x: p.x, y: p.y, side }));
      }
      (function restore() {
        try {
          const s = JSON.parse(Store.get(CONFIG.POS_KEY) || "null");
          if (s) {
            side = s.side || "right";
            applyPos(s.x, s.y);
            return;
          }
        } catch {
        }
        applyPos(innerWidth - 60, innerHeight / 2 - 110);
      })();
      let tuckTimer = 0;
      function untuck() {
        el2.classList.remove("dbgov-tucked");
        el2.style.transform = "";
      }
      function tuck() {
        untuck();
        const r = el2.getBoundingClientRect();
        let t = "";
        if (side === "right") t = `translateX(${Math.round(innerWidth - CONFIG.PEEK - r.left)}px)`;
        if (side === "left") t = `translateX(${Math.round(CONFIG.PEEK - r.right)}px)`;
        if (side === "bottom") t = `translateY(${Math.round(innerHeight - CONFIG.PEEK - r.top)}px)`;
        if (side === "top") t = `translateY(${Math.round(CONFIG.PEEK - r.bottom)}px)`;
        el2.classList.add("dbgov-tucked");
        el2.style.transform = t;
      }
      function scheduleTuck() {
        clearTimeout(tuckTimer);
        if (api.isOn() || List.isOpen()) {
          untuck();
          return;
        }
        tuckTimer = setTimeout(() => {
          if (!api.isOn() && !el2.matches(":hover")) tuck();
        }, CONFIG.TUCK_DELAY);
      }
      el2.addEventListener("pointerenter", () => {
        clearTimeout(tuckTimer);
        untuck();
      });
      el2.addEventListener("pointerleave", scheduleTuck);
      let drag = null;
      el2.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        const r = el2.getBoundingClientRect();
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        untuck();
        el2.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      el2.addEventListener("pointermove", (e) => {
        if (!drag) return;
        el2.classList.add("dbgov-dragging");
        applyPos(e.clientX - drag.dx, e.clientY - drag.dy);
        if (List.isOpen()) List.place();
      });
      const endDrag = () => {
        if (!drag) return;
        drag = null;
        el2.classList.remove("dbgov-dragging");
        snap();
        scheduleTuck();
        if (List.isOpen()) List.place();
      };
      el2.addEventListener("pointerup", endDrag);
      el2.addEventListener("pointercancel", endDrag);
      addEventListener("resize", () => {
        snap();
        if (List.isOpen()) List.place();
      });
      return api;
    })();
  }

  // src/services/badge/options.js
  var BadgeFace = defineService({
    id: "badge",
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg>',
    // lucide 'tag' (ISC)
    title: "Badge — view and facets",
    was: "grid",
    options() {
      return [
        {
          key: "view",
          label: "Badge view",
          def: CONFIG.BADGE_MODES[0],
          values: CONFIG.BADGE_MODES,
          glyphs: {
            compact: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M5 12h14" /></svg>',
            full: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M3 5h18" /><path d="M3 12h18" /><path d="M3 19h18" /></svg>'
          },
          // lucide minus / align-justify
          affects: "inspect"
        },
        /* Labels LEAD with the facet's family name — CURRENT · ISSUE ·
           RECOMMENDATION — because that vocabulary is how the docs and
           the architecture talk about them, and a member that does not
           say its own name sent a real user hunting for it. */
        {
          key: "issues",
          label: "Issue — mark what fails (⚠)",
          def: true,
          type: "toggle",
          glyph: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>',
          affects: "inspect"
        },
        // lucide triangle-alert
        {
          key: "suggest",
          label: "Recommendation — what would pass (→)",
          def: false,
          type: "toggle",
          glyph: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>',
          affects: "inspect"
        }
        // lucide arrow-right
      ];
    },
    /**
     * The 🏷 flyout, two levels deep: press the mark and you get the two
     * AXES — ◫ View and ◈ Facets — and only pressing an axis reveals its
     * members. Four flat buttons made the two axes read as one soup.
     *
     * DERIVED from options() in this same file, so the flyout and the ⚙
     * rows come from one declaration: the values option is the View
     * axis's radio, every toggle is a Facets member. CURRENT is the one
     * member with no option behind it — it is listed because the family
     * has three facets, and FIXED because switching it off would leave
     * 🏷 controlling nothing: it IS the badge.
     */
    groups() {
      const opts = this.options();
      const view = opts.find((o) => o.values);
      return [
        {
          key: "view",
          glyph: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M12 3v18" /></svg>',
          // lucide 'columns-2'
          title: "View — how much ink; press to choose",
          rows: view.values.map((v) => ({
            key: `${view.key}:${v}`,
            glyph: (view.glyphs || {})[v] || String(v),
            title: `${view.label} — ${v}`,
            armed: Tools.setting(this, view.key) === v
          }))
        },
        {
          key: "facets",
          glyph: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z" /></svg>',
          // lucide 'diamond'
          title: "Facets — which kinds of content render; press to choose",
          rows: [
            {
              fixed: true,
              glyph: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><line x1="5" x2="19" y1="9" y2="9" /><line x1="5" x2="19" y1="15" y2="15" /></svg>',
              armed: true,
              // lucide 'equal'
              title: "Current — the component's own fields. Always on: this is the badge itself"
            },
            ...opts.filter((o) => o.type === "toggle").map((o) => ({
              key: o.key,
              glyph: o.glyph || o.label,
              title: o.label,
              armed: !!Tools.setting(this, o.key)
            }))
          ]
        }
      ];
    }
  });

  // src/services/badge/index.js
  var Badges = {
    /** The VIEW axis's live value — the renderer asks per frame. */
    view: () => Tools.setting(BadgeFace, "view"),
    /** The FACETS, as the neutral contract object build() stamps onto the
     *  info it hands the tools. Lenses read it from there (and the ISSUE
     *  gate sits in Tools.annotator), so no tool ever imports this file. */
    facets: () => ({
      issues: !!Tools.setting(BadgeFace, "issues"),
      suggest: !!Tools.setting(BadgeFace, "suggest")
    }),
    build(info, compact6) {
      info.facets = Badges.facets();
      const parts = [];
      for (const t of Tools.active()) {
        const fn = compact6 ? t.compact || null : t.badge || null;
        if (!fn) continue;
        const html = fn.call(t, info);
        if (html) parts.push(html);
      }
      return parts.join(" · ");
    }
  };

  // src/ui/placement.js
  var Place = /* @__PURE__ */ (() => {
    let taken = [];
    function put(node, x, y, w, h) {
      node.style.left = x + "px";
      node.style.top = y + "px";
      if (w != null) node.style.width = w + "px";
      if (h != null) node.style.height = h + "px";
    }
    function claim(x, y, w, h) {
      taken.push(U.rectOf(x - 2, y - 2, w + 4, h + 4));
    }
    function smart(node, anchor, opts = {}) {
      const w = node.offsetWidth, h = node.offsetHeight;
      const M = CONFIG.BADGE_MARGIN, PAD = 4;
      const cands = [
        { x: anchor.left, y: anchor.bottom + M, cost: 0 },
        { x: anchor.left, y: anchor.top - h - M, cost: 1 },
        { x: anchor.right - w, y: anchor.bottom + M, cost: 2 },
        { x: anchor.right - w, y: anchor.top - h - M, cost: 3 },
        { x: anchor.right + M, y: anchor.top, cost: 4 },
        { x: anchor.left - w - M, y: anchor.top, cost: 5 },
        { x: anchor.left + M, y: anchor.top + M, cost: 8 }
      ];
      const NUDGES = [{ x: 0, y: 0 }];
      for (let s = 1; s <= 5; s++) {
        NUDGES.push({ x: 0, y: s * (h + PAD) }, { x: 0, y: -s * (h + PAD) });
        NUDGES.push({ x: s * (w * 0.55 + PAD), y: 0 }, { x: -s * (w * 0.55 + PAD), y: 0 });
      }
      let best = null;
      outer:
        for (const c of cands) {
          for (let n = 0; n < NUDGES.length; n++) {
            const x = Math.max(PAD, Math.min(c.x + NUDGES[n].x, innerWidth - w - PAD));
            const y = Math.max(PAD, Math.min(c.y + NUDGES[n].y, innerHeight - h - PAD));
            const r = U.rectOf(x, y, w, h);
            let score = c.cost + n * 1.5;
            for (const t of taken) score += U.overlap(r, t) / 90;
            if (opts.avoid)
              score += U.overlap(r, U.rectOf(
                opts.avoid.left,
                opts.avoid.top,
                opts.avoid.width,
                opts.avoid.height
              )) / 900;
            if (!best || score < best.score) best = { x, y, score };
            if (score < 0.5) break outer;
          }
        }
      put(node, best.x, best.y);
      claim(best.x, best.y, w, h);
      const near = best.y <= anchor.bottom + M + 2 && best.y + h >= anchor.top - M - 2 && best.x <= anchor.right + M + 2 && best.x + w >= anchor.left - M - 2;
      if (!near && opts.leader !== false) {
        const ax = Math.max(anchor.left, Math.min(best.x + w / 2, anchor.right));
        const ay = Math.max(anchor.top, Math.min(best.y + h / 2, anchor.bottom));
        const bx = Math.max(best.x, Math.min(ax, best.x + w));
        const by = Math.max(best.y, Math.min(ay, best.y + h));
        const ln = document.createElement("div");
        ln.className = "dbgov-leader";
        if (Math.abs(bx - ax) >= Math.abs(by - ay))
          put(ln, Math.min(ax, bx), Math.round(ay), Math.abs(bx - ax) || 1, 1);
        else put(ln, Math.round(ax), Math.min(ay, by), 1, Math.abs(by - ay) || 1);
        layer.append(ln);
      }
    }
    return {
      put,
      claim,
      smart,
      reset() {
        taken = [];
        const br = Panel.rect();
        taken.push(U.rectOf(br.left - 8, br.top - 8, br.width + 16, br.height + 16));
      }
    };
  })();

  // src/ui/renderer.js
  var Render = /* @__PURE__ */ (() => {
    let raf = 0;
    function now() {
      layer.textContent = "";
      Place.reset();
      if (!State.enabled) return;
      const had = State.pins.length;
      State.pins = State.pins.filter((p) => document.contains(p.el));
      if (State.pins.length !== had) Render.onPinsPruned?.();
      const pinned = new Set(State.pins.map((p) => p.el));
      let pendingIdx = -1;
      for (const t of Tools.active()) {
        const idx = t.pendingIndex?.call(t) ?? -1;
        if (idx >= 0) {
          pendingIdx = idx;
          break;
        }
      }
      const pinInfo = State.pins.map((p, idx) => {
        const waiting = idx === pendingIdx;
        const isTarget = State.removeMode && State.removeTarget === p;
        const isFlash = State.flashPins && State.flashPins.includes(p);
        const kindCls = ` dbgov-${p.kind}` + (waiting ? " dbgov-waiting" : "") + (isTarget ? " dbgov-rmtarget" : "") + (isFlash ? " dbgov-flash" : "");
        const i = U.info(p.el);
        const box = document.createElement("div");
        box.className = "dbgov-box dbgov-pinbox" + kindCls;
        Place.put(box, i.r.left, i.r.top, i.r.width, i.r.height);
        const n = document.createElement("div");
        n.className = "dbgov-pin-num" + kindCls;
        n.textContent = waiting ? p.id + "…" : p.id;
        layer.append(box, n);
        const onScreen = !(i.r.bottom < 0 || i.r.top > innerHeight || i.r.right < 0 || i.r.left > innerWidth);
        if (onScreen) {
          const nx = Math.max(2, i.r.left - 10), ny = Math.max(2, i.r.top - 10);
          Place.put(n, nx, ny);
          Place.claim(nx, ny, waiting ? 32 : 22, 22);
        } else {
          n.remove();
        }
        if (State.removeMode) {
          const rm = document.createElement("div");
          rm.className = "dbgov-rmchip" + (isTarget ? " dbgov-target" : "");
          rm.textContent = "✕";
          layer.append(rm);
          const rx = Math.min(innerWidth - 20, Math.max(2, i.r.right - 9));
          const ry = Math.max(2, i.r.top - 9);
          Place.put(rm, rx, ry);
          Place.claim(rx, ry, 18, 18);
        }
        return { p, i };
      });
      if (State.current && !document.contains(State.current)) State.current = null;
      const cur = !State.removeMode && State.current && !pinned.has(State.current) ? State.current : null;
      if (cur) {
        const i = U.info(cur);
        const box = document.createElement("div");
        box.className = "dbgov-box dbgov-pinbox dbgov-note";
        Place.put(box, i.r.left, i.r.top, i.r.width, i.r.height);
        layer.append(box);
      }
      const hoverLive = !State.removeMode && State.hoverEl && State.hoverEl !== cur && document.contains(State.hoverEl) && !pinned.has(State.hoverEl);
      if (hoverLive) {
        const i = U.info(State.hoverEl);
        const box = document.createElement("div");
        box.className = "dbgov-box dbgov-hover";
        Place.put(box, i.r.left, i.r.top, i.r.width, i.r.height);
        layer.append(box);
      }
      const marked = /* @__PURE__ */ new Map();
      const marks = (found) => {
        for (const f of found.slice(0, CONFIG.MARK_LIMIT)) {
          if (!document.contains(f.el)) continue;
          const at = marked.get(f.el);
          if (at) {
            at.n++;
            at.rules.add(f.rule);
            const cls2 = f.verdict === "review" ? "review" : f.severity;
            if ((CONFIG.SEVERITY[cls2] || 0) > (CONFIG.SEVERITY[at.cls] || 0)) {
              at.box.className = "dbgov-box dbgov-flag dbgov-" + cls2;
              if (at.tip) at.tip.className = "dbgov-tip dbgov-" + cls2;
              at.cls = cls2;
            }
            if (at.tip) at.tip.textContent = label(at);
            continue;
          }
          const r = f.el.getBoundingClientRect();
          const cls = f.verdict === "review" ? "review" : f.severity;
          const box = document.createElement("div");
          box.className = "dbgov-box dbgov-flag dbgov-" + cls;
          Place.put(box, r.left, r.top, r.width, r.height);
          layer.append(box);
          const m = { r, cls, n: 1, rules: /* @__PURE__ */ new Set([f.rule]), tip: null, box };
          marked.set(f.el, m);
          if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
          const tip = document.createElement("div");
          tip.className = "dbgov-tip dbgov-" + cls;
          tip.textContent = label(m);
          m.tip = tip;
          layer.append(tip);
          Place.smart(tip, r, { avoid: r });
        }
      };
      const label = (m) => [...m.rules].join(" ") + (m.n > 1 ? ` ×${m.n}` : "");
      const ctx = { layer, Place, State, U, marks, found: [] };
      for (const t of Tools.active()) {
        ctx.found = State.sweep && State.sweep.byTool[t.id] || [];
        t.draw?.call(t, ctx);
      }
      pinInfo.forEach(({ p, i }) => {
        if (i.r.bottom < 0 || i.r.top > innerHeight || i.r.right < 0 || i.r.left > innerWidth) return;
        const full = Badges.view() === "full" || State.hoverEl === p.el;
        const html = Badges.build(i, !full);
        if (!html) return;
        const b = document.createElement("div");
        b.className = "dbgov-badge";
        b.innerHTML = `<span class="dbgov-rad">#${p.id}</span> · ${html}`;
        layer.append(b);
        Place.smart(b, i.r, { avoid: i.r });
      });
      if (cur) {
        const i = U.info(cur);
        if (!(i.r.bottom < 0 || i.r.top > innerHeight || i.r.right < 0 || i.r.left > innerWidth)) {
          const full = Badges.view() === "full" || State.hoverEl === cur;
          const html = Badges.build(i, !full);
          if (html) {
            const b = document.createElement("div");
            b.className = "dbgov-badge";
            b.innerHTML = html;
            layer.append(b);
            Place.smart(b, i.r, { avoid: i.r });
          }
        }
      }
      if (hoverLive) {
        const i = U.info(State.hoverEl);
        const html = Badges.build(i, false);
        if (html) {
          const b = document.createElement("div");
          b.className = "dbgov-badge";
          b.innerHTML = html;
          layer.append(b);
          Place.smart(b, i.r, { avoid: i.r });
        }
      }
      Panel.setCount(State.pins.length);
    }
    return {
      now,
      onPinsPruned: null,
      schedule() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(now);
      }
    };
  })();

  // src/services/findings/index.js
  var Sweep = {
    /**
     * One read-only pass. Rules only speak when something is wrong, so what
     * comes back is a list of problems, not a list of elements.
     *
     * The overlay's root is appended to documentElement, so walking body's
     * subtree already excludes it — no per-element containment check.
     *
     * EVERY tool that can judge runs, armed or not. Arming decides what is
     * drawn on screen and nothing else. Tying the two together meant one
     * control carried two meanings, and the failure was silent in the worst
     * direction: with the only rule disarmed, a page full of problems audited
     * clean. You can always narrow a list of findings; you can never find
     * what was not checked.
     */
    /**
     * Call one hook across some tools and stamp the producer onto whatever
     * comes back, so no rule has to name itself and no consumer has to guess.
     * It is what lets draw() be handed only its own findings — and the report
     * look up the rule's own documentation.
     */
    collect(tools, hook, arg) {
      const out = [];
      for (const t of tools) {
        const f = t[hook]?.call(t, arg);
        if (!f || !f.length) continue;
        for (const one of f) one.tool = t.id;
        out.push(...f);
      }
      return out;
    },
    run() {
      const perEl = Tools.withHook("audit");
      const perPage = Tools.withHook("auditPage");
      const all = [.../* @__PURE__ */ new Set([...perEl, ...perPage])];
      const result = { findings: [], rules: all.length, elements: 0, byTool: {} };
      if (!all.length || !document.body) return result;
      for (const t of all) result.byTool[t.id] = [];
      const seen = perPage.length ? [] : null;
      for (const el2 of document.body.querySelectorAll("*")) {
        const cs = getComputedStyle(el2);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
        result.elements++;
        const i = U.info(el2, cs);
        if (seen) seen.push(i);
        for (const f of Sweep.collect(perEl, "audit", i)) {
          result.findings.push(f);
          result.byTool[f.tool].push(f);
        }
      }
      for (const f of Sweep.collect(perPage, "auditPage", seen || [])) {
        result.findings.push(f);
        result.byTool[f.tool].push(f);
      }
      return result;
    },
    /**
     * Collapse repeats, then rank worst-first. `key` says which findings are
     * the same problem; only the rule that produced them knows, so it supplies
     * it and this falls back to rule + message when it does not.
     *
     * This is not cosmetic. A page can hand back thousands of findings that
     * are one problem repeated — a nav of identical links, a table of
     * identical cells — and a list nobody can read is a list nobody uses.
     */
    group(findings) {
      const by = /* @__PURE__ */ new Map();
      findings.forEach((f, seq) => {
        const k = f.key || `${f.rule}|${f.message}`;
        const g = by.get(k);
        if (g) {
          g.n++;
          return;
        }
        by.set(k, { ...f, n: 1, seq });
      });
      const said = (g) => g.verdict === "review" ? 0 : 1;
      const rank = (g) => CONFIG.SEVERITY[g.severity] ?? 0;
      return [...by.values()].sort((a, b) => said(b) - said(a) || rank(b) - rank(a) || a.seq - b.seq);
    }
  };

  // src/services/report/index.js
  var Report = {
    text() {
      const active = Tools.active();
      const L = [
        `# UI debug report`,
        `url: ${location.href}`,
        `viewport: ${innerWidth}×${innerHeight} @ dpr ${devicePixelRatio}`,
        // sorted: this line is an INVENTORY, not a sequence — registration order
        // leaked into it once (a folder rename reordered it) and role order
        // would leak the same way. Alphabetical is immune to both.
        `tools: ${active.map((t) => t.id).sort().join(", ") || "none"}`,
        ""
      ];
      const found = [];
      if (State.current && document.contains(State.current)) {
        const i = U.info(State.current);
        L.push(`[selected] ${U.selectorOf(i.el)}`);
        for (const t of active) L.push(...t.report?.call(t, i) || []);
        found.push(...Sweep.collect(active, "audit", i));
        L.push("");
      }
      State.pins.forEach((p) => {
        const i = U.info(p.el);
        L.push(`[#${p.id}] (${p.kind}) ${U.selectorOf(i.el)}`);
        for (const t of active) L.push(...t.report?.call(t, i) || []);
        found.push(...Sweep.collect(active, "audit", i));
        L.push("");
      });
      for (const t of active) {
        const tail = t.reportTail?.call(t) || [];
        if (tail.length) L.push(...tail);
      }
      const list = State.sweep ? State.sweep.findings : found;
      const groups2 = Sweep.group(list);
      if (State.sweep || groups2.length) {
        L.push("", `## findings — ${groups2.length} problem${groups2.length === 1 ? "" : "s"} · ${list.length} occurrence${list.length === 1 ? "" : "s"}${Report.scope()}`);
        for (const g of groups2) {
          const tag = g.verdict === "review" ? "review" : g.severity;
          L.push(`[${tag}] ${g.rule}${g.n > 1 ? ` ×${g.n}` : ""}: ${g.message}`);
          L.push(`    ${U.selectorOf(g.el)}`);
        }
        if (!groups2.length) L.push("(none)");
        const docs = /* @__PURE__ */ new Map();
        for (const g of groups2) {
          const d = Tools.byId(g.tool)?.rules?.[g.rule];
          if (d && !docs.has(g.rule)) docs.set(g.rule, d);
        }
        if (docs.size) {
          L.push("", "## rules");
          for (const [id, d] of docs) {
            L.push(id);
            if (d.help) L.push(`  ${d.help}`);
            if (d.why) L.push(`  ${d.why}`);
            if (d.docs) L.push(`  ${d.docs}`);
          }
        }
      }
      return L.join("\n");
    },
    /** What the findings above cover, so a zero among them can be read. */
    scope() {
      const s = State.sweep;
      if (!s) return " · pinned elements only";
      return ` · whole page · ${s.rules} rule${s.rules === 1 ? "" : "s"} · ${s.elements} elements` + // the page could not show them all; this text can
      (Object.values(s.byTool).some((f) => f.length > CONFIG.MARK_LIMIT) ? ` · marks from the first ${CONFIG.MARK_LIMIT} findings per rule` : "");
    },
    /**
     * Put text on the clipboard. Separate from copy() because it is not only
     * the report that ever wants this — a tool that picks something off the
     * page needs the same two-step, and a second copy of the fallback is a
     * second thing to get wrong.
     */
    async toClipboard(txt) {
      try {
        await navigator.clipboard.writeText(txt);
      } catch {
        const t = document.createElement("textarea");
        t.value = txt;
        document.body.append(t);
        t.select();
        document.execCommand("copy");
        t.remove();
      }
    },
    async copy() {
      await Report.toClipboard(Report.text());
      Panel.flash("✓");
    },
    /**
     * The take-away actions for ONE element — what the target menu offers.
     *
     * They live HERE because copying is this service's capability, always
     * on the way ⧉ is: there used to be a `pick` tool armouring exactly
     * this behind a button and a Ctrl+click, and an on/off switch for
     * "copy" guards nothing — the menu takes no click away from anyone.
     * The surface (ui/menu.js) is handed these rows by the door (app/) and
     * never learns what one does.
     *
     * Copy text only exists when there IS text — a row that copies an
     * empty string is a control that does nothing, which is worse than
     * no control.
     */
    targetActions(el2) {
      const rows = [{
        label: "Copy selector",
        run: async () => {
          await Report.toClipboard(U.selectorOf(el2));
          Panel.flash("✓");
        }
      }];
      const txt = (el2.textContent || "").trim();
      if (txt) rows.push({
        label: "Copy text",
        run: async () => {
          await Report.toClipboard(txt);
          Panel.flash("✓");
        }
      });
      return rows;
    }
  };

  // src/app/interactions.js
  var Interactions = {
    // is the user typing? then keys belong to the page, not to us
    typing(e) {
      const t = e.target;
      return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""));
    },
    // Is this pointer event ours to swallow? Alt is the page's escape hatch,
    // and the panel handles its own clicks.
    ours(e) {
      return State.enabled && !e.altKey && !root.contains(e.target);
    },
    /**
     * Offer an event to the armed tools before the overlay's own default.
     *
     * WHY: every hook until now was read-or-render — a tool could describe the
     * page and judge it, but nothing could act on it, so anything that changes
     * what you clicked had nowhere to live. This is the one place input enters,
     * so it is the one place that can hand it on, and it does so by hook: no
     * tool is named here and none ever will be.
     *
     * The first tool to say it consumed the event ends it. Two tools acting on
     * one click is a page doing two things nobody asked for, and a pin landing
     * underneath an edit is the same bug wearing the overlay's own clothes.
     */
    claimed(type, ev, el2) {
      const ctx = {
        type,
        ev,
        el: el2,
        redraw: Render.schedule,
        toClipboard: Report.toClipboard
      };
      for (const t of Tools.withHook("intercept", true))
        if (t.intercept.call(t, ctx)) return true;
      return false;
    },
    // in remove mode only pins are targetable — pick the innermost one
    pinAt(x, y) {
      let best = null, bestArea = Infinity;
      for (const p of State.pins) {
        if (!document.contains(p.el)) continue;
        const r = p.el.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const area = r.width * r.height;
        if (area < bestArea) {
          best = p;
          bestArea = area;
        }
      }
      return best;
    },
    install(ctl) {
      addEventListener("keydown", (e) => {
        const H = CONFIG.HOTKEY;
        if (e.altKey === H.alt && e.shiftKey === H.shift && e.ctrlKey === H.ctrl && e.code === H.code) {
          e.preventDefault();
          ctl.togglePower();
          return;
        }
        if (e.code === CONFIG.REMOVE_KEY && State.enabled && !State.removeMode && !e.ctrlKey && !e.metaKey && !e.altKey && !Interactions.typing(e)) {
          e.preventDefault();
          ctl.setRemoveMode(true);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === "KeyC" && State.enabled && !Interactions.typing(e)) {
          const t = State.hoverEl || State.current;
          if (t && document.contains(t)) {
            e.preventDefault();
            Report.toClipboard(U.selectorOf(t));
            Panel.flash("✓");
          }
          return;
        }
        if (e.key === "Escape" && State.enabled && !Interactions.typing(e)) {
          if (Menu.isOpen()) Menu.close();
          else if (State.removeMode) ctl.setRemoveMode(false);
          else if (Panel.isListOpen()) Panel.toggleList(false);
          else if (Panel.isFlyoutOpen()) Panel.closeFlyouts();
          else if (State.pins.length || State.current) ctl.clearPins();
        }
      }, true);
      addEventListener("keyup", (e) => {
        if (e.code === CONFIG.REMOVE_KEY && State.removeMode) ctl.setRemoveMode(false);
      }, true);
      addEventListener("blur", () => {
        if (State.removeMode) ctl.setRemoveMode(false);
      });
      addEventListener("mousemove", (e) => {
        if (!State.enabled) return;
        if (State.removeMode) {
          const p = Interactions.pinAt(e.clientX, e.clientY);
          if (p !== State.removeTarget) {
            State.removeTarget = p;
            Render.schedule();
          }
          return;
        }
        const el2 = document.elementFromPoint(e.clientX, e.clientY);
        if (!el2 || root.contains(el2)) {
          if (State.hoverEl) {
            State.hoverEl = null;
            Render.schedule();
          }
          return;
        }
        if (el2 !== State.hoverEl) {
          State.hoverEl = el2;
          Render.schedule();
        }
      }, true);
      for (const type of ["mousedown", "mouseup", "dblclick"]) {
        addEventListener(type, (e) => {
          if (e.button !== 0 || !Interactions.ours(e)) return;
          e.preventDefault();
          e.stopPropagation();
        }, true);
      }
      addEventListener("click", (e) => {
        if (!Interactions.ours(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (State.removeMode) {
          const p = Interactions.pinAt(e.clientX, e.clientY);
          if (p) ctl.removePin(p);
          return;
        }
        const el2 = document.elementFromPoint(e.clientX, e.clientY);
        if (!el2 || root.contains(el2)) return;
        if (Interactions.claimed("click", e, el2)) return;
        if (!Tools.withHook("keeps", true).length) {
          ctl.setCurrent(el2);
          return;
        }
        const grouped = e.shiftKey && Tools.withHook("groups", true).length > 0;
        const kind = !grouped ? CONFIG.PIN_KIND.PLAIN : e.ctrlKey || e.metaKey ? CONFIG.PIN_KIND.CHAIN : CONFIG.PIN_KIND.SHIFT;
        ctl.togglePin(el2, kind);
      }, true);
      addEventListener("contextmenu", (e) => {
        if (!Interactions.ours(e)) return;
        const el2 = document.elementFromPoint(e.clientX, e.clientY);
        if (!el2 || root.contains(el2)) return;
        const rows = Report.targetActions(el2);
        if (!rows.length) return;
        e.preventDefault();
        e.stopPropagation();
        Menu.open(e.clientX, e.clientY, rows);
      }, true);
      addEventListener("scroll", Render.schedule, true);
      addEventListener("resize", Render.schedule);
    }
  };

  // src/app/updates.js
  function newer(a, b) {
    const A = String(a).split(".").map(Number);
    const B = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const d = (A[i] || 0) - (B[i] || 0);
      if (d) return d > 0;
    }
    return false;
  }
  function fetchText(url) {
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "dbgov-fetch", url }, (r) => {
          if (chrome.runtime.lastError || !r?.ok) reject(new Error(r?.error || "no worker"));
          else resolve(r.text);
        });
      });
    }
    if (typeof GM_xmlhttpRequest !== "undefined") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          nocache: true,
          onload: (r) => r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error("http " + r.status)),
          onerror: () => reject(new Error("network")),
          ontimeout: () => reject(new Error("timeout"))
        });
      });
    }
    return fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("http " + r.status);
      return r.text();
    });
  }
  var Updates = {
    latest: null,
    // a KNOWN newer version, or null
    async check(force) {
      let saved = {};
      try {
        saved = JSON.parse(Store.get("__dbgov_upd") || "{}") || {};
      } catch {
      }
      if (!force && Date.now() - (saved.t || 0) < CONFIG.UPDATE.EVERY) {
        if (saved.v && newer(saved.v, CONFIG.VERSION)) Updates.found(saved.v);
        return Updates.latest;
      }
      try {
        const meta = await fetchText(CONFIG.META_URL);
        const v = (/@version\s+([\d.]+)/.exec(meta) || [])[1];
        Store.set("__dbgov_upd", JSON.stringify({ t: Date.now(), v: v || null }));
        if (v && newer(v, CONFIG.VERSION)) Updates.found(v);
        else Updates.latest = null;
      } catch {
      }
      return Updates.latest;
    },
    found(v) {
      Updates.latest = v;
      Panel.setUpdate(v);
    },
    /** What pressing Update DOES, per gate. The userscript's manager owns
     *  installation, so its click opens the install URL and Tampermonkey's
     *  own dialog finishes the job in one more click. The extension's
     *  self-updater arrives with its options page; until then, honesty. */
    apply() {
      if (typeof chrome !== "undefined" && chrome.runtime?.id) {
        Panel.flash("git pull", ".dbgov-pwr");
        return;
      }
      window.open(CONFIG.INSTALL_URL, "_blank");
    },
    /** The ⏻ menu — the same cursor menu right-click already speaks. */
    menu(x, y) {
      const rows = [{
        label: "Check for updates now",
        run: async () => {
          const v = await Updates.check(true);
          Panel.flash(v ? `v${v}!` : "✓ current", ".dbgov-pwr");
        }
      }];
      if (Updates.latest) {
        rows.push({ label: `Update to v${Updates.latest}`, run: () => Updates.apply() });
      }
      Menu.open(x, y, rows);
    },
    schedule() {
      setTimeout(() => Updates.check(false), CONFIG.UPDATE.BOOT_DELAY);
    }
  };

  // src/services/settings/index.js
  var Settings = {
    carried: {},
    // saved values whose owner this build does not know
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
        tool: t,
        opt: o
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
      return Settings.rows(/* @__PURE__ */ new Set([t, ...t.uses || []]));
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
    /**
     * `only`: restrict to a set of owners — that is the per-tool door. One
     * loop builds both views, THROUGH Settings.row (the inline duplicate that
     * used to live here is the drift the "one row builder" rule exists to
     * prevent), so grouping, headings and ORDER cannot differ between doors.
     * KEYS stays ⚙-only: gestures are nobody's options.
     */
    rows(only) {
      const out = [];
      for (const r of ROLES) {
        const rows = [];
        for (const t of Tools.settingOwners()) {
          if (only && !only.has(t)) continue;
          for (const o of t.options.call(t)) {
            if (o.affects !== r.key) continue;
            rows.push(Settings.row(t, o));
          }
        }
        if (!rows.length) continue;
        out.push({ heading: r.label, detail: r.note });
        out.push(...rows);
      }
      const keys = only ? [] : Settings.gestureRows();
      if (keys.length) {
        out.push({ heading: "Keys", detail: "the parts of this that are not buttons" });
        out.push(...keys);
      }
      const legend6 = only ? [] : Settings.legendRows();
      if (legend6.length) {
        out.push({ heading: "Legend", detail: "what the marks and short names mean" });
        out.push(...legend6);
      }
      return out;
    },
    /**
     * WHAT THE BADGE IS SAYING. `p 4 8`, `r 13`, `12/16 400`, an amber ⚠, a
     * red ratio — the whole diagnosis is abbreviations and colour, and none of
     * it was written down anywhere in the running overlay. A first reader had
     * to guess or read the source.
     *
     * Collected through a hook for the same reason `gestures` is: each tool
     * declares the vocabulary it invented, beside the code that prints it, so
     * no core file holds a table of another tool's colours — and a tool
     * shipped tomorrow documents itself with nothing installed here.
     */
    legendRows() {
      const rows = [];
      for (const t of Tools.withHook("legend"))
        for (const g of t.legend.call(t) || []) rows.push([g.mark, g.means]);
      return rows.map(([mark, means]) => ({ tag: mark, label: means, detail: "" }));
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
      const hot = [
        H.ctrl && "Ctrl",
        H.alt && "Alt",
        H.shift && "Shift",
        H.code.replace("Key", "")
      ].filter(Boolean).join("+");
      const rows = [
        ["Click", "select an element — 📌 armed, it is kept as a pin"],
        ["Shift+click", "pair it with your next Shift+click"],
        ["Right-click a target", "its menu — copy its selector or text"],
        ["Ctrl/⌘+C", "copy the hovered target's selector"],
        ["Alt+click", "let the click through to the page"],
        ["Alt+right-click", "the page's own context menu"],
        [`Hold ${CONFIG.REMOVE_KEY.replace("Key", "")}`, "show ✕ on every pin"],
        ["Esc", "close the panel, then the pins"],
        ["Right-click a tool", "its own options, without the others"],
        ["Right-click ⏻", "updates — check now, or install the one waiting"],
        [hot, "power on and off"]
      ];
      for (const t of Tools.withHook("gestures"))
        for (const g of t.gestures.call(t) || []) rows.push([g.keys, g.does]);
      return rows.map(([keys, does]) => ({ tag: keys, label: does, detail: "" }));
    },
    /**
     * How one option wants drawing. An option with `values` is a choice; the
     * two typed kinds are for the settings a list cannot express — a threshold
     * somebody has to type, a thing that is simply on or off.
     */
    controlFor(o, cur) {
      if (o.type === "number") {
        return {
          kind: "number",
          value: String(cur),
          suffix: o.suffix || "",
          min: o.min,
          max: o.max,
          step: o.step
        };
      }
      if (o.type === "toggle") return { kind: "toggle", on: !!cur };
      const values = o.values.includes(cur) ? o.values : [cur, ...o.values];
      return {
        kind: "choice",
        values,
        choices: values.map((v) => `${v}${o.suffix || ""}`),
        selected: values.indexOf(cur)
      };
    },
    /** Is `v` something this option could actually be set to? */
    valid(o, v) {
      if (v === void 0 || v === null) return false;
      if (o.type === "number") {
        return typeof v === "number" && Number.isFinite(v) && v >= (o.min ?? -Infinity) && v <= (o.max ?? Infinity);
      }
      if (o.type === "toggle") return typeof v === "boolean";
      return o.values.includes(v);
    },
    /**
     * Whatever the panel's widget produced, turned back into the option's own
     * value. Returns null for anything that is not a legal setting — a number
     * field accepts empty and "e", and neither may reach a rule.
     */
    fromControl(row, raw) {
      const o = row.opt;
      if (o.type === "number") {
        const n = Number(raw);
        if (raw === "" || !Number.isFinite(n)) return null;
        return Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, n));
      }
      if (o.type === "toggle") return !!raw;
      const v = row.control.values[raw];
      return v === void 0 ? null : v;
    },
    /** Write one option through, and persist the lot. */
    apply(row, v) {
      var _a, _b;
      ((_a = State.settings)[_b = row.tool.id] || (_a[_b] = {}))[row.opt.key] = v;
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
      try {
        saved = JSON.parse(Store.get(CONFIG.SETTINGS_KEY) || "{}") || {};
      } catch {
      }
      const out = {};
      for (const t of Tools.settingOwners()) {
        const prev = saved[t.id] || t.was && saved[t.was] || null;
        out[t.id] = {};
        for (const o of t.options.call(t)) {
          const was = prev?.[o.key];
          out[t.id][o.key] = Settings.valid(o, was) ? was : o.def;
        }
      }
      Settings.carried = {};
      for (const id of Object.keys(saved)) if (!(id in out)) Settings.carried[id] = saved[id];
      State.settings = out;
    }
  };

  // src/app/controller.js
  var Controller = {
    /**
     * The RUNTIME lifecycle — the first hook pair with a tense. Every hook
     * before this was called at a moment (a click, a frame, a sweep); a
     * MONITOR is on duty for a span of time, so something has to say when
     * the span starts and ends. watch() when a tool becomes active (armed
     * AND powered), unwatch() when it stops being either — asked by hook,
     * no tool named, so the next monitor ships without touching this file.
     */
    _running: /* @__PURE__ */ new Set(),
    syncRuntimes() {
      for (const t of Tools.withHook("watch", false)) {
        const should = State.enabled && State.tools.has(t.id);
        const is = Controller._running.has(t);
        if (should && !is) {
          Controller._running.add(t);
          t.watch.call(t, { redraw: Render.schedule });
        } else if (!should && is) {
          Controller._running.delete(t);
          t.unwatch?.call(t);
        }
      }
    },
    setPower(v) {
      State.enabled = v;
      Store.set(`${CONFIG.POWER_KEY}:${location.origin}`, v ? "1" : "0");
      if (!v) Menu.close();
      if (!v) State.hoverEl = null;
      if (v) {
        try {
          getSelection()?.removeAllRanges();
        } catch {
        }
      }
      if (!v) State.sweep = null;
      Panel.setSwept(!!State.sweep, 0);
      Panel.setOn(v);
      Controller.syncRuntimes();
      Render.schedule();
    },
    togglePower() {
      Controller.setPower(!State.enabled);
    },
    /**
     * Audit the whole page rather than the elements under the cursor. The
     * result is kept so the report and any findings surface read the same
     * pass — sweeping again per reader would give two different answers on a
     * page that moved in between.
     */
    sweep() {
      if (!State.enabled) return;
      State.sweep = Sweep.run();
      Panel.setSwept(true, Sweep.group(State.sweep.findings).length);
      Panel.toggleList(true, "findings");
      Render.schedule();
    },
    /** Rows for whichever view the panel is showing. */
    rows(view) {
      const body = view === "settings" ? Settings.rows() : Controller.toolOf(view) ? Settings.rowsFor(Controller.toolOf(view)) : view === "findings" ? Controller.findingRows() : Controller.pinList();
      if (!body.length) return body;
      for (const r of body) if (r.pins || r.el) r.activatable = true;
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
    toolOf: (view) => String(view || "").startsWith("tool:") ? view.slice(5) : null,
    viewTitle(view, body) {
      const owned = Controller.toolOf(view);
      if (owned) {
        const t = Tools.byId(owned);
        return t && {
          title: (t.family ? t.family[0].toUpperCase() + t.family.slice(1) + " › " : "") + t.title.split(/[—·]/)[0].trim(),
          detail: "its own options — ⚙ has these and everyone else's"
        };
      }
      if (view === "settings") return { title: "Settings", detail: "what each tool checks and shows" };
      if (view === "pins") {
        const n = State.pins.length;
        return {
          title: "Pins",
          detail: `${n} pinned element${n === 1 ? "" : "s"}` + (Controller._lost ? ` · ${Controller._lost} did not survive the reload` : ""),
          removable: n > 0,
          rmTitle: "Clear all pins — the audit's marks stay",
          pins: State.pins.slice()
        };
      }
      const s = State.sweep;
      if (!s) return { title: "Findings", detail: "no audit has run" };
      const groups2 = body.filter((r) => !r.heading && !r.title).length;
      return {
        title: "Findings",
        detail: `${groups2} distinct problem${groups2 === 1 ? "" : "s"} · ${s.findings.length} occurrence${s.findings.length === 1 ? "" : "s"}`
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
      if (row.onChange) {
        row.onChange(raw);
        Render.schedule();
        Controller.refreshList();
        return;
      }
      if (!row.opt) return;
      const v = Settings.fromControl(row, raw);
      if (v === null) {
        Controller.refreshList();
        return;
      }
      Settings.apply(row, v);
      if (row.opt.affects === "detect") {
        State.sweep = null;
        Panel.setSwept(false, 0);
      }
      Render.schedule();
      Controller.refreshList();
    },
    /** One row per distinct problem, worst first. No pin, so nothing to remove. */
    findingRows() {
      const rows = Sweep.group(State.sweep ? State.sweep.findings : []).map((g) => ({
        tag: (g.verdict === "review" ? "review" : g.severity) + (g.n > 1 ? ` ×${g.n}` : ""),
        label: g.message,
        // the leaf, not the whole path: a row has to be scannable, and the
        // full ancestor chain is in the copied report where there is room
        detail: U.selectorOf(g.el).split(" > ").pop(),
        accent: g.verdict === "review" ? "review" : g.severity,
        el: g.el
      }));
      const capped = State.sweep ? Tools.withHook("draw", true).map((t) => (State.sweep.byTool[t.id] || []).length).filter((n) => n > CONFIG.MARK_LIMIT) : [];
      if (capped.length) {
        rows.unshift({
          heading: `${Math.max(...capped)} found by one rule`,
          detail: `the page marks the first ${CONFIG.MARK_LIMIT} findings of each — this list is complete`
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
      if (Controller.toolOf(view)) return "This one has nothing to configure.";
      if (view === "settings") return "No tool has anything to configure.";
      if (view !== "findings") return "No pins yet — click to inspect, Shift+click to measure.";
      const s = State.sweep;
      if (!s) return "Press ⌕ to audit the page.";
      if (!s.rules) return "No rules are installed, so nothing was checked.";
      return `No findings — ${s.rules} rule${s.rules === 1 ? "" : "s"} over ${s.elements} elements.`;
    },
    toggleTool(id) {
      if (!Tools.byId(id)) return;
      State.tools.has(id) ? State.tools.delete(id) : State.tools.add(id);
      Panel.setTool(id, State.tools.has(id));
      Store.set(CONFIG.TOOLS_KEY, JSON.stringify([...State.tools]));
      Controller.syncRuntimes();
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
        const s = JSON.parse(Store.get(CONFIG.SEEN_KEY) || "null");
        if (Array.isArray(s)) seen = s;
      } catch {
      }
      try {
        const saved = JSON.parse(Store.get(CONFIG.TOOLS_KEY) || "null");
        if (Array.isArray(saved)) {
          const known = seen || registered;
          ids = saved.filter((id) => Tools.byId(id));
          for (const t of TOOLS) if (t.startsOn && !known.includes(t.id)) ids.push(t.id);
        }
      } catch {
      }
      Store.set(CONFIG.SEEN_KEY, JSON.stringify([...registered].sort()));
      State.tools = new Set(ids.filter((id) => Tools.byId(id)));
      TOOLS.forEach((t) => Panel.setTool(t.id, State.tools.has(t.id)));
      Panel.attachCount(Tools.withHook("keeps", false)[0]?.id ?? null);
      Controller.syncRuntimes();
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
      Controller.persistPins();
      Render.schedule();
      Controller.refreshList();
    },
    /**
     * THE SESSION SURVIVES THE REFRESH — by address, honestly. A pin holds a
     * live element and the reload destroys the document, so what persists is
     * each pin's SELECTOR, re-resolved against the new page at boot. Keyed by
     * origin+path: a pin on /live-map is not a pin on /settings. A selector
     * that no longer matches is DROPPED and the Pins header says how many —
     * an element that is gone is gone, and a silent loss is how ✕ deleted
     * the wrong pin once. The honest limit, stated: a selector is an address,
     * and on a changed page it can name a different element.
     */
    _pinsKey: () => `${CONFIG.PINS_KEY}:${location.origin}${location.pathname}`,
    _lost: 0,
    persistPins() {
      Controller._lost = 0;
      const cur = State.current && document.contains(State.current) ? U.selectorOf(State.current) : null;
      const pins = State.pins.filter((p) => document.contains(p.el)).map((p) => ({ s: U.selectorOf(p.el), id: p.id, kind: p.kind }));
      Store.set(
        Controller._pinsKey(),
        pins.length || cur ? JSON.stringify({ pins, cur }) : ""
      );
    },
    restorePins() {
      let saved = null;
      try {
        saved = JSON.parse(Store.get(Controller._pinsKey()) || "null");
      } catch {
      }
      if (!saved) return;
      const seen = /* @__PURE__ */ new Set();
      for (const p of saved.pins || []) {
        let el2 = null;
        try {
          el2 = document.querySelector(p.s);
        } catch {
        }
        if (!el2 || seen.has(el2)) {
          Controller._lost++;
          continue;
        }
        seen.add(el2);
        State.pins.push({ el: el2, id: p.id, kind: p.kind });
      }
      if (saved.cur) {
        try {
          const el2 = document.querySelector(saved.cur);
          if (el2 && !seen.has(el2)) State.current = el2;
        } catch {
        }
      }
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
    togglePin(el2, kind = CONFIG.PIN_KIND.PLAIN) {
      State.current = null;
      const i = State.pins.findIndex((p) => p.el === el2);
      if (i >= 0) {
        if (State.pins[i].kind === kind) State.pins.splice(i, 1);
        else State.pins[i].kind = kind;
      } else {
        State.pins.push({ el: el2, id: Controller.nextPinId(), kind });
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
    setCurrent(el2) {
      State.current = State.current === el2 ? null : el2;
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
      const claimed = /* @__PURE__ */ new Set();
      for (const t of Tools.active()) {
        for (const row of t.listRows?.call(t) || []) {
          row.pins?.forEach((p) => claimed.add(p));
          rows.push(row);
        }
      }
      for (const p of State.pins) {
        if (claimed.has(p)) continue;
        if (!document.contains(p.el)) continue;
        const r = p.el.getBoundingClientRect();
        rows.push({
          tag: `#${p.id}`,
          label: U.labelOf(p.el),
          detail: `${Math.round(r.width)}×${Math.round(r.height)}`,
          pins: [p]
        });
      }
      const first = (row) => row.pins?.length ? Math.min(...row.pins.map((p) => p.id)) : Infinity;
      rows.forEach((r) => {
        if (r.pins?.length) r.removable = true;
      });
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
      let pins = row.pins;
      if (!pins || !pins.length) {
        if (!row.el || !document.contains(row.el)) return;
        const had = State.pins.find((p) => p.el === row.el);
        if (!had) Controller.togglePin(row.el, CONFIG.PIN_KIND.PLAIN);
        pins = [State.pins.find((p) => p.el === row.el)];
      }
      const el2 = pins[0].el;
      el2.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      State.flashPins = pins;
      Render.schedule();
      clearTimeout(Controller._flash);
      Controller._flash = setTimeout(() => {
        State.flashPins = null;
        Render.schedule();
      }, 900);
    },
    removeRow(i) {
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
     * The 🏷 flyout's axes and members come from the face itself (it derives
     * them from its own options(), one declaration for flyout and ⚙ alike);
     * this is only the hand-over. Writes still go through Settings.apply —
     * the same store the ⚙ row writes — so the two surfaces re-read one
     * value and can never disagree.
     */
    refreshBadge() {
      Panel.setBadgeControls(BadgeFace.groups());
    },
    badgeControl(key) {
      const [k, v] = key.split(":");
      const opt = BadgeFace.options().find((o) => o.key === k);
      if (!opt) return;
      const next = opt.values ? v : !Tools.setting(BadgeFace, k);
      Settings.apply({ tool: BadgeFace, opt }, next);
      Controller.refreshBadge();
      Controller.refreshList();
      Render.schedule();
    }
  };

  // src/boot.js
  initDom();
  initList();
  initMenu();
  initPanel();
  Panel.onToggle = Controller.togglePower;
  Panel.onTool = Controller.toggleTool;
  Panel.onBadgeControl = Controller.badgeControl;
  Panel.onUpdateMenu = Updates.menu;
  Panel.onCopy = Report.copy;
  Panel.onSweep = Controller.sweep;
  Panel.onClear = Controller.clearPins;
  Panel.onListOpen = (view) => Panel.setList(Controller.rows(view), Controller.emptyFor(view));
  Panel.onRowActivate = Controller.revealRow;
  Panel.onRowRemove = Controller.removeRow;
  Panel.onRowChange = Controller.changeRow;
  Render.onPinsPruned = Controller.pinsPruned;
  Settings.load();
  Controller.refreshBadge();
  Controller.loadTools();
  Interactions.install(Controller);
  Controller.restorePins();
  Controller.setPower(Store.get(`${CONFIG.POWER_KEY}:${location.origin}`) === "1");
  Updates.schedule();
})();
})();
