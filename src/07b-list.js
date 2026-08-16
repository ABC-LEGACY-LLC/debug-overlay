  /* ======================================================================
    7b. LIST — the popover the panel opens

        Split out of PANEL, which was doing two jobs: a bar of buttons that
        drags and snaps, and a list that renders rows. They share only an
        anchor — the popover has to know where the bar is and which edge it
        sits against — so that is all this is given, as a small object PANEL
        hands over.

        Defined BEFORE the panel so nothing here is in scope before it exists;
        the panel attaches to it on the way up.
     ====================================================================== */
  const List = (() => {
    const el = document.createElement('div');
    el.id = '__dbgov-list';
    root.append(el);
    let open = false;
    let view = null;      // opaque name of whichever view is showing
    let anchor = null;    // { el, side(), mark(view) } — supplied by PANEL

    function place() {
      if (!anchor) return;
      const r = anchor.el.getBoundingClientRect();
      const w = el.offsetWidth, h = el.offsetHeight;
      const side = anchor.side();
      let x, y;
      if (side === 'left')       { x = r.right + 10; y = r.top; }
      else if (side === 'right') { x = r.left - w - 10; y = r.top; }
      else if (side === 'top')   { x = r.left - w / 2 + r.width / 2; y = r.bottom + 10; }
      else                       { x = r.left - w / 2 + r.width / 2; y = r.top - h - 10; }
      el.style.left = Math.max(6, Math.min(x, innerWidth - w - 6)) + 'px';
      el.style.top = Math.max(6, Math.min(y, innerHeight - h - 6)) + 'px';
    }

    const api = {
      onOpen: null, onRowActivate: null, onRowRemove: null, onRowChange: null,

      /** PANEL says where it is and how to light up the button that opened us. */
      attach(a) { anchor = a; },

      isOpen: () => open,
      /**
       * One popover, several views. `view` is an opaque name off the button
       * that opened it — this carries it and hands it back, and never learns
       * what any of them mean.
       */
      view: () => view,
      place,

      toggle(v, name = 'pins') {
        const same = open && view === name;
        open = v === undefined ? !same : !!v;
        view = open ? name : null;
        el.classList.toggle('open', open);
        anchor?.mark(view);
        if (open) { api.onOpen?.(view); place(); }
      },

      /**
       * rows: [{ tag, label, detail, removable }] — built by CONTROLLER, which
       * is also where the empty-state wording comes from, because only it
       * knows what this view is a list of.
       *
       * A row may carry a `control` description instead of a detail. This
       * draws it and hands back whatever the widget produced — an index, a
       * string, a boolean. It cannot learn what the setting is or what type
       * its value has, and so cannot start deciding any of that.
       */
      set(rows, empty = '') {
        el.textContent = '';
        if (!rows.length) {
          const e = document.createElement('div');
          e.className = 'empty';
          e.textContent = empty;
          el.append(e);
          place();
          return;
        }
        rows.forEach((row, i) => {
          const r = document.createElement('div');
          r.className = 'row';
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = row.tag;
          const lbl = document.createElement('span');
          lbl.className = 'lbl';
          lbl.textContent = row.label;         // textContent: page text is never HTML here
          // carried, not interpreted — the stylesheet decides what it means
          if (row.accent) r.dataset.accent = row.accent;
          r.addEventListener('click', () => api.onRowActivate?.(i));
          if (row.control) {
            r.append(tag, lbl, Controls.build(row.control, (raw) => api.onRowChange?.(i, raw)));
          } else {
            const det = document.createElement('span');
            det.className = 'det';
            det.textContent = row.detail || '';
            r.append(tag, lbl, det);
          }
          // Only rows that own something can drop it. A finding is a fact
          // about the page; there is nothing there for a ✕ to remove.
          if (row.removable) {
            const rm = document.createElement('button');
            rm.className = 'rm';
            rm.textContent = '✕';
            rm.title = 'Remove';
            rm.addEventListener('click', (e) => { e.stopPropagation(); api.onRowRemove?.(i); });
            r.append(rm);
          }
          el.append(r);
        });
        place();
      },
    };
    return api;
  })();
