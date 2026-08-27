import { defineTool } from '../../core/registry.js';
import { badge, compact, legend } from './badge.js';
import { report } from './report.js';
import { rules, audit } from './rule.js';
import { draw } from './draw.js';

/* index — REGISTRATION ONLY. Behaviour lives in the files beside this one. */
defineTool({
  css: `
  .debug-overlay-badge .debug-overlay-a11y-k {
    color: var(--debug-overlay-muted); margin-right: 6px;
  }
  .debug-overlay-badge .debug-overlay-a11y-src {
    color: var(--debug-overlay-muted); margin-left: 6px; font-size: 10px;
  }
  .debug-overlay-badge .debug-overlay-a11y-none,
  .debug-overlay-badge .debug-overlay-a11y-no { color: #ff8a65; font-weight: 700; }
  .debug-overlay-badge .debug-overlay-a11y-yes { color: var(--debug-overlay-accent); }
  `,
  id: 'a11y',
  // lucide 'accessibility' (ISC)
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/></svg>',
  // what this tool EXAMINES — it owns its subject alone, so it says so here
  subject: 'a11y',
  title: 'Accessibility — the name, role and keyboard reach of what you point at',
  /* NOT startsOn. The other read-outs describe what a page LOOKS like, which
     is what someone reaches for the overlay to see. This answers a question
     you have to think to ask, and its badge rows would otherwise crowd every
     hover for people who never asked it. The RULES still run in every sweep
     regardless — arming decides what is drawn, never what is checked. */
  badge,
  legend,
  compact,
  report,
  rules,
  audit,
  draw,
  options() {
    return [
      { key: 'name', label: 'Accessible name', def: true,
        type: 'toggle', affects: 'inspect' },
      { key: 'role', label: 'Role', def: true,
        type: 'toggle', affects: 'inspect' },
      { key: 'focus', label: 'Keyboard reach', def: true,
        type: 'toggle', affects: 'inspect' },
    ];
  },
});
