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
      `<button class="dbgov-tool dbgov-whenOn ${Tools.feedsAudit(t) ? 'dbgov-checks' : ''}" data-tool="${t.id}"` +
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
          `<span class="dbgov-fam dbgov-whenOn" data-fam="${t.family}">` +
          `<button class="dbgov-fam-btn dbgov-whenOn ${kin.some(Tools.feedsAudit) ? 'dbgov-checks' : ''}"` +
          ` aria-expanded="false" title="${famName} family — ${kin.map((x) => x.id).join(', ')};` +
          ` click to open">${mark}</button>` +
          `<span class="dbgov-flyout">${kin.map(toolBtn).join('')}</span></span>`);
      }
      return out.join('');
    }).join('<hr class="dbgov-sep dbgov-whenOn">');
    // the sweep button's face, a const because setSwept puts it back after a resting count
    const SWEEP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>';   // lucide 'search' (ISC)
    el.innerHTML = `
      <span class="dbgov-grip" title="Drag to move — snaps to the nearest edge"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" /></svg></span>
      <button class="dbgov-pwr" title="Power (Alt+Shift+D) · v${CONFIG.VERSION}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></svg></button>
      <span class="dbgov-st" data-st>OFF</span>
      <hr class="dbgov-sep dbgov-whenOn">
      ${toolRuns}
      <!-- its own band: ⌕ and ⚙ drive the services, they are not tools -->
      <hr class="dbgov-sep dbgov-whenOn">
      <button class="dbgov-act dbgov-whenOn" data-sweep data-view="findings" title="Audit the whole page">${SWEEP_ICON}</button>
      <!-- with the tools it configures, not with the panel's own actions -->
      <button class="dbgov-act dbgov-whenOn" data-settings data-view="settings" title="Tool settings"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></svg></button>
      <hr class="dbgov-sep dbgov-whenOn">
      <button class="dbgov-cnt dbgov-whenOn" data-c data-view="pins" title="Pinned elements — click for the list">0</button>
      <!-- 🏷 replaces ≡: same fam flyout the domain families use, members
           handed in by the controller (setBadgeControls) — this file renders
           what it is given and never learns what a view or a facet is -->
      <span class="dbgov-fam dbgov-whenOn" data-badge>
        <button class="dbgov-fam-btn dbgov-act" title="Badge — view and facets; click to open"
                aria-haspopup="true" aria-expanded="false"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg></button>
        <span class="dbgov-flyout" data-badge-fly></span>
      </span>
      <button class="dbgov-act dbgov-whenOn" data-copy title="Copy report"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M16 4h2a2 2 0 0 1 2 2v4" /><path d="M21 14H11" /><path d="m15 10-4 4 4 4" /></svg></button>
      <button class="dbgov-act dbgov-whenOn" data-clear title="Clear pins and the audit's marks"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>`;
    root.append(el);

    // The popover is LIST's; this says where it hangs and lights up whichever
    // button opened it. Nothing else about it is the bar's business.
    List.attach({
      el,
      side: () => side,
      mark: (view) => el.querySelectorAll('[data-view]').forEach(
        (b) => {
          const on = !!view && b.dataset.view === view;
          b.classList.toggle('dbgov-armed', on);
          b.setAttribute('aria-pressed', String(on));
        }),
    });

    // button -> { original, timer } while a transient message is showing
    const flashing = new Map();

    // the 🏷 flyout's groups, kept so a settings change can re-render with
    // the axis the user had open still open
    let badgeGroups = [];
    function renderBadgeFly() {
      const fly = el.querySelector('[data-badge-fly]');
      const open = fly.dataset.open || '';
      fly.textContent = '';
      for (const g of badgeGroups) {
        /* Each axis is wrapped so its members hang BESIDE it — the next
           layer out from the bar, its own column, the way the flyout itself
           hangs beside the head. Members mixed into the heads' column read
           as one flat level, which is exactly what the axes exist to avoid. */
        const sub = document.createElement('span');
        sub.className = 'dbgov-sub';
        const h = document.createElement('button');
        // bctl, not tool: these are the badge service's controls, and every
        // test and map that enumerates button.tool means REGISTRY tools
        h.className = 'dbgov-bctl dbgov-whenOn dbgov-axis' + (open === g.key ? ' dbgov-open' : '');
        h.innerHTML = g.glyph;   // our own icon constant, never page text
        h.title = g.title;
        h.setAttribute('aria-expanded', String(open === g.key));
        h.addEventListener('click', () => {
          fly.dataset.open = open === g.key ? '' : g.key;
          renderBadgeFly();
        });
        sub.append(h);
        if (open === g.key) {
          const members = document.createElement('span');
          members.className = 'dbgov-subfly';
          for (const r of g.rows) {
            const b = document.createElement('button');
            b.className = 'dbgov-bctl dbgov-whenOn' + (r.armed ? ' dbgov-armed' : '') +
                          (r.fixed ? ' dbgov-fixed' : '');
            b.innerHTML = r.glyph;   // our own icon constant, never page text
            b.title = r.title;
            b.setAttribute('aria-pressed', String(!!r.armed));
            // a fixed member is information, not a control — it says the axis
            // has this face and that it is always on, and it takes no click
            if (r.fixed) b.setAttribute('aria-disabled', 'true');
            else b.addEventListener('click', () => api.onBadgeControl?.(r.key));
            members.append(b);
          }
          sub.append(members);
        }
        fly.append(sub);
      }
    }

    const api = {
      el,
      onToggle: null, onTool: null, onBadgeControl: null, onCopy: null,
      onClear: null, onListOpen: null, onRowActivate: null, onRowRemove: null,
      onSweep: null, onRowChange: null,
      setOn(v) {
        /* NO `inert` here, ever. It was added to take the overlay out of the
           tab order when powered off — but inert covers the WHOLE subtree, and
           that includes the two controls which must never stop working: the ⏻
           button and the ⋮⋮ grip. Shipped in v3.8.48 and it left the panel dead
           to the mouse when off, reachable only by the hotkey.

           It was redundant as well as harmful: `.whenOn` and the popover are
           already `display: none` when off, which removes them from the tab
           order and the accessibility tree by itself. */
        el.classList.toggle('dbgov-on', v);
        el.querySelector('[data-st]').textContent = v ? 'ON' : 'OFF';
        if (!v) api.toggleList(false);
        if (v) { clearTimeout(tuckTimer); untuck(); } else scheduleTuck();
      },
      /**
       * Move the pin-count chip to sit right after one tool's button — the
       * controller says which, by an id this file hands straight back the
       * way it hands back view names. Null (no such tool registered) leaves
       * the chip where the template put it, so this cannot strand it.
       */
      attachCount(toolId) {
        const t = toolId && el.querySelector(`[data-tool="${toolId}"]`);
        if (t) t.insertAdjacentElement('afterend', el.querySelector('[data-c]'));
      },
      setTool(id, v) {
        const b = el.querySelector(`[data-tool="${id}"]`);
        b?.classList.toggle('dbgov-armed', v);
        b?.setAttribute('aria-pressed', String(!!v));
        // the family mark shows armed when ANY member is armed
        const fam = b?.closest('.dbgov-fam');
        if (fam) fam.querySelector('.dbgov-fam-btn')
          .classList.toggle('dbgov-armed', !!fam.querySelector('.dbgov-tool.dbgov-armed'));
      },
      /**
       * The 🏷 flyout, two levels: AXIS heads at rest, and only the pressed
       * axis shows its members — four flat buttons made two different axes
       * read as one soup. Rendered from whatever the controller hands over:
       * groups of { key, glyph, title, rows: [{ key, glyph, title, armed,
       * fixed }] }. This file never learns what a view or a facet IS — keys
       * go straight back through the callback, the way data-view names do.
       *
       * Which axis is open lives on the flyout element, so re-rendering
       * after a change (armed must show the value in force) does not slam
       * the drawer shut; reopening 🏷 starts collapsed again.
       */
      setBadgeControls(groups) {
        badgeGroups = groups;
        renderBadgeFly();
      },
      /* A flyout is an overlay, so Escape has to reach it — it did not, and
         the comment above the fam-btn handler claimed otherwise. Shaped like
         Menu's isOpen/close so app/ can put it in the one dismissal ladder
         without ui/ learning anything about app/. Closing collapses the badge
         drawer too: which axis is open is furniture, not a choice. */
      isFlyoutOpen: () => !!el.querySelector('.dbgov-fam.dbgov-open'),
      closeFlyouts() {
        el.querySelectorAll('.dbgov-fam.dbgov-open').forEach((f) => {
          f.classList.remove('dbgov-open');
          f.querySelector('.dbgov-fam-btn')?.setAttribute('aria-expanded', 'false');
        });
        const fly = el.querySelector('[data-badge-fly]');
        if (fly && fly.dataset.open) { fly.dataset.open = ''; renderBadgeFly(); }
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
        b.classList.toggle('dbgov-swept', !!v);
        // the resting count replaces the icon; clearing puts the icon back
        if (v) b.textContent = String(n);
        else b.innerHTML = SWEEP_ICON;
        const what = v ? `Audit: ${n} distinct problem${n === 1 ? '' : 's'} — click to re-run`
          : 'Audit the whole page';
        b.title = what;
        b.setAttribute('aria-label', what);
      },
      setRemoveMode(v) {
        el.classList.toggle('dbgov-removing', v);
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
        // innerHTML, not textContent: the resting face of a button is an
        // inline SVG now, and saving only its text restored an empty button
        const original = live ? live.original : b.innerHTML;
        if (live) clearTimeout(live.timer);
        b.textContent = msg;
        flashing.set(b, {
          original,
          timer: setTimeout(() => {
            b.innerHTML = original;
            flashing.delete(b);
          }, CONFIG.FLASH_MS),
        });
      },
      rect: () => el.getBoundingClientRect(),
      isOn: () => el.classList.contains('dbgov-on'),
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
    el.querySelectorAll('[data-tool], [data-view]')
      .forEach((b) => b.setAttribute('aria-pressed', 'false'));

    el.querySelector('.dbgov-pwr').addEventListener('click', () => api.onToggle?.());
    /* The family flyout: click the mark to slide the members out; click it
       again, pick a member, press Escape via the panel path, or click
       anywhere else to close. Only ever one open. */
    el.querySelectorAll('.dbgov-fam-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const fam = b.parentElement;
        const open = !fam.classList.contains('dbgov-open');
        api.closeFlyouts();
        fam.classList.toggle('dbgov-open', open);
        b.setAttribute('aria-expanded', String(open));
      });
    });
    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('.dbgov-fam')) return;
      api.closeFlyouts();
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
    // reopening 🏷 starts at the axis level again — the drawer position is
    // session furniture, not a choice worth remembering
    el.querySelector('[data-badge] .dbgov-fam-btn').addEventListener('click', () => {
      const fly = el.querySelector('[data-badge-fly]');
      if (fly.dataset.open) { fly.dataset.open = ''; renderBadgeFly(); }
    });

    el.querySelector('[data-c]').addEventListener('click', () => api.toggleList(undefined, 'pins'));
    el.querySelector('[data-settings]').addEventListener('click', () => api.toggleList(undefined, 'settings'));
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
    function untuck() { el.classList.remove('dbgov-tucked'); el.style.transform = ''; }
    function tuck() {
      untuck();
      const r = el.getBoundingClientRect();
      let t = '';
      if (side === 'right')  t = `translateX(${Math.round(innerWidth - CONFIG.PEEK - r.left)}px)`;
      if (side === 'left')   t = `translateX(${Math.round(CONFIG.PEEK - r.right)}px)`;
      if (side === 'bottom') t = `translateY(${Math.round(innerHeight - CONFIG.PEEK - r.top)}px)`;
      if (side === 'top')    t = `translateY(${Math.round(CONFIG.PEEK - r.bottom)}px)`;
      el.classList.add('dbgov-tucked');
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
      el.classList.add('dbgov-dragging');
      applyPos(e.clientX - drag.dx, e.clientY - drag.dy);
      if (List.isOpen()) List.place();
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      el.classList.remove('dbgov-dragging');
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
