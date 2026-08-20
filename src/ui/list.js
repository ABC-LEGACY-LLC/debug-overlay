import { CONFIG } from '../core/config.js';
import { Controls } from './controls.js';
import { root } from './dom.js';
  /* ======================================================================
    LIST — the popover the panel opens

        Split out of PANEL, which was doing two jobs: a bar of buttons that
        drags and snaps, and a list that renders rows. They share only an
        anchor — the popover has to know where the bar is and which edge it
        sits against — so that is all this is given, as a small object PANEL
        hands over.

        Defined BEFORE the panel so nothing here is in scope before it exists;
        the panel attaches to it on the way up.
     ====================================================================== */
  export let List;
  /** Deferred: builds DOM, so it runs from BOOT, not at import. */
  export function initList() {
  List = (() => {
    const el = document.createElement('div');
    el.id = '__dbgov-list';
    root.append(el);
    let open = false;
    let view = null;      // opaque name of whichever view is showing
    let anchor = null;    // { el, side(), mark(view) } — supplied by PANEL

    /**
     * Put the popover beside the bar, and NEVER under it.
     *
     * The bar is the later sibling in the root and neither declares a z-index,
     * so inside the root's stacking context the bar paints — and hit-tests —
     * above this. An overlap is therefore not cosmetic: the bar swallows
     * clicks meant for the rows beneath it. Restacking is the wrong fix, since
     * putting the popover on top would bury the button you close it with.
     *
     * So: four candidate placements, each clamped into the viewport FIRST and
     * only then tested for whether it still clears the bar. Preference follows
     * the edge the bar snapped to, which keeps the ordinary case exactly where
     * it has always been; the rest are fallbacks for when the clamp bites.
     */
    function place() {
      if (!anchor) return;
      const r = anchor.el.getBoundingClientRect();
      const w = el.offsetWidth, h = el.offsetHeight;
      const G = CONFIG.LIST_GAP, P = CONFIG.LIST_PAD;
      const at = (x, y) => ({
        x: Math.max(P, Math.min(x, innerWidth - w - P)),
        y: Math.max(P, Math.min(y, innerHeight - h - P)),
      });
      const beside = {
        right: () => at(r.left - w - G, r.top),
        left: () => at(r.right + G, r.top),
        below: () => at(r.left + r.width / 2 - w / 2, r.bottom + G),
        above: () => at(r.left + r.width / 2 - w / 2, r.top - h - G),
      };
      const side = anchor.side();
      const order = side === 'left' ? ['left', 'right', 'below', 'above']
        : side === 'right' ? ['right', 'left', 'below', 'above']
          : side === 'top' ? ['below', 'right', 'left', 'above']
            : ['above', 'right', 'left', 'below'];
      const clears = (c) => c.x + w <= r.left || c.x >= r.right ||
                            c.y + h <= r.top || c.y >= r.bottom;
      const tried = order.map((k) => beside[k]());
      const pick = tried.find(clears) || tried[0];
      el.style.left = pick.x + 'px';
      el.style.top = pick.y + 'px';
    }

    const api = {
      onOpen: null, onRowActivate: null, onRowRemove: null, onRowChange: null,

      /** PANEL says where it is and how to light up the button that opened us. */
      attach(a) { anchor = a; },

      isOpen: () => open,
      /**
       * One popover, several views. `view` is an opaque name off the button
       * that opened it — this carries it and hands it back, and never learns
       * what any of them mean.
       */
      view: () => view,
      place,

      toggle(v, name = 'pins') {
        const same = open && view === name;
        open = v === undefined ? !same : !!v;
        view = open ? name : null;
        el.classList.toggle('open', open);
        anchor?.mark(view);
        if (open) { api.onOpen?.(view); place(); }
      },

      /**
       * rows: [{ tag, label, detail, removable }] — built by CONTROLLER, which
       * is also where the empty-state wording comes from, because only it
       * knows what this view is a list of.
       *
       * A row may carry a `control` description instead of a detail. This
       * draws it and hands back whatever the widget produced — an index, a
       * string, a boolean. It cannot learn what the setting is or what type
       * its value has, and so cannot start deciding any of that.
       */
      set(rows, empty = '') {
        el.textContent = '';
        if (!rows.length) {
          const e = document.createElement('div');
          e.className = 'empty';
          e.textContent = empty;
          el.append(e);
          place();
          return;
        }
        rows.forEach((row, i) => {
          /* A heading is a row like any other so that INDICES STILL LINE UP:
             the panel hands back the index it was given, and if headings were
             a separate structure every row under one would be off by however
             many came before it — changing the wrong setting entirely. It is
             not clickable and carries no control, so nothing can be fired
             from it. */
          if (row.title || row.heading) {
            const h = document.createElement('div');
            h.className = row.title ? 'viewhead' : 'head';
            h.textContent = row.title || row.heading;
            /* A heading that OWNS things may carry a ✕ like any row — wired
               through the same onRowRemove with the same index, so whoever
               handles it resolves this row in rows(view) like every other.
               The heading itself stays unclickable; only the ✕ acts. */
            if (row.removable) {
              const rm = document.createElement('button');
              rm.className = 'rm';
              rm.textContent = '✕';
              rm.title = row.rmTitle || 'Remove';
              rm.addEventListener('click', (e) => { e.stopPropagation(); api.onRowRemove?.(i); });
              h.append(rm);
            }
            if (row.detail) {
              const n = document.createElement('span');
              n.className = 'note';
              n.textContent = row.detail;
              h.append(n);
            }
            el.append(h);
            return;
          }
          const r = document.createElement('div');
          r.className = 'row';
          const tag = document.createElement('span');
          tag.className = 'tag';
          /* A tag is never page text — it is a tool's declared icon, a
             severity word, or a number this code built — so an SVG icon may
             render as markup. LABELS and details stay textContent below:
             page text flows through those, and a hostile id must stay inert. */
          if (/^<svg[\s>]/.test(row.tag || '')) tag.innerHTML = row.tag;
          else tag.textContent = row.tag;
          const lbl = document.createElement('span');
          lbl.className = 'lbl';
          lbl.textContent = row.label;         // textContent: page text is never HTML here
          // carried, not interpreted — the stylesheet decides what it means
          if (row.accent) r.dataset.accent = row.accent;
          if (row.inert) r.classList.add('inert');
          r.addEventListener('click', () => api.onRowActivate?.(i));
          if (row.control) {
            r.append(tag, lbl, Controls.build(row.control, (raw) => api.onRowChange?.(i, raw)));
          } else {
            const det = document.createElement('span');
            det.className = 'det';
            det.textContent = row.detail || '';
            r.append(tag, lbl, det);
          }
          // Only rows that own something can drop it. A finding is a fact
          // about the page; there is nothing there for a ✕ to remove.
          if (row.removable) {
            const rm = document.createElement('button');
            rm.className = 'rm';
            rm.textContent = '✕';
            rm.title = 'Remove';
            rm.addEventListener('click', (e) => { e.stopPropagation(); api.onRowRemove?.(i); });
            r.append(rm);
          }
          el.append(r);
        });
        place();
      },
    };
    return api;
  })();
  }
