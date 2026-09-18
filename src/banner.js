/* NOT a module and NOT bundled: build.js injects this text at the very top
   of the output IIFE, so its early returns abort the whole overlay before a
   single module evaluates. It cannot be an import — imports hoist, so a guard
   inside a module would run after everything it was guarding. */
  /**
   * NOT `window.top !== window.self`. That comparison can be true in the TOP
   * frame wherever `window` is a wrapper rather than the page's own — which
   * would disable the overlay everywhere, silently, on every site. It was the
   * userscript manager's sandbox that made it true here; the rule outlived
   * that gate because the failure it prevents is silent and total, and
   * frameElement is simply the correct question: null at top level in every
   * context, so it cannot misfire in the one direction that matters. The
   * manifest keeps us out of sub-frames to begin with (content_scripts
   * defaults to the top frame), the way @noframes used to.
   */
  let framed = false;
  try { framed = !!window.frameElement; } catch { framed = true; }
  if (framed) return;

  /**
   * Ask the DOCUMENT first. A re-injection on soft navigation can arrive in a
   * fresh sandbox — a new `window`, the same page — and a window flag alone
   * would have missed that and built a second panel fighting the first for the
   * same hotkey. The flag stays as the cheap path and as what the tests read.
   */
  /* BOTH spellings, deliberately. During an update an OLD instance can be
     live in the page while a new build injects into a fresh sandbox — the
     flag is gone but the old root is not. Looking only for the new id would
     miss it and build a second panel fighting the first for the hotkey. The
     legacy names cost two comparisons and can be dropped once no install
     predates the rename. */
  if (document.getElementById('__debug-overlay-root')) return;
  if (document.getElementById('__dbgov-root')) return;
  if (window.__DEBUG_OVERLAY__ || window.__DBG_OVERLAY__) return;
  window.__DEBUG_OVERLAY__ = true;
