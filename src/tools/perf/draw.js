/**
 * Findings become places on the page — the core painter draws the outline,
 * the severity colour and the rule's label, coalesced per element. `found`
 * is this tool's own findings, handed over by the renderer.
 */
export function draw({ marks, found }) {
        marks(found);
}
