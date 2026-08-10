  /* ======================================================================
     8. PANEL — self-contained; talks out only via callbacks
     ====================================================================== */
  const Panel = (() => {
    const el = document.createElement('div');
    el.id = '__dbgov-bar';
    // tool buttons are generated from the registry — never hardcoded
    const toolButtons = TOOLS.map((t) =>
      `<button class="tool whenOn" data-tool="${t.id}" title="${t.title}">${t.icon}</button>`).join('');
    el.innerHTML = `
      <span class="grip" title="Drag to move — snaps to the nearest edge">⋮⋮</span>
      <button class="pwr" title="Power (Alt+Shift+D)">⏻</button>
      <span class="st" data-st>OFF</span>
      <hr class="sep whenOn">
      ${toolButtons}
      <hr class="sep whenOn">
      <button class="cnt whenOn" data-c title="Pinned elements — click for the list">0</button>
      <button class="act whenOn" data-detail title="Compact / full badges">≡</button>
      <button class="act whenOn" data-sweep title="Audit the whole page">⌕</button>
      <button class="act whenOn" data-copy title="Copy report">⧉</button>
      <button class="act whenOn" data-clear title="Clear pins">✕</button>`;
    root.append(el);

    // ---- pin list popover (opened from the count chip) ------------------
    const listEl = document.createElement('div');
    listEl.id = '__dbgov-list';
    root.append(listEl);
    let listOpen = false;

    function placeList() {
      const r = el.getBoundingClientRect();
      const w = listEl.offsetWidth, h = listEl.offsetHeight;
      let x, y;
      if (side === 'left')       { x = r.right + 10; y = r.top; }
      else if (side === 'right') { x = r.left - w - 10; y = r.top; }
      else if (side === 'top')   { x = r.left - w / 2 + r.width / 2; y = r.bottom + 10; }
      else                       { x = r.left - w / 2 + r.width / 2; y = r.top - h - 10; }
      listEl.style.left = Math.max(6, Math.min(x, innerWidth - w - 6)) + 'px';
      listEl.style.top = Math.max(6, Math.min(y, innerHeight - h - 6)) + 'px';
    }

    const api = {
      el,
      onToggle: null, onTool: null, onDetail: null, onCopy: null, onClear: null,
      onListOpen: null, onRowActivate: null, onRowRemove: null, onSweep: null,
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

      isListOpen: () => listOpen,
      toggleList(v) {
        listOpen = v === undefined ? !listOpen : v;
        listEl.classList.toggle('open', listOpen);
        el.querySelector('[data-c]').classList.toggle('armed', listOpen);
        if (listOpen) { api.onListOpen?.(); placeList(); }
      },
      /** rows: [{ tag, label, detail, pins }] — built by CONTROLLER */
      setList(rows) {
        listEl.textContent = '';
        if (!rows.length) {
          const empty = document.createElement('div');
          empty.className = 'empty';
          empty.textContent = 'No pins yet — click to inspect, Shift+click to measure.';
          listEl.append(empty);
          placeList();
          return;
        }
        rows.forEach((row, i) => {
          const r = document.createElement('div');
          r.className = 'row';
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = row.tag;
          const lbl = document.createElement('span');
          lbl.className = 'lbl';
          lbl.textContent = row.label;           // textContent: page text is never HTML here
          const det = document.createElement('span');
          det.className = 'det';
          det.textContent = row.detail || '';
          const rm = document.createElement('button');
          rm.className = 'rm';
          rm.textContent = '✕';
          rm.title = 'Remove';
          rm.addEventListener('click', (e) => { e.stopPropagation(); api.onRowRemove?.(i); });
          r.addEventListener('click', () => api.onRowActivate?.(i));
          r.append(tag, lbl, det, rm);
          listEl.append(r);
        });
        placeList();
      },
      flash(msg, sel = '[data-copy]') {
        const b = el.querySelector(sel);
        const old = b.textContent;
        b.textContent = msg;
        setTimeout(() => (b.textContent = old), 1200);
      },
      rect: () => el.getBoundingClientRect(),
      isOn: () => el.classList.contains('on'),
    };

    el.querySelector('.pwr').addEventListener('click', () => api.onToggle?.());
    el.querySelectorAll('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => api.onTool?.(b.dataset.tool)));
    el.querySelector('[data-c]').addEventListener('click', () => api.toggleList());
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
      try { localStorage.setItem(CONFIG.POS_KEY, JSON.stringify({ x: p.x, y: p.y, side })); } catch {}
    }
    (function restore() {
      try {
        const s = JSON.parse(localStorage.getItem(CONFIG.POS_KEY) || 'null');
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
      if (api.isOn() || listOpen) { untuck(); return; }
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
      if (listOpen) placeList();
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      el.classList.remove('dragging');
      snap();
      scheduleTuck();
      if (listOpen) placeList();
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    addEventListener('resize', () => { snap(); if (listOpen) placeList(); });

    return api;
  })();
