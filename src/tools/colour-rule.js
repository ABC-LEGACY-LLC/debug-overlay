  /**
   * DETECT half of what used to be `contrast`, and the half that draws where
   * the failures are.
   *
   * Three answers, not two. An element with no text of its own has no contrast
   * to have — that is silence, correctly. A colour space that cannot be read,
   * a gradient behind the text, a missing canvas: those are REVIEWS, each
   * carrying a reason, because folding them in with the passes let a page of
   * unreadable text audit clean.
   */
  defineTool({
    css: `
    /* where the findings actually are. dashed, never filled: a mark points at
       a problem, it must not hide the thing it is pointing at */
    .dbgov-flag { outline-offset: 1px; }
    .dbgov-flag.error  { outline: 2px dashed #ff6b6b; }
    .dbgov-flag.warn   { outline: 2px dashed #ffd54f; }
    .dbgov-flag.info   { outline: 2px dashed #9ad0ff; }
    .dbgov-flag.review { outline: 2px dotted #8ab4f8; }
    `,
      id: 'colour-rule',
      icon: '◑',
      title: 'Contrast rule — audit the whole page for unreadable text',

      rules: {
        'contrast-aa': {
          help: 'Body text needs 4.5:1 against its background, or 7:1 at AAA; ' +
                '3:1 once it is 24px or 18.66px bold, or 4.5:1 at AAA. Which ' +
                'level this checks is in the panel under ⚙.',
          why: 'Below that, text stops being readable in bright light, on a bad ' +
               'screen, or to anyone with reduced contrast sensitivity — which ' +
               'is most people eventually.',
          docs: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum',
        },
      },

      // RULE hook: the verdict badge() shows, as data instead of prose. A
      // passing element produces nothing — a findings list is a list of
      // problems, which is what lets the same hook run over a whole page.
      audit(i) {
        const c = Colour.measure(i);
        if (!c) return [];              // no text of its own — nothing to judge
        if (c.unknown) return [{
          el: i.el,
          // Not a failure: a failure is a fact, this is an absence of one. It
          // used to be folded into the same empty array as "passed", so a page
          // of gradient-backed text audited clean. Whatever else this tool
          // gets wrong, it must not report a verdict it never reached.
          verdict: 'review',
          severity: 'info',
          rule: 'contrast-aa',
          message: `not measured — ${Colour.why[c.unknown]}`,
          // one row per reason, page-wide: 200 elements over one gradient are
          // one thing to go and look at, not 200
          key: `contrast-aa|review|${c.unknown}`,
        }];
        if (c.pass) return [];
        return [{
          el: i.el,
          verdict: 'fail',
          // below the large-text floor nobody can read it; above it, a near
          // miss that a size or weight change might fix
          severity: c.ratio < c.want.large ? 'error' : 'warn',
          rule: 'contrast-aa',
          message: `${c.ratio.toFixed(2)}:1 — ${c.level} needs ${c.need} for ` +
                   `${c.isLarge ? 'large' : 'normal'} text`,
          // one line per colour pair, not per element: a 40-link nav is ONE
          // problem. Only the rule knows what "the same problem" means.
          key: `contrast-aa|${Colour.rgb(c.fg)}|${Colour.rgb(c.bg)}|${c.isLarge}`,
        }];
      },
      // Findings become places on the page, not just rows in a list. `found`
      // is this tool's own, handed over by the renderer; the layer is cleared
      // every frame, so there is nothing to undo and nothing of anyone else's
      // to step on.
      draw({ layer, Place, found }) {
        for (const f of found.slice(0, CONFIG.MARK_LIMIT)) {
          if (!document.contains(f.el)) continue;   // the page moved on
          // No size gate: the sweep already dropped display:none and
          // visibility:hidden, and a degenerate box draws a degenerate
          // outline — invisible, and cheaper than the branch that skips it.
          const r = f.el.getBoundingClientRect();
          const box = document.createElement('div');
          // review is not failure, and must not be painted as though it were
          box.className = 'dbgov-box dbgov-flag ' +
                          (f.verdict === 'review' ? 'review' : f.severity);
          Place.put(box, r.left, r.top, r.width, r.height);
          layer.append(box);
        }
      },
    });
