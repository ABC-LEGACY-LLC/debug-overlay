  /* ======================================================================
    15. SWEEP — run the rules over the whole page instead of one element
     ====================================================================== */
  const Sweep = {
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
    run() {
      const rules = TOOLS.filter((t) => t.audit);
      const result = { findings: [], rules: rules.length, elements: 0 };
      if (!rules.length || !document.body) return result;
      for (const el of document.body.querySelectorAll('*')) {
        // One getComputedStyle per element, reused as the gate AND handed to
        // the rules, so nobody reads it twice. It is the dominant cost of the
        // pass — a rule that needs geometry pays for it lazily, on request.
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        result.elements++;
        const i = U.info(el, cs);
        for (const t of rules) {
          const f = t.audit?.call(t, i);
          if (f && f.length) result.findings.push(...f);
        }
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
      const rank = (g) => CONFIG.SEVERITY[g.severity] ?? 0;
      return [...by.values()].sort((a, b) => rank(b) - rank(a) || a.seq - b.seq);
    },
  };
