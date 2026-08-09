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
      State.pins.forEach((p) => {
        const i = U.info(p.el);
        L.push(`[#${p.id}] (${p.kind}) ${U.selectorOf(i.el)}`);
        for (const t of active) L.push(...(t.report?.call(t, i) || []));
        L.push('');
      });
      for (const t of active) {
        const tail = t.reportTail?.call(t) || [];
        if (tail.length) L.push(...tail);
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
