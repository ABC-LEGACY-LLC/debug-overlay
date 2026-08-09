  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .ok  { color: #b5e853; }
    .dbgov-badge .bad { color: #ff6b6b; font-weight: 700; }
    `,
      id: 'contrast',
      icon: '◐',
      title: 'Contrast — WCAG text contrast ratio (AA)',
      _measure({ el, cs }) {
        if (!U.hasOwnText(el)) return null;
        const fg = U.parseColor(cs.color);
        if (!fg) return null;
        const bg = U.effectiveBg(el.parentElement || el);
        const ratio = U.contrastRatio(fg, bg);
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const isLarge = size >= CONFIG.CONTRAST.largePx ||
                        (bold && size >= CONFIG.CONTRAST.largeBoldPx);
        const need = isLarge ? CONFIG.CONTRAST.large : CONFIG.CONTRAST.normal;
        return { ratio, need, pass: ratio >= need, isLarge };
      },
      badge(i) {
        const c = this._measure(i);
        if (!c) return null;
        const cls = c.pass ? 'ok' : 'bad';
        return `<span class="${cls}">${c.ratio.toFixed(2)}:1 ${c.pass ? 'AA✓' : 'AA✗'}</span>`;
      },
      compact(i) {
        const c = this._measure(i);
        if (!c || c.pass) return null;   // stay quiet unless it actually fails
        return `<span class="bad">${c.ratio.toFixed(1)}:1 ✗</span>`;
      },
      report(i) {
        const c = this._measure(i);
        if (!c) return [];
        return [`  contrast: ${c.ratio.toFixed(2)}:1 vs required ${c.need} (${c.isLarge ? 'large' : 'normal'} text) → ${c.pass ? 'PASS' : 'FAIL'}`];
      },
    });
