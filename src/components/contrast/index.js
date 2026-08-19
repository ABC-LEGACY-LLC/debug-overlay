import { defineTool } from '../../core/registry.js';
import { badge, compact } from './badge.js';
import { report } from './report.js';
import { rules, audit } from './rule.js';
import { draw } from './draw.js';
import { Colour } from './service.js';

/* index — REGISTRATION ONLY. The component's behaviour lives in the files
   beside this one; what is declared here is identity, appearance and wiring.
   One defineTool per component folder, which the audit counts. */
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .ok  { color: #b5e853; }
    .dbgov-badge .bad { color: #ff6b6b; font-weight: 700; }
    .dbgov-badge .unk { color: #8ab4f8; font-style: italic; }
    `,
      id: 'contrast',
      icon: '◐',
      // the level is the user's choice now, so it cannot be stated here
      title: 'Contrast — WCAG text contrast ratio',
      uses: [Colour],   // its settings are Colour's, and belong on its own menu



      badge,
      compact,
      report,
      rules,
      audit,
      draw,
    });
