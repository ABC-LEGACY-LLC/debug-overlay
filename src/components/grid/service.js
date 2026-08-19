import { CONFIG } from '../../core/config.js';
import { Tools, defineSubject } from '../../core/registry.js';
import { U } from '../../core/utils.js';
  /**
   * THE SPACING SCALE — what counts as "on the grid", and the settings for it.
   *
   * These moved out of the grid tool because they were never really its. A
   * step of 2px is a fact about the project you are looking at; the ⚠ on a
   * badge and the finding in a sweep are two things that consult it. Leaving
   * the setting on one of them would mean the other could not see it, and a
   * split that gave each its own copy would let a badge say a value is fine
   * while the audit says it is not.
   */
  export const Scale = defineSubject({
    id: 'scale',
    was: 'grid',   // its settings lived under this id before the subject existed
    icon: '▦',

    options() {
      return [
        // 2, not 4, because that is what the scale in front of us actually is:
        // Tailwind's default spacing has half-steps (0.5 = 2px, 1.5 = 6px) and
        // a real page used them 2,681 times. A rule has to check the scale a
        // project HAS; making the project match the rule is the wrong way round.
        { key: 'step', label: 'Grid step', def: CONFIG.GRID,
          values: [1, 2, 4, 8], suffix: 'px', affects: 'detect' },
        // Where a spacing token stops and layout arithmetic begins.
        // getComputedStyle resolves `margin: auto` to the pixels it worked out
        // — 1127px on a real page — and nothing distinguishes that from a value
        // somebody typed. Nobody types 1127px.
        { key: 'max', label: 'Ignore above', def: CONFIG.GRID_MAX,
          type: 'number', min: 8, max: 2000, step: 8, suffix: 'px', affects: 'detect' },
        // OFF, and it stays off by default: width and height are what layout
        // produced, not what anyone typed, and judging them turned one real
        // signal into 2,215 findings about icon geometry on a real page.
        { key: 'boxes', label: 'Judge width & height', def: false,
          type: 'toggle', affects: 'detect' },
      ];
    },

    step() { return Tools.setting(this, 'step'); },
    max() { return Tools.setting(this, 'max'); },
    boxes() { return Tools.setting(this, 'boxes'); },

    /** 0 is never off the grid, or every padding:0 would light up. */
    off(n) {
      const step = this.step();
      return n !== 0 && n % step !== 0;
    },

    /**
     * Off the grid AND close enough to be something somebody typed.
     *
     * The ceiling used to live only in the rule, so a resolved `margin: auto`
     * of 1127px got a ⚠ on the badge and no finding in the sweep — the badge
     * and the audit disagreeing about one number, which is the exact
     * contradiction this subject exists to make impossible. Every consumer
     * asks this, so there is one answer.
     */
    judges(n) {
      return this.off(n) && Math.abs(n) <= this.max();
    },

    /**
     * The nearest value that WOULD pass — the RECOMMENDATION facet's answer.
     *
     * On the subject, not in the lens, for the same reason judges() is: the
     * ⚠ and the →8 must come from one place or they could disagree about the
     * same number. Half away from zero, matching U.px, so 7 on a 2px step
     * suggests 8 and -7 suggests -8 — a margin and its mirror image get
     * mirror advice.
     */
    nearest(n) {
      const step = this.step();
      return Math.sign(n) * Math.round(Math.abs(n) / step) * step;
    },

    /**
     * Off-grid numbers on one element, as [name, value] pairs. `boxes` adds
     * width and height — true when somebody pointed at this element and asked,
     * false when a sweep is judging the page.
     */
    scan(info, boxes) {
      // NOT `scan({ r, cs }, …)`. `r` on U.info is a getter that runs
      // getBoundingClientRect, and destructuring it in the parameter list
      // evaluates it whether or not the body ever wants it — so the page sweep
      // was forcing a layout read for every visible element to answer a
      // question about padding. Measured: 62 rect reads over 60 elements, with
      // `boxes` off, which is the default. Read it inside the branch that uses
      // it and a colours-only pass pays nothing.
      const cs = info.cs;
      const pad = U.fourPlain(cs, 'padding'), mar = U.fourPlain(cs, 'margin');
      const out = [];
      // Spacing carries the ceiling; a box does not. `max` exists to keep
      // resolved layout arithmetic out of a list of typed spacing tokens, and
      // at its 96px default it silently cancelled the "Judge width & height"
      // toggle outright — almost every real element is wider than that, so
      // arming the control produced nothing at all and no setting said why.
      const check = (n, v) => { if (this.judges(v)) out.push([n, v]); };
      if (boxes) {
        const r = info.r;
        const box = (n, v) => { if (this.off(v)) out.push([n, v]); };
        box('w', Math.round(r.width)); box('h', Math.round(r.height));
      }
      ['t', 'r', 'b', 'l'].forEach((k) => { check('pad-' + k, pad[k]); check('mar-' + k, mar[k]); });
      // BOTH axes. `rowGap || columnGap || gap` is a first-truthy chain, so a
      // non-zero row gap won the test and the column gap was never looked at —
      // an off-grid column gap beside an on-grid row gap was invisible to the
      // badge, the report and the sweep alike. Named per axis too, so the
      // report can say which one it meant.
      const row = U.px(cs.rowGap), col = U.px(cs.columnGap);
      if (row || col) {
        if (row) check('gap-row', row);
        if (col) check('gap-col', col);
      } else {
        // jsdom, and anything else that leaves the shorthand unresolved
        const gap = U.px(cs.gap);
        if (gap) check('gap', gap);
      }
      return out;
    },
  });
