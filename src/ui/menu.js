import { root } from './dom.js';

/* ======================================================================
  THE TARGET MENU — the surface right-click opens over a page element.

     Deliberately dumb, like the panel: the rows are handed IN by whoever
     opens it — app/ is the door and knows both sides — because ui/ may
     not import Report, so nothing here knows what a row DOES. Core draws
     the box, clamps it into the viewport, and closes it on Escape (via
     the interactions ladder) or any pointer-down elsewhere, the same
     dismissal the family flyouts use.
   ====================================================================== */
let el = null;

export function initMenu() {
        el = document.createElement('div');
        el.id = '__dbgov-menu';
        root.append(el);
        document.addEventListener('pointerdown', (e) => {
          if (Menu.isOpen() && !(e.target.closest && e.target.closest('#__dbgov-menu')))
            Menu.close();
        }, true);
}

export const Menu = {
        isOpen: () => !!el && el.classList.contains('dbgov-open'),
        /** rows: [{ label, run }] — label is all this file reads of them. */
        open(x, y, rows) {
          el.textContent = '';
          for (const r of rows) {
            const b = document.createElement('button');
            b.textContent = r.label;
            b.addEventListener('click', () => { Menu.close(); r.run(); });
            el.append(b);
          }
          el.classList.add('dbgov-open');
          // clamp AFTER the rows exist — the box has no size before they do
          const w = el.offsetWidth, h = el.offsetHeight;
          let px = Math.max(4, Math.min(x, innerWidth - w - 4));
          let py = Math.max(4, Math.min(y, innerHeight - h - 4));
          /* NEVER under the bar. The bar is the later sibling in the root, so
             it paints — and hit-tests — above this menu; opened beside it (the
             ⏻ update menu is), the bar swallowed the clicks and clipped the
             text. Same trap List.place() documents; same fix: step aside. */
          const bar = document.getElementById('__dbgov-bar');
          if (bar) {
            const b = bar.getBoundingClientRect();
            if (px < b.right && px + w > b.left && py < b.bottom && py + h > b.top) {
              px = b.left >= w + 12 ? b.left - w - 8
                : Math.min(b.right + 8, innerWidth - w - 4);
            }
          }
          el.style.left = px + 'px';
          el.style.top = py + 'px';
        },
        close() {
          if (!el) return;
          el.classList.remove('dbgov-open');
          el.textContent = '';
        },
};
