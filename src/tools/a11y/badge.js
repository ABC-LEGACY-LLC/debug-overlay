import { Tools } from '../../core/registry.js';
import { A11y } from './service.js';

/**
 * The three facts on the element you are pointing at, whether or not
 * anything is wrong with them.
 *
 * This is the INSPECT half, and it is the half DevTools already does well —
 * except that it does it one element at a time, in a panel, after you have
 * clicked into a tree. Here it is on the element, under the cursor, with no
 * panel to switch to. A name is also the thing most often assumed rather
 * than checked: `<button><svg/></button>` looks finished on screen.
 */
// `this` is the tool when a hook is called, so settings are read through it
export function badge({ el, cs }) {
  const a = A11y.of(el, cs);
  const rows = [];
  if (Tools.setting(this, 'name')) {
    rows.push(a.name
      ? `<span class="debug-overlay-a11y-k">name</span> ${esc(a.name)}` +
        `<span class="debug-overlay-a11y-src">${a.from || ''}</span>`
      : `<span class="debug-overlay-a11y-k">name</span>` +
        `<span class="debug-overlay-a11y-none">${a.unsure ? 'not determined' : 'none'}</span>`);
  }
  if (Tools.setting(this, 'role')) {
    rows.push(`<span class="debug-overlay-a11y-k">role</span> ${esc(a.role || '—')}`);
  }
  if (Tools.setting(this, 'focus')) {
    rows.push(`<span class="debug-overlay-a11y-k">tab</span>` +
      `<span class="${a.focusable ? 'debug-overlay-a11y-yes' : 'debug-overlay-a11y-no'}">` +
      `${a.focusable ? 'reachable' : 'not in tab order'}</span>`);
  }
  return rows.length ? rows.join('<br>') : null;
}

/** Compact: only the fact that is usually wrong, and only when it is. */
export function compact({ el, cs }) {
  const a = A11y.of(el, cs);
  if (!a.focusable || a.name || a.unsure) return null;
  return `<span class="debug-overlay-a11y-no">⌨ no name</span>`;
}

export function legend() {
  return [{ mark: '⌨ no name',
            means: 'red: reachable by Tab, and a screen reader has nothing to announce' }];
}

/** Text goes in as text — a page-authored name is not ours to trust. */
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
