#!/usr/bin/env node
'use strict';
/**
 * Outline pixel check for the Share Studio probes (EXPO_PUBLIC_SHARE_STUDIO_RENDER=probe).
 * usage: outline-pixel-check.cjs <metro log> [out dir]
 *
 * Each probe is white fill + magenta outline on flat navy. A correct render
 * wraps every white pixel in magenta; a ghost or mis-sized copy leaves white
 * touching navy ("naked" edge) or magenta far outside the glyph. Fails if
 * naked white > 1%, the outline's box strays more than 3 outline widths, or
 * the glyph overflows its box into the probe padding.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const [log, outDir] = process.argv.slice(2);
const lines = fs.readFileSync(log, 'utf8').split('\n').filter(line => line.includes('SHARE_PROBE '));
const latest = new Map();
for (const line of lines) {
  const [, name, file] = line.trim().split(/\s+/).slice(-3);
  latest.set(name, file);
}
let failed = 0;
for (const [name, file] of latest) {
  const png = PNG.sync.read(fs.readFileSync(file));
  if (outDir) fs.copyFileSync(file, path.join(outDir, `probe-${name.replace(/%/g, '')}.png`));
  const { width, height, data } = png;
  const at = (x, y) => (y * width + x) * 4;
  const kind = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 'bg';
    const i = at(x, y); const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 215 && g > 215 && b > 215) return 'white';
    if (r > 170 && b > 170 && g < 110) return 'magenta';
    if (r < 60 && g < 60 && b > 90) return 'bg';
    return 'edge'; // antialiasing
  };
  let white = 0; let naked = 0;
  const box = { white: [width, height, 0, 0], magenta: [width, height, 0, 0] };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const k = kind(x, y);
    if (k === 'white' || k === 'magenta') {
      const b = box[k]; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    }
    if (k !== 'white') continue;
    white++;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) {
      if (kind(x + dx, y + dy) === 'bg') { naked++; break; }
    }
  }
  const nakedPct = white ? (100 * naked) / white : 100;
  const stray = Math.max(box.white[0] - box.magenta[0], box.white[1] - box.magenta[1], box.magenta[2] - box.white[2], box.magenta[3] - box.white[3]);
  const outlinePx = Math.max(4.5, 36 * 0.07 * 3);
  // The glyph must not run into the probe's 12 pt padding (a fit that failed would overflow its box).
  const clipped = box.magenta[0] < 18 || box.magenta[2] > width - 18;
  const ok = white > 50 && nakedPct <= 1 && stray <= outlinePx * 3 && !clipped;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${decodeURIComponent(name)}  white=${white} naked=${nakedPct.toFixed(2)}% stray=${stray}px (max ${Math.round(outlinePx * 3)})${clipped ? ' CLIPPED' : ''}`);
}
console.log(failed ? `${failed} probe(s) failed` : `all ${latest.size} probes pass`);
process.exit(failed ? 1 : 0);
