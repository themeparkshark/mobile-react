const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/player-motion.test.cjs
// The player's shark moves on the UI thread (PlayerSharkMarker), its wake
// streams behind the walk, a soft ring shows a weak GPS, and its location
// point is the middle of its ground ring.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motion = loadTs('src/components/map/playerMotion.ts');
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('ground offsets become screen offsets with the camera bearing (north up, east up, south up)', () => {
  // North up: east is right, north is up (negative y).
  let [x, y] = motion.screenOffset(10, 0, 3, 0);
  assert.ok(close(x, 30) && close(y, 0));
  [x, y] = motion.screenOffset(0, 10, 3, 0);
  assert.ok(close(x, 0) && close(y, -30));
  // East at the top: walking east goes up the screen, north is to the left.
  [x, y] = motion.screenOffset(10, 0, 3, 90);
  assert.ok(close(x, 0) && close(y, -30));
  [x, y] = motion.screenOffset(0, 10, 3, 90);
  assert.ok(close(x, -30) && close(y, 0));
  // South at the top: north is down.
  [x, y] = motion.screenOffset(0, 10, 3, 180);
  assert.ok(close(x, 0, 1e-9) && close(y, 30));
});

test('metres east/north and the travel course agree with the compass', () => {
  const o = { latitude: 33.81, longitude: -117.92 };
  const north = { latitude: 33.81 + 10 / 111320, longitude: -117.92 };
  const [e, n] = motion.metersEastNorth(o, north);
  assert.ok(close(e, 0) && close(n, 10, 1e-6));
  assert.ok(close(motion.courseDeg(o, north), 0));
  const east = { latitude: 33.81, longitude: -117.92 + 10 / (111320 * Math.cos(33.81 * Math.PI / 180)) };
  assert.ok(close(motion.courseDeg(o, east), 90, 1e-3));
  const southWest = { latitude: 33.81 - 5 / 111320, longitude: -117.92 - 5 / (111320 * Math.cos(33.81 * Math.PI / 180)) };
  assert.ok(close(motion.courseDeg(o, southWest), 225, 1e-2));
  assert.equal(motion.courseDeg(o, { latitude: 33.81 + 0.5 / 111320, longitude: -117.92 }), null, 'a wobble has no course');
});

test('the wake streams opposite the walk on screen, whatever way the map is turned', () => {
  // Sparkles fall along the wake's +y; rotating by wakeTurn must point that away from travel.
  const trail = (course, bearing) => {
    const t = motion.wakeTurn(course, bearing);
    return [-Math.sin(t), Math.cos(t)];
  };
  const travel = (course, bearing) => motion.screenOffset(Math.sin(course * Math.PI / 180), Math.cos(course * Math.PI / 180), 1, bearing);
  for (const [course, bearing] of [[0, 0], [90, 0], [200, 0], [45, 90], [300, 170], [10, 350]]) {
    const [wx, wy] = trail(course, bearing);
    const [mx, my] = travel(course, bearing);
    assert.ok(close(wx, -mx, 1e-9) && close(wy, -my, 1e-9), `course ${course}, bearing ${bearing}`);
  }
});

test('the weak-GPS cue: vague fixes (over 40 m) or two skipped fixes in a row, and quiet otherwise', () => {
  const lp = read('src/context/LocationProvider.tsx');
  const start = lp.indexOf('export function nextGpsSignal');
  const body = lp.slice(start, lp.indexOf('\n}\n', start) + 3);
  const ts = require(path.join(root, 'node_modules/typescript'));
  const js = ts.transpileModule(`const GPS_SIGNAL_GOOD = { weak: false, accuracyMeters: null }; const WEAK_GPS_ACCURACY_M = 40; const WEAK_GPS_REJECT_RUN = 2; const GOOD_GPS_RUN_TO_CLEAR = 3;\n${body}\nmodule.exports = { nextGpsSignal };`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', js)(m, m.exports);
  const { nextGpsSignal } = m.exports;
  assert.equal(nextGpsSignal(12, 0).weak, false);
  assert.equal(nextGpsSignal(40, 0).weak, false);
  assert.deepEqual({ ...nextGpsSignal(63, 0) }, { weak: true, accuracyMeters: 65 });
  assert.equal(nextGpsSignal(10, 1).weak, false, 'one skipped fix is noise');
  assert.equal(nextGpsSignal(10, 2).weak, true, 'a run of skipped fixes is a weak signal');
  assert.equal(nextGpsSignal(null, 0).weak, false);
  assert.equal(nextGpsSignal(null, 3).accuracyMeters, null);
  // Hysteresis: once weak, it stays until three good fixes in a row (no blinking on a mixed signal).
  assert.equal(nextGpsSignal(10, 0, 1, true).weak, true);
  assert.equal(nextGpsSignal(10, 0, 2, true).weak, true);
  assert.equal(nextGpsSignal(10, 0, 3, true).weak, false);
  // Wired to every real fix (stream and poll), cleared on reset, quiet under the joystick.
  assert.equal((lp.match(/noteFix\([^)]*verdict\.kind === 'reject'\)/g) || []).length, 2);
  assert.match(lp, /setGpsSignal\(GPS_SIGNAL_GOOD\)/);
  assert.match(lp, /devMode && simulationAllowed \? GPS_SIGNAL_GOOD : gpsSignal/);
  // Kept out of the status context, so the app shell never re-renders for it.
  assert.match(lp, /Omit<LocationContextType, 'location' \| 'gpsSignal'>/);
});

test('PlayerSharkMarker: a 1 pt marker, a fixed clipped art box, two stable copies, motion on the UI thread', () => {
  const src = read('src/components/map/PlayerSharkMarker.tsx');
  assert.match(src, /point: \{ width: 1, height: 1 \}/, 'the native marker is one point: no tap stealing, no layout to change');
  assert.match(src, /clip: \{ position: 'absolute', width: 100 \+ 2 \* PLAYER_MARGIN, height: 110 \+ 2 \* PLAYER_MARGIN, overflow: 'hidden' \}/);
  assert.match(src, /\{\[0, 1\]\.map\(slot => \(\s*<PlayerSlot key=\{slot\}/);
  assert.match(src, /visE\.value = withTiming\(e, \{ duration: ms, easing: glideEaseWorklet \}\)/, 'the glide runs on the UI thread');
  assert.doesNotMatch(src, /requestAnimationFrame|setInterval/, 'no JS-thread animation loop');
  assert.match(src, /active\.value = slot;/);
  assert.match(src, /SWAP_SETTLE_MS/);
  // Every hook before any early return (none here): the component never returns null.
  assert.doesNotMatch(src, /return null/);
});

test('Map: the location point is the ground ring middle, in both the marker and the follow view', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /const SHARK_GROUND = \{ x: 50, y: 100 \} as const;/);
  assert.match(map, /groundX=\{SHARK_GROUND\.x\} groundY=\{SHARK_GROUND\.y\}/);
  assert.match(map, /centerShark: \{ transform: \[\{ translateY: 55 - SHARK_GROUND\.y \}\] \}/);
  assert.doesNotMatch(map, /translateY: -16\.5/);
  // The ring (groundRing, bottom -2, 24 tall in the 110 box) is centred on that point.
  assert.match(map, /groundRing: \{\s*position: 'absolute',\s*bottom: -2,\s*width: 70,\s*height: 24,/);
  assert.equal(110 + 2 - 24 / 2, 100);
  // The declutter footprint was already measured from the ring (52 x 60 above it).
  assert.match(map, /body: \{ x: -26, y: -52, w: 52, h: 60 \}/);
  // Park detection reads the location, never the drawn shark.
  assert.doesNotMatch(read('src/context/LocationProvider.tsx'), /SHARK_GROUND|translateY/);
});

test('Map: wake turns behind the walk and only stirs on a real step; weak ring always mounted', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /<SharkWake moving=\{wake\} trail=\{wakeTrail\} \/>/);
  assert.match(map, /const wakeTrail = useDerivedValue\(\(\) => wakeTurn\(travelCourse\.value, mapBearing\.value\)\);/);
  assert.match(map, /distMeters \/ Math\.max\(0\.5, sinceLastS\) >= 0\.4/, 'a slow drift of the estimate is not a walk');
  assert.match(map, /<Reanimated\.View pointerEvents="none" style=\{\[styles\.weakRing, weakRingStyle\]\}>/);
  assert.doesNotMatch(map, /gpsSignal\??\.weak && </, 'never a conditional mount');
  const trail = read('src/components/map/alive/SharkTrail.tsx');
  const wakeFn = trail.slice(trail.indexOf('export const SharkWake'), trail.indexOf('function WakeSparkle'));
  assert.ok(wakeFn.indexOf('useAnimatedStyle') < wakeFn.indexOf('return null'), 'hooks before the early return');
});
