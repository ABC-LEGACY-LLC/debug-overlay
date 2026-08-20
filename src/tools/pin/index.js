import { defineTool } from '../../core/registry.js';
import { keeps } from './keep.js';

/**
 * PIN — keep what you select.
 *
 * Pinning used to be welded to the click itself: choosing an element and
 * keeping it were one gesture, so there was no way to browse a page one
 * selection at a time without accumulating pins to clean up afterwards.
 * Now SELECTION (core) chooses — single, transient, replaced by the next
 * click — and this tool is the thing that KEEPS a choice.
 *
 * `startsOn: true`, so a fresh install and every existing one (via the
 * SEEN mechanism) behave exactly as before: clicks pin. Switching it off
 * is the new ability, not a new default — and it stops NEW keeping only;
 * pins already made stay until ✕, because a toggle that destroys a
 * prepared screenshot is an update taking something away.
 */
defineTool({
        id: 'pin',
        icon: '📌',
        title: 'Pin — keep what you select; off, selections replace each other',
        startsOn: true,
        keeps,
});
