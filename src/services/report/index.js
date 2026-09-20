import { Sweep } from '../findings/index.js';
import { CONFIG } from '../../core/config.js';
import { Tools } from '../../core/registry.js';
import { State } from '../../core/state.js';
import { U } from '../../core/utils.js';
import { WebPanel } from '../../ui/web-panel.js';
  /* ======================================================================
    REPORT — also composed from active tools
     ====================================================================== */
  export const Report = {
    text() {
      const active = Tools.active();
      const L = [
        `# UI debug report`,
        `url: ${location.href}`,
        `viewport: ${innerWidth}×${innerHeight} @ dpr ${devicePixelRatio}`,
        // sorted: this line is an INVENTORY, not a sequence — registration order
        // leaked into it once (a folder rename reordered it) and role order
        // would leak the same way. Alphabetical is immune to both.
        `tools: ${active.map((t) => t.id).sort().join(', ') || 'none'}`,
        '',
      ];
      const found = [];
      // The CURRENT selection first — the choice nothing armed is keeping.
      // Labelled, not numbered: numbers belong to kept pins, and a report
      // saying [#1] about something the page shows unnumbered would lie.
      if (State.current && document.contains(State.current)) {
        const i = U.info(State.current);
        L.push(`[selected] ${U.selectorOf(i.el)}`);
        for (const t of active) L.push(...(t.report?.call(t, i) || []));
        found.push(...Sweep.collect(active, 'audit', i));
        L.push('');
      }
      /* BY NUMBER, which is what the reader sees. State.pins is in the order
         they were made, and a pin's number is DERIVED — the smallest one not
         in use — so unpinning #1 and pinning again puts a pin numbered 1 at
         the END of the array. The report then read #2 #3 #4 #1 while the page
         and the panel's list both showed 1 2 3 4, because the list sorts and
         this did not. Two surfaces over one state, two orders. */
      State.pins.slice().sort((a, b) => a.id - b.id).forEach((p) => {
        const i = U.info(p.el);
        L.push(`[#${p.id}] (${p.kind}) ${U.selectorOf(i.el)}`);
        for (const t of active) L.push(...(t.report?.call(t, i) || []));
        // same info, judged rather than described — rules only speak up when
        // something is wrong, so this is usually empty. Stamped by the same
        // helper the sweep uses, so a finding always knows its producer no
        // matter which path made it.
        found.push(...Sweep.collect(active, 'audit', i));
        L.push('');
      });
      for (const t of active) {
        const tail = t.reportTail?.call(t) || [];
        if (tail.length) L.push(...tail);
      }
      // A sweep already covered every element, pinned ones included, so it
      // replaces the per-pin collection rather than adding to it — counting
      // both would report the same problem twice.
      const list = State.sweep ? State.sweep.findings : found;
      // Its own section: per-pin lines carry no attribution, so loose finding
      // lines up there would be indistinguishable from a tool's description.
      const groups = Sweep.group(list);
      // A sweep that found nothing still prints its heading. "No findings"
      // over a stated scope is a result; an absent section is indistinguishable
      // from never having looked.
      if (State.sweep || groups.length) {
        // The panel calls these "N distinct problems · M occurrences"; this
        // said "findings (M)" for the same audit, so one number had two names
        // depending on where you read it.
        L.push('', `## findings — ${groups.length} problem${groups.length === 1 ? '' : 's'}` +
                   ` · ${list.length} occurrence${list.length === 1 ? '' : 's'}${Report.scope()}`);
        for (const g of groups) {
          // 'review' outranks the severity in the label: what matters first is
          // whether this is a verdict or the absence of one
          const tag = g.verdict === 'review' ? 'review' : g.severity;
          L.push(`[${tag}] ${g.rule}${g.n > 1 ? ` ×${g.n}` : ''}: ${g.message}`);
          L.push(`    ${U.selectorOf(g.el)}`);
        }
        if (!groups.length) L.push('(none)');

        // What each rule IS, as opposed to what any one finding measured —
        // once, at the end. Printed under every finding it made a real report
        // unreadable: ninety findings carrying the same three lines.
        const docs = new Map();
        for (const g of groups) {
          const d = Tools.byId(g.tool)?.rules?.[g.rule];
          if (d && !docs.has(g.rule)) docs.set(g.rule, d);
        }
        if (docs.size) {
          L.push('', '## rules');
          for (const [id, d] of docs) {
            L.push(id);
            if (d.help) L.push(`  ${d.help}`);
            if (d.why) L.push(`  ${d.why}`);
            if (d.docs) L.push(`  ${d.docs}`);
          }
        }
      }
      return L.join('\n');
    },
    /** What the findings above cover, so a zero among them can be read. */
    scope() {
      const s = State.sweep;
      if (!s) return ' · pinned elements only';
      return ` · whole page · ${s.rules} rule${s.rules === 1 ? '' : 's'}` +
             ` · ${s.elements} elements` +
             // the page could not show them all; this text can
             (Object.values(s.byTool).some((f) => f.length > CONFIG.MARK_LIMIT)
               ? ` · marks from the first ${CONFIG.MARK_LIMIT} findings per rule` : '') +
             Sweep.unchecked(s);
    },

    /**
     * Put text on the clipboard. Separate from copy() because it is not only
     * the report that ever wants this — a tool that picks something off the
     * page needs the same two-step, and a second copy of the fallback is a
     * second thing to get wrong.
     */
    async toClipboard(txt) {
      try {
        await navigator.clipboard.writeText(txt);
      } catch {
        // no clipboard permission, or an insecure origin
        const t = document.createElement('textarea');
        t.value = txt;
        document.body.append(t);
        t.select();
        document.execCommand('copy');
        t.remove();
      }
    },
    /**
     * PREPARE, then build — the report as a string. Report.text() is
     * synchronous and every other line in this file depends on that — but a
     * tool can need something fetched before it can answer, and the
     * alternative was a report that said "ask again" the first time. Only
     * ARMED tools, only on this path: a copy is a deliberate act, which is
     * what makes it the right place to do work that a hover must never do.
     * One failing tool does not cost the report — it simply has nothing to
     * add.
     *
     * Split from copy() when a second reader arrived: the remote door hands
     * this to an AI over the worker's socket, and the clipboard is the one
     * thing that reader must never touch. copy() is build() plus the
     * clipboard, so both readers get the same text by construction.
     *
     * Returns the TEXT, or a promise of it — A PROMISE ONLY WHEN THERE IS
     * SOMETHING TO WAIT FOR, the same contract Sweep.run() keeps. An `async`
     * here would cost a microtask on every copy, including the overwhelming
     * majority that prepare nothing, and every reader of the clipboard would
     * inherit a hop it never needed: the suite reads the clipboard in the
     * same breath as the click, and the first version of this split made
     * every report-reading assertion in it see null.
     */
    build() {
      const waits = [];
      for (const t of Tools.withHook('prepare', true)) {
        try {
          const r = t.prepare.call(t);
          // a tool that cannot prepare says so in its own lines
          if (r && typeof r.then === 'function') waits.push(r.catch(() => {}));
        } catch { /* same: nothing to add */ }
      }
      if (!waits.length) return Report.text();
      return Promise.all(waits).then(() => Report.text());
    },
    copy() {
      const put = (txt) => Report.toClipboard(txt).then(() => WebPanel.flash('✓'));
      const built = Report.build();
      return built && typeof built.then === 'function' ? built.then(put) : put(built);
    },
    /**
     * The take-away actions for ONE element — what the target menu offers.
     *
     * They live HERE because copying is this service's capability, always
     * on the way ⧉ is: there used to be a `pick` tool armouring exactly
     * this behind a button and a Ctrl+click, and an on/off switch for
     * "copy" guards nothing — the menu takes no click away from anyone.
     * The surface (ui/menu.js) is handed these rows by the door (app/) and
     * never learns what one does.
     *
     * Copy text only exists when there IS text — a row that copies an
     * empty string is a control that does nothing, which is worse than
     * no control.
     */
    targetActions(el) {
      const rows = [{
        label: 'Copy selector',
        run: async () => { await Report.toClipboard(U.selectorOf(el)); WebPanel.flash('✓'); },
      }];
      const txt = (el.textContent || '').trim();
      if (txt) rows.push({
        label: 'Copy text',
        run: async () => { await Report.toClipboard(txt); WebPanel.flash('✓'); },
      });
      return rows;
    },
  };
