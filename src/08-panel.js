  /* ======================================================================
     8. PANEL — self-contained; talks out only via callbacks
     ====================================================================== */
  const Panel = (() => {
    const el = document.createElement('div');
    el.id = '__dbgov-bar';
    // Tool buttons come from the registry — never hardcoded — and so does the
    // grouping. This file draws the runs it is handed, in order, with a rule
    // between them; what puts a tool in one run rather than another is not
    // its business.
    const toolRuns = Tools.runs().map((run) => run.tools.map((t) =>
      `<button class="tool whenOn ${run.cls}" data-tool="${t.id}"` +
      ` title="${t.title}${run.note}">${t.icon}</button>`).join(''))
      .join('<hr class="sep whenOn">');
    el.innerHTML = `
      <span class="grip" title="Drag to move — snaps to the nearest edge">⋮⋮</span>
      <button class="pwr" title="Power (Alt+Shift+D) · v${CONFIG.VERSION}">⏻</button>
      <span class="st" data-st>OFF</span>
      <hr class="sep whenOn">
      ${toolRuns}
      <!-- next to the run it acts on, so proximity says what it sweeps -->
      <button class="act whenOn" data-sweep data-view="findings" title="Audit the whole page">⌕</button>
      <!-- with the tools it configures, not with the panel's own actions -->
      <button class="act whenOn" data-settings data-view="settings" title="Tool settings">⚙</button>
      <hr class="sep whenOn">
      <button class="cnt whenOn" data-c data-view="pins" title="Pinned elements — click for the list">0</button>
      <button class="act whenOn" data-detail title="Compact / full badges">≡</button>
      <button class="act whenOn" data-copy title="Copy report">⧉</button>
      <button class="act whenOn" data-clear title="Clear pins">✕</button>`;
    root.append(el);

    // The popover is LIST's; this says where it hangs and lights up whichever
    // button opened it. Nothing else about it is the bar's business.
    List.attach({
      el,
      side: () => side,
      mark: (view) => el.querySelectorAll('[data-view]').forEach(
        (b) => b.classList.toggle('armed', !!view && b.dataset.view === view)),
    });

    const api = {
      el,
      onToggle: null, onTool: null, onDetail: null, onCopy: null, onClear: null,
      onListOpen: null, onRowActivate: null, onRowRemove: null, onSweep: null,
      onRowChange: null,
      setOn(v) {
        el.classList.toggle('on', v);
        el.querySelector('[data-st]').textContent = v ? 'ON' : 'OFF';
        if (!v) api.toggleList(false);
        if (v) { clearTimeout(tuckTimer); untuck(); } else scheduleTuck();
      },
      setTool(id, v) {
        el.querySelector(`[data-tool="${id}"]`)?.classList.toggle('armed', v);
      },
      setDetail(v) { el.querySelector('[data-detail]').classList.toggle('armed', v); },
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

      flash(msg, sel = '[data-copy]') {
        const b = el.querySelector(sel);
        const old = b.textContent;
        b.textContent = msg;
        setTimeout(() => (b.textContent = old), 1200);
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

    el.querySelector('.pwr').addEventListener('click', () => api.onToggle?.());
    el.querySelectorAll('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => api.onTool?.(b.dataset.tool)));
    el.querySelector('[data-c]').addEventListener('click', () => api.toggleList(undefined, 'pins'));
    el.querySelector('[data-settings]').addEventListener('click', () => api.toggleList(undefined, 'settings'));
    el.querySelector('[data-detail]').addEventListener('click', () => api.onDetail?.());
    el.querySelector('[data-sweep]').addEventListener('click', () => api.onSweep?.());
    el.querySelector('[data-copy]').addEventListener('click', () => api.onCopy?.());
    el.querySelector('[data-clear]').addEventListener('click', () => api.onClear?.());

    // --- position: restore / clamp / snap / persist
    let side = 'right';
    function applyPos(x, y) {
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
