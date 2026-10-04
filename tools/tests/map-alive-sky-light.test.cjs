'use strict';
// Living map, part 3: time-of-day lighting from the real sun over the park.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const sky = loadTs('src/components/map/alive/skyLight.ts');
const ORLANDO = { latitude: 28.4177, longitude: -81.5812 };
const ANAHEIM = { latitude: 33.8121, longitude: -117.919 };
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual.toFixed(2)} vs ${expected}`);

test('sun elevation matches the real sky (Orlando and Anaheim, Sep 30 2026)', () => {
  // Solar noon in Orlando is ~1:25 PM EDT; the sun stands ~59 degrees up in late September.
  near(sky.sunElevation(Date.parse('2026-09-30T17:25:00Z'), ORLANDO.latitude, ORLANDO.longitude), 58.6, 1, 'Orlando noon');
  // Sunset (-0.83 degrees) in Orlando is ~7:13 PM EDT, in Anaheim ~6:36 PM PDT.
  near(sky.sunElevation(Date.parse('2026-09-30T23:13:00Z'), ORLANDO.latitude, ORLANDO.longitude), -0.83, 0.6, 'Orlando sunset');
  near(sky.sunElevation(Date.parse('2026-10-01T01:36:00Z'), ANAHEIM.latitude, ANAHEIM.longitude), -0.83, 0.6, 'Anaheim sunset');
  assert.ok(sky.sunElevation(Date.parse('2026-10-01T05:00:00Z'), ORLANDO.latitude, ORLANDO.longitude) < -40, 'Orlando 1 AM');
  assert.equal(sky.sunElevation(new Date('2026-09-30T17:25:00Z'), 0, 0), sky.sunElevation(Date.parse('2026-09-30T17:25:00Z'), 0, 0));
});

test('the phase follows the local sun, whatever the device time zone', () => {
  const at = (iso, place) => sky.skyLightAt(Date.parse(iso), place).phase;
  assert.equal(at('2026-09-30T17:00:00Z', ORLANDO), 'day', '1 PM in Orlando');
  assert.equal(at('2026-09-30T22:40:00Z', ORLANDO), 'golden', '6:40 PM in Orlando');
  assert.equal(at('2026-09-30T23:25:00Z', ORLANDO), 'dusk', '7:25 PM in Orlando');
  assert.equal(at('2026-10-01T01:00:00Z', ORLANDO), 'night', '9 PM in Orlando');
  // The same instant is still golden hour in Anaheim (6 PM PDT).
  assert.equal(at('2026-10-01T01:00:00Z', ANAHEIM), 'golden');
  assert.equal(at('2026-10-01T04:00:00Z', ANAHEIM), 'night', '9 PM in Anaheim');
  assert.equal(sky.skyLightAt(Date.now(), null), sky.DAYLIGHT, 'no position: daylight');
  assert.equal(sky.skyLightAt(Date.now(), { latitude: Number.NaN, longitude: 1 }), sky.DAYLIGHT);
});

test('lighting eases with the sun: lamps come up, daytime life fades, no jumps', () => {
  let prev = sky.lightForElevation(40);
  assert.equal(prev.tint.opacity, 0, 'midday leaves the map untouched');
  assert.equal(prev.lamps, 0);
  for (let e = 39.5; e >= -30; e -= 0.5) {
    const l = sky.lightForElevation(e);
    assert.ok(l.lamps >= prev.lamps, `lamps never dim as the sun sets (${e})`);
    assert.ok(l.clouds <= prev.clouds && l.birds <= prev.birds, `daytime life fades (${e})`);
    assert.ok(l.fireflies >= prev.fireflies, `fireflies come out (${e})`);
    for (const key of ['wash', 'vignette', 'lamps', 'clouds', 'birds', 'glints', 'fireflies']) {
      assert.ok(Math.abs(l[key] - prev[key]) <= 0.065, `${key} eases at ${e}`);
    }
    assert.ok(Math.abs(l.tint.opacity - prev.tint.opacity) <= 0.031, `tint eases at ${e}`);
    prev = l;
  }
  const night = sky.lightForElevation(-20);
  assert.equal(night.lamps, 1);
  assert.equal(night.clouds, 0);
  assert.equal(night.phase, 'night');
  const golden = sky.lightForElevation(5);
  assert.ok(golden.wash > 0.5 && golden.tint.color !== '#ffffff', 'golden hour is warm');
});

test('legibility: the tint never darkens the tiles past the cap', () => {
  for (let e = -90; e <= 90; e += 0.5) {
    const l = sky.lightForElevation(e);
    assert.ok(l.tint.opacity <= sky.MAX_TINT_OPACITY && l.tint.opacity >= 0);
    assert.match(l.tint.color, /^#[0-9a-f]{6}$/);
    for (const key of ['wash', 'vignette', 'lamps', 'clouds', 'birds', 'glints', 'fireflies']) assert.ok(l[key] >= 0 && l[key] <= 1);
  }
  assert.ok(sky.MAX_TINT_OPACITY <= 0.4, 'paths and water still read at night');
});

test('the map tints tiles under the pins and lights lamps only after sunset', () => {
  const map = fs.readFileSync(path.join(__dirname, '../../src/components/Map.tsx'), 'utf8');
  const tint = map.indexOf('<FillLayer id="tps-sky-tint"');
  const children = map.indexOf('{children}</MapQueryContext.Provider>');
  assert.ok(tint > 0 && tint < children, 'tint is a GL layer; pins (marker views) draw above it');
  // Always mounted (empty by day): no source mounts mid-list (MapLibre insertReactSubview crash).
  assert.match(map, /<ShapeSource id="tps-lamps" shape=\{light\.lamps >= 0\.05 \? lampPoints : NO_FEATURES\}>/);
  assert.match(map, /const light = useMemo\(\(\) => lightForElevation\(sun\), \[sun\]\)/);
});

test('night lamps line the walkways on screen, spaced out, capped and stable', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/components/map/decorations.ts'), 'utf8');
  const stubs = Object.fromEntries([...src.matchAll(/require\('([^']+\.png)'\)/g)].map(([, spec]) => [spec, 1]));
  const deco = loadTs('src/components/map/decorations.ts', stubs);
  const walk = { type: 'Feature', properties: { class: 'path' }, geometry: { type: 'LineString', coordinates: [[-81.5830, 28.4185], [-81.5790, 28.4185]] } };
  const b = { north: 28.4200, south: 28.4170, east: -81.5780, west: -81.5840 };
  const lamps = deco.buildLampPoints([walk], b, 17.5);
  // ~390 m of path at one lamp per ~28 m.
  assert.ok(lamps.features.length >= 12 && lamps.features.length <= 15, `${lamps.features.length} lamps`);
  for (const f of lamps.features) near(f.geometry.coordinates[1], 28.4185, 1e-9, 'on the path');
  assert.deepEqual(JSON.stringify(deco.buildLampPoints([walk], b, 17.5)), JSON.stringify(lamps), 'stable across rebuilds');
  assert.equal(deco.buildLampPoints([walk], b, 17.5, 5).features.length, 5, 'capped');
  assert.equal(deco.buildLampPoints([walk], b, 15).features.length, 0, 'zoomed out: no lamps');
});
