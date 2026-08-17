#!/usr/bin/env node
/**
 * dev/serve.js — the local loop, so a change can be looked at before it is
 * ever pushed to Tampermonkey.
 *
 *   node dev/serve.js        serve dev/index.html and rebuild on every save
 *   PORT=3000 node dev/serve.js
 *
 * Tampermonkey is production: it only ever sees what has been built, version
 * bumped, committed and pushed. This serves dist/ straight off the disk
 * instead, so the round trip is a file save.
 *
 * The page loads the built bundle with a plain <script> tag. The script does
 * ask for GM_getValue / GM_setValue, but never assumes them: Store in
 * core/state.js falls back to localStorage when they are undefined, which is
 * exactly the case here. So a normal page still hosts the bundle unchanged —
 * with settings kept per origin instead of per script, which for one dev page
 * is the same thing.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const BUNDLE = path.join(ROOT, 'dist', 'debug-overlay.user.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // the page polls this to notice a rebuild and reload itself
  if (url.pathname === '/__rev') {
    let rev = 0;
    try { rev = fs.statSync(BUNDLE).mtimeMs; } catch {}
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ rev }));
  }

  const rel = url.pathname === '/' ? 'dev/index.html' : url.pathname.slice(1);
  const file = path.join(ROOT, rel);
  // stay inside the repo — a dev server still should not hand out /etc/passwd
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end(`not found: ${rel}\n`);
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',   // never debug a stale bundle
    });
    res.end(buf);
  });
});

// --watch does not bump the version: the dev loop must not burn version
// numbers that Tampermonkey would then skip past.
const watcher = cp.spawn(process.execPath, [path.join(ROOT, 'build.js'), '--watch'], {
  cwd: ROOT, stdio: 'inherit',
});
const bye = () => { watcher.kill(); process.exit(0); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);

server.listen(PORT, () => {
  console.log(`\n  dev page → http://localhost:${PORT}`);
  console.log('  editing src/ rebuilds and reloads the page');
  console.log('  open it in a real browser tab, not an embedded preview\n');
});
