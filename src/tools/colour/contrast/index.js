import { defineTool } from '../../../core/registry.js';
import { badge, compact, legend } from './badge.js';
import { report } from './report.js';
import { rules, audit } from './rule.js';
import { draw } from './draw.js';
import { Colour } from './service.js';

/* index — REGISTRATION ONLY. The tool's behaviour lives in the files
   beside this one; what is declared here is identity, appearance and wiring.
   One defineTool per tool folder, which the audit counts. */
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .debug-overlay-badge .debug-overlay-ok  { color: #b5e853; }
    .debug-overlay-badge .debug-overlay-bad { color: #ff6b6b; font-weight: 700; }
    .debug-overlay-badge .debug-overlay-unk { color: #8ab4f8; font-style: italic; }
    `,
      id: 'contrast',
      family: 'colour',   // audited: must match the domain folder this sits in
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="12" cy="12" r="10" /><path d="M12 18a6 6 0 0 0 0-12v12z" /></svg>',   // lucide 'contrast' (ISC)
      // the level is the user's choice now, so it cannot be stated here
      title: 'Contrast — WCAG text contrast ratio',
      uses: [Colour],   // its settings are Colour's, and belong on its own menu



      badge,



      legend,
      compact,
      report,
      rules,
      audit,
      draw,
    });
