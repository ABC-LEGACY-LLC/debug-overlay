  /**
   * INSPECT half of what used to be `contrast`. It states the ratio for the
   * element under the cursor; the rule beside it judges every element on the
   * page. Both call Colour.measure(), so the level they are judged against is
   * one value, not two that can drift apart — a badge reading AA✓ over a
   * finding reading AAA✗ is the failure this arrangement rules out.
   */
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .ok  { color: #b5e853; }
    .dbgov-badge .bad { color: #ff6b6b; font-weight: 700; }
    .dbgov-badge .unk { color: #8ab4f8; font-style: italic; }
    `,
      id: 'colour-readout',
      icon: '◐',
      // the level is the user's choice, so it cannot be stated here
      title: 'Contrast — the WCAG ratio for what you are pointing at',

      badge(i) {
        const c = Colour.measure(i);
        if (!c) return null;
        // say so on hover too — silence here is what taught the eye to trust
        // a page the tool had not actually checked
        if (c.unknown) return `<span class="unk">contrast ?</span>`;
        const cls = c.pass ? 'ok' : 'bad';
        return `<span class="${cls}">${c.ratio.toFixed(2)}:1 ${c.level}${c.pass ? '✓' : '✗'}</span>`;
      },
      compact(i) {
        const c = Colour.measure(i);
        if (!c || c.unknown || c.pass) return null;   // quiet unless it fails
        return `<span class="bad">${c.ratio.toFixed(1)}:1 ✗</span>`;
      },
      report(i) {
        const c = Colour.measure(i);
        if (!c) return [];
        if (c.unknown) return [`  contrast: not measured — ${Colour.why[c.unknown]}`];
        return [`  contrast: ${c.ratio.toFixed(2)}:1 vs required ${c.need} (${c.isLarge ? 'large' : 'normal'} text) → ${c.pass ? 'PASS' : 'FAIL'}`];
      },
    });
