#!/usr/bin/env node
/**
 * Home map chrome budget: the share of the map area that map chrome covers in the resting state.
 *
 * Capture the HomeCatchPreview harness twice on one simulator, the map frozen both times:
 *   EXPO_PUBLIC_HOME_CATCH_PREVIEW=1 EXPO_PUBLIC_HH3_EXP=still       -> full.png (+ Documents/map-chrome.json)
 *   EXPO_PUBLIC_HOME_CATCH_PREVIEW=1 EXPO_PUBLIC_HH3_EXP=still-bare  -> bare.png
 * 'still-bare' sets every chrome view to opacity 0, find markers' chrome included (distance and timer tags,
 * NEW and photo badges, the finger), so those count as chrome. The find art and the shark are the map.
 * The shark is map content; map-chrome.json carries its box and it is skipped (its idle pose drifts).
 * 'still-peek' holds a tapped find's peek. The status HUD and tab bar sit outside map-chrome.json's rect.
 *
 * Usage: node tools/map-chrome-coverage.cjs full.png bare.png map-chrome.json [mask-out.png]
 * Exits 1 over the 10% budget. npm test runs it on the committed captures in tools/tests/fixtures/map-chrome.
 */
const fs = require('node:fs');
const { PNG } = require('pngjs');

const BUDGET = 0.10;

/** Box max (dilate) or min (erode) of a 0/1 grid, separable, radius r. */
function morph(grid, w, h, r, max) {
  if (r < 1) return grid;
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = max ? 0 : 1;
    for (let k = -r; k <= r; k++) { const xx = Math.min(w - 1, Math.max(0, x + k)); v = max ? v | grid[y * w + xx] : v & grid[y * w + xx]; }
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = max ? 0 : 1;
    for (let k = -r; k <= r; k++) { const yy = Math.min(h - 1, Math.max(0, y + k)); v = max ? v | tmp[yy * w + x] : v & tmp[yy * w + x]; }
    out[y * w + x] = v;
  }
  return out;
}

/** { share, mask, box } for two same-size PNG buffers and the map rect in points. */
function chromeCoverage(fullBuf, bareBuf, rect) {
  const a = PNG.sync.read(fullBuf), b = PNG.sync.read(bareBuf);
  if (a.width !== b.width || a.height !== b.height) throw new Error('captures differ in size');
  const k = a.width / (rect.screenW || 402);
  const x0 = Math.round(rect.x * k), y0 = Math.round(rect.y * k);
  const w = Math.min(a.width - x0, Math.round(rect.w * k)), h = Math.min(a.height - y0, Math.round(rect.h * k));
  let grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * a.width + x0 + x) * 4;
    const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
    grid[y * w + x] = d > 18 ? 1 : 0;
  }
  // Close antialiased chrome edges, then drop isolated specks (radii in points, so any capture scale reads the same).
  const close = Math.max(1, Math.round(0.7 * k)), open = Math.max(0, Math.round(0.35 * k));
  grid = morph(morph(grid, w, h, close, true), w, h, close, false);
  grid = morph(morph(grid, w, h, open, false), w, h, open, true);
  // The shark (map content) idles between captures: its box, in map points, is not chrome.
  if (rect.shark) {
    const sx0 = Math.max(0, Math.round(rect.shark.x * k)), sy0 = Math.max(0, Math.round(rect.shark.y * k));
    const sx1 = Math.min(w, Math.round((rect.shark.x + rect.shark.w) * k)), sy1 = Math.min(h, Math.round((rect.shark.y + rect.shark.h) * k));
    for (let y = sy0; y < sy1; y++) grid.fill(0, y * w + sx0, y * w + sx1);
  }
  let on = 0;
  for (const v of grid) on += v;
  return { share: on / (w * h), mask: grid, box: { x0, y0, w, h }, png: a };
}

module.exports = { chromeCoverage, BUDGET };

if (require.main === module) {
  const [full, bare, rectFile, out] = process.argv.slice(2);
  const rect = JSON.parse(fs.readFileSync(rectFile, 'utf8'));
  const { share, mask, box, png } = chromeCoverage(fs.readFileSync(full), fs.readFileSync(bare), rect);
  if (out) {
    for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) if (mask[y * box.w + x]) {
      const i = ((box.y0 + y) * png.width + box.x0 + x) * 4;
      png.data[i] = (png.data[i] + 255) >> 1; png.data[i + 1] = (png.data[i + 1] + 40) >> 1; png.data[i + 2] = (png.data[i + 2] + 90) >> 1;
    }
    fs.writeFileSync(out, PNG.sync.write(png));
  }
  console.log(`map chrome covers ${(share * 100).toFixed(1)}% of the map area (budget ${BUDGET * 100}%)`);
  process.exit(share <= BUDGET ? 0 : 1);
}
