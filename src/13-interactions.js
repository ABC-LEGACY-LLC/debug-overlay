  /* ======================================================================
    13. INTERACTIONS
     ====================================================================== */
  const Interactions = {
    // is the user typing? then keys belong to the page, not to us
    typing(e) {
      const t = e.target;
      return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
    },

    // in remove mode only pins are targetable — pick the innermost one
    pinAt(x, y) {
      let best = null, bestArea = Infinity;
      for (const p of State.pins) {
        if (!document.contains(p.el)) continue;
        const r = p.el.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const area = r.width * r.height;
        if (area < bestArea) { best = p; bestArea = area; }
      }
      return best;
    },

    install(ctl) {
      addEventListener('keydown', (e) => {
        const H = CONFIG.HOTKEY;
        if (e.altKey === H.alt && e.shiftKey === H.shift && e.ctrlKey === H.ctrl && e.code === H.code) {
          e.preventDefault();
          ctl.togglePower();
          return;
        }
        if (e.code === CONFIG.REMOVE_KEY && State.enabled && !State.removeMode &&
            !e.ctrlKey && !e.metaKey && !e.altKey && !Interactions.typing(e)) {
          e.preventDefault();
          ctl.setRemoveMode(true);
          return;
        }
        if (e.key === 'Escape' && State.enabled) {
          if (State.removeMode) ctl.setRemoveMode(false);
          else if (State.pins.length) ctl.clearPins();
          else ctl.setPower(false);
        }
      }, true);

      addEventListener('keyup', (e) => {
        if (e.code === CONFIG.REMOVE_KEY && State.removeMode) ctl.setRemoveMode(false);
      }, true);
      // releasing the key outside the page would otherwise strand us in remove mode
      addEventListener('blur', () => { if (State.removeMode) ctl.setRemoveMode(false); });

      addEventListener('mousemove', (e) => {
        if (!State.enabled) return;
        if (State.removeMode) {
          const p = Interactions.pinAt(e.clientX, e.clientY);
          if (p !== State.removeTarget) { State.removeTarget = p; Render.schedule(); }
          return;
        }
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || root.contains(el)) {
          if (State.hoverEl) { State.hoverEl = null; Render.schedule(); }
          return;
        }
        if (el !== State.hoverEl) { State.hoverEl = el; Render.schedule(); }
      }, true);

      addEventListener('click', (e) => {
        if (!State.enabled || e.altKey) return;
        if (root.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        if (State.removeMode) {
          const p = Interactions.pinAt(e.clientX, e.clientY);
          if (p) ctl.removePin(p);
          return;
        }
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || root.contains(el)) return;
        ctl.togglePin(el, e.shiftKey ? CONFIG.PIN_KIND.SHIFT : CONFIG.PIN_KIND.PLAIN);
      }, true);

      addEventListener('scroll', Render.schedule, true);
      addEventListener('resize', Render.schedule);
    },
  };
