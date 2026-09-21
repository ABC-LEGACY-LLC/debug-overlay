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
  /* HOW MANY TIMES TO KNOCK BEFORE SAYING NOBODY IS HOME.
     A refused WebSocket is logged by the BROWSER's network stack, not
     thrown — no handler can catch it and none can suppress it, so every
     attempt lands on the chrome://extensions Errors page for good. An
     endless retry therefore fills that page with red for a session that
     simply ended, and the extension reads as broken to anyone who looks.
     This project already paid for that lesson once, on the side panel's
     port: "a real install collected a page of them in a morning."
     Six tries with the backoff below is ~35s — long enough to cover
     starting the server right after pressing Connect, short enough that
     giving up is the normal end of a dead address rather than a surprise.
     Then the panel SAYS nothing is there, which is the honest answer and
     the one a person can act on. */
  const TRIES = 6;
  const S = { ws: null, url: '', token: '', tabId: null, wanted: false,
              live: false, why: '', page: '', retry: 0, timer: 0, beat: 0, tries: 0 };
  /**
   * Tell the page it is (or is no longer) being driven — AND learn from the
   * answer whether that page has a door at all.
   *
   * The heartbeat IS the probe, which is what stops the status going stale.
   * The first version asked once, at connect, by running a `state` command:
   * it counted as an action the AI never took, and a page that happened to
   * be mid-reload was recorded as having no door for the rest of the
   * session — the panel then said "no AI door" beside a chip that was
   * plainly live. Asked every beat, the answer corrects itself.
   *
   * The page RESPONDS to this message (app/remote.js), which is what makes
   * delivery provable: a listener that stays silent gives "the message port
   * closed" and reads exactly like no listener at all.
   */
  const tellTab = (tabId, live) => {
    if (tabId == null) return;
    try {
      chrome.tabs.sendMessage(tabId, { type: 'debug-overlay-session', live }, (r) => {
        const page = chrome.runtime.lastError || !r ? NO_DOOR : '';
        // only ever about the tab we are bound to NOW — a farewell sent to
        // the tab the panel just left says nothing about this one
        if (tabId === S.tabId && page !== S.page) { S.page = page; tell(); }
      });
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
    if (++S.tries > TRIES) {
      /* GIVING UP IS AN ANSWER. Said in the words the person needs — the
         address that is empty, and the two things to do about it — rather
         than leaving a status that says "connecting…" for ever over a
         browser quietly logging a refusal every ten seconds. */
      S.wanted = false;
      S.why = `nothing is listening at ${S.url} — start the server, then press Connect`;
      shut();
      tell();
      return;
    }
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
      // a session that actually ran and then dropped earns a fresh budget:
      // the server restarting is the commonest reason, and it deserves the
      // same patience the first connect got
      if (was) S.tries = 0;
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
      S.live = true; S.retry = 0; S.tries = 0; S.why = '';
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
    tellTab(S.tabId, S.live);
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
      S.tries = 0;   // pressing Connect is a fresh ask, whatever the last one ended as
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
