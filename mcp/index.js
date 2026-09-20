#!/usr/bin/env node
'use strict';
/* ======================================================================
  debug-overlay MCP — one session, one token, one browser.

     An MCP server Claude Code (or any MCP client) starts over stdio. It
     listens on ONE local port for ONE browser: the Debug Overlay extension
     dials in from the side panel with the token printed at startup, and
     from then on every tool call here is a command to that browser's
     current tab, answered by the overlay's own door (src/app/remote.js)
     with the same data the panel shows a person.

     WHY THE BROWSER DIALS IN. Claude Code may be running on a server the
     browser's machine can reach but which cannot reach the browser back —
     the ordinary SSH / VSCode-remote arrangement. A connection that starts
     at the browser needs no route in that direction; the port is forwarded
     to the person's machine by VSCode automatically when the server is only
     reachable over SSH, and the extension connects to localhost.

     WHY ONE OF EACH. A relay with a routing table is a place for one
     session to reach another's browser. This process holds one token and
     accepts one browser; a second Claude Code session runs a second
     process on a second port. Nothing is shared, so nothing can leak.

     ZERO DEPENDENCIES, so `node mcp/` works from a bare clone: the
     WebSocket server is the RFC 6455 handshake and frame codec written out
     below (~80 lines), and the MCP side is the JSON-RPC subset the protocol
     actually uses. Node 22 or newer.

     THE PORT BINDS TO 127.0.0.1 ONLY. Nothing on the network reaches it; a
     tunnel or a port forward is the only way in, which is the point.
   ====================================================================== */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.DEBUG_OVERLAY_PORT || 8787);
const TOKEN = String(process.env.DEBUG_OVERLAY_TOKEN || '').trim() ||
              crypto.randomBytes(4).toString('hex');
let VERSION = '0';
try { VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'release.json'), 'utf8')).version; } catch {}

// stdout is the MCP channel; every human-facing line goes to stderr
const log = (s) => process.stderr.write(`debug-overlay mcp: ${s}\n`);

/* ---- the WebSocket server: handshake and frames, RFC 6455 -------------- */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** One frame off the front of a buffer, or null if it is not all there yet. */
function frame(b) {
  if (b.length < 2) return null;
  const fin = !!(b[0] & 0x80), op = b[0] & 0x0f, masked = !!(b[1] & 0x80);
  let len = b[1] & 0x7f, off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  const need = off + (masked ? 4 : 0) + len;
  if (b.length < need) return null;
  let data;
  if (masked) {
    const k = b.subarray(off, off + 4);
    data = Buffer.alloc(len);
    for (let i = 0; i < len; i++) data[i] = b[off + 4 + i] ^ k[i & 3];
  } else data = b.subarray(off, off + len);
  return { fin, op, data, size: need };
}

/** A text frame, server → client (unmasked, as the RFC requires of servers). */
function textFrame(text) {
  const p = Buffer.from(text, 'utf8');
  let h;
  if (p.length < 126) h = Buffer.from([0x81, p.length]);
  else if (p.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(p.length, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(p.length), 2); }
  return Buffer.concat([h, p]);
}

/** Wrap an upgraded socket: `send(text)`, `close()`, `onText`, `onClose`. */
function wsWrap(socket) {
  let buf = Buffer.alloc(0);
  const c = { closed: false, onText: null, onClose: null };
  c.send = (text) => { if (!c.closed) { try { socket.write(textFrame(text)); } catch {} } };
  c.close = () => {
    if (c.closed) return;
    c.closed = true;
    try { socket.write(Buffer.from([0x88, 0x00])); } catch {}
    socket.end();
  };
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const f = frame(buf);
      if (!f) break;
      buf = buf.subarray(f.size);
      if (!f.fin || f.op === 0) { c.close(); break; }          // fragmentation: not needed, not accepted
      if (f.op === 8) { c.close(); break; }                     // close
      if (f.op === 9) { try { socket.write(Buffer.concat([Buffer.from([0x8a, f.data.length]), f.data])); } catch {} continue; }  // ping → pong
      if (f.op === 1 && c.onText) c.onText(f.data.toString('utf8'));
    }
  });
  socket.on('close', () => { c.closed = true; if (c.onClose) c.onClose(); });
  socket.on('error', () => {});
  return c;
}

/* ---- the session: one browser, one token ------------------------------ */
let browser = null;          // { conn, tab, version, since }
const pending = new Map();   // call id → { resolve, timer }
let seq = 0;

const server = http.createServer((req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('debug-overlay mcp: WebSocket only — connect from the Debug Overlay side panel\n');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
               `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const conn = wsWrap(socket);
  let greeted = false;
  conn.onText = (text) => {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!greeted) {
      /* THE TOKEN IS THE WHOLE GATE. Wrong, missing, or a second browser
         while one is connected: refused, told why, and closed. Timing-safe
         compare, because a token is a secret however short. */
      const given = Buffer.from(String(m.token || ''));
      const want = Buffer.from(TOKEN);
      const okToken = given.length === want.length && crypto.timingSafeEqual(given, want);
      if (m.t !== 'hello' || !okToken) {
        conn.send(JSON.stringify({ t: 'refused', why: m.t !== 'hello' ? 'say hello first' : 'wrong token' }));
        conn.close();
        return;
      }
      if (browser && !browser.conn.closed) {
        conn.send(JSON.stringify({ t: 'refused', why: 'this session already has a browser' }));
        conn.close();
        return;
      }
      greeted = true;
      browser = { conn, tab: m.tab ?? null, version: m.version || '?', since: Date.now() };
      conn.send(JSON.stringify({ t: 'welcome', version: VERSION }));
      log(`browser connected — overlay v${browser.version}, tab ${browser.tab}`);
      return;
    }
    if (m.t === 'pong') return;
    if (m.t === 'result') {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      clearTimeout(p.timer);
      p.resolve(m);
    }
  };
  conn.onClose = () => {
    if (!browser || browser.conn !== conn) return;
    browser = null;
    log('browser disconnected');
    for (const [, p] of pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'the browser disconnected' }); }
    pending.clear();
  };
});

// keeps the extension's worker alive (traffic resets its idle clock) and
// notices a dead peer within a minute
setInterval(() => { if (browser) browser.conn.send(JSON.stringify({ t: 'ping' })); }, 20000).unref();

const NOT_CONNECTED = () =>
  `no browser is connected to this session. In Chrome, open the Debug Overlay side panel on ` +
  `the page, and under "AI session" enter ws://localhost:${PORT} and the token ${TOKEN}, then Connect.`;

/** One command to the browser's tab, answered by the overlay's door. */
function call(cmd, args, timeout = 30000) {
  if (!browser) return Promise.resolve({ ok: false, error: NOT_CONNECTED() });
  return new Promise((resolve) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: `no answer from the page within ${timeout / 1000}s` });
    }, timeout);
    pending.set(id, { resolve, timer });
    browser.conn.send(JSON.stringify({ t: 'call', id, cmd, args }));
  });
}

/* ---- the tools, as an MCP client sees them ---------------------------- */
const num = { type: 'number' };
const str = { type: 'string' };
const obj = (properties, required = []) => ({ type: 'object', properties, required });

const TOOLS = [
  { name: 'session',
    description: 'Whether a browser is connected to this session. If none is, the result carries the ' +
      'address and token the person must enter in the Debug Overlay side panel (under "AI session") — ' +
      'tell them exactly that. Call this when another tool says no browser is connected.',
    inputSchema: obj({}),
    run: () => ({ ok: true, result: { port: PORT, address: `ws://localhost:${PORT}`, token: TOKEN,
      connected: !!browser, tab: browser ? browser.tab : null, overlay: browser ? browser.version : null } }) },
  { name: 'state',
    description: 'The overlay on the connected tab, as data: url, whether it is on, every tool with its id, ' +
      'title, roles and armed state, every setting with its owner, key, current value and allowed values, ' +
      'the pin count. Call this FIRST — the ids here are what arm and set take, and they are not fixed.',
    inputSchema: obj({}), run: () => call('state') },
  { name: 'power', description: 'Switch the overlay on or off on the connected tab.',
    inputSchema: obj({ on: { type: 'boolean' } }, ['on']), run: (a) => call('power', [a.on]) },
  { name: 'arm',
    description: 'Arm or disarm a tool by id (ids come from state). Armed tools decide what a click, drag ' +
      'or pointer move does: with the lasso armed a drag pins everything in the box; with paint armed, ' +
      'point() probes a pixel and the report carries its paint stack. Omit `on` to toggle.',
    inputSchema: obj({ id: str, on: { type: 'boolean' } }, ['id']), run: (a) => call('arm', [a.id, a.on]) },
  { name: 'set',
    description: 'Change one setting: owner id, key and value exactly as state lists them. A value outside ' +
      'the allowed list is refused with the list. Changing a detect setting discards the last audit.',
    inputSchema: obj({ owner: str, key: str, value: {} }, ['owner', 'key', 'value']),
    run: (a) => call('set', [a.owner, a.key, a.value]) },
  { name: 'pin',
    description: 'Pin the first element matching a CSS selector. Asks the DOM rather than the hit test, so ' +
      'it reaches elements a click cannot (pointer-events: none, outside a painted shape). Returns the ' +
      'pin number, selector and viewport rect.',
    inputSchema: obj({ selector: str }, ['selector']), run: (a) => call('pin', [a.selector]) },
  { name: 'unpin', description: 'Remove one pin, by its number or by a selector.',
    inputSchema: obj({ which: { oneOf: [num, str] } }, ['which']), run: (a) => call('unpin', [a.which]) },
  { name: 'pins', description: 'Every pin on the page: number, kind, selector, label and viewport rect.',
    inputSchema: obj({}), run: () => call('pins') },
  { name: 'click',
    description: 'Click the page at viewport (x, y) as a hand would. What happens depends on what is armed: ' +
      'a plain click selects or pins, shift pairs two pins for measuring, ctrl+shift chains to the previous ' +
      'pin. Coordinates are CSS pixels from the top-left of the viewport (see state.viewport).',
    inputSchema: obj({ x: num, y: num, shift: { type: 'boolean' }, ctrl: { type: 'boolean' },
                       meta: { type: 'boolean' } }, ['x', 'y']),
    run: (a) => call('click', [a.x, a.y, { shift: a.shift, ctrl: a.ctrl, meta: a.meta }]) },
  { name: 'drag',
    description: 'Press at (x1, y1), drag to (x2, y2), release — as a hand would. With the lasso armed this ' +
      'pins everything the box takes; set its reach to "touched" to take elements bigger than the box by ' +
      'dragging inside them, and keep to "deepest" to drop the wrappers.',
    inputSchema: obj({ x1: num, y1: num, x2: num, y2: num }, ['x1', 'y1', 'x2', 'y2']),
    run: (a) => call('drag', [a.x1, a.y1, a.x2, a.y2]) },
  { name: 'point',
    description: 'Move the pointer to viewport (x, y) without pressing. The hover badge follows; with paint ' +
      'armed, the next report carries the paint stack at that pixel — which element painted it, what the ' +
      'hit test skipped, and the real screen pixel beside the computed one if sampling is allowed.',
    inputSchema: obj({ x: num, y: num }, ['x', 'y']), run: (a) => call('point', [a.x, a.y]) },
  { name: 'audit',
    description: 'Run every rule over the whole page (the ⌕ button) and wait for it. Returns the grouped ' +
      'findings with selectors and rects; the full text is in report. May take seconds on a large page.',
    inputSchema: obj({}), run: () => call('audit', [], 180000) },
  { name: 'findings', description: 'The last audit\'s grouped findings, without running it again.',
    inputSchema: obj({}), run: () => call('findings') },
  { name: 'report',
    description: 'The structured text report — exactly what the ⧉ Copy report button puts on the clipboard: ' +
      'every pin with its measured numbers, the paint stack if a pixel was probed, findings, and what was ' +
      'NOT checked. This is the deliverable; read it rather than inferring from state.',
    inputSchema: obj({}), run: () => call('report', [], 60000) },
  { name: 'clear', description: 'Clear every pin and the last audit\'s marks.',
    inputSchema: obj({}), run: () => call('clear') },
];

/* ---- MCP over stdio: newline-delimited JSON-RPC 2.0 ------------------- */
function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
function fail(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'); }

async function onLine(line) {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (!m || typeof m !== 'object' || m.id === undefined || m.id === null) return;   // a notification
  switch (m.method) {
    case 'initialize':
      reply(m.id, { protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'debug-overlay', version: VERSION } });
      break;
    case 'ping': reply(m.id, {}); break;
    case 'tools/list':
      reply(m.id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      break;
    case 'tools/call': {
      const name = m.params && m.params.name;
      const t = TOOLS.find((x) => x.name === name);
      if (!t) { fail(m.id, -32602, `unknown tool: ${name}`); break; }
      let r;
      try { r = await t.run((m.params && m.params.arguments) || {}); }
      catch (e) { r = { ok: false, error: String((e && e.message) || e) }; }
      const bad = !r || r.ok === false;
      const v = bad ? (r && r.error) || 'no answer' : r.result;
      const text = typeof v === 'string' ? v : JSON.stringify(v ?? null, null, 2);
      reply(m.id, { content: [{ type: 'text', text }], isError: bad });
      break;
    }
    default: fail(m.id, -32601, `method not found: ${m.method}`);
  }
}

let inbuf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inbuf += chunk;
  let i;
  while ((i = inbuf.indexOf('\n')) >= 0) {
    const line = inbuf.slice(0, i).trim();
    inbuf = inbuf.slice(i + 1);
    if (line) onLine(line);
  }
});
// the client hanging up is the session ending
process.stdin.on('end', () => { try { server.close(); } catch {} process.exit(0); });

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    log(`port ${PORT} is already in use — another session? start this one with DEBUG_OVERLAY_PORT=<free port>`);
  } else log(`cannot listen: ${(e && e.message) || e}`);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => {
  log(`listening on ws://localhost:${PORT}  token ${TOKEN}`);
  log(`in Chrome: Debug Overlay side panel → AI session → enter that address and token → Connect`);
});
