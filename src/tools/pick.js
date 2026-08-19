import { Report } from '../app/report.js';
import { CONFIG } from '../core/config.js';
import { Tools, defineTool } from '../core/registry.js';
import { U } from '../core/utils.js';
import { Render } from '../ui/renderer.js';
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-picked { outline: 2px solid #b5e853; outline-offset: 1px;
      background: rgba(181,232,83,.12); }
    `,
      id: 'pick',
      icon: '⌖',
      title: 'Pick — Ctrl+click (⌘+click) copies what you clicked',
      // OFF by default: it takes over a click, and a tool that changes what
      // clicking does should be something you asked for.

      /**
       * What Ctrl+click puts on the clipboard. A selector is the address you
       * paste into a chat or a test; the text is what you paste into a bug
       * report or a translation file. Both are things you would otherwise
       * select by hand and get wrong at the edges.
       */
      /** Its own gesture, declared where the gesture lives. */
      gestures() {
        return [{ keys: 'Ctrl/⌘+click', does: 'copy what you clicked' }];
      },

      options() {
        return [{ key: 'what', label: 'Ctrl+click copies', def: 'selector',
                  values: ['selector', 'text'], affects: 'act' }];
      },

      /**
       * INPUT hook — the only one that acts on the page rather than describing
       * it. Returning true means this click was ours: the pin that would
       * normally follow does not happen, because landing a pin under an action
       * is the overlay doing two things for one click.
       *
       * Meta as well as Ctrl: Ctrl+click is the context menu on macOS, so the
       * modifier that means "modified click" there is ⌘.
       */
      intercept({ type, ev, el }) {
        if (type !== 'click' || !(ev.ctrlKey || ev.metaKey)) return false;
        const txt = Tools.setting(this, 'what') === 'text'
          ? (el.textContent || '').trim()
          : U.selectorOf(el);
        if (!txt) return false;     // nothing to copy is not a click we took
        Report.toClipboard(txt);
        this._hit = el;
        // The clipboard is invisible. Without this the only difference between
        // a copy that worked and one that silently did not is what turns up
        // when you paste, which is too late to notice.
        clearTimeout(this._timer);
        this._timer = setTimeout(() => { this._hit = null; Render.schedule(); },
                                 CONFIG.PICK_FLASH);
        Render.schedule();
        return true;
      },

      draw({ layer, Place }) {
        if (!this._hit || !document.contains(this._hit)) return;
        const r = this._hit.getBoundingClientRect();
        const box = document.createElement('div');
        box.className = 'dbgov-box dbgov-picked';
        Place.put(box, r.left, r.top, r.width, r.height);
        layer.append(box);
      },

      report({ el }) {
        return [`  selector: ${U.selectorOf(el)}`];
      },
    });
