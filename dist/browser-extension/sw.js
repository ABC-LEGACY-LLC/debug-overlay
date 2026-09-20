// Debug Overlay service worker — the extension's network door.
// A page's CSP cannot reach in here, so update checks work everywhere.
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg && msg.type === 'debug-overlay-fetch' && typeof msg.url === 'string' &&
      msg.url.startsWith("https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/browser-extension/")) {
    fetch(msg.url, { cache: 'no-store' })
      .then((r) => r.text()).then((text) => respond({ ok: true, text }))
      .catch((e) => respond({ ok: false, error: String(e) }));
    return true;   // async response
  }
  if (msg && msg.type === 'debug-overlay-open-options') {
    chrome.runtime.openOptionsPage();
  }
});
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || msg.type !== 'debug-overlay-capture') return;
  const tab = sender && sender.tab;
  const where = tab ? ` [tab ${tab.id}, window ${tab.windowId}, active ${tab.active}]` : ' [no sender tab]';
  try {
    const done = (url) => {
      const e = chrome.runtime.lastError;
      if (e || !url) respond({ ok: false, error: ((e && e.message) ||
        'the tab could not be captured') + where });
      else respond({ ok: true, url });
    };
    if (tab) chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, done);
    else chrome.tabs.captureVisibleTab({ format: 'png' }, done);
  } catch (e) { respond({ ok: false, error: String(e) + where }); }
  return true;   // async response
});
const canOpen = !!(chrome.sidePanel && chrome.sidePanel.open);
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: !canOpen }).catch(() => {});
if (canOpen) chrome.action.onClicked.addListener((tab) => {
  // the click itself is what grants activeTab for this tab; opening the
  // panel here is what keeps that grant instead of spending it on Chrome
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  });
});
/* ---- THE AI SESSION — an AI on the far end of a socket -----------------

   Appended to sw.js by build.js, in BOTH builds. A store install can hold
   a session exactly as a sideloaded one can, because nothing here needs a
   permission the store build lacks: a WebSocket is not a host permission.

   THE EXTENSION DIALS OUT. An MCP server runs beside the AI — on the
   machine Claude Code runs on, which is not necessarily this one — and this
   worker connects to the address the person typed into the side panel,
   presenting the token they typed beside it. Nothing connects until they
   do. The server accepts ONE browser per token, so a session is one
   process, one token, one browser: there is no relay for anything to leak
   across, and a browser that never typed a token is never reached.

   COMMANDS GO TO ONE TAB, over chrome.tabs.sendMessage — the tab the side
   panel is bound to, which follows the person's eyes. The content script's
   door (src/app/remote.js) answers them; this file only carries.

   MEMORY, NOT STORAGE. The manifest grants no `storage`, so the session
   lives in this worker's memory and dies with the worker. The SIDE PANEL
   remembers the address, the token and the wish to be connected, and
   re-asks whenever it finds the worker has forgotten — so the side panel
   stays open while an AI session runs. The server's application-level
   pings every 20s keep the worker alive the way Chrome 116+ allows: traffic
   on a WebSocket resets the idle clock. */
(() => {
  /* THE HEARTBEAT TO THE PAGE. The page shows a chip while an AI is driving
     it, and that chip must go out by itself when the session does — a worker
     Chrome has suspended cannot send a farewell, so absence has to be the
     signal. Re-asserted every BEAT ms, three times inside the page's own
     CONFIG.AI.STALE window; change one and change the other. */
  const BEAT = 15000;
  const S = { ws: null, url: '', token: '', tabId: null, wanted: false,
              live: false, why: '', page: '', retry: 0, timer: 0, beat: 0 };
  /** Tell the page it is (or is no longer) being driven. */
  const tellTab = (tabId, live) => {
    if (tabId == null) return;
    try {
      chrome.tabs.sendMessage(tabId, { type: 'debug-overlay-session', live },
        () => void chrome.runtime.lastError);   // read = acknowledged
    } catch {}
  };
  function beating(on) {
    clearInterval(S.beat);
    S.beat = 0;
    if (!on) return;
    S.beat = setInterval(() => tellTab(S.tabId, true), BEAT);
  }
  const status = () => ({ connected: S.live, wanted: S.wanted, url: S.url,
                          tabId: S.tabId, why: S.why, page: S.page });
  // the side panel shows this if it is open; nobody listening is not an error
  const tell = () => {
    try { chrome.runtime.sendMessage({ type: 'debug-overlay-remote-state', ...status() }).catch(() => {}); }
    catch {}
  };
  const send = (o) => {
    try { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); } catch {}
  };

  function shut() {
    clearTimeout(S.timer);
    beating(false);
    const ws = S.ws;
    S.ws = null;
    S.live = false;
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch {} }
  }

  function later() {
    clearTimeout(S.timer);
    S.retry = Math.min(S.retry ? S.retry * 2 : 900, 10000);
    S.timer = setTimeout(open, S.retry);
  }

  function open() {
    clearTimeout(S.timer);
    if (!S.wanted || S.ws) return;
    let ws;
    try { ws = new WebSocket(S.url); }
    catch (e) {
      S.why = 'bad address: ' + ((e && e.message) || e);
      S.wanted = false;
      tell();
      return;
    }
    S.ws = ws;
    ws.onopen = () => {
      let version = '';
      try { version = chrome.runtime.getManifest().version; } catch {}
      send({ t: 'hello', token: S.token, version, tab: S.tabId });
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m && typeof m === 'object') handle(m);
    };
    ws.onclose = () => {
      const was = S.live;
      S.ws = null;
      S.live = false;
      beating(false);
      if (was) tellTab(S.tabId, false);   // the chip goes out with the session
      if (S.wanted) {
        S.why = was ? 'connection dropped — reconnecting' : (S.why || 'no server there yet — retrying');
        later();
      }
      tell();
    };
    ws.onerror = () => {};   // onclose follows, carrying the state
  }

  function handle(m) {
    if (m.t === 'welcome') {
      S.live = true; S.retry = 0; S.why = '';
      tellTab(S.tabId, true);
      beating(true);
      tell();
      return;
    }
    if (m.t === 'refused') {
      // a refusal is an answer, not an outage: stop retrying, and say why
      S.why = 'refused: ' + (m.why || 'wrong token');
      S.wanted = false;
      shut();
      tell();
      return;
    }
    if (m.t === 'ping') { send({ t: 'pong' }); return; }
    if (m.t === 'call') call(m);
  }

  /* The one failure a person can fix and an AI cannot: the bound tab's page
     runs no door — an overlay from before this update, never reloaded, or a
     browser page that never carries one. Said HERE, on the panel's status
     line, the moment the tab is bound — the first version said it only to
     the AI, one command later, and the person saw "connected" throughout. */
  const NO_DOOR = 'the page in this tab does not answer — reload it (an overlay from ' +
                  'before this update has no AI door), or switch the panel to a page that has one';
  function ask(cmd, args, cb) {
    try {
      chrome.tabs.sendMessage(S.tabId, { type: 'debug-overlay-remote', cmd, args: args || [] }, (r) => {
        const e = chrome.runtime.lastError;
        const page = e ? NO_DOOR : '';
        if (page !== S.page) { S.page = page; tell(); }
        cb(e ? { ok: false, error: NO_DOOR + ' (' + e.message + ')' } : r);
      });
    } catch (e) { cb({ ok: false, error: String(e) }); }
  }
  /** Is there a door in the bound tab? Asked whenever the tab changes, so the
   *  panel can say so before the AI finds out. */
  function probe() {
    if (S.tabId == null) return;
    ask('state', [], () => {});
  }

  function call(m) {
    const done = (r) => send({ t: 'result', id: m.id,
      ...(r && typeof r === 'object' ? r : { ok: false, error: 'the page gave no answer' }) });
    if (S.tabId == null) {
      return done({ ok: false, error: 'no tab bound — open the side panel on the page and press Connect again' });
    }
    ask(m.cmd, m.args, done);
  }

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('debug-overlay-remote-') !== 0) return;
    // only our own pages — the side panel — may steer the session
    if (sender && sender.id && sender.id !== chrome.runtime.id) return;
    if (msg.type === 'debug-overlay-remote-connect') {
      shut();
      S.url = String(msg.url || '');
      S.token = String(msg.token || '');
      if (msg.tabId != null) S.tabId = msg.tabId;
      S.wanted = !!S.url;
      S.why = S.url ? '' : 'no address';
      S.retry = 0;
      open();
      probe();
      respond(status());
      return;
    }
    if (msg.type === 'debug-overlay-remote-disconnect') {
      S.wanted = false;
      beating(false);
      tellTab(S.tabId, false);
      shut();
      S.why = '';
      tell();
      respond(status());
      return;
    }
    if (msg.type === 'debug-overlay-remote-bind') {
      if (msg.tabId != null && msg.tabId !== S.tabId) {
        // the session follows the panel's eyes: the tab it LEFT is no longer
        // being driven, and must stop saying it is
        tellTab(S.tabId, false);
        S.tabId = msg.tabId;
        S.page = '';
        tellTab(S.tabId, S.live);
        if (S.wanted) probe();
      }
      respond(status());
      return;
    }
    if (msg.type === 'debug-overlay-remote-status') respond(status());
  });
})();
