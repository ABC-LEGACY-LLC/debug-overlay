import { CONFIG } from '../core/config.js';
import { Tools } from '../core/registry.js';
import { Store } from '../core/state.js';
import { root } from './dom.js';
import { List } from './list.js';
  /* ======================================================================
     PANEL — self-contained; talks out only via callbacks
     ====================================================================== */
  export let Panel;
  /** Deferred: builds DOM, so it runs from BOOT, not at import. */
  export function initPanel() {
  Panel = (() => {
    const el = document.createElement('div');
    el.id = '__dbgov-bar';
    // Tool buttons come from the registry — never hardcoded — and so does the
    // grouping. This file draws the runs it is handed, in order, with a rule
    // between them; what puts a tool in one run rather than another is not
    // its business.
    /**
     * A tool whose family has a MARK renders as a family button (🎨) whose
     * members slide out sideways — toward the open side of the screen, read
     * off data-side. The member buttons are the ordinary tool buttons, just
     * housed in the flyout: same [data-tool], same click and right-click
     * wiring, so arming and menus need no second code path. One button per
     * family, so a family that grows shrinks the bar rather than growing it.
     */
    const toolBtn = (t) =>
      `<button class="tool whenOn ${Tools.feedsAudit(t) ? 'checks' : ''}" data-tool="${t.id}"` +
      ` title="${t.family ? t.family[0].toUpperCase() + t.family.slice(1) + ' › ' : ''}` +
      `${t.title}\n${Tools.rolesOf(t).join(' · ')}` +
      `${Tools.feedsAudit(t) ? ' · also runs in the page audit' : ''}` +
      `${t.options || t.uses ? '\nright-click for its options' : ''}">${t.icon}</button>`;
    const toolRuns = Tools.runs().map((run) => {
      const out = [];
      const done = new Set();
      for (const t of run.tools) {
        const mark = t.family && Tools.familyMark(t.family);
        if (!mark) { out.push(toolBtn(t)); continue; }
        if (done.has(t.family)) continue;
        done.add(t.family);
        const kin = run.tools.filter((x) => x.family === t.family);
        const famName = t.family[0].toUpperCase() + t.family.slice(1);
        out.push(
          `<span class="fam whenOn">` +
          `<button class="fam-btn whenOn ${kin.some(Tools.feedsAudit) ? 'checks' : ''}"` +
          ` aria-expanded="false" title="${famName} family — ${kin.map((x) => x.id).join(', ')};` +
          ` click to open">${mark}</button>` +
          `<span class="flyout">${kin.map(toolBtn).join('')}</span></span>`);
      }
      return out.join('');
    }).join('<hr class="sep whenOn">');
    el.innerHTML = `
      <span class="grip" title="Drag to move — snaps to the nearest edge">⋮⋮</span>
      <button class="pwr" title="Power (Alt+Shift+D) · v${CONFIG.VERSION}">⏻</button>
      <span class="st" data-st>OFF</span>
      <hr class="sep whenOn">
      ${toolRuns}
      <!-- its own band: ⌕ and ⚙ drive the services, they are not tools -->
      <hr class="sep whenOn">
      <button class="act whenOn" data-sweep data-view="findings" title="Audit the whole page">⌕</button>
      <!-- with the tools it configures, not with the panel's own actions -->
      <button class="act whenOn" data-settings data-view="settings" title="Tool settings">⚙</button>
      <hr class="sep whenOn">
      <button class="cnt whenOn" data-c data-view="pins" title="Pinned elements — click for the list">0</button>
      <button class="act whenOn" data-detail title="Compact / full badges">≡</button>
      <button class="act whenOn" data-copy title="Copy report">⧉</button>
      <button class="act whenOn" data-clear title="Clear pins and the audit's marks">✕</button>`;
    root.append(el);

    // The popover is LIST's; this says where it hangs and lights up whichever
    // button opened it. Nothing else about it is the bar's business.
    List.attach({
      el,
      side: () => side,
      mark: (view) => el.querySelectorAll('[data-view]').forEach(
        (b) => {
          const on = !!view && b.dataset.view === view;
          b.classList.toggle('armed', on);
          b.setAttribute('aria-pressed', String(on));
        }),
    });

    // button -> { original, timer } while a transient message is showing
    const flashing = new Map();

    const api = {
      el,
      onToggle: null, onTool: null, onDetail: null, onCopy: null, onClear: null,
      onListOpen: null, onRowActivate: null, onRowRemove: null, onSweep: null,
      onRowChange: null,
      setOn(v) {
        /* NO `inert` here, ever. It was added to take the overlay out of the
           tab order when powered off — but inert covers the WHOLE subtree, and
           that includes the two controls which must never stop working: the ⏻
           button and the ⋮⋮ grip. Shipped in v3.8.48 and it left the panel dead
           to the mouse when off, reachable only by the hotkey.

           It was redundant as well as harmful: `.whenOn` and the popover are
           already `display: none` when off, which removes them from the tab
           order and the accessibility tree by itself. */
        el.classList.toggle('on', v);
        el.querySelector('[data-st]').textContent = v ? 'ON' : 'OFF';
        if (!v) api.toggleList(false);
        if (v) { clearTimeout(tuckTimer); untuck(); } else scheduleTuck();
      },
      setTool(id, v) {
        const b = el.querySelector(`[data-tool="${id}"]`);
        b?.classList.toggle('armed', v);
        b?.setAttribute('aria-pressed', String(!!v));
        // the family mark shows armed when ANY member is armed
        const fam = b?.closest('.fam');
        if (fam) fam.querySelector('.fam-btn')
          .classList.toggle('armed', !!fam.querySelector('.tool.armed'));
      },
      setDetail(v) {
        const b = el.querySelector('[data-detail]');
        b.classList.toggle('armed', v);
        b.setAttribute('aria-pressed', String(!!v));
      },
      /**
       * Whether an audit is currently showing on the page. The ⌕ flash is
       * transient by design, so once it expired the bar said "no audit has
       * run" while the page was still wearing its outlines, and nothing in
       * the bar admitted they existed or removed them. One state now drives
       * both the button and the marks.
       */
      /**
       * Whether an audit is showing, and how much it found.
       *
       * The count used to be a 1.2s flash, so once it expired the bar could not
       * answer "does this page have problems?" without opening the panel — and
       * the marks stayed on the page with nothing admitting they were there.
       * It rests on the button now. It is safe to show a bare number here only
       * because the panel header names both quantities ("N distinct problems ·
       * M occurrences"); two unlabelled numbers on one bar was the original
       * complaint, and the label is what fixed it, not hiding one of them.
       */
      setSwept(v, n) {
        const b = el.querySelector('[data-sweep]');
        b.classList.toggle('swept', !!v);
        b.textContent = v ? String(n) : '⌕';
        const what = v ? `Audit: ${n} distinct problem${n === 1 ? '' : 's'} — click to re-run`
          : 'Audit the whole page';
        b.title = what;
        b.setAttribute('aria-label', what);
      },
      setRemoveMode(v) {
        el.classList.toggle('removing', v);
        const st = el.querySelector('[data-st]');
        st.textContent = v ? 'DEL' : (api.isOn() ? 'ON' : 'OFF');
      },
      setCount(n) { el.querySelector('[data-c]').textContent = String(n); },

      // The popover's own surface, forwarded so CONTROLLER and BOOT still have
      // one thing to talk to. What it renders is LIST's business, not this
      // file's — that is the whole point of the split.
      isListOpen: List.isOpen,
      view: List.view,
      toggleList: List.toggle,
      setList: List.set,

      /**
       * Two flashes on one button inside the window left the message there for
       * good: the second captured the first's text as "the original" and its
       * timer, firing last, wrote that back. ⌕ twice in a second was enough,
       * and the button then read "0" forever.
       */
      flash(msg, sel = '[data-copy]') {
        const b = el.querySelector(sel);
        if (!b) return;
        const live = flashing.get(b);
        const original = live ? live.original : b.textContent;
        if (live) clearTimeout(live.timer);
        b.textContent = msg;
        flashing.set(b, {
          original,
          timer: setTimeout(() => {
            b.textContent = original;
            flashing.delete(b);
          }, CONFIG.FLASH_MS),
        });
      },
      rect: () => el.getBoundingClientRect(),
      isOn: () => el.classList.contains('on'),
    };

    // LIST's events arrive as the panel's own, so BOOT still wires one object
    // and nothing outside had to learn that the popover moved house.
    List.onOpen = (v) => api.onListOpen?.(v);
    List.onRowActivate = (i) => api.onRowActivate?.(i);
    List.onRowRemove = (i) => api.onRowRemove?.(i);
    List.onRowChange = (i, raw) => api.onRowChange?.(i, raw);

    /* A glyph is not a name. Every control carries a title for sighted users;
       the first clause of it is the accessible name, and every toggle says
       whether it is on — a screen reader had no way to tell an armed tool from
       a disarmed one, because "armed" was a CSS class and nothing else. */
    el.querySelectorAll('button').forEach((b) => {
      const name = (b.title || '').split(/[\n·—]/)[0].trim();
      if (name) b.setAttribute('aria-label', name);
    });
    el.querySelectorAll('[data-tool], [data-detail], [data-view]')
      .forEach((b) => b.setAttribute('aria-pressed', 'false'));

    el.querySelector('.pwr').addEventListener('click', () => api.onToggle?.());
    /* The family flyout: click the mark to slide the members out; click it
       again, pick a member, press Escape via the panel path, or click
       anywhere else to close. Only ever one open. */
    el.querySelectorAll('.fam-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const fam = b.parentElement;
        const open = !fam.classList.contains('open');
        el.querySelectorAll('.fam.open').forEach((f) => {
          f.classList.remove('open');
          f.querySelector('.fam-btn').setAttribute('aria-expanded', 'false');
        });
        fam.classList.toggle('open', open);
        b.setAttribute('aria-expanded', String(open));
      });
    });
    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('.fam')) return;
      el.querySelectorAll('.fam.open').forEach((f) => {
        f.classList.remove('open');
        f.querySelector('.fam-btn').setAttribute('aria-expanded', 'false');
      });
    }, true);

    el.querySelectorAll('[data-tool]').forEach((b) => {
      b.addEventListener('click', () => api.onTool?.(b.dataset.tool));
      /* Right-click opens THIS tool's options and nothing else. The view name
         carries the id the way 'pins' and 'findings' carry theirs — opaque to
         this file, handed straight back, so the panel still never learns what
         any of them mean. preventDefault because the browser menu over our own
         button helps nobody; the PAGE's menu is untouched. */
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        api.toggleList(undefined, `tool:${b.dataset.tool}`);
      });
    });
    el.querySelector('[data-c]').addEventListener('click', () => api.toggleList(undefined, 'pins'));
    el.querySelector('[data-settings]').addEventListener('click', () => api.toggleList(undefined, 'settings'));
    el.querySelector('[data-detail]').addEventListener('click', () => api.onDetail?.());
    el.querySelector('[data-sweep]').addEventListener('click', () => api.onSweep?.());
    el.querySelector('[data-copy]').addEventListener('click', () => api.onCopy?.());
    el.querySelector('[data-clear]').addEventListener('click', () => api.onClear?.());

    // --- position: restore / clamp / snap / persist
    let side = 'right';
    function applyPos(x, y) {
      el.dataset.side = side;
      const r = el.getBoundingClientRect();
      x = Math.max(4, Math.min(x, innerWidth - r.width - 4));
      y = Math.max(4, Math.min(y, innerHeight - r.height - 4));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.right = 'auto';
      return { x, y };
    }
    function snap() {
      const r = el.getBoundingClientRect();
      const d = { left: r.left, right: innerWidth - r.right, top: r.top, bottom: innerHeight - r.bottom };
      side = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b));
      let x = r.left, y = r.top;
      if (side === 'left') x = CONFIG.EDGE_MARGIN;
      if (side === 'right') x = innerWidth - r.width - CONFIG.EDGE_MARGIN;
      if (side === 'top') y = CONFIG.EDGE_MARGIN;
      if (side === 'bottom') y = innerHeight - r.height - CONFIG.EDGE_MARGIN;
      const p = applyPos(x, y);
      Store.set(CONFIG.POS_KEY, JSON.stringify({ x: p.x, y: p.y, side }));
    }
    (function restore() {
      try {
        const s = JSON.parse(Store.get(CONFIG.POS_KEY) || 'null');
        if (s) { side = s.side || 'right'; applyPos(s.x, s.y); return; }
      } catch {}
      applyPos(innerWidth - 60, innerHeight / 2 - 110);
    })();

    // --- auto-tuck (only while powered off)
    let tuckTimer = 0;
    function untuck() { el.classList.remove('tucked'); el.style.transform = ''; }
    function tuck() {
      untuck();
      const r = el.getBoundingClientRect();
      let t = '';
      if (side === 'right')  t = `translateX(${Math.round(innerWidth - CONFIG.PEEK - r.left)}px)`;
      if (side === 'left')   t = `translateX(${Math.round(CONFIG.PEEK - r.right)}px)`;
      if (side === 'bottom') t = `translateY(${Math.round(innerHeight - CONFIG.PEEK - r.top)}px)`;
      if (side === 'top')    t = `translateY(${Math.round(CONFIG.PEEK - r.bottom)}px)`;
      el.classList.add('tucked');
      el.style.transform = t;
    }
    function scheduleTuck() {
      clearTimeout(tuckTimer);
      if (api.isOn() || List.isOpen()) { untuck(); return; }
      tuckTimer = setTimeout(() => {
        if (!api.isOn() && !el.matches(':hover')) tuck();
      }, CONFIG.TUCK_DELAY);
    }
    el.addEventListener('pointerenter', () => { clearTimeout(tuckTimer); untuck(); });
    el.addEventListener('pointerleave', scheduleTuck);

    // --- drag (buttons keep working)
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      untuck();
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      el.classList.add('dragging');
      applyPos(e.clientX - drag.dx, e.clientY - drag.dy);
      if (List.isOpen()) List.place();
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      el.classList.remove('dragging');
      snap();
      scheduleTuck();
      if (List.isOpen()) List.place();
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    addEventListener('resize', () => { snap(); if (List.isOpen()) List.place(); });

    return api;
  })();
  }
