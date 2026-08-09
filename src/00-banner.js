(function () {
  'use strict';

  if (window.top !== window.self) return; // skip iframes
  if (window.__DBG_OVERLAY__) return;
  window.__DBG_OVERLAY__ = true;
