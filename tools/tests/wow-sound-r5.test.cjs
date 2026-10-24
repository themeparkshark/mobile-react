// wow-sound round 5 (Oct 24 2026): the catch sound follows wow-map round 4's picture and its
// UI-thread clock. No flam however busy the JS thread is (the wobble ticks are laid down on the audio
// clock from the first wobble beat, buzzes never land under 90 ms apart, the held breath is silent),
// every counter tick is a coin landing you can see, and the beam on every 10th catch and the grand
// 25th are the only surprises (no sound-only prizes). Everything runs the real engine on the silent
// TraceBackend on a virtual clock. Nothing here can make a sound.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { traceEngine } = require('./helpers/studio-trace-harness.cjs');
const { wowMapCatch, plan } = require('../audio/wowmap-catch-beats.cjs');
const session = require('../audio/trace-catch-session.cjs');

const plain = (v) => JSON.parse(JSON.stringify(v));
const repo = path.resolve(__dirname, '../..');

async function engine(opts = {}) {
  const e = traceEngine(opts);
  e.Catch.resetCatchSoundForTests();
  await e.GameAudio.init();
  return e;
}

/** One catch's sounds and haptics, ms on the catch clock. */
function view(e, r) {
  const ev = e.Trace.traceEvents().filter((x) => x.t >= r.t0 - 5);
  const sounds = ev.filter((x) => x.kind === 'sound').map((s) => ({ t: s.t - r.clock0, name: s.name })).sort((a, b) => a.t - b.t);
  const haptics = e.haptics.filter((h) => h.t >= r.t0 - 5).map((h) => ({ t: h.t - r.clock0, intent: h.intent }));
  const marks = ev.filter((x) => x.kind === 'mark').map((m) => ({ t: m.t - r.clock0, name: m.name, detail: m.detail }));
  return { sounds, haptics, marks, starts: (prefix) => sounds.filter((s) => s.name.startsWith(prefix)) };
}

/** Round 4's live trace on the current bundle: the JS thread ran at 5 to 8 fps, so wow-map's beats arrived bunched. */
const R4_LIVE_STALLS = [{ at: 190, ms: 419 }, { after: 'wobble1', ms: 230 }, { after: 'hitstop', ms: 225 }];

test('fix 2: a stalled JS thread can no longer flam the wobble (round 4 live: two ticks and two buzzes in 1 ms)', async () => {
  const e = await engine();
  const r = await wowMapCatch(e, { stalls: R4_LIVE_STALLS });
  const v = view(e, r);
  const got = Object.fromEntries(r.delivered.map((d) => [d.name, d.at]));
  assert.equal(got.wobble1, 609, 'the replay reproduces the live run: wobble 1 at 609');
  assert.equal(got.wobble2, 839, 'wobble 2 bunched');
  assert.equal(got.wobble3, 839, 'wobble 3 in the same ms as wobble 2 (the round 4 flam)');
  assert.equal(got.burst, 1064, 'burst at 1064 like the live trace');
  const ticks = v.starts('moment:catch.wobble:').map((s) => s.t);
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i] - ticks[i - 1] >= 120, `wobble ticks stay apart (${ticks.join(', ')})`);
  assert.ok(ticks.length >= 2, `at least two rising ticks are heard (${ticks.join(', ')})`);
  const hitstop = got.hitstop;
  assert.ok(ticks.every((t) => t <= hitstop + 25), 'no tick rings through the held breath (later ones are cut)');
  assert.ok(v.marks.some((m) => m.name === 'catch-wobble-cut'), 'the tick that would have rung late was cut');
  const beforeBurst = v.haptics.filter((h) => h.t < got.burst - 1);
  for (let i = 1; i < beforeBurst.length; i++) {
    assert.ok(beforeBurst[i].t - beforeBurst[i - 1].t >= 90, `no two catch buzzes under 90 ms apart before the burst (${beforeBurst.map((h) => `${h.intent}@${h.t}`).join(' ')})`);
  }
  const burst = v.starts('moment:catch.firstOfDay:primary')[0] ?? v.starts('moment:catch.burst:primary')[0];
  assert.ok(burst, 'the burst rings');
  assert.equal(burst.t - got.burst, 20, 'on its own beat (audio-api output 20 ms)');
  assert.ok(v.haptics.some((h) => h.intent === 'comboHeavy' && h.t === got.burst), 'the heavy buzz in the same call');
  const success = v.haptics.find((h) => h.intent === 'success');
  assert.equal(success.t - got.burst, 180, 'the golden pair keeps its 180 ms even when the success beat arrives bunched with the burst');
});

test('fix 2: an unstalled first catch: three even ticks on 200 / 350 / 480, each with its buzz, the burst on 670', async () => {
  const e = await engine();
  const r = await wowMapCatch(e, {});
  const v = view(e, r);
  assert.deepEqual(plain(v.starts('moment:catch.wobble:').map((s) => s.t)), [220, 370, 500]);
  assert.deepEqual(plain(v.starts('moment:catch.wobble:').map((s) => s.name.split('#')[1])), ['l0', 'l1', 'l2'], 'rising');
  const wob = v.haptics.filter((h) => h.t > 100 && h.t < 600);
  assert.deepEqual(plain(wob.map((h) => h.t)), [200, 350, 480]);
  assert.deepEqual(plain(wob.map((h) => h.intent)), ['tickSelection', 'tapLight', 'hitMedium'], 'exactly wow-map\'s buzzes');
  assert.equal(v.starts('moment:catch.firstOfDay:primary')[0].t, 690);
  // The held breath (480 to 670) is silent apart from the third tick's tail.
  assert.ok(!v.sounds.some((s) => s.t > 510 && s.t < 690), 'nothing starts in the hold');
});

test('fix 2: the short show (later catches) gets two ticks on 150 / 290 and the short sparkle on 450', async () => {
  const e = await engine();
  await wowMapCatch(e, {});
  e.clock.advance(20_000);
  const r = await wowMapCatch(e, { repeat: true });
  const v = view(e, r);
  assert.deepEqual(plain(v.starts('moment:catch.wobble:').map((s) => s.t)), [170, 310]);
  assert.equal(v.starts('moment:catch.repeat:primary')[0].t, 470);
  assert.ok(!v.starts('moment:catch.burst:').length && !v.starts('moment:catch.firstOfDay:').length, 'no full bell squeezed into the short show');
});

test('fix 3: every counter tick is a coin you can see landing in the counter; the stamp adds no roll', async () => {
  const e = await engine();
  const r = await wowMapCatch(e, { coins: 10 });
  const v = view(e, r);
  const lands = r.lands; // clock ms, the frames the HUD digits step (hudPulse.streamHud)
  const ticks = v.starts('moment:ui.counterTick:');
  const coinTicks = ticks.filter((s) => s.t < plan(false).tickAt);
  assert.equal(coinTicks.length, 4, 'one tick on every other coin, as wow-map calls them');
  for (const s of coinTicks) {
    const near = lands.some((l) => s.t - l >= 0 && s.t - l <= 25);
    assert.ok(near, `tick at ${s.t} is on a coin landing (${lands.join(', ')})`);
  }
  assert.ok(coinTicks[0].t >= lands[0], 'nothing ticks before the first coin lands (round 4 ticked 330 ms early)');
  const rungs = coinTicks.map((s) => Number(s.name.split('#l')[1]));
  for (let i = 1; i < rungs.length; i++) assert.ok(rungs[i] > rungs[i - 1], `the count only climbs (${rungs.join(' ')})`);
  const land = v.starts('moment:catch.land:')[0];
  assert.ok(land, 'the stamp plays');
  const afterStamp = ticks.filter((s) => s.t > land.t && s.t < plan(false).tickAt);
  assert.equal(afterStamp.length, 0, 'no roll after the stamp');
  assert.ok(!v.marks.some((m) => m.name === 'catch-roll'), 'round 4\'s roll is gone');
  const bar = ticks.find((s) => s.t >= plan(false).tickAt);
  assert.ok(bar && bar.name.endsWith('#l12'), 'the NEW find\'s gold bar tick rings its own top note on the bar frame');
});

test('fix 3: bunched coin beats are spaced on the audio clock (never a flam on the counter)', async () => {
  const e = await engine();
  const r = await wowMapCatch(e, { coins: 10, stalls: [{ at: 1380, ms: 300 }] });
  const v = view(e, r);
  const ticks = v.starts('moment:ui.counterTick:').filter((s) => s.t < plan(false).tickAt).map((s) => s.t);
  assert.equal(ticks.length, 3, `at most three in flight (${ticks.join(', ')})`);
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i] - ticks[i - 1] >= 70, `spaced (${ticks.join(', ')})`);
  assert.ok(!v.marks.some((m) => m.name === 'catch-wobble-cut'), 'nothing was stolen or cut');
});

test('fix 4: the beam (every 10th catch) slams in on the held frame; the grand 25th rings the shower; nothing else surprises', async () => {
  const { e, catchesAt } = await session.run({ catches: 30 });
  const a = session.analyse(e, catchesAt);
  const beams = a.perCatch.filter((c) => c.lucky).map((c) => c.n);
  assert.deepEqual(plain(beams), [10, 20, 25, 30], 'the slam only on wow-map\'s beam catches');
  const milestone = a.perCatch.filter((c) => c.burst === 'catch.milestone').map((c) => c.n);
  assert.deepEqual(plain(milestone), [25], 'the shower only on the grand burst');
  for (const c of a.perCatch) {
    if (!c.beam) assert.ok(!c.lucky && c.burst !== 'catch.milestone', `#${c.n}: no sound-only prize`);
  }
  const beamCatch = catchesAt[9];
  const ev = e.Trace.traceEvents().filter((x) => x.kind === 'sound' && x.name.startsWith('moment:catch.lucky:primary') && x.t >= beamCatch.t0 && x.t < catchesAt[10].t0);
  assert.equal(ev[0].t - beamCatch.clock0, beamCatch.plan.hitStopAt + 20, 'the slam lands with the beam\'s impact (the held frame)');
  const plan = e.Plan;
  assert.equal(typeof plan.luckyEvery, 'undefined', 'the daily lucky count is gone');
  assert.equal(typeof plan.DAY_MILESTONES, 'undefined', 'and the coin-of-the-day milestones');
});

test('fix 4: the burst is the one the picture shows: the full show rings the bell, the golden chord only on a full show', () => {
  const e = traceEngine();
  const P = e.Plan;
  const day = new Date(2026, 9, 24, 9, 0, 0).getTime();
  let s = P.EMPTY_RUN;
  let r = P.burstMoment(s, day, { repeatPlan: false }); s = r.state;
  assert.equal(r.moment, 'catch.firstOfDay');
  r = P.burstMoment(s, day + 10_000, { repeatPlan: true }); s = r.state;
  assert.equal(r.moment, 'catch.repeat');
  r = P.burstMoment(s, day + 600_000, { repeatPlan: false }); s = r.state;
  assert.equal(r.moment, 'catch.burst', 'a full show later in the day (an app restart) is the bell');
  const next = new Date(2026, 9, 25, 9, 0, 0).getTime();
  r = P.burstMoment(s, next, { repeatPlan: true });
  assert.equal(r.moment, 'catch.repeat', 'the golden chord is never squeezed into the short show');
});

test('the map press echo: one buzz at the tap, not two in the same millisecond', async () => {
  const e = await engine();
  const r = await wowMapCatch(e, { pressEcho: true });
  const v = view(e, r);
  const atTap = v.haptics.filter((h) => h.t < -r.clock0 + r.t0 + 60);
  assert.equal(atTap.length, 1, `one pulse for the touch (${atTap.map((h) => h.intent).join(',')})`);
  assert.ok(v.marks.some((m) => m.name === 'catch-press-echo'));
});

test('off means today: switch off, the catch buzzes exactly as planned, plays nothing new, and the flam fix still holds', async () => {
  const e = await engine({ trace: false });
  assert.equal(e.Switch.isStudioSoundOn(), false);
  const r = await wowMapCatch(e, {});
  const wob = e.haptics.filter((h) => h.t > r.clock0 + 100 && h.t < r.clock0 + 600);
  assert.deepEqual(plain(wob.map((h) => h.t - r.clock0)), [200, 350, 480]);
  assert.deepEqual(plain(wob.map((h) => h.intent)), ['tickSelection', 'tapLight', 'hitMedium']);
  e.clock.advance(20_000);
  const before = e.haptics.length;
  const s = await wowMapCatch(e, { stalls: R4_LIVE_STALLS });
  const got = Object.fromEntries(s.delivered.map((d) => [d.name, d.at]));
  const pre = e.haptics.slice(before).filter((h) => h.t < s.clock0 + got.burst - 1);
  for (let i = 1; i < pre.length; i++) assert.ok(pre[i].t - pre[i - 1].t >= 90, 'every player: no flam under a stall');
});

test('a cut voice never starts: expo-av clears its delayed start, the trace takes the sound back out', () => {
  const src = fs.readFileSync(path.join(repo, 'src/gamekit/audio/backends.ts'), 'utf8');
  assert.match(src, /if \(a\.delayMs > 0\) v\.startTimer = setTimeout\(start, a\.delayMs\)/);
  assert.match(src, /stop\(token: number\): void \{\n\s+const v = this\.tokens\.get\(token\);\n\s+if \(!v\) return;\n\s+if \(v\.startTimer\) clearTimeout\(v\.startTimer\);/);
  const e = traceEngine();
  e.GameAudio.registerCues({ probe: { src: 1, maxVoices: 2 } });
  return e.GameAudio.init().then(async () => {
    await e.GameAudio.preload(['probe']);
    e.Trace.clearTrace();
    const id = e.GameAudio.play('probe', { delayMs: 200 });
    assert.ok(id > 0);
    assert.equal(e.Trace.traceEvents().filter((x) => x.kind === 'sound').length, 1);
    e.GameAudio.stop(id);
    assert.equal(e.Trace.traceEvents().filter((x) => x.kind === 'sound').length, 0, 'gone from the trace');
  });
});

test('dev builds do not log every moment to Metro unless a sound trace was asked for', () => {
  const src = fs.readFileSync(path.join(repo, 'src/gamekit/audio/playMoment.ts'), 'utf8');
  assert.doesNotMatch(src, /else console\.log\(out\)/, 'no per-moment console.log in ordinary dev builds');
});
