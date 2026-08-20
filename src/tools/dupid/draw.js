
/**
 * ITS OWN SURFACE. Findings reach the ⌕ list whether a rule is armed or
 * not, so a rule with no draw() changed nothing at all when you switched
 * it on — measured: armed alone, zero badges, zero marks, zero lines. A
 * toggle that does nothing is worse than no toggle.
 *
 * `found` is this tool's own findings, handed over by the renderer. The
 * mark classes are core: more than one rule paints them, so they cannot
 * belong to whichever tool needed them first.
 */
export function draw({ marks, found }) {
        marks(found);
}

