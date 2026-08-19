export function report({ el }) {
        if (!el.id) return [];
        const n = document.querySelectorAll(`[id="${CSS.escape ? CSS.escape(el.id) : el.id}"]`).length;
        return n > 1 ? [`  ⧉ id "${el.id}" is used ${n} times on this page`] : [];
}
