'use strict';
/**
 * Secret Shop v2 (next-wave/secret-shop/DESIGN.md): animated rigs on the shark,
 * the members-only shop and its flag.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');
const fx = loadTs('src/fx/registry.ts');
const geometry = JSON.parse(src('src/fx/geometry.json'));

// ------------------------------------------------------------------ registry

test('only rig keys this build ships play; anything else falls back to the rest-frame paper', () => {
  assert.equal(fx.fxKeyOf({ fx_key: 'jetpack' }), 'jetpack');
  assert.equal(fx.fxKeyOf({ fx_key: 'warp_drive' }), null, 'a newer server key draws paper_url');
  assert.equal(fx.fxKeyOf({ fx_key: null }), null);
  assert.equal(fx.fxKeyOf(null), null);
  assert.deepEqual(plain(fx.CORE_KEYS), ['jetpack', 'plasma_blade', 'reef_halo', 'saucer', 'midway_fireworks', 'ghost_lantern']);
  // Wave 2 rides along after the launch set (secret-shop-wave2.test.cjs covers its kit).
  assert.deepEqual(plain(fx.FX_KEYS), [...plain(fx.CORE_KEYS), ...plain(fx.WAVE2_KEYS)]);
  assert.equal(fx.isSecretItem({ source: 'secret' }), true);
  assert.equal(fx.isSecretItem({ fx_key: 'saucer' }), true);
  assert.equal(fx.isSecretItem({ source: 'shop' }), false);
});

test('every rig has geometry, a slot, a layer side and its bundled art', () => {
  for (const key of fx.FX_KEYS) {
    // Kit items keep their geometry in kit.json (secret-shop-wave2.test.cjs); hand-written rigs in geometry.json.
    assert.ok(geometry.rigs[key] || fx.FX_KIT[key], `${key} geometry`);
    assert.ok(fx.FX_SLOT[key], `${key} slot`);
    assert.ok(fx.FX_SIDES[key].length > 0, `${key} side`);
    assert.ok(fx.FX_FOCUS[key], `${key} tile focus`);
  }
  const files = new Set();
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) (k === 'file' ? files.add(v) : walk(v));
  };
  walk(geometry.rigs);
  let bytes = 0;
  for (const file of files) {
    const full = path.join(root, 'assets/fx', file);
    assert.ok(fs.existsSync(full), `assets/fx/${file}`);
    bytes += fs.statSync(full).size;
  }
  // The OTA asset budget for the hand-written rigs (DESIGN.md 8.1); kit art has its own (wave 2 test).
  assert.ok(bytes < 1.3 * 1024 * 1024, `rig art is ${Math.round(bytes / 1024)} KB`);
});

/** Width and height of a WebP (VP8X, VP8L or VP8 chunk). */
function webpSize(file) {
  const b = fs.readFileSync(path.join(root, 'assets/fx', file));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', `${file} is a RIFF`);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}

test('rig art ships as WebP (the OTA asset budget)', () => {
  const files = fs.readdirSync(path.join(root, 'assets/fx'));
  assert.deepEqual(files.filter(f => !f.endsWith('.webp')), []);
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(root, 'assets/fx', f)).size, 0);
  // 480 KB for the launch set (the gold burst went to 768 px so the unlock reads crisp on 3x screens,
  // perf panel round 5), plus wave 2: 30 pieces at about 40 KB each on average (DESIGN-WAVE2.md 6), so
  // the whole folder stays under 1.8 MB.
  assert.ok(bytes < 1.8 * 1024 * 1024, `assets/fx is ${Math.round(bytes / 1024)} KB`);
});

test('part aspects in geometry match the bundled art, so the live rig lines up with the rest frame', () => {
  for (const rig of Object.values(geometry.rigs)) {
    for (const part of Object.values(rig)) {
      if (!part || typeof part !== 'object' || !part.file || !part.aspect) continue;
      const { w, h } = webpSize(part.file);
      assert.ok(Math.abs(h / w - part.aspect) < 0.012, `${part.file}: ${(h / w).toFixed(4)} vs ${part.aspect}`);
    }
  }
});

test('the paper box is contain-fitted like every wardrobe layer', () => {
  const box = fx.containBox(300, 300);
  assert.ok(Math.abs(box.h - 300) < 1e-9);
  assert.ok(Math.abs(box.w - 300 * (1353 / 1530)) < 1e-9);
  assert.ok(Math.abs(box.x - (300 - box.w) / 2) < 1e-9);
  assert.deepEqual(plain(fx.containBox(0, 100)), { x: 0, y: 0, w: 0, h: 0 });
  const cover = fx.coverBox(200, 100);
  assert.deepEqual(plain(cover), { x: 0, y: -50, w: 200, h: 200 });
});

test('a part lands with its anchor on (cx, cy), the same math as compose.py place()', () => {
  const box = { x: 10, y: 20, w: 1353, h: 1530 };
  const spec = geometry.rigs.jetpack.flame;
  const l = fx.partLayout(box, spec, 1);
  assert.ok(Math.abs(l.left + spec.ax * l.width - (10 + spec.cx * 1353)) < 1e-6);
  assert.ok(Math.abs(l.top + spec.ay * l.height - (20 + spec.cy * 1530)) < 1e-6);
  assert.ok(Math.abs(l.height - l.width * spec.aspect) < 1e-6);
  // The transform origin is the anchor in whole pixels: React Native's parser reads integers only, so a
  // percentage like '56.88%' silently became '88%' and the flame stretched about the wrong point.
  assert.equal(l.origin, `${Math.round(spec.ax * l.width)}px ${Math.round(spec.ay * l.height)}px`);
  assert.match(l.origin, /^\d+px \d+px$/);
});

test('both jetpack flames leave their nozzles (geometry stays attached)', () => {
  const { body, flame, flame2 } = geometry.rigs.jetpack;
  const bodyH = body.w * body.aspect * (1353 / 1530);
  for (const [f, n] of [[flame, body.nozzles[0]], [flame2, body.nozzles[1]]]) {
    const nozzleY = body.cy - body.ay * bodyH + n.y * bodyH;
    const nozzleX = body.cx - body.ax * body.w + n.x * body.w;
    assert.ok(Math.abs(f.cy - nozzleY) < 0.02, `flame top ${f.cy} vs nozzle ${nozzleY.toFixed(3)}`);
    assert.ok(Math.abs(f.cx - nozzleX) < 0.01, `flame x ${f.cx} vs nozzle ${nozzleX.toFixed(3)}`);
  }
});

test('moments fire 350 ms after a piece appears, replay on a tap, and vary per cycle (replayable)', () => {
  const NO = fx.NO_KICK;
  assert.equal(fx.momentAt(300, NO, 6000, 0.2).p, -1, 'not before 350 ms');
  assert.ok(Math.abs(fx.momentAt(950, NO, 6000, 0.2).p - 0.5) < 1e-9, 'the first moment starts at 350 ms');
  // A tap at 3000 ms plays it again right away, and the timer moment that follows soon after is skipped.
  assert.ok(Math.abs(fx.momentAt(3600, 3000, 6000, 0.2).p - 0.5) < 1e-9);
  assert.equal(fx.momentAt(3600, 3000, 6000, 0.2).cycle, -1);
  // After a tap the timer re-phases: no automatic moment until a full period after the tap's moment ends.
  for (let t = 4200; t < 3000 + 1200 + 6000; t += 50) assert.equal(fx.momentAt(t, 3000, 6000, 0.2).p, -1, `no repeat at ${t}`);
  assert.ok(fx.momentAt(3000 + 1200 + 6000 + 10, 3000, 6000, 0.2).p >= 0);
  // A kick due soon (an equip 400 ms out) holds every timer moment until it lands.
  assert.ok(fx.momentAt(950, NO, 6000, 0.2).p >= 0);
  assert.equal(fx.momentAt(950, 1350, 6000, 0.2).p, -1, 'held before a pending equip kick');
  assert.ok(fx.momentAt(950, 1e7, 6000, 0.2).p >= 0, 'a far-off kick (clock restarted) never freezes the timer');
  // Later cycles shift by a seeded jitter (same every run), never by Math.random.
  const starts = [1, 2, 3, 4].map(c => { for (let t = 350 + c * 6000; t < 350 + (c + 1) * 6000; t += 10) if (fx.momentAt(t, NO, 6000, 0.2).p >= 0) return t; return null; });
  assert.ok(starts.every(t => t !== null));
  assert.ok(new Set(starts.map(t => (t - 350) % 6000)).size > 1, 'intervals vary');
  assert.deepEqual(starts, [1, 2, 3, 4].map(c => { for (let t = 350 + c * 6000; t < 350 + (c + 1) * 6000; t += 10) if (fx.momentAt(t, NO, 6000, 0.2).p >= 0) return t; return null; }));
  assert.doesNotMatch(src('src/fx/registry.ts'), /Math\.random/);
});

test('a tile zooms the rig so its focus fills the tile', () => {
  const box = fx.focusBox('saucer', 100);
  const f = fx.FX_FOCUS.saucer;
  assert.ok(Math.abs(box.x + f.cx * box.w - 50) < 1e-9);
  assert.ok(Math.abs(box.y + f.cy * box.h - 50) < 1e-9);
  assert.ok(Math.abs(box.w * f.span - 100) < 1e-9);
});

test('loop phases wrap and windows report progress', () => {
  assert.equal(fx.phaseOf(0, 1000), 0);
  assert.ok(Math.abs(fx.phaseOf(2500, 1000) - 0.5) < 1e-9);
  assert.ok(Math.abs(fx.phaseOf(100, 1000, 0.95) - 0.05) < 1e-9);
  assert.equal(fx.windowOf(0.5, 0, 0.2), -1);
  assert.ok(Math.abs(fx.windowOf(0.1, 0, 0.2) - 0.5) < 1e-9);
});

// ------------------------------------------------------------- worn look

const piece = (id, type, fxKey = null) => ({ id, name: `P${id}`, item_type: { id: type }, paper_url: `paper-${id}`, fx_key: fxKey });

test('wornFx: animated pieces replace their paper layer, scenes replace the backdrop, the jetpack floats', () => {
  const look = {
    background_item: piece(1, 6, 'midway_fireworks'),
    neck_item: piece(2, 3, 'jetpack'),
    hand_item: piece(3, 5),
    head_item: piece(4, 1, 'reef_halo'),
  };
  const worn = plain(fx.wornFx(look));
  assert.equal(worn.scene, 'midway_fireworks');
  assert.deepEqual(worn.rigs, [{ slot: 'neck_item', key: 'jetpack' }, { slot: 'head_item', key: 'reef_halo' }]);
  assert.equal(worn.floats, true);
  assert.equal(worn.any, true);
  assert.deepEqual(plain(fx.wornFx({ hand_item: piece(3, 5) })), { scene: null, rigs: [], floats: false, any: false });
  // A scene key on an outfit slot is ignored, and an unknown key draws paper.
  assert.deepEqual(plain(fx.wornFx({ hand_item: piece(5, 5, 'midway_fireworks'), head_item: piece(6, 1, 'warp') })).rigs, []);
});

function loadSecretUi() {
  return loadTs('src/screens/StoreScreen/SecretShopUi.tsx', {
    react: { memo: f => f, useContext: () => false, useEffect: () => undefined, useState: v => [v, () => undefined] },
    '../ui/modalLayers': { useModalLayer: () => true },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => undefined } },
    'react-native': { Modal: 'Modal', Pressable: 'Pressable', StyleSheet: { create: s => s, absoluteFill: {} }, Text: 'Text', View: 'View' },
    'react-native-reanimated': { __esModule: true, default: { View: 'AView', Image: 'AImage' }, Easing: { inOut: () => 0, sin: 0 }, cancelAnimation: () => undefined,
      useAnimatedStyle: () => ({}), useSharedValue: v => ({ value: v }), withDelay: () => 0, withRepeat: () => 0, withSequence: () => 0, withTiming: () => 0 },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
    '../../RootNavigation': { navigate: () => undefined },
    // The shared gate (components/GrownUpGate) loads through these.
    '../RootNavigation': { navigate: () => undefined },
    '../ui': { BRAND: {}, FONT: {}, GameIcon: 'GameIcon' },
    '../../fx/FxStage': { FxPauseContext: {} },
    '../../ui': { BRAND: {}, FONT: {}, GameIcon: 'GameIcon', GameButton: 'GameButton' },
    './shopUi': { MAX_FONT: 1.3 },
    './SecretVault': { VaultPanel: 'VaultPanel' },
  });
}

test('the grown-up gate: a typed answer to a 2-digit times 1-digit sum, and a 30 s rest after a wrong one', async () => {
  const ui = loadSecretUi();
  for (let seed = 0; seed < 56; seed++) {
    const q = ui.grownUpQuestion(seed);
    assert.ok(q.a >= 23 && q.a <= 89 && q.b >= 6 && q.b <= 9, 'not a sum a 9 or 10 year old does in their head');
    assert.equal(q.answer, q.a * q.b);
  }
  const q = ui.grownUpQuestion(5);
  assert.equal(ui.judgeGate(String(q.answer), 5, 1000), true);
  assert.equal(ui.judgeGate('', 5, 1000), false, 'an empty answer never passes');
  assert.equal(ui.judgeGate(String(q.answer + 1), 5, 2000), false);
  // After a wrong answer the gate rests: no host is mounted here, so ask resolves false either way;
  // the rest window itself is pinned by GATE_REST_MS.
  assert.equal(ui.GATE_REST_MS, 30000);
  assert.equal(await ui.askGrownUp(5), false, 'no gate mounted: never opens the paywall');
  // One app-wide gate (components/GrownUpGate), the same one every paywall door uses, mounted at the root.
  const code = src('src/components/GrownUpGate.tsx');
  assert.doesNotMatch(code, /showGameDialog/, 'no multiple choice to guess from');
  assert.match(code, /const KEYS = \['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'\] as const;/);
  assert.match(code, /AsyncStorage\.setItem\(REST_KEY/, 'the rest survives a relaunch');
  assert.doesNotMatch(code, /name="back"/, 'the delete key is not the Back arrow');
  assert.match(src('src/screens/StoreScreen/SecretShopUi.tsx'), /export \{ askGrownUp, grownUpQuestion, judgeGate, GATE_REST_MS \} from '\.\.\/\.\.\/components\/GrownUpGate';/);
  assert.doesNotMatch(src('src/screens/StoreScreen/ShopShelves.tsx'), /<GrownUpGateHost/, 'no second host to fight the root one');
});

test('the Playercard draws rigs in place of their paper and keeps the shark on its layers', () => {
  const card = src('src/components/Playercard.tsx');
  assert.match(card, /if \(fx\.rigs\.some\(r => r\.slot === slot\)\) return null;/, 'an animated piece never double-draws its paper');
  assert.match(card, /<FxRigLayers fx=\{fx\} side="back"[\s\S]*sharkBaseLayers\(inventory\)[\s\S]*<FxRigLayers fx=\{fx\} side="front"/,
    'back layers, then the shark, then the front layers');
  assert.match(card, /const lod: FxLod = still \|\| reduced \? 'still' : fxIdle && fxLod === 'full' \? 'lite' : fxLod;/, 'Reduce Motion holds the rest pose; idle stages drop particles');
  assert.match(card, /fx\.scene && <FxScene/);
});

test('rig clocks stop off screen, under the try-on, in the background and for still stages', () => {
  const stage = src('src/fx/FxStage.tsx');
  assert.match(stage, /return lod !== 'still' && focused && active && !paused;/);
  const shelves = src('src/screens/StoreScreen/ShopShelves.tsx');
  assert.match(shelves, /const pausedFor = \(key: string\) => \{\s*if \(open\) return true;/, 'the shelves pause while the try-on covers them');
  for (const key of ['hero', 'featured', 'daily']) assert.match(shelves, new RegExp(`<FxPauseContext\\.Provider value=\\{pausedFor\\('${key}'\\)\\}>`));
  assert.match(src('src/screens/StoreScreen/SecretShopUi.tsx'), /const paused = useContext\(FxPauseContext\);/, 'star motes pause too');
  assert.match(stage, /frame\.setActive\(running\)/);
  assert.match(stage, /Math\.min\(info\.timeSincePreviousFrame \?\? 16, 50\)/, 'a hitch never teleports a particle');
});

test('cues are Chris\'s SFX or a sound Dustin approved by ear; unpicked pieces are silent', () => {
  const layers = src('src/fx/FxLayers.tsx');
  const files = [...layers.matchAll(/require\('\.\.\/\.\.\/assets\/sounds\/([^']+)'\)/g)].map(m => m[1]);
  for (const file of files) assert.ok(fs.existsSync(path.join(root, 'assets/sounds', file)), file);
  // The only new sound is Dustin's pick (October 5): ss_jet_boost v2.
  const approved = ['ss_jet_boost.m4a'];
  assert.deepEqual(files.filter(f => f.startsWith('ss_')), approved);
  assert.match(layers, /boost: \{ file: JET_BOOST,/);
  for (const moment of ['swing', 'beam', 'peek']) assert.match(layers, new RegExp(`${moment}: \\{ file: null,`), `${moment} stays silent until Dustin picks`);
  assert.match(layers, /if \(cue\.file != null\) ref\.current\?\.\(cue\.file/);
  assert.match(src('src/components/Playercard.tsx'), /fxKick\.value = fxClock\.value \+ 400;/, 'equipping plays the moment once, 400 ms later, as the only cue');
  assert.doesNotMatch(src('src/fx/rigs/GhostLantern.tsx') + src('src/fx/rigs/Saucer.tsx') + src('src/fx/rigs/MidwayFireworks.tsx')
    + src('src/fx/rigs/PlasmaBlade.tsx') + src('src/fx/rigs/Jetpack.tsx'), /shadow(Radius|Opacity|Color)/, 'no shadow on any animated view');
  assert.doesNotMatch(src('src/fx/rigs/PlasmaBlade.tsx') + src('src/fx/rigs/Jetpack.tsx') + src('src/fx/rigs/MidwayFireworks.tsx'), /blur=\{/,
    'glows are sprites, never blurred copies');
});

test('rig performance budget: at most 24 animated views at full LOD per rig', () => {
  // Count the per-rig pools (constant arrays mapped into components) plus the fixed parts.
  const pools = {
    jetpack: [src('src/fx/rigs/Jetpack.tsx'), /const (SPARKS|PUFFS) = \[([^\]]*)\]/g, 4],
    plasma_blade: [src('src/fx/rigs/PlasmaBlade.tsx'), /const (TRAIL) = \[([^\]]*)\]/g, 4],
    reef_halo: [src('src/fx/rigs/ReefHalo.tsx'), /const (SPLASH) = \[([^\]]*)\]/g, 8],
  };
  for (const [key, [code, re, fixed]] of Object.entries(pools)) {
    const pooled = [...code.matchAll(re)].reduce((n, m) => n + m[2].split(',').length, 0);
    assert.ok(pooled + fixed <= 24, `${key}: ${pooled + fixed}`);
  }
  const fireworks = src('src/fx/rigs/MidwayFireworks.tsx');
  // Full: 7 bursts + 7 rockets + 4 bloom glows + 4 white-hot fade copies = 22 animated views (steady shells
  // only carry the glow and the white copy); lite builds no rocket, glow or white copy at all.
  const shells = (fireworks.match(/finale: 0(\.\d+)?, flash/g) || []).length + geometry.rigs.midway_fireworks.bursts.length;
  assert.equal(shells, 7);
  const steady = geometry.rigs.midway_fireworks.bursts.length;
  assert.match(fireworks, /lod === 'full' && s\.finale === undefined && <BurstWhite/);
  assert.match(fireworks, /\{s\.finale === undefined && <Animated\.Image source=\{GLOW\}/);
  const views = shells * 2 + steady * 2;
  assert.ok(views <= 24, `fireworks: ${views} animated views at full`);
  assert.match(fireworks, /\{lod === 'full' && shells\.map\(i => <ShellExtras/);
  // Lite (tile) budgets: the halo and the lantern keep one ghost/fish layer, never a hidden duplicate.
  const lantern = src('src/fx/rigs/GhostLantern.tsx');
  assert.match(lantern, /if \(props\.lod !== 'full'\) return null;/, 'the lantern back layer is full LOD only');
  assert.match(lantern, /front=\{props\.lod === 'full' \? true : 'both'\}/);
  assert.match(src('src/fx/rigs/ReefHalo.tsx'), /props\.lod !== 'lite' && FISH\.map/);
  // Every shell stays inside the portrait safe area (x 0.15 to 0.85, below y 0.08).
  for (const b of geometry.rigs.midway_fireworks.bursts) assert.ok(b.cx >= 0.15 && b.cx <= 0.85 && b.cy >= 0.08, JSON.stringify(b));
});

test('every moment-cue progress function is a worklet (a plain function crashes on the UI thread)', () => {
  for (const file of fs.readdirSync(path.join(root, 'src/fx/rigs'))) {
    const code = src(`src/fx/rigs/${file}`);
    const calls = [...code.matchAll(/useMomentCue\(t, kick, \(\) =>\s*(\{\s*'worklet'|\()/g)];
    assert.equal(calls.length, (code.match(/useMomentCue\(/g) || []).length, `${file}: every useMomentCue passes the clock (t, kick) first`);
    for (const call of calls) assert.ok(call[1].includes("'worklet'"), `${file}: useMomentCue progress must start with 'worklet'`);
  }
  // The reaction reads the clock itself (Reanimated re-runs a reaction only for shared values its closure reads).
  assert.match(src('src/fx/FxStage.tsx'), /const now = t\.value \+ kick\.value \* 0;/);
  for (const file of []) {
  }
});

test('every worklet helper is declared above its first use (the Reanimated plugin does not hoist worklets)', () => {
  const files = ['src/fx/registry.ts', ...fs.readdirSync(path.join(root, 'src/fx/rigs')).map(f => `src/fx/rigs/${f}`)];
  for (const file of files) {
    const code = src(file);
    for (const m of code.matchAll(/function (\w+)\([^)]*\)[^{]*\{\s*'worklet'/g)) {
      const first = code.search(new RegExp(`\\b${m[1]}\\(`));
      assert.ok(first >= m.index, `${file}: ${m[1]} is used above its declaration`);
    }
  }
});

test('no Animated style ever passes an undefined transformOrigin (RN Animated turns it into null and crashes)', () => {
  for (const file of ['src/components/Playercard.tsx', 'src/fx/FxLayers.tsx', 'src/fx/FxStage.tsx']) {
    assert.doesNotMatch(src(file), /transformOrigin: [^,}]*\? [^,}]* : undefined/, file);
  }
});

test('Reduce Motion is read inside the shark stage and every tile, so no screen can forget it', () => {
  assert.match(src('src/components/Playercard.tsx'), /const reduced = useReducedGameMotion\(\);[\s\S]{0,2000}const lod: FxLod = still \|\| reduced \? 'still'/);
  const solo = src('src/fx/FxSolo.tsx');
  assert.equal((solo.match(/const reduced = useReducedGameMotion\(\);/g) || []).length, 2);
  // A look with nothing to draw runs no clock.
  assert.match(src('src/components/Playercard.tsx'), /stageAwake && lod !== 'still' && \(fx\.rigs\.length > 0 \|\| \(!!fx\.scene && showBackground\)\)/);
  // One focus/AppState subscription per card (performance panel round 5).
  assert.equal((src('src/components/Playercard.tsx').match(/useFxRunning\(/g) || []).length, 1);
});

// ------------------------------------------------------------- the shop

test('the try-on says "Unlock with VIP" on Secret pieces, and a members_only 403 flips it', () => {
  const shelves = loadTs('src/helpers/shopShelves.ts');
  const base = { owned: false, worn: false, vipLocked: true, short: 0, phase: 'idle', wear: 'idle', finishes: false, cost: 280 };
  assert.equal(shelves.tryOnCta({ ...base, secret: true }).label, 'Ask a grown-up');
  assert.equal(shelves.tryOnCta({ ...base, secret: true }).action, 'vip');
  assert.match(shelves.tryOnCta({ ...base, secret: true }).note, /VIP members can buy/);
  const tryOn = src('src/screens/StoreScreen/TryOnSheet.tsx');
  // DESIGN.md 6.7 with Dustin's member rule: one promise on every Secret piece, members and not.
  assert.match(tryOn, /const keepLine = player\?\.is_subscribed \? MEMBER_KEEP : MEMBER_PROMISE;/, 'the member promise on every Secret try-on');
  assert.equal(shelves.MEMBER_PROMISE, 'VIP members can wear this. It stays in your closet forever.');
  assert.match(tryOn, /case 'vip': afterHiddenRef\.current = \(\) => \{ void openMembership\(\); \}; closeAnimated\(\);/, 'the paywall is behind a grown-up, after the sheet hides');
  assert.match(tryOn, /cta\.action === 'vip' && secretItem \? \(\s*\/\/ Not the gold Buy face/, 'the grown-up button is violet, not the Buy face');
  assert.match(tryOn, /vipLocked: vipLocked && !secretItem/, 'non-members can heart Secret pieces');
  assert.match(tryOn, /Your VIP ended, so this one is locked\. Your coins are safe\./);
  assert.equal(shelves.tryOnCta(base).label, 'VIP only: see VIP', 'legacy VIP gear keeps its copy');
  assert.equal(shelves.tryOnCta({ ...base, vipLocked: false, secret: true }).label, 'Buy for 280');
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /if \(data\?\.code === 'members_only'\) \{\s*setLapsed\(true\); setPhase\('idle'\); setHold\(true\);/);
});

test('Secret tiles keep their price on show for non-members, with the VIP lock', () => {
  const tile = src('src/screens/StoreScreen/ShopTile.tsx');
  assert.match(tile, /vipLocked && secret \? \([\s\S]*?formatCoins\(item\.cost\)[\s\S]*?<GameIcon name="lock"/);
  assert.match(tile, /if \(fx\) \{[\s\S]*?<FxTileArt fxKey=\{fx\}/, 'Secret tiles animate');
});

test('a Secret piece wears the SECRET badge everywhere', () => {
  const wardrobe = loadTs('src/helpers/wardrobe.ts');
  assert.equal(wardrobe.wearableBadge({ rarity: 4, source: 'secret' }).label, 'SECRET');
  assert.equal(wardrobe.wearableBadge({ rarity: 3, fx_key: 'reef_halo', is_member_item: true }).label, 'SECRET');
  assert.equal(wardrobe.wearableBadge({ rarity: 3, is_member_item: true }).label, 'VIP');
});

test('the Secret Shop is drawn only while secret_shop_v2 is on (absent or error reads as off)', async () => {
  const noMine = async () => { throw new Error('404: an older server'); };
  const flagModule = loadTs('src/services/secretShopFlag.ts', { '../api/endpoints/platform/feature-flags': { default: async () => ({ flags: {} }) },
    '../api/endpoints/me/secret-shop': { __esModule: true, default: noMine } });
  assert.equal(await flagModule.loadSecretShopFlag(async () => ({ flags: {} })), false);
  flagModule.resetSecretShopFlagForTests();
  assert.equal(await flagModule.loadSecretShopFlag(async () => ({ flags: { secret_shop_v2: 'true' } })), false, 'only a real true');
  flagModule.resetSecretShopFlagForTests();
  assert.equal(await flagModule.loadSecretShopFlag(async () => { throw new Error('offline'); }), false);
  flagModule.resetSecretShopFlagForTests();
  let t = 0;
  assert.equal(await flagModule.loadSecretShopFlag(async () => ({ flags: { secret_shop_v2: true } }), () => t), true);
  assert.equal(flagModule.secretShopFlagNow(), true);
  t = 6 * 60_000; // past the 5 minute cache: a server flip lands
  assert.equal(await flagModule.loadSecretShopFlag(async () => ({ flags: { secret_shop_v2: false } }), () => t), false);

  // The per-player answer wins over the public flag (the preview list: SECRET_SHOP_V2_PREVIEW_IDS).
  flagModule.resetSecretShopFlag();
  assert.equal(await flagModule.loadSecretShopFlag(async () => ({ flags: { secret_shop_v2: false } }), Date.now,
    async () => ({ secret_shop_v2: true, preview: true })), true, 'a previewer sees it while the launch flag is off');
  flagModule.resetSecretShopFlag();
  assert.equal(await flagModule.loadSecretShopFlag(async () => ({ flags: { secret_shop_v2: true } }), Date.now,
    async () => ({ secret_shop_v2: false, preview: false })), false, 'the server decides per player');
  flagModule.resetSecretShopFlag();
  assert.equal(await flagModule.loadSecretShopFlag(async () => { throw new Error('offline'); }, Date.now, noMine), false);
  // A hiccup is never cached: the next call asks again and gets the real answer.
  assert.equal(await flagModule.loadSecretShopFlag(async () => ({ flags: { secret_shop_v2: false } }), Date.now,
    async () => ({ secret_shop_v2: true, preview: true })), true, 'a failed read does not pin the shop off');
  assert.match(src('src/context/AuthProvider.tsx'), /resetSecretShopFlag\(\)/, 'sign-out forgets the per-player answer');

  const store = src('src/screens/StoreScreen.tsx');
  assert.match(store, /const nextSecretV2 = !!nextStore\.is_secret_store && await loadSecretShopFlag\(\);/);
  assert.match(store, /nextStore\.is_secret_store && !nextSecretV2 \? Promise\.resolve\(null\)\s*: nextSecretV2 \? getShopToday\(id\)/,
    'with the flag off the secret store never asks for shelves');
  assert.match(store, /secret=\{secretShelves\}/);
});

test('non-members window-shop: the Profile tile opens the Secret Shop when the flag is on', () => {
  const profile = src('src/screens/ProfileScreen.tsx');
  assert.match(profile, /void loadSecretShopFlag\(\)\.then\(on => \(on\s*\? RootNavigation\.navigate\('Store', \{ store: store\.id \}\)\s*: void openMembership\(\)\)\);/);
  const shelves = src('src/screens/StoreScreen/ShopShelves.tsx');
  // Non-members get one calm note and the grown-up door in the showroom (Oct 8), never a buy button.
  const showroom = src('src/screens/StoreScreen/SecretShowroom.tsx');
  assert.match(showroom, /\{!member && \(/);
  assert.match(showroom, /<VaultSecondaryButton label="Ask a grown-up" icon="lock" onPress=\{\(\) => \{ void openMembership\(\); \}\}/);
  const ui = loadSecretUi();
  assert.match(ui.SECRET_PREVIEW_COPY.body, /yours forever/);
  assert.doesNotMatch(ui.SECRET_PREVIEW_COPY.body + ui.SECRET_PREVIEW_COPY.title, /hurry|last chance|only \d|left!/i, 'calm copy, no pressure');
});

test('the midnight theme is dark, and every ink on it is AA', () => {
  const theme = src('src/fx/secretTheme.ts');
  const color = key => new RegExp(`\\b${key}: '(#[0-9a-f]{6})'`, 'i').exec(theme)[1];
  const lum = hex => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const surface of ['panel', 'card', 'well', 'floor']) {
    assert.ok(lum(color(surface)) < 0.1, `${surface} is midnight`);
    for (const ink of ['ink', 'inkSoft', 'inkGold']) {
      assert.ok(contrast(color(ink), color(surface)) >= 4.5, `${ink} on ${surface}: ${contrast(color(ink), color(surface)).toFixed(2)}`);
    }
  }
  // Secret tiles are midnight with white ink (both plate stops).
  const plate = /tilePlate: \['(#[0-9a-f]{6})', '(#[0-9a-f]{6})'\]/i.exec(theme);
  assert.ok(contrast('#ffffff', plate[1]) >= 4.5 && contrast('#ffffff', plate[2]) >= 4.5);
});

test('scene backdrops play behind the try-on and hero instead of their still paper', () => {
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /backdrop=\{stage\?\.scene \? <FxSceneBackdrop fxKey=\{stage\.scene\}/);
  const shelves = src('src/screens/StoreScreen/ShopShelves.tsx');
  assert.match(shelves, /backdrop=\{stage\?\.scene \? <FxSceneBackdrop fxKey=\{stage\.scene\}/);
  assert.match(shelves, /fx_key: item\.fx_key \?\? null \}\], 'base'\)/, 'the Vault hero wears the live rig');
});

test('no timer moment competes with a Secret buy: the try-on holds them from the confirm tap to the unlock', () => {
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /fxHold=\{secret && HOLD_PHASES\.has\(phase\)\}/);
  assert.match(sheet, /HOLD_PHASES = new Set\(\['checking', 'confirm', 'buying', 'landing'\]\)/);
  const card = src('src/components/Playercard.tsx');
  // The hold keeps a kick pending (momentAt holds timers within 2 s of one), and never overrides the unlock's kick.
  assert.match(card, /if \(fxPlayRef\.current === startPlay\) fxKick\.value = fxClock\.value \+ 1500/);
  assert.match(card, /if \(fxPlayRef\.current === startPlay\) fxKick\.value = NO_KICK/);
  assert.equal(fx.momentAt(950, 950 + 1500, 6000, 0.2).p, -1);
});

test("the jetpack is Alex's hand-drawn Jetpack 3000, animated with his own flame drawings (no generated art)", () => {
  const g = geometry.rigs.jetpack;
  assert.match(g._source, /Alex's hand-drawn Jetpack 3000 \(items\.id 436\)/);
  assert.equal(g.body.file, 'jetpack.webp');
  assert.deepEqual(g.flame.frames, ['jet-flame-0.webp', 'jet-flame-1.webp', 'jet-flame-2.webp']);
  assert.deepEqual(g.flame2.frames, ['jet-flame-side-0.webp', 'jet-flame-side-1.webp', 'jet-flame-side-2.webp']);
  for (const f of [...g.flame.frames, ...g.flame2.frames]) {
    const { w, h } = webpSize(f);
    assert.ok(Math.abs(h / w - (g.flame.frames.includes(f) ? g.flame : g.flame2).aspect) < 0.012, f);
  }
  const rig = src('src/fx/rigs/Jetpack.tsx');
  // Stepped like a hand-drawn loop (one drawing per 80 ms), never a tweened flicker, no soft glow.
  assert.match(rig, /export const FLAME_FRAME_MS = 80;/);
  assert.match(rig, /opacity: frameAt\(v, kick\.value, delay\) === k \? 1 : 0,/);
  // Alex's drawing untouched; a navy keyline behind it (the same drawing, tinted) for cyan backdrops.
  assert.match(rig, /<FxPart source=\{keyline\} box=\{box\} spec=\{spec\} aspect=\{spec\.aspect\} style=\{style\} \/>\s*<FxPart source=\{source\} box=\{box\} spec=\{spec\} aspect=\{spec\.aspect\} style=\{style\} \/>/);
  for (const f of [...g.flame.keys, ...g.flame2.keys]) assert.ok(fs.existsSync(path.join(root, 'assets/fx', f)), f);
  // The floor light is drawn outside the moving shark, on the stage floor, under the nozzle.
  assert.match(src('src/components/Playercard.tsx'), /<JetpackFloorLight t=\{fxClock\} kick=\{fxKick\} box=\{containBox\(width, height\)\}\s*floorY=/);
  // Only where a floor exists (a stage plinth), as a true two-band ellipse.
  assert.match(src('src/components/Playercard.tsx'), /\{fx\.floats && lod === 'full' && fxRunning && !!shadowAt && \(/);
  assert.match(rig, /<Ellipse cx="50" cy="12\.5" rx="50" ry="12\.5" fill=\{CYAN\} fillOpacity=\{0\.25\} \/>/);
  assert.match(rig, /if \(lod === 'still'\) return \{ opacity: k === 0 \? 1 : 0, transform/, "Reduce Motion: Alex's paper drawing");
  assert.doesNotMatch(rig, /glow\.webp|fx\/flame\.webp'|puff\.webp|#ffb43a|Math\.sin\(v \/ 41\)/, 'no generated flame, smoke, glow or orange light');
  assert.match(rig, /require\('\.\.\/\.\.\/\.\.\/assets\/fx\/jet-drop\.webp'\)/);
  for (const gone of ['flame.webp', 'puff.webp', 'jet-flame.webp']) assert.equal(fs.existsSync(path.join(root, 'assets/fx', gone)), false, gone);
  assert.match(rig, /export function jetpackBody\(/);


  const fixture = src('src/screens/StoreScreen/SecretShopPreviewScreen.tsx');
  assert.match(fixture, /\{ id: 436, name: 'Jetpack 3000', fx: 'jetpack', slot: 3, rarity: 3, cost: 140,/);
  assert.doesNotMatch(fixture, /Fin Jet/);
});

test('the reef halo sits off to the back of the head at a jaunty angle, seen from above', () => {
  const r = geometry.rigs.reef_halo.ring;
  // Dustin, October 5: off to the side, not centred; resting on the back of the head like a tilted cap.
  assert.ok(r.cx > 0.55 && r.cx < 0.66, `toward the back of the head (cx ${r.cx}), not centred on the crown`);
  assert.ok(r.tilt >= 12 && r.tilt <= 24, 'a jaunty tilt down toward the back, never leaning forward toward the snout');
  // Against the base shark (classic-no-eye.png): the head top is y 0.208 at x 0.60 and 0.242 at x 0.65.
  const [W, H] = geometry.canvas;
  const halfH = (2 * r.rx * W * r.scale * r.aspect) / 2 / H;
  assert.ok(r.cy - halfH < 0.208 - 0.04, 'the far edge rides above and behind the head');
  assert.ok(r.cy + halfH > 0.208, 'the near edge crosses in front of the head');
  const ringRy = (r.rx * W * r.aspect * 0.9) / H;
  assert.ok(Math.abs(r.ry - ringRy) < 0.012, `orbit ry ${r.ry} vs ring ${ringRy.toFixed(3)}`);
  const halo = src('src/fx/rigs/ReefHalo.tsx');
  assert.match(halo, /const show = near === 'both' \? true : near \? p\.depth > 0 : p\.depth <= 0;/, 'near fish in front, far fish behind');
  assert.match(halo, /y: r\.cy \+ ex \* Math\.sin\(tilt\) \+ ey \* Math\.cos\(tilt\),/, 'near (depth > 0) is lower on screen');
  // The halo is a head item: nothing else can stack in its slot.
  assert.equal(fx.FX_SLOT.reef_halo, 'head_item');
});

function loadJetpack() {
  const reg = loadTs('src/fx/registry.ts', { './geometry.json': geometry });
  return loadTs('src/fx/rigs/Jetpack.tsx', {
    'react-native': { StyleSheet: { create: s => s, absoluteFill: {} }, View: 'View' },
    'react-native-svg': { __esModule: true, default: 'Svg', Ellipse: 'Ellipse' },
    'react-native-reanimated': { __esModule: true, default: { Image: 'AImage', View: 'AView' }, useAnimatedStyle: f => f() },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
    '../FxStage': { FxPart: 'FxPart', useMomentCue: () => undefined },
    '../registry': reg,
  });
}

test("the jetpack never loses its flame: exactly one of Alex's drawings at every moment, through a whole boost", () => {
  const jet = loadJetpack();
  const NO = -1e9;
  // From a stage's negative settle start, through a tapped boost (kick at 3000) and its settle.
  for (let v = -1800; v < 12000; v += 7) {
    for (const kick of [NO, 3000]) {
      for (const delay of [0, 40]) {
        const f = jet.frameAt(v, kick, delay);
        assert.ok(f === 0 || f === 1 || f === 2, `frame ${f} at t=${v}`);
      }
    }
  }
});

test('the jetpack shark floats calmly: no jumps, no velocity spikes, a slow boost every 8 to 11 s', () => {
  const jet = loadJetpack();
  const H = 460;
  const NO = -1e9;
  const dt = 1000 / 60;
  let prevY = jet.jetpackFloat(0, NO, H);
  // Start from the bob's real speed (not from 0), so the first frame is not a false spike.
  let prevV = (jet.jetpackFloat(dt / 10, NO, H) - prevY) / (dt / 10) * 1000;
  let maxV = 0;
  let maxA = 0;
  const starts = [];
  let riseMs = 0;
  let was = false;
  for (let t = dt; t <= 60000; t += dt) {
    const y = jet.jetpackFloat(t, NO, H);
    const v = (y - prevY) / dt * 1000; // px per second
    maxV = Math.max(maxV, Math.abs(v));
    maxA = Math.max(maxA, Math.abs(v - prevV) / dt * 1000);
    const on = jet.boostAt(t, NO) > 0;
    if (on && !was) starts.push(t);
    if (on) { const p = (t - starts[starts.length - 1]); if (p < 1300) riseMs = Math.max(riseMs, 0); }
    was = on; prevY = y; prevV = v;
  }
  // A 0.033 * 460 = 15 px lift over 1.2 s, down over 1.3 s: a drift, never a jump.
  assert.ok(maxV < 30, `max speed ${maxV.toFixed(1)} px/s`);
  // No snap: speed never changes by more than 4 px/s between two frames (the rise starts gently with the flame).
  assert.ok(maxA * dt / 1000 < 4, `max speed change ${(maxA * dt / 1000).toFixed(2)} px/s per frame`);
  const gaps = starts.slice(1).map((s, k) => s - starts[k]);
  assert.ok(gaps.length >= 4 && gaps.every(g => g > 6500 && g < 11800), `boost gaps ${gaps.map(g => Math.round(g)).join(', ')}`);
  assert.ok(new Set(gaps.map(g => Math.round(g / 100))).size > 1, 'not mechanical: the gaps vary');
  // Every boost takes off from and lands at rest height (the bob is out), so rise and fall match.
  for (const st of starts) {
    assert.ok(Math.abs(jet.bobWeight(st + 1200, NO)) < 1e-6, 'no bob at the top of a boost');
    assert.ok(Math.abs(jet.bobWeight(st + 2470, NO)) < 1e-6, 'lands with no bob');
  }
  // The landing flows straight into the first bob: no shelf, no step (height moves one way for 400 ms).
  for (const st of starts.slice(0, -1)) {
    const land = st + 2500;
    const h = [];
    for (let k = 0; k <= 24; k++) h.push(jet.jetpackFloat(land + k * dt, NO, H));
    const d = h.slice(1).map((y, k) => y - h[k]);
    assert.ok(d.every(x => x <= 1e-9) || d.every(x => x >= -1e-9), `monotonic after landing at ${Math.round(land)}`);
  }
  // The flame flares with the sound: full thrust within 150 ms.
  assert.ok(jet.thrustCurve(150 / 2500) > 0.99 && jet.thrustCurve(400 / 2500) === 1 && jet.thrustCurve(2400 / 2500) < 0);
  // No squash or stretch on the shark.
  const body = jet.jetpackBody(3000, NO);
  assert.equal(body.sx, 1); assert.equal(body.sy, 1);
  const layers = src('src/fx/FxLayers.tsx');
  assert.doesNotMatch(layers, /scaleX: body\.sx/);
  // Equip and unequip ease the lift in and out from wherever it is (never a snap), hooks before the early return.
  assert.match(layers, /const lift = useFloatWeight\(props\.fx\.floats\);[\s\S]{0,400}?const moves = lift\.active/);
  assert.match(layers, /w\.value = withTiming\(floats \? 1 : 0, \{ duration: 700/);
  // A tap or a buy never restarts a lift mid-air.
  assert.match(src('src/components/Playercard.tsx'), /if \(kind === 'tap' && airborne\) return;/);
});

test('a store switch never reuses one Store screen: keyed by store, one screen per store id', () => {
  const screen = src('src/screens/StoreScreen.tsx');
  assert.match(screen, /export default function StoreScreen\(props[^)]*\) \{\s*const store = [^;]+;\s*return <StoreScreenBody key=\{String\(store\)\} \{\.\.\.props\} \/>;\s*\}/);
  // The wrapper holds no state of its own (every hook lives in the keyed body).
  const wrapper = /export default function StoreScreen\([\s\S]*?\n\}/.exec(screen)[0];
  assert.doesNotMatch(wrapper, /\buse[A-Z]\w*\(/);
  assert.match(src('src/Root.tsx'), /name="Store" getComponent=\{\(\) => require\('\.\/screens\/StoreScreen'\)\.default\}\s*getId=\{\(\{ params \}\) => String\(/);
});

test('the Secret Shop never falls back to the legacy grid on a network hiccup', () => {
  const screen = src('src/screens/StoreScreen.tsx');
  // With the flag on, a failed shop day is an error with a retry (not .catch(() => null) into the old grid).
  assert.match(screen, /: nextSecretV2 \? getShopToday\(id\) : getShopToday\(id\)\.catch\(\(\) => null\),/);
});

// ------------------------------------------------------------------ transformOrigin

test('transform origins are whole pixels or whole percents: RN reads "56.88%" as "88%"', () => {
  const { partLayout } = loadTs('src/fx/registry.ts');
  const box = { x: 3, y: 7, w: 331.7, h: 375.1 };
  for (const [key, rig] of Object.entries(geometry.rigs)) {
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (typeof node.w === 'number') {
        const { origin } = partLayout(box, node);
        assert.match(origin, /^-?\d+px -?\d+px$/, `${key}: ${origin}`);
      }
      Object.values(node).forEach(walk);
    };
    walk(rig);
  }
  // No literal fractional percent anywhere in the app.
  const files = [];
  const scan = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) scan(full); else if (/\.(tsx?|js)$/.test(d.name)) files.push(full);
  });
  scan(path.join(root, 'src'));
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(/transformOrigin:\s*[`'"]([^`'"]*)[`'"]/g)) {
      assert.doesNotMatch(m[1], /\d\.\d+%/, `${path.relative(root, file)}: ${m[1]}`);
      assert.doesNotMatch(m[1], /\$\{[^}]*\}%/, `${path.relative(root, file)}: computed percent ${m[1]}`);
    }
  }
});

// ------------------------------------------------------------------ lift framing

test('the jetpack flight stays inside every card: tallest hat at the boost peak, tail and flame at the lowest hover', () => {
  const reg = loadTs('src/fx/registry.ts', { './geometry.json': geometry });
  const jet = loadJetpack();
  const shelves = loadTs('src/helpers/shopShelves.ts');
  const F = reg.SHARK_FRAME;
  const fxJet = { rigs: [{ slot: 'neck_item', key: 'jetpack' }] };
  // Every Playercard size the app draws: shop stages (from stageCard, as the screens call it),
  // the Dressing Room, profile and player headers, recaps and tiny cards, plus odd aspects.
  const cards = [];
  for (const screenW of [375, 390, 430]) {
    const sheetH = Math.min(844 * 0.9, 780);
    const stageH = Math.round(Math.min(300, sheetH * 0.38));
    const secretH = Math.round(Math.min(430, sheetH * 0.52));
    for (const [w, h, name] of [[screenW - 34, stageH - 6, 'try-on'], [screenW - 34, secretH - 6, 'secret try-on'], [screenW - 40, 360, 'vault hero'], [screenW - 40, 260, 'hero']]) {
      const c = shelves.stageCard(w, h, 18 + 0.04 * (h / 2) + 4);
      // Stages pass their sky as liftRoom (box.top): the frame is the stage, not the card.
      cards.push({ name: `${name} @${screenW}`, W: c.box.width, H: c.box.height, top: c.box.top, room: Math.max(0, c.box.top), stageH: h, floored: true, tailY: c.tailY - c.box.top });
    }
  }
  for (const [W, H, name] of [[390, 460, 'dressing room'], [430, 460, 'dressing room max'], [390, 455, 'profile and player header'], [130, 180, 'line recap'],
    [200, 226, 'gallery cell'], [160, 180, 'small'], [120, 136, 'smaller'], [80, 90, 'tiny'], [390, 300, 'wide'], [300, 520, 'tall']]) cards.push({ name, W, H, top: 0, room: 0, stageH: H });

  const NO = -1e9;
  for (const card of cards) for (const hat of [true, false]) {
    const { W, H } = card;
    const label = `${card.name} ${W.toFixed(0)}x${H.toFixed(0)} ${hat ? 'with a hat' : 'no hat'}`;
    const fr = reg.liftFraming(fxJet, W, H, card.room, !!card.floored, hat);
    assert.ok(fr.scale > 0.8 && fr.scale <= 1, `${label}: shrinks only slightly (${fr.scale.toFixed(3)})`);
    if (card.floored) assert.ok(fr.shift <= 0, `${label}: never sinks toward the plinth`);
    if (!hat && card.floored) assert.equal(fr.scale, 1, `${label}: full size when no hat needs the room`);
    const paper = reg.containBox(W, H);
    const artTop = F.inset * W + paper.y + (hat ? F.artTop : F.headTop) * paper.h;
    const artBottom = F.inset * W + paper.y + F.artBottom * paper.h;
    const pts = [];
    for (const fx of [0.15, 0.5, 0.85]) {
      pts.push({ x: paper.x + fx * paper.w, y: artTop, top: true });
      pts.push({ x: paper.x + fx * paper.w, y: artBottom, top: false });
    }
    const ox = F.originX * W; const oy = F.originY * H;
    let minTop = Infinity; let maxBottom = -Infinity; let lowestTail = -Infinity;
    for (let t = 0; t < 60000; t += 1000 / 60) {
      const lift = fr.lift * jet.jetpackFloat(t, NO, H);
      const rot = (jet.jetpackBody(t, NO).rot * Math.PI) / 180;
      for (const p of pts) {
        const dx = p.x - ox; const dy = p.y - oy;
        const ry = dx * Math.sin(rot) + dy * Math.cos(rot);
        const y = oy + fr.shift + fr.scale * (ry + lift);
        if (p.top) minTop = Math.min(minTop, y); else maxBottom = Math.max(maxBottom, y);
      }
      if (card.floored) lowestTail = Math.max(lowestTail, oy + fr.shift + fr.scale * (card.tailY - oy + lift));
    }
    assert.ok(minTop >= 0.02 * H - card.room, `${label}: peak top ${minTop.toFixed(1)} px is inside the frame`);
    assert.ok(maxBottom <= H, `${label}: tail and flame ${maxBottom.toFixed(1)} px stay above the bottom (${H.toFixed(0)})`);
    assert.ok(card.top + minTop >= 0, `${label}: inside the stage at the peak`);
    if (card.floored) {
      // Over a plinth it reads as flying: clear air under the tail at the lowest hover, more when no hat needs the room.
      const air = (card.tailY - lowestTail) / H;
      assert.ok(air >= (hat ? 0.06 : 0.1), `${label}: ${(air * 100).toFixed(1)}% of air under the tail`);
    }
  }
  // No lifting rig, no change; a future lifting rig frames itself from FX_LIFT alone.
  assert.deepEqual(plain(reg.liftFraming({ rigs: [{ slot: 'head_item', key: 'reef_halo' }] }, 390, 430)), { scale: 1, shift: 0, lift: 1 });
  assert.ok(reg.FX_FLOATS.jetpack, 'FX_FLOATS follows FX_LIFT');
  // A stage with sky to spare keeps the shark full size: the lift uses the room first.
  assert.equal(reg.liftFraming(fxJet, 200, 226, 120).scale, 1);
  assert.ok(reg.liftFraming(fxJet, 200, 226, 0).scale < 1);
  // Hat headroom is reserved only when a head piece is worn.
  assert.ok(reg.liftFraming(fxJet, 200, 226, 0, false, false).scale > reg.liftFraming(fxJet, 200, 226, 0, false, true).scale);
  assert.equal(reg.liftScaleFor(500), 1);
  assert.equal(reg.liftScaleFor(60), 0.5, 'small cards float half as high');
});

test('the jetpack motion and its framing read the same lift numbers', () => {
  const code = src('src/fx/rigs/Jetpack.tsx');
  assert.match(code, /const LIFT = FX_LIFT\.jetpack!;/);
  assert.doesNotMatch(code, /0\.09 \+ 0\.011/, 'no second copy of the lift numbers');
  const layers = src('src/fx/FxLayers.tsx');
  assert.match(layers, /liftFraming\(props\.fx, props\.width, props\.height, props\.room \?\? 0, props\.floored \?\? false, props\.hat \?\? true\)/);
  // Release 2.1: the float line also carries the wave 2 kit move (secret-shop-more).
  assert.match(layers, /\{ translateY: w \* shift \},\s*\{ scale: 1 - w \* \(1 - scale\) \},\s*\{ translateY: \(w > 0 \? w \* lift \* jetpackFloat\(t\.value, kick\.value, height\) : 0\) \+ kitMove\.y \* height \}/);
  // The pumpkin pack floats on jetpackFloat, so it frames with its own FX_LIFT row.
  assert.match(src('src/fx/registry.ts'), /pumpkin_pack: \{ rest: 0\.09, bob: 0\.011, boost: 0\.033, lean: 2\.3 \}/);
  assert.match(src('src/components/Playercard.tsx'), /<FxFloat fx=\{fx\} t=\{fxClock\} kick=\{fxKick\} width=\{stageW\} height=\{stageH\} room=\{liftRoom\} floored=\{!!shadowAt\} hat=\{!!inventory\?\.head_item\}>/);
});

test('a try-on stage is never empty on open: a bundled shark stands in, and the look is prefetched', () => {
  const card = src('src/components/Playercard.tsx');
  assert.match(card, /placeholder=\{index === 0 \? CLASSIC_NO_EYE : undefined\}/, 'the base shark has a local placeholder');
  const shelves = src('src/screens/StoreScreen/ShopShelves.tsx');
  assert.match(shelves, /s\.items\.map\(i => i\.paper_url\)/, 'every piece on the shelves is prefetched');
  assert.match(shelves, /player\?\.inventory\?\.skin_item\?\.no_eye_url, \.\.\.outfitLayerUrls\(player\?\.inventory\)/, "the player's own shark is prefetched");
});
