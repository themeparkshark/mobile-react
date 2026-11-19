// T011: a coin island hidden under the player's own shark took taps as "Your shark. Tap to say hi".
// T017: a "+4" Fantasyland cluster did nothing, and coin taps zoomed in and out so Peter Pan or Snow
// White could never be picked.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file, requireMap = {}) => {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText,
    { module: mod, exports: mod.exports, require: name => requireMap[name] ?? new Proxy({}, { get: () => () => null }), Math, Number });
  return mod.exports;
};
const layout = load('src/screens/ExploreScreen/parkMapLayout.ts');
const fan = load('src/screens/ExploreScreen/clusterFanLayout.ts');
const map = read('src/components/Map.tsx');
const explore = read('src/screens/ExploreScreen.tsx');

test('a cluster tap gathers the island and every ride folded into it', () => {
  const rides = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 9 }];
  const placements = new Map([['ride:1', { foldedInto: null }], ['ride:2', { foldedInto: 'ride:1' }], ['ride:3', { foldedInto: 'ride:1' }],
    ['ride:4', { foldedInto: 'ride:9' }], ['ride:9', { foldedInto: null }]]);
  assert.deepEqual([...layout.clusterMembers(rides[0], placements, rides)].map(r => r.id), [1, 2, 3]);
  assert.deepEqual([...layout.clusterMembers(rides[1], placements, rides)].map(r => r.id), [2], 'a lone island is just itself');
});

test('the fan lays every coin on screen, clear of the top HUD, spread wider for more rides', () => {
  const screen = { width: 402, height: 874 };
  const five = fan.fanSpots(5, { x: 200, y: 520 }, screen, { top: 280, bottom: 190 });
  assert.equal(five.length, 5);
  for (const spot of five) {
    assert.ok(spot.x >= 46 && spot.x <= 402 - 46, `x ${spot.x}`);
    assert.ok(spot.y >= 280 && spot.y <= 874 - 190, `y ${spot.y}`);
  }
  // No two coins overlap (54 pt chips).
  for (let i = 1; i < five.length; i++) assert.ok(Math.hypot(five[i].x - five[i - 1].x, five[i].y - five[i - 1].y) >= 54, `gap ${i}`);
  // An island near the top fans downward, never under the guide card.
  const high = fan.fanSpots(3, { x: 200, y: 330 }, screen, { top: 280, bottom: 190 });
  for (const spot of high) assert.ok(spot.y > 330 - 1 && spot.y >= 280 + 27, 'opens downward, below the guide card');
  // At the screen edge the coins are pushed back inside.
  for (const spot of fan.fanSpots(4, { x: 10, y: 500 }, screen)) assert.ok(spot.x >= 46);
  assert.equal(fan.fanSpots(0, { x: 1, y: 1 }, screen).length, 0);
});

test('T017 hold: no fanned coin or name ever sits on another, at any screen edge, on SE, 17 Pro and Pro Max', () => {
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const screens = [{ width: 375, height: 667, top: 250, bottom: 170 }, { width: 402, height: 874, top: 280, bottom: 190 },
    { width: 440, height: 956, top: 300, bottom: 200 }];
  for (const sc of screens) {
    for (let n = 1; n <= fan.FAN_MAX; n++) {
      for (const x of [0, 20, 60, sc.width / 2, sc.width - 60, sc.width - 10]) {
        for (const y of [sc.top + 10, sc.top + 120, (sc.top + sc.height - sc.bottom) / 2, sc.height - sc.bottom - 20]) {
          const spots = fan.fanSpots(n, { x, y }, sc, { top: sc.top, bottom: sc.bottom });
          assert.equal(spots.length, n);
          const boxes = spots.map(fan.fanSlotBox);
          for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            assert.ok(b.x >= 0 && b.x + b.w <= sc.width, `on screen x (${sc.width} n${n} at ${x},${y})`);
            assert.ok(b.y >= sc.top - 0.5, `below the guide card (${sc.width} n${n} at ${x},${y}): ${b.y}`);
            if (n <= 3 || sc.height - sc.bottom - sc.top >= 2 * b.h) assert.ok(b.y + b.h <= sc.height - sc.bottom + 0.5, `above PLAY! (${sc.width} n${n} at ${x},${y})`);
            for (let j = 0; j < i; j++) assert.ok(!overlap(b, boxes[j]), `coins ${j} and ${i} overlap (${sc.width} n${n} at ${x},${y})`);
          }
        }
      }
    }
  }
  // The grader's case: Pro Max, Fantasyland +2 at the left edge (Alice in Wonderland and Mad Tea Party).
  const pm = fan.fanSpots(2, { x: 48, y: 505 }, { width: 440, height: 956 }, { top: 300, bottom: 200 });
  assert.ok(!overlap(fan.fanSlotBox(pm[0]), fan.fanSlotBox(pm[1])), 'Mad Tea Party is never under Alice');
});

test('a "+N" island fans out instead of zooming, and a fanned coin is picked like its island', () => {
  const press = explore.slice(explore.indexOf('const handleTaskPress = useCallback('), explore.indexOf('const pickTaskRef'));
  assert.doesNotMatch(press, /zoom \+ 1\.5|zoom < 19\.5/, 'no zoom in, zoom back out loop');
  assert.match(press, /clusterMembers\(task, declutterStore\.snapshot\(\), rideTasksRef\.current\)/);
  assert.match(press, /setClusterFan\(\{ hostId: task\.id, rides: members, at \}\)/);
  assert.match(explore, /top=\{suggestionSlotScreenTop\(Constants\.statusBarHeight \?\? 0\) \+ FAN_GUIDE_CLEAR\}/, 'below the guide card');
  assert.match(explore, /art: rideLandmarkArt\(ride\.name\)/, 'each ride by its own island picture');
  assert.match(explore, /onPick=\{id => \{ const ride = clusterFan\.rides\.find\(r => r\.id === id\); if \(ride\) pickTask\(ride\); \}\}/);
  assert.match(explore, /onUserPan=\{\(\) => setClusterFan\(null\)\}/, 'a pan folds the fan back');
  assert.match(read('src/screens/ExploreScreen/TaskMarker.tsx'), /clusterBadge: \{ position: 'absolute', top: 16, left: 0,/, '+N sits inside the island tap box');
});

test('an island under the shark gets its coin chip beside the shark, and the shark passes its tap to it', () => {
  const { islandUnderShark, UNDER_SHARK_PT } = load('src/components/map/underShark.ts');
  const ppm = 3.76; // zoom 17.9 at Disneyland (pointsPerMeter in Map.tsx)
  assert.equal(islandUnderShark(4, ppm), true, 'standing on Main Street, U.S.A. (4 m)');
  assert.equal(islandUnderShark((UNDER_SHARK_PT + 10) / ppm, ppm), false, 'clear of the shark: the island shows itself');
  assert.equal(islandUnderShark(NaN, ppm), false);
  assert.match(map, /islandUnderShark\(glideMeters\(location, underShark\), pointsPerMeter\(cameraZoom, location\.latitude\)\)/);
  assert.match(map, /onPress=\{sharkOnIsland \? sharkOnIsland\.onPress : onSharkTap\}/);
  assert.match(map, /<UnderSharkChip island=\{sharkOnIsland\} reducedMotion=\{reducedMotion\} \/>/);
  assert.match(explore, /onPress: \(\) => handleTaskPress\(underSharkTask\)/, 'the same press as tapping the island');
  assert.match(explore, /underShark=\{underShark\}/);
});

test('a marker that takes no touches tells its native annotation view, so folded islands and water never swallow a tap', () => {
  const marker = read('src/components/map/Marker.tsx');
  assert.match(marker, /<MarkerView coordinate=\{last\.current\}[^>]*allowOverlap\s*pointerEvents=\{tappable \? undefined : 'none'\}>/);
  const annotation = marker.slice(marker.indexOf('<MarkerView'), marker.indexOf('<Pressable'));
  assert.doesNotMatch(annotation, /'auto'/, "never 'auto' on the annotation (RN's setter turns it into none)");
  const task = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.match(task, /hidden=\{parked\}\s*\/\/[^\n]*\n\s*touchEnabled=\{shown\}/, 'a folded or hidden island takes no touch');
});

test('T013: the raid and the other statuses fold into one small chip at the right; the top-left holds only the guide card', () => {
  const stack = read('src/components/map/MapStatusStack.tsx');
  assert.match(stack, /compact && !open \? \(/, 'closed: a chip, no lead pill');
  assert.match(stack, /\{lead\.icon \?\? <StackGlyph ink=\{tone\.ink\} \/>\}/);
  assert.match(stack, /rowCompact: \{ justifyContent: 'flex-end' \}/);
  assert.match(explore, /<MapStatusStack entries=\{statusEntries\} compact=\{!bossMap\.moment && !receiptNeedsCheck\} \/>/);
  assert.match(explore, /icon: raidOnMap && raid \? <Image source=\{BOSS_ART\[raid\.boss\]\}/);
  const home = read('src/components/home/HomeLive.tsx');
  assert.match(home, /style=\{\(\{ pressed \}\) => \[styles\.chipBar, liveRaid && styles\.barBoss, \{ top \}, pressed && styles\.chipPressed\]\}/);
  assert.match(home, /chipBar: \{ position: 'absolute', right: 12, zIndex: 25, width: 54, height: 54,/);
  assert.doesNotMatch(home, /JOIN<\/Text>\s*<\/View>\s*<\/>\s*\) : \(/, 'no full-width banner with a red JOIN');
});
