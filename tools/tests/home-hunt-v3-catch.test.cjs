const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const ride = loadTs('src/screens/ExploreScreen/ridePhoto.ts');
const look = loadTs('src/screens/ExploreScreen/findPresentation.ts');
const catcher = loadTs('src/screens/ExploreScreen/homeCatch.ts');
const track = loadTs('src/screens/ExploreScreen/ridePhoto/rideTrack.ts');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

test('Common is a one-tap Chomp; Uncommon and up ride for a photo', () => {
  assert.equal(ride.rideSpec(1).style, 'chomp');
  for (const r of [2, 3, 4, 5]) assert.equal(ride.rideSpec(r).style, 'ride_photo');
  assert.equal(ride.rideSpec(undefined).style, 'chomp');
  assert.equal(ride.rideSpec(9).track, 'launch', 'clamped to Legendary');
});

test('rarer means a wilder ride: faster passes and a smaller frame', () => {
  const specs = [2, 3, 4, 5].map(ride.rideSpec);
  for (let i = 1; i < specs.length; i++) {
    assert.ok(specs[i].passMs < specs[i - 1].passMs);
    assert.ok(specs[i].frameHalf < specs[i - 1].frameHalf);
  }
  assert.deepEqual(specs.map(s => s.track), ['family', 'hill', 'dark', 'launch']);
  assert.equal(ride.rideSpec(4).photosNeeded, 2, 'Epic needs 2 good photos');
  assert.ok(ride.rideSpec(4).litMs > 0, 'Epic flash frame is lit only briefly');
  assert.deepEqual(specs.map(s => s.developBeats), [1, 2, 3, 3]);
});

test('only Legendary can leave, after 3 rides; everything else is never lost', () => {
  for (const r of [1, 2, 3, 4]) assert.equal(ride.rideSpec(r).maxRides, null);
  const legend = ride.rideSpec(5);
  assert.equal(legend.maxRides, 3);
  let state = ride.RIDE_START;
  state = ride.rideStep(legend, state, { type: 'shot', grade: 'blurry' });
  assert.equal(state.outcome, 'riding');
  state = ride.rideStep(legend, state, { type: 'pass_end' });
  assert.equal(ride.isLastRide(legend, state), true, '"Last ride!" before the final pass');
  state = ride.rideStep(legend, state, { type: 'pass_end' });
  assert.equal(state.outcome, 'rode_off');
  // A rare that misses many times keeps riding.
  let rare = ride.RIDE_START;
  for (let i = 0; i < 10; i++) rare = ride.rideStep(ride.rideSpec(3), rare, { type: 'pass_end' });
  assert.equal(rare.outcome, 'riding');
});

test('grades: Frame It in the middle, Great, Good at the edge, Blurry outside', () => {
  assert.equal(ride.gradeShot(0), 'frame_it');
  assert.equal(ride.gradeShot(-0.2), 'frame_it');
  assert.equal(ride.gradeShot(0.4), 'great');
  assert.equal(ride.gradeShot(0.9), 'good');
  assert.equal(ride.gradeShot(1.01), 'blurry');
  assert.equal(ride.gradeShot(Number.NaN), 'blurry');
  assert.equal(ride.REDUCED_MOTION_GRADE, 'great', 'Reduce Motion: one tap is a Great');
});

test('Epic needs two good photos; a Blurry never counts', () => {
  const epic = ride.rideSpec(4);
  let state = ride.rideStep(epic, ride.RIDE_START, { type: 'shot', grade: 'great' });
  assert.equal(state.outcome, 'riding');
  state = ride.rideStep(epic, state, { type: 'shot', grade: 'blurry' });
  assert.equal(state.outcome, 'riding');
  state = ride.rideStep(epic, state, { type: 'shot', grade: 'good' });
  assert.equal(state.outcome, 'caught');
  assert.deepEqual(plain(ride.photoPayload(epic, state)), { catch_style: 'ride_photo', photo_quality: 'great', rides: 3, photos: 2 });
  assert.deepEqual(plain(ride.photoPayload(ride.rideSpec(1), ride.RIDE_START)), { catch_style: 'chomp' });
});

test('after a miss the frame grows (capped) and the car comes back sooner', () => {
  const spec = ride.rideSpec(3);
  assert.equal(ride.frameHalfAfterMisses(spec, 0), spec.frameHalf);
  assert.ok(ride.frameHalfAfterMisses(spec, 1) > spec.frameHalf);
  assert.equal(ride.frameHalfAfterMisses(spec, 10), ride.frameHalfAfterMisses(spec, 3));
  assert.ok(ride.returnDelayMs(spec, true) < ride.returnDelayMs(spec, false));
});

test('ride progress is smooth and monotonic on every track', () => {
  for (const kind of ['family', 'hill', 'dark', 'launch']) {
    assert.equal(ride.rideProgress(kind, 0), 0);
    assert.ok(Math.abs(ride.rideProgress(kind, 1) - 1) < 1e-9);
    let last = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const u = ride.rideProgress(kind, t);
      assert.ok(u >= last - 1e-9, `${kind} at ${t}`);
      last = u;
    }
  }
  assert.ok(ride.rideProgress('hill', 0.45) < 0.31, 'the lift hill crawls');
});

test('track lookup table crosses the scene and passes through the flash frame', () => {
  const lut = track.buildTrack('hill', 380, 250);
  assert.equal(lut.xs.length, track.LUT_SAMPLES);
  assert.ok(lut.xs[0] < 0 && lut.xs[lut.xs.length - 1] > 380, 'enters and leaves off screen');
  const at = track.sampleTrack(lut, 0.5);
  assert.ok(Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.angle));
  assert.ok(Math.abs(lut.frameX - 380 * track.FRAME_AT.hill) < 1e-9);
});

test('find look: in range hops bigger and brighter; rare and up glow and sparkle', () => {
  const far = look.findLook(1, false), near = look.findLook(1, true);
  assert.ok(far.scale < near.scale && far.opacity < near.opacity);
  assert.equal(near.hop, true);
  assert.equal(look.findLook(1, false).aura, false);
  assert.equal(look.findLook(3, false).aura, true);
  assert.deepEqual([1, 2, 3, 4, 5].map(r => look.findLook(r, false).sparkles), [0, 0, 2, 3, 4]);
  assert.equal(look.findLook(5, false).rays, true);
});

test('walk-closer nudge and its arrow', () => {
  assert.equal(look.walkCloserLine(64), 'Walk closer · 65 m');
  assert.equal(look.walkCloserLine(null), 'Walk closer');
  assert.equal(look.screenBearing({ x: 0, y: 0 }, { x: 0, y: -10 }), 0, 'up the screen');
  assert.equal(look.screenBearing({ x: 0, y: 0 }, { x: 10, y: 0 }), 90);
  assert.equal(look.screenBearing({ x: 0, y: 0 }, { x: 0, y: 0 }), null);
});

test('catch summary: dex wins, set colour falls back, progress ticks by one on a new find', () => {
  const summary = look.catchSummary({ rarity: 3, set_name: 'Snack Stand' }, {
    is_new_variant: true, dex: { found: 5, total: 12 }, set_progress: { total: 40, collected: 19 },
    item: { rarity: 3, set_color: '#FF8A3D' },
  });
  assert.equal(summary.isNew, true);
  assert.equal(summary.collected, 5);
  assert.equal(summary.total, 12);
  assert.equal(summary.setColor, '#FF8A3D');
  assert.ok(Math.abs(summary.progressFrom - 4 / 12) < 1e-9);
  assert.equal(look.catchProgressLine(summary), 'Snack Stand 5/12');
  const old = look.catchSummary({ rarity: 1, set_name: 'Churro Collection', set_color: 'red' }, { set_progress: { total: 40, collected: 19 } });
  assert.equal(old.setColor, look.DEFAULT_SET_COLOR, 'a non-hex colour falls back');
  assert.equal(old.collected, 19);
  assert.equal(look.catchSummary({ rarity: 2 }, { replayed: true, is_new_variant: true }).isNew, false);
});

test('the catch call: fresh GPS wins, 410 is gone, server words are kept, details are sent', async () => {
  const now = 100_000;
  assert.deepEqual(plain(catcher.pickupFix({ latitude: 1, longitude: 2, timestamp: now - 1000 }, { latitude: 3, longitude: 4 }, now)), { latitude: 1, longitude: 2 });
  assert.deepEqual(plain(catcher.pickupFix({ latitude: 1, longitude: 2, timestamp: now - 60_000 }, { latitude: 3, longitude: 4 }, now)), { latitude: 3, longitude: 4 });
  assert.equal(catcher.pickupFix(null, null, now), null);
  let sent = null;
  const ok = await catcher.catchFind(async (...args) => { sent = args; return { success: true, data: { rewards: {} } }; }, 7, 70, { latitude: 1, longitude: 2 }, { catch_style: 'ride_photo', photo_quality: 'great' });
  assert.equal(ok.kind, 'caught');
  assert.deepEqual(plain(sent), [7, 70, 1, 2, { catch_style: 'ride_photo', photo_quality: 'great' }]);
  const gone = await catcher.catchFind(async () => { throw { response: { status: 410 } }; }, 7, 70, { latitude: 1, longitude: 2 });
  assert.equal(gone.kind, 'gone');
  const far = await catcher.catchFind(async () => { throw { response: { status: 422, data: { error: 'Walk a little closer.' } } }; }, 7, 70, { latitude: 1, longitude: 2 });
  assert.deepEqual(plain(far), { kind: 'failed', line: 'Walk a little closer.' });
  assert.equal((await catcher.catchFind(async () => ({}), 7, 70, null)).kind, 'failed', 'no GPS fix');
});

test('wiring: taps catch, the server nearby check never auto-opens outside the tutorial, no modal', () => {
  const screen = read('src/screens/ExploreScreen.tsx');
  assert.match(screen, /if \(source === 'auto'\) return;/);
  assert.doesNotMatch(screen, /<PrepItemRedeemModal/);
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /onPrepItemNearby\(nearbyItem, nearbyItem\.pivot_id, 'auto'\)/);
  assert.match(home, /if \(!inRange\) \{ void nudge\(prepItem, distance\); return; \}/);
  assert.match(home, /catchRef\.current\?\.primeRide\(prepItem/);
  assert.match(home, /onPrepItemNearby\(prepItem, prepItem\.pivot_id, 'tap'\)/);
  const moment = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(moment, /rideSpec\(item\.rarity\)\.style === 'ride_photo'/);
  assert.match(moment, /pointerEvents="box-none"/);
  const ridePhoto = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  assert.match(ridePhoto, /shotOffsetMs\(t\.value \* passMs, arrivalMs\)/);
  for (const file of ['src/screens/ExploreScreen/ridePhoto.ts', 'src/screens/ExploreScreen/findPresentation.ts',
    'src/screens/ExploreScreen/HomeHuntChip.tsx', 'src/screens/ExploreScreen/HomeCatchMoment.tsx',
    'src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx']) {
    assert.doesNotMatch(read(file), /—/, `${file} has an em dash`);
  }
});

test('round 2: grading is in ms at the touch minus 50 ms, with a coyote frame, the same for every rarity', () => {
  assert.deepEqual(plain(ride.GRADE_WINDOWS_MS), { frame_it: 35, great: 80, good: 150 });
  // A tap exactly on the visual centre lands 50 ms late on the clock and still grades Frame It!.
  const arrival = 1600;
  assert.equal(ride.gradeOffset(ride.shotOffsetMs(arrival + 50, arrival)).grade, 'frame_it');
  assert.equal(ride.gradeOffset(35 + 16).grade, 'frame_it', 'one frame of grace');
  assert.equal(ride.gradeOffset(70).grade, 'great');
  assert.equal(ride.gradeOffset(-150).grade, 'good');
  const early = ride.gradeOffset(-200);
  assert.equal(early.grade, 'blurry');
  assert.equal(early.direction, 'early');
  assert.equal(early.soClose, true, 'inside 1.5x the Good window');
  const late = ride.gradeOffset(600);
  assert.equal(late.direction, 'late');
  assert.equal(late.soClose, false);
  assert.equal(ride.gradeOffset(-200, 3).grade, 'good', 'windows grow after misses');
});

test('round 2: holds, stars and the ready pips', () => {
  assert.deepEqual(plain(ride.GRADE_HOLD_MS), { blurry: 900, good: 450, great: 650, frame_it: 1100 });
  assert.deepEqual(plain(ride.GRADE_STARS), { blurry: 0, good: 1, great: 2, frame_it: 3 });
  assert.deepEqual(plain(ride.READY_PIPS.map(p => [p.atMs, p.semitones])), [[600, 0], [400, 3], [200, 7]]);
});

test('round 2: the Rare frame sits on the slow run-out, never the fastest part of the track', () => {
  const lut = track.buildTrack('hill', 400, 600, undefined, { top: 160, height: 380 });
  const uFrame = track.uAtX(lut, lut.frameX);
  const tFrame = track.tAtU('hill', uFrame);
  const speed = t => (ride.rideProgress('hill', Math.min(1, t + 0.005)) - ride.rideProgress('hill', t)) / 0.005;
  let peak = 0;
  for (let t = 0; t < 1; t += 0.01) peak = Math.max(peak, speed(t));
  assert.ok(speed(tFrame) < peak * 0.75, `frame speed ${speed(tFrame).toFixed(2)} vs peak ${peak.toFixed(2)}`);
  // A retry starts 0.9 s before the frame, so a miss gets its next chance within 1.4 s.
  assert.ok(300 + 900 <= ride.RETRY_MAX_MS);
});

test('round 2: per-find variety and edge arrows', () => {
  const variants = [0, 1, 2, 3].map(n => plain(track.rideVariant(n)));
  assert.equal(new Set(variants.map(v => v.frameShift)).size, 3);
  assert.equal(variants[3].sky, 'sunset');
  const edges = loadTs('src/screens/ExploreScreen/findEdges.ts');
  const at = plain(edges.edgeArrowPlacement({ x: 200, y: -300 }, { width: 400, height: 800 }, { top: 70, bottom: 190, side: 30 }));
  assert.equal(at.y, 70);
  assert.equal(at.angleDeg, 0);
  assert.equal(plain(edges.edgeArrowPlacement({ x: 900, y: 400 }, { width: 400, height: 800 }, { top: 70, bottom: 190, side: 30 })).angleDeg, 90);
});

test('round 2: the map steps back during a catch and the catch never reads GPS on render', () => {
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /ambientPaused=\{catchOpen\}/);
  assert.match(home, /catchOpen && styles\.dimmed/);
  assert.doesNotMatch(read('src/screens/ExploreScreen/HomeCatchMoment.tsx'), /LocationContext/);
  assert.match(read('src/components/OfflineBanner.tsx'), /if \(!mounted \|\| catchOpen\) return null;/);
  const scene = read('src/screens/ExploreScreen/ridePhoto/RideScene.tsx');
  assert.doesNotMatch(scene, /BlurMask|<Shadow|ColorMatrix/);
  assert.match(scene, /createPicture/);
  const markers = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.doesNotMatch(markers, /shadowRadius/);
});

test('round 3: per-rarity windows (Frame It! stays tight, Good is generous on easy rides)', () => {
  assert.deepEqual(plain(ride.GRADE_WINDOWS_BY_TIER), {
    2: { frame_it: 40, great: 110, good: 250 }, 3: { frame_it: 35, great: 95, good: 225 },
    4: { frame_it: 35, great: 85, good: 190 }, 5: { frame_it: 35, great: 80, good: 150 },
  });
  // Ages 6 to 8: at least 450 ms total of Good or better on Uncommon and Rare.
  for (const rarity of [2, 3]) {
    const w = ride.gradeWindows(rarity);
    assert.ok(2 * (w.good + ride.COYOTE_MS) >= 450, `rarity ${rarity}`);
    assert.equal(ride.gradeOffset(w.good + 10, 0, rarity).grade, 'good');
  }
  assert.equal(ride.gradeOffset(200, 0, 2).grade, 'good');
  assert.equal(ride.gradeOffset(200, 0, 5).grade, 'blurry');
  // Frame It! never grows with misses.
  assert.equal(ride.gradeOffset(70, 3, 3).grade, 'great');
});

test('round 3: one shutter gesture decides skip, not-yet, ack or shoot', () => {
  assert.equal(ride.shutterAction({ holding: true, armed: false, hintWaiting: false }), 'skip');
  assert.equal(ride.shutterAction({ holding: false, armed: false, hintWaiting: false }), 'ack');
  assert.equal(ride.shutterAction({ holding: false, armed: true, hintWaiting: true }), 'not_yet');
  assert.equal(ride.shutterAction({ holding: false, armed: true, hintWaiting: false }), 'shoot');
});

test('round 3: the hint freeze is first-ride Uncommon/Rare only; silent passes bring the hand, never a free Frame It!', () => {
  assert.equal(ride.hintMode(3, true, 0), 'freeze');
  assert.equal(ride.hintMode(2, true, 0), 'freeze');
  assert.equal(ride.hintMode(4, true, 0), 'hand', 'Epic never freezes');
  assert.equal(ride.hintMode(5, true, 0), 'hand', 'Legendary never freezes');
  assert.equal(ride.hintMode(3, false, 2), 'hand');
  assert.equal(ride.hintMode(5, false, 5), 'hand');
  assert.equal(ride.hintMode(3, false, 1), 'none');
  const src = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  // The freeze turns off after the frozen shot, and an early first-ride tap is a "not yet", never a miss.
  assert.match(src, /if \(frozen\.value\) \{\s*grade = 'frame_it';\s*\/\/[^\n]*\n\s*hintFreeze\.value = false;/);
  assert.match(src, /else if \(action === 'not_yet'\)/);
  // One gesture, always attached.
  assert.match(src, /<GestureDetector gesture=\{tap\}>/);
  assert.doesNotMatch(src, /gesture=\{print && !closing \? skip : tap\}/);
});

test('round 3: full screen, close outside the gesture, sharp photo, one hand-off', () => {
  const src = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  const gestureEnd = src.indexOf('</GestureDetector>');
  assert.ok(src.indexOf('accessibilityLabel="Close the camera"') > gestureEnd, 'close sits outside the shutter gesture');
  assert.match(src, /PixelRatio\.get\(\) \* 1\.4/);
  assert.match(src, /catchSound\(grade === 'frame_it' \? 'shutterGold' : 'shutter'\);[\s\S]{0,200}const image = takePhoto/);
  assert.match(read('src/components/Wrapper.tsx'), /useCatchOpen/);
  assert.match(read('src/components/Topbar.tsx'), /useCatchOpen/);
  assert.match(read('src/screens/ExploreScreen/HomeExplore.tsx'), /chromeHidden=\{catchOpen\}/);
  const moment = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.doesNotMatch(moment, /snapshot\?\.\(\)/, 'no per-open map snapshot');
  assert.match(moment, /closeRide\(true\);\s*setRide\(current => \(current \? \{ \.\.\.current, flyTo/);
  assert.doesNotMatch(read('src/screens/ExploreScreen/ridePhoto/RideScene.tsx'), /react-native-svg/);
});

test('round 4: catch N+1 opens with its own rarity, speed and hint rules', () => {
  // Stage A (Rare) has been seen; B (Epic, first ride) is primed next.
  const a = ride.openRules(3, false);
  const b = ride.openRules(4, true);
  assert.equal(b.passMs, ride.rideSpec(4).passMs);
  assert.notEqual(b.passMs, a.passMs);
  assert.equal(b.hint, 'hand', 'Epic first ride gets the hand, never the freeze');
  assert.deepEqual(b.windows, ride.gradeWindows(4));
  assert.equal(ride.openRules(3, true).hint, 'freeze');

  const stage = read('src/screens/ExploreScreen/ridePhoto/RidePhotoCatch.tsx');
  assert.match(stage, /prime: \(item: PrepItemType, from:/, 'prime carries the item');
  assert.match(stage, /useLayoutEffect\(\(\) => \{\s*const pending = pendingPrime\.current;[\s\S]*?\}, \[item\?\.id, startOpen\]\)/,
    'the open waits for the render that carries the primed item');
  assert.match(stage, /openRules\(item\?\.rarity, firstRide\)/, 'startOpen reads the rendered item rules');
  const moment = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.doesNotMatch(moment, /setPrimed\([^)]*\);[\s\S]{0,120}stage\.current\?\.prime\(/, 'no synchronous prime before re-render');
  assert.match(moment, /useLayoutEffect\(\(\) => \{\s*if \(primed\) stage\.current\?\.prime\(primed\.item, primed\.from\);/);
  assert.match(moment, /const finish = [\s\S]{0,300}setRideItem\(null\)/, 'finish clears the ride item');
});
