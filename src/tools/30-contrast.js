  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .ok  { color: #b5e853; }
    .dbgov-badge .bad { color: #ff6b6b; font-weight: 700; }
    `,
      id: 'contrast',
      kind: 'rule',
      icon: '◐',
      title: 'Contrast — WCAG text contrast ratio (AA)',

      /* ---- colour, resolved rather than guessed ------------------------
         These live here rather than in UTILS because reading a colour
         honestly needs a canvas, and UTILS may not touch the DOM. Each of
         them only ever had this one caller anyway. */

      _cache: new Map(),      // 20-50 distinct colours per page, 1000s of nodes
      _ctx: undefined,        // undefined = not tried yet, null = no canvas

      /** A 1×1 scratch context, or null where canvas is unavailable. */
      _paint() {
        if (this._ctx !== undefined) return this._ctx;
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 1;
          this._ctx = c.getContext('2d', { willReadFrequently: true }) || null;
        } catch { this._ctx = null; }
        return this._ctx;
      },

      /**
       * Any CSS colour → sRGB, by asking the browser to paint one pixel of it.
       * That covers oklch(), lab(), color(display-p3 …) and whatever ships
       * next, without this file knowing the maths for any of them.
       *
       * Guessing is what made this necessary: scraping the numbers out of
       * oklch(0.985 0 0) read near-white as near-black and reported 1.00:1
       * for text measuring 10.9:1. Anything still unreadable returns null,
       * and null must stay "unknown" all the way up.
       */
      _colour(str) {
        const s = String(str || '');
        if (!s) return null;
        if (this._cache.has(s)) return this._cache.get(s);

        let out = null;
        const m = /^rgba?\(/.test(s) && s.match(/[\d.]+/g);
        if (m && m.length >= 3) {
          // the common case, and exact — no need to rasterise it
          out = { r: +m[0], g: +m[1], b: +m[2], a: m[3] !== undefined ? +m[3] : 1 };
        } else {
          const ctx = this._paint();
          // Two probes: a rejected colour leaves fillStyle on whichever probe
          // was there, so the readbacks differ. An accepted one lands on the
          // same value both times — including when it really is black.
          if (ctx) {
            ctx.fillStyle = '#000'; ctx.fillStyle = s; const a = ctx.fillStyle;
            ctx.fillStyle = '#fff'; ctx.fillStyle = s; const b = ctx.fillStyle;
            if (a === b) {
              ctx.clearRect(0, 0, 1, 1);
              ctx.fillRect(0, 0, 1, 1);
              const d = ctx.getImageData(0, 0, 1, 1).data;
              out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
            }
          }
        }
        this._cache.set(s, out);
        return out;
      },

      /** Composite `over` (with alpha) onto the opaque colour `base`. */
      _over(over, base) {
        const a = over.a == null ? 1 : over.a;
        return {
          r: over.r * a + base.r * (1 - a),
          g: over.g * a + base.g * (1 - a),
          b: over.b * a + base.b * (1 - a),
          a: 1,
        };
      },

      /**
       * What the text is actually painted on, or null if any of it is
       * unreadable.
       *
       * Starts at the element, not its parent: an element that sets its own
       * background paints it behind its own text, so every button, chip and
       * alert was previously scored against whatever was behind the card
       * instead. Translucent layers are collected and composited rather than
       * taken as if opaque — the first layer over 5% alpha used to be returned
       * outright, which is a different colour from what a reader sees.
       */
      _bg(el) {
        const layers = [];               // nearest the viewer first
        let e = el;
        while (e && e.nodeType === 1) {
          const cs = getComputedStyle(e);
          // An image or gradient can be any colour at the pixel under the
          // text, and nothing here can sample it. Unknown, not white.
          if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
          const raw = cs.backgroundColor;
          const c = this._colour(raw);
          // A colour we cannot read is not the same as no colour. Walking past
          // it lands on the white default below and turns "I don't know" into
          // a confident verdict against a background that was never there.
          if (!c) {
            if (raw && raw !== 'transparent') return null;
          } else if (c.a >= 0.999) {
            return layers.reduceRight((base, l) => this._over(l, base), c);
          } else if (c.a > 0) layers.push(c);
          e = e.parentElement;
        }
        // nothing opaque anywhere: the canvas underneath a page is white
        return layers.reduceRight((base, l) => this._over(l, base),
                                  { r: 255, g: 255, b: 255, a: 1 });
      },

      _lum({ r, g, b }) {
        const f = (v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      },
      _ratio(fg, bg) {
        // flatten a translucent foreground onto the background first
        const a = fg.a == null ? 1 : fg.a;
        const mixed = {
          r: fg.r * a + bg.r * (1 - a),
          g: fg.g * a + bg.g * (1 - a),
          b: fg.b * a + bg.b * (1 - a),
        };
        const l1 = this._lum(mixed), l2 = this._lum(bg);
        const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
      },
      // Walked rather than spread: this is the first thing asked of every
      // element in a page sweep, and [...childNodes] allocates an array for
      // each one only to look at the first text node.
      _ownText(el) {
        for (let n = el.firstChild; n; n = n.nextSibling)
          if (n.nodeType === 3 && n.nodeValue.trim()) return true;
        return false;
      },

      _measure({ el, cs }) {
        if (!this._ownText(el)) return null;
        const fg = this._colour(cs.color);
        if (!fg) return null;
        const bg = this._bg(el);
        if (!bg) return null;   // unreadable background — say nothing
        const ratio = this._ratio(fg, bg);
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const isLarge = size >= CONFIG.CONTRAST.largePx ||
                        (bold && size >= CONFIG.CONTRAST.largeBoldPx);
        const need = isLarge ? CONFIG.CONTRAST.large : CONFIG.CONTRAST.normal;
        return { ratio, need, pass: ratio >= need, isLarge, fg, bg };
      },
      _rgb: (c) => `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`,

      // RULE hook: the verdict badge() shows, as data instead of prose. A
      // passing element produces nothing — a findings list is a list of
      // problems, which is what lets the same hook run over a whole page.
      audit(i) {
        const c = this._measure(i);
        if (!c || c.pass) return [];
        return [{
          el: i.el,
          // below the large-text floor nobody can read it; above it, a near
          // miss that a size or weight change might fix
          severity: c.ratio < CONFIG.CONTRAST.large ? 'error' : 'warn',
          rule: 'contrast-aa',
          message: `${c.ratio.toFixed(2)}:1 — AA needs ${c.need} for ${c.isLarge ? 'large' : 'normal'} text`,
          // one line per colour pair, not per element: a 40-link nav is ONE
          // problem. Only the rule knows what "the same problem" means.
          key: `contrast-aa|${this._rgb(c.fg)}|${this._rgb(c.bg)}|${c.isLarge}`,
        }];
      },
      badge(i) {
        const c = this._measure(i);
        if (!c) return null;
        const cls = c.pass ? 'ok' : 'bad';
        return `<span class="${cls}">${c.ratio.toFixed(2)}:1 ${c.pass ? 'AA✓' : 'AA✗'}</span>`;
      },
      compact(i) {
        const c = this._measure(i);
        if (!c || c.pass) return null;   // stay quiet unless it actually fails
        return `<span class="bad">${c.ratio.toFixed(1)}:1 ✗</span>`;
      },
      report(i) {
        const c = this._measure(i);
        if (!c) return [];
        return [`  contrast: ${c.ratio.toFixed(2)}:1 vs required ${c.need} (${c.isLarge ? 'large' : 'normal'} text) → ${c.pass ? 'PASS' : 'FAIL'}`];
      },
    });
