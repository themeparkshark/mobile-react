'use strict';
/**
 * Secret Shop wave 2 (next-wave/secret-shop/DESIGN-WAVE2.md): 30 more animated pieces, most of
 * them kit items (data in src/fx/kit.json, drawn by rigs/Kit.tsx). These tests hold every kit
 * piece to the launch set's rules: its art ships and lines up, it stays in budget, and its motion
 * is calm (Dustin, October 5: "gentle hovering, never bouncy or jolty").
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');
const kitJson = JSON.parse(src('src/fx/kit.json'));
const fx = loadTs('src/fx/registry.ts');
const kit = loadTs('src/fx/kit.ts');
const ITEMS = kitJson.items;

function webpSize(file) {
  const b = fs.readFileSync(path.join(root, 'assets/fx', file));
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}

test('every wave 2 key is a kit item or a jetpack variant, with a slot, a blurb, a moment and a tile focus', () => {
  const wave2 = plain(fx.WAVE2_KEYS);
  const variants = plain(fx.JETPACK_VARIANTS);
  assert.deepEqual(Object.keys(ITEMS).sort(), wave2.filter(k => !variants.includes(k)).sort());
  for (const key of wave2) {
    assert.ok(fx.FX_SLOT[key], `${key} slot`);
    assert.ok(fx.FX_BLURB[key] && fx.FX_BLURB[key].length <= 90, `${key} blurb (one breath)`);
    assert.ok(fx.FX_MOMENT[key].ms > 400 && fx.FX_MOMENT[key].ms < 4200, `${key} moment length`);
    assert.ok(fx.FX_FOCUS[key], `${key} focus`);
    assert.ok(fx.FX_SIDES[key].length > 0, `${key} sides`);
  }
  for (const [key, item] of Object.entries(ITEMS)) {
    assert.ok(item.stillP >= -1 && item.stillP < 1, `${key} still pose`);
    assert.equal(fx.FX_SCENES.includes(key), item.slot === 'background_item', `${key} scene table`);
    // One cue name per piece, never another piece's (its sound is picked alone).
    assert.equal(Object.values(ITEMS).filter(o => o.moment.cue === item.moment.cue).length, 1, `${key} cue`);
  }
});

test('kit art ships as WebP, every sprite exists, and part aspects match the art', () => {
  for (const [key, item] of Object.entries(ITEMS)) {
    for (const p of [...item.parts, ...(item.emitters || [])]) {
      assert.ok(p.src.endsWith('.webp') && fs.existsSync(path.join(root, 'assets/fx', p.src)), `${key}: ${p.src}`);
    }
    for (const p of item.parts) {
      const { w, h } = webpSize(p.src);
      assert.ok(Math.abs(h / w - p.aspect) < 0.015, `${key}.${p.id}: ${(h / w).toFixed(4)} vs ${p.aspect}`);
    }
  }
  // kitArt.ts is generated from kit.json (node tools/fx/kit-art.cjs): it lists exactly the sprites in use.
  const art = src('src/fx/rigs/kitArt.ts');
  const used = new Set(Object.values(ITEMS).flatMap(i => [...i.parts, ...(i.emitters || [])].map(p => p.src)));
  const listed = [...art.matchAll(/'([^']+\.webp)': require\('\.\.\/\.\.\/\.\.\/assets\/fx\/\1'\)/g)].map(m => m[1]);
  assert.deepEqual(listed.sort(), [...used].sort());
});

/** Animated views a kit item builds at an LOD (static parts draw as plain images). */
function views(item, lod) {
  const drawn = need => lod === 'full' || (need ?? 'lite') === 'lite';
  const moving = p => !!((p.loops && p.loops.length) || (p.keys && p.keys.length) || p.momentOnly);
  const parts = item.parts.filter(p => drawn(p.lod) && moving(p)).length;
  const groups = new Set(item.parts.filter(p => p.group && drawn(p.lod)).map(p => p.group)).size;
  const particles = (item.emitters || []).filter(e => lod === 'full' || e.lod === 'lite').reduce((n, e) => n + e.n, 0);
  return parts + groups + particles;
}

test('budget: at most 24 animated views per piece on a stage, 6 on a shop tile', () => {
  for (const [key, item] of Object.entries(ITEMS)) {
    assert.ok(views(item, 'full') <= 24, `${key}: ${views(item, 'full')} at full`);
    assert.ok(views(item, 'lite') <= 6, `${key}: ${views(item, 'lite')} at lite`);
  }
  // Wave 2 art: about 40 KB a piece on average (DESIGN-WAVE2.md 6). Shared sprites count once.
  const files = new Set(Object.values(ITEMS).flatMap(i => [...i.parts, ...(i.emitters || [])].map(p => p.src)));
  for (const f of ['glow.webp', 'spark.webp']) files.delete(f);
  const bytes = [...files].reduce((n, f) => n + fs.statSync(path.join(root, 'assets/fx', f)).size, 0);
  const pieces = plain(fx.WAVE2_KEYS).length;
  assert.ok(bytes / pieces < 48 * 1024, `kit art averages ${Math.round(bytes / pieces / 1024)} KB a piece`);
});

/**
 * Samples a pose function over 40 s at 60 fps on a 460 pt card and returns the worst speed and
 * the worst change of speed between two frames, in points. Translation in points, rotation as the
 * arc a point 0.1 card away from the pivot travels, scale as the edge of a 0.1-card part.
 */
function motion(sample, card = 460, wantMax) {
  const dt = 1000 / 60;
  let prev = null;
  let prevV = null;
  let maxV = 0;
  let maxDV = 0;
  for (let t = 0; t <= 40000; t += dt) {
    const p = sample(t);
    // Motion nobody can see (a part faded out) cannot jolt.
    if (p.o !== undefined && p.o < 0.05) { prev = null; prevV = null; continue; }
    const q = { x: p.x * card, y: p.y * card, r: (p.rot * Math.PI / 180) * card * 0.1, s: (p.s - 1) * card * 0.1 };
    if (prev) {
      const v = { x: q.x - prev.x, y: q.y - prev.y, r: q.r - prev.r, s: q.s - prev.s };
      // Spin loops wrap 360 -> 0: compare modulo a turn.
      const turn = 2 * Math.PI * card * 0.1;
      if (Math.abs(v.r) > turn / 2) v.r -= Math.sign(v.r) * turn;
      const speed = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.r), Math.abs(v.s));
      maxV = Math.max(maxV, speed);
      if (prevV) {
        maxDV = Math.max(maxDV, Math.abs(v.x - prevV.x), Math.abs(v.y - prevV.y), Math.abs(v.r - prevV.r), Math.abs(v.s - prevV.s));
      }
      prevV = v;
    }
    prev = q;
  }
  return { maxV, maxDV };
}

const NO = -1e9;

test('calm motion: every kit part and group moves smoothly, with no jolt (velocity and its change are bounded)', () => {
  const rows = [];
  for (const [key, item] of Object.entries(ITEMS)) {
    const tracks = [
      ...(item.groups || []).map(g => ({ id: `group ${g.id}`, loops: g.loops, keys: g.keys, calm: g.calm ?? 1, spin: false })),
      ...item.parts.map(p => ({ id: p.id, loops: p.loops, keys: p.keys, calm: p.calm ?? 1, spin: (p.loops || []).some(l => l.type === 'spin'),
        oRest: p.momentOnly ? 0 : 1 })),
    ];
    for (const tr of tracks) {
      // Untouched, and with a tap between two timer moments (a tap is never taken during a kit
      // moment: Playercard and the scene backdrop gate taps for the whole moment, so nothing snaps).
      const firstEnd = (item.moment.firstAt ?? 350) + item.moment.period * item.moment.length;
      for (const kick of [NO, firstEnd + 600]) {
        const m = motion(t => {
          // A tap exists from the moment it lands (before that, the clock has no kick).
          const mo = kit.kitMoment(item, t, t >= kick ? kick : NO);
          return kit.posedAt(tr.loops, tr.keys, tr.calm, t, mo.p, tr.oRest ?? 1);
        });
        rows.push(`${key}.${tr.id}: ${m.maxV.toFixed(2)} pt/frame, ${m.maxDV.toFixed(3)} change`);
        // Nothing crosses more than 6 pt in a frame (a slow spin's rim excepted), and no step in speed
        // larger than 0.15 pt per frame between two frames (the panel target, wave 2 round 2): smooth starts, smooth stops, no snap.
        if (!tr.spin) assert.ok(m.maxV < 6, `${key}.${tr.id} too fast: ${m.maxV.toFixed(2)} pt/frame`);
        assert.ok(m.maxDV < 0.15, `${key}.${tr.id} jolts: speed changes ${m.maxDV.toFixed(3)} pt/frame in one frame`);
      }
    }
    if (item.shark) {
      const m = motion(t => { const s = kit.kitSharkMove(item, t, NO); return { x: 0, y: s.y, rot: s.rot, s: 1 }; });
      assert.ok(m.maxV < 1.2 && m.maxDV < 0.08, `${key} moves the shark too hard: ${m.maxV.toFixed(2)} / ${m.maxDV.toFixed(3)}`);
    }
  }
  fs.mkdirSync(path.join(root, 'tools/tests/.out'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools/tests/.out/wave2-motion.txt'), rows.join('\n') + '\n');
});

test('moment keys ease in and out of rest: a track starts and ends at its rest value with zero speed', () => {
  for (const [key, item] of Object.entries(ITEMS)) {
    // (Parts that only show in their moment fade out on their keys; where they go after that is unseen.)
    for (const k of [...(item.groups || []), ...item.parts].filter(x => x.keys && x.keys.length && !x.momentOnly)) {
      for (const ch of ['x', 'y', 'rot']) {
        if (!k.keys.some(([, v]) => v[ch] !== undefined)) continue;
        const at = p => kit.trackAt(k.keys, ch, p, 0);
        // A spin may land a whole turn on (it looks the same as rest).
        const end = at(0.9995);
        const landed = ch === 'rot' ? Math.abs(end - 360 * Math.round(end / 360)) : Math.abs(end);
        assert.ok(Math.abs(at(0.0005)) < 0.02 && landed < 0.05, `${key}.${k.id}.${ch} leaves and returns to rest`);
        // Every key time is inside the moment and in order.
        const ps = k.keys.map(([p]) => p);
        assert.deepEqual([...ps].sort((a, b) => a - b), ps, `${key}.${k.id} keys in order`);
        assert.ok(ps.every(p => p > 0 && p <= 1), `${key}.${k.id} key times`);
      }
    }
  }
});

test('particles: loop streams stay alive and seeded; bursts only inside the moment', () => {
  const aspect = 1530 / 1353;
  for (const [key, item] of Object.entries(ITEMS)) {
    for (const e of item.emitters || []) {
      for (let i = 0; i < e.n; i++) {
        if (e.mode === 'moment') {
          const idle = kit.particleAt(item, e, i, 1000, -1, aspect);
          assert.equal(idle.o, 0, `${key}.${e.id}: no burst outside the moment`);
        } else {
          const a = kit.particleAt(item, e, i, 12345, -1, aspect);
          const b = kit.particleAt(item, e, i, 12345, -1, aspect);
          assert.deepEqual(plain(a), plain(b), `${key}.${e.id}: seeded`);
        }
      }
      // A particle never jumps: its position moves less than 8 pt between frames while it is alive.
      for (let i = 0; i < e.n; i++) {
        let prev = null;
        for (let t = 0; t < 20000; t += 1000 / 60) {
          const mo = kit.kitMoment(item, t, NO);
          const q = kit.particleAt(item, e, i, t, mo.p, aspect);
          // (A stream particle that respawns is invisible at both ends of its life.)
          if (q.o > 0.05 && prev && prev.o > 0.05) {
            const d = Math.hypot((q.x - prev.x) * 460, (q.y - prev.y) * 460);
            assert.ok(d < 8, `${key}.${e.id}[${i}] jumps ${d.toFixed(1)} pt at ${Math.round(t)} ms`);
          }
          prev = q;
        }
      }
    }
  }
});

test('the Pumpkin Rocket Pack floats exactly like the Jetpack 3000 and flies on Alex\'s own flame drawings', () => {
  assert.equal(fx.FX_FLOATS.pumpkin_pack, 1);
  const rig = src('src/fx/rigs/PumpkinPack.tsx');
  assert.match(rig, /from '\.\/Jetpack';/);
  assert.match(rig, /frameAt\(v, kick\.value, 0\) === k \? 1 : 0/);
  const g = JSON.parse(src('src/fx/geometry.json')).rigs.pumpkin_pack;
  assert.match(g._source, /Alex's own 3-frame Jetpack 3000 flame, recoloured/);
  // The recoloured frames are his drawings: same pixel size as the originals.
  for (let k = 0; k < 3; k++) {
    assert.deepEqual(webpSize(`pump-flame-${k}.webp`), webpSize(`jet-flame-${k}.webp`));
    assert.deepEqual(webpSize(`pump-flame-${k}-key.webp`), webpSize(`jet-flame-${k}-key.webp`));
  }
  // Its sound is Dustin's approved jet boost (the same rig and the same gentle boost).
  const layers = src('src/fx/FxLayers.tsx');
  assert.match(layers, /pumpkin_pack: \{ file: JET_BOOST/);
  assert.match(layers, /pumpkin_boost: \{ file: JET_BOOST/);
});

test("the Christmas Plaid Backpack is Alex's item 488, his drawing untouched", () => {
  const item = ITEMS.plaid_backpack;
  assert.match(item._source, /Alex's hand-drawn Christmas Plaid Backpack \(items\.id 488\)/);
  const pack = item.parts.find(p => p.id === 'pack');
  assert.equal(pack.src, 'plaid-backpack.webp');
  // Placed on his paper's own box (0.595..0.8877 x 0.3536..0.617), never moved or turned.
  assert.ok(Math.abs(pack.cx - 0.74135) < 0.002 && Math.abs(pack.cy - 0.48529) < 0.002 && Math.abs(pack.w - 0.2927) < 0.002);
  assert.ok(!pack.loops && !pack.keys && !pack.rot, 'the pack itself never moves on the shark');
});

test('every wave 2 piece is silent until Dustin picks its sound by ear (haptic only), except the approved jet boost', () => {
  const layers = loadTs('src/fx/FxLayers.tsx', {
    react: { useCallback: f => f, useContext: () => ({}), useEffect: () => undefined, useRef: v => ({ current: v }), useState: v => [v, () => undefined] },
    'react-native': { StyleSheet: { create: s => s, absoluteFill: {} }, View: 'View' },
    'react-native-reanimated': { __esModule: true, default: { View: 'AView', Image: 'AImage' }, Easing: { inOut: f => f, sin: 0 },
      runOnJS: f => f, useAnimatedStyle: f => f, useSharedValue: v => ({ value: v }), withTiming: v => v },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
    '../context/SoundEffectProvider': { SoundEffectContext: {} },
    '../helpers/haptics': { ImpactFeedbackStyle: {}, impactAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve() },
    './FxStage': { FxBox: 'FxBox' },
    './rigs/GhostLantern': {}, './rigs/Jetpack': {}, './rigs/MidwayFireworks': {}, './rigs/PlasmaBlade': {}, './rigs/ReefHalo': {},
    './rigs/Saucer': {}, './rigs/PumpkinPack': {},
    '../../assets/sounds/firework_pop.mp3': 'firework_pop.mp3', '../../assets/sounds/inventory_item_tap.mp3': 'tap.mp3',
    '../../assets/sounds/ss_jet_boost.m4a': 'ss_jet_boost.m4a',
    './rigs/Kit': { kitBack: () => 'B', kitFront: () => 'F', kitScene: () => 'S', kitSceneFront: () => 'SF', kitHasLayer: () => true },
  });
  for (const key of Object.keys(ITEMS)) {
    assert.equal(layers.FX_EQUIP_SOUNDS[key].file, null, `${key} equip is silent`);
    assert.equal(layers.FX_MOMENT_CUES[ITEMS[key].moment.cue].file, null, `${key} moment is silent`);
    assert.ok(layers.FX_MOMENT_CUES[ITEMS[key].moment.cue].haptic, `${key} still has its haptic`);
  }
});
