import { defineTool } from '../../core/registry.js';
import { groups, pendingIndex, gestures } from './service.js';
import { form } from './form.js';
import { listRows, reportTail } from './rows.js';
import { State } from '../../core/state.js';

/* index — REGISTRATION ONLY. The tool's behaviour lives in the files
   beside this one; what is declared here is identity, appearance and wiring.
   One defineTool per tool folder, which the audit counts.

   No `was:` any more: it carried the retired 'Pin grouping' mode over from
   measure, and with the mode gone (a technique is a gesture now — see
   form.js) this tool stores no settings at all. */
  defineTool({
      id: 'group',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M5 3a2 2 0 0 0-2 2" /><path d="M19 3a2 2 0 0 1 2 2" /><path d="M21 19a2 2 0 0 1-2 2" /><path d="M5 21a2 2 0 0 1-2-2" /><path d="M9 3h1" /><path d="M9 21h1" /><path d="M14 3h1" /><path d="M14 21h1" /><path d="M3 9v1" /><path d="M21 9v1" /><path d="M3 14v1" /><path d="M21 14v1" /></svg>',   // lucide 'box-select' (ISC)
      // what this tool EXAMINES. A tool in a domain folder says it with
      // family:; one that owns its subject alone says it here, and every
      // tool must say it one way or the other — the side panel prints it
      // as a column, and a column is not a column if some rows are blank.
      subject: 'input',
      title: 'Group — how pinned elements pair and chain',
      startsOn: true,

      /** The single place grouping is decided — see form.js. */
      _form() { return form(State.pins); },

      groups,
      pendingIndex,
      gestures,
      listRows,
      reportTail,
    });
