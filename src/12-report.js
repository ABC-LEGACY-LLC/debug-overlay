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
        // something is wrong, so this is usually empty
        for (const t of active) found.push(...(t.audit?.call(t, i) || []));
        L.push('');
      });
      for (const t of active) {
        const tail = t.reportTail?.call(t) || [];
        if (tail.length) L.push(...tail);
      }
      // A sweep already covered every element, pinned ones included, so it
      // replaces the per-pin collection rather than adding to it — counting
      // both would report the same problem twice.
      const list = State.findings || found;
      // Its own section: per-pin lines carry no attribution, so loose finding
      // lines up there would be indistinguishable from a tool's description.
      const groups = Sweep.group(list);
      if (groups.length) {
        L.push('', `## findings (${list.length})${State.findings ? ' — whole page' : ''}`);
        for (const g of groups) {
          L.push(`[${g.severity}] ${g.rule}${g.n > 1 ? ` ×${g.n}` : ''}: ${g.message}`);
          L.push(`    ${U.selectorOf(g.el)}`);
        }
      }
      return L.join('\n');
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
