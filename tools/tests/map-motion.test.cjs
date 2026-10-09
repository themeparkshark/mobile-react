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

test('the shark swims at an even walking pace between fixes (never a stop-go, never past the fix)', () => {
  const k = 111320;
  const fixAt = n => ({ latitude: 33.8122 + n / k, longitude: -117.919 });
  const c = cf.newChaser(fixAt(0), 0);
  const pace = new cf.WalkPace();
  pace.push(fixAt(0), 0);
  // Fixes 2.8 m apart, uneven gaps (1.4 m/s on average), as a phone with a 3 m filter delivers them.
  const gaps = [2000, 1300, 2700, 1800, 2400, 1500, 2600, 2000, 1700, 2300];
  let t = 0, n = 0;
  const speeds = [];
  let prev = cf.chaseAdvance(c, 0);
  for (const gap of gaps) {
    for (let s2 = 0; s2 < gap; s2 += 50) {
      const p = cf.chaseAdvance(c, t + s2);
      speeds.push(Math.hypot((p.latitude - prev.latitude) * k, (p.longitude - prev.longitude) * k * 0.83) / 0.05);
      prev = p;
    }
    t += gap; n += 2.8;
    cf.chaseFix(c, fixAt(n), t, pace.push(fixAt(n), t), false);
  }
  const steady = speeds.slice(Math.floor(speeds.length * 0.4));
  const mu = steady.reduce((a, b) => a + b) / steady.length;
  const sd = Math.sqrt(steady.reduce((a, b) => a + (b - mu) ** 2, 0) / steady.length);
  assert.ok(sd / mu < 0.2, `speed variation ${(sd / mu).toFixed(2)}`);
  assert.ok(Math.min(...steady) > 0.4 * mu, 'never stops mid-walk');
  // Standing still after the last fix: it settles on it and does not pass it.
  const end = cf.chaseAdvance(c, t + 8000);
  assert.ok(Math.abs((end.latitude - fixAt(n).latitude) * k) < 0.1);
  assert.equal(cf.chaseActive(c, t + 8000), false);
  // A re-seat jumps.
  cf.chaseFix(c, fixAt(500), t + 9000, 1.4, true);
  assert.ok(Math.abs((cf.chaseAdvance(c, t + 9000).latitude - fixAt(500).latitude) * k) < 0.01);
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
    'react-native-reanimated': { __esModule: true, default: { View: () => null }, Easing: { out: () => 0, quad: 0 },
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

test('a busy JS thread stretches each camera move so the camera never stops between ticks', () => {
  let gap = cf.CAM_TICK_MS;
  for (let i = 0; i < 20; i++) gap = cf.segmentGap(gap, 320);
  assert.ok(Math.abs(gap - 320) < 5);
  assert.ok(cf.segmentMs(gap) >= 320 * 1.4 && cf.segmentMs(gap) <= 480);
  assert.equal(cf.segmentMs(cf.CAM_TICK_MS), cf.CAM_SEGMENT_MS);
  assert.equal(cf.segmentMs(5000), 480, 'capped: a stalled thread never sends a slow drift');
});

test('the selected coin card sits where the declutter put it, clear of the following shark', () => {
  const layout = loadTs('src/screens/ExploreScreen/parkMapLayout.ts', {}, {});
  const H = layout.SELECTED_TAG.h, top = layout.RIDE_BODY.y, bottom = layout.RIDE_BODY.y + layout.RIDE_BODY.h;
  assert.equal(layout.selectedCardSide(null, top, bottom, H), 'above');
  assert.equal(layout.selectedCardSide({ y: top - H - 3 }, top, bottom, H), 'above');
  assert.equal(layout.selectedCardSide({ y: bottom + 2 }, top, bottom, H), 'below');
  assert.equal(layout.selectedCardSide({ y: top }, top, bottom, H), 'beside');
  const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
  assert.doesNotMatch(marker, /tooltipContainer/, 'no fixed card spot above the coin');
  assert.match(marker, /<TagSlot tag=\{placement\.tag \?\? undefined\} anchor=\{RIDE_BOX\.anchor\} width=\{SELECTED_TAG\.w\} height=\{SELECTED_TAG\.h\}/);
  const map = read('src/components/Map.tsx');
  assert.match(map, /export const PLAYER_BODY = \{ x: -38, y: -96, w: 76, h: 102 \} as const;/);
  assert.match(map, /tagObstacleOnly: true, body: PLAYER_BODY/);
});

test('one wild compass reading is ignored; two that agree are a real spin', () => {
  const f = hf.createHeadingFilter();
  for (let t = 0; t < 1500; t += 33) f.push(90, t);
  f.push(250, 1533);
  for (let t = 1566; t < 2500; t += 33) f.push(90, t);
  assert.ok(Math.abs(ad(90, f.value())) < 1, `glitch ignored: ${f.value()}`);
  const g = hf.createHeadingFilter();
  for (let t = 0; t < 1500; t += 33) g.push(0, t);
  for (let t = 1500; t < 3000; t += 33) g.push(180, t);
  assert.ok(Math.abs(ad(180, g.value())) < 5, `about-face taken: ${g.value()}`);
});
