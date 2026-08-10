  /* ======================================================================
    12. REPORT — also composed from active tools
     ====================================================================== */
  const Report = {
    text() {
      const active = Tools.active();
      const L = [
        `# UI debug report`,
        `url: ${location.href}`,
        `viewport: ${innerWidth}×${innerHeight} @ dpr ${devicePixelRatio}`,
        `tools: ${active.map((t) => t.id).join(', ') || 'none'}`,
        '',
      ];
      const found = [];
      State.pins.forEach((p) => {
        const i = U.info(p.el);
        L.push(`[#${p.id}] (${p.kind}) ${U.selectorOf(i.el)}`);
        for (const t of active) L.push(...(t.report?.call(t, i) || []));
        // same info, judged rather than described — rules only speak up when
        // something is wrong, so this is usually empty. Stamped by the same
        // helper the sweep uses, so a finding always knows its producer no
        // matter which path made it.
        found.push(...Sweep.collect(active, 'audit', i));
        L.push('');
      });
      for (const t of active) {
        const tail = t.reportTail?.call(t) || [];
        if (tail.length) L.push(...tail);
      }
      // A sweep already covered every element, pinned ones included, so it
      // replaces the per-pin collection rather than adding to it — counting
      // both would report the same problem twice.
      const list = State.sweep ? State.sweep.findings : found;
      // Its own section: per-pin lines carry no attribution, so loose finding
      // lines up there would be indistinguishable from a tool's description.
      const groups = Sweep.group(list);
      // A sweep that found nothing still prints its heading. "No findings"
      // over a stated scope is a result; an absent section is indistinguishable
      // from never having looked.
      if (State.sweep || groups.length) {
        L.push('', `## findings (${list.length})${Report.scope()}`);
        for (const g of groups) {
          // 'review' outranks the severity in the label: what matters first is
          // whether this is a verdict or the absence of one
          const tag = g.verdict === 'review' ? 'review' : g.severity;
          L.push(`[${tag}] ${g.rule}${g.n > 1 ? ` ×${g.n}` : ''}: ${g.message}`);
          L.push(`    ${U.selectorOf(g.el)}`);
          // What the rule IS, as opposed to what this instance measured. The
          // message alone only helps someone who already knew the rule; this
          // is what lets the report be pasted into a ticket and still make
          // sense to whoever picks it up.
          const doc = Tools.byId(g.tool)?.rules?.[g.rule];
          if (doc) {
            if (doc.help) L.push(`    → ${doc.help}`);
            if (doc.why) L.push(`    → ${doc.why}`);
            if (doc.docs) L.push(`    → ${doc.docs}`);
          }
        }
        if (!groups.length) L.push('(none)');
      }
      return L.join('\n');
    },
    /** What the findings above cover, so a zero among them can be read. */
    scope() {
      const s = State.sweep;
      if (!s) return ' — pinned elements only';
      return ` — whole page · ${s.rules} rule${s.rules === 1 ? '' : 's'}` +
             ` · ${s.elements} elements`;
    },
    async copy() {
      const txt = Report.text();
      try {
        await navigator.clipboard.writeText(txt);
        Panel.flash('✓');
      } catch {
        const t = document.createElement('textarea');
        t.value = txt;
        document.body.append(t);
        t.select();
        document.execCommand('copy');
        t.remove();
        Panel.flash('✓');
      }
    },
  };
