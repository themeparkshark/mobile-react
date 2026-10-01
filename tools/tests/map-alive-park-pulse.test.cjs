'use strict';
// Living map, part 2: the park pulse from live waits (glow, sleep, crowd haze).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const pulse = loadTs('src/components/map/alive/parkPulse.ts');
const ride = (wait, extra = {}) => ({ status: 'OPERATING', wait, typical: null, ...extra });
const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
const warmth = hex => channel(hex, 0) - (channel(hex, 1) + channel(hex, 2)) / 2; // red over green and blue

test('busier rides glow warmer, stronger and breathe faster', () => {
  const walkOn = pulse.waitGlow(ride(5));
  const normal = pulse.waitGlow(ride(40));
  const slammed = pulse.waitGlow(ride(90));
  assert.equal(walkOn.color, '#7fe4d6', 'a walk-on glows cool mint');
  assert.equal(slammed.color, '#ff6e40', 'a slammed ride glows warm coral');
  assert.ok(warmth(walkOn.color) < warmth(normal.color) && warmth(normal.color) < warmth(slammed.color));
  assert.ok(walkOn.strength < normal.strength && normal.strength < slammed.strength);
  assert.ok(walkOn.period > normal.period && normal.period > slammed.period);
  assert.ok(slammed.strength <= 0.8, 'never a blinding glow');
  assert.ok(slammed.period >= 1.8, 'never a strobe');
  // Monotonic over the whole range.
  let last = -1;
  for (let wait = 0; wait <= 180; wait += 5) {
    const b = pulse.rideBusyness(wait);
    assert.ok(b >= last && b >= 0 && b <= 1);
    last = b;
  }
});

test('a line far over its usual reads warmer than the same wait on a ride that is always busy', () => {
  assert.ok(pulse.rideBusyness(30, 10) > pulse.rideBusyness(30, 60));
  assert.equal(pulse.rideBusyness(30, null), pulse.rideBusyness(30));
  assert.equal(pulse.rideBusyness(30, 0), pulse.rideBusyness(30), 'an unknown typical is ignored');
});

test('no glow without a live operating wait', () => {
  assert.equal(pulse.waitGlow(null), null);
  assert.equal(pulse.waitGlow(undefined), null);
  assert.equal(pulse.waitGlow(ride(null)), null);
  assert.equal(pulse.waitGlow(ride(20, { status: 'DOWN' })), null);
  assert.equal(pulse.waitGlow(ride(20, { status: 'CLOSED' })), null);
});

test('down, closed, refurbishing and later-today rides sleep; open rides do not', () => {
  assert.equal(pulse.rideAsleep(ride(10, { status: 'DOWN' })), true);
  assert.equal(pulse.rideAsleep(ride(null, { status: 'CLOSED' })), true);
  assert.equal(pulse.rideAsleep(ride(null, { status: 'REFURBISHMENT' })), true);
  assert.equal(pulse.rideAsleep(ride(10), Date.now() + 3600_000), true, 'opens later today');
  assert.equal(pulse.rideAsleep(ride(10)), false);
  assert.equal(pulse.rideAsleep(undefined, null), false, 'no live data is not asleep');
});

test('crowd haze: only busy operating rides, weighted by how busy', () => {
  const at = (wait, status = 'OPERATING', latitude = 28.41, longitude = -81.58) => ({ status, wait, typical: null, latitude, longitude });
  const haze = pulse.crowdHaze([at(5), at(10), at(25), at(80), at(60, 'DOWN'), at(45, 'OPERATING', Number.NaN)]);
  assert.equal(haze.type, 'FeatureCollection');
  assert.deepEqual(plain(haze.features.map(f => f.properties.w)), [0.29, 1]);
  assert.deepEqual(plain(haze.features[0].geometry.coordinates), [-81.58, 28.41], 'GeoJSON is [lng, lat]');
  assert.equal(pulse.crowdHaze([]).features.length, 0);
});

test('islands wire the pulse in: glow from live data, sleepy z over resting rides, haze on the map', () => {
  const marker = fs.readFileSync(path.join(__dirname, '../../src/screens/ExploreScreen/TaskMarker.tsx'), 'utf8');
  assert.match(marker, /const glow = useMemo\(\(\) => resting \? null : waitGlow\(live\), \[live, resting\]\)/);
  assert.match(marker, /\{resting && <View pointerEvents="none" style=\{styles\.sleepy\}>/);
  const map = fs.readFileSync(path.join(__dirname, '../../src/components/Map.tsx'), 'utf8');
  assert.match(map, /<HeatmapLayer id="tps-crowd-haze"/);
  const explore = fs.readFileSync(path.join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.match(explore, /crowdHaze=\{parkHaze\}/);
});
