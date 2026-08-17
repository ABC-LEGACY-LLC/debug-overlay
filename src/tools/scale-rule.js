  /**
   * DETECT half of what used to be `grid`. Same question as the marks beside
   * it, asked of every visible element instead of the one under the cursor.
   *
   * The page-wide view is not the per-element one repeated: keyed by VALUE,
   * one 13px used in forty places is one decision somebody made, not forty
   * mistakes. That pattern is invisible from a badge, and it is the reason
   * this half is worth having at all.
   */
  defineTool({
      id: 'scale-rule',
      icon: '▦',
      title: 'Grid rule — audit the whole page against the spacing grid',

      rules: {
        'grid-off': {
          help: 'Spacing should be a multiple of the grid step — change which ' +
                'step this checks in the panel under ⚙.',
          why: 'One-off values are how a spacing scale erodes: each looks ' +
               'harmless alone, and together they are why nothing lines up.',
        },
      },

      audit(i) {
        // An <svg> path has a bounding box and no authored anything. Judging
        // those turned one real signal into 2,215 findings about icon geometry
        // on a real page.
        if (!(i.el instanceof HTMLElement)) return [];
        // Width and height are the OUTPUT of layout — a text span is as wide as
        // its text, a scroll container as tall as its content. Neither is a
        // decision anyone made, and sweeping them buried the findings that
        // were. Padding, margin and gap are typed by a person; those are the
        // spacing scale.
        return Scale.scan(i, Scale.boxes())
          // and drop what layout worked out rather than what anyone chose:
          // ml-auto arrives here as margin-left: 1127px
          .filter(([, v]) => v <= Scale.max())
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
