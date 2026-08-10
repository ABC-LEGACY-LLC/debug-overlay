  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .warn{ color: #ffd54f; }
    `,
      id: 'grid',
      kind: 'lens',
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
      report({ r, cs }) {
        const pad = U.fourPlain(cs, 'padding'), mar = U.fourPlain(cs, 'margin');
        const bad = [];
        const check = (n, v) => { if (this._off(v)) bad.push(`${n}:${v}`); };
        check('w', Math.round(r.width)); check('h', Math.round(r.height));
        ['t', 'r', 'b', 'l'].forEach((k) => { check('pad-' + k, pad[k]); check('mar-' + k, mar[k]); });
        return bad.length ? [`  ⚠ off ${CONFIG.GRID}px grid: ${bad.join(', ')}`] : [];
      },
    });
