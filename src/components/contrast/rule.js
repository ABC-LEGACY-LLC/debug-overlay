import { Colour } from './service.js';

// What each rule IS, separate from what any one element measured. The
// instance message says 2.76:1; this says why, and what to do.
export const rules = {
        'contrast-aa': {
          help: 'Body text needs 4.5:1 against its background, or 7:1 at AAA; ' +
                '3:1 once it is 24px or 18.66px bold, or 4.5:1 at AAA. Which ' +
                'level this checks is in the panel under ⚙.',
          why: 'Below that, text stops being readable in bright light, on a bad ' +
               'screen, or to anyone with reduced contrast sensitivity — which ' +
               'is most people eventually.',
          docs: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum',
        },
};

// RULE hook: the verdict badge() shows, as data instead of prose. A
// passing element produces nothing — a findings list is a list of
// problems, which is what lets the same hook run over a whole page.
export function audit(i) {
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
}
