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
      title: 'Measure — size, radius, spacing, font, distances',
      startsOn: true,      // the read-out is what the overlay is FOR
      /**
       * INSPECT, and only INSPECT. The pairing that used to live here is a
       * SELECT tool now; this asks the registry what is grouped and measures
       * between whatever comes back. Drawing the gap between two elements is a
       * measurement — deciding WHICH two is not, and keeping both here is what
       * made this tool two things at once.
       */
      badge(i) {
        const { el, r, cs } = i;
        // whatever decoration applies here — never "is <some named tool> on"
        const dec = Tools.annotator(i);
        const bits = [`<span class="sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`];
        const rad = U.radius(cs); if (rad) bits.push(`<span class="rad">r ${rad}</span>`);
        const p = U.four(cs, 'padding', dec); if (p) bits.push(`<span class="sp">p ${p.join(' ')}</span>`);
        const m = U.four(cs, 'margin', dec);  if (m) bits.push(`<span class="sp">m ${m.join(' ')}</span>`);
        if (cs.display.includes('flex') || cs.display.includes('grid')) {
          const g = U.px(cs.columnGap) || U.px(cs.gap);
          bits.push(`<span class="sp">${U.esc(cs.display)}${g ? ' gap ' + U.mark(g, dec) : ''}</span>`);
        }
        bits.push(`<span class="fnt">${U.px(cs.fontSize)}/${U.px(cs.lineHeight) || '–'} ${cs.fontWeight}</span>`);
        // the id is page-authored text on its way to innerHTML — never raw
        bits.push(`<span class="tag">${el.tagName.toLowerCase()}${el.id ? '#' + U.esc(el.id) : ''}</span>`);
        return bits.join(' · ');
      },
      compact(i) {
        const { r, cs } = i;
        const dec = Tools.annotator(i);
        const bits = [`<span class="sz">${Math.round(r.width)}×${Math.round(r.height)}</span>`];
        const rad = U.radius(cs); if (rad) bits.push(`<span class="rad">r ${rad}</span>`);
        // deliberately padding only — the compact badge never marked m or gap
        const p = U.four(cs, 'padding', dec); if (p) bits.push(`<span class="sp">p ${p.join(' ')}</span>`);
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
      /**
       * A pair has a distance; a group of five does not have one distance.
       * Anything that is not two elements is something this tool has nothing
       * to say about, and it says so by drawing nothing rather than guessing
       * which two of them were meant.
       */
      _pairs: () => Tools.groups().filter((g) => g.length === 2),

      // dimension lines between grouped pins
      draw({ layer, Place }) {
        Measure.resetLanes();
        for (const [A, B] of this._pairs()) {
          Measure.dimension(layer, Place, A.el.getBoundingClientRect(),
                            B.el.getBoundingClientRect(), `#${A.id}→#${B.id}`);
        }
      },
      reportTail() {
        return this._pairs().map(([A, B]) => {
          const ra = A.el.getBoundingClientRect(), rb = B.el.getBoundingClientRect();
          const g = U.gap(ra, rb);
          const axis = Measure.axisOf(ra, rb);
          return `[#${A.id} → #${B.id}] ${axis.label}: ` +
                 (axis.kind === 'overlap' ? 'elements overlap'
                   : axis.kind === 'diagonal' ? `horizontal ${g.dx}px + vertical ${g.dy}px`
                   : `${axis.kind === 'vertical' ? g.dy : g.dx}px`);
        });
      },
    });
