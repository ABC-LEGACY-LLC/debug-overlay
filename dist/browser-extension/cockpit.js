(() => {
  // src/core/protocol.js
  var PROTOCOL_VERSION = 1;
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
    // (version)
    flash: null,
    // (msg, sel)
    badgeControls: (groups) => [groups.map(packBadgeGroup)],
    rows: (view, rows, empty) => [view, rows.map(packRow), empty],
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
    openView: null,
    // (view) — compute and push that view's rows
    rowActivate: null,
    // (view, i)
    rowRemove: null,
    // (view, i)
    rowChange: null,
    // (view, i, raw)
    hello: null
    // a cockpit connected — push everything
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
      dbgov: PROTOCOL_VERSION,
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
      if (!msg || msg.dbgov !== PROTOCOL_VERSION) return null;
      const table = msg.kind === "state" ? STATE : msg.kind === "cmd" ? CMD : null;
      if (!table || !(msg.name in table) || !Array.isArray(msg.args)) return null;
      return { kind: msg.kind, name: msg.name, args: msg.args };
    },
    /** A different-version message of ours — worth telling the user
     *  "refresh this page" instead of silently ignoring. */
    stale: (msg) => !!msg && typeof msg.dbgov === "number" && msg.dbgov !== PROTOCOL_VERSION
  };

  // browser-extension-source/cockpit.js
  var VERSION = "3.8.103";
  var $ = (s) => document.querySelector(s);
  var body = document.body;
  var IC = {
    power: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>',
    sweep: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    copy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
    clear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    pin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
    gear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'
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
    ['[data-view="findings"]', IC.sweep],
    ['[data-view="pins"]', IC.pin],
    ['[data-view="settings"]', IC.gear]
  ])
    putIcon($(sel + " .ic"), ic);
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
      const u = $("#upd");
      u.textContent = `v${v} is available — the overlay updates from its own ⏻ menu on the page, or reinstall from the options page.`;
      u.classList.add("show");
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
      p = chrome.tabs.connect(tabId, { name: "debug-overlay-cockpit" });
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
        mode("main");
        status("connected", "ok");
      }
      render[m.name]?.(m.args);
    });
    p.onDisconnect.addListener(() => {
      if (port !== p) return;
      port = null;
      live = false;
      mode("waiting");
      status("waiting for page…", "bad");
      retry(900);
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
  bind();
})();
