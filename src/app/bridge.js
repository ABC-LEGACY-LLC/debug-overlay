/* ======================================================================
  BRIDGE — the panel's contract, carried over a port.

     The cockpit (the extension's side-panel face) is a SECOND rendering
     of the same panel state, so this file is deliberately ignorant: it
     subscribes to what the panel announces (Panel.onState, wired by
     boot), caches the latest of each, and replays the cache to a
     cockpit that says hello — then forwards live announcements as they
     come. Commands from the cockpit land on the SAME callback slots
     boot wired for the bar's own buttons, so arming a tool from the
     side panel and arming it from the bar are one code path from the
     first line on.

     It knows no tool ids, no views, no settings — the roster it sends
     is read from the registry the way the bar's own buttons are, and
     everything else is opaque names handed through, the standing rule.

     GATE-AWARE, CORE-BLIND: chrome.runtime.onConnect exists only for a
     real content script — no page, and no userscript sandbox, is ever
     given it — so under Tampermonkey this file goes quietly inert and
     the bundle stays byte-identical across both gates.
   ====================================================================== */
import { Protocol } from '../core/protocol.js';
import { CONFIG } from '../core/config.js';
import { Tools, TOOLS } from '../core/registry.js';
import { Panel } from '../ui/panel.js';
import { Updates } from './updates.js';

let port = null;
let watching = null;          // the view the cockpit holds open, or null
let rowsTimer = 0;
const last = new Map();       // state name → latest args (scalars)
const toolLast = new Map();   // tool id → armed (per-id, or replay loses all but one)

function send(name, ...args) {
  if (!port) return;
  try { port.postMessage(Protocol.state(name, ...args)); }
  catch { port = null; Panel.docked(false); }   // died mid-send; undock now, reconnect will re-dock
}

/** The roster the bar itself is built from: enough for the cockpit to
 *  draw real buttons, none of it decision-bearing. */
function roster() {
  return TOOLS.map((t) => ({
    id: t.id, icon: t.icon, title: t.title,
    fam: t.family || null, roles: Tools.rolesOf(t),
  }));
}

/** Every armed runtime's story so far, one backlog push per tool. A backlog
 *  REPLACES that tool's entries for this page visit on the cockpit side, so
 *  sending it again (a re-arm, a reconnect) never doubles history. */
function backlogs() {
  for (const t of Tools.withHook('timeline', true)) {
    try { send('events', t.id, t.timeline.call(t) || [], true); } catch {}
  }
}

function hello() {
  // version rides with the roster: a cockpit updated under a page that was
  // not refreshed can SAY "reload this page" instead of half-working
  send('tools', roster(), CONFIG.VERSION);
  send('page', location.origin);   // whose page this connection speaks for
  for (const [id, v] of toolLast) send('tool', id, v);
  for (const [name, args] of last) send(name, ...args);
  backlogs();
}

/** The watched view's rows, fresh from the controller via the panel's query
 *  slot — the SAME pair the popover renders, packed for the wire. */
function pushRows() {
  if (!watching) return;
  const q = Panel.onRowsFor?.(watching);
  if (q) send('rows', watching, q.rows, q.empty);
}

/** Announcements arrive in bursts (one interaction moves count AND swept AND
 *  the badge), so announce-triggered refreshes coalesce into one push. A
 *  command-triggered refresh stays synchronous instead — the cockpit that
 *  caused the change reads the result in the same breath. */
function queueRows() {
  if (!watching) return;
  clearTimeout(rowsTimer);
  rowsTimer = setTimeout(pushRows, 30);
}

function command({ name, args }) {
  switch (name) {
    case 'hello': hello(); break;
    case 'toggle': Panel.onToggle?.(); break;
    case 'tool': Panel.onTool?.(args[0]); break;
    case 'sweep': Panel.onSweep?.(); break;
    case 'copy': Panel.onCopy?.(); break;
    case 'clear': Panel.onClear?.(); break;
    case 'badgeControl': Panel.onBadgeControl?.(args[0]); break;
    /* the cockpit's list: the view travels with every row command, so the
       index resolves against the list the COCKPIT rendered — never against
       whatever the in-page popover happens to show */
    case 'openView': watching = args[0] || null; break;
    case 'rowActivate': Panel.onRowActivate?.(args[1], args[0]); break;
    case 'rowRemove': Panel.onRowRemove?.(args[1], args[0]); break;
    case 'rowChange': Panel.onRowChange?.(args[1], args[2], args[0]); break;
    /* a found update announces itself through Panel.setUpdate as ever; the
       explicit 'checked' answer exists because "you are current" has no
       announcement, and a button that does nothing visible is worse than
       no button */
    case 'updateCheck':
      Promise.resolve(Updates.check(true)).then((v) => send('checked', v || null));
      break;
    case 'updateApply': Updates.apply(); break;   // per gate; no cursor, no menu
  }
  // every command can move the rows (a removal, a changed setting, a sweep);
  // answering in the same breath is what lets the cockpit trust its list
  pushRows();
}

export const Bridge = {
  /** Wired by boot as Panel.onState — cache everything, forward when live. */
  state(name, ...args) {
    if (name === 'tool') toolLast.set(args[0], args[1]);
    else if (name !== 'flash') last.set(name, args);   // a flash is transient by definition
    send(name, ...args);
    // arming starts a runtime, and starting fills its load/startup story —
    // but the announce fires BEFORE syncRuntimes starts it, so the backlog
    // waits one tick (replace semantics make repeats harmless anyway)
    if (name === 'tool' && args[1]) setTimeout(backlogs, 0);
    // page-side changes (a click pinning, a sweep landing) announce here,
    // and the watched rows follow — coalesced, since announcements burst
    queueRows();
  },

  /** Wired by boot as Controller.onToolEvent — a runtime's moment becomes a
   *  cockpit timeline entry the instant it happens. */
  toolEvent(id, e) {
    send('events', id, [e], false);
  },

  init() {
    const runtime = typeof chrome !== 'undefined' && chrome.runtime &&
      chrome.runtime.onConnect ? chrome.runtime : null;
    if (!runtime) return;   // the userscript gate: nothing to bridge to
    runtime.onConnect.addListener((p) => {
      if (p.name !== 'debug-overlay-cockpit') return;
      try { port?.disconnect(); } catch {}
      port = p;
      watching = null;   // the new cockpit says which view it holds, if any
      Panel.docked(true);
      p.onMessage.addListener((msg) => {
        const m = Protocol.read(msg);
        if (m && m.kind === 'cmd') command(m);
      });
      p.onDisconnect.addListener(() => {
        if (port !== p) return;   // already replaced by a newer cockpit
        port = null;
        watching = null;
        Panel.docked(false);
      });
    });
  },
};
