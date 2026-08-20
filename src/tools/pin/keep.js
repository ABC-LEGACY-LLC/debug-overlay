/**
 * The one hook this tool exists for. SELECTION chooses; PIN keeps —
 * while this is armed, the selection a click makes persists as a pin
 * (numbered, listed, reported) instead of replacing the previous one.
 *
 * The input layer asks the registry "does any armed tool keep
 * selections?" — a capability question with no id in it, like the
 * grouping question beside it — so a second keeper shipped tomorrow
 * answers it without anyone learning a name.
 */
export function keeps() {
        return true;
}
