const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/map-motion.test.cjs
// Dustin, Oct 8: "Make sure moving on the app, pointing your phone, all that is optimized and
// amazing. It should feel as smooth as butter." and "I don't understand what tapping the compass
// does in the top right." The compass filter, the follow camera's path and loop, and the compass button.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hf = loadTs('src/components/map/headingFilter.ts');
const cf = loadTs('src/components/map/cameraFollow.ts');
const ad = (a, b) => hf.angleDelta(a, b);

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gaussFrom = r => () => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());

test('angleDelta takes the short way round north', () => {
  assert.equal(ad(350, 10), 20);
  assert.equal(ad(10, 350), -20);
  assert.equal(ad(0, 180), 180);
  assert.equal(hf.normDeg(-10), 350);
});

test('a phone held still (2.5 degrees of noise) gives a map that does not wobble', () => {
  const f = hf.createHeadingFilter();
  const g = gaussFrom(rng(1));
  const out = [];
  for (let t = 0; t < 8000; t += 33) { f.push(90 + g() * 2.5, t); if (t > 1500) out.push(f.value()); }
  const spread = Math.max(...out.map(v => ad(90, v))) - Math.min(...out.map(v => ad(90, v)));
  assert.ok(spread < 2, `held phone spread ${spread.toFixed(2)} degrees`);
  assert.ok(Math.abs(ad(90, out[out.length - 1])) < 3);
});

test('a quick turn is followed closely and lands on the new heading (through north)', () => {
  const f = hf.createHeadingFilter();
  for (let t = 0; t < 1000; t += 33) f.push(340, t);
  // 340 -> 70 (90 degrees through north) in 0.5 s, then held.
  let maxLag = 0;
  for (let t = 1000; t <= 1500; t += 33) {
    const truth = hf.normDeg(340 + 90 * (t - 1000) / 500);
    f.push(truth, t);
    if (t >= 1200) maxLag = Math.max(maxLag, Math.abs(ad(f.value(), truth)));
  }
  assert.ok(maxLag < 25, `lag during the turn ${maxLag.toFixed(1)} degrees`);
  // iOS stops sending once the phone is still: ticks alone must settle it on 70.
  for (let t = 1533; t < 2600; t += 100) f.tick(t);
  assert.ok(Math.abs(ad(f.value(), 70)) < 1.5, `settled at ${f.value()}`);
  assert.ok(f.settled());
  assert.equal(f.speed(), 0, 'no lead once still');
});

test('the path to a fix starts where the shark is, moving the way it was (no jump, no stop)', () => {
  const a = { latitude: 33.8122, longitude: -117.919 };
  const b = { latitude: 33.81223, longitude: -117.919 };
  const c = { latitude: 33.81226, longitude: -117.91897 };
  let g = cf.nextGlide(null, a, 0, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(cf.glideAt(g, 50))), JSON.parse(JSON.stringify(a)));
  g = cf.nextGlide(g, b, 1000, 2400, a, 2);
  const mid = cf.glideAt(g, 2200);
  assert.ok(mid.latitude > a.latitude && mid.latitude < b.latitude);
  // A new fix mid-path: position and speed carry over exactly.
  const at = 2800, before = cf.glideAt(g, at), rateBefore = cf.glideRate(g, at);
  const g2 = cf.nextGlide(g, c, at, 2200, b, 1.8);
  const after = cf.glideAt(g2, at), rateAfter = cf.glideRate(g2, at);
  assert.ok(Math.abs(after.latitude - before.latitude) < 1e-12 && Math.abs(after.longitude - before.longitude) < 1e-12);
  assert.ok(Math.abs(rateAfter.latitude - rateBefore.latitude) < 1e-12);
  // Past the end it coasts and stops within about half a metre.
  const end = cf.glideAt(g2, at + 2200), later = cf.glideAt(g2, at + 2200 + 5000);
  const coast = Math.hypot((later.latitude - end.latitude) * 111320, (later.longitude - end.longitude) * 111320 * 0.83);
  assert.ok(coast > 0.05 && coast < 1, `coast ${coast.toFixed(2)} m`);
  assert.equal(cf.glideActive(g2, at + 2200 + 5000), false);
});

test('walking pace is measured over several fixes, so GPS scatter does not speed the shark up', () => {
  const p = new cf.WalkPace();
  const r = gaussFrom(rng(3));
  let v = 0;
  for (let i = 0; i < 8; i++) {
    const n = i * 2.8 + r() * 1.2, e = r() * 1.2;
    v = p.push({ latitude: 33.8122 + n / 111320, longitude: -117.919 + e / 92500 }, i * 2000);
  }
  assert.ok(v > 1.0 && v < 1.9, `pace ${v.toFixed(2)} m/s for a 1.4 m/s walk`);
  assert.equal(cf.walkGlideMs(2.8, 1.4), 2240);
  assert.equal(cf.walkGlideMs(0, 1.4), 0);
  assert.ok(cf.walkGlideMs(200, 0.1) <= 4000);
});

test('the camera aims north in north-up mode and a little ahead of a turn in heading mode', () => {
  assert.equal(cf.targetBearing('north', 123, 90), 0);
  assert.equal(cf.targetBearing('heading', null, 0), null);
  assert.equal(cf.targetBearing('heading', 100, 0), 100);
  const lead = cf.targetBearing('heading', 100, 90);
  assert.ok(lead > 100 && lead < 115);
  assert.ok(cf.targetBearing('heading', 100, 5000) - 100 <= 120 * cf.CAM_SEGMENT_MS / 1000 * cf.CAM_HEADING_LEAD + 1e-9, 'lead is capped');
  assert.equal(cf.needleDeg(90), 270);
});

test('tiny changes send no camera move (nothing is sent while still)', () => {
  const s = { bearing: 10, latitude: 33.8122, longitude: -117.919 };
  assert.equal(cf.camChanged(null, s), true);
  assert.equal(cf.camChanged(s, { ...s, bearing: 10.02 }), false);
  assert.equal(cf.camChanged(s, { ...s, bearing: 10.5 }), true);
  assert.equal(cf.camChanged(s, { ...s, latitude: 33.8122 + 0.01 / 111320 }), false);
  assert.equal(cf.camChanged(s, { ...s, latitude: 33.8122 + 0.2 / 111320 }), true);
  assert.ok(cf.CAM_SEGMENT_MS > cf.CAM_TICK_MS, 'a late tick never lets the camera stop');
});

test('the map turns the camera without a React render per compass reading', () => {
  const map = read('src/components/Map.tsx');
  const hook = read('src/components/map/useFollowCamera.ts');
  assert.doesNotMatch(map, /const \{ heading, setHeadingEnabled \} = useContext\(HeadingContext\)/);
  assert.match(map, /useContext\(HeadingControlContext\)/);
  assert.match(map, /subscribeHeading\(cam\.onHeading\)/);
  assert.doesNotMatch(map, /pushCamera\(/, 'no ease-in-out camera move per fix or per compass tick');
  assert.match(hook, /animationMode: 'linearTo'/);
  assert.doesNotMatch(hook, /useState/, 'the loop never renders');
  // The loop stops off screen and in the background.
  assert.match(map, /cam\.setRunning\(screenFocused && appActive\)/);
  const provider = read('src/context/LocationProvider.tsx');
  assert.match(provider, /headingListenersRef\.current\.forEach\(listener => listener\(rawHeading, at\)\)/);
  assert.match(provider, /export const HEADING_MIN_INTERVAL_MS = 2000;/);
});

test('the compass says what it does: two named states, a pill after each tap and a one-time hint', () => {
  const btn = loadTs('src/components/map/FollowButton.tsx', {
    'expo-image': { Image: () => null }, 'react': { useEffect() {}, useRef: v => ({ current: v }), useState: v => [v, () => {}] },
    'react-native': { Pressable: () => null, StyleSheet: { create: s => s, absoluteFill: {} }, Text: () => null, View: () => null },
    'react-native-reanimated': { __esModule: true, default: { View: () => null }, Easing: { out: () => 0, quad: 0 }, FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) },
      useAnimatedStyle: () => ({}), useSharedValue: v => ({ value: v }), withSequence: () => 0, withSpring: () => 0, withTiming: () => 0 },
    'react-native-svg': { __esModule: true, default: () => null, Path: () => null },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'f' },
    '../../ui': { BRAND: {}, SHADOW: { card: {} } },
  });
  for (const key of ['heading', 'north', 'away']) assert.ok(btn.FOLLOW_COPY[key].split(' ').length <= 4, key);
  assert.ok(btn.FOLLOW_COPY.hintBody.split(' ').length <= 12);
  assert.match(btn.followButtonLabel('heading'), /turns with you/);
  assert.match(btn.followButtonLabel('north'), /north stays up/);
  const map = read('src/components/Map.tsx');
  assert.match(map, /useOneTimeTip\('map_compass'/);
  assert.match(map, /FOLLOW_MODE_KEY/);
  assert.match(read('src/services/help/seenTips.ts'), /'map_compass'/);
});

test('a pinch that began while following keeps following at the new zoom; a pan does not', () => {
  const map = read('src/components/Map.tsx');
  const fn = map.slice(map.indexOf('export function pinchKeepsFollow'), map.indexOf('/** A coarse copy of the map'));
  assert.match(fn, /fx > 0\.2 && fx < 0\.8 && fy > 0\.2 && fy < 0\.8/);
  assert.match(map, /Math\.abs\(zoom - startZoom\) >= 0\.12 && pinchKeepsFollow\(location, bounds\)/);
  assert.match(map, /cam\.recenter\(followZoomRef\.current\)/);
});

test('Fin-ister layers place chips by the map bearing, not the raw compass', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /<FrightBearing store=\{frightBearing\}>\n\s*<View/);
  assert.match(map, /if \(frightOn\) frightBearing\.set\(bearing\)/);
});
