#!/usr/bin/env node
/**
 * make-icons.js — the extension's icons, generated, not sourced.
 *
 *     node browser-extension-source/make-icons.js
 *
 * Writes icon16/32/48/128.png beside this file: the options page's own logo
 * — the lucide 'bug' (ISC) in brand lime on the dark rounded tile — as real
 * PNGs, because a manifest icon must be one and this repo ships no binary
 * an eye has not seen built. Everything here is stdlib: the path data is
 * flattened to polylines, stroked by distance field at 4× supersampling,
 * and encoded with node's zlib. Re-run only when the logo changes; the
 * PNGs are committed so the build never depends on this script.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* lucide 'bug' (ISC) — the exact paths options.html draws */
const PATHS = [
  'm8 2 1.88 1.88',
  'M14.12 3.88 16 2',
  'M9 7.13v-1a3.003 3.003 0 1 1 6 0v1',
  'M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6',
  'M12 20v-9',
  'M6.53 9C4.6 8.8 3 7.1 3 5',
  'M6 13H2',
  'M3 21c0-2.1 1.7-3.9 3.8-4',
  'M20.97 5c0 2.1-1.6 3.8-3.5 4',
  'M22 13h-4',
  'M17.2 17c2.1.1 3.8 1.9 3.8 4',
];
const LIME = [181, 232, 83];     // #b5e853
const TILE = [38, 38, 44];       // #26262c

/* ---- svg path → polylines (M m L l H h V v C c S A a supported) ------ */
function flatten(d) {
  const toks = d.match(/[A-Za-z]|-?\.?\d+(?:\.\d+)?(?:e-?\d+)?/g) || [];
  let i = 0, cmd = '';
  const num = () => parseFloat(toks[i++]);
  let x = 0, y = 0, sx = 0, sy = 0, cx = null, cy = null;
  const lines = [];
  let cur = null;
  const start = () => { cur = [[x, y]]; lines.push(cur); };
  const pt = () => cur.push([x, y]);
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    const x0 = x, y0 = y;
    for (let t = 1; t <= 16; t++) {
      const u = t / 16, v = 1 - u;
      x = v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3;
      y = v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3;
      pt();
    }
    cx = x2; cy = y2;
  };
  const arc = (rx, ry, phi, fa, fs, x2, y2) => {
    // endpoint → centre parametrisation, per the SVG spec's appendix
    const x1 = x, y1 = y;
    const rad = (phi * Math.PI) / 180, co = Math.cos(rad), si = Math.sin(rad);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = co * dx + si * dy, y1p = -si * dx + co * dy;
    let rx2 = rx * rx, ry2 = ry * ry;
    const lam = (x1p * x1p) / rx2 + (y1p * y1p) / ry2;
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; rx2 = rx * rx; ry2 = ry * ry; }
    let n = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
    if (n < 0) n = 0;
    let k = Math.sqrt(n / (rx2 * y1p * y1p + ry2 * x1p * x1p));
    if (fa === fs) k = -k;
    const cxp = (k * rx * y1p) / ry, cyp = (-k * ry * x1p) / rx;
    const ccx = co * cxp - si * cyp + (x1 + x2) / 2;
    const ccy = si * cxp + co * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => {
      let a = Math.atan2(uy, ux), b = Math.atan2(vy, vx), d = b - a;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return d;
    };
    const th1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
    let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dth > 0) dth -= 2 * Math.PI;
    if (fs && dth < 0) dth += 2 * Math.PI;
    for (let t = 1; t <= 24; t++) {
      const th = th1 + (dth * t) / 24;
      const ex = rx * Math.cos(th), ey = ry * Math.sin(th);
      x = co * ex - si * ey + ccx;
      y = si * ex + co * ey + ccy;
      pt();
    }
    cx = null; cy = null;
  };
  while (i < toks.length) {
    const t = toks[i];
    if (/[A-Za-z]/.test(t)) { cmd = t; i++; }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        const nx = num(), ny = num();
        x = rel ? x + nx : nx; y = rel ? y + ny : ny;
        sx = x; sy = y; start();
        cmd = rel ? 'l' : 'L';   // subsequent pairs are implicit lineto
        break;
      }
      case 'L': { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; pt(); break; }
      case 'H': { const nx = num(); x = rel ? x + nx : nx; pt(); break; }
      case 'V': { const ny = num(); y = rel ? y + ny : ny; pt(); break; }
      case 'C': {
        const a1 = num(), b1 = num(), a2 = num(), b2 = num(), a3 = num(), b3 = num();
        cubic(rel ? x + a1 : a1, rel ? y + b1 : b1, rel ? x + a2 : a2, rel ? y + b2 : b2,
              rel ? x + a3 : a3, rel ? y + b3 : b3);
        break;
      }
      case 'S': {
        const a2 = num(), b2 = num(), a3 = num(), b3 = num();
        const r1x = cx == null ? x : 2 * x - cx, r1y = cy == null ? y : 2 * y - cy;
        cubic(r1x, r1y, rel ? x + a2 : a2, rel ? y + b2 : b2, rel ? x + a3 : a3, rel ? y + b3 : b3);
        break;
      }
      case 'A': {
        const rx = num(), ry = num(), ph = num(), fa = num(), fs = num(), nx = num(), ny = num();
        arc(rx, ry, ph, fa, fs, rel ? x + nx : nx, rel ? y + ny : ny);
        break;
      }
      case 'Z': x = sx; y = sy; pt(); break;
      default: i++;   // never with this data; skip rather than loop
    }
  }
  return lines;
}

const SEGS = [];
for (const d of PATHS) {
  for (const line of flatten(d)) {
    for (let j = 1; j < line.length; j++) SEGS.push([line[j - 1], line[j]]);
  }
}

/* ---- raster: rounded tile + distance-field stroke -------------------- */
function distSeg(px, py, [[ax, ay], [bx, by]]) {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const L2 = vx * vx + vy * vy;
  const t = L2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2)) : 0;
  const dx = wx - t * vx, dy = wy - t * vy;
  return Math.sqrt(dx * dx + dy * dy);
}

function renderIcon(size) {
  const SS = 4, N = size * SS;
  const radius = N * 0.21;
  const glyph = N * 0.66;                   // the 24-box scaled into the tile
  const off = (N - glyph) / 2;
  const k = glyph / 24;
  // small sizes need proportionally more ink or the legs vanish
  const strokeR = ((size <= 16 ? 2.8 : size <= 32 ? 2.4 : 2) / 2) * k;
  const segs = SEGS.map(([[ax, ay], [bx, by]]) =>
    [[ax * k + off, ay * k + off], [bx * k + off, by * k + off]]);
  const big = new Float64Array(N * N * 4);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const X = px + 0.5, Y = py + 0.5;
      // rounded-rect coverage
      const qx = Math.abs(X - N / 2) - (N / 2 - radius);
      const qy = Math.abs(Y - N / 2) - (N / 2 - radius);
      const dOut = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) +
                   Math.min(Math.max(qx, qy), 0) - radius;
      const tile = Math.max(0, Math.min(1, 0.5 - dOut));
      if (tile <= 0) continue;
      let d = 1e9;
      for (const s of segs) {
        const dd = distSeg(X, Y, s);
        if (dd < d) d = dd;
      }
      const ink = Math.max(0, Math.min(1, strokeR + 0.5 - d));
      const o = (py * N + px) * 4;
      big[o] = TILE[0] + (LIME[0] - TILE[0]) * ink;
      big[o + 1] = TILE[1] + (LIME[1] - TILE[1]) * ink;
      big[o + 2] = TILE[2] + (LIME[2] - TILE[2]) * ink;
      big[o + 3] = 255 * tile;
    }
  }
  // box-downsample SS×SS
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((py * SS + sy) * N + (px * SS + sx)) * 4;
          r += big[o]; g += big[o + 1]; b += big[o + 2]; a += big[o + 3];
        }
      }
      const n = SS * SS, o = (py * size + px) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/* ---- PNG encoding (8-bit RGBA, filter 0, one IDAT) ------------------- */
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const head = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(head));
  return Buffer.concat([len, head, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;   // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;      // 8-bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- write, then PROVE by decoding what was written ------------------ */
for (const size of [16, 32, 48, 128]) {
  const file = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(file, png(size, renderIcon(size)));
  // decode back: signature, dims, and two pixels an eye would check —
  // the bug's centre line is lime, the tile corner is transparent
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`bad signature: icon${size}`);
  if (b.readUInt32BE(16) !== size) throw new Error(`bad width: icon${size}`);
  const idat = b.subarray(41, b.length - 12);   // one IDAT, fixed layout above
  const raw = zlib.inflateSync(idat);
  const px = (x, y) => raw.subarray(y * (size * 4 + 1) + 1 + x * 4,
                                    y * (size * 4 + 1) + 1 + x * 4 + 4);
  const c = px(size >> 1, size >> 1);
  if (!(c[1] > 150 && c[3] > 200)) throw new Error(`centre not lime: icon${size} = ${[...c]}`);
  const corner = px(0, 0);
  if (corner[3] > 60) throw new Error(`corner not transparent: icon${size}`);
  console.log(`✓ icon${size}.png  ${b.length} bytes, centre rgba(${[...c].join(',')})`);
}
