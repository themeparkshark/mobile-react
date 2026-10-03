'use strict';
// P0 guard: MapLibre crashes (NSRangeException in -[MLRNMapView insertReactSubview:atIndex:]) when
// Marker children inside MapView mount, unmount or reorder at runtime. The fright layer keeps a fixed,
// keyed Marker set for a payload, draws hidden spots as an invisible stand-in, and sits LAST in MapView.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const budget = loadTs('src/components/map/fright/frightBudget.ts');

const spot = (key, kind, fx = null) => ({ key, kind, name: key, blurb: '', latitude: 28.47, longitude: -81.46, radius: 60,
  walk_minutes: 5, status: null, posted_minutes: null, accepting: true, fan_rank: null, sort: 0, fx, art: null });

test('the marker set is a pure function of the payload: same keys in the same order, whatever the input order', () => {
  const a = [spot('h-b', 'haunt'), spot('r-a', 'reef', { props: ['bats'] }), spot('h-a', 'haunt'), spot('s', 'show', { props: ['bats'] })];
  const b = [a[3], a[2], a[1], a[0]];
  const keys = s => JSON.parse(JSON.stringify(s.all.map(x => x.key)));
  assert.deepEqual(keys(budget.stableMarkerSpots(a)), keys(budget.stableMarkerSpots(b)));
  assert.deepEqual(keys(budget.stableMarkerSpots(a)), ['r-a', 'r-a', 's', 'h-a', 'h-b'], 'reefs, then prop spots, then haunts, each by key');
  assert.deepEqual(JSON.parse(JSON.stringify(budget.stableMarkerSpots(a).haunts.map(x => x.key))), ['h-a', 'h-b']);
});

test('FrightMapSources never mounts or unmounts a Marker: no early return, no conditional Marker, no ranked order', () => {
  const src = read('src/components/map/fright/FrightMapSources.tsx');
  const body = src.slice(src.indexOf('export const FrightMapSources'), src.indexOf('export const FrightNightTint'));
  assert.doesNotMatch(body, /if \(visible <= 0\) return null/, 'no whole-layer unmount on fade');
  assert.doesNotMatch(body, /&&\s*\(\s*<Marker/, 'no conditional Marker');
  assert.doesNotMatch(body, /&& <Marker/, 'no conditional Marker');
  assert.doesNotMatch(body, /\.map\([^)]*\) => \{[^}]*return null;/s, 'no Marker dropped inside a map()');
  assert.match(body, /stable\.reefs\.map/);
  assert.match(body, /stable\.props\.map/);
  assert.match(body, /stable\.haunts\.map/);
  assert.match(body, /<Marker key="fe"/, 'one encounter Marker, always mounted');
  assert.match(body, /<HiddenSpot \/>/);
  assert.doesNotMatch(body, /\{haunts\.map|\{reefs\.map|\{propSpots\.map/, 'culled/ranked lists never drive Markers');
});

test('Map.tsx: the night tint is always mounted and the fright markers are the last MapView child', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /<FrightNightTint input=\{fright\} \/>/);
  const close = map.indexOf('</MapView>');
  const sources = map.lastIndexOf('<FrightMapSources', close);
  const shark = map.lastIndexOf('{location && (', close);
  assert.ok(sources > shark && sources < close, 'fright markers come after every other MapView child');
  assert.equal(map.match(/<FrightMapSources/g).length, 1);
});

test('ExploreScreen keeps the fright input for the whole event-park session (mode on/off fades, never remounts)', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.doesNotMatch(explore, /frightNight\.tonight && \(frightNight\.modeOn \|\| frightNight\.phase === 'after'\)/);
  assert.match(explore, /active: frightNight\.modeOn/);
});
