const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/map-wow.test.cjs
// Dustin, Oct 24: "visually blow my mind with how fun it is ... how great the animations and polish is".
// The map and the catch: four-beat catch, getting warmer, the spawn pop and the rolling HUD counter.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const wow = loadTs('src/components/map/alive/mapWow.ts');
const motion = loadTs('src/ui/motion.ts');
// Objects from the loaded module live in another realm: compare them as plain data.
const plain = v => JSON.parse(JSON.stringify(v));

test('the catch: squash, three growing wobbles, a held beat, the burst inside 1.5 s and home inside 2.6 s', () => {
  const plan = wow.catchPlan({ reduced: false });
  assert.equal(plan.squashMs, motion.DURATION.tap);
  assert.ok(plan.squashTo < 0.9 && plan.squashTo > 0.8);
  assert.deepEqual(plain(plan.wobbles.map(w => w.deg)), [8, 12, 16], 'each wobble stronger than the last');
  for (let i = 1; i < plan.wobbles.length; i++) assert.ok(plan.wobbles[i].at - plan.wobbles[i - 1].at >= 150, 'wobbles never overlap');
  assert.equal(plan.burstAt - plan.hitStopAt, motion.DURATION.hitStop, 'one held 70 ms frame');
  assert.ok(plan.burstAt <= 1500, 'payoff inside 1.5 s');
  assert.ok(plan.landAt <= 2600, 'home inside 2.6 s');
  assert.ok(plan.burstScale >= 1.18 && plan.burstScale <= 1.35, 'prize overshoot in the shared range');
  assert.ok(plan.burstSparkles <= motion.PARTICLES.sparkles, 'sparkles within the cap');
  assert.ok(plan.flyAt - plan.burstAt <= 600, 'never a dead hold over 600 ms');
  assert.equal(plan.kickPt, 3);
  assert.equal(wow.catchPlan({ reduced: false, walking: true }).kickPt, 0, 'no screen kick while walking');
  assert.equal(wow.catchPlan({ reduced: false, calm: true }).kickPt, 0, 'no screen kick in calm power');
});

test('Reduce Motion: no wobble, no flight, a short fade; the haptics stay', () => {
  const plan = wow.catchPlan({ reduced: true });
  assert.equal(plan.wobbles.length, 0);
  assert.equal(plan.arcPt, 0);
  assert.ok(plan.landAt <= motion.DURATION.quick);
  const haptics = wow.catchHaptics(plan);
  assert.ok(haptics.some(h => h.intent === 'comboHeavy'), 'the burst still buzzes');
});

test('catch haptics climb tap, tick, light, medium, then the golden heavy and success 180 ms later', () => {
  const plan = wow.catchPlan({ reduced: false });
  const h = wow.catchHaptics(plan);
  assert.deepEqual(plain(h.map(s => s.intent)), ['tapLight', 'tickSelection', 'tapLight', 'hitMedium', 'comboHeavy', 'success']);
  assert.deepEqual(plain(h.map(s => s.at)), [0, 200, 350, 480, plan.burstAt, plan.burstAt + 180]);
  for (let i = 1; i < h.length; i++) assert.ok(h[i].at - h[i - 1].at >= 120, 'one haptic per 120 ms gate');
  const walking = wow.catchHaptics(plan, { walking: true });
  assert.equal(walking[3].intent, 'tapLight', 'walking drops one rung');
  assert.ok(!h.some(s => s.intent === 'failBuzz'), 'no error buzz in a catch');
});

test('wobbleAt alternates sides and peaks at each wobble strength', () => {
  const plan = wow.catchPlan({ reduced: false });
  const peaks = plan.wobbles.map(w => wow.wobbleAt(w.at + 75, plan.wobbles));
  assert.deepEqual(plain(peaks.map(p => Math.round(p))), [8, -12, 16]);
  assert.equal(wow.wobbleAt(10, plan.wobbles), 0);
  assert.equal(wow.wobbleAt(900, plan.wobbles), 0);
});

test('the flight arc starts at the find, ends at home and rises above both', () => {
  const from = { x: 200, y: 500 }, to = { x: 60, y: 60 };
  assert.deepEqual(plain(wow.arcPoint(from, to, 80, 0)), from);
  assert.deepEqual(plain(wow.arcPoint(from, to, 80, 1)), to);
  const mid = wow.arcPoint(from, to, 80, 0.5);
  assert.ok(mid.y < (from.y + to.y) / 2, 'bows upward');
});

test('getting warmer: four bands by distance, each brighter and livelier than the last', () => {
  assert.equal(wow.findBand(400, false), 'far');
  assert.equal(wow.findBand(null, false), 'far');
  assert.equal(wow.findBand(120, false), 'mid');
  assert.equal(wow.findBand(40, false), 'near');
  assert.equal(wow.findBand(400, true), 'inRange');
  const order = ['far', 'mid', 'near', 'inRange'].map(b => wow.BAND_LOOK[b]);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i].level > order[i - 1].level);
    assert.ok(order[i].halo >= order[i - 1].halo, 'the halo only grows');
    assert.ok(order[i].opacity >= order[i - 1].opacity);
  }
  assert.equal(order[0].halo, 0, 'far finds have no glow');
  assert.ok(order[3].rings && !order[2].rings, 'only in range calls with rings');
  assert.equal(wow.BAND_FADE_MS, motion.DURATION.base, 'bands cross-fade, never snap');
});

test('in-range rings expand 1.0 to 2.2 and fade, two of them half a beat apart', () => {
  const a = wow.ringAt(0, 0), b = wow.ringAt(1099, 0);
  assert.equal(a.scale, 1);
  assert.ok(Math.abs(a.opacity - 0.5) < 1e-9);
  assert.ok(b.scale > 2.1 && b.opacity < 0.01);
  const second = wow.ringAt(550, 1);
  assert.equal(second.scale, 1, 'the second ring starts 550 ms later');
});

test('the in-range hop is a quick jump then rest, so a field of finds stays calm', () => {
  let still = 0;
  for (let t = 0; t < 2400; t += 10) if (wow.hopAt(t, 2400, 0).lift === 0) still++;
  assert.ok(still / 240 > 0.7, 'mostly at rest');
  assert.ok(wow.hopAt(180, 2400, 0).lift > 0.99, 'peaks mid-jump');
  assert.ok(wow.hopAt(400, 2400, 0).squash > 0.5, 'squashes on landing');
});

test('the spawn pop: finds arriving together stagger 90 ms, at most 5 pop, the rest fade in', () => {
  const clock = wow.newSpawnClock();
  const booked = Array.from({ length: 7 }, () => wow.bookSpawn(clock, 1000));
  assert.deepEqual(plain(booked.slice(0, 5).map(b => b.delay)), [0, 90, 180, 270, 360]);
  assert.ok(booked.slice(0, 5).every(b => b.pop));
  assert.ok(booked.slice(5).every(b => !b.pop));
  assert.deepEqual(plain(wow.bookSpawn(clock, 5000)), { delay: 0, pop: true }, 'a later wave starts fresh');
  assert.ok(wow.SPAWN.overshoot >= 1.18 && wow.SPAWN.overshoot <= 1.35);
});

test('the odometer rolls only the digits that change, ones first, 30 ms per column', () => {
  const cols = wow.digitColumns('1,349', '1,374');
  assert.deepEqual(plain(cols.map(c => c.to).join('')), '1,374');
  assert.deepEqual(plain(cols.map(c => c.rolls)), [false, false, false, true, true]);
  assert.equal(cols[4].delay, 0, 'the ones roll first');
  assert.equal(cols[3].delay, motion.COUNT.digitStaggerMs);
  const grow = wow.digitColumns('999', '1,000');
  assert.equal(grow.length, 5);
  assert.equal(grow[0].from, null, 'a new leading digit appears');
  assert.equal(wow.rollMs(10, 35), motion.COUNT.ms);
  assert.ok(wow.rollMs(35, 10) < wow.rollMs(10, 35), 'a spend rolls down quicker and quieter');
});

test('the HUD chip rolls on the UI thread and waits for its coins (no per-frame setState)', () => {
  const chip = read('src/components/Topbar/Currency.tsx');
  assert.ok(!/requestAnimationFrame\(tick\)/.test(chip), 'the old JS-thread tick is gone');
  assert.match(chip, /RollingDigits/);
  assert.match(chip, /HUD_BUMP\.peak/);
  assert.match(chip, /onHudPulse/);
  const fly = read('src/context/CurrencyFlyProvider.tsx');
  assert.match(fly, /holdHud\(targetPosition/);
  assert.match(fly, /pulseHud\(targetPosition\)/);
  const digits = read('src/components/Topbar/RollingDigits.tsx');
  assert.ok(!/onLayout/.test(digits), 'no layout callbacks on animated views');
});

test('the catch uses the shared motion language and never punishes a miss', () => {
  const src = read('src/screens/ExploreScreen/HomeCatchMoment.tsx');
  assert.match(src, /catchPlan\(/);
  assert.match(src, /flashPeak\(isDimFlashingLightsEnabled\(\)/, 'the flash respects Dim Flashing Lights');
  assert.match(src, /momentParticles\(PARTICLES\.sparkles/, 'sparkles go through the power budget');
  assert.match(src, /GoldBurst/);
  const common = src.slice(src.indexOf('const plan = catchPlan('), src.indexOf("catchMark('fly')"));
  assert.ok(!/failBuzz/.test(common), 'a missed common catch is soft, never an error buzz');
});

test('the map shark breathes on the shared clock and rests in the background', () => {
  const map = read('src/components/Map.tsx');
  assert.match(map, /AMBIENT\.breathMs/);
  assert.match(map, /!appActive\)/);
  assert.match(map, /\[shark-life\] rest/);
  assert.match(map, /contact = m\.wake\.value/);
});
