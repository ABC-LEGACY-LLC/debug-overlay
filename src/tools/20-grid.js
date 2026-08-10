  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .warn{ color: #ffd54f; }
    `,
      id: 'grid',
      icon: '▦',
      title: `Grid — flag values off the ${CONFIG.GRID}px grid`,
      // 0 is never off the grid, or every padding:0 would light up
      _off: (n) => n !== 0 && n % CONFIG.GRID !== 0,

      // LENS hook: every number another tool prints comes through here first.
      // `html` is what earlier lenses made of it, so we wrap rather than
      // replace, and the ⚠ markup now sits next to the .warn rule for it.
      annotate(html, n) {
        return this._off(n) ? `<span class="warn">${html}⚠</span>` : html;
      },
      /** Every off-grid number on one element, as [name, value] pairs. */
      _scan({ r, cs }) {
        const pad = U.fourPlain(cs, 'padding'), mar = U.fourPlain(cs, 'margin');
        const out = [];
        const check = (n, v) => { if (this._off(v)) out.push([n, v]); };
        check('w', Math.round(r.width)); check('h', Math.round(r.height));
        ['t', 'r', 'b', 'l'].forEach((k) => { check('pad-' + k, pad[k]); check('mar-' + k, mar[k]); });
        return out;
      },
      report(i) {
        const bad = this._scan(i);
        return bad.length
          ? [`  ⚠ off ${CONFIG.GRID}px grid: ${bad.map(([n, v]) => `${n}:${v}`).join(', ')}`]
          : [];
      },

      /**
       * RULE hook. This tool decorates other tools' numbers AND produces
       * findings — two roles at once, which the old one-label-per-tool
       * taxonomy made impossible for no reason but the shape of the label.
       *
       * Keyed by VALUE, not by element: one 13px used in forty places is one
       * decision someone made, not forty mistakes. That is the page-wide
       * pattern a per-element read-out could never show you — it is why this
       * belongs in a sweep and not only on a badge.
       */
      audit(i) {
        return this._scan(i).map(([n, v]) => ({
          el: i.el,
          verdict: 'fail',
          // a spacing system is a convention, not a rule anyone can be hurt
          // by breaking — it ranks below anything a reader actually suffers
          severity: 'info',
          rule: 'grid-off',
          // the VALUE, not the side it appeared on: these group by value, and
          // "pad-t ×24" would read as 24 top paddings when it is one number
          // used in twenty-four places. The sides are in the per-pin report.
          message: `${v}px is off the ${CONFIG.GRID}px grid`,
          key: `grid-off|${v}`,
        }));
      },
    });
