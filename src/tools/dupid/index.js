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
      icon: '⌗',
      title: 'Duplicate ids — the same id used more than once',






      badge,
      compact,
      report,
      rules,
      auditPage,
      draw,
    });
