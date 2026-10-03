'use strict';
// Fin-ister Nights map FX: tiers, budgets, intensity, LOD, culling and the Map wiring.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const budget = loadTs('src/components/map/alive/ambientBudget.ts');
const fb = loadTs('src/components/map/fright/frightBudget.ts');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const KEYS = ['frightCritters', 'frightFog', 'frightBats', 'frightWindows', 'frightBolts', 'frightProps'];

test('fright caps: full 8 critters, 3 fog, 4 bats; lite about half; calm moves nothing', () => {
  const { full, lite, calm } = budget.ALIVE_CAPS;
  assert.equal(full.frightCritters, 8);
  assert.equal(full.frightFog, 3);
  assert.equal(full.frightBats, 4);
  assert.deepEqual([lite.frightCritters, lite.frightFog, lite.frightBats], [4, 2, 2]);
  for (const key of KEYS) {
    assert.equal(calm[key], 0, `${key} calm`);
    assert.ok(lite[key] <= full[key]);
  }
  assert.equal(budget.frightSpriteBudget(calm), 0);
  assert.ok(budget.frightSpriteBudget(lite) <= budget.frightSpriteBudget(full) * 0.6);
});

test('worst case per tier, with fright on top, stays under the sprite ceiling', () => {
  const counts = Object.fromEntries(['full', 'lite', 'calm'].map(t => [t, fb.frightWorstCase(t)]));
  assert.deepEqual(counts, { full: 41, lite: 22, calm: 0 });
  for (const t of ['full', 'lite', 'calm']) {
    assert.ok(budget.ambientSpriteBudget(budget.ALIVE_CAPS[t]) <= budget.MAX_AMBIENT_SPRITES, t);
  }
  // Fright yields to the night show, so it never adds to the show's sparks.
  const full = budget.ALIVE_CAPS.full;
  assert.ok(budget.frightSpriteBudget(full) <= full.skyShowBursts * full.sparksPerBurst);
});

test('phase to intensity: early 40%, live full, after fades over 10 minutes', () => {
  const night = { closes_at: '2026-10-03T02:00:00-04:00' };
  const close = Date.parse(night.closes_at);
  assert.equal(fb.phaseIntensity('early', 0, night), 0.4);
  assert.equal(fb.phaseIntensity('live', 0, night), 1);
  assert.equal(fb.phaseIntensity('last_call', 0, night), 1);
  assert.equal(fb.phaseIntensity('off', 0, night), 0);
  assert.equal(fb.phaseIntensity('after', close, night), 1);
  assert.equal(fb.phaseIntensity('after', close + 5 * 60_000, night), 0.5);
  assert.equal(fb.phaseIntensity('after', close + 11 * 60_000, night), 0);
  assert.equal(fb.phaseIntensity('after', close, null), 0);
  // The fade only plays for a map that was showing the mode.
  const v = args => fb.frightVisibility({ serverNowMs: close + 60_000, night, ...args });
  assert.equal(v({ active: false, phase: 'after', wasActive: false }), 0);
  assert.ok(v({ active: false, phase: 'after', wasActive: true }) > 0.8);
  assert.equal(v({ active: false, phase: 'live', wasActive: true }), 0, 'left the park: off');
  assert.equal(v({ active: true, phase: 'early', wasActive: false }), 0.4);
});

test('tier: Spooky off, Reduce Motion and low battery go calm; Low Power Mode caps at lite', () => {
  const t = args => fb.frightTier({ alive: 'full', spooky: true, reducedMotion: false, ...args });
  assert.equal(t({}), 'full');
  assert.equal(t({ spooky: false }), 'calm');
  assert.equal(t({ reducedMotion: true }), 'calm');
  assert.equal(t({ batteryLevel: 0.15 }), 'calm');
  assert.equal(t({ batteryLevel: 0.5 }), 'full');
  assert.equal(t({ lowPower: true }), 'lite');
  assert.equal(t({ alive: 'lite' }), 'lite');
  assert.equal(t({ alive: 'calm' }), 'calm');
});

test('LOD and culling', () => {
  assert.equal(fb.critterLod(15.4), 'glyph');
  assert.equal(fb.critterLod(15.5), 'sprites');
  assert.equal(fb.critterLod(18), 'sprites');
  const b = { north: 28.48, south: 28.47, east: -81.46, west: -81.47 };
  assert.equal(fb.nearView({ latitude: 28.475, longitude: -81.465 }, b), true);
  assert.equal(fb.nearView({ latitude: 28.489, longitude: -81.465 }, b), true, 'within one screen');
  assert.equal(fb.nearView({ latitude: 28.495, longitude: -81.465 }, b), false, 'more than one screen off');
  assert.equal(fb.nearView({ latitude: 0, longitude: 0 }, null), true, 'unknown view keeps all');
  const fromVisible = fb.boundsFromVisible([[-81.46, 28.48], [-81.47, 28.47]]);
  assert.equal(fromVisible.north, 28.48);
  assert.equal(fb.boundsFromVisible(null), null);
});

test('allocation hands the shared cap to the nearest spots first', () => {
  const a = fb.allocate([['a', 3], ['b', 3], ['c', 3]], 8);
  assert.deepEqual({ ...a }, { a: 3, b: 3, c: 2 });
  assert.deepEqual({ ...fb.allocate([['a', 2]], 0) }, { a: 0 });
  const spots = [
    { key: 'far', latitude: 28.48, longitude: -81.47, sort: 0 },
    { key: 'near', latitude: 28.4755, longitude: -81.4677, sort: 1 },
  ];
  assert.deepEqual([...fb.rankSpots(spots, { latitude: 28.4754, longitude: -81.4677 })], ['near', 'far']);
  assert.equal(fb.critterWant({ critters: 9 }), 3);
  assert.equal(fb.critterWant(null), 2);
  assert.equal(fb.windowWant({ windows: 1 }), 2);
  assert.deepEqual([...fb.spotProps({ props: ['pumpkin', 'nope', 'bats', 'pumpkin'] })], ['bats', 'pumpkin']);
  assert.deepEqual([...fb.movingProps(['bats', 'eyes', 'fog-thick'])], ['eyes']);
});

test('night show yield reads show spot times', () => {
  const spots = [{ kind: 'show', times: ['2026-10-02T21:00:00-04:00'] }, { kind: 'haunt', times: null }];
  const start = Date.parse('2026-10-02T21:00:00-04:00');
  assert.equal(fb.showLiveFromSpots(spots, start - 1), false);
  assert.equal(fb.showLiveFromSpots(spots, start + 60_000), true);
  assert.equal(fb.showLiveFromSpots(spots, start + fb.SHOW_WINDOW_MS), false);
});

test('perf probe stats', () => {
  const s = fb.frameStats([16, 16, 17, 16, 40, 16, 16, 16, 16, 17, 16, 16, 16, 16, 16, 16, 16, 16, 16, 33]);
  assert.equal(s.n, 20);
  assert.equal(s.p95, 33);
  assert.ok(s.avg > 16 && s.avg < 20);
  assert.deepEqual({ ...fb.frameStats([]) }, { avg: 0, p95: 0, n: 0 });
});

test('Map wires the fright layer through one prop, and the layer pauses with the map', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /readonly fright\?: FrightMapInput \| null;/);
  assert.match(map, /\{fright && <FrightMapSources input=\{fright\} zoom=\{cameraZoom\} mapRef=\{mapViewRef\} \/>\}/);
  assert.match(map, /\{fright && viewSize && <FrightMapLayer input=\{fright\}/);
  const index = read('src/components/map/fright/index.ts');
  assert.match(index, /export type \{ FrightMapInput \}/);
  const state = read('src/components/map/fright/useFrightState.ts');
  assert.match(state, /const moving = alive\.running && tier !== 'calm'/);
  assert.match(state, /effectsOn = livePhase && input\.spooky && !quiet && tier !== 'calm' && alive\.active/);
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.match(sources, /aboveLayerID="tps-sky-tint"/, 'the night tint sits on the tiles, under every pin');
});

test('fright copy and art stay kid-safe and free of real event names', () => {
  const dir = path.join(root, 'src/components/map/fright');
  const banned = /halloween horror|\bhhn\b|jack the clown|oddfellow|stranger things|hellraiser|evil dead|chainsaw|blood|gore|\u2014/i;
  for (const file of fs.readdirSync(dir).filter(f => /\.(ts|tsx)$/.test(f))) {
    assert.doesNotMatch(read(`src/components/map/fright/${file}`), banned, file);
  }
  const sounds = path.join(root, 'assets/sounds/fright');
  const total = fs.readdirSync(sounds).reduce((sum, f) => sum + fs.statSync(path.join(sounds, f)).size, 0);
  assert.ok(total < 1_000_000, `fright sounds are ${total} bytes`);
});
