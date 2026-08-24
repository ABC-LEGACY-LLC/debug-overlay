import { CONFIG } from '../../core/config.js';
import { Tools } from '../../core/registry.js';
import { State } from '../../core/state.js';
import { U } from '../../core/utils.js';
import { Targets } from './target.js';

/**
 * The MONITOR — the first backend in this codebase that runs for a SPAN of
 * time rather than answering a moment. watch() starts it, unwatch() stops
 * it, and everything it knows lives in a ring buffer of recent events.
 *
 * Three tiers, best first, because the platform is uneven and a silent
 * downgrade would be the overlay lying about what it measured:
 *
 *   frame-attribution  Long Animation Frames (Chrome): a slow frame arrives
 *                      WITH the script that ate it — the best CPU attribution
 *                      the web platform has. A real profiler needs a response
 *                      header the page must send, which a userscript cannot.
 *   long-tasks         the Long Task API: every main-thread block over 50ms,
 *                      no attribution.
 *   heartbeat          a requestAnimationFrame loop measuring its own gaps.
 *                      Works everywhere, including jsdom, which is what lets
 *                      the suite freeze the event loop on purpose and watch
 *                      this notice.
 *
 * The heartbeat always runs (it is also the FPS meter); it only LOGS freezes
 * when no observer tier is available, or the same block would appear twice.
 */
export const Monitor = {
        running: false,
        tier: null,          // 'frame-attribution' | 'long-tasks' | 'heartbeat'
        log: [],             // ring buffer, oldest first: { t, ms, src, via }
        fps: null,           // rolling frames-per-second, null until measured
        startedAt: 0,
        _owner: null,        // the tool, for Tools.setting — set by watch()
        _obs: null, _obs2: [], _raf: 0, _last: 0, _frames: 0, _fpsT: 0,
        _onVis: null, _redraw: null, _drewT: 0,
        load: null,          // this navigation's timings — static per page
        pre: [],             // long tasks from BEFORE arming (buffered entries)

        threshold() {
          const v = Monitor._owner && Tools.setting(Monitor._owner, 'freeze');
          return Number(v) || CONFIG.PERF.FREEZE_MS;
        },

        push(ev) {
          /* CORRELATION — the honest per-component attribution. During the
             block, which watched subtree was churning? "frozen 1.2s" is a
             fact; "frozen 1.2s while #cards mutated 412 times" is a lead. */
          let worst = null;
          for (const [el] of Targets.map) {
            const n = Targets.countIn(el, ev.t - ev.ms, ev.t);
            if (n && (!worst || n > worst.n)) worst = { el, n };
          }
          if (worst) ev.blame = `${U.labelOf(worst.el)} ×${worst.n}`;
          Monitor.log.push(ev);
          if (Monitor.log.length > CONFIG.PERF.LOG_MAX) Monitor.log.shift();
          /* the moment, handed up as history: the side panel's timeline outlives
             this page, so a freeze is worth telling the moment it lands.
             `at` is page time (ms since navigation) — the one clock a reload
             visibly resets, which is exactly what a timeline wants to show. */
          Monitor._event?.({ kind: 'freeze', at: Math.round(performance.now()),
                             ms: ev.ms, via: ev.via, blame: ev.blame || null });
        },

        worst() {
          return Monitor.log.reduce((m, e) => Math.max(m, e.ms), 0);
        },

        start(owner, ctx) {
          if (Monitor.running) return;
          Monitor.running = true;
          Monitor._owner = owner;
          Monitor._redraw = ctx?.redraw || null;
          Monitor._event = ctx?.event || null;
          // a fresh session starts a fresh log — the page moved on, and a
          // freeze from before the power cycle is a stale claim about it
          Monitor.log = [];
          Monitor.fps = null;
          Monitor.startedAt = Date.now();
          Monitor._armedAtPerf = performance.now();
          Monitor.pre = [];

          /* THE LOAD ITSELF — the thing a live-only monitor can never see.
             Navigation and paint timing are static facts about this page's
             birth, and the buffered observers below can hand us long tasks
             from before this script even ran. readLoad() is shared with
             timeline(), which reports the load whether or not this is
             running — the numbers exist either way. */
          Monitor.load = readLoad();

          const types = (typeof PerformanceObserver !== 'undefined' &&
                         PerformanceObserver.supportedEntryTypes) || [];
          /* buffered: true — entries from before arming land in `pre`, the
             startup story; entries after arming are the live log. Split by
             the arming timestamp so the two never mix a WHEN. */
          const classify = (e, src) => {
            if (e.startTime + e.duration <= Monitor._armedAtPerf) {
              Monitor.pre.push({ ms: Math.round(e.duration), src });
              if (Monitor.pre.length > 10) Monitor.pre.shift();
            } else if (e.duration >= Monitor.threshold()) {
              Monitor.push({ t: Date.now(), ms: Math.round(e.duration), src,
                             via: src ? 'frame' : 'task' });
            }
          };
          if (types.includes('long-animation-frame')) {
            Monitor.tier = 'frame-attribution';
            Monitor._obs = new PerformanceObserver((list) => {
              for (const e of list.getEntries()) {
                const s = e.scripts && e.scripts[0];
                const src = s && (s.sourceURL || s.invoker || s.name) || null;
                classify(e, src && String(src).split('/').pop().split('?')[0]);
              }
            });
            Monitor._obs.observe({ type: 'long-animation-frame', buffered: true });
          } else if (types.includes('longtask')) {
            Monitor.tier = 'long-tasks';
            Monitor._obs = new PerformanceObserver((list) => {
              for (const e of list.getEntries()) classify(e, null);
            });
            Monitor._obs.observe({ type: 'longtask', buffered: true });
          } else {
            Monitor.tier = 'heartbeat';
          }

          /* the ATTRIBUTION observers — page events routed to whichever
             watched subtree they landed in. Guarded per browser; absence
             just means those badge fields never appear. */
          Monitor._obs2 = [];
          if (types.includes('event')) {
            const o = new PerformanceObserver((list) => {
              for (const e of list.getEntries())
                Targets.attribute(e.target, 'event', Math.round(e.duration));
            });
            o.observe({ type: 'event', durationThreshold: 104 });
            Monitor._obs2.push(o);
          }
          if (types.includes('layout-shift')) {
            const o = new PerformanceObserver((list) => {
              for (const e of list.getEntries())
                for (const s of e.sources || [])
                  Targets.attribute(s.node, 'shift', e.value);
            });
            o.observe({ type: 'layout-shift' });
            Monitor._obs2.push(o);
          }

          /* The heartbeat: FPS always; freezes only on the bottom tier, so a
             block never logs twice. A hidden tab stops rAF entirely — that
             gap is the browser being frugal, not the page being stuck — so
             visibility changes reset the clock instead of logging. */
          Monitor._onVis = () => { Monitor._last = 0; Monitor._frames = 0; Monitor._fpsT = 0; };
          document.addEventListener('visibilitychange', Monitor._onVis);
          const tick = (t) => {
            if (!Monitor.running) return;
            if (Monitor._last) {
              const gap = t - Monitor._last;
              Monitor._frames++;
              if (t - Monitor._fpsT >= CONFIG.PERF.FPS_WINDOW) {
                Monitor.fps = Math.round((Monitor._frames * 1000) / (t - Monitor._fpsT));
                Monitor._frames = 0;
                Monitor._fpsT = t;
              }
              if (Monitor.tier === 'heartbeat' && gap >= Monitor.threshold() &&
                  document.visibilityState === 'visible') {
                Monitor.push({ t: Date.now(), ms: Math.round(gap), src: null, via: 'heartbeat' });
              }
            } else {
              Monitor._fpsT = t;
            }
            Monitor._last = t;
            // what is targeted follows the session: pins + the selection
            Targets.sync([...State.pins.map((p) => p.el), State.current]);
            /* A LIVE gauge repaints on its own clock. Renders are otherwise
               driven by the mouse, so a motionless user watched a stale
               number wearing a live label. Every ~500ms, and only when the
               overlay is showing something of ours that moves. */
            if (Monitor._redraw && t - (Monitor._drewT || 0) >= 500 &&
                (Targets.map.size || Monitor.log.length || State.hoverEl)) {
              Monitor._drewT = t;
              Monitor._redraw();
            }
            Monitor._raf = requestAnimationFrame(tick);
          };
          Monitor._raf = requestAnimationFrame(tick);
        },

        stop() {
          if (!Monitor.running) return;
          Monitor.running = false;
          Monitor._event = null;   // a stood-down monitor tells no more history
          Monitor._obs?.disconnect();
          Monitor._obs = null;
          Monitor._obs2.forEach((o) => o.disconnect());
          Monitor._obs2 = [];
          Targets.clear();
          cancelAnimationFrame(Monitor._raf);
          document.removeEventListener('visibilitychange', Monitor._onVis);
          Monitor._last = 0;
          // the log stays: the report section disappears with the arming
          // anyway (reportTail is collected from ACTIVE tools), and a user
          // who disarms mid-read should not watch their evidence vanish
        },
};

/** ms, readably: 320ms · 1.2s */
export function fmt(ms) {
        return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Hook: the runtime lifecycle. `this` is the tool — the settings owner;
 *  ctx carries capabilities in, the way intercept's does. */
export function watch(ctx) { Monitor.start(this, ctx); }
export function unwatch() { Monitor.stop(); }

/**
 * This page visit's story so far, as plain data for whoever keeps history —
 * the load's own timings, the buffered startup tasks, then every logged
 * freeze. `at` is ms since navigation (null when the platform buffered a
 * task without saying when). The side panel pulls this as a BACKLOG when it
 * connects or the tool arms, then rides the live events; the two sources
 * never mix because a backlog replaces.
 */
/**
 * This navigation's timings, read on demand. Deliberately NOT dependent on
 * the monitor running: navigation timing is a static fact the browser has
 * had since before this script existed, so the page load can be reported
 * whether or not anyone armed anything. The timeline used to open empty and
 * say "nothing yet" on a page that had demonstrably just loaded — a section
 * declaring it had nothing to show while holding the one thing it always
 * has (audit P2 — Goal Gradient: never start at zero when the first step is
 * already done).
 */
function readLoad() {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    if (!nav) return null;
    const fcp = performance.getEntriesByType?.('paint')
      ?.find((e) => e.name === 'first-contentful-paint');
    return {
      server: Math.round(nav.responseStart - nav.startTime),
      dom: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      done: nav.loadEventEnd ? Math.round(nav.loadEventEnd - nav.startTime) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
    };
  } catch { return null; }
}

export function timeline() {
  const out = [];
  const load = Monitor.load || readLoad();
  if (load) out.push({ kind: 'load', at: 0, ...load });
  for (const p of Monitor.pre) out.push({ kind: 'pre', at: null, ms: p.ms, src: p.src || null });
  const navStart = Date.now() - performance.now();
  for (const e of Monitor.log) {
    out.push({ kind: 'freeze', at: Math.max(0, Math.round(e.t - navStart)),
               ms: e.ms, via: e.via, blame: e.blame || null });
  }
  return out;
}
