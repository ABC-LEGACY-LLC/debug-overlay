  /* ======================================================================
    INTERACTIONS
     ====================================================================== */
  const Interactions = {
    // is the user typing? then keys belong to the page, not to us
    typing(e) {
      const t = e.target;
      return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
    },

    // Is this pointer event ours to swallow? Alt is the page's escape hatch,
    // and the panel handles its own clicks.
    ours(e) {
      return State.enabled && !e.altKey && !root.contains(e.target);
    },

    /**
     * Offer an event to the armed tools before the overlay's own default.
     *
     * WHY: every hook until now was read-or-render — a tool could describe the
     * page and judge it, but nothing could act on it, so anything that changes
     * what you clicked had nowhere to live. This is the one place input enters,
     * so it is the one place that can hand it on, and it does so by hook: no
     * tool is named here and none ever will be.
     *
     * The first tool to say it consumed the event ends it. Two tools acting on
     * one click is a page doing two things nobody asked for, and a pin landing
     * underneath an edit is the same bug wearing the overlay's own clothes.
     */
    claimed(type, ev, el) {
      for (const t of Tools.withHook('intercept', true))
        if (t.intercept.call(t, { type, ev, el })) return true;
      return false;
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
        /* Escape inside a FIELD is "abandon this edit", not "close things" —
           and typing() already says which those are (INPUT, TEXTAREA, SELECT,
           contenteditable), which covers every ⚙ control there is.
           `!root.contains(e.target)` used to guard it too, and that was wrong:
           clicking any bar button leaves focus on that button, inside root, so
           the guard swallowed Escape in the single most common path — open the
           panel with the mouse, press Escape, nothing happens. It silenced
           exactly the gesture the KEYS legend advertises. */
        if (e.key === 'Escape' && State.enabled && !Interactions.typing(e)) {
          /* Escape closes the TOP LAYER, and never the session. It used to
             fall through to setPower(false) whenever nothing was pinned, so
             reading a page with the findings list open and no pins, one press
             took the panel, the audit and the session with it — for a key
             whose universal meaning is "close this". Power stays on the button
             and on Alt+Shift+D, both of which say so. */
          if (State.removeMode) ctl.setRemoveMode(false);
          else if (Panel.isListOpen()) Panel.toggleList(false);
          else if (State.pins.length) ctl.clearPins();
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

      // Swallowing only the click is too late. The browser starts a text
      // selection on mousedown, and a shift-click extends whatever is already
      // selected — so measuring from one element to another also dragged a
      // selection across everything between them. The page's own focus and
      // drag handling starts there too, which is the other half of the same
      // symptom: the overlay's clicks were reaching the page underneath.
      for (const type of ['mousedown', 'mouseup', 'dblclick']) {
        addEventListener(type, (e) => {
          // primary button only: no other one starts a selection, and taking
          // them all would swallow the context menu with them
          if (e.button !== 0 || !Interactions.ours(e)) return;
          e.preventDefault();
          e.stopPropagation();
        }, true);
      }

      addEventListener('click', (e) => {
        if (!Interactions.ours(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (State.removeMode) {
          const p = Interactions.pinAt(e.clientX, e.clientY);
          if (p) ctl.removePin(p);
          return;
        }
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || root.contains(el)) return;
        if (Interactions.claimed('click', e, el)) return;
        /* A SHIFT pin exists to be grouped and measured. With no armed tool
           publishing groups there is nothing to group it, so it used to sit
           there numbered and lime — promising a measurement that could never
           arrive, which is what "it just counts 1, 2, 3, 4" was. Ask whether
           anyone is listening; if not, a shift-click is simply a pin.

           A capability question, not an id: whatever publishes groups tomorrow
           answers it without this file learning a name. */
        const grouped = e.shiftKey && Tools.withHook('groups', true).length > 0;
        ctl.togglePin(el, grouped ? CONFIG.PIN_KIND.SHIFT : CONFIG.PIN_KIND.PLAIN);
      }, true);

      addEventListener('scroll', Render.schedule, true);
      addEventListener('resize', Render.schedule);
    },
  };
