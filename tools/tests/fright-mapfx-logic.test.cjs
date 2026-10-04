'use strict';
// Fin-ister Nights map FX: thunder timing, reef scareactors, reef pops, window flicker.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const thunder = loadTs('src/components/map/fright/thunder.ts');
const critters = loadTs('src/components/map/fright/critters.ts');
const sa = loadTs('src/components/map/fright/scareactors.ts');
const flicker = loadTs('src/components/map/fright/flicker.ts');
const geo = loadTs('src/components/map/fright/geo.ts');

function simulate(seed, hours, quietAt = () => false) {
  let state = thunder.startThunder(0, seed);
  const strikes = [];
  for (let t = 0; t <= hours * 3600_000; t += 1000) {
    const r = thunder.stepThunder(state, t, quietAt(t));
    state = r.state;
    if (r.strike) strikes.push(r.strike);
  }
  return strikes;
}

test('thunder: never in the first 20 s, at most one strike per 90 s, delay 0.6 to 1.8 s', () => {
  for (const seed of [1, 7, 42, 999, 123456]) {
    const strikes = simulate(seed, 3);
    assert.ok(strikes.length >= 20 && strikes.length <= 120, `${strikes.length} strikes in 3 h`);
    assert.ok(strikes[0].at >= thunder.THUNDER_FIRST_QUIET_MS, 'first strike waits');
    for (let i = 1; i < strikes.length; i++) {
      assert.ok(strikes[i].at - strikes[i - 1].at >= thunder.THUNDER_MIN_GAP_MS, 'gap');
    }
    for (const s of strikes) {
      assert.ok(s.thunderDelayMs >= 600 && s.thunderDelayMs <= 1800, `delay ${s.thunderDelayMs}`);
      assert.ok(s.strength >= 0.7 && s.strength <= 1);
    }
    const gaps = strikes.slice(1).map((s, i) => s.at - strikes[i].at);
    assert.ok(new Set(gaps).size > gaps.length / 2, 'randomized gaps');
  }
});

test('thunder: deterministic per seed, different across seeds', () => {
  assert.deepEqual(simulate(5, 1).map(s => s.at), simulate(5, 1).map(s => s.at));
  assert.notDeepEqual(simulate(5, 1).map(s => s.at), simulate(6, 1).map(s => s.at));
});

test('thunder: quiet holds every strike, then resumes', () => {
  const quietFirstHour = t => t < 3600_000;
  const strikes = simulate(11, 2, quietFirstHour);
  assert.ok(strikes.every(s => s.at >= 3600_000), 'nothing while quiet');
  assert.ok(strikes.length > 0, 'resumes after');
});

test('thunder: the flash follows MAP_FX_SPEC (0.35 peak, a second blip, out by 440 ms); lite is softer', () => {
  let peak = 0;
  for (let t = -0.1; t < 1.2; t += 0.005) peak = Math.max(peak, thunder.flashLevel(t, 1));
  assert.ok(peak > 0.3 && peak <= 0.35, `peak ${peak}`);
  assert.ok(Math.abs(thunder.flashLevel(0.21, 1) - 0.22) < 1e-9, 'second blip');
  assert.equal(thunder.flashLevel(0.45, 1), 0);
  assert.equal(thunder.flashLevel(-0.1, 1), 0);
  let litePeak = 0;
  for (let t = 0; t < 0.5; t += 0.005) litePeak = Math.max(litePeak, thunder.flashLevel(t, 1, true));
  assert.ok(litePeak <= 0.2, `lite ${litePeak}`);
  assert.ok(thunder.flashLevel(0.21, 1, true) < 0.1, 'lite has no second blip');
});

test('scareactors stand still inside the reef, spread around it, deterministic', () => {
  for (const slots of [1, 2, 3]) {
    const spots = Array.from({ length: slots }, (_, i) => sa.scareactorSpot(3 + i * 37, i, slots, 80));
    for (const p of spots) {
      assert.ok(Math.hypot(p.x, p.y / 0.6) <= 80.5, 'inside the wander radius');
      assert.ok(Math.abs(p.y) <= 0.6 * 80 + 0.5, 'a flat ellipse reads as ground');
    }
    for (let i = 1; i < spots.length; i++) assert.notDeepEqual({ ...spots[i] }, { ...spots[0] }, 'no two on one spot');
  }
  assert.deepEqual({ ...sa.scareactorSpot(3, 0, 3, 80) }, { ...sa.scareactorSpot(3, 0, 3, 80) });
});

test('reef reaction: watch within 60 m, inside within the radius', () => {
  assert.equal(critters.reefReaction(30, 70), 'inside');
  assert.equal(critters.reefReaction(55, 40), 'watch');
  assert.equal(critters.reefReaction(61, 40), 'ignore');
  assert.equal(critters.reefReaction(Number.NaN, 40), 'ignore');
  assert.equal(critters.faceToward(90, 0), 1, 'player to the east, map north up: right');
  assert.equal(critters.faceToward(270, 0), -1);
  assert.equal(critters.faceToward(90, 180), -1, 'map turned around');
});

test('reef pops: once on entry, rate limited per reef for 10 minutes, quiet never pops', () => {
  const reef = { key: 'r1', latitude: 28.4754, longitude: -81.4677, radius: 60 };
  const inside = geo.offsetMeters(reef, 10, 0);
  const outside = geo.offsetMeters(reef, 200, 0);
  let s = critters.POP_START;
  let r = critters.stepPops(s, [reef], outside, 0, false);
  assert.deepEqual([...r.pops], []);
  r = critters.stepPops(r.state, [reef], inside, 1000, false);
  assert.deepEqual([...r.pops], ['r1'], 'entry pops');
  r = critters.stepPops(r.state, [reef], inside, 2000, false);
  assert.deepEqual([...r.pops], [], 'staying inside does not pop again');
  r = critters.stepPops(r.state, [reef], outside, 3000, false);
  r = critters.stepPops(r.state, [reef], inside, 4000, false);
  assert.deepEqual([...r.pops], [], 'cooldown');
  r = critters.stepPops(r.state, [reef], outside, 5000, false);
  r = critters.stepPops(r.state, [reef], inside, 1000 + critters.POP_COOLDOWN_MS, false);
  assert.deepEqual([...r.pops], ['r1'], 'after 10 minutes');
  // Quiet: entering tracks the reef but never pops, and un-quieting inside does not pop late.
  s = critters.stepPops(critters.POP_START, [reef], inside, 0, true);
  assert.deepEqual([...s.pops], []);
  s = critters.stepPops(s.state, [reef], inside, 1000, false);
  assert.deepEqual([...s.pops], []);
  assert.deepEqual([...critters.stepPops(critters.POP_START, [reef], null, 0, false).pops], []);
});

test('window flicker: levels stay in range, windows differ, deterministic per seed', () => {
  for (const profile of ['candle', 'neon', 'strobe-soft']) {
    const plan = flicker.flickerPlan(profile, 77, 4);
    assert.equal(plan.length, 4 * flicker.PLAN_STRIDE);
    for (let t = 0; t < 60; t += 0.05) {
      for (let i = 0; i < 4; i++) {
        const v = flicker.windowLevel(plan, i, t);
        assert.ok(v >= 0.12 && v <= 1, `${profile} ${v}`);
      }
    }
    assert.notEqual(flicker.windowLevel(plan, 0, 3.3), flicker.windowLevel(plan, 1, 3.3));
    assert.deepEqual(flicker.flickerPlan(profile, 77, 4), plan);
  }
  assert.equal(flicker.flickerProfile('mystery'), 'candle');
  assert.equal(flicker.windowLevel([], 0, 1), 0.85, 'a missing plan holds a still glow');
});

test('window flicker: strobe-soft never exceeds 2 Hz (photosafe)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const plan = flicker.flickerPlan('strobe-soft', seed, 3);
    for (let i = 0; i < 3; i++) assert.ok(plan[i * flicker.PLAN_STRIDE + 3] <= flicker.MAX_FLICKER_HZ);
  }
});

test('silhouettes pass now and then, one window at a time', () => {
  const plan = flicker.silhouettePlan(55, 3);
  assert.ok(plan[0] >= flicker.SILHOUETTE_EVERY_MIN_S && plan[0] <= flicker.SILHOUETTE_EVERY_MAX_S);
  let passes = 0;
  let prev = -1;
  for (let t = 0; t < 600; t += 0.1) {
    const s = flicker.silhouetteAt(plan, 3, t);
    if (s.p >= 0) {
      assert.ok(s.w >= 0 && s.w < 3 && s.p <= 1);
      if (prev < 0) passes++;
    }
    prev = s.p;
  }
  assert.ok(passes >= 600 / flicker.SILHOUETTE_EVERY_MAX_S - 1 && passes <= 600 / flicker.SILHOUETTE_EVERY_MIN_S + 1, `${passes} passes`);
  assert.equal(flicker.silhouetteAt(plan, 0, 1).p, -1);
});

test('geo helpers', () => {
  const a = { latitude: 28.4754, longitude: -81.4677 };
  const b = geo.offsetMeters(a, 100, 0);
  assert.ok(Math.abs(geo.distanceMeters(a, b) - 100) < 0.5);
  assert.ok(Math.abs(geo.bearingDeg(a, b) - 90) < 0.5);
  assert.ok(geo.pointsPerMeter(17.6, 28.47) > 2.5 && geo.pointsPerMeter(17.6, 28.47) < 3.5);
  assert.equal(geo.validPoint({ latitude: Number.NaN, longitude: 0 }), false);
});
