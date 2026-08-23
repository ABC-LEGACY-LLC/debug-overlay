/* ======================================================================
  BRIDGE — the web panel's contract, carried over a port.

     THE TWO PANELS. The WEB PANEL lives on the page (src/ui/), and is the
     only surface the userscript gate has. The SIDE PANEL is the browser's
     own, extension-only, and outlives the page it describes. It is a
     SECOND RENDERING of the web panel's state, never a second overlay —
     which is why this file is deliberately ignorant: it subscribes to
     what the web panel announces (WebPanel.onState, wired by boot),
     caches the latest of each, replays the cache to a side panel that
     says hello, then forwards live announcements as they come. Commands
     come back onto the SAME callback slots boot wired for the web
     panel's own buttons, so arming a tool from either face is one code
     path from the first line on.

     It knows no tool ids, no views, no settings — the roster it sends is
     read from the registry the way the web panel's own buttons are, and
     everything else is opaque names handed through, the standing rule.

     GATE-AWARE, CORE-BLIND: chrome.runtime.onConnect exists only for a
     real content script — no page, and no userscript sandbox, is ever
     given it — so under Tampermonkey this file goes quietly inert and
     the bundle stays byte-identical across both gates.
   ====================================================================== */
import { Protocol } from '../core/protocol.js';
import { CONFIG } from '../core/config.js';
import { Tools, TOOLS } from '../core/registry.js';
import { Store } from '../core/state.js';
import { WebPanel } from '../ui/web-panel.js';
import { Updates } from './updates.js';

let port = null;
let watching = null;          // the view the side panel holds open, or null
let rowsTimer = 0;
const last = new Map();       // state name → latest args (scalars)
const toolLast = new Map();   // tool id → armed (per-id, or replay loses all but one)

function send(name, ...args) {
  if (!port) return;
  try { port.postMessage(Protocol.state(name, ...args)); }
  catch { port = null; WebPanel.setVisible(true); }   // died mid-send; give the bar back
}

/** The roster the bar itself is built from: enough for the side panel to
 *  draw real buttons, none of it decision-bearing. */
function roster() {
  return TOOLS.map((t) => ({
    id: t.id, icon: t.icon, title: t.title,
    fam: t.family || null, roles: Tools.rolesOf(t),
  }));
}

/** Every armed runtime's story so far, one backlog push per tool. A backlog
 *  REPLACES that tool's entries for this page visit, side-panel side, so
 *  sending it again (a re-arm, a reconnect) never doubles history. */
function backlogs() {
  for (const t of Tools.withHook('timeline', true)) {
    try { send('events', t.id, t.timeline.call(t) || [], true); } catch {}
  }
}

/** Does the user want the web panel's bar visible while the side panel
 *  drives? Off unless they said otherwise — two controls claiming one state
 *  is what hiding it solved. */
const wantsWebPanel = () => Store.get(CONFIG.WEBPANEL_KEY) === '1';

function hello() {
  // version rides with the roster: a side panel updated under a page that was
  // not refreshed can SAY "reload this page" instead of half-working
  send('tools', roster(), CONFIG.VERSION);
  send('page', location.origin);   // whose page this connection speaks for
  send('webPanel', wantsWebPanel());
  for (const [id, v] of toolLast) send('tool', id, v);
  for (const [name, args] of last) send(name, ...args);
  backlogs();
}

/** The watched view's rows, fresh from the controller via the panel's query
 *  slot — the SAME pair the popover renders, packed for the wire. */
function pushRows() {
  if (!watching) return;
  const q = WebPanel.onRowsFor?.(watching);
  if (q) send('rows', watching, q.rows, q.empty);
}

/** Announcements arrive in bursts (one interaction moves count AND swept AND
 *  the badge), so announce-triggered refreshes coalesce into one push. A
 *  command-triggered refresh stays synchronous instead — the side panel that
 *  caused the change reads the result in the same breath. */
function queueRows() {
  if (!watching) return;
  clearTimeout(rowsTimer);
  rowsTimer = setTimeout(pushRows, 30);
}

function command({ name, args }) {
  switch (name) {
    case 'hello': hello(); break;
    case 'toggle': WebPanel.onToggle?.(); break;
    case 'tool': WebPanel.onTool?.(args[0]); break;
    case 'sweep': WebPanel.onSweep?.(); break;
    case 'copy': WebPanel.onCopy?.(); break;
    case 'clear': WebPanel.onClear?.(); break;
    case 'badgeControl': WebPanel.onBadgeControl?.(args[0]); break;
    /* the side panel's list: the view travels with every row command, so the
       index resolves against the list the SIDE PANEL rendered — never against
       whatever the in-page popover happens to show */
    case 'openView': watching = args[0] || null; break;
    case 'rowActivate': WebPanel.onRowActivate?.(args[1], args[0]); break;
    case 'rowRemove': WebPanel.onRowRemove?.(args[1], args[0]); break;
    case 'rowChange': WebPanel.onRowChange?.(args[1], args[2], args[0]); break;
    /* a found update announces itself through WebPanel.setUpdate as ever; the
       explicit 'checked' answer exists because "you are current" has no
       announcement, and a button that does nothing visible is worse than
       no button */
    case 'updateCheck':
      Promise.resolve(Updates.check(true)).then((v) => send('checked', v || null));
      break;
    case 'updateApply': Updates.apply(); break;   // per gate; no cursor, no menu
    /* SHOW BOTH, on purpose. Hiding the bar is the default because two
       controls claiming one state is a lie about which one is in charge —
       but a screenshot for an AI wants the bar IN the picture, and the side
       panel is not in the picture. So it is a choice, and it persists. */
    case 'webPanel':
      Store.set(CONFIG.WEBPANEL_KEY, args[0] ? '1' : '0');
      WebPanel.setVisible(!!args[0]);
      send('webPanel', !!args[0]);
      break;
  }
  // every command can move the rows (a removal, a changed setting, a sweep);
  // answering in the same breath is what lets the side panel trust its list
  pushRows();
}

export const Bridge = {
  /** Wired by boot as WebPanel.onState — cache everything, forward when live. */
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
   *  side panel timeline entry the instant it happens. */
  toolEvent(id, e) {
    send('events', id, [e], false);
  },

  init() {
    const runtime = typeof chrome !== 'undefined' && chrome.runtime &&
      chrome.runtime.onConnect ? chrome.runtime : null;
    if (!runtime) return;   // the userscript gate: nothing to bridge to
    runtime.onConnect.addListener((p) => {
      /* the pre-rename port name is accepted too — refusing it outright
         would leave an un-refreshed side panel saying "waiting for page"
         with no reason given, when the protocol can tell it to reload. */
      if (p.name !== 'debug-overlay-side-panel' &&
          p.name !== 'debug-overlay-cockpit') return;
      try { port?.disconnect(); } catch {}
      port = p;
      watching = null;   // the new side panel says which view it holds, if any
      WebPanel.setVisible(wantsWebPanel());
      p.onMessage.addListener((msg) => {
        const m = Protocol.read(msg);
        if (m && m.kind === 'cmd') command(m);
      });
      p.onDisconnect.addListener(() => {
        if (port !== p) return;   // already replaced by a newer side panel
        port = null;
        watching = null;
        WebPanel.setVisible(true);
      });
    });
  },
};
