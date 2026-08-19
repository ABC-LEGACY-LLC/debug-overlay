import { defineTool } from '../../core/registry.js';
import { badge, compact } from './badge.js';
import { annotate } from './lens.js';
import { report } from './report.js';
import { rules, audit } from './rule.js';
import { draw } from './draw.js';
import { options } from './options.js';
import { Scale } from './service.js';

/* index — REGISTRATION ONLY. The tool's behaviour lives in the files
   beside this one; what is declared here is identity, appearance and wiring.
   One defineTool per tool folder, which the audit counts. */
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .warn{ color: #ffd54f; }
    `,
      id: 'grid',
      icon: '▦',
      // No number in the title: the step is the user's now, and a title baked
      // at boot would still be claiming 2px long after they picked 8.
      title: 'Grid — flag values off the spacing grid',
      startsOn: true,      // the ⚠ on a badge is what makes the read-out useful
      uses: [Scale],   // its settings are Scale's, and belong on its own menu








      badge,
      compact,
      annotate,
      report,
      rules,
      audit,
      draw,
      options,
    });
