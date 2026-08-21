import { CONFIG } from '../../core/config.js';
import { Tools } from '../../core/registry.js';
import { Monitor, fmt } from './service.js';
import { Targets } from './target.js';

/**
 * RULE hook — but a monitor's findings come from TIME, not from the
 * element pass. The sweep hands this an element like any rule; the
 * answer comes from what the runtime has already seen on that element's
 * watch record. Not armed, not running, nothing watched → silence, which
 * is the honest answer and arrives by construction.
 *
 * These findings have a WHERE (the watched element), so they mark and
 * label like every other rule's. The page-wide freezes stay in the log
 * and the report — a freeze is a WHEN, and painting it on <body> would
 * be a mark pretending to know more than it does.
 */
export function audit(i) {
        if (!Monitor.running) return [];
        const s = Targets.stats(i.el);
        if (!s) return [];
        const out = [];
        const churn = Number(Tools.setting(this, 'churn')) || CONFIG.PERF.CHURN;
        if (s.rate >= churn) {
          out.push({ el: i.el, verdict: 'fail', severity: 'warn', rule: 'perf-churn',
                     message: `${s.rate} mutations/s under this element — a re-render storm`,
                     key: `perf-churn:${s.rate}` });
        }
        if (s.worstEvt && s.worstEvt >= Monitor.threshold()) {
          out.push({ el: i.el, verdict: 'fail', severity: 'warn', rule: 'perf-input',
                     message: `an input on this element took ${fmt(s.worstEvt)} to answer`,
                     key: `perf-input:${s.worstEvt}` });
        }
        return out;
}

export const rules = {
        'perf-churn': {
          help: 'DOM mutations per second under a watched element, against the churn threshold in ⚙. Only elements you pinned or selected are watched, and only while ⚡ is armed.',
          why: 'A component mutating the DOM hundreds of times a second is re-rendering in a loop — work the user cannot see, spent heating the main thread. It is the most common way one component eats a page.',
        },
        'perf-input': {
          help: 'The slowest input event a watched element answered, against the freeze threshold in ⚙. Reported where the browser supports the Event Timing API.',
          why: 'An input that takes hundreds of milliseconds to answer is the stutter a user actually feels — and it names the component responsible, which a page-wide freeze cannot.',
        },
};
