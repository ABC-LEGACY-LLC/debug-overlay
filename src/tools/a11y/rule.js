import { A11y } from './service.js';

/* What each rule IS, apart from what any one element measured. */
export const rules = {
  'a11y-name': {
    help: 'Anything reachable by Tab must have an accessible name — from its ' +
          'own text, an aria-label, a <label>, or alt text.',
    why: 'A screen reader announces the name and nothing else. Without one it ' +
         'says "button", and the only way to find out which button is to ' +
         'press it and see what happens.',
    docs: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value',
  },
  'a11y-hidden-focus': {
    help: 'A focusable element must not sit inside aria-hidden="true".',
    why: 'It stays in the tab order while being absent from the accessibility ' +
         'tree, so keyboard focus lands on something the screen reader cannot ' +
         'describe — the cursor vanishes and nothing says where it went.',
    docs: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value',
  },
  'a11y-img-alt': {
    help: 'Every <img> needs an alt attribute. Decorative images take alt="".',
    why: 'With no attribute at all a screen reader falls back to the file ' +
         'name, so the page reads out "IMG_20240817_final_2.png". alt="" is ' +
         'the way to say an image carries nothing.',
    docs: 'https://www.w3.org/WAI/tutorials/images/decision-tree/',
  },
};

/**
 * RULE hook — per element, over whatever the sweep hands it.
 *
 * Every branch below asks about ONE element, which is what makes it safe to
 * run over a whole page. The relational question — is this name unique among
 * its siblings — is a different hook and is not asked here.
 */
export function audit(i) {
  const el = i.el;
  const out = [];
  const a = A11y.of(el, i.cs);

  if (el.tagName === 'IMG' && el.getAttribute('alt') === null) {
    out.push({
      el, verdict: 'fail', severity: 'warn', rule: 'a11y-img-alt',
      message: 'no alt attribute — decorative images need alt=""',
      // one line for the whole page: a gallery of 200 images missing alt is
      // one thing the author has to decide, not 200
      key: 'a11y-img-alt',
    });
  }

  if (!a.focusable) return out;   // the two rules below are about the tab order

  if (A11y.hidden(el)) {
    out.push({
      el, verdict: 'fail', severity: 'error', rule: 'a11y-hidden-focus',
      message: `${el.tagName.toLowerCase()} is in the tab order inside ` +
               'aria-hidden="true"',
      key: 'a11y-hidden-focus',
    });
  }

  if (a.unsure) {
    out.push({
      el, verdict: 'review', severity: 'info', rule: 'a11y-name',
      message: `name not determined — ${A11y.why[a.unsure]}`,
      // grouped by REASON, page-wide — the same discipline contrast uses for
      // its unmeasurable colours
      key: `a11y-name|review|${a.unsure}`,
    });
  } else if (!a.name) {
    out.push({
      el, verdict: 'fail', severity: 'error', rule: 'a11y-name',
      message: `${a.role || el.tagName.toLowerCase()} with no accessible name`,
      // by ROLE, not by element: a toolbar of 40 unnamed icon buttons is one
      // problem with one fix
      key: `a11y-name|${a.role || el.tagName.toLowerCase()}`,
    });
  }
  return out;
}
