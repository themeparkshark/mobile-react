'use strict';
/**
 * The rest frame of every kit item, as draw calls for the compositor (next-wave/secret-shop/more/art/
 * tools/compose_kit.py): each sprite with its 2x3 affine matrix in canvas pixels and its opacity, in
 * draw order, for the Reduce Motion pose (the moment frozen at stillP), using the app's own kit math.
 * Paper items draw on the 1353 x 1530 paper canvas; scenes on a 1000 x 1000 square.
 * usage: node tools/fx/kit-poses.cjs [out.json]
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');
const kit = loadTs('src/fx/kit.ts');
const root = path.resolve(__dirname, '../..');
const PW = 1353;
const PH = 1530;

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const tr = (x, y) => [1, 0, 0, 1, x, y];
const rot = d => { const r = d * Math.PI / 180; return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]; };
const sc = (x, y) => [x, 0, 0, y, 0, 0];
/** React Native: origin + translate + rotate * scale * (p - origin). */
function rn(ox, oy, pose, baseRot, flip, bw, bh) {
  let m = tr(ox + pose.x * bw, oy + pose.y * bh);
  m = mul(m, rot(baseRot + pose.rot));
  m = mul(m, sc(pose.s * (flip ? -1 : 1) * pose.sx, pose.s * pose.sy));
  return mul(m, tr(-ox, -oy));
}

const out = {};
for (const [key, item] of Object.entries(kit.KIT)) {
  const scene = item.slot === 'background_item';
  const W = scene ? 1000 : PW;
  const H = scene ? 1000 : PH;
  const s = kit.sampleAt(item, 0, -1e9, true);
  const calls = [];
  const groups = Object.fromEntries((item.groups || []).map(g => {
    const pose = kit.posedAt(g.loops, g.keys, g.calm ?? 1, s.t, s.p);
    const sq = g.squash || [1, 1];
    return [g.id, rn(g.pivot[0] * W, g.pivot[1] * H, { ...pose, sx: pose.sx * sq[0], sy: pose.sy * sq[1] }, 0, false, W, H)];
  }));
  for (const layer of scene ? ['scene', 'scenefront'] : ['back', 'front']) {
    for (const p of item.parts.filter(q => q.layer === layer)) {
      const pose = kit.posedAt(p.loops, p.keys, p.calm ?? 1, s.t, s.p, p.momentOnly ? 0 : 1);
      const side = (p.depth === 'near' && pose.depth <= 0) || (p.depth === 'far' && pose.depth > 0);
      const o = (p.momentOnly && s.p < 0) || side ? 0 : (p.o ?? 1) * pose.o;
      if (o <= 0.01) continue;
      const w = p.w * W; const h = w * p.aspect;
      const ax = p.ax ?? 0.5; const ay = p.ay ?? 0.5;
      const left = p.cx * W - ax * w; const top = p.cy * H - ay * h;
      let m = rn(left + ax * w, top + ay * h, pose, p.rot ?? 0, !!p.flip, W, H);
      m = mul(m, tr(left, top));
      m = mul(m, sc(w, h));
      if (p.group) m = mul(groups[p.group], m);
      calls.push({ src: p.src, m, o, tint: p.tint ?? null, layer });
    }
    for (const e of (item.emitters || []).filter(q => q.layer === layer)) {
      for (let i = 0; i < e.n; i++) {
        const q = kit.particleAt(item, e, i, s.t, s.p, H / W);
        if (q.o <= 0.01) continue;
        const size = q.s * W;
        let m = tr(q.x * W, q.y * H);
        m = mul(m, rot(q.rot));
        m = mul(m, sc(size, size));
        m = mul(m, tr(-0.5, -0.5));
        calls.push({ src: e.src, m, o: q.o, tint: e.tint ?? null, layer, particle: true });
      }
    }
  }
  out[key] = { scene, canvas: [W, H], calls };
}
const file = process.argv[2] || path.join(root, 'tools/tests/.out/kit-poses.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out));
console.log(file, Object.keys(out).length, 'items');
