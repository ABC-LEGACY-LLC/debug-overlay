/**
 * The lens's display preference — the RECOMMENDATION facet. Off by
 * default: a suggestion doubles every marked number, so it has to be
 * asked for. It lives here and not on the scale subject because "show me
 * the fix" is about this lens's ink, not a fact about the project.
 */
export function options() {
        return [
          { key: 'suggest', label: 'Suggest nearest step', def: false, type: 'toggle', affects: 'inspect' },
        ];
}
