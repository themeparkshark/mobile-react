// wow-sound round 4 (Oct 24 2026): heat climbs in the hand as well as the ear, Battery Saver keeps only
// the primary and one pulse, and the delayed-start cooldown. (Round 4's counter roll and daily lucky
// count were replaced in round 5: see wow-sound-r5.test.cjs.) Everything runs the real engine on the
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

test('fix 4: heat climbs in the hand: wobble buzzes go one rung heavier at heat 2 and two at heat 4, plus a second thump', async () => {
  const { a } = await fiftyCatches();
  const c = (n) => a.perCatch[n - 1];
  // Round 5: catch 1 is wow-map's full show (three wobbles), later catches its short show (two wobbles, burst at 430 since wow-map 00100bd0).
  assert.deepEqual(plain(c(1).wobbleIntents), ['tickSelection', 'tapLight', 'hitMedium'], 'a calm catch buzzes exactly as wow-map planned');
  assert.deepEqual(plain(c(2).wobbleIntents), ['tickSelection', 'hitMedium'], 'heat 1 is still calm');
  assert.deepEqual(plain(c(3).wobbleIntents), ['tapLight', 'hitMedium'], 'heat 2: one rung heavier, never past medium');
  // Wave 5 session: a walk after #4 cools the run, so #9 is heat 4.
  assert.equal(c(9).heat, 4);
  assert.deepEqual(plain(c(9).wobbleIntents), ['hitMedium', 'hitMedium'], 'heat 4: medium all the way');
  for (const n of [1, 2, 3, 4]) assert.ok(c(n).thumpMs < 0, `#${n} has no second thump`);
  // Wave 5: the thump is on the beat after the burst on the plan (burst + 90, after any server hold), on every show
  // with heat tier 2 except the grand one, whose own second heavy takes that beat.
  for (const x of a.perCatch) {
    const want = x.heat >= 4 && !x.grand;
    assert.equal(x.thumpMs > 0, want, `#${x.n} (heat ${x.heat}${x.grand ? ', grand' : ''}) thump ${x.thumpMs}`);
    if (want) assert.equal(x.thumpMs, x.burstPlanMs + 90, `#${x.n} the thump lands 90 ms after the burst frame`);
  }
  assert.deepEqual(plain(c(5).wobbleIntents), ['tickSelection', 'hitMedium'], 'a walk cools it back down');
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

test('the stamp buzz lands with the stamp, never held behind a coin-stream tick buzz (every player)', () => {
  for (const trace of [true, false]) {
    const e = traceEngine({ trace });
    e.Catch.resetCatchSoundForTests();
    e.Catch.catchMark('tap');
    e.clock.advance(1590);
    e.Catch.catchHaptic('tickSelection', 1); // a coin-stream tick buzz just before the stamp (outside the beat window)
    e.clock.advance(50);
    const t = e.clock.now;
    e.Catch.catchSound('badge');
    e.Catch.catchHaptic('success', 4);
    e.clock.advance(5);
    // Only that one pulse skips the window: the next one waits as before.
    e.Catch.catchHaptic('tickSelection', 1);
    e.clock.advance(300);
    const land = e.haptics.find((h) => h.intent === 'success');
    assert.equal(land.t - t, 0, `trace ${trace}: the stamp buzz is in the same call as the stamp sound`);
    const after = e.haptics.filter((h) => h.t > t && h.intent === 'tickSelection');
    // Round 5: while the catch is open a pulse on top of a beat is dropped (it would buzz 120 ms later on nothing).
    assert.equal(after.length, 0, 'the tick bunched onto the stamp is dropped, not held');
    e.Catch.catchMark('done');
    // Wave 4: a coin buzz right after done is covered by the settle (nothing after the last frame).
    e.Catch.catchHaptic('tickSelection', 1);
    e.clock.advance(10);
    assert.equal(e.haptics.filter((h) => h.t > t + 300 && h.intent === 'tickSelection').length, 0, 'no coin buzz after the settle');
    e.clock.advance(800);
    e.Catch.catchHaptic('tickSelection', 1);
    e.Catch.catchHaptic('tickSelection', 1);
    e.clock.advance(300);
    const gated = e.haptics.filter((h) => h.t > t + 300 && h.intent === 'tickSelection');
    assert.equal(gated.length, 2);
    assert.equal(gated[1].t - gated[0].t, 120, 'after the catch the shared gate is back');
  }
});
