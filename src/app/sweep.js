import { CONFIG } from '../core/config.js';
import { Tools } from '../core/registry.js';
import { U } from '../core/utils.js';
  /* ======================================================================
    SWEEP — run the rules over the whole page instead of one element
     ====================================================================== */
  export const Sweep = {
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
      const perEl = Tools.withHook('audit');        // not `armed` — see above
      const perPage = Tools.withHook('auditPage');
      const all = [...new Set([...perEl, ...perPage])];
      // byTool is built here, once, rather than filtered per frame by the
      // renderer: a page can return thousands of findings and draw() runs at
      // 60fps.
      const result = { findings: [], rules: all.length, elements: 0, byTool: {} };
      if (!all.length || !document.body) return result;
      for (const t of all) result.byTool[t.id] = [];

      // Only gathered when a page-level rule actually exists. Holding every
      // element's info costs real memory on a large page, and a page with no
      // relational rule should not pay for one.
      const seen = perPage.length ? [] : null;

      for (const el of document.body.querySelectorAll('*')) {
        // One getComputedStyle per element, reused as the gate AND handed to
        // the rules, so nobody reads it twice. It is the dominant cost of the
        // pass — a rule that needs geometry pays for it lazily, on request.
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        result.elements++;
        const i = U.info(el, cs);
        if (seen) seen.push(i);
        for (const f of Sweep.collect(perEl, 'audit', i)) {
          result.findings.push(f);
          result.byTool[f.tool].push(f);
        }
      }

      // Then the questions no single element can answer: a duplicate id, a
      // spacing scale nobody kept to, two things that only conflict with each
      // other. audit(info) is blind to all of them by construction.
      for (const f of Sweep.collect(perPage, 'auditPage', seen || [])) {
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
      const by = new Map();
      findings.forEach((f, seq) => {
        const k = f.key || `${f.rule}|${f.message}`;
        const g = by.get(k);
        if (g) { g.n++; return; }
        by.set(k, { ...f, n: 1, seq });
      });
      // Anything measured outranks anything merely to be looked at, whatever
      // its severity: a finding you can act on beats one you have to go and
      // check by eye. Within each, worst first, then discovery order.
      const said = (g) => (g.verdict === 'review' ? 0 : 1);
      const rank = (g) => CONFIG.SEVERITY[g.severity] ?? 0;
      return [...by.values()].sort((a, b) =>
        said(b) - said(a) || rank(b) - rank(a) || a.seq - b.seq);
    },
  };
