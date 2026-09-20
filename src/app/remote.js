/* ======================================================================
  REMOTE — the third door into the same room.

     The bar is one face of the controller, the side panel a second, and
     this is a third: an AI on the far end of the worker's socket. It
     holds the rule bridge.js holds, and holds it harder because nobody
     is watching the screen: every command lands on the SAME slots boot
     wired for the bar's own buttons, or on the controller calls those
     slots make. Nothing here decides anything. It translates a command
     into the click it stands for and hands back what the panel would
     have shown — as plain data, because the reader cannot see the page.

     GESTURES, NOT TOOL NAMES. `click`, `drag` and `point` dispatch the
     pointer events a hand would, on the page, and whatever runtime is
     armed answers: a box for a lasso, a probe for paint, a pin for pin.
     This file names no tool, so a tool shipped tomorrow is driven the day
     it lands. The AI learns the ids from `state`, the way a person learns
     them from the bar — and `arm` is how it takes one up.

     GATE-AWARE, CORE-BLIND. chrome.runtime.onMessage exists only for a
     real content script, so on the dev page and in the suite this goes
     inert. A content script cannot be addressed by anything but its own
     extension, and the worker sends nothing until the user has connected
     a session from the side panel with a token — so the gate is the
     person, at the keyboard, every time.
   ====================================================================== */
import { State } from '../core/state.js';
import { CONFIG } from '../core/config.js';
import { Tools } from '../core/registry.js';
import { U } from '../core/utils.js';
import { WebPanel } from '../ui/web-panel.js';
import { Settings } from '../services/settings/index.js';
import { Report } from '../services/report/index.js';
import { Sweep } from '../services/findings/index.js';
import { Controller } from './controller.js';

/** One pin, as data a reader can locate it by. */
function pack(p) {
  return { id: p.id, kind: p.kind, selector: U.selectorOf(p.el),
           label: U.labelOf(p.el), rect: rectOf(p.el) };
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top),
           w: Math.round(r.width), h: Math.round(r.height) };
}

/** The element a hand would land on at a viewport point. */
function under(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) throw new Error(`nothing at (${x}, ${y}) — outside the viewport?`);
  return el;
}

/** A pointer event the way a browser would send it: a PointerEvent where the
 *  page has them, a MouseEvent with the same coordinates where it does not,
 *  so the overlay's own listeners — installed on the window in the capture
 *  phase — see exactly what a hand produces. */
function pointer(type, x, y, mods = {}) {
  const init = { bubbles: true, cancelable: true, composed: true,
                 clientX: x, clientY: y, button: 0, buttons: type.endsWith('up') ? 0 : 1,
                 shiftKey: !!mods.shift, ctrlKey: !!mods.ctrl,
                 metaKey: !!mods.meta, altKey: !!mods.alt };
  const P = typeof PointerEvent === 'function' ? PointerEvent : null;
  return P && type.startsWith('pointer')
    ? new P(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true })
    : new MouseEvent(type, init);
}

function select(sel) {
  let el = null;
  try { el = document.querySelector(sel); } catch { throw new Error(`not a CSS selector: ${sel}`); }
  if (!el) throw new Error(`nothing matches ${sel}`);
  return el;
}

/** The grouped findings, packed — the same rows the ⌕ list shows, with the
 *  full selector a reader needs to find each one. */
function findings() {
  const s = State.sweep;
  const groups = Sweep.group(s ? s.findings : []);
  return {
    swept: !!s,
    problems: groups.length,
    occurrences: s ? s.findings.length : 0,
    elements: s ? s.elements : 0,
    findings: groups.map((g) => ({
      rule: g.rule, severity: g.severity, verdict: g.verdict || 'fail',
      message: g.message, count: g.n, selector: U.selectorOf(g.el), rect: rectOf(g.el),
    })),
  };
}

/* Every command takes its args as an array — the wire hands them over that
   way — and returns plain data or a promise of it. A thrown Error becomes the
   caller's error text, so a command says WHY rather than doing nothing. */
const commands = {
  /** What a person sees on the bar and under ⚙, as data. Call it first:
   *  the ids here are what `arm` and `set` take. */
  state() {
    return {
      version: CONFIG.VERSION,
      url: location.href, title: document.title,
      on: State.enabled,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
                  scrollX: Math.round(scrollX), scrollY: Math.round(scrollY) },
      tools: Tools.runs().flatMap((run) => run.tools.map((t) => ({
        id: t.id, title: t.title, armed: State.tools.has(t.id),
        roles: Tools.rolesOf(t), family: t.family || t.subject || null, band: run.name,
      }))),
      settings: Settings.rows().filter((r) => r.opt).map((r) => ({
        owner: r.tool.id, key: r.opt.key, label: r.opt.label, affects: r.opt.affects,
        value: Tools.setting(r.tool, r.opt.key),
        ...(r.opt.type === 'number' ? { type: 'number', min: r.opt.min, max: r.opt.max, step: r.opt.step }
          : r.opt.type === 'toggle' ? { type: 'toggle' }
          : { values: r.opt.values }),
      })),
      pins: State.pins.length,
      swept: !!State.sweep,
    };
  },

  power([on]) {
    if (!!on !== State.enabled) WebPanel.onToggle?.();
    return { on: State.enabled };
  },

  /** Arm or disarm by id — through the bar's own slot, so a runtime starts
   *  and stops exactly as it does from a button. */
  arm([id, on]) {
    if (!Tools.byId(id)) {
      throw new Error(`no tool '${id}' — the ids are: ${Tools.all.map((t) => t.id).join(', ')}`);
    }
    const want = on == null ? !State.tools.has(id) : !!on;
    if (want !== State.tools.has(id)) WebPanel.onTool?.(id);
    return { id, armed: State.tools.has(id) };
  },

  /** One setting, by owner and key, through the same row the ⚙ view edits —
   *  so the affects-driven sweep invalidation and the redraw happen exactly
   *  as they do for a person. The index resolves against rows('settings'),
   *  the standing rule for every row callback. */
  set([owner, key, value]) {
    const rows = Controller.rows('settings');
    const i = rows.findIndex((r) => r.opt && r.tool.id === owner && r.opt.key === key);
    if (i < 0) throw new Error(`no setting ${owner}.${key} — state lists them`);
    const row = rows[i];
    let raw;
    if (row.opt.type === 'number') {
      if (!Settings.valid(row.opt, value)) {
        throw new Error(`${owner}.${key} takes a number` +
          (row.opt.min != null || row.opt.max != null ? ` from ${row.opt.min ?? '-∞'} to ${row.opt.max ?? '∞'}` : ''));
      }
      raw = value;
    } else if (row.opt.type === 'toggle') {
      raw = !!value;
    } else {
      raw = row.control.values.indexOf(value);
      if (raw < 0) throw new Error(`${owner}.${key} takes one of: ${row.opt.values.join(', ')}`);
    }
    Controller.changeRow(i, raw, 'settings');
    return { owner, key, value: Tools.setting(row.tool, key) };
  },

  /** Pin by selector. Reaches what a click cannot, the way the lasso does:
   *  it asks the DOM, not the hit test. */
  pin([selector]) {
    const el = select(selector);
    Controller.pinMany([el]);
    const p = State.pins.find((x) => x.el === el);
    return p ? pack(p) : null;
  },

  unpin([which]) {
    const p = typeof which === 'number'
      ? State.pins.find((x) => x.id === which)
      : State.pins.find((x) => x.el === select(which));
    if (!p) throw new Error(`no pin ${which}`);
    Controller.removePin(p);
    return { removed: p.id, pins: State.pins.length };
  },

  pins() {
    return State.pins.filter((p) => document.contains(p.el)).map(pack);
  },

  /** A click, as a hand makes one — so whatever is armed answers, and a
   *  modifier means what it means at the keyboard. */
  click([x, y, mods]) {
    const el = under(x, y);
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(pointer(type, x, y, mods));
    }
    return { at: [x, y], target: U.selectorOf(el), pins: State.pins.length,
             current: State.current ? U.selectorOf(State.current) : null };
  },

  /** Press, drag, release. The browser sends a click after any press, so
   *  this does too — the runtime that owns the drag is the one that claims
   *  it, exactly as it would after a hand let go. */
  drag([x1, y1, x2, y2]) {
    const from = under(x1, y1);
    from.dispatchEvent(pointer('pointerdown', x1, y1));
    const to = under(x2, y2);
    to.dispatchEvent(pointer('pointermove', x2, y2));
    to.dispatchEvent(pointer('pointerup', x2, y2));
    to.dispatchEvent(pointer('click', x2, y2));
    return { from: [x1, y1], to: [x2, y2], pins: State.pins.length };
  },

  /** Move the pointer without pressing. The hover badge follows, and so
   *  does any runtime that watches the pointer — paint's probe, for one. */
  point([x, y]) {
    const el = under(x, y);
    el.dispatchEvent(pointer('pointermove', x, y));
    el.dispatchEvent(pointer('mousemove', x, y));
    return { at: [x, y], target: U.selectorOf(el) };
  },

  /** ⌕, awaited. The sweep may yield on a large page; the answer is the
   *  grouped findings once it has actually finished. */
  audit() {
    if (!State.enabled) throw new Error('powered off — call power(true) first');
    if (Controller._sweeping) throw new Error('a sweep is already running');
    return Controller.sweep().then(findings);
  },

  findings() { return findings(); },

  /** The report ⧉ copies — prepared, so a tool that fetches first gets to,
   *  and never on the clipboard. */
  report() { return Report.build(); },

  clear() {
    WebPanel.onClear?.();
    return { pins: State.pins.length };
  },
};

/**
 * WHO IS DRIVING — the signal the page owes the person sitting in front of
 * it. An AI can arm tools, change settings, pin, drag and sweep; with
 * nothing on screen saying so, the page rearranges itself under somebody's
 * hands with no account of why. This is the account.
 *
 * TWO FACTS, FROM TWO PLACES. Whether a session is CONNECTED is the
 * worker's to know (it holds the socket), and it says so by heartbeat —
 * repeated, not announced once, because a worker Chrome suspended cannot
 * tell anyone it went, and a chip still claiming a session that ended is
 * worse than no chip. Whether a command is RUNNING is this file's to know,
 * because every command passes through it.
 */
const Driver = {
  live: false, busy: false, cmd: '', n: 0, recent: [], _stale: 0, _hold: 0,

  /** The worker's heartbeat: the socket is (or is no longer) up. */
  beat(live) {
    clearTimeout(Driver._stale);
    if (live) Driver._stale = setTimeout(() => Driver.beat(false), CONFIG.AI.STALE);
    if (live === Driver.live) return;
    Driver.live = live;
    if (!live) { Driver.busy = false; Driver.cmd = ''; clearTimeout(Driver._hold); }
    Driver.show();
  },

  start(cmd) {
    clearTimeout(Driver._hold);
    // a command arriving IS a live session, whatever the last heartbeat said
    if (!Driver.live) Driver.beat(true);
    Driver.busy = true;
    Driver.cmd = cmd;
    Driver.n++;
    Driver.show();
  },

  /** The command finished. Its name RESTS for a moment rather than
   *  vanishing: most of these take a millisecond, and a chip that blinks
   *  through eleven commands tells the person nothing about any of them. */
  done(cmd, ok, ms) {
    Driver.busy = false;
    Driver.recent.unshift({ cmd, ok: !!ok, ms });
    Driver.recent.length = Math.min(Driver.recent.length, CONFIG.AI.RECENT);
    Driver.show();
    clearTimeout(Driver._hold);
    Driver._hold = setTimeout(() => {
      if (Driver.busy) return;            // another command started meanwhile
      Driver.cmd = '';
      Driver.show();
    }, CONFIG.AI.HOLD);
  },

  /* ONE ANNOUNCEMENT, BOTH FACES. setDriver paints the bar and forwards the
     same object to the side panel through onState, so the page and the
     panel cannot tell different stories about who is driving. */
  show() {
    WebPanel.setDriver({ live: Driver.live, busy: Driver.busy, cmd: Driver.cmd,
                         n: Driver.n, recent: Driver.recent.slice() });
  },
};

function answer(fn, args, respond) {
  let r;
  try { r = fn(Array.isArray(args) ? args : []); }
  catch (e) { respond({ ok: false, error: String((e && e.message) || e) }); return false; }
  if (r && typeof r.then === 'function') {
    r.then((v) => respond({ ok: true, result: v ?? null }),
           (e) => respond({ ok: false, error: String((e && e.message) || e) }));
    return true;   // async response, Chrome's way of saying so
  }
  respond({ ok: true, result: r ?? null });
  return false;
}

/** Run one command, and let the page say that it is being run. */
function drive(cmd, fn, args, respond) {
  Driver.start(cmd);
  const t = Date.now();
  const finish = (r) => { Driver.done(cmd, r && r.ok, Date.now() - t); respond(r); };
  return answer(fn, args, finish);
}

export const Remote = {
  /** The vocabulary, for anything that wants to say what it can do. */
  commands: () => Object.keys(commands),

  init() {
    const runtime = typeof chrome !== 'undefined' && chrome.runtime &&
      chrome.runtime.onMessage ? chrome.runtime : null;
    if (!runtime) return;   // not a content script: nothing to answer to
    runtime.onMessage.addListener((msg, sender, respond) => {
      if (!msg || typeof msg.type !== 'string') return;
      // only OUR extension may drive this page; a foreign id is not answered
      if (sender && sender.id && runtime.id && sender.id !== runtime.id) return;
      /* The worker's heartbeat — the socket is up, and keeps being up. It
         is ANSWERED, and the answer is the point: the worker uses delivery
         to decide whether this page has a door at all, and a listener that
         stays silent is indistinguishable from no listener. */
      if (msg.type === 'debug-overlay-session') {
        Driver.beat(!!msg.live);
        respond({ ok: true, door: true });
        return;
      }
      if (msg.type !== 'debug-overlay-remote') return;
      const fn = commands[msg.cmd];
      if (!fn) {
        respond({ ok: false, error: `unknown command '${msg.cmd}' — one of: ${Object.keys(commands).join(', ')}` });
        return;
      }
      return drive(msg.cmd, fn, msg.args, respond);
    });
    /* A RELOAD MUST NOT LOSE THE SESSION. The worker keeps the socket across
       a page load, so a fresh content script asks whether one is up rather
       than waiting out a heartbeat with the chip wrongly absent. */
    try {
      runtime.sendMessage?.({ type: 'debug-overlay-remote-status' }, (s) => {
        void runtime.lastError;   // read = acknowledged; no worker is not an error
        if (s && s.connected) Driver.beat(true);
      });
    } catch { /* no worker to ask: the heartbeat will say if one appears */ }
  },
};
