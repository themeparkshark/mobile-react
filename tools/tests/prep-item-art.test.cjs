const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '../..');
const SETS = { churros: 'churro', pretzels: 'pretzel', flashlights: 'flashlight', umbrellas: 'umbrella', cameras: 'camera' };
const dir = set => path.join(root, 'assets/images/prep-items', set);

/** Minimal PNG decode (8-bit, non-interlaced, RGBA or palette+tRNS) -> { w, h, alpha(x, y) }. */
function decode(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, type = 0, depth = 0, interlace = 0, plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    if (kind === 'PLTE') plte = data;
    if (kind === 'tRNS') trns = data;
    if (kind === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  assert.equal(depth, 8, `${file}: 8-bit PNG expected`);
  assert.equal(interlace, 0, `${file}: non-interlaced PNG expected`);
  assert.ok(type === 6 || type === 3, `${file}: RGBA or palette PNG with alpha expected (type ${type})`);
  const bpp = type === 6 ? 4 : 1, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const alpha = (x, y) => type === 6 ? px[(y * w + x) * 4 + 3] : (trns && px[y * w + x] < trns.length ? trns[px[y * w + x]] : 255);
  return { w, h, alpha, plte };
}

/** 32x32 occupancy mask of the art. */
function mask(file) {
  const { w, h, alpha } = decode(file);
  const out = new Uint8Array(32 * 32);
  for (let gy = 0; gy < 32; gy++) for (let gx = 0; gx < 32; gx++) {
    const x = Math.floor((gx + 0.5) * w / 32), y = Math.floor((gy + 0.5) * h / 32);
    out[gy * 32 + gx] = alpha(x, y) > 128 ? 1 : 0;
  }
  return out;
}
const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { i += a[k] & b[k]; u += a[k] | b[k]; } return u ? i / u : 1; };

test('every live prep item has its own bundled 384px art, wired by variant slug', () => {
  const helper = fs.readFileSync(path.join(root, 'src/helpers/prepItemImages.ts'), 'utf8');
  let bytes = 0;
  for (const [set, prefix] of Object.entries(SETS)) {
    for (let n = 1; n <= 40; n++) {
      const slug = `${prefix}_${String(n).padStart(2, '0')}`;
      const file = path.join(dir(set), `${slug}.png`);
      assert.ok(helper.includes(`${slug}: require('../../assets/images/prep-items/${set}/${slug}.png')`), `${slug} wired`);
      const { w, h } = decode(file);
      assert.deepEqual([w, h], [384, 384], `${slug} is 384x384`);
      bytes += fs.statSync(file).size;
    }
  }
  // OTA weight: the 200 items must stay under the old 9.6 MB folder.
  assert.ok(bytes < 9.6 * 1024 * 1024, `prep item art weighs ${(bytes / 1048576).toFixed(1)} MB`);
});

test('prep items are real variations, not palette swaps of one sprite', () => {
  // The old art was one sprite recolored 40 times, so every silhouette matched exactly (IoU 1.0).
  for (const [set, prefix] of Object.entries(SETS)) {
    const masks = Array.from({ length: 40 }, (_, i) => mask(path.join(dir(set), `${prefix}_${String(i + 1).padStart(2, '0')}.png`)));
    for (let i = 0; i < 40; i++) for (let j = i + 1; j < 40; j++) {
      assert.ok(iou(masks[i], masks[j]) < 0.97, `${set} ${i + 1} and ${j + 1} share one silhouette`);
    }
  }
});
