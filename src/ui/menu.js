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
          el.style.left = Math.max(4, Math.min(x, innerWidth - w - 4)) + 'px';
          el.style.top = Math.max(4, Math.min(y, innerHeight - h - 4)) + 'px';
        },
        close() {
          if (!el) return;
          el.classList.remove('dbgov-open');
          el.textContent = '';
        },
};
