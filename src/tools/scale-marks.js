  /**
   * INSPECT half of what used to be `grid`. It shows you an off-grid number
   * where you are already looking; the rule beside it judges the whole page.
   *
   * Neither owns the step — `Scale` does. That is what makes this split safe:
   * both halves reach the same verdict through the same call, so the ⚠ on a
   * badge can never disagree with the finding in a sweep. Splitting them while
   * each held its own copy of `step` was the thing that would have broken.
   */
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .warn{ color: #ffd54f; }
    `,
      id: 'scale-marks',
      icon: '⚠',
      // No number in the title: the step is the user's, and a title baked at
      // boot would still be claiming 2px long after they picked 8.
      title: 'Grid marks — flag numbers that are off the spacing grid',
      startsOn: true,      // the ⚠ is what makes the read-out worth reading

      /**
       * LENS hook: every number another tool prints comes through here first.
       * `html` is what earlier lenses made of it, so we wrap rather than
       * replace, and the ⚠ markup sits next to the .warn rule for it.
       */
      annotate(html, n) {
        return Scale.off(n) ? `<span class="warn">${html}⚠</span>` : html;
      },

      report(i) {
        const bad = Scale.scan(i, true);
        return bad.length
          ? [`  ⚠ off ${Scale.step()}px grid: ` +
             `${bad.map(([n, v]) => `${n}:${v}`).join(', ')}`]
          : [];
      },
    });
