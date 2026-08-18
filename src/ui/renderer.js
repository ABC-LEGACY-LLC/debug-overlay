  /* ======================================================================
    RENDERER
     ====================================================================== */
  const Render = (() => {
    let raf = 0;

    function now() {
      layer.textContent = '';
      Place.reset();
      if (!State.enabled) return;

      // The popover renders rows by index and hands that index back. Dropping
      // a pin here without telling it left every row after the gap resolving
      // one position too far — clicking ✕ on #3 deleted #2. UI may not call
      // APP, so it announces and BOOT decides who listens.
      const had = State.pins.length;
      State.pins = State.pins.filter((p) => document.contains(p.el));
      if (State.pins.length !== had) Render.onPinsPruned?.();
      const pinned = new Set(State.pins.map((p) => p.el));

      // a tool may mark one pin as "still being chosen" — the renderer just asks
      let pendingIdx = -1;
      for (const t of Tools.active()) {
        const idx = t.pendingIndex?.call(t) ?? -1;
        if (idx >= 0) { pendingIdx = idx; break; }
      }

      // 1) outlines + pin numbers, styled by pin kind
      const pinInfo = State.pins.map((p, idx) => {
        const waiting = idx === pendingIdx;
        // class comes straight from the pin's kind — no tool ids in here
        const isTarget = State.removeMode && State.removeTarget === p;
        const isFlash = State.flashPins && State.flashPins.includes(p);
        const kindCls = ` ${p.kind}` + (waiting ? ' waiting' : '') +
                        (isTarget ? ' rmtarget' : '') + (isFlash ? ' flash' : '');
        const i = U.info(p.el);
        const box = document.createElement('div');
        box.className = 'dbgov-box dbgov-pinbox' + kindCls;
        Place.put(box, i.r.left, i.r.top, i.r.width, i.r.height);
        const n = document.createElement('div');
        n.className = 'dbgov-pin-num' + kindCls;
        n.textContent = waiting ? p.id + '…' : p.id;
        layer.append(box, n);
        /* A pin scrolled out of view used to have its number CLAMPED to the
           viewport edge, so two stranded chips ended up sitting on the page's
           own header reading as though they described it. The box tracks the
           true rect correctly; it is the clamp that lies. Off-screen pins are
           the pin list's job — it exists to reach exactly those. */
        // STRICTLY outside: an element touching an edge, or a degenerate 0x0
        // rect at the origin, is still somewhere you can look at.
        const onScreen = !(i.r.bottom < 0 || i.r.top > innerHeight ||
                           i.r.right < 0 || i.r.left > innerWidth);
        if (onScreen) {
          const nx = Math.max(2, i.r.left - 10), ny = Math.max(2, i.r.top - 10);
          Place.put(n, nx, ny);
          Place.claim(nx, ny, waiting ? 32 : 22, 22);
        } else {
          n.remove();
        }

        // remove mode: a ✕ chip on every pin, enlarged on the one under the cursor
        if (State.removeMode) {
          const rm = document.createElement('div');
          rm.className = 'dbgov-rm' + (isTarget ? ' target' : '');
          rm.textContent = '✕';
          layer.append(rm);
          const rx = Math.min(innerWidth - 20, Math.max(2, i.r.right - 9));
          const ry = Math.max(2, i.r.top - 9);
          Place.put(rm, rx, ry);
          Place.claim(rx, ry, 18, 18);
        }
        return { p, i };
      });

      const hoverLive = !State.removeMode && State.hoverEl &&
                        document.contains(State.hoverEl) && !pinned.has(State.hoverEl);
      if (hoverLive) {
        const i = U.info(State.hoverEl);
        const box = document.createElement('div');
        box.className = 'dbgov-box dbgov-hover';
        Place.put(box, i.r.left, i.r.top, i.r.width, i.r.height);
        layer.append(box);
      }

      // 2) let each active tool draw its own layer (lines, guides, ...)
      // `found` is that tool's own findings from the last sweep and nobody
      // else's — the sweep stamped them, so the renderer hands them over
      // without learning what any of them mean. Only ARMED tools draw: a
      // sweep is what gets checked, arming is what gets shown.
      const ctx = { layer, Place, State, U, found: [] };
      for (const t of Tools.active()) {
        ctx.found = (State.sweep && State.sweep.byTool[t.id]) || [];
        t.draw?.call(t, ctx);
      }

      // 3) pin badges — compact unless detail mode or that pin is hovered
      pinInfo.forEach(({ p, i }) => {
        // same reason as the number chip above: a badge clamped to the edge
        // describes an element nobody can see, next to elements it is not about
        if (i.r.bottom < 0 || i.r.top > innerHeight ||
            i.r.right < 0 || i.r.left > innerWidth) return;
        const full = State.detail || State.hoverEl === p.el;
        const html = Badges.build(i, !full);
        if (!html) return;
        const b = document.createElement('div');
        b.className = 'dbgov-badge';
        b.innerHTML = `<span class="rad">#${p.id}</span> · ${html}`;
        layer.append(b);
        Place.smart(b, i.r, { avoid: i.r });
      });

      // 4) hover badge last — slots into whatever space is left
      if (hoverLive) {
        const i = U.info(State.hoverEl);
        const html = Badges.build(i, false);
        if (html) {
          const b = document.createElement('div');
          b.className = 'dbgov-badge';
          b.innerHTML = html;
          layer.append(b);
          Place.smart(b, i.r, { avoid: i.r });
        }
      }

      Panel.setCount(State.pins.length);
    }

    return {
      now,
      onPinsPruned: null,
      schedule() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(now);
      },
    };
  })();
