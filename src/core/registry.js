import { State } from './state.js';
  /* ======================================================================
     TOOLS — ⭐ the plugin registry

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
          options()      → [{ key, label, values, def }] the panel can change
          css            → stylesheet text, read from EVERY registered tool
     ====================================================================== */
  /**
   * The four things a component can be.
   *
   * ROLES ARE DERIVED. A tool's hooks already say what it does, so a label on
   * the tool could only repeat them and then drift out of step — which is
   * exactly how the old `kind` field failed. Nothing declares a role.
   *
   * They are also PLURAL. grid annotates other tools' numbers and produces
   * findings; contrast describes an element and judges it. One label per tool
   * would have to be wrong about most of the toolset.
   *
   * A SETTING is the one case that cannot be derived: no hook can tell you
   * whether grid's `max` is a detection scope or a display preference. So an
   * option declares `affects`, and audit.js refuses one that does not.
   *
   * `report` is in no role on purpose — every tool contributes to the copied
   * report, so it says nothing about what any of them is.
   *
   * The order is the order the ⚙ view reads in: what you pick, what you are
   * shown about it, what is judged wrong with it, what happens when you act.
   */
  export const ROLES = [
    { key: 'select', label: 'Select',
      note: 'how what you click becomes what you are looking at',
      has: (t) => !!(t.groups || t.listRows || t.pendingIndex) },
    { key: 'inspect', label: 'Inspect',
      note: 'what gets shown about it',
      has: (t) => !!(t.badge || t.compact || t.annotate) },
    { key: 'detect', label: 'Detect',
      note: 'what counts as a problem',
      has: (t) => !!(t.audit || t.auditPage) },
    { key: 'act', label: 'Act',
      note: 'what the overlay does to the page or the clipboard',
      has: (t) => !!t.intercept },
  ];
  const role = (key) => ROLES.find((r) => r.key === key);

  /**
   * Presentation order, derived — which button sits where, which ⚙ row is
   * first. Filenames used to carry this as numeric prefixes, which meant a
   * name said when a thing displays rather than what it is, and left the last
   * numbers in a tree that had otherwise stopped using them.
   *
   * By the first ROLE a component fills, then by id. That reproduces the bar
   * as it was — pick after measure, dupid after the two that also describe —
   * without anything being spelled. Roles are plural and this takes the first,
   * which is a display decision only: nothing is claimed about the others, and
   * being wrong costs an ordering, never a verdict.
   */
  const byRole = (a, b) => {
    const rank = (t) => {
      const i = ROLES.findIndex((r) => r.has(t));
      return i < 0 ? ROLES.length : i;
    };
    return rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };

  /**
   * SUBJECTS — a shared measurement, and the settings that govern it.
   *
   * WHY: `step` was grid's setting and `level` was contrast's, but neither is
   * a property of a read-out. The spacing step is a property of the PROJECT,
   * and both the ⚠ on a badge and the finding in a sweep have to agree about
   * it or the overlay contradicts itself. Same for the WCAG level, and for the
   * memoised colour cache underneath it — a page has tens of colours and
   * thousands of nodes, and resolving them twice is real work done twice.
   *
   * A subject is not a component: no icon in the bar, no arming, no hooks. It
   * is called BY components and never calls back — the same one-way rule the
   * core files live under. That is what lets two components share a
   * measurement without naming each other.
   */
  export const SUBJECTS = [];
  /** Register a shared subject. One call per file in src/subjects/. */
  export const defineSubject = (s) => { SUBJECTS.push(s); return s; };

  export const TOOLS = [];
  /** Register a debug tool. One call per file in src/tools/. */
  export const defineTool = (t) => { TOOLS.push(t); return t; };

  export const Tools = {
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
     * The tools, split into runs for the panel to draw with a rule between
     * them. Two toggles that look identical and mean different things is the
     * problem here: arming one changes what the page audit finds and arming
     * the other does not, and nothing said so.
     *
     * The split lives here because this is the file that knows what a hook
     * is. The panel renders the runs it is handed and never learns what
     * separates them — a third run would need no panel change at all.
     */
    runs() {
      // The one axis a BUTTON can carry. A button sits in exactly one place,
      // and most tools hold two roles — filing grid under Detect would tell
      // you it is not also the thing putting ⚠ on your padding. This asks a
      // yes/no question instead, which composition cannot make false, and the
      // full role list goes in the tooltip where there is room to be plural.
      const checks = role('detect').has;
      const inOrder = TOOLS.slice().sort(byRole);
      return [
        { cls: '', note: '', tools: inOrder.filter((t) => !checks(t)) },
        { cls: 'checks', note: ' · also runs in the page audit',
          tools: inOrder.filter(checks) },
      ].filter((r) => r.tools.length);
    },

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
      const seen = new Set();
      for (const t of TOOLS.slice().sort(byRole)) {
        for (const su of t.uses || []) {
          if (!seen.has(su)) { seen.add(su); out.push(su); }
        }
        out.push(t);
      }
      for (const su of SUBJECTS) if (!seen.has(su)) out.push(su);
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
      for (const t of Tools.withHook('groups', true))
        out.push(...(t.groups.call(t) || []));
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
      const lenses = Tools.withHook('annotate', true);
      if (!lenses.length) return null;
      return (n) => lenses.reduce(
        (html, t) => t.annotate?.call(t, html, n, info) || html, `${n}`);
    },
  };
