import { defineTool } from '../../core/registry.js';
import { badge, compact } from './badge.js';
import { report } from './report.js';
import { rules, auditPage } from './rule.js';
import { draw } from './draw.js';

/* index — REGISTRATION ONLY. The tool's behaviour lives in the files
   beside this one; what is declared here is identity, appearance and wiring.
   One defineTool per tool folder, which the audit counts. */
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .dup { color: #ff8a65; font-weight: 700; }
    `,
      id: 'dupid',
      // not ⧉ — the copy button already uses that glyph, and two identical
      // icons in one bar is a bar you have to read twice
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><line x1="4" x2="20" y1="9" y2="9" /><line x1="4" x2="20" y1="15" y2="15" /><line x1="10" x2="8" y1="3" y2="21" /><line x1="16" x2="14" y1="3" y2="21" /></svg>',   // lucide 'hash' (ISC)
      title: 'Duplicate ids — the same id used more than once',






      badge,
      compact,
      report,
      rules,
      auditPage,
      draw,
    });
