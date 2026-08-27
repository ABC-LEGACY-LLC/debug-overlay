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
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></svg>',   // lucide 'pin' (ISC)
        // what this tool EXAMINES. A tool in a domain folder says it with
        // family:; one that owns its subject alone says it here, and every
        // tool must say it one way or the other — the side panel prints it
        // as a column, and a column is not a column if some rows are blank.
        subject: 'input',
        title: 'Pin — keep what you select; off, selections replace each other',
        startsOn: true,
        keeps,
});
