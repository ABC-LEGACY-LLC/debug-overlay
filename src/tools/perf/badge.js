import { CONFIG } from '../../core/config.js';
import { Tools } from '../../core/registry.js';
import { Monitor, fmt } from './service.js';
import { Targets } from './target.js';

/**
 * TWO kinds of ⚡ line, and the element decides which it gets.
 *
 * A WATCHED element (pinned, or the current selection) shows ITS OWN cost:
 * mutation rate over the subtree, the slowest input it answered, how much
 * layout shift it caused — the "what is this component doing" numbers.
 * Everything else shows the PAGE's pulse, the licence dupid already takes:
 * a page-wide fact is still worth reading off any badge.
 */
export function badge(i) {
        if (!Monitor.running) return null;
        const s = Targets.stats(i.el);
        if (s) {
          const churn = Number(Tools.setting(this, 'churn')) || CONFIG.PERF.CHURN;
          const mut = s.rate >= churn
            ? `<span class="debug-overlay-warn">mut ${s.rate}/s</span>` : `mut ${s.rate}/s`;
          const bits = [`⚡ ${mut}`];
          if (s.worstEvt) bits.push(`resp ${fmt(s.worstEvt)}`);
          if (s.shift > 0.005) bits.push(`shift ${s.shift.toFixed(2)}`);
          return `<span class="debug-overlay-sp">${bits.join(' · ')}</span>`;
        }
        const fps = Monitor.fps == null ? '–' : Monitor.fps;
        const n = Monitor.log.length;
        return `<span class="debug-overlay-sp">⚡ ${fps}fps</span>` +
               (n ? ` <span class="debug-overlay-warn">${n}× worst ${fmt(Monitor.worst())}</span>` : '');
}

/**
 * THE PAGE'S PULSE, for the docked bar — the same numbers the badge prints,
 * as plain text and without an element to ask about.
 *
 * It earns permanent space for the reason no badge can: it only means
 * anything while it MOVES. A frame rate read off a screenshot is a number;
 * a frame rate you are watching while you drag is the measurement. Silent
 * when the monitor is not running, so an unarmed tool says nothing.
 */
export function status() {
        if (!Monitor.running) return '';
        const fps = Monitor.fps == null ? '–' : Monitor.fps;
        const n = Monitor.log.length;
        return `⚡ ${fps}fps` + (n ? ` · ${n}× worst ${fmt(Monitor.worst())}` : '');
}

/** Quiet unless something is wrong — the compact badge is for problems. */
export function compact(i) {
        if (!Monitor.running) return null;
        const s = Targets.stats(i.el);
        const churn = Number(Tools.setting(this, 'churn')) || CONFIG.PERF.CHURN;
        if (s && s.rate >= churn) return `<span class="debug-overlay-warn">⚡mut ${s.rate}/s</span>`;
        if (!s && Monitor.log.length) return `<span class="debug-overlay-warn">⚡${fmt(Monitor.worst())}</span>`;
        return null;
}

export function legend() {
        return [
          { mark: '⚡ 58fps', means: 'the PAGE, not this element: frames per second while monitoring' },
          { mark: '⚡1.2s', means: 'amber: the longest main-thread freeze since arming' },
          { mark: '⚡ mut 140/s', means: 'a PINNED element: DOM mutations per second under it — a re-render storm reads in the hundreds' },
          { mark: 'resp 380ms', means: 'the slowest input this element answered (where the browser reports it)' },
          { mark: 'shift 0.02', means: 'layout shift this element caused (where the browser reports it)' },
        ];
}
