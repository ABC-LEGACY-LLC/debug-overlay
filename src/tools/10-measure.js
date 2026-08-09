  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-leader { position: fixed; pointer-events: none; background: rgba(255,255,255,.55); }
    .dbgov-line { position: fixed; pointer-events: none; background: rgba(181,232,83,.85);
      border-radius: 1px; box-shadow: 0 0 0 .5px rgba(0,0,0,.4); }
    .dbgov-cap { position: fixed; pointer-events: none; background: #b5e853;
      border-radius: 1px; box-shadow: 0 0 0 .5px rgba(0,0,0,.5); }
    .dbgov-arrow { position: fixed; pointer-events: none; width: 0; height: 0;
      filter: drop-shadow(0 0 .5px rgba(0,0,0,.6)); }
    .dbgov-arrow.up    { border-left: 5px solid transparent; border-right: 5px solid transparent;
                         border-bottom: 7px solid #b5e853; }
    .dbgov-arrow.down  { border-left: 5px solid transparent; border-right: 5px solid transparent;
                         border-top: 7px solid #b5e853; }
    .dbgov-arrow.left  { border-top: 5px solid transparent; border-bottom: 5px solid transparent;
                         border-right: 7px solid #b5e853; }
    .dbgov-arrow.right { border-top: 5px solid transparent; border-bottom: 5px solid transparent;
                         border-left: 7px solid #b5e853; }
    .dbgov-ext { position: fixed; pointer-events: none;
      background: repeating-linear-gradient(to right,
        rgba(181,232,83,.7) 0 4px, transparent 4px 8px); }
    .dbgov-ext.v { background: repeating-linear-gradient(to bottom,
        rgba(181,232,83,.7) 0 4px, transparent 4px 8px); }
    .dbgov-dist { position: fixed; pointer-events: none;
      background: rgba(24,28,14,.95); color: #b5e853; border-radius: 7px;
      padding: 3px 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .dbgov-dist.vert { border-left: 2px solid #b5e853; }
    `,
      id: 'measure',
      icon: '📐',
      title: 'Measure — size, radius, spacing, font, pin distances',
      // this tool owns the geometry read-out and the pin distance lines
      badge({ el, r, cs }) {
        const G = Tools.isActive('grid');   // ⚠ marks belong to the grid tool
        const bits = [`<span class="sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`];
        const rad = U.radius(cs); if (rad) bits.push(`<span class="rad">r ${rad}</span>`);
        const p = U.four(cs, 'padding', G); if (p) bits.push(`<span class="sp">p ${p.join(' ')}</span>`);
        const m = U.four(cs, 'margin', G);  if (m) bits.push(`<span class="sp">m ${m.join(' ')}</span>`);
        if (cs.display.includes('flex') || cs.display.includes('grid')) {
          const g = U.px(cs.columnGap) || U.px(cs.gap);
          bits.push(`<span class="sp">${cs.display}${g ? ' gap ' + U.mark(g, G) : ''}</span>`);
        }
        bits.push(`<span class="fnt">${U.px(cs.fontSize)}/${U.px(cs.lineHeight) || '–'} ${cs.fontWeight}</span>`);
        bits.push(`<span class="tag">${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}</span>`);
        return bits.join(' · ');
      },
      compact({ r, cs }) {
        const G = Tools.isActive('grid');
        const bits = [`<span class="sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`];
        const rad = U.radius(cs); if (rad) bits.push(`<span class="rad">r ${rad}</span>`);
        const p = U.four(cs, 'padding', G); if (p) bits.push(`<span class="sp">p ${p.join(' ')}</span>`);
        return bits.join(' · ');
      },
      report({ r, cs }) {
        const pad = U.fourPlain(cs, 'padding'), mar = U.fourPlain(cs, 'margin');
        return [
          `  box: ${Math.round(r.width)}×${Math.round(r.height)} @ (${Math.round(r.left)}, ${Math.round(r.top)})`,
          `  padding: ${pad.t} ${pad.r} ${pad.b} ${pad.l} | margin: ${mar.t} ${mar.r} ${mar.b} ${mar.l} | radius: ${U.radius(cs) || 0}`,
          `  display: ${cs.display}${U.px(cs.gap) ? ' gap:' + U.px(cs.gap) : ''} | position: ${cs.position} | overflow: ${cs.overflow}`,
          `  font: ${U.px(cs.fontSize)}px/${U.px(cs.lineHeight) || 'normal'} ${cs.fontWeight} ${cs.fontFamily.split(',')[0]}`,
          `  color: ${cs.color} | bg: ${cs.backgroundColor}`,
        ];
      },
      // only Shift-clicked pins take part in measuring
      measurePins: () => State.pins.filter((p) => p.kind === CONFIG.PIN_KIND.SHIFT),

      // the single place pairing is decided — draw() and reportTail() share it
      pairs() {
        const mp = this.measurePins();
        const step = CONFIG.MEASURE_MODE === 'pairs' ? 2 : 1;
        const out = [];
        for (let k = 0; k + 1 < mp.length; k += step) out.push([mp[k], mp[k + 1]]);
        const pending = (CONFIG.MEASURE_MODE === 'pairs' && mp.length % 2)
          ? mp[mp.length - 1] : null;
        return { pairs: out, pending };
      },

      // hook: which pin (if any) is still waiting for its partner
      pendingIndex() {
        const { pending } = this.pairs();
        return pending ? State.pins.indexOf(pending) : -1;
      },
      // hook: rows this tool contributes to the panel's pin list
      listRows() {
        const { pairs, pending } = this.pairs();
        const rows = pairs.map(([A, B]) => {
          const ra = A.el.getBoundingClientRect(), rb = B.el.getBoundingClientRect();
          const g = U.gap(ra, rb);
          const axis = Measure.axisOf(ra, rb);
          const detail = axis.kind === 'overlap' ? 'overlapping'
            : axis.kind === 'diagonal' ? `→ ${g.dx} · ↓ ${g.dy} px`
            : axis.kind === 'vertical' ? `↕ ${g.dy} px` : `↔ ${g.dx} px`;
          return { tag: `#${A.id}→#${B.id}`,
                   label: `${U.labelOf(A.el)} ↔ ${U.labelOf(B.el)}`,
                   detail, pins: [A, B] };
        });
        if (pending) rows.push({ tag: `#${pending.id}…`, label: U.labelOf(pending.el),
                                 detail: 'pick its pair', pins: [pending] });
        return rows;
      },

      // dimension lines between paired pins
      draw({ layer, Place }) {
        Measure.resetLanes();
        for (const [A, B] of this.pairs().pairs) {
          Measure.dimension(layer, Place, A.el.getBoundingClientRect(),
                            B.el.getBoundingClientRect(), `#${A.id}→#${B.id}`);
        }
      },
      reportTail() {
        const { pairs, pending } = this.pairs();
        const out = pairs.map(([A, B]) => {
          const ra = A.el.getBoundingClientRect(), rb = B.el.getBoundingClientRect();
          const g = U.gap(ra, rb);
          const axis = Measure.axisOf(ra, rb);
          return `[#${A.id} → #${B.id}] ${axis.label}: ` +
                 (axis.kind === 'overlap' ? 'elements overlap'
                   : axis.kind === 'diagonal' ? `horizontal ${g.dx}px + vertical ${g.dy}px`
                   : `${axis.kind === 'vertical' ? g.dy : g.dx}px`);
        });
        if (pending) out.push(`[#${pending.id}] waiting for its pair`);
        return out;
      },
    });
