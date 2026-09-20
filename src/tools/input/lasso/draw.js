import { Drag } from './drag.js';

/**
 * THE RECTANGLE, while it is being drawn. Without it the gesture is a guess:
 * you press, you move, and nothing on screen says what you are about to take
 * until it is already taken. A pin you did not mean is cheap to remove and
 * expensive to notice.
 */
export function draw({ layer, Place }) {
  const r = Drag.rect;
  if (!r) return;
  const box = document.createElement('div');
  box.className = 'debug-overlay-lasso';
  Place.put(box, r.left, r.top, Math.max(1, r.right - r.left), Math.max(1, r.bottom - r.top));
  layer.append(box);
}
