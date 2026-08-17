  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .warn{ color: #ffd54f; }
    `,
      id: 'grid',
      icon: '▦',
      // No number in the title: the step is the user's now, and a title baked
      // at boot would still be claiming 2px long after they picked 8.
      title: 'Grid — flag values off the spacing grid',
      startsOn: true,      // the ⚠ on a badge is what makes the read-out useful

      rules: {
        'grid-off': {
          help: 'Spacing should be a multiple of the grid step — change which ' +
                'step this checks in the panel under ⚙.',
          why: 'One-off values are how a spacing scale erodes: each looks ' +
               'harmless alone, and together they are why nothing lines up.',
        },
      },

      /**
       * LENS hook: every number another tool prints comes through here first.
       * `html` is what earlier lenses made of it, so we wrap rather than
       * replace, and the ⚠ markup sits next to the .warn rule for it.
       *
       * The judgement itself is the subject's — this decides how to SHOW an
       * off-grid number, not what one is. That is the whole point of the
       * split: the rule below reaches the same verdict through the same call.
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
        // An <svg> path has a bounding box and no authored anything. Judging
        // those turned one real signal into 2,215 findings about icon
        // geometry on a real page.
        if (!(i.el instanceof HTMLElement)) return [];
        // Width and height are the OUTPUT of layout — a text span is as wide
        // as its text, a scroll container as tall as its content. Neither is
        // a decision anyone made, and sweeping them buried the findings that
        // were. Padding, margin and gap are typed by a person; those are the
        // spacing scale.
        return Scale.scan(i, Scale.boxes())
          // and drop what layout worked out rather than what anyone chose:
          // ml-auto arrives here as margin-left: 1127px.
          //
          // ABS, because the ceiling has two sides. `v <= max` bounded the
          // positive one only, so a negative margin of any size sailed through
          // — a real page reported -1127px as off-grid while +1127px was
          // correctly ignored, and a pull-left of -240px would have read as a
          // spacing decision somebody made.
          .filter(([, v]) => Math.abs(v) <= Scale.max())
          .map(([n, v]) => ({
          el: i.el,
          verdict: 'fail',
          // a spacing system is a convention, not a rule anyone can be hurt
          // by breaking — it ranks below anything a reader actually suffers
          severity: 'info',
          rule: 'grid-off',
          // the VALUE, not the side it appeared on: these group by value, and
          // "pad-t ×24" would read as 24 top paddings when it is one number
          // used in twenty-four places. The sides are in the per-pin report.
          message: `${v}px is off the ${Scale.step()}px grid`,
          key: `grid-off|${v}`,
        }));
      },
    });
