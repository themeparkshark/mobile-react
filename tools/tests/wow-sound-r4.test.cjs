// wow-sound round 4 (Oct 24 2026): the counter rolls up with the stamp instead of trickling, heat
// climbs in the hand as well as the ear, the lucky count moves day to day, Battery Saver keeps only
// the primary and one pulse, and the delayed-roll cooldown. Everything runs the real engine on the
// silent TraceBackend on a virtual clock. Nothing here can make a sound.
const test = require('node:test');
const assert = require('node:assert/strict');
const { traceEngine } = require('./helpers/studio-trace-harness.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');
const session = require('../audio/trace-catch-session.cjs');

const plain = (v) => JSON.parse(JSON.stringify(v));
const flush = () => new Promise((r) => setImmediate(r));

let cached = null;
async function fiftyCatches() {
  if (!cached) {
    const { e, catchesAt } = await session.run({ catches: 50 });
    cached = { e, a: session.analyse(e, catchesAt) };
  }
  return cached;
}

/** One catch the way the live SE trace ran it (round 3): coin-stream ticks during the fly, the stamp, then a slow cascade. */
async function liveLikeCatch(e, { slow = 1 } = {}) {
  const sounds = () => e.Trace.traceEvents().filter((x) => x.kind === 'sound');
  e.Trace.clearTrace();
  const t0 = e.clock.now;
  const at = async (ms) => { e.clock.advance(Math.max(0, t0 + ms - e.clock.now)); await flush(); };
  e.Catch.catchMark('tap'); e.Catch.catchHaptic('tapLight', 3);
  await at(200); e.Catch.catchHaptic('tickSelection', 2);
  await at(350); e.Catch.catchHaptic('tapLight', 2);
  await at(480); e.Catch.catchHaptic('hitMedium', 2);
  await at(670); e.Catch.catchMark('burst'); e.Catch.catchHaptic('comboHeavy', 3);
  await at(850); e.Catch.catchHaptic('success', 3);
  await at(900); e.Catch.catchMark('fly');
  // wow-map streamCoins: 8 coins 40 ms apart, a tick on every other one and the last (pitch 2 + i).
  for (const i of [0, 2, 4, 6, 7]) { await at(910 + i * 40); e.Catch.catchSound('tick', { pitch: 2 + i, volume: 0.45 }); }
  await at(1500); e.Catch.catchSound('badge'); e.Catch.catchHaptic('success', 4);
  // The badge cascade (pitch 2, 4, 6) and the bar tick (pitch 14), stretched like the stalled live run.
  for (let b = 0; b < 3; b++) { await at(1500 + slow * (700 + b * 550)); e.Catch.catchSound('tick', { pitch: 2 + b * 2, volume: 0.7 }); }
  await at(1500 + slow * 3200); e.Catch.catchHaptic('tickSelection', 2); e.Catch.catchSound('tick', { pitch: 14, volume: 0.6 });
  await at(1500 + slow * 3500); e.Catch.catchMark('done');
  e.clock.advance(1000); await flush();
  const list = sounds().map((s) => ({ t: s.t - t0, name: s.name }));
  return { t0, list, haptics: e.haptics.filter((h) => h.t >= t0).map((h) => ({ t: h.t - t0, intent: h.intent })) };
}

test('fix 3: the counter rolls up with the stamp and is done inside 300 ms, even when the cascade crawls', async () => {
  const e = traceEngine();
  e.Catch.resetCatchSoundForTests();
  await e.GameAudio.init();
  const { list, haptics } = await liveLikeCatch(e, { slow: 1 });
  const land = list.find((s) => s.name.startsWith('moment:catch.land:'));
  assert.ok(land, 'the stamp plays');
  const ticks = list.filter((s) => s.name.startsWith('moment:ui.counterTick:'));
  const rungs = ticks.map((s) => Number(s.name.split('#l')[1]));
  for (let i = 1; i < rungs.length; i++) assert.ok(rungs[i] > rungs[i - 1], `the counter only climbs (${rungs.join(' ')})`);
  assert.equal(rungs[rungs.length - 1], 12, 'it lands on the top rung');
  const last = Math.max(...ticks.map((s) => s.t));
  assert.ok(last - land.t <= 300, `the last counter tick is ${last - land.t} ms after the stamp (spec: within 300)`);
  assert.ok(!ticks.some((s) => s.t > land.t + 300), 'the crawling cascade and bar tick add no sound seconds later');
  assert.ok(!haptics.some((h) => h.t > 1500 + 400 && h.intent === 'tickSelection'), 'and no late bar buzz with no sound');
  const before = ticks.filter((s) => s.t < land.t).length;
  assert.equal(before, 4, 'the coin-stream ticks still climb as the coins fly in (the last two, 40 ms apart, merge under the 45 ms cooldown)');
});

test('fix 3: the roll is three ticks scheduled from one call (audio clock), 70 ms apart, the last one louder', async () => {
  const e = traceEngine();
  e.Catch.resetCatchSoundForTests();
  await e.GameAudio.init();
  const { list } = await liveLikeCatch(e);
  const land = list.find((s) => s.name.startsWith('moment:catch.land:'));
  const roll = list.filter((s) => s.name.startsWith('moment:ui.counterTick:') && s.t > land.t);
  assert.equal(roll.length, 3);
  assert.deepEqual(plain(roll.map((s) => s.t - land.t).map((d) => Math.round(d / 10) * 10)), [70, 140, 210]);
  const marks = e.Trace.traceEvents().filter((x) => x.kind === 'mark' && x.name === 'catch-roll');
  assert.equal(marks.length, 1, 'one roll per catch');
});

test('fix 4: heat climbs in the hand: wobble buzzes go one rung heavier at heat 2 and two at heat 4, plus a second thump', async () => {
  const { a } = await fiftyCatches();
  const c = (n) => a.perCatch[n - 1];
  assert.deepEqual(plain(c(1).wobbleIntents), ['tickSelection', 'tapLight', 'hitMedium'], 'a calm catch buzzes exactly as wow-map planned');
  assert.deepEqual(plain(c(2).wobbleIntents), ['tickSelection', 'tapLight', 'hitMedium'], 'heat 1 is still calm');
  assert.deepEqual(plain(c(3).wobbleIntents), ['tapLight', 'hitMedium', 'hitMedium'], 'heat 2: one rung heavier, never past medium');
  assert.deepEqual(plain(c(5).wobbleIntents), ['hitMedium', 'hitMedium', 'hitMedium'], 'heat 4: medium all the way');
  for (const n of [1, 2, 3, 4]) assert.ok(c(n).thumpMs < 0, `#${n} has no second thump`);
  for (const n of [5, 6, 7]) assert.equal(c(n).thumpMs, 760, `#${n} lands a crisp second thump 90 ms after the 670 ms burst`);
  assert.deepEqual(plain(c(8).wobbleIntents), ['tickSelection', 'tapLight', 'hitMedium'], 'a walk cools it back down');
});

test('fix 4: heat brightens the burst from heat 5 (a glockenspiel layer), and wow-map can read the same number', async () => {
  const { a } = await fiftyCatches();
  const hot = a.perCatch.filter((x) => x.hot).map((x) => x.heat);
  assert.ok(hot.length >= 8, `hot catches: ${hot.length}`);
  assert.ok(hot.every((h) => h >= 5), 'only heat 5 and up');
  assert.ok(a.perCatch.filter((x) => x.heat >= 5).every((x) => x.hot), 'every heat 5+ catch gets it');
  // The heat number is there for the visuals with the switch off too.
  const e = traceEngine({ trace: false });
  e.Catch.resetCatchSoundForTests();
  assert.equal(e.Switch.isStudioSoundOn(), false);
  for (let i = 0; i < 4; i++) { e.Catch.catchMark('tap'); e.Catch.catchMark('burst'); e.Catch.catchMark('done'); e.clock.advance(20_000); }
  e.Catch.catchMark('tap');
  assert.equal(e.Catch.currentCatchHeat(), 4, 'the 5th quick catch is heat 4 for every player');
  e.clock.advance(150_000);
  e.Catch.catchMark('tap');
  assert.equal(e.Catch.currentCatchHeat(), 0, 'a pause resets it');
});

test('off means today: with the switch off the catch buzzes exactly as planned (no heat climb, no thump) and plays nothing new', async () => {
  const e = traceEngine({ trace: false });
  e.Catch.resetCatchSoundForTests();
  await e.GameAudio.init();
  const runs = [];
  for (let i = 0; i < 6; i++) { runs.push(await liveLikeCatch(e)); e.clock.advance(20_000); }
  for (const r of runs) {
    const wob = r.haptics.filter((h) => h.t > 100 && h.t < 600).map((h) => h.intent);
    assert.deepEqual(plain(wob), ['tickSelection', 'tapLight', 'hitMedium']);
    assert.ok(!r.haptics.some((h) => h.intent === 'hitRigid'), 'no thump');
    assert.equal(r.list.filter((s) => s.name.startsWith('moment:')).length, 0, 'no studio moment');
  }
});

test('fix 5: the lucky count moves day to day inside 10..14, the same for everyone, never random', () => {
  const plan = loadTs('src/gamekit/audio/catchSoundPlan.ts');
  const seen = new Map();
  const d0 = new Date(2026, 0, 1).getTime();
  const values = [];
  for (let i = 0; i < 365; i++) {
    const key = plan.localDayKey(d0 + i * 86_400_000 + 3_600_000);
    const n = plan.luckyEvery(key);
    assert.ok(n >= 10 && n <= 14, `${key}: ${n}`);
    assert.equal(plan.luckyEvery(key), n, 'deterministic');
    values.push(n);
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  assert.equal(seen.size, 5, 'every value in the range turns up');
  for (const [n, count] of seen) assert.ok(count > 40, `${n} appears ${count} times in a year`);
  let same = 0;
  for (let i = 1; i < values.length; i++) if (values[i] === values[i - 1]) same++;
  assert.ok(same < 120, `the count changes most days (${same} repeats in 365)`);
  // Milestones win over a lucky coin on the same count.
  let s = plan.EMPTY_RUN;
  const day = new Date(2026, 9, 24, 9, 0, 0).getTime();
  const out = [];
  for (let i = 1; i <= 50; i++) { const r = plan.burstMoment(s, day + i * 300_000); s = r.state; out.push(r.moment); }
  assert.equal(out[24], 'catch.milestone');
  assert.equal(out[49], 'catch.milestone');
  assert.deepEqual(out.map((m, i) => (m === 'catch.lucky' ? i + 1 : 0)).filter(Boolean), [11, 22, 33, 44]);
});

test('fix 6: Battery Saver keeps the moment but plays only its primary and one pulse (no layers, no shaped pattern)', async () => {
  const e = traceEngine();
  e.Catch.resetCatchSoundForTests();
  await e.GameAudio.init();
  let shaped = 0;
  e.Haptics.setNativeHapticPlayer({ play: () => { shaped++; } });
  const sounds = () => e.Trace.traceEvents().filter((x) => x.kind === 'sound').map((x) => x.name);
  e.Trace.clearTrace();
  const h0 = e.haptics.length;
  e.Moments.playMoment('catch.firstOfDay', { haptic: true });
  e.clock.advance(800); await flush();
  const full = sounds().filter((n) => n.startsWith('moment:catch.firstOfDay:'));
  assert.ok(full.some((n) => n.includes(':layer0')) && full.some((n) => n.includes(':layer1')), 'saver off: the chord has its layers');
  assert.equal(shaped, 1, 'saver off: the shaped Core Haptics pattern plays when the binary has it');
  e.Power.setBatterySaver(true);
  e.clock.advance(5000);
  e.Trace.clearTrace();
  const h1 = e.haptics.length;
  e.Moments.playMoment('catch.firstOfDay', { haptic: true });
  e.clock.advance(800); await flush();
  const saver = sounds().filter((n) => n.startsWith('moment:catch.firstOfDay:'));
  assert.deepEqual(plain(saver.map((n) => n.split('#')[0])), ['moment:catch.firstOfDay:primary'], 'saver on: the primary alone');
  assert.equal(shaped, 1, 'saver on: no shaped pattern');
  assert.deepEqual(plain(e.haptics.slice(h1).map((h) => h.intent)), ['comboHeavy'], 'saver on: one pulse on the beat');
  // The catch under Battery Saver: no hot layer, no thump, a one-tick roll.
  for (let i = 0; i < 6; i++) { await liveLikeCatch(e); e.clock.advance(20_000); }
  const r = await liveLikeCatch(e);
  assert.ok(!r.list.some((s) => s.name.startsWith('moment:catch.hot:')), 'no hot layer');
  assert.ok(!r.haptics.some((h) => h.intent === 'hitRigid'), 'no second thump');
  const land = r.list.find((s) => s.name.startsWith('moment:catch.land:'));
  assert.equal(r.list.filter((s) => s.name.startsWith('moment:ui.counterTick:') && s.t > land.t).length, 1, 'the roll is just the top tick');
  e.Power.setBatterySaver(false);
  e.Haptics.setNativeHapticPlayer(null);
});

test('engine: the cooldown compares scheduled starts, so a queued roll is not merged (and an immediate double still is)', () => {
  const mix = loadTs('src/gamekit/core/audioMix.ts');
  const base = { cue: 'c', priority: 1, maxVoicesForCue: 3, cooldownMs: 45, now: 1000 };
  assert.equal(mix.allocateVoice([], { ...base, lastPlayedAt: 1070, at: 1140 }, 8).action, 'play', '70 ms apart on the audio clock');
  assert.equal(mix.allocateVoice([], { ...base, lastPlayedAt: 1000, at: 1000 }, 8).action, 'drop', 'two at once still merge');
  assert.equal(mix.allocateVoice([], { ...base, lastPlayedAt: 980 }, 8).action, 'drop', 'no `at`: exactly the old rule');
  assert.equal(mix.allocateVoice([], { ...base, lastPlayedAt: 900 }, 8).action, 'play');
});
