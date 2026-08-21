import { Monitor, fmt } from './service.js';

/**
 * PAGE facts on an element badge — the same licence dupid already takes:
 * "this id is used twice" is about the document, and so is "the main thread
 * froze". The ⚡ prefix is the marker that what follows is the page's
 * health, not this element's geometry; the legend spells it out.
 */
export function badge() {
        if (!Monitor.running) return null;
        const fps = Monitor.fps == null ? '–' : Monitor.fps;
        const n = Monitor.log.length;
        return `<span class="dbgov-sp">⚡ ${fps}fps</span>` +
               (n ? ` <span class="dbgov-warn">${n}× worst ${fmt(Monitor.worst())}</span>` : '');
}

/** Quiet unless something froze — the compact badge is for problems. */
export function compact() {
        if (!Monitor.running || !Monitor.log.length) return null;
        return `<span class="dbgov-warn">⚡${fmt(Monitor.worst())}</span>`;
}

export function legend() {
        return [
          { mark: '⚡ 58fps', means: 'the PAGE, not this element: frames per second while monitoring' },
          { mark: '⚡1.2s', means: 'amber: the longest main-thread freeze since arming' },
        ];
}
