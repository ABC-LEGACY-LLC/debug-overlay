import { defineTool } from '../../core/registry.js';
import { options, groups, pendingIndex } from './service.js';
import { listRows, reportTail } from './rows.js';
import { CONFIG } from '../../core/config.js';
import { State } from '../../core/state.js';
import { Tools } from '../../core/registry.js';

/* index — REGISTRATION ONLY. The component's behaviour lives in the files
   beside this one; what is declared here is identity, appearance and wiring.
   One defineTool per component folder, which the audit counts. */
  defineTool({
      id: 'select',
      // `mode` was measure's option before the select/measure split, so anyone
      // who chose 'chain' had it silently reset. Same miss as scale and colour,
      // caught one release later — an owner names its own former id.
      was: 'measure',
      icon: '⬚',
      title: 'Select — how pinned elements group up',
      startsOn: true,


      // only Shift-clicked pins take part — a plain click is "inspect this",
      // and silently roping it into a measurement is not what was asked
      _pins: () => State.pins.filter((p) => p.kind === CONFIG.PIN_KIND.SHIFT),

      /**
       * The single place grouping is decided.
       *
       * 'pairs' — every group takes two clicks and the next starts a fresh
       * one, so a pin is never silently reused. 'chain' — each new pin groups
       * with the previous one.
       */
      _form() {
        const mp = this._pins();
        const mode = Tools.setting(this, 'mode');
        const step = mode === 'pairs' ? 2 : 1;
        const out = [];
        for (let k = 0; k + 1 < mp.length; k += step) out.push([mp[k], mp[k + 1]]);
        const pending = (mode === 'pairs' && mp.length % 2) ? mp[mp.length - 1] : null;
        return { groups: out, pending };
      },





      options,
      groups,
      pendingIndex,
      listRows,
      reportTail,
    });
