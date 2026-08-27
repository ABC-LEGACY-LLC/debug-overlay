/**
 * ITS OWN SURFACE, like every rule here: findings reach the ⌕ list whether
 * a tool is armed or not, so a tool with no draw() would change nothing at
 * all when switched on. The mark classes are core — more than one rule
 * paints them.
 */
export function draw({ marks, found }) {
  marks(found);
}
