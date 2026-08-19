import { TOOLS } from '../core/registry.js';
import { CSS } from './styles.js';

/**
 * The DOM is not built at import time. Module evaluation order belongs to the
 * import graph now, and the sheets loop below needs every tool registered —
 * so BOOT calls initDom() after the manifest's side effects have run, exactly
 * where the old concatenation order put this file.
 */
export let root;
export let layer;
export function initDom() {
  /* ======================================================================
     DOM
     ====================================================================== */
  root = document.createElement('div');
  root.id = '__dbgov-root';
  /* NOT aria-hidden. This root holds 13 tabbable buttons, so hiding it told
     assistive tech the subtree does not exist while keyboard focus could still
     land inside it — axe's aria-hidden-focus, WCAG 4.1.2. The decorative
     layers get it instead (see the layer below and .dbgov-box/.dbgov-badge/
     .dbgov-flag, all pointer-events:none), and the whole root goes `inert`
     while powered off, which hides it from AT AND takes it out of the tab
     order — the thing aria-hidden alone could never do. */
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Debug overlay');
  /**
   * One sheet per tool, plus the core — not one sheet for all of them.
   *
   * A CSS parser raises nothing when it gives up: it drops the broken rule
   * and everything after it in the same sheet. Concatenated, that meant an
   * unclosed paren in an early tool silently cost every later tool its
   * styling. That shipped once, and cost grid and contrast theirs entirely.
   * Separate sheets make the blast radius the author's own file.
   */
  const sheet = (css, owner) => {
    const s = document.createElement('style');
    if (owner) s.dataset.tool = owner;   // so a broken one can be named
    s.textContent = css;
    root.append(s);
  };
  sheet(CSS);
  for (const t of TOOLS) if (t.css) sheet(t.css, t.id);
  layer = document.createElement('div');
  // everything painted onto the page is decoration: no text an AT user needs,
  // and already unclickable
  layer.setAttribute('aria-hidden', 'true');
  root.append(layer);
  document.documentElement.append(root);

}
