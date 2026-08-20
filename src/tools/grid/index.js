import { defineTool } from '../../core/registry.js';
import { badge, compact } from './badge.js';
import { annotate } from './lens.js';
import { report } from './report.js';
import { rules, audit } from './rule.js';
import { draw } from './draw.js';
import { Scale } from './service.js';

/* index — REGISTRATION ONLY. The tool's behaviour lives in the files
   beside this one; what is declared here is identity, appearance and wiring.
   One defineTool per tool folder, which the audit counts. */
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .dbgov-warn{ color: #ffd54f; }
    `,
      id: 'grid',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></svg>',   // lucide 'grid-3x3' (ISC)
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
      // no options of its own any more: 'Suggest nearest step' was the
      // RECOMMENDATION facet wearing this tool's name, and it moved to the
      // badge face (was: 'grid' there adopts what anyone saved). The step
      // and ceiling were never grid's either — they are Scale's, reached
      // through uses: above.
    });
