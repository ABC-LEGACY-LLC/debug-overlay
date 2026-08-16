(function () {
  'use strict';

  /**
   * NOT `window.top !== window.self`. With @grant the manager runs this in a
   * sandbox where `window` is a wrapper, and that comparison can be true in
   * the TOP frame — which would disable the overlay everywhere, silently, on
   * every site. frameElement is null at top level in every context, so this
   * cannot misfire in the one direction that matters. @noframes is what keeps
   * us out of cross-origin frames, where frameElement reads null anyway.
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
  if (document.getElementById('__dbgov-root')) return;
  if (window.__DBG_OVERLAY__) return;
  window.__DBG_OVERLAY__ = true;
