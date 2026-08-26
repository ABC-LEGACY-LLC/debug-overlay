import { CONFIG } from '../core/config.js';
import { Tools } from '../core/registry.js';
import { State } from '../core/state.js';
import { U } from '../core/utils.js';
import { Badges } from '../services/badge/index.js';
import { layer } from './dom.js';
import { WebPanel } from './web-panel.js';
import { Place } from './placement.js';
  /* ======================================================================
    RENDERER
     ====================================================================== */
  export const Render = (() => {
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
        const kindCls = ` debug-overlay-${p.kind}` + (waiting ? ' debug-overlay-waiting' : '') +
                        (isTarget ? ' debug-overlay-rmtarget' : '') + (isFlash ? ' debug-overlay-flash' : '');
        const i = U.info(p.el);
        const box = document.createElement('div');
        box.className = 'debug-overlay-box debug-overlay-pinbox' + kindCls;
        Place.put(box, i.r.left, i.r.top, i.r.width, i.r.height);
        const n = document.createElement('div');
        n.className = 'debug-overlay-pin-num' + kindCls;
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
          rm.className = 'debug-overlay-rmchip' + (isTarget ? ' debug-overlay-target' : '');
          rm.textContent = '✕';
          layer.append(rm);
          const rx = Math.min(innerWidth - 20, Math.max(2, i.r.right - 9));
          const ry = Math.max(2, i.r.top - 9);
          Place.put(rm, rx, ry);
          Place.claim(rx, ry, 18, 18);
        }
        return { p, i };
      });

      /* The CURRENT selection — the choice nothing armed is keeping. Core
         draws it the way core draws hover: outline and badge, NO number.
         A number is the mark of a KEPT selection; this one is replaced by
         the next click, so a number on it would promise permanence it does
         not have. Pruned like pins, but silently — it is never in the list,
         so no index can go stale over it. */
      if (State.current && !document.contains(State.current)) State.current = null;
      const cur = (!State.removeMode && State.current &&
                   !pinned.has(State.current)) ? State.current : null;
      if (cur) {
        const i = U.info(cur);
        const box = document.createElement('div');
        box.className = 'debug-overlay-box debug-overlay-pinbox debug-overlay-note';
        Place.put(box, i.r.left, i.r.top, i.r.width, i.r.height);
        layer.append(box);
      }

      const hoverLive = !State.removeMode && State.hoverEl && State.hoverEl !== cur &&
                        document.contains(State.hoverEl) && !pinned.has(State.hoverEl);
      if (hoverLive) {
        const i = U.info(State.hoverEl);
        const box = document.createElement('div');
        box.className = 'debug-overlay-box debug-overlay-hover';
        Place.put(box, i.r.left, i.r.top, i.r.width, i.r.height);
        layer.append(box);
      }

      // 2) let each active tool draw its own layer (lines, guides, ...)
      // `found` is that tool's own findings from the last sweep and nobody
      // else's — the sweep stamped them, so the renderer hands them over
      // without learning what any of them mean. Only ARMED tools draw: a
      // sweep is what gets checked, arming is what gets shown.
      /* `marks` is a CAPABILITY, handed in the way intercept receives redraw:
         a tool may not import ui/ or services/, and painting a finding is the
         same job in every rule — three byte-identical loops proved it. Core
         owns the surface, the tool decides what goes on it.

         It also LABELS. A dashed box says something is wrong and never what,
         and a title attribute cannot help: the layer is aria-hidden and
         pointer-events:none, so no tooltip can ever fire. The label is
         painted, named by the RULE and coalesced per element — grid can
         produce ten findings for one element, which used to stack ten
         identical outlines on it. Coalescing happens INSIDE the cap, never
         before it, so "outlines capped at N per rule" stays true. */
      /* ONE label per element per FRAME, not per tool: two armed rules
         flagging the same element used to paint two tips at identical
         coordinates, and the later one covered the earlier completely. The
         map lives out here so a second tool ADDS its rule to the label the
         first one made. */
      const marked = new Map();
      /* COLLECT — reads and merges, paints nothing.

         This used to build the DOM as it went: read a rect, append a box,
         append a tip, then read the tip's offsetWidth to place it. Every one
         of those reads came after a write, so every mark forced a synchronous
         layout of the whole document — up to MARK_LIMIT of them per armed
         drawing tool, on a layer rebuilt from scratch on EVERY frame, driven
         by mousemove and scroll. Moving the pointer over a swept page paid
         for hundreds of full-document layouts per second.

         Split in two instead: this pass only reads (one rect per element,
         merged across tools), and paintMarks() below only writes — then
         measures the whole batch of tips at once, which costs one layout
         rather than one per tip. The tool-facing surface is unchanged: a tool
         still calls marks(found) and knows nothing about when paint happens. */
      const marks = (found) => {
        for (const f of found.slice(0, CONFIG.MARK_LIMIT)) {
          if (!document.contains(f.el)) continue;
          /* One element, two rules: it must read as the WORSE of them. The
             outlines used to stack and whichever painted last decided the
             colour by accident; now the severity decides it. */
          const cls = f.verdict === 'review' ? 'review' : f.severity;
          const at = marked.get(f.el);
          if (at) {
            at.n++; at.rules.add(f.rule);
            if ((CONFIG.SEVERITY[cls] || 0) > (CONFIG.SEVERITY[at.cls] || 0)) at.cls = cls;
            continue;
          }
          marked.set(f.el, { r: f.el.getBoundingClientRect(), cls, n: 1,
                             rules: new Set([f.rule]) });
        }
      };
      /** WRITE, then measure the batch, then place. Three passes, one layout. */
      const paintMarks = () => {
        const tips = [];
        for (const m of marked.values()) {
          const box = document.createElement('div');
          box.className = 'debug-overlay-box debug-overlay-flag debug-overlay-' + m.cls;
          Place.put(box, m.r.left, m.r.top, m.r.width, m.r.height);
          layer.append(box);
          const r = m.r;
          if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
          const tip = document.createElement('div');
          tip.className = 'debug-overlay-tip debug-overlay-' + m.cls;
          // textContent: a rule id is ours, but a message is not — dupid's
          // carries a page-authored id straight from the document
          tip.textContent = label(m);
          layer.append(tip);
          tips.push({ tip, r });
        }
        // the one forced layout of the frame, paid once for every tip
        for (const t of tips) t.size = { w: t.tip.offsetWidth, h: t.tip.offsetHeight };
        /* smart, not put: labels used to sit at a fixed offset from every
           element, so nested findings — the shape of every real page —
           stacked their labels on one another and on the pin numbers that
           were claimed before them. */
        for (const t of tips) Place.smart(t.tip, t.r, { avoid: t.r, size: t.size });
      };
      const label = (m) => [...m.rules].join(' ') + (m.n > 1 ? ` ×${m.n}` : '');

      const ctx = { layer, Place, State, U, marks, found: [] };
      for (const t of Tools.active()) {
        ctx.found = (State.sweep && State.sweep.byTool[t.id]) || [];
        t.draw?.call(t, ctx);
      }
      // every tool has now had its say about every element, so the merged
      // severity and the merged label are both final — paint once
      paintMarks();

      // 3) pin badges — compact unless detail mode or that pin is hovered
      pinInfo.forEach(({ p, i }) => {
        // same reason as the number chip above: a badge clamped to the edge
        // describes an element nobody can see, next to elements it is not about
        if (i.r.bottom < 0 || i.r.top > innerHeight ||
            i.r.right < 0 || i.r.left > innerWidth) return;
        const full = Badges.view() === 'full' || State.hoverEl === p.el;
        const html = Badges.build(i, !full);
        if (!html) return;
        const b = document.createElement('div');
        b.className = 'debug-overlay-badge';
        b.innerHTML = `<span class="debug-overlay-rad">#${p.id}</span> · ${html}`;
        layer.append(b);
        Place.smart(b, i.r, { avoid: i.r });
      });

      // 3b) the current selection's badge — a pin badge without the #N,
      // because there is no number to prefix and nothing to confuse it with
      if (cur) {
        const i = U.info(cur);
        if (!(i.r.bottom < 0 || i.r.top > innerHeight ||
              i.r.right < 0 || i.r.left > innerWidth)) {
          const full = Badges.view() === 'full' || State.hoverEl === cur;
          const html = Badges.build(i, !full);
          if (html) {
            const b = document.createElement('div');
            b.className = 'debug-overlay-badge';
            b.innerHTML = html;
            layer.append(b);
            Place.smart(b, i.r, { avoid: i.r });
          }
        }
      }

      // 4) hover badge last — slots into whatever space is left
      if (hoverLive) {
        const i = U.info(State.hoverEl);
        const html = Badges.build(i, false);
        if (html) {
          const b = document.createElement('div');
          b.className = 'debug-overlay-badge';
          b.innerHTML = html;
          layer.append(b);
          Place.smart(b, i.r, { avoid: i.r });
        }
      }

      WebPanel.setCount(State.pins.length);
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
