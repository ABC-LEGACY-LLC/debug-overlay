import { A11y } from './service.js';

/**
 * The report line. An audit finding has to be quotable — a developer reads
 * "no accessible name" and needs to know what the element IS before they can
 * fix it, which is exactly the three facts the badge shows.
 */
export function report({ el, cs }) {
  const a = A11y.of(el, cs);
  const name = a.name ? `"${a.name}"` : (a.unsure ? '(not determined)' : '(none)');
  return [`a11y: name ${name}${a.from ? ` via ${a.from}` : ''} · ` +
          `role ${a.role || '—'} · ` +
          `${a.focusable ? 'in the tab order' : 'not in the tab order'}`];
}
