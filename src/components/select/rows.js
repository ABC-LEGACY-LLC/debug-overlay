import { Measure } from '../../core/geometry.js';
import { U } from '../../core/utils.js';

/**
 * Hook: rows for the panel's pin list. The distance in the detail column
 * comes from core geometry, not from a read-out hook — this tool
 * describes its own grouping, which is still selection, and implements
 * no badge or annotate to claim otherwise.
 */
export function listRows() {
        const { groups, pending } = this._form();
        const rows = groups.map(([A, B]) => {
          const ra = A.el.getBoundingClientRect(), rb = B.el.getBoundingClientRect();
          const g = U.gap(ra, rb);
          const axis = Measure.axisOf(ra, rb);
          const detail = axis.kind === 'overlap' ? 'overlapping'
            : axis.kind === 'diagonal' ? `→ ${g.dx} · ↓ ${g.dy} px`
            : axis.kind === 'vertical' ? `↕ ${g.dy} px` : `↔ ${g.dx} px`;
          return { tag: `#${A.id}→#${B.id}`,
                   label: `${U.labelOf(A.el)} ↔ ${U.labelOf(B.el)}`,
                   detail, pins: [A, B] };
        });
        if (pending) rows.push({ tag: `#${pending.id}…`, label: U.labelOf(pending.el),
                                 detail: 'pick its pair', pins: [pending] });
        return rows;
}

/** A half-finished selection is a fact about the report's scope. */
export function reportTail() {
        const { pending } = this._form();
        return pending ? [`[#${pending.id}] waiting for its pair`] : [];
}
