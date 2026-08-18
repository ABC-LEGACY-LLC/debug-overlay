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
      uses: [Scale],   // its settings are Scale's, and belong on its own menu

      rules: {
        'grid-off': {
          help: 'Spacing should be a multiple of the grid step — change which ' +
                'step this checks in the panel under ⚙.',
          why: 'One-off values are how a spacing scale erodes: each looks ' +
               'harmless alone, and together they are why nothing lines up.',
        },
      },

      /**
       * ITS OWN SURFACE — the thing this tool was missing.
       *
       * annotate() below is a LENS: it decorates numbers other tools print, so
       * with nothing else armed it had nothing to decorate and this tool showed
       * absolutely nothing. Correct, silent and indistinguishable from broken —
       * a measured fact: armed alone it produced zero badges and zero ⚠.
       *
       * A component has to be worth arming by itself. This says what is off the
       * grid without needing anyone else to have printed it first, and stays
       * useful next to measure because it summarises where measure enumerates.
       */
      badge(i) {
        const bad = Scale.scan(i, true);
        if (!bad.length) return null;
        // by value, not by side: 7px used on three edges is one decision
        const vals = [...new Set(bad.map(([, v]) => v))];
        return `<span class="warn">⚠ ${vals.join(' ')} off ${Scale.step()}px</span>`;
      },
      compact(i) {
        const bad = Scale.scan(i, true);
        return bad.length ? `<span class="warn">⚠${bad.length}</span>` : null;
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
        return Scale.judges(n) ? `<span class="warn">${html}⚠</span>` : html;
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
        // No filter here any more. The ceiling — and the fact that it has two
        // sides, and that it must not apply to a width or a height — all
        // belong to Scale.judges, so the badge and this reach the same verdict
        // through the same call and cannot disagree about one number.
        return Scale.scan(i, Scale.boxes())
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
