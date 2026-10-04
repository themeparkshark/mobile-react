'use strict';
// Fin-ister Nights map FX with server art: slug lookups, sheet frames, window
// flicker timelines, Chaos Hour, the shared image cache and the 2-event gate.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const fa = loadTs('src/components/map/fright/frightAssets.ts');
const ev = loadTs('src/components/map/fright/events.ts');
const critters = loadTs('src/components/map/fright/critters.ts');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const sheet = { sheet: 'https://cdn/x.webp', static: 'https://cdn/x-static.webp', frame: [128, 128], rows: ['idle', 'lurk', 'jump'], frames_per_row: 10, fps: 10 };
const assets = {
  critters: { 'barker-crab': sheet, broken: { sheet: null, static: null, frame: [128, 128], rows: [] } },
  icons: { chuckles: { ...sheet, frame: [160, 160], rows: ['idle loop', 'appear one-shot', 'chaos-hour loop'] } },
  haunts: { 'h01-x': { layers: { frame: [160, 160], base: 'https://cdn/b.webp', windows: 'https://cdn/w.webp', window_count: 3 } },
    'h02-nobase': { layers: { frame: [160, 160], base: null } } },
  ambient: { moon: { file: 'https://cdn/moon.webp' } },
};

test('lookups go by slug and fall back to null (placeholder) when art is missing', () => {
  assert.equal(fa.critterAsset(assets, 'barker-crab').sheet, 'https://cdn/x.webp');
  assert.equal(fa.critterAsset(assets, 'nope'), null);
  assert.equal(fa.critterAsset(assets, 'broken'), null);
  assert.equal(fa.critterAsset(null, 'barker-crab'), null);
  assert.equal(fa.hauntLayers(assets, { fx: { art: 'h01-x' } }).window_count, 3);
  assert.equal(fa.hauntLayers(assets, { fx: { art: 'h02-nobase' } }), null);
  assert.equal(fa.hauntLayers(assets, { fx: null }), null);
  assert.equal(fa.iconAsset(assets, 'chuckles').frame[0], 160);
  assert.equal(fa.ambientUrl(assets, 'moon'), 'https://cdn/moon.webp');
  assert.equal(fa.ambientUrl(assets, 'crow'), null);
});

test('sheet geometry: rows by name, timing capped at 10 fps, @2x to points', () => {
  assert.equal(fa.rowIndex(sheet, 'jump'), 2);
  assert.equal(fa.rowIndex(assets.icons.chuckles, 'appear'), 1);
  assert.equal(fa.rowIndex(assets.icons.chuckles, 'chaos-hour'), 2);
  assert.equal(fa.rowIndex(sheet, 'dance'), -1);
  assert.deepEqual({ ...fa.sheetTiming({ frames_per_row: 10, fps: 24 }) }, { frames: 10, fps: 10 });
  assert.deepEqual({ ...fa.sheetTiming({}) }, { frames: 10, fps: 10 });
  assert.deepEqual({ ...fa.pointSize([128, 128]) }, { w: 64, h: 64 });
});

test('critter sheet frames: idle by default, lurk loops (not in lite), a jump plays its row once', () => {
  const rows = [0, 1, 2];
  const seen = new Set();
  for (let t = 0; t < 120; t += 0.1) {
    const p = critters.sheetPose(4, t, 10, 10, rows, true, -1);
    assert.ok(p.frame >= 0 && p.frame < 10);
    seen.add(p.row);
  }
  assert.deepEqual([...seen].sort(), [0, 1], 'idle and lurk, no jump on its own');
  for (let t = 0; t < 120; t += 0.1) assert.equal(critters.sheetPose(4, t, 10, 10, rows, false, -1).row, 0, 'lite: idle only');
  assert.deepEqual({ ...critters.sheetPose(4, 5, 10, 10, rows, true, 0.35) }, { row: 2, frame: 3 });
  assert.equal(critters.sheetPose(4, 5, 10, 10, rows, true, 1.0).row !== 2, true, 'cuts back after one row');
  assert.equal(critters.sheetPose(4, 5, 10, 10, [0, -1, -1], true, 0.3).row, 0, 'a sheet without a jump row stays idle');
});

test('window flicker timelines: in spec ranges, never all dark, deterministic', () => {
  for (const [seed, n] of [[1, 3], [42, 2], [7, 4], [99, 1]]) {
    const lines = fa.windowTimelines(seed, n);
    assert.equal(lines.length, n);
    assert.deepEqual(fa.windowTimelines(seed, n), lines);
    for (let t = 0; t < fa.WINDOW_PERIOD_S; t += 0.01) {
      assert.ok(lines.some(toggles => fa.timelineLit(toggles, t)), `all dark at ${t} (seed ${seed})`);
    }
    for (const toggles of lines) {
      if (n > 1) assert.ok(toggles.length > 4, 'it flickers');
      else assert.equal(toggles.length, 0, 'a lone window always stays lit');
      assert.ok(fa.timelineLit(toggles, 0), 'starts lit');
      // Off stretches are a short blip (40 to 120 ms, possibly cut shorter where the
      // first window covers an all-dark moment) or a dark rest of 1 to 4 s (merged at most).
      for (let i = 0; i + 1 < toggles.length; i += 2) {
        const off = toggles[i + 1] - toggles[i];
        assert.ok(off >= 0.009 && off <= 4.6, `off ${off}`);
      }
    }
  }
  assert.equal(fa.windowTimelines(1, 0).length, 0);
  assert.equal(fa.timelineLit([], 12), true);
});

test('Chaos Hour: an encounter window holding 11:11 PM park time', () => {
  assert.equal(fa.isChaosHour('2026-10-09T23:08:00-04:00', '2026-10-09T23:15:00-04:00'), true);
  assert.equal(fa.isChaosHour('2026-10-09T21:00:00-04:00', '2026-10-09T21:07:00-04:00'), false);
  assert.equal(fa.isChaosHour('2026-10-09T23:58:00-04:00', '2026-10-10T00:05:00-04:00'), false);
  assert.equal(fa.isChaosHour('bad', 'bad'), false);
});

test('image cache: one load per URL, shared; failures retry at most once a minute', async () => {
  let now = 0;
  const calls = [];
  let fail = true;
  const cache = fa.createImageCache(url => { calls.push(url); return Promise.resolve(fail ? null : { url }); }, () => now);
  let notified = 0;
  cache.subscribe(() => notified++);
  assert.equal(cache.get('a'), null);
  assert.equal(cache.get('a'), null, 'in flight: no second fetch');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(calls.length, 1);
  assert.equal(notified, 1);
  assert.equal(cache.get('a'), null, 'failed: wait before retrying');
  assert.equal(calls.length, 1);
  now = fa.IMAGE_RETRY_MS;
  fail = false;
  cache.get('a');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(calls.length, 2);
  assert.deepEqual({ ...cache.get('a') }, { url: 'a' });
  assert.deepEqual({ ...cache.peek('a') }, { url: 'a' });
  assert.equal(cache.peek('b'), null, 'peek never loads');
  assert.equal(calls.length, 2);
  const rejecting = fa.createImageCache(() => Promise.reject(new Error('offline')), () => 0);
  rejecting.get('x');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(rejecting.get('x'), null);
  assert.equal(rejecting.loads(), 1);
});

test('event gate: at most 2 events on screen, the same event never doubles', () => {
  const gate = ev.createEventGate();
  assert.equal(gate.tryStart('a', 0, 1000), true);
  assert.equal(gate.tryStart('a', 10, 1000), false, 'already playing');
  assert.equal(gate.tryStart('b', 10, 1000), true);
  assert.equal(gate.tryStart('c', 20, 1000), false, 'a third waits');
  assert.equal(gate.active(20), 2);
  assert.equal(gate.tryStart('c', 1000, 1000), true, 'a slot frees up');
  assert.equal(ev.MAX_EVENTS, 2);
});

test('ambient events: spaced by their gaps, a third due waits 2 to 5 s, never over 2 at once', () => {
  const gate = ev.createEventGate();
  const sources = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, minGapMs: 5000, maxGapMs: 9000, durationMs: 3000 }));
  let next = {};
  let n = 0;
  const starts = {};
  for (let t = 0; t < 600_000; t += 250) {
    const r = ev.stepAmbient(next, sources, t, gate, 3, n);
    next = r.next;
    n = r.n;
    for (const id of r.started) (starts[id] ??= []).push(t);
    assert.ok(gate.active(t) <= 2);
  }
  for (const id of Object.keys(starts)) {
    const times = starts[id];
    assert.ok(times.length > 10, `${id} ran ${times.length}`);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 3000 + 2000, 'never back to back');
  }
});

test('wiring: sprites read server art by slug, through the shared cache, with bundled fallbacks', () => {
  const sprites = read('src/components/map/fright/FrightSprites.tsx');
  assert.match(sprites, /useRemoteImage\(asset\?\.sheet\)/);
  assert.match(sprites, /image\?\.width\(\) \?\? 0\) \/ 2/, '@2x sheets draw at half size');
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.match(sources, /critterAsset\(assets, slug\)/);
  assert.match(sources, /hauntLayers\(assets, h\)/);
  assert.match(sources, /frightEvents\.tryStart\(`jump:\$\{key\}`/);
  const layer = read('src/components/map/fright/FrightMapLayer.tsx');
  assert.match(layer, /useFrightImage\(assets\?\.fog_night\?\.fog_far, FRIGHT_ART\.fogFar\)/);
  assert.match(layer, /frightEvents\.tryStart\('bolt'/);
  const hook = read('src/components/map/fright/useFrightImage.ts');
  assert.match(hook, /createImageCache/);
  // No hard-coded critter or haunt slugs outside the fallback looks and the dev fixture.
  for (const file of ['FrightSprites.tsx', 'FrightMapSources.tsx', 'FrightMapLayer.tsx', 'frightAssets.ts']) {
    assert.doesNotMatch(read(`src/components/map/fright/${file}`), /barker-crab|h0\d-|juggler-octopus/, file);
  }
});
