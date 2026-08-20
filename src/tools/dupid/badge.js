/**
 * What it has to say about the element you are pointing AT. It knew this
 * all along and only ever said it in the copied report — hover a element
 * whose id is used three times and the badge was silent, which is the
 * one place you were looking.
 */
export function badge({ el }) {
        if (!el.id) return null;
        const n = document.querySelectorAll(
          `[id="${CSS.escape ? CSS.escape(el.id) : el.id}"]`).length;
        return n > 1 ? `<span class="dbgov-dup">⌗ id ×${n}</span>` : null;
}

export function compact(i) { return this.badge(i); }
