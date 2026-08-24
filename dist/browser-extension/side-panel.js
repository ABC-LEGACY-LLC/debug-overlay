(() => {
  // src/core/protocol.js
  var PROTOCOL_VERSION = 1;
  var FIELD = "debugOverlay";
  var LEGACY_FIELD = "dbgov";
  var STATE = {
    on: null,
    // (bool)
    tools: null,
    // (roster: [{id, icon, title, fam, roles}], coreVersion) — on hello
    tool: null,
    // (id, armed)
    count: null,
    // (n)
    swept: null,
    // (showing, n)
    removeMode: null,
    // (bool)
    update: null,
    // (version) — a KNOWN newer version exists
    checked: null,
    // (version|null) — a forced check's answer, null = current
    page: null,
    // (origin) — whose page this connection speaks for
    webPanel: null,
    // (visible) — is the on-page bar showing alongside us
    flash: null,
    // (msg, sel)
    badgeControls: (groups) => [groups.map(packBadgeGroup)],
    rows: (view, rows, empty) => [view, rows.map(packRow), empty],
    events: null,
    // (toolId, events[], isBacklog) — timeline entries, plain data;
    // a backlog REPLACES that tool's entries for this page visit
    bye: null
    // the page is unloading — expect a reconnect
  };
  var CMD = {
    toggle: null,
    // power
    tool: null,
    // (id) arm/disarm
    sweep: null,
    copy: null,
    clear: null,
    badgeControl: null,
    // (key)
    updateCheck: null,
    // (force)
    updateApply: null,
    webPanel: null,
    // (visible) — show/hide the on-page bar
    openView: null,
    // (view) — compute and push that view's rows
    rowActivate: null,
    // (view, i)
    rowRemove: null,
    // (view, i)
    rowChange: null,
    // (view, i, raw)
    hello: null
    // a side panel connected — push everything
  };
  function packRow(row) {
    const out = {};
    for (const k of [
      "title",
      "heading",
      "detail",
      "tag",
      "label",
      "accent",
      "inert",
      "removable",
      "rmTitle",
      "activatable",
      "control"
    ]) {
      if (row[k] !== void 0) out[k] = row[k];
    }
    if (row.pins) out.pinCount = row.pins.length;
    return out;
  }
  function packBadgeGroup(g) {
    return {
      key: g.key,
      glyph: g.glyph,
      title: g.title,
      rows: (g.rows || []).map((r) => ({
        key: r.key,
        glyph: r.glyph,
        title: r.title,
        label: r.label,
        armed: !!r.armed,
        fixed: !!r.fixed
      }))
    };
  }
  function envelope(kind, table, name, args) {
    if (!(name in table)) throw new Error(`unknown ${kind}: ${name}`);
    const pack = table[name];
    return {
      [FIELD]: PROTOCOL_VERSION,
      kind,
      name,
      args: pack ? pack(...args) : args
    };
  }
  var Protocol = {
    /** Build a state-push message. */
    state: (name, ...args) => envelope("state", STATE, name, args),
    /** Build a command message. */
    cmd: (name, ...args) => envelope("cmd", CMD, name, args),
    /**
     * Read a message from the wire. Returns { kind, name, args } for a
     * valid message of OUR protocol, and null for everything else —
     * the extension's worker traffic (debug-overlay-fetch and friends)
     * and any other extension's noise pass through untouched.
     */
    read(msg) {
      if (!msg || msg[FIELD] !== PROTOCOL_VERSION) return null;
      const table = msg.kind === "state" ? STATE : msg.kind === "cmd" ? CMD : null;
      if (!table || !(msg.name in table) || !Array.isArray(msg.args)) return null;
      return { kind: msg.kind, name: msg.name, args: msg.args };
    },
    /** A different-version message of ours — worth telling the user
     *  "refresh this page" instead of silently ignoring. */
    stale: (msg) => !!msg && (LEGACY_FIELD in msg || typeof msg[FIELD] === "number" && msg[FIELD] !== PROTOCOL_VERSION)
  };

  // browser-extension-source/side-panel/side-panel.js
  var VERSION = "3.8.130";
  var $ = (s) => document.querySelector(s);
  var body = document.body;
  var IC = {
    power: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>',
    sweep: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    copy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
    clear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    pin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
    gear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    webPanel: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/></svg>',
    refresh: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>'
  };
  var isSvg = (s) => /^<svg[\s>]/.test(s || "");
  var putIcon = (el, svg) => {
    if (isSvg(svg)) el.innerHTML = svg;
  };
  $("#ver").textContent = "v" + VERSION;
  putIcon($("#power"), IC.power);
  $("#power").insertAdjacentHTML("beforeend", '<span class="st">OFF</span>');
  for (const [sel, ic] of [
    ["[data-sweep]", IC.sweep],
    ["[data-copy]", IC.copy],
    ["[data-clear]", IC.clear],
    ["[data-upd]", IC.refresh],
    ['[data-view="findings"]', IC.sweep],
    ['[data-view="pins"]', IC.pin],
    ['[data-view="settings"]', IC.gear]
  ])
    putIcon($(sel + " .ic"), ic);
  putIcon($("#optBtn"), IC.gear);
  putIcon($("#webBtn"), IC.webPanel);
  try {
    const mf = chrome.runtime.getManifest();
    $("#optBtn").hidden = !mf.options_ui;
    $("[data-upd]").hidden = !(mf.host_permissions && mf.host_permissions.length);
  } catch {
  }
  var flashing = /* @__PURE__ */ new Map();
  function flash(msg, sel) {
    const b = $(sel);
    if (!b) return;
    const t = b.children[1];
    const live2 = flashing.get(b);
    const original = live2 ? live2.original : t.textContent;
    if (live2) clearTimeout(live2.timer);
    t.textContent = msg;
    flashing.set(b, { original, timer: setTimeout(() => {
      t.textContent = original;
      flashing.delete(b);
    }, 900) });
  }
  var myView = null;
  function setView(v) {
    myView = myView === v ? null : v;
    for (const b of document.querySelectorAll("#views [data-view]"))
      b.setAttribute("aria-pressed", String(b.dataset.view === myView));
    const box = $("#rowsBox");
    box.classList.toggle("show", !!myView);
    if (!myView) box.textContent = "";
    post(Protocol.cmd("openView", myView));
  }
  function renderRows(view, rows, empty) {
    if (view !== myView) return;
    const box = $("#rowsBox");
    box.textContent = "";
    if (!rows.length) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = empty || "Nothing here yet.";
      box.append(e);
      return;
    }
    rows.forEach((row, i) => {
      if (row.title || row.heading) {
        const h = document.createElement("div");
        h.className = row.title ? "viewhead" : "rowhead";
        h.textContent = row.title || row.heading;
        if (row.detail) {
          const n = document.createElement("span");
          n.className = "note";
          n.textContent = row.detail;
          h.append(n);
        }
        if (row.removable) h.append(rmButton(view, i, row.rmTitle));
        box.append(h);
        return;
      }
      const r = document.createElement("div");
      r.className = "rrow";
      if (row.accent) r.dataset.accent = row.accent;
      if (row.inert) r.classList.add("inert");
      if (row.label || row.detail) r.title = [row.label, row.detail].filter(Boolean).join("\n");
      const tag = document.createElement("span");
      tag.className = "tag";
      if (isSvg(row.tag)) tag.innerHTML = row.tag;
      else tag.textContent = row.tag || "";
      const lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = row.label || "";
      if (row.control) {
        r.append(tag, lbl, control(
          row.control,
          (raw) => post(Protocol.cmd("rowChange", view, i, raw)),
          row.label
        ));
      } else {
        const det = document.createElement("span");
        det.className = "det";
        det.textContent = row.detail || "";
        if (row.activatable) {
          const go = document.createElement("button");
          go.className = "go";
          go.append(tag, lbl, det);
          go.addEventListener("click", (e) => {
            e.stopPropagation();
            post(Protocol.cmd("rowActivate", view, i));
          });
          r.addEventListener("click", () => post(Protocol.cmd("rowActivate", view, i)));
          r.append(go);
        } else {
          r.append(tag, lbl, det);
        }
      }
      if (row.removable) r.append(rmButton(view, i));
      box.append(r);
    });
  }
  function rmButton(view, i, title) {
    const rm = document.createElement("button");
    rm.className = "rm";
    rm.textContent = "✕";
    rm.title = title || "Remove";
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      post(Protocol.cmd("rowRemove", view, i));
    });
    return rm;
  }
  function control(c, onChange, name) {
    if (c.kind === "choice") {
      const sel = document.createElement("select");
      (c.choices || []).forEach((label, k) => {
        const o = document.createElement("option");
        o.value = String(k);
        o.textContent = label;
        sel.append(o);
      });
      sel.selectedIndex = c.selected || 0;
      if (name) sel.setAttribute("aria-label", name);
      sel.addEventListener("click", (e) => e.stopPropagation());
      sel.addEventListener("change", () => onChange(sel.selectedIndex));
      return sel;
    }
    if (c.kind === "number") {
      const wrap = document.createElement("span");
      const inp = document.createElement("input");
      inp.type = "number";
      inp.value = c.value;
      if (c.min !== void 0) inp.min = String(c.min);
      if (c.max !== void 0) inp.max = String(c.max);
      if (c.step !== void 0) inp.step = String(c.step);
      if (name) inp.setAttribute("aria-label", name);
      inp.addEventListener("click", (e) => e.stopPropagation());
      inp.addEventListener("change", () => onChange(inp.value));
      wrap.append(inp);
      if (c.suffix) {
        const u = document.createElement("span");
        u.className = "unit";
        u.textContent = c.suffix;
        wrap.append(u);
      }
      return wrap;
    }
    if (c.kind === "toggle") {
      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.checked = !!c.on;
      if (name) inp.setAttribute("aria-label", name);
      inp.addEventListener("click", (e) => e.stopPropagation());
      inp.addEventListener("change", () => onChange(inp.checked));
      return inp;
    }
    return document.createElement("span");
  }
  var TL_MAX = 120;
  var timelines = /* @__PURE__ */ new Map();
  var toolIcons = {};
  function tl() {
    let r = timelines.get(tabId);
    if (!r) {
      r = { gen: 0, pendingReload: false, entries: [] };
      timelines.set(tabId, r);
    }
    return r;
  }
  function pageReturned() {
    const r = tl();
    if (!r.pendingReload) return;
    r.pendingReload = false;
    r.gen++;
    if (r.entries.length) r.entries.push({ gen: r.gen, marker: true });
    renderTimeline();
  }
  function tlPush(tool, evs, backlog) {
    const r = tl();
    if (backlog) r.entries = r.entries.filter((x) => !(x.gen === r.gen && x.tool === tool));
    for (const e of evs) r.entries.push({ gen: r.gen, tool, e });
    if (r.entries.length > TL_MAX) r.entries.splice(0, r.entries.length - TL_MAX);
    renderTimeline();
  }
  function renderTimeline() {
    const box = $("#timeline");
    const r = tl();
    box.textContent = "";
    $("#tlClear").hidden = !r.entries.length;
    if (!r.entries.length) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "Nothing yet — page loads and freezes land here as they happen, and the history survives reloads.";
      box.append(e);
      return;
    }
    for (let i = r.entries.length - 1; i >= 0; i--) {
      const x = r.entries[i];
      if (x.marker) {
        const d = document.createElement("div");
        d.className = "tl-reload";
        d.textContent = "reload";
        box.append(d);
        continue;
      }
      const row = document.createElement("div");
      row.className = "tlrow" + (x.e.kind === "freeze" ? " freeze" : "");
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = x.e.at == null ? "startup" : "+" + (x.e.at / 1e3).toFixed(1) + "s";
      const what = document.createElement("span");
      what.className = "what";
      const ic = document.createElement("span");
      putIcon(ic, toolIcons[x.tool]);
      if (ic.firstChild) what.append(ic, " ");
      const b = document.createElement("b");
      const why = document.createElement("span");
      why.className = "why";
      if (x.e.kind === "load") {
        b.textContent = "page load";
        why.textContent = " — " + [
          x.e.server != null ? `server ${x.e.server}ms` : null,
          x.e.fcp != null ? `first paint ${x.e.fcp}ms` : null,
          x.e.dom != null ? `DOM ${x.e.dom}ms` : null,
          x.e.done != null ? `done ${x.e.done}ms` : null
        ].filter(Boolean).join(" · ");
      } else if (x.e.kind === "pre") {
        b.textContent = `startup task ${x.e.ms}ms`;
        if (x.e.src) why.textContent = " — " + x.e.src;
      } else if (x.e.kind === "freeze") {
        b.textContent = `freeze ${x.e.ms}ms`;
        why.textContent = [
          x.e.via ? ` via ${x.e.via}` : "",
          x.e.blame ? ` — while ${x.e.blame}` : ""
        ].join("");
      } else {
        b.textContent = x.e.kind || "event";
      }
      what.append(b, why);
      row.append(when, what);
      row.title = [when.textContent, b.textContent, why.textContent].filter(Boolean).join(" ");
      box.append(row);
    }
  }
  var render = {
    on([v]) {
      body.dataset.on = v ? "1" : "";
      $("#power").setAttribute("aria-pressed", String(!!v));
      $("#power .st").textContent = v ? "ON" : "OFF";
    },
    tools([roster, coreV]) {
      if (coreV && coreV !== VERSION) return mode("stale");
      const box = $("#tools");
      box.textContent = "";
      for (const t of roster) {
        toolIcons[t.id] = t.icon;
        const b = document.createElement("button");
        b.dataset.tool = t.id;
        b.setAttribute("aria-pressed", "false");
        b.title = t.title + "\n" + (t.roles || []).join(" · ") + "\nright-click for its options";
        const ic = document.createElement("span");
        putIcon(ic, t.icon);
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = t.title.split(/[—–]/)[0].trim();
        b.append(ic, name);
        if (t.fam) {
          const f = document.createElement("span");
          f.className = "fam";
          f.textContent = t.fam;
          b.append(f);
        }
        b.addEventListener("click", () => post(Protocol.cmd("tool", t.id)));
        b.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          setView("tool:" + t.id);
        });
        box.append(b);
      }
    },
    tool([id, v]) {
      $(`#tools [data-tool="${id}"]`)?.setAttribute("aria-pressed", String(!!v));
    },
    count([n]) {
      $("[data-c]").textContent = n ? String(n) : "";
      $('#views [data-view="pins"] .n').textContent = n ? String(n) : "";
    },
    swept([v, n]) {
      const b = $("[data-sweep]");
      b.classList.toggle("swept", !!v);
      b.querySelector(".n").textContent = v ? `${n} problem${n === 1 ? "" : "s"}` : "";
      $('#views [data-view="findings"] .n').textContent = v ? String(n) : "";
    },
    update([v]) {
      $("#updTxt").textContent = `v${v} is available — this side panel runs v${VERSION}.`;
      $("#upd").classList.add("show");
    },
    /* a forced check's answer. A found version also announces as 'update';
       the null answer exists because "you are current" has no announcement,
       and a button that does nothing visible is worse than no button. */
    checked([v]) {
      if (v) render.update([v]);
      else flash("✓ current", "[data-upd]");
    },
    /* the on-page bar's visibility, echoed from the page — this button shows
       what IS, never what was asked for. Both panels at once is a deliberate
       choice (a screenshot for an AI wants the bar in the picture), which is
       why the default stays hidden and the answer comes back from the page. */
    webPanel([visible]) {
      $("#webBtn").setAttribute("aria-pressed", String(!!visible));
    },
    page([origin]) {
      status("connected · " + String(origin || "").replace(/^\w+:\/\//, ""), "ok");
    },
    badgeControls([groups]) {
      const box = $("#badge");
      box.textContent = "";
      for (const g of groups) {
        const grp = document.createElement("div");
        grp.className = "grp";
        const lbl = document.createElement("div");
        lbl.className = "lbl";
        lbl.textContent = g.title;
        const members = document.createElement("div");
        members.className = "members";
        for (const r of g.rows) {
          const b = document.createElement("button");
          const ic = document.createElement("span");
          if (isSvg(r.glyph)) ic.innerHTML = r.glyph;
          else ic.textContent = r.glyph || "";
          const t = document.createElement("span");
          t.textContent = r.label || (r.title || "").split(/[—–]/)[0].trim();
          b.append(ic, t);
          b.title = r.title;
          b.setAttribute("aria-pressed", String(!!r.armed));
          if (r.fixed) b.setAttribute("aria-disabled", "true");
          else b.addEventListener("click", () => post(Protocol.cmd("badgeControl", r.key)));
          members.append(b);
        }
        grp.append(lbl, members);
        box.append(grp);
      }
    },
    rows([view, rows, empty]) {
      renderRows(view, rows, empty);
    },
    events([toolId, evs, backlog]) {
      tlPush(toolId, evs || [], !!backlog);
    },
    flash([msg, sel]) {
      flash(msg, sel);
    },
    removeMode() {
    }
    // the remove chip lives on the page itself
  };
  var tabId = null;
  var port = null;
  var timer = null;
  var live = false;
  var retryDelay = 900;
  function mode(m) {
    body.dataset.mode = m;
  }
  function status(txt, dot) {
    $("#status").textContent = txt;
    $("#dot").className = "dot" + (dot ? " " + dot : "");
  }
  function post(m) {
    try {
      port?.postMessage(m);
    } catch {
    }
  }
  function retry(ms) {
    clearTimeout(timer);
    timer = setTimeout(connect, ms);
  }
  function drop() {
    try {
      port?.disconnect();
    } catch {
    }
    port = null;
  }
  function connect() {
    clearTimeout(timer);
    if (port) return;
    if (tabId == null) {
      mode("waiting");
      status("no tab", "bad");
      return;
    }
    let p;
    try {
      p = chrome.tabs.connect(tabId, { name: "debug-overlay-side-panel" });
    } catch {
      mode("waiting");
      status("waiting for page…", "bad");
      return retry(900);
    }
    port = p;
    live = false;
    status("connecting…", "");
    p.onMessage.addListener((msg) => {
      const m = Protocol.read(msg);
      if (!m) {
        if (Protocol.stale(msg)) mode("stale");
        return;
      }
      if (m.kind !== "state") return;
      if (!live) {
        live = true;
        retryDelay = 900;
        mode("main");
        status("connected", "ok");
        pageReturned();
      }
      render[m.name]?.(m.args);
    });
    p.onDisconnect.addListener(() => {
      const gone = chrome.runtime.lastError;
      if (port !== p) return;
      port = null;
      const everSpoke = live;
      live = false;
      if (everSpoke) tl().pendingReload = true;
      mode("waiting");
      status("waiting for page…", "bad");
      retryDelay = everSpoke || !gone ? 900 : Math.min(retryDelay * 2, 5e3);
      retry(retryDelay);
    });
    post(Protocol.cmd("hello"));
    if (myView) post(Protocol.cmd("openView", myView));
  }
  async function bind() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab ? tab.id : null;
    } catch {
      tabId = null;
    }
    drop();
    connect();
  }
  chrome.tabs.onActivated.addListener(bind);
  chrome.tabs.onUpdated.addListener((id, info) => {
    if (id === tabId && info.status === "complete") {
      drop();
      connect();
    }
  });
  $("#power").addEventListener("click", () => post(Protocol.cmd("toggle")));
  $("[data-sweep]").addEventListener("click", () => post(Protocol.cmd("sweep")));
  $("[data-copy]").addEventListener("click", () => post(Protocol.cmd("copy")));
  $("[data-clear]").addEventListener("click", () => post(Protocol.cmd("clear")));
  for (const b of document.querySelectorAll("#views [data-view]"))
    b.addEventListener("click", () => setView(b.dataset.view));
  $("#tlClear").addEventListener("click", () => {
    tl().entries = [];
    renderTimeline();
  });
  $("#optBtn").addEventListener("click", () => chrome.runtime.openOptionsPage?.());
  $("#webBtn").addEventListener("click", () => {
    const on = $("#webBtn").getAttribute("aria-pressed") === "true";
    post(Protocol.cmd("webPanel", !on));
  });
  $("[data-upd]").addEventListener("click", () => {
    flash("checking…", "[data-upd]");
    post(Protocol.cmd("updateCheck"));
  });
  $("#updGo").addEventListener("click", () => {
    if (port) post(Protocol.cmd("updateApply"));
    else chrome.runtime.openOptionsPage?.();
    $("#updTxt").textContent = "The updater opened — press Update there, then refresh this page.";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT") return;
    if (myView) setView(myView);
  });
  bind();
})();
