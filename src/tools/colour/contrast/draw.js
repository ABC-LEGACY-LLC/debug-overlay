
// Findings become places on the page, not just rows in a list. `found`
// is this tool's own, handed over by the renderer; the layer is cleared
// every frame, so there is nothing to undo and nothing of anyone else's
// to step on.
export function draw({ marks, found }) {
        marks(found);
}

