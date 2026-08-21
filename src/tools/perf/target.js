import { CONFIG } from '../../core/config.js';

/**
 * THE TARGETED HALF of the monitor: what is THIS component costing?
 *
 * The page-wide half (service.js) answers "is the page stuck"; this one
 * attaches to the elements the user already targeted — the pins, and the
 * current selection — because targeting is a solved problem here:
 * selection chooses, pin keeps, perf watches what they chose. No new
 * gesture, no new concept, and the observers exist ONLY on those
 * subtrees, only while ⚡ is armed: metering the whole page to answer a
 * question about one card is the overhead this tool exists to find.
 *
 * Per target:
 *   mutations/s   MutationObserver over the subtree — a re-render storm
 *                 (React looping, a poller redrawing) reads in the
 *                 hundreds; a healthy widget reads ~0
 *   slow input    Event Timing entries whose target sits inside it — the
 *                 click that took 400ms to answer (where supported)
 *   layout shift  shift sources inside it — did THIS thing move the page
 *
 * Per-element CPU%% does not exist in the platform and is not pretended
 * to here; the correlation in service.js (freeze window × subtree churn)
 * is the honest attribution the real tools use too.
 */
export const Targets = {
        map: new Map(),      // el -> { mo, times: [ts…], worstEvt, shift }

        /** Rolling mutations/second over the rate window. */
        rate(el) {
          const t = Targets.map.get(el);
          if (!t) return null;
          const cut = Date.now() - CONFIG.PERF.RATE_WINDOW;
          while (t.times.length && t.times[0] < cut) t.times.shift();
          return Math.round((t.times.length * 1000) / CONFIG.PERF.RATE_WINDOW);
        },

        /** Mutations inside [from, to] — the freeze-correlation question. */
        countIn(el, from, to) {
          const t = Targets.map.get(el);
          if (!t) return 0;
          return t.times.reduce((n, ts) => n + (ts >= from && ts <= to ? 1 : 0), 0);
        },

        stats(el) {
          const t = Targets.map.get(el);
          if (!t) return null;
          return { rate: Targets.rate(el), worstEvt: t.worstEvt, shift: t.shift };
        },

        /** Reconcile with what is targeted NOW. Cheap: pins are user-made
         *  and few, and this only ever attaches/detaches the difference. */
        sync(els) {
          const want = new Set(els.filter((el) => el && document.contains(el)));
          for (const [el, t] of Targets.map) {
            if (want.has(el)) continue;
            t.mo.disconnect();
            Targets.map.delete(el);
          }
          for (const el of want) {
            if (Targets.map.has(el)) continue;
            const rec = { mo: null, times: [], worstEvt: null, shift: 0 };
            rec.mo = new MutationObserver((muts) => {
              const now = Date.now();
              for (let i = 0; i < muts.length; i++) rec.times.push(now);
              // bound the buffer: past the window the exact count is history
              const cut = now - CONFIG.PERF.RATE_WINDOW;
              while (rec.times.length && rec.times[0] < cut) rec.times.shift();
            });
            rec.mo.observe(el, { subtree: true, childList: true,
                                 attributes: true, characterData: true });
            Targets.map.set(el, rec);
          }
        },

        /** A slow-input or layout-shift entry, attributed if its node sits
         *  inside a watched subtree. Called by service.js's observers. */
        attribute(node, kind, value) {
          if (!node) return;
          for (const [el, t] of Targets.map) {
            if (el !== node && !el.contains(node)) continue;
            if (kind === 'event' && value > (t.worstEvt || 0)) t.worstEvt = value;
            if (kind === 'shift') t.shift += value;
          }
        },

        clear() {
          for (const [, t] of Targets.map) t.mo.disconnect();
          Targets.map.clear();
        },
};
