import { Measure } from '../../core/geometry.js';

// dimension lines between grouped pins
export function draw({ layer, Place }) {
        Measure.resetLanes();
        for (const [A, B] of this._pairs()) {
          Measure.dimension(layer, Place, A.el.getBoundingClientRect(),
                            B.el.getBoundingClientRect(), `#${A.id}→#${B.id}`);
        }
}
