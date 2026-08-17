  /**
   * COLOUR — resolving a colour honestly, and the level to judge it against.
   *
   * This moved out of the contrast tool for the same reason the spacing step
   * moved out of grid: the WCAG level is a decision about the project, and the
   * badge on hover and the finding in a sweep must not be able to disagree
   * about it. The cache is the other half — a page has tens of distinct
   * colours and thousands of nodes, and two copies of this would resolve every
   * one of them twice.
   *
   * It lives here rather than in UTILS because reading a colour honestly needs
   * a canvas, and UTILS may not touch the DOM.
   */
  const Colour = defineSubject({
    id: 'colour',
    was: 'contrast',   // its settings lived under this id before the subject existed
    icon: '◐',

    /**
     * AA is the level nearly everyone is held to; AAA is what accessibility
     * commitments and public-sector procurement actually ask for. Both
     * thresholds move together — a check wanting AAA of body text and AA of
     * headings would be reporting against no standard at all.
     */
    options() {
    return [{ key: 'level', label: 'WCAG level', def: CONFIG.CONTRAST.level,
                values: Object.keys(CONFIG.CONTRAST.levels), affects: 'detect' }];
    },

    cache: new Map(),      // 20-50 distinct colours per page, 1000s of nodes
    ctx: undefined,        // undefined = not tried yet, null = no canvas

    /** A 1×1 scratch context, or null where canvas is unavailable. */
    paint() {
        if (this.ctx !== undefined) return this.ctx;
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 1;
          this.ctx = c.getContext('2d', { willReadFrequently: true }) || null;
        } catch { this.ctx = null; }
        return this.ctx;
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
    colour(str) {
        const s = String(str || '');
        if (!s) return null;
        if (this.cache.has(s)) return this.cache.get(s);

        let out = null;
        const m = /^rgba?\(/.test(s) && s.match(/[\d.]+/g);
        if (m && m.length >= 3) {
          // the common case, and exact — no need to rasterise it
          out = { r: +m[0], g: +m[1], b: +m[2], a: m[3] !== undefined ? +m[3] : 1 };
        } else {
          const ctx = this.paint();
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
        this.cache.set(s, out);
        return out;
      },

    /** Composite `over` (with alpha) onto the opaque colour `base`. */
    over(over, base) {
        const a = over.a == null ? 1 : over.a;
        return {
          r: over.r * a + base.r * (1 - a),
          g: over.g * a + base.g * (1 - a),
          b: over.b * a + base.b * (1 - a),
          a: 1,
        };
      },

    /**
     * What the text is actually painted on, or `{ unknown }` naming what
     * stopped it — the caller turns that into a finding rather than silence.
     *
     * Starts at the element, not its parent: an element that sets its own
     * background paints it behind its own text, so every button, chip and
     * alert was previously scored against whatever was behind the card
     * instead. Translucent layers are collected and composited rather than
     * taken as if opaque — the first layer over 5% alpha used to be returned
     * outright, which is a different colour from what a reader sees.
     */
    bg(el) {
        const layers = [];               // nearest the viewer first
        let e = el;
        while (e && e.nodeType === 1) {
          const cs = getComputedStyle(e);
          // An image or gradient can be any colour at the pixel under the
          // text, and nothing here can sample it. Unknown, not white.
          if (cs.backgroundImage && cs.backgroundImage !== 'none') return { unknown: 'bg-image' };
          const raw = cs.backgroundColor;
          const c = this.colour(raw);
          // A colour we cannot read is not the same as no colour. Walking past
          // it lands on the white default below and turns "I don't know" into
          // a confident verdict against a background that was never there.
          if (!c) {
            if (raw && raw !== 'transparent')
              return { unknown: this.paint() ? 'bg-colour' : 'no-canvas' };
          } else if (c.a >= 0.999) {
            return layers.reduceRight((base, l) => this.over(l, base), c);
          } else if (c.a > 0) layers.push(c);
          e = e.parentElement;
        }
        // nothing opaque anywhere: the canvas underneath a page is white
        return layers.reduceRight((base, l) => this.over(l, base),
                                  { r: 255, g: 255, b: 255, a: 1 });
      },

    lum({ r, g, b }) {
        const f = (v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      },
    ratio(fg, bg) {
        // flatten a translucent foreground onto the background first
        const a = fg.a == null ? 1 : fg.a;
        const mixed = {
          r: fg.r * a + bg.r * (1 - a),
          g: fg.g * a + bg.g * (1 - a),
          b: fg.b * a + bg.b * (1 - a),
        };
        const l1 = this.lum(mixed), l2 = this.lum(bg);
        const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
      },
    // Walked rather than spread: this is the first thing asked of every
    // element in a page sweep, and [...childNodes] allocates an array for
    // each one only to look at the first text node.
    ownText(el) {
        for (let n = el.firstChild; n; n = n.nextSibling)
          if (n.nodeType === 3 && n.nodeValue.trim()) return true;
        return false;
      },

    // Why a measurement could not be made. These reach the user, so they say
    // what happened rather than naming the branch that produced them.
    why: {
        'fg-colour': 'the text colour is in a colour space this cannot read',
        'bg-colour': 'the background colour is in a colour space this cannot read',
        'bg-image': 'it sits on an image or gradient, so the pixel under the text is unknown',
        'no-canvas': 'no canvas is available to resolve colours',
      },

    measure({ el, cs }) {
        // NOT APPLICABLE is not the same as NOT KNOWN. An element with no text
        // of its own has no contrast to have — reporting that as "review"
        // would put every container on the page in the list and bury the real
        // ones. Only the three below are things we tried to measure and failed.
        if (!this.ownText(el)) return null;
        const fg = this.colour(cs.color);
        if (!fg) return { unknown: this.paint() ? 'fg-colour' : 'no-canvas' };
        const bg = this.bg(el);
        if (bg.unknown) return bg;
        // CSS opacity, which nothing here used to read. `color: rgba(0,0,0,.1)`
        // was correctly reported 1.25:1 while the visually identical
        // `color: #000; opacity:.1` was reported 21.00:1 PASS — a confident
        // wrong answer about text nobody can read, which is the one outcome
        // the three-answer design exists to rule out. The sweep's own gate
        // only skips the exact string '0', so 0.01 reaches here.
        //
        // Folding it into the foreground alpha is exact when the element paints
        // no background of its own, which is the ordinary case for text. Where
        // it does, both text and that background fade together and this
        // understates the ratio — erring toward reporting a problem, which is
        // the safe direction for a rule about readability.
        const faded = { ...fg, a: (fg.a == null ? 1 : fg.a) * this.opacityOf(el) };
        const ratio = this.ratio(faded, bg);
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const isLarge = size >= CONFIG.CONTRAST.largePx ||
                        (bold && size >= CONFIG.CONTRAST.largeBoldPx);
        // carried out with the verdict, not read again by each caller: the
        // badge, the report and the finding must all name the same level they
        // were actually judged against
        const level = Tools.setting(this, 'level');
        const want = CONFIG.CONTRAST.levels[level];
        const need = isLarge ? want.large : want.normal;
        return { ratio, need, pass: ratio >= need, isLarge, fg: faded, bg, level, want };
      },
    /** Cumulative CSS opacity: every ancestor multiplies what is painted. */
    opacityOf(el) {
      let o = 1;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const v = parseFloat(getComputedStyle(e).opacity);
        if (Number.isFinite(v) && v < 1) o *= Math.max(0, v);
        if (o === 0) break;
      }
      return o;
    },

    rgb: (c) => `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`,
  });
