  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .warn{ color: #ffd54f; }
    `,
      id: 'grid',
      icon: '▦',
      title: `Grid — flag values off the ${CONFIG.GRID}px grid`,
      // The ⚠ marks inside measure's badge come from U.mark(), which checks
      // whether this tool is active. Here we only add the report summary.
      report({ r, cs }) {
        const pad = U.fourPlain(cs, 'padding'), mar = U.fourPlain(cs, 'margin');
        const bad = [];
        const check = (n, v) => { if (U.offGrid(v)) bad.push(`${n}:${v}`); };
        check('w', Math.round(r.width)); check('h', Math.round(r.height));
        ['t', 'r', 'b', 'l'].forEach((k) => { check('pad-' + k, pad[k]); check('mar-' + k, mar[k]); });
        return bad.length ? [`  ⚠ off ${CONFIG.GRID}px grid: ${bad.join(', ')}`] : [];
      },
    });
