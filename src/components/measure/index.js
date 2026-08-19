import { defineTool } from '../../core/registry.js';
import { badge, compact, options } from './badge.js';
import { report, reportTail } from './report.js';
import { draw } from './draw.js';
import { Measure } from '../../core/geometry.js';
import { Tools } from '../../core/registry.js';

/* index — REGISTRATION ONLY. The component's behaviour lives in the files
   beside this one; what is declared here is identity, appearance and wiring.
   One defineTool per component folder, which the audit counts. */
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-leader { position: fixed; pointer-events: none; background: rgba(255,255,255,.55); }
    .dbgov-line { position: fixed; pointer-events: none; background: rgba(181,232,83,.85);
      border-radius: 1px; box-shadow: 0 0 0 .5px rgba(0,0,0,.4); }
    .dbgov-cap { position: fixed; pointer-events: none; background: #b5e853;
      border-radius: 1px; box-shadow: 0 0 0 .5px rgba(0,0,0,.5); }
    .dbgov-arrow { position: fixed; pointer-events: none; width: 0; height: 0;
      filter: drop-shadow(0 0 .5px rgba(0,0,0,.6)); }
    .dbgov-arrow.up    { border-left: 5px solid transparent; border-right: 5px solid transparent;
                         border-bottom: 7px solid #b5e853; }
    .dbgov-arrow.down  { border-left: 5px solid transparent; border-right: 5px solid transparent;
                         border-top: 7px solid #b5e853; }
    .dbgov-arrow.left  { border-top: 5px solid transparent; border-bottom: 5px solid transparent;
                         border-right: 7px solid #b5e853; }
    .dbgov-arrow.right { border-top: 5px solid transparent; border-bottom: 5px solid transparent;
                         border-left: 7px solid #b5e853; }
    .dbgov-ext { position: fixed; pointer-events: none;
      background: repeating-linear-gradient(to right,
        rgba(181,232,83,.7) 0 4px, transparent 4px 8px); }
    .dbgov-ext.v { background: repeating-linear-gradient(to bottom,
        rgba(181,232,83,.7) 0 4px, transparent 4px 8px); }
    .dbgov-dist { position: fixed; pointer-events: none;
      background: rgba(24,28,14,.95); color: #b5e853; border-radius: 7px;
      padding: 3px 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .dbgov-dist.vert { border-left: 2px solid #b5e853; }
    `,
      id: 'measure',
      icon: '📐',
      title: 'Measure — size, radius, spacing, font, distances',
      startsOn: true,      // the read-out is what the overlay is FOR

      /**
       * A pair has a distance; a group of five does not have one distance.
       * Anything that is not two elements is something this tool has nothing
       * to say about, and it says so by drawing nothing rather than guessing
       * which two of them were meant.
       */
      _pairs: () => Tools.groups().filter((g) => g.length === 2),


      badge,
      compact,
      options,
      report,
      reportTail,
      draw,
    });
