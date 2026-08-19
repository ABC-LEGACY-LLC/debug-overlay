import { Scale } from './service.js';

export const rules = {
        'grid-off': {
          help: 'Spacing should be a multiple of the grid step — change which ' +
                'step this checks in the panel under ⚙.',
          why: 'One-off values are how a spacing scale erodes: each looks ' +
               'harmless alone, and together they are why nothing lines up.',
        },
};

export function audit(i) {
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
}
