'use strict';
// Living map, part 1: the ambient budget (tiers, frame governor, sprite caps) and water glints.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const budget = loadTs('src/components/map/alive/ambientBudget.ts');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// decorations.ts requires its tree PNGs; stub every asset import.
const decoSource = read('src/components/map/decorations.ts');
const pngStubs = Object.fromEntries([...decoSource.matchAll(/require\('([^']+\.png)'\)/g)].map(([, spec]) => [spec, 1]));
const deco = loadTs('src/components/map/decorations.ts', pngStubs);

test('tiers: Reduce Motion is always calm; strain steps full -> lite -> calm', () => {
  assert.equal(budget.aliveTier({ reducedMotion: false, strain: 0 }), 'full');
  assert.equal(budget.aliveTier({ reducedMotion: false, strain: 1 }), 'lite');
  assert.equal(budget.aliveTier({ reducedMotion: false, strain: 2 }), 'calm');
  assert.equal(budget.aliveTier({ reducedMotion: true, strain: 0 }), 'calm');
  assert.equal(budget.ALIVE_CAPS.calm.hz, 0, 'calm freezes the ambient clock');
  assert.equal(budget.ALIVE_CAPS.lite.hz, 30, 'lite halves the ambient clock');
});

test('particle budget: every tier stays under the hard sprite ceiling and lite is lighter than full', () => {
  const { full, lite, calm } = budget.ALIVE_CAPS;
  for (const caps of [full, lite, calm]) {
    assert.ok(budget.ambientSpriteBudget(caps) <= budget.MAX_AMBIENT_SPRITES, `${budget.ambientSpriteBudget(caps)} sprites`);
  }
  assert.ok(budget.ambientSpriteBudget(lite) < budget.ambientSpriteBudget(full) * 0.6);
  assert.equal(budget.ambientSpriteBudget(calm), 0, 'calm moves nothing');
  for (const key of Object.keys(full)) {
    if (key === 'hz') continue;
    assert.ok(lite[key] <= full[key], `${key}: lite never exceeds full`);
    assert.ok(calm[key] <= lite[key] || key === 'ghosts', `${key}: calm never exceeds lite`);
  }
});

test('only the nearest islands spend animation', () => {
  assert.equal(budget.withinBudget(0, 4), true);
  assert.equal(budget.withinBudget(3, 4), true);
  assert.equal(budget.withinBudget(4, 4), false);
  assert.equal(budget.withinBudget(undefined, 4), true, 'a lone preview island animates');
  assert.equal(budget.withinBudget(0, 0), false, 'a zero cap animates nothing');
});

test('frame governor: two slow windows step down, a long smooth stretch steps back up', () => {
  let g = budget.GOVERNOR_START;
  g = budget.governFrames(g, 25, 0);
  assert.equal(g.strain, 0, 'one slow window is a blip');
  g = budget.governFrames(g, 25, 2000);
  assert.equal(g.strain, 1, 'sustained ~40 fps drops to lite');
  g = budget.governFrames(g, 20, 4000);
  assert.equal(g.strain, 1, 'in-between frames hold the tier');
  for (let i = 0; i < 14; i++) g = budget.governFrames(g, 16.7, 6000 + i * 2000);
  assert.equal(g.strain, 1, '28 s is not yet long enough');
  g = budget.governFrames(g, 16.7, 40000);
  assert.equal(g.strain, 0, '30 s of smooth 60 fps restores full');
  // A slow window resets the healthy streak.
  g = budget.governFrames(budget.GOVERNOR_START, 25, 0);
  g = budget.governFrames({ ...g, healthy: 10 }, 25, 1);
  assert.equal(g.healthy, 0);
});

test('frame governor: heavy jank goes calm one tier at a time, then probes lite again after a rest', () => {
  let g = budget.GOVERNOR_START;
  for (let i = 0; i < 2; i++) g = budget.governFrames(g, 40, i * 1000);
  assert.equal(g.strain, 1, 'first full -> lite');
  for (let i = 0; i < 2; i++) g = budget.governFrames(g, 40, 2000);
  assert.equal(g.strain, 2, 'under 30 fps even lite is too much');
  assert.equal(g.calmSince, 2000);
  assert.equal(budget.governIdle(g, 60000).strain, 2);
  assert.equal(budget.governIdle(g, 2000 + budget.CALM_PROBE_MS).strain, 1, 'probes lite after the rest');
  // Lite on a busy (~40 fps) map stays lite: the ambient life is not the cause.
  let lite = { strain: 1, slow: 0, healthy: 0, calmSince: null };
  lite = budget.governFrames(budget.governFrames(lite, 24, 0), 24, 2000);
  assert.equal(lite.strain, 1);
  assert.equal(budget.governFrames(g, Number.NaN, 0), g, 'a bad sample is ignored');
});

test('hash01 is deterministic noise in [0, 1)', () => {
  const values = Array.from({ length: 200 }, (_, i) => budget.hash01(i));
  assert.ok(values.every(v => v >= 0 && v < 1));
  assert.equal(budget.hash01(42), budget.hash01(42));
  assert.ok(new Set(values.map(v => v.toFixed(3))).size > 150, 'spread out');
});

const square = (lat, lng, half) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[
  [lng - half, lat - half], [lng + half, lat - half], [lng + half, lat + half], [lng - half, lat + half], [lng - half, lat - half]]] } });

test('water glints sit only on water, nearest the middle of the view, capped and stable', () => {
  const lake = square(28.4185, -81.5812, 0.0008);
  const b = { north: 28.4205, south: 28.4165, east: -81.5782, west: -81.5842 };
  const glints = deco.buildWaterGlints([lake], b, 17.5, 6);
  assert.equal(glints.length, 6);
  for (const g of glints) {
    assert.ok(Math.abs(g.latitude - 28.4185) <= 0.0008 && Math.abs(g.longitude + 81.5812) <= 0.0008, 'inside the lake');
  }
  assert.deepEqual(plain(deco.buildWaterGlints([lake], b, 17.5, 6)), plain(glints), 'same spots every rebuild');
  assert.equal(deco.buildWaterGlints([lake], b, 17.5, 0).length, 0);
  assert.equal(deco.buildWaterGlints([], b, 17.5, 6).length, 0, 'no water, no glints');
  assert.equal(deco.buildWaterGlints([lake], b, 15, 6).length, 0, 'zoomed far out the map stays calm');
  // A lake off to the side loses to one in the middle.
  const side = square(28.4170, -81.5790, 0.0002);
  const mid = square(28.4185, -81.5812, 0.0002);
  const near = deco.buildWaterGlints([side, mid], b, 18.5, 2);
  for (const g of near) assert.ok(Math.abs(g.latitude - 28.4185) <= 0.0002, 'the middle lake glints first');
});

test('the map shares one ambient clock and pauses it with the screen, the app and covering flows', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /useMapAliveEngine\(\{ focused: screenFocused, paused: ambientPaused/);
  assert.match(map, /<MapAliveProvider value=\{alive\}>/);
  const engine = read('src/components/map/alive/MapAliveContext.tsx');
  assert.match(engine, /AppState\.addEventListener/);
  assert.match(engine, /const active = focused && appActive;\s*const running = active && !paused && caps\.hz > 0/);
  assert.match(engine, /frame\.setActive\(running\)/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /ambientPaused=\{redeemFlowOpen \|\| bossOccluded \|\| adventureOccluded \|\| dailyGiftOccluded\}/);
  assert.match(explore, /aliveRank=\{aliveRanks\.get\(task\.id\)\}/);
});
