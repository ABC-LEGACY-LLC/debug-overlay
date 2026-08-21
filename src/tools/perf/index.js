import { defineTool } from '../../core/registry.js';
import { CONFIG } from '../../core/config.js';
import { watch, unwatch } from './service.js';
import { badge, compact, legend } from './badge.js';
import { listRows, reportTail } from './rows.js';

/* index — REGISTRATION ONLY. The tool's behaviour lives in the files
   beside this one; what is declared here is identity, appearance and wiring.
   One defineTool per tool folder, which the audit counts.

   THE FIRST MONITOR: watch/unwatch is a runtime, not a moment — armed and
   powered, it is on duty; disarmed or powered off, it stands down. And the
   first tool that is honestly OFF by default for cost, not for caution:
   observers and a rAF heartbeat run for as long as it is armed, and a
   meter you did not ask for is overhead pretending to be help. */
defineTool({
        id: 'perf',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg>',   // lucide 'activity' (ISC)
        title: 'Perf — freezes and jank while armed; the badge shows the page\'s pulse',
        startsOn: false,

        watch,
        unwatch,
        badge,
        compact,
        legend,
        listRows,
        reportTail,
        options() {
          return [
            { key: 'freeze', label: 'Freeze threshold', def: CONFIG.PERF.FREEZE_MS,
              type: 'number', min: 100, max: 5000, step: 50, suffix: 'ms',
              affects: 'detect' },
          ];
        },
});
