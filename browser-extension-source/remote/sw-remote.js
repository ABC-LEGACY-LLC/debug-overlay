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
  const S = { ws: null, url: '', token: '', tabId: null, wanted: false,
              live: false, why: '', retry: 0, timer: 0 };
  const status = () => ({ connected: S.live, wanted: S.wanted, url: S.url,
                          tabId: S.tabId, why: S.why });
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
      if (S.wanted) {
        S.why = was ? 'connection dropped — reconnecting' : (S.why || 'no server there yet — retrying');
        later();
      }
      tell();
    };
    ws.onerror = () => {};   // onclose follows, carrying the state
  }

  function handle(m) {
    if (m.t === 'welcome') { S.live = true; S.retry = 0; S.why = ''; tell(); return; }
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

  function call(m) {
    const done = (r) => send({ t: 'result', id: m.id,
      ...(r && typeof r === 'object' ? r : { ok: false, error: 'the page gave no answer' }) });
    if (S.tabId == null) {
      return done({ ok: false, error: 'no tab bound — open the side panel on the page and press Connect again' });
    }
    try {
      chrome.tabs.sendMessage(S.tabId, { type: 'debug-overlay-remote', cmd: m.cmd, args: m.args || [] }, (r) => {
        const e = chrome.runtime.lastError;
        if (e) {
          return done({ ok: false, error: 'the page did not answer (' + e.message + ') — the overlay ' +
            'is not running in that tab; reload it, or switch the side panel to a page that has it' });
        }
        done(r);
      });
    } catch (e) { done({ ok: false, error: String(e) }); }
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
      respond(status());
      return;
    }
    if (msg.type === 'debug-overlay-remote-disconnect') {
      S.wanted = false;
      shut();
      S.why = '';
      tell();
      respond(status());
      return;
    }
    if (msg.type === 'debug-overlay-remote-bind') {
      if (msg.tabId != null) S.tabId = msg.tabId;
      respond(status());
      return;
    }
    if (msg.type === 'debug-overlay-remote-status') respond(status());
  });
})();
