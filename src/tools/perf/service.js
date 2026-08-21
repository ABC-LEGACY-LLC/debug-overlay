import { CONFIG } from '../../core/config.js';
import { Tools } from '../../core/registry.js';

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
        _obs: null, _raf: 0, _last: 0, _frames: 0, _fpsT: 0,
        _onVis: null,

        threshold() {
          const v = Monitor._owner && Tools.setting(Monitor._owner, 'freeze');
          return Number(v) || CONFIG.PERF.FREEZE_MS;
        },

        push(ev) {
          Monitor.log.push(ev);
          if (Monitor.log.length > CONFIG.PERF.LOG_MAX) Monitor.log.shift();
        },

        worst() {
          return Monitor.log.reduce((m, e) => Math.max(m, e.ms), 0);
        },

        start(owner) {
          if (Monitor.running) return;
          Monitor.running = true;
          Monitor._owner = owner;
          // a fresh session starts a fresh log — the page moved on, and a
          // freeze from before the power cycle is a stale claim about it
          Monitor.log = [];
          Monitor.fps = null;
          Monitor.startedAt = Date.now();

          const types = (typeof PerformanceObserver !== 'undefined' &&
                         PerformanceObserver.supportedEntryTypes) || [];
          if (types.includes('long-animation-frame')) {
            Monitor.tier = 'frame-attribution';
            Monitor._obs = new PerformanceObserver((list) => {
              for (const e of list.getEntries()) {
                if (e.duration < Monitor.threshold()) continue;
                const s = e.scripts && e.scripts[0];
                const src = s && (s.sourceURL || s.invoker || s.name) || null;
                Monitor.push({ t: Date.now(), ms: Math.round(e.duration),
                               src: src && String(src).split('/').pop().split('?')[0],
                               via: 'frame' });
              }
            });
            Monitor._obs.observe({ type: 'long-animation-frame' });
          } else if (types.includes('longtask')) {
            Monitor.tier = 'long-tasks';
            Monitor._obs = new PerformanceObserver((list) => {
              for (const e of list.getEntries()) {
                if (e.duration < Monitor.threshold()) continue;
                Monitor.push({ t: Date.now(), ms: Math.round(e.duration),
                               src: null, via: 'task' });
              }
            });
            Monitor._obs.observe({ type: 'longtask' });
          } else {
            Monitor.tier = 'heartbeat';
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
            Monitor._raf = requestAnimationFrame(tick);
          };
          Monitor._raf = requestAnimationFrame(tick);
        },

        stop() {
          if (!Monitor.running) return;
          Monitor.running = false;
          Monitor._obs?.disconnect();
          Monitor._obs = null;
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

/** Hook: the runtime lifecycle. `this` is the tool — the settings owner. */
export function watch() { Monitor.start(this); }
export function unwatch() { Monitor.stop(); }
