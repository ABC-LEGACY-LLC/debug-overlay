  /* ======================================================================
    7a. CONTROLS — one widget, from a description of it

        Split out of PANEL because it never needed anything PANEL owns: no
        element, no state, no callbacks of its own. Everything it makes is
        determined by its argument, which also makes it the one piece of the
        panel that can be reasoned about without reading the rest of it.

        `kind` is the entire vocabulary here. This file never learns which
        setting it is drawing, what the value means, or who owns it — it
        reports what the widget produced and the row's author decides what
        that was.
     ====================================================================== */
  const Controls = {
    /**
     * An unknown kind renders an empty span rather than guessing. A row asking
     * for something this cannot draw should be visibly missing, not silently
     * approximated by whichever branch happened to fall through.
     */
    build(c, onChange) {
      const fn = Controls[c.kind];
      return fn ? fn(c, onChange) : document.createElement('span');
    },

    choice(c, onChange) {
      const sel = document.createElement('select');
      sel.className = 'opt';
      c.choices.forEach((label, k) => {
        const o = document.createElement('option');
        o.value = String(k);
        o.textContent = label;               // a tool's own label, still not HTML
        sel.append(o);
      });
      sel.selectedIndex = c.selected || 0;
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', () => onChange(sel.selectedIndex));
      return sel;
    },

    number(c, onChange) {
      const wrap = document.createElement('span');
      wrap.className = 'num';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'opt';
      inp.value = c.value;
      if (c.min !== undefined) inp.min = String(c.min);
      if (c.max !== undefined) inp.max = String(c.max);
      if (c.step !== undefined) inp.step = String(c.step);
      inp.addEventListener('click', (e) => e.stopPropagation());
      // 'change', not 'input': every keystroke of "120" would otherwise be a
      // separate value — 1, then 12 — each one re-running the rule behind it
      inp.addEventListener('change', () => onChange(inp.value));
      wrap.append(inp);
      if (c.suffix) {
        const u = document.createElement('span');
        u.className = 'unit';
        u.textContent = c.suffix;
        wrap.append(u);
      }
      return wrap;
    },

    toggle(c, onChange) {
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.className = 'opt tick';
      inp.checked = !!c.on;
      inp.addEventListener('click', (e) => e.stopPropagation());
      inp.addEventListener('change', () => onChange(inp.checked));
      return inp;
    },
  };
