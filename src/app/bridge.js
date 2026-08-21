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

let port = null;
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

function hello() {
  // version rides with the roster: a cockpit updated under a page that was
  // not refreshed can SAY "reload this page" instead of half-working
  send('tools', roster(), CONFIG.VERSION);
  for (const [id, v] of toolLast) send('tool', id, v);
  for (const [name, args] of last) send(name, ...args);
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
    // openView / rowActivate / rowRemove / rowChange / updateCheck /
    // updateApply: the cockpit's list views arrive in the next phase;
    // an unwired command is dropped here, never half-handled
  }
}

export const Bridge = {
  /** Wired by boot as Panel.onState — cache everything, forward when live. */
  state(name, ...args) {
    if (name === 'tool') toolLast.set(args[0], args[1]);
    else if (name !== 'flash') last.set(name, args);   // a flash is transient by definition
    send(name, ...args);
  },

  init() {
    const runtime = typeof chrome !== 'undefined' && chrome.runtime &&
      chrome.runtime.onConnect ? chrome.runtime : null;
    if (!runtime) return;   // the userscript gate: nothing to bridge to
    runtime.onConnect.addListener((p) => {
      if (p.name !== 'debug-overlay-cockpit') return;
      try { port?.disconnect(); } catch {}
      port = p;
      Panel.docked(true);
      p.onMessage.addListener((msg) => {
        const m = Protocol.read(msg);
        if (m && m.kind === 'cmd') command(m);
      });
      p.onDisconnect.addListener(() => {
        if (port !== p) return;   // already replaced by a newer cockpit
        port = null;
        Panel.docked(false);
      });
    });
  },
};
