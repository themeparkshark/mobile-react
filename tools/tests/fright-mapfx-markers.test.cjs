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

test('night tint: one stable component in its MapView slot whether fright is null or set (no component swap mid-list)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src/components/map/fright/FrightMapSources.tsx'), 'utf8');
  const start = src.indexOf('export const FrightNightTint');
  assert.ok(start >= 0, 'FrightNightTint exists');
  const body = src.slice(start, src.indexOf('});', start));
  // Exactly one element is returned, always TintSource; nothing picks a component by input.
  assert.equal((body.match(/return /g) || []).length, 1, 'one return');
  assert.match(body, /return <TintSource /);
  assert.doesNotMatch(body, /\?\s*<|:\s*<[A-Z]|&&\s*<|ActiveTint/, 'no ternary or && between components');
  assert.match(body, /useFrightState\(input \?\? TINT_OFF_INPUT\)/, 'hook runs the same way for null input');
  assert.doesNotMatch(src, /function ActiveTint/, 'the swapped-in component is gone');
  // Map.tsx renders the tint unconditionally.
  const map = fs.readFileSync(path.join(__dirname, '..', '..', 'src/components/Map.tsx'), 'utf8');
  assert.match(map, /\n\s*<FrightNightTint input=\{fright\} \/>/);
  assert.doesNotMatch(map, /fright\s*&&\s*<FrightNightTint/);
});

test('map GL sources are always mounted (lamps, crowd haze, guide line): off means empty data, never a conditional mount mid-list', () => {
  const map = fs.readFileSync(path.join(__dirname, '..', '..', 'src/components/Map.tsx'), 'utf8');
  for (const id of ['tps-lamps', 'tps-crowd-haze', 'tps-guide']) {
    const at = map.indexOf(`<ShapeSource id="${id}"`);
    assert.ok(at > 0, `${id} source exists`);
    // The JSX just before the source must not be a condition (`x && (` or `x ? (`).
    const before = map.slice(Math.max(0, at - 120), at);
    assert.doesNotMatch(before, /&&\s*\(\s*$|\?\s*\(\s*$/, `${id} must not mount conditionally`);
    assert.equal((map.match(new RegExp(`<ShapeSource id="${id}"`, 'g')) || []).length, 1, `${id} has one source`);
  }
  assert.match(map, /<ShapeSource id="tps-lamps" shape=\{light\.lamps >= 0\.05 \? lampPoints : NO_FEATURES\}>/);
  assert.match(map, /<ShapeSource id="tps-crowd-haze" shape=\{crowdHaze \?\? NO_FEATURES\}>/);
  assert.match(map, /<ShapeSource id="tps-guide" shape=\{guideTarget && location && pathShown \? guideLine\(location, guideTarget\) : NO_FEATURES\}>/);
  assert.doesNotMatch(map, /(lampPoints|crowdHaze|pathShown)[^\n]*&&\s*\(\s*\n\s*<ShapeSource/);
});

test('the player shark is one always-mounted Marker: parked hidden without a location, never mounted mid-list', () => {
  const map = read('src/components/Map.tsx');
  assert.doesNotMatch(map, /\{location && \(\s*<(Gliding)?Marker/);
  assert.match(map, /<PlayerSharkMarker target=\{location \?\? null\}/);
  const marker = read('src/components/map/Marker.tsx');
  assert.match(marker, /hidden = false/);
});

test('Marker re-sends its anchor after layout (iOS drops an anchor that arrives on a zero frame)', () => {
  const marker = read('src/components/map/Marker.tsx');
  assert.match(marker, /anchor=\{laidOut \? a : \{ x: a\.x, y: a\.y \+ ANCHOR_NUDGE \}\}/);
  assert.match(marker, /<Pressable onLayout=\{onLayout\}/);
  assert.match(marker, /<View onLayout=\{onLayout\}/);
  // Hooks run before the invalid-coordinate early return.
  assert.ok(marker.indexOf('useState(false)') < marker.indexOf('return null'));
});
