import { State } from '../../core/state.js';

/**
 * GROUPING, and only grouping. This came out of measure, which had been
 * the read-out AND the thing deciding what belonged together — so a
 * second way of grouping could not be added without editing the tool
 * that draws badges. Nothing here describes an element; it decides which
 * elements belong together, and hands that to whoever wants to say
 * something about the pair. (SELECTION itself — click chooses one
 * element — is core's: app/interactions.js and State.current.)
 */

/** Hook: what is grouped, for anything that draws or reports BETWEEN
 *  elements. Consumers never learn who grouped them. */
export function groups() { return this._form().groups; }

/** Hook: which pin is still waiting for its partner. */
export function pendingIndex() {
        const { pending } = this._form();
        return pending ? State.pins.indexOf(pending) : -1;
}

/** The chain technique's own gesture, declared where the gesture lives.
 *  Shift+click is core's row in the KEYS legend already — only what this
 *  tool ADDS is declared here. */
export function gestures() {
        return [{ keys: 'Ctrl/⌘+Shift+click',
                  does: 'chain to the previous pin — repeat for ①─②─③' }];
}
