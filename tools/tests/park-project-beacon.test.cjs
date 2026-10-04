const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const stub = new Proxy({}, { get: (_t, key) => key === '__esModule' ? true : () => null });
const beacon = loadTs('src/screens/ExploreScreen/ParkProjectMapBeacon.tsx', {
  react: { useEffect: () => undefined, useState: v => [v, () => undefined] }, 'react-native': { StyleSheet: { create: s => s }, Text: 'Text', View: 'View' },
  '../../components/map/Circle': stub, '../../components/map/Marker': stub, '../../ui': stub, 'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
});

const center = { latitude: 34.1381, longitude: -118.3534 };
const meters = (a, b) => {
  const r = Math.PI / 180, dLat = (b.latitude - a.latitude) * r, dLng = (b.longitude - a.longitude) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

test('the Park Story beacon stays put when no ride island is near', () => {
  assert.deepEqual(beacon.placeBeacon(center, [{ latitude: 34.14, longitude: -118.35 }]), center);
});

test('the beacon nudges off a ride island it would cover', () => {
  const island = { latitude: 34.13812, longitude: -118.35338 };
  const spot = beacon.placeBeacon(center, [island]);
  assert.ok(meters(spot, island) >= 70, `clear of the island (${meters(spot, island)} m)`);
  assert.ok(meters(spot, center) <= 3 * 70 + 1, 'stays near its story location');
});

test('the beacon draws after the ride islands and its label sits on its own tag', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  assert.ok(src.indexOf('<ParkProjectMapBeacon') > src.indexOf('<TaskMarker'), 'rendered after TaskMarker');
  // Always mounted (parked with no project here): MapView children never mount mid-list.
  assert.match(src, /<ParkProjectMapBeacon project=\{activeParkProject\?\.park_id === park\.id \? activeParkProject : null\} avoid=\{beaconAvoid\}/);
  const own = fs.readFileSync(path.join(__dirname, '../../src/screens/ExploreScreen/ParkProjectMapBeacon.tsx'), 'utf8');
  assert.match(own, /labelTag: \{[^}]*backgroundColor: '#ffffff'/);
});

test('Park Story pill text all uses his fonts', () => {
  const own = fs.readFileSync(path.join(__dirname, '../../src/screens/ExploreScreen/ParkProjectWidget.tsx'), 'utf8');
  for (const name of ['pillKicker', 'pillTitle', 'pillProgress']) {
    assert.match(own, new RegExp(`${name}: \\{[^}]*fontFamily`), name);
  }
});
