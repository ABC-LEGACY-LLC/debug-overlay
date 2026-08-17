  defineTool({
      id: 'select',
      icon: '⬚',
      title: 'Select — how pinned elements group up',
      startsOn: true,

      /**
       * SELECT, and only SELECT. This came out of measure, which had been the
       * read-out AND the thing deciding what was selected — so a second way of
       * selecting could not be added without editing the tool that draws
       * badges. Nothing here describes an element; it decides which elements
       * belong together, and hands that to whoever wants to say something
       * about the pair.
       */
      options() {
        return [{ key: 'mode', label: 'Pin grouping', def: CONFIG.PAIR_MODE,
                  values: ['pairs', 'chain'], affects: 'select' }];
      },

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

      /** Hook: what is grouped, for anything that draws or reports BETWEEN
       *  elements. Consumers never learn who grouped them. */
      groups() { return this._form().groups; },

      /** Hook: which pin is still waiting for its partner. */
      pendingIndex() {
        const { pending } = this._form();
        return pending ? State.pins.indexOf(pending) : -1;
      },

      /**
       * Hook: rows for the panel's pin list. The distance in the detail column
       * comes from core geometry, not from a read-out hook — this tool
       * describes its own grouping, which is still selection, and implements
       * no badge or annotate to claim otherwise.
       */
      listRows() {
        const { groups, pending } = this._form();
        const rows = groups.map(([A, B]) => {
          const ra = A.el.getBoundingClientRect(), rb = B.el.getBoundingClientRect();
          const g = U.gap(ra, rb);
          const axis = Measure.axisOf(ra, rb);
          const detail = axis.kind === 'overlap' ? 'overlapping'
            : axis.kind === 'diagonal' ? `→ ${g.dx} · ↓ ${g.dy} px`
            : axis.kind === 'vertical' ? `↕ ${g.dy} px` : `↔ ${g.dx} px`;
          return { tag: `#${A.id}→#${B.id}`,
                   label: `${U.labelOf(A.el)} ↔ ${U.labelOf(B.el)}`,
                   detail, pins: [A, B] };
        });
        if (pending) rows.push({ tag: `#${pending.id}…`, label: U.labelOf(pending.el),
                                 detail: 'pick its pair', pins: [pending] });
        return rows;
      },

      /** A half-finished selection is a fact about the report's scope. */
      reportTail() {
        const { pending } = this._form();
        return pending ? [`[#${pending.id}] waiting for its pair`] : [];
      },
    });
