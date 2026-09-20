import { defineTool } from '../../../core/registry.js';
import { badge, compact, legend, gestures } from './badge.js';
import { reportTail } from './report.js';
import { draw } from './draw.js';
import { watch, unwatch } from './follow.js';
import { prepare } from './sample.js';

/* index — REGISTRATION ONLY. The tool's behaviour lives in the files beside
   this one; what is declared here is identity, appearance and wiring. */
defineTool({
  css: `
  .debug-overlay-paint-dot { position: fixed; pointer-events: none;
    border-radius: 50%; border: 2px solid var(--debug-overlay-info);
    box-shadow: 0 0 0 1px rgba(0,0,0,.6); }
  .debug-overlay-paint-box { outline: 2px dashed var(--debug-overlay-info); }
  .debug-overlay-badge .debug-overlay-paint-yes { color: var(--debug-overlay-accent); font-weight: 700; }
  .debug-overlay-badge .debug-overlay-paint-no  { color: var(--debug-overlay-warn); font-weight: 700; }
  .debug-overlay-badge .debug-overlay-paint-k   { color: var(--debug-overlay-muted); }
  `,
  id: 'paint',
  family: 'colour',   // audited: must match the domain folder this sits in
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>',   // lucide 'pipette' (ISC)
  title: 'Paint — which element actually paints the pixel you clicked',
  /* NOT startsOn, and honestly off for COST as well as caution: armed, it
     listens to every pointer move and rebuilds the stack under the cursor.
     A meter you did not ask for is overhead pretending to be help. */

  watch,
  unwatch,
  prepare,
  /**
   * THE ONE SETTING, and it is a privacy decision rather than a preference.
   *
   * Everything else this tool prints is derived from the DOM. This reads the
   * PIXEL, which means capturing the visible tab — and the pages it runs on
   * carry names, locations and phone numbers. So it is off until somebody
   * says otherwise, the label says what it does rather than what it gives,
   * and the capture happens only on an explicit ⧉ copy: a hover never takes
   * one, whatever is armed.
   *
   * Filed under INSPECT, because it changes what you are SHOWN about the
   * pixel rather than what counts as a problem — so turning it on must not
   * throw away a page audit that was judged under the same rules.
   */
  options() {
    return [
      { key: 'sample', label: 'Sample the real pixel — captures the tab on ⧉',
        def: false, type: 'toggle', affects: 'inspect' },
    ];
  },
  badge,
  compact,
  legend,
  gestures,
  draw,
  reportTail,
});
