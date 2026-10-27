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
  assert.match(read('src/context/SoundEffectProvider.tsx'), /if \(studioTraceOn\(\)\) \{[\s\S]{0,560}return;\n\s+\}\n\s+if \(!allowed\)/,
    'legacy expo-av sounds return before createAsync in trace mode');
  assert.match(read('src/gamekit/audio/GameAudio.ts'), /if \(this\.traceMode\) \{[\s\S]{0,200}new TraceBackend[\s\S]{0,120}return;/, 'no native backend is built in trace mode');
});

test('50 catches: the golden chord on the full show, the short sparkle after, the beam slam on wow-map\'s beam catches, the grand shower on the 25th', async () => {
  const { a } = await fiftyCatches();
  const bursts = a.perCatch.map((c) => c.burst);
  assert.equal(bursts[0], 'catch.firstOfDay', 'the first catch is the full show and the first coin of the day');
  const milestones = bursts.map((b, i) => (b === 'catch.milestone' ? i + 1 : 0)).filter(Boolean);
  assert.deepEqual(milestones, [25, 50], 'the grand burst (every 25th catch) rings the shower');
  const slams = a.perCatch.filter((c) => c.lucky).map((c) => c.n);
  assert.deepEqual(slams, [10, 20, 25, 30, 40, 50], 'the beam lands with its slam only when the beam drops');
  // Round 5 (wow-map 00100bd0): the 10th catches are the full show with the beam, so they ring the full bell.
  for (const c of a.perCatch.slice(1)) if (c.burst !== 'catch.milestone') assert.equal(c.burst, c.beam ? 'catch.burst' : 'catch.repeat', `#${c.n}: the short show gets the short sparkle, the beam's full show the bell`);
  for (const c of a.perCatch) assert.deepEqual(plain(c.legacy), [], `#${c.n}: the catch's own pop, chime and whoosh stay quiet (no double sounds)`);
});

test('sync: every catch haptic fires on its own beat, with its sound inside the audio-api output latency', async () => {
  const { a } = await fiftyCatches();
  for (const c of a.perCatch) {
    // Wave 5: the burst after any server hold (the clock waits on the held frame), as the session's own plan says.
    // Wave 5 round 2: on a beam catch the last wobble's buzz gives way to the slam's rigid buzz (550, 120 ms before the
    // burst), and the heavy lands on the burst frame on every show (the beam's too).
    const p = c.repeat ? { burst: c.burstPlanMs, wob: [150, 290] } : { burst: c.burstPlanMs, wob: c.beam ? [200, 350] : [200, 350, 480] };
    assert.ok(c.burstSoundMs !== null && c.burstHapticMs !== null, `#${c.n} has a burst sound and haptic`);
    assert.equal(c.burstHapticMs, p.burst, `#${c.n} the burst buzz is on the visual burst frame`);
    assert.equal(c.slamMs, c.beam ? 550 : -1, `#${c.n} the slam buzz only on a beam catch, on the beam's last fall`);
    const lag = c.burstSoundMs - p.burst;
    assert.ok(lag >= 0 && lag <= 30, `#${c.n} the sound is heard within the audio-api output latency of the burst (${lag} ms)`);
    assert.equal(c.wobbleSoundMs.length, c.repeat ? 2 : 3, `#${c.n} one tick per wobble`);
    assert.deepEqual(plain(c.wobbleHapticMs), p.wob, `#${c.n} wobble buzzes on their beats, even right after a map press buzz`);
    // Each tick with its buzz (a beam catch's third tick rings on its own beat; its buzz moved to the slam).
    c.wobbleSoundMs.slice(0, p.wob.length).forEach((t, i) => { const d = t - c.wobbleHapticMs[i]; assert.ok(d >= 0 && d <= 30, `#${c.n} tick ${i}: ${t} vs ${c.wobbleHapticMs[i]}`); });
    if (c.beam && !c.repeat) assert.equal(c.wobbleSoundMs[2], 480 + 20, `#${c.n} the third tick still rings on its beat`);
    assert.equal(c.tapHaptics, 1, `#${c.n} one pulse at the touch (the map press and the tap never double)`);
  }
});

test('a quick run gets hotter: the wobble and counter ticks climb one rung per quick catch, a pause resets it', async () => {
  const { a } = await fiftyCatches();
  const c = (n) => a.perCatch[n - 1];
  assert.equal(c(1).heat, 0);
  // Wave 5 session: 25 s runs, a 2.5 minute walk after #4 (and #29, #49), 6 minutes after #19, a night after #44.
  for (let n = 2; n <= 4; n++) assert.equal(c(n).heat, n - 1, `catch #${n} in a 25 s run`);
  for (let n = 6; n <= 12; n++) assert.equal(c(n).heat, Math.min(7, n - 5), `catch #${n} in a 25 s run`);
  assert.deepEqual(plain(c(1).wobbleRungs), ['l0', 'l1', 'l2']);
  assert.deepEqual(plain(c(11).wobbleRungs), ['l6', 'l7'], 'the 7th quick catch in a row rings six rungs higher, same short show');
  assert.equal(c(5).heat, 0, 'a 2.5 minute walk resets the run');
  assert.deepEqual(plain(c(5).wobbleRungs), ['l0', 'l1']);
  for (const x of a.perCatch) {
    const top = Math.max(...x.wobbleRungs.map((r) => Number(r.slice(1))));
    assert.ok(top <= 9, `#${x.n} wobble tops out at rung 9 (${top})`);
    assert.ok(x.heat <= 7);
  }
  assert.ok(Number(c(11).counterRungs[0].slice(1)) > Number(c(2).counterRungs[0].slice(1)), 'the counter ticks climb with the run too');
  // The progress bar's gold tick (a NEW find) is always the top note; the coins' own ticks never repeat a rung.
  for (const x of a.perCatch) {
    const coins = x.counterRungs.filter((_, k) => x.counterMs[k] !== x.barMs);
    assert.equal(new Set(coins).size, coins.length, `#${x.n} counter ticks never repeat a rung (${x.counterRungs.join(' ')})`);
  }
  assert.equal(c(11).coreSounds, c(2).coreSounds + 1, 'hotter: the 7th quick catch adds only the bright hot layer (tails aside)');
  assert.ok(430 + 40 + 540 < 1020, 'and it ends before the coin lands in the short show (burst 430 + 40 ms + 540 ms glock, stamp 1020)');
});

test('the grand burst (every 25th catch) rings the rare milestone shower, never longer than the bell', async () => {
  const { a, e } = await fiftyCatches();
  assert.equal(a.perCatch[24].burst, 'catch.milestone', 'catch #25');
  const plan = e.Plan;
  let s = plan.EMPTY_RUN;
  const day = new Date(2026, 9, 24, 9, 0, 0).getTime();
  const seen = [];
  for (let i = 1; i <= 100; i++) {
    const r = plan.burstMoment(s, day + i * 60_000, { repeatPlan: i > 1, beam: i % 10 === 0 || i % 25 === 0 });
    s = r.state;
    if (r.moment === 'catch.milestone') seen.push(i);
  }
  assert.deepEqual(seen, [25, 50, 75, 100]);
  assert.equal(plan.decodeDay(plan.encodeDay(s)).dayCount, 100, 'the day count still survives an app restart the same day');
  assert.deepEqual(plain(plan.decodeDay('2026-10-24')), { dayKey: '2026-10-24', dayCount: 1 }, 'an old stored day (round 2) reads as one catch');
  const m = e.Map.MOMENTS['catch.milestone'];
  assert.ok(Math.max(...m.layers.map((l) => l.delayMs)) + 661 <= 900, 'its last layer ends inside the burst window');
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
  assert.equal(hap.t - t0, 0, 'a fast audio-api cue buzzes in the same call (no timer a busy JS thread could stretch)');
  // A slow expo-av route (an AAC sting, about 80 ms) still waits for its sound.
  e.haptics.length = 0;
  e.clock.advance(5000);
  await e.Moments.preloadMoments(['game.win']);
  await flush();
  const tw = e.clock.now;
  e.Moments.playMoment('game.win', { haptic: true });
  await flush(); e.clock.advance(400); await flush();
  const winHap = e.haptics.find((h) => h.t >= tw);
  assert.ok(winHap && winHap.t - tw >= 60, `the AAC sting's buzz waits for its sound (${winHap && winHap.t - tw} ms)`);

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
