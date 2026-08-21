import { Monitor, fmt } from './service.js';
import { Targets } from './target.js';
import { U } from '../../core/utils.js';

/**
 * Hook: the freeze log, newest first, in the panel's list. These rows own
 * no pins — a freeze is a WHEN, not a WHERE — which is exactly why the
 * list learned that a row may have nothing to remove and nothing to
 * reveal.
 */
export function listRows() {
        const now = Date.now();
        const ago = (t) => {
          const s = Math.round((now - t) / 1000);
          return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
        };
        return Monitor.log.slice().reverse().map((e) => ({
          tag: '⚡',
          label: `main thread blocked ${fmt(e.ms)}`,
          detail: `${ago(e.t)}${e.src ? ' · ' + e.src : ''}${e.blame ? ' · during: ' + e.blame : ''}`,
        }));
}

/**
 * Hook: the report's performance section. Only while the tool is active —
 * Report collects tails from active tools, so disarming removes the
 * section the way disarming removes anything.
 */
export function reportTail() {
        if (!Monitor.running && !Monitor.log.length) return [];
        const secs = Math.round((Date.now() - Monitor.startedAt) / 1000);
        const L = [`## performance — monitored ${secs}s · tier: ${Monitor.tier}`];
        L.push(Monitor.fps == null ? 'fps: (no full window yet)' : `fps: ${Monitor.fps}`);
        if (!Monitor.log.length) {
          L.push(`main thread: no blocks over the threshold`);
        } else {
          const srcs = [...new Set(Monitor.log.map((e) => e.src).filter(Boolean))];
          L.push(`main thread: ${Monitor.log.length} block${Monitor.log.length === 1 ? '' : 's'}` +
                 `, worst ${fmt(Monitor.worst())}` +
                 (srcs.length ? ` — ${srcs.join(', ')}` : ''));
          if (Monitor.tier !== 'frame-attribution') {
            L.push('(no script attribution on this browser — Chrome reports which script ate the frame)');
          }
          const blamed = Monitor.log.filter((e) => e.blame);
          for (const e of blamed.slice(-3))
            L.push(`  during the ${fmt(e.ms)} block: ${e.blame} mutations`);
        }
        // the watched elements — what each one is costing right now
        for (const [el] of Targets.map) {
          const s = Targets.stats(el);
          if (!s || !document.contains(el)) continue;
          const bits = [`mut ${s.rate}/s`];
          if (s.worstEvt) bits.push(`worst input ${fmt(s.worstEvt)}`);
          if (s.shift > 0.005) bits.push(`layout shift ${s.shift.toFixed(2)}`);
          L.push(`watched ${U.selectorOf(el)}: ${bits.join(' · ')}`);
        }
        return L;
}
