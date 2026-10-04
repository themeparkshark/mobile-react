// Crash guards for the in-park map (declutter R2):
//  - RN Skia: EXC_BAD_ACCESS in JsiDomDeclarationNode::invalidateContext while panning (Skia nodes that a
//    running clock animates were mounted and unmounted as tiers, budgets or placements changed).
//  - MapLibre: -[MLRNMapView insertReactSubview:atIndex:] when MapView children mount, unmount or reorder.
// Each guard keeps a fixed tree and changes only what is drawn.
const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

test('the sky overlay keeps one fixed Skia tree: tier, light and pause only change strengths', () => {
  const sky = read('src/components/map/alive/MapSkyOverlay.tsx');
  assert.match(sky, /Array\.from\(\{ length: SKY_MAX\.clouds \}/);
  assert.match(sky, /Array\.from\(\{ length: SKY_MAX\.birds \}/);
  assert.match(sky, /Array\.from\(\{ length: SKY_MAX\.fireflies \}/);
  assert.match(sky, /strength=\{i < clouds \? light\.clouds : 0\}/);
  assert.doesNotMatch(sky, /if \(!running \|\|/, 'a paused map keeps the canvas mounted');
});

test('Fin-ister art never mounts or unmounts animated Skia nodes on tier, budget or motion changes', () => {
  const layer = read('src/components/map/fright/FrightMapLayer.tsx');
  assert.doesNotMatch(layer, /fogNear && full &&/);
  assert.doesNotMatch(layer, /clouds && full &&/);
  assert.doesNotMatch(layer, /\{caps\.frightBolts > 0 && \(/);
  const sprites = read('src/components/map/fright/FrightSprites.tsx');
  assert.doesNotMatch(sprites, /ghostImg && ghosts && !dim &&/);
  assert.doesNotMatch(sprites, /take\(false\) && <SkidSparks/);
  assert.doesNotMatch(sprites, /animated && !lite && Array\.from\(\{ length: bats \}/);
  // Fixed at `slots`, count clamped to it (fright r3 opacity-only pass): the budget never adds a node.
  assert.match(sprites, /Array\.from\(\{ length: slots \}/, 'critter slots stay mounted');
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.match(sources, /const glyph = lod === 'glyph' \|\| st\.tier === 'calm';/, 'standing still does not swap the reef canvas');
});

test('the declutter only changes opacity and transforms; it never feeds a placement into Skia art', () => {
  const sources = read('src/components/map/fright/FrightMapSources.tsx');
  assert.doesNotMatch(sources, /placement\.visible/, 'no Skia prop follows a placement');
  const placed = read('src/components/map/declutter/Placed.tsx');
  assert.match(placed, /<Animated\.View pointerEvents=\{placement\.visible \? 'box-none' : 'none'\} style=\{fade\}>/);
});

test('MapView children never mount mid-list: sources always mounted, glints and trail are fixed pools, islands keep their order', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /<ShapeSource id="tps-lamps" shape=\{light\.lamps >= 0\.05 \? lampPoints : NO_FEATURES\}>/);
  assert.match(map, /<ShapeSource id="tps-crowd-haze" shape=\{crowdHaze \?\? NO_FEATURES\}>/);
  assert.match(map, /<ShapeSource id="tps-guide" shape=\{guideTarget && location && pathShown \? guideLine\(location, guideTarget\) : NO_FEATURES\}>/);
  const glints = read('src/components/map/alive/WaterGlints.tsx');
  assert.match(glints, /Array\.from\(\{ length: GLINT_SLOTS \}/);
  assert.match(glints, /key=\{`glint-\$\{slot\}`\}/);
  const trail = read('src/components/map/alive/SharkTrail.tsx');
  assert.match(trail, /Array\.from\(\{ length: TRAIL_SLOTS \}/);
  assert.match(trail, /key=\{`trail-\$\{slot\}`\}/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.doesNotMatch(explore, /clusterMarkers\(/, 'no zoom-driven fold that unmounts islands');
  assert.match(explore, /rideOrder\.current\.ids\.push\(task\.id\)/, 'new islands append');
});

test('the panned-away shark hides while its spot is off screen (iOS draws off-screen marker views at the top-left)', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /opacity: focusedOnPlayer \|\| !playerOnScreen \? 0 : 1/);
  assert.match(map, /checkPlayer\(feature\.properties\?\.visibleBounds\)/);
});

test('slot pools: a find keeps its slot while it lives, new finds take free slots, the pool never resizes', () => {
  const { assignSlots, SLOTS } = loadTs('src/components/map/markerSlots.ts', { react: { useRef: () => ({ current: [] }) } });
  let slots = assignSlots([], ['a', 'b', 'c'], 4);
  assert.deepEqual(plain(slots), ['a', 'b', 'c', null]);
  slots = assignSlots(slots, ['c', 'd', 'a'], 4);
  assert.deepEqual(plain(slots), ['a', 'd', 'c', null], 'b left; d took its slot; a and c never moved');
  slots = assignSlots(slots, ['a', 'c', 'd', 'e', 'f'], 4);
  assert.equal(slots.length, 4, 'a full pool waits instead of growing');
  assert.ok(SLOTS.coins >= 24 && SLOTS.rides >= 80);
});

test('the map\'s children are append-only: no conditional, filtered or keyed-by-data Marker list anywhere under <Map>', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  const block = explore.slice(explore.indexOf('<Map onPress='), explore.indexOf('</Map>'));
  assert.ok(block.length > 500);
  assert.doesNotMatch(block, /\.filter\(/, 'no filtered marker list (finds come and go in fixed slots)');
  assert.doesNotMatch(block, /\{[a-zA-Z?.()\s!&|=]+&&\s*(\(\s*)?<(TaskMarker|FindMarker|BossMarker|GymMarker|CommunityCenterMarker|SwordMarker|VaultMarker|ItemMarker|PinMarker|NightShowLayer|ParkProjectMapBeacon|BossMapDeparture|Circle|GhostSharks)/,
    'no marker mounts on a condition');
  for (const pool of ['rideSlots', 'coinSlots', 'keySlots', 'redeemableSlots', 'itemSlots', 'pinSlots', 'vaultSlots', 'swordSlots']) {
    assert.match(block, new RegExp(`\\{${pool}\\.map\\(`), pool);
  }
  assert.match(block, /key=\{`ride-\$\{slot\}`\}/, 'keyed by slot, never by the find or ride');
  const map = read('src/components/Map.tsx');
  const mapTree = map.slice(map.indexOf('<MapView'), map.indexOf('</MapView>'));
  assert.doesNotMatch(mapTree.replace(/\{fright && <FrightMapSources/, ''), /\{[^}]*&&\s*(\(\s*)?<(Marker|ShapeSource|BackgroundLayer)/,
    'the map\'s own children are always mounted');
  assert.ok(mapTree.indexOf('<FrightMapSources') > mapTree.indexOf('{children}'), 'the one late mount (Fin-ister) is the true last child');
  const marker = read('src/components/map/Marker.tsx');
  assert.doesNotMatch(marker, /return null/, 'a bad coordinate parks the marker instead of unmounting it');
});

test('no find ever shows 0:00: at its time it fades out and asks for fresh map data', () => {
  const life = read('src/screens/ExploreScreen/FindLife.tsx');
  const { findClock } = loadTs('src/screens/ExploreScreen/FindLife.tsx', {
    react: {}, 'react/jsx-runtime': { jsx() {}, jsxs() {} }, 'react-native-reanimated': {}, './parkMapLayout': {} });
  assert.equal(findClock(400), '0:01', 'the last second never reads 0:00');
  assert.equal(findClock(0), '0:01');
  assert.equal(findClock(61_000), '1:01');
  assert.equal(findClock(60_500), '1:01');
  assert.equal(findClock(3_599_000), '59:59');
  assert.equal(findClock(3_600_000), '1h 0m', 'an hour reads in hours, never 60:00');
  assert.equal(findClock(3_752_000), '1h 2m', 'not 62:32');
  assert.equal(findClock(2 * 3_600_000 + 6 * 60_000 + 1), '2h 6m');
  assert.match(life, /setGone\(true\); onExpire\(\);/);
  for (const file of ['Coin', 'Key', 'Redeemable']) {
    const src = read(`src/screens/ExploreScreen/${file}.tsx`);
    assert.match(src, /const gone = useFindExpiry\(/, file);
    assert.match(src, /<FindFade gone=\{gone\}>/, file);
    assert.match(src, /\{findClock\(total\)\}/, `${file}: the chip rounds up`);
  }
});

test('ride timers share the find clock: round up, hours past 60 min, fade themselves out at zero', () => {
  const src = read('src/screens/ExploreScreen/TaskMarker.tsx');
  const body = src.slice(src.indexOf('function MarkerTimer'), src.indexOf('const TIMER_FADE_MS'));
  assert.match(body, /\{findClock\(left\)\}/);
  assert.doesNotMatch(body, /Math\.round|padStart/, 'no own m:ss math (it rounded the last second to 0:00)');
  assert.match(body, /if \(!ticking \|\| done\) return;/, 'stops ticking at zero');
  assert.match(body, /withTiming\(done \? 0 : 1/, 'fades out at zero from inside the timer');
  assert.doesNotMatch(src, /<View style=\{\[styles\.timerBadge/, 'the chip itself fades, not just its text');
});

test('the pointer line and the +N badge are always mounted and animate in (no pop)', () => {
  const placed = read('src/components/map/declutter/Placed.tsx');
  assert.doesNotMatch(placed, /\{leader && <Leader/, 'the leader never mounts on a condition');
  assert.match(placed, /<Leader anchor=\{anchor\} leader=\{tag\?\.leader \?\? null\} reduced=\{reduced\} \/>/);
  const leader = placed.slice(placed.indexOf('function Leader('), placed.indexOf('export function foldLabel'));
  assert.doesNotMatch(leader, /return null/);
  const badge = placed.slice(placed.indexOf('export function FoldBadge'), placed.indexOf('const styles'));
  assert.doesNotMatch(badge, /return null/, 'the badge fades out, never unmounts');
  assert.match(placed, /export const FOLD_POP_MS = 120;/);
  assert.match(badge, /scale: reduced \? 1 : 0\.8 \+ 0\.2 \* k\.value/, 'scales in 0.8 to 1, none under Reduce Motion');
  const task = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.match(task, /<FoldBadge count=\{folded\} style=\{styles\.clusterBadge\} \/>/);
  assert.doesNotMatch(task, /folded > 0 && <View/);
});
