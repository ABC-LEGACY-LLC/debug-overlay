import { defineTool } from '../../core/registry.js';
import { intercept, draw, report, options, gestures } from './act.js';

/* index — REGISTRATION ONLY. The tool's behaviour lives in the files
   beside this one; what is declared here is identity, appearance and wiring.
   One defineTool per tool folder, which the audit counts. */
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-picked { outline: 2px solid #b5e853; outline-offset: 1px;
      background: rgba(181,232,83,.12); }
    `,
      id: 'pick',
      icon: '⌖',
      title: 'Pick — Ctrl+click (⌘+click) copies what you clicked',
      // OFF by default: it takes over a click, and a tool that changes what
      // clicking does should be something you asked for.






      intercept,
      draw,
      report,
      options,
      gestures,
    });
