import { Report } from '../services/report/index.js';
import { CONFIG } from '../core/config.js';
import { Tools } from '../core/registry.js';
import { State } from '../core/state.js';
import { U } from '../core/utils.js';
import { root } from '../ui/dom.js';
import { Menu } from '../ui/menu.js';
import { Panel } from '../ui/panel.js';
import { Render } from '../ui/renderer.js';
  /* ======================================================================
    INTERACTIONS
     ====================================================================== */
  export const Interactions = {
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
      /* Capabilities ride IN through the ctx, the way draw() receives layer
         and Place. pick used to import Render and Report directly — a
         tool naming a surface and a service — and the import-boundary
         audit caught it the day the rule landed. This file is app/: it may
         know both, and handing them over is exactly its job as the door. */
      const ctx = { type, ev, el,
                    redraw: Render.schedule, toClipboard: Report.toClipboard };
      for (const t of Tools.withHook('intercept', true))
        if (t.intercept.call(t, ctx)) return true;
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
        /* Ctrl/⌘+C copies the TARGET's selector — the universal copy key
           doing the obvious thing, instead of a gesture nobody would guess.
           Free to take because the overlay already swallows text selection
           while ON, so there is nothing native left for it to copy — except
           inside a ⚙ field, where typing() keeps it the page's. The target
           is what you are pointing at, else the current selection. */
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey &&
            e.code === 'KeyC' && State.enabled && !Interactions.typing(e)) {
          const t = State.hoverEl || State.current;
          if (t && document.contains(t)) {
            e.preventDefault();
            Report.toClipboard(U.selectorOf(t));
            Panel.flash('✓');
          }
          return;
        }
        if (e.key === 'Escape' && State.enabled && !Interactions.typing(e)) {
          /* Escape closes the TOP LAYER, and never the session. It used to
             fall through to setPower(false) whenever nothing was pinned, so
             reading a page with the findings list open and no pins, one press
             took the panel, the audit and the session with it — for a key
             whose universal meaning is "close this". Power stays on the button
             and on Alt+Shift+D, both of which say so. */
          /* ONE ladder, every overlay on it. The flyouts used to be missing —
             they closed on an outside click and nowhere else, so Escape, the
             one key whose universal meaning is "close this", walked straight
             past an open flyout and cleared the pins behind it. */
          if (Menu.isOpen()) Menu.close();   // the newest top layer
          else if (State.removeMode) ctl.setRemoveMode(false);
          /* the popover BEFORE the flyout: a tool's options are opened by
             right-clicking a flyout member, so they sit on top of it, and
             closing the flyout first left the popover stranded above nothing */
          else if (Panel.isListOpen()) Panel.toggleList(false);
          else if (Panel.isFlyoutOpen()) Panel.closeFlyouts();
          else if (State.pins.length || State.current) ctl.clearPins();
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
        /* SELECTION chooses; PIN keeps. Whether a choice PERSISTS is a
           capability question — does any armed tool keep selections? — asked
           the same way the grouping one is below, with no id in it. With no
           keeper armed, every click is a bare selection: it replaces the
           previous one and the page never accumulates anything. */
        if (!Tools.withHook('keeps', true).length) { ctl.setCurrent(el); return; }
        /* A selection pin exists to be grouped and measured. With no armed
           tool publishing groups there is nothing to group it, so it used to
           sit there numbered and lime — promising a measurement that could
           never arrive. Ask whether anyone is listening; if not, a modified
           click is simply a pin. A capability question, not an id: whatever
           publishes groups tomorrow answers it without this file learning a
           name.

           The TECHNIQUE is the gesture, never a mode: Shift+click pairs,
           Ctrl/⌘+Shift+click chains to the previous pin, and the two mix in
           one session. Ctrl+Shift reaches here because pick claims Ctrl
           WITHOUT Shift — both files hold their half of that line. */
        const grouped = e.shiftKey && Tools.withHook('groups', true).length > 0;
        const kind = !grouped ? CONFIG.PIN_KIND.PLAIN
          : (e.ctrlKey || e.metaKey) ? CONFIG.PIN_KIND.CHAIN
          : CONFIG.PIN_KIND.SHIFT;
        ctl.togglePin(el, kind);
      }, true);

      /* Right-click on a target: ITS menu — the take-away actions Report
         owns, on the surface core draws. This file is the door that knows
         both sides, so the hand-over happens here. ours() already spells
         the exits: overlay OFF, Alt held, or the panel itself under the
         cursor all leave the page's own context menu untouched — Alt is
         the same escape hatch it is for every click. */
      addEventListener('contextmenu', (e) => {
        if (!Interactions.ours(e)) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || root.contains(el)) return;
        const rows = Report.targetActions(el);
        if (!rows.length) return;
        e.preventDefault();
        e.stopPropagation();
        Menu.open(e.clientX, e.clientY, rows);
      }, true);

      addEventListener('scroll', Render.schedule, true);
      addEventListener('resize', Render.schedule);
    },
  };
