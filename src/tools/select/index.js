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
      id: 'select',
      icon: '⬚',
      title: 'Select — how pinned elements group up',
      startsOn: true,

      /** The single place grouping is decided — see form.js. */
      _form() { return form(State.pins); },

      groups,
      pendingIndex,
      gestures,
      listRows,
      reportTail,
    });
