  /* ======================================================================
     3. UTILS — pure helpers
     ====================================================================== */
  const U = {
    px: (v) => Math.round(parseFloat(v) || 0),
    offGrid: (n) => n !== 0 && n % CONFIG.GRID !== 0,
    // `flag` is passed in by the caller — UTILS never reads State itself
    mark: (n, flag) => (flag && U.offGrid(n) ? `<span class="warn">${n}⚠</span>` : `${n}`),

    four(cs, prop, flag) {
      const t = U.px(cs[prop + 'Top']), r = U.px(cs[prop + 'Right']),
            b = U.px(cs[prop + 'Bottom']), l = U.px(cs[prop + 'Left']);
      if (!t && !r && !b && !l) return null;
      if (t === b && r === l)
        return t === r ? [U.mark(t, flag)] : [U.mark(t, flag), U.mark(r, flag)];
      return [U.mark(t, flag), U.mark(r, flag), U.mark(b, flag), U.mark(l, flag)];
    },
    fourPlain(cs, prop) {
      return {
        t: U.px(cs[prop + 'Top']), r: U.px(cs[prop + 'Right']),
        b: U.px(cs[prop + 'Bottom']), l: U.px(cs[prop + 'Left']),
      };
    },
    radius(cs) {
      const c = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']
        .map((k) => U.px(cs['border' + k + 'Radius']));
      if (!c.some(Boolean)) return null;
      return c.every((v) => v === c[0]) ? `${c[0]}` : c.join('/');
    },
    selectorOf(el) {
      const part = (e) => {
        if (e.id) return '#' + e.id;
        let s = e.tagName.toLowerCase();
        const cls = [...e.classList].filter((c) => !c.startsWith('__dbgov')).slice(0, 2);
        if (cls.length) s += '.' + cls.join('.');
        const p = e.parentElement;
        if (p) {
          const same = [...p.children].filter((x) => x.tagName === e.tagName);
          if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
        }
        return s;
      };
      const chain = [];
      let e = el;
      while (e && e.tagName && chain.length < 3) {
        chain.unshift(part(e));
        if (e.id) break;
        e = e.parentElement;
      }
      return chain.join(' > ');
    },
    // human-readable name for a pin row: the element's own text, else a selector
    labelOf(el) {
      const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
      if (t) return t.length <= 34 ? t : t.slice(0, 31) + '…';
      const cls = [...el.classList].filter((c) => !c.startsWith('__dbgov'))[0];
      return el.tagName.toLowerCase() + (el.id ? '#' + el.id : cls ? '.' + cls : '');
    },
    info: (el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }),
    gap(a, b) {
      const dx = Math.max(a.left - b.right, b.left - a.right, 0);
      const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
      return { dx: Math.round(dx), dy: Math.round(dy), d: Math.round(Math.hypot(dx, dy)) };
    },
    rectOf: (x, y, w, h) => ({ l: x, t: y, r: x + w, b: y + h }),
    overlap: (a, b) =>
      Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) *
      Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)),

    // --- colour helpers (used by the contrast tool)
    parseColor(str) {
      const m = String(str).match(/[\d.]+/g);
      if (!m || m.length < 3) return null;
      return { r: +m[0], g: +m[1], b: +m[2], a: m[3] !== undefined ? +m[3] : 1 };
    },
    effectiveBg(el) {
      let e = el;
      while (e && e.nodeType === 1) {
        const c = U.parseColor(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0.05) return c;
        e = e.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    },
    luminance({ r, g, b }) {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    },
    contrastRatio(fg, bg) {
      // flatten a translucent foreground onto the background first
      const a = fg.a == null ? 1 : fg.a;
      const mixed = {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a),
      };
      const l1 = U.luminance(mixed), l2 = U.luminance(bg);
      const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    },
    hasOwnText(el) {
      return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length);
    },
  };
