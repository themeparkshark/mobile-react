// wow-sound round 2 (Oct 24 2026): the silent studio trace, haptic sync and the 10th-catch feel.
// Everything runs the real engine (playMoment -> GameAudio -> MusicDirector) on TraceBackend,
// which has no audio module at all, on a virtual clock. Nothing here can make a sound.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { traceEngine } = require('./helpers/studio-trace-harness.cjs');
const session = require('../audio/trace-catch-session.cjs');

const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));
const plain = (v) => JSON.parse(JSON.stringify(v));

let cached = null;
async function fiftyCatches() {
  if (!cached) {
    const { e, catchesAt } = await session.run({ catches: 50 });
    cached = { e, a: session.analyse(e, catchesAt) };
  }
  return cached;
}

test('trace mode: the whole engine runs on the silent TraceBackend and never opens audio', async () => {
  const { e } = await fiftyCatches();
  assert.equal(e.GameAudio.backendName, 'trace');
  assert.equal(e.audio.touched, 0, 'no expo-av player, audio session or audio-api context was created');
  assert.equal(e.Switch.isStudioSoundOn(), true, 'trace turns the studio path on even with EXPO_PUBLIC_STUDIO_MUTE=1');
  assert.ok(e.Trace.traceEvents().some((x) => x.kind === 'duck'), 'ducks run (and are logged)');
});

test('trace mode is dev only: a release build ignores EXPO_PUBLIC_STUDIO_TRACE', () => {
  const e = traceEngine({ dev: false });
  assert.equal(e.Trace.studioTraceOn(), false);
  assert.equal(e.Switch.isStudioSoundOn(), false);
  assert.match(read('src/context/SoundEffectProvider.tsx'), /if \(studioTraceOn\(\)\) \{[\s\S]{0,260}return;\n\s+\}\n\s+if \(isReady && !player\?\.enabled_sound_effects\)/,
    'legacy expo-av sounds return before createAsync in trace mode');
  assert.match(read('src/gamekit/audio/GameAudio.ts'), /if \(this\.traceMode\) \{[\s\S]{0,200}new TraceBackend[\s\S]{0,120}return;/, 'no native backend is built in trace mode');
});

test('50 catches: the first of the day, quick repeats, a lucky shower every 12th, the full bell after a walk', async () => {
  const { a } = await fiftyCatches();
  const bursts = a.perCatch.map((c) => c.burst);
  assert.equal(bursts[0], 'catch.firstOfDay');
  assert.equal(bursts[35], 'catch.firstOfDay', 'the next morning starts with the golden chord again');
  for (const n of [12, 24, 48]) assert.equal(bursts[n - 1], 'catch.lucky', `catch #${n}`);
  assert.equal(bursts[21], 'catch.burst', 'after a 6 minute walk the full bell comes back');
  const repeats = bursts.filter((b) => b === 'catch.repeat').length;
  assert.ok(repeats >= 30, `most catches in a run are the short repeat (${repeats})`);
  for (const c of a.perCatch) assert.deepEqual(plain(c.legacy), [], `#${c.n}: the catch's own pop, chime and whoosh stay quiet (no double sounds)`);
});

test('sync: every burst sound starts with the burst haptic, every wobble tick with its wobble haptic (<= 10 ms)', async () => {
  const { a } = await fiftyCatches();
  for (const c of a.perCatch) {
    assert.ok(c.burstSoundMs !== null && c.burstHapticMs !== null, `#${c.n} has a burst sound and haptic`);
    assert.ok(Math.abs(c.burstSoundMs - c.burstHapticMs) <= 10, `#${c.n} burst ${c.burstSoundMs} vs ${c.burstHapticMs}`);
    assert.ok(c.burstSoundMs - 670 <= 25, `#${c.n} the burst is heard within one frame and a bit of the visual burst (670 ms)`);
    assert.equal(c.wobbleSoundMs.length, 3, `#${c.n} three wobble ticks`);
    c.wobbleSoundMs.forEach((t, i) => assert.ok(Math.abs(t - c.wobbleHapticMs[i]) <= 10, `#${c.n} tick ${i}: ${t} vs ${c.wobbleHapticMs[i]}`));
  }
});

test('the 10th time: round-robin never repeats back to back, the coin ladder restarts after a pause, repeats are shorter', async () => {
  const { e, a } = await fiftyCatches();
  assert.equal(a.hits.length, 12);
  for (let i = 1; i < a.hits.length; i++) assert.notEqual(a.hits[i], a.hits[i - 1], `hit ${i}`);
  for (const run of a.ladderRuns) assert.deepEqual(plain(run), ['l3', 'l4', 'l5', 'l6', 'l7'], 'each catch climbs from the ladder base again');
  const len = (moment) => {
    const def = e.Map.MOMENTS[moment];
    const tail = Math.max(0, ...(def.layers ?? []).map((l) => l.delayMs));
    return tail + (moment === 'catch.repeat' ? 499 : 760);
  };
  assert.ok(len('catch.repeat') < len('catch.burst') && len('catch.burst') < len('catch.firstOfDay') + 1);
  assert.ok(!e.Map.MOMENTS['catch.repeat'].layers, 'the repeat is one short sparkle');
  assert.ok(!e.Map.MOMENTS['catch.repeat'].duck, 'the repeat does not dip the music');
});

test('playMoment haptics: app moments wait for the cue latency; game moments honour delayMs; AHAP when native', async () => {
  const e = traceEngine();
  await e.GameAudio.init();
  e.Trace.clearTrace();
  const t0 = e.clock.now;
  e.Moments.playMoment('catch.burst', { haptic: true });
  await flush(); e.clock.advance(400); await flush();
  const snd = e.Trace.traceEvents().find((x) => x.kind === 'sound' && x.name.startsWith('moment:catch.burst:primary'));
  const hap = e.haptics.find((h) => h.t >= t0);
  assert.ok(snd && hap);
  assert.equal(snd.t - t0, 20, 'the sound is heard after the audio-api latency');
  assert.equal(hap.t - t0, 20, 'and the buzz lands with it, not 20 ms early');

  // Game context with a delay: the buzz waits for the delayed sound (it used to fire at once).
  e.haptics.length = 0;
  const t1 = e.clock.now;
  e.Moments.playMoment('game.crit', { haptic: true, context: 'game', delayMs: 150 });
  e.clock.advance(100);
  assert.equal(e.haptics.filter((h) => h.t >= t1).length, 0, 'nothing before the delay');
  e.clock.advance(200);
  assert.ok(e.haptics.some((h) => h.t >= t1 + 150), 'the crit lands after its delay');

  // Native Core Haptics: the shaped pattern, with t = 0 on the burst.
  const played = [];
  e.Haptics.setNativeHapticPlayer({ play: (ahap, delay) => played.push({ ahap, delay }) });
  e.clock.advance(1000);
  e.Moments.playMoment('catch.burst', { haptic: true });
  e.clock.advance(100);
  assert.equal(played.length, 1, 'one AHAP for the burst');
  const first = played[0].ahap.Pattern[0].Event;
  assert.equal(first.Time, 0);
  assert.equal(first.EventParameters.find((p) => p.ParameterID === 'HapticIntensity').ParameterValue, 1, 'the heavy hit is at t = 0, on the burst');
  played.length = 0;
  e.clock.advance(1000);
  e.Moments.playMoment('catch.burst', { haptic: true, walking: true });
  e.clock.advance(100);
  assert.equal(played.length, 0, 'walking drops a rung to the plain pattern, no AHAP');
  e.Haptics.setNativeHapticPlayer(null);
});

test('switch off: the catch marks play nothing and catch haptics fire at once (today, unchanged)', async () => {
  const e = traceEngine({ trace: false });
  e.Catch.resetCatchSoundForTests();
  assert.equal(e.Switch.isStudioSoundOn(), false);
  const t0 = e.clock.now;
  e.Catch.catchMark('tap');
  e.Catch.catchHaptic('comboHeavy', 3);
  assert.equal(e.haptics.length, 1);
  assert.equal(e.haptics[0].t, t0, 'no added latency while the switch is off');
  e.clock.advance(1000);
  e.Catch.catchMark('burst');
  assert.equal(e.Trace.traceEvents().length, 0, 'no studio moment ran');
});

test('catch.tap carries the gather AHAP; momentCatch starts on the burst', () => {
  const e = traceEngine();
  assert.equal(e.Map.MOMENTS['catch.tap'].ahap, 'momentCatchGather');
  assert.equal(e.Map.MOMENTS['catch.burst'].ahap, 'momentCatch');
  const pattern = require('./helpers/ts-module.cjs').loadTs('src/gamekit/core/hapticPattern.ts');
  const lib = pattern.AHAP_LIBRARY;
  assert.deepEqual(plain(lib.momentCatchGather.filter((x) => x.kind === 'transient').map((x) => x.t)), [0, 200, 350, 480], 'the gather sits on the wobble haptics');
  assert.equal(lib.momentCatch[0].t, 0);
  assert.equal(lib.momentCatch[0].i, 1);
  const plan = require('./helpers/ts-module.cjs').loadTs('src/gamekit/audio/catchSoundPlan.ts');
  assert.deepEqual([...plan.CATCH_WOBBLE_TICKS_MS], [200, 350, 480]);
});
