import { CONFIG } from '../../core/config.js';
import { Tools } from '../../core/registry.js';
import { U } from '../../core/utils.js';

/**
 * INPUT hook — the only one that acts on the page rather than describing
 * it. Returning true means this click was ours: the pin that would
 * normally follow does not happen, because landing a pin under an action
 * is the overlay doing two things for one click.
 *
 * Meta as well as Ctrl: Ctrl+click is the context menu on macOS, so the
 * modifier that means "modified click" there is ⌘.
 */
export function intercept({ type, ev, el, redraw, toClipboard }) {
        if (type !== 'click' || !(ev.ctrlKey || ev.metaKey)) return false;
        const txt = Tools.setting(this, 'what') === 'text'
          ? (el.textContent || '').trim()
          : U.selectorOf(el);
        if (!txt) return false;     // nothing to copy is not a click we took
        toClipboard(txt);
        this._hit = el;
        // The clipboard is invisible. Without this the only difference between
        // a copy that worked and one that silently did not is what turns up
        // when you paste, which is too late to notice.
        clearTimeout(this._timer);
        this._timer = setTimeout(() => { this._hit = null; redraw(); },
                                 CONFIG.PICK_FLASH);
        redraw();
        return true;
}

export function draw({ layer, Place }) {
        if (!this._hit || !document.contains(this._hit)) return;
        const r = this._hit.getBoundingClientRect();
        const box = document.createElement('div');
        box.className = 'dbgov-box dbgov-picked';
        Place.put(box, r.left, r.top, r.width, r.height);
        layer.append(box);
}

export function report({ el }) {
        return [`  selector: ${U.selectorOf(el)}`];
}

export function options() {
        return [{ key: 'what', label: 'Ctrl+click copies', def: 'selector',
                  values: ['selector', 'text'], affects: 'act' }];
}

/**
 * What Ctrl+click puts on the clipboard. A selector is the address you
 * paste into a chat or a test; the text is what you paste into a bug
 * report or a translation file. Both are things you would otherwise
 * select by hand and get wrong at the edges.
 */
/** Its own gesture, declared where the gesture lives. */
export function gestures() {
        return [{ keys: 'Ctrl/⌘+click', does: 'copy what you clicked' }];
}
