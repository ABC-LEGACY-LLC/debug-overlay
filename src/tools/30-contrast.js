  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .ok  { color: #b5e853; }
    .dbgov-badge .bad { color: #ff6b6b; font-weight: 700; }
    `,
      id: 'contrast',
      kind: 'rule',
      icon: '◐',
      title: 'Contrast — WCAG text contrast ratio (AA)',
      _measure({ el, cs }) {
        if (!U.hasOwnText(el)) return null;
        const fg = U.parseColor(cs.color);
        if (!fg) return null;
        const bg = U.effectiveBg(el.parentElement || el);
        if (!bg) return null;   // unreadable background — say nothing
        const ratio = U.contrastRatio(fg, bg);
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const isLarge = size >= CONFIG.CONTRAST.largePx ||
                        (bold && size >= CONFIG.CONTRAST.largeBoldPx);
        const need = isLarge ? CONFIG.CONTRAST.large : CONFIG.CONTRAST.normal;
        return { ratio, need, pass: ratio >= need, isLarge, fg, bg };
      },
      _rgb: (c) => `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`,

      // RULE hook: the verdict badge() shows, as data instead of prose. A
      // passing element produces nothing — a findings list is a list of
      // problems, which is what lets the same hook run over a whole page.
      audit(i) {
        const c = this._measure(i);
        if (!c || c.pass) return [];
        return [{
          el: i.el,
          // below the large-text floor nobody can read it; above it, a near
          // miss that a size or weight change might fix
          severity: c.ratio < CONFIG.CONTRAST.large ? 'error' : 'warn',
          rule: 'contrast-aa',
          message: `${c.ratio.toFixed(2)}:1 — AA needs ${c.need} for ${c.isLarge ? 'large' : 'normal'} text`,
          // one line per colour pair, not per element: a 40-link nav is ONE
          // problem. Only the rule knows what "the same problem" means.
          key: `contrast-aa|${this._rgb(c.fg)}|${this._rgb(c.bg)}|${c.isLarge}`,
        }];
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
