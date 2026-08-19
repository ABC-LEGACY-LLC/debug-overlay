import { CONFIG } from '../../core/config.js';
import { State } from '../../core/state.js';

/**
 * SELECT, and only SELECT. This came out of measure, which had been the
 * read-out AND the thing deciding what was selected — so a second way of
 * selecting could not be added without editing the tool that draws
 * badges. Nothing here describes an element; it decides which elements
 * belong together, and hands that to whoever wants to say something
 * about the pair.
 */
export function options() {
        return [{ key: 'mode', label: 'Pin grouping', def: CONFIG.PAIR_MODE,
                  values: ['pairs', 'chain'], affects: 'select' }];
}

/** Hook: what is grouped, for anything that draws or reports BETWEEN
 *  elements. Consumers never learn who grouped them. */
export function groups() { return this._form().groups; }

/** Hook: which pin is still waiting for its partner. */
export function pendingIndex() {
        const { pending } = this._form();
        return pending ? State.pins.indexOf(pending) : -1;
}
