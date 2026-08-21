// ==UserScript==
// @name         dbgov perf probe
// @namespace    alonur.tools
// @version      0.1
// @description  Phase-0 probe: which performance APIs actually fire under this manager's sandbox, on this browser, on this page. Install temporarily, read the box, uninstall.
// @match        *://*/*
// @grant        GM_getValue
// @noframes     true
// ==/UserScript==

/* Not part of the bundle — a throwaway instrument. dbgov's perf tool assumes
   these APIs behave under the Tampermonkey sandbox; this is the assumption,
   measured. The @grant matters: it forces the same sandbox dbgov runs in, so
   what fires here fires there. */
(() => {
  'use strict';
  const out = {};
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483647;' +
    'background:#111;color:#9f9;font:11px/1.6 monospace;padding:10px 14px;' +
    'border-radius:8px;max-width:340px;pointer-events:auto;white-space:pre';
  const paint = () => {
    box.textContent = 'dbgov perf probe\n' +
      Object.entries(out).map(([k, v]) => `${v ? '✓' : '✗'} ${k}${typeof v === 'string' ? ' — ' + v : ''}`).join('\n') +
      '\n(click to dismiss)';
  };
  box.onclick = () => box.remove();

  const types = (typeof PerformanceObserver !== 'undefined' &&
                 PerformanceObserver.supportedEntryTypes) || [];
  out['PerformanceObserver'] = types.length ? types.join(',').slice(0, 60) : false;
  out['long-animation-frame supported'] = types.includes('long-animation-frame');
  out['longtask supported'] = types.includes('longtask');
  out['event timing supported'] = types.includes('event');
  out['layout-shift supported'] = types.includes('layout-shift');
  out['rAF ticks'] = false;
  out['LoAF FIRES here'] = false;
  out['longtask FIRES here'] = false;

  // do observers actually DELIVER in this realm? Provoke a 120ms block.
  try {
    if (types.includes('long-animation-frame')) {
      new PerformanceObserver((l) => {
        const e = l.getEntries()[0];
        out['LoAF FIRES here'] = e ? `dur ${Math.round(e.duration)}ms, scripts: ${e.scripts?.length ?? 'none'}` : true;
        paint();
      }).observe({ type: 'long-animation-frame' });
    }
    if (types.includes('longtask')) {
      new PerformanceObserver((l) => {
        out['longtask FIRES here'] = `dur ${Math.round(l.getEntries()[0]?.duration || 0)}ms`;
        paint();
      }).observe({ type: 'longtask' });
    }
  } catch (err) {
    out['observer threw'] = String(err).slice(0, 60);
  }
  requestAnimationFrame(() => { out['rAF ticks'] = true; paint(); });

  const start = () => {
    document.body.append(box);
    paint();
    // the provoked block, after paint so the box exists
    setTimeout(() => { const t0 = Date.now(); while (Date.now() - t0 < 120); }, 300);
  };
  document.body ? start() : addEventListener('DOMContentLoaded', start);
})();
