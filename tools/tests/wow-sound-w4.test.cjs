// wow-sound wave 4 round 1 (Oct 24 2026): the hot catch never loses a tick, the rare beam is the
// loudest catch, the burst never sounds the same twice in a row and climbs with heat, and nothing
// sounds or buzzes after the settle. Real engine on the silent TraceBackend, virtual clock. Nothing
// here can make a sound.
const test = require('node:test');
const assert = require('node:assert/strict');
const { traceEngine } = require('./helpers/studio-trace-harness.cjs');
const { wowMapCatch } = require('../audio/wowmap-catch-beats.cjs');
const session = require('../audio/trace-catch-session.cjs');

const plain = (v) => JSON.parse(JSON.stringify(v));

async function engine(opts = {}) {
  const e = traceEngine(opts);
  e.Catch.resetCatchSoundForTests();
  await e.GameAudio.init();
  return e;
}

function view(e, r) {
  const ev = e.Trace.traceEvents().filter((x) => x.t >= r.t0 - 5);
  const sounds = ev.filter((x) => x.kind === 'sound').map((s) => ({ t: s.t - r.clock0, name: s.name, detail: s.detail })).sort((a, b) => a.t - b.t);
  const haptics = e.haptics.filter((h) => h.t >= r.t0 - 5).map((h) => ({ t: h.t - r.clock0, intent: h.intent }));
  const marks = ev.filter((x) => x.kind === 'mark').map((m) => ({ t: m.t - r.clock0, name: m.name, detail: m.detail }));
  return { sounds, haptics, marks, starts: (prefix) => sounds.filter((s) => s.name.startsWith(prefix)) };
}

const pitchOf = (s) => Number((/pitch (-?[\d.]+)/.exec(s.detail ?? '') ?? [0, 0])[1]);

let fifty = null;
async function fiftyCatches() {
  if (!fifty) { const { e, catchesAt } = await session.run(); fifty = { e, a: session.analyse(e, catchesAt) }; }
  return fifty;
}

/** A run of quick catches up to `heat`, then the hot one with `opts`. */
async function hotCatch(heat, opts) {
  const e = await engine();
  for (let i = 0; i < heat; i++) { await wowMapCatch(e, { repeat: i > 0 }); e.clock.advance(20_000); }
  const r = await wowMapCatch(e, { repeat: true, ...opts });
  return { e, r, v: view(e, r) };
}

// The live heat-5 catch (r5 live-se-catch-hot5.txt): the first wobble beat reached JS about 170 ms late and
// the second came bunched with it, so the second tick was planned past the hit-stop and got cut.
const HOT5_LIVE_STALLS = [{ at: 140, ms: 170 }];

test('fix 2: a heat-5 catch on a busy JS thread keeps both wobble ticks (the hit-stop pulls the late one in)', async () => {
  const { v, r } = await hotCatch(5, { stalls: HOT5_LIVE_STALLS });
  const got = Object.fromEntries(r.delivered.map((d) => [d.name, d.at]));
  assert.ok(got.wobble1 >= 300, `the first wobble beat arrives late like the live run (${got.wobble1})`);
  const ticks = v.starts('moment:catch.wobble:');
  assert.equal(ticks.length, 2, `two ticks heard (${ticks.map((t) => t.t).join(', ')})`);
  assert.ok(v.marks.some((m) => m.name === 'catch-wobble-pulled'), 'the late tick was pulled in, not cut');
  assert.ok(!v.marks.some((m) => m.name === 'catch-wobble-cut'), 'nothing was cut');
  assert.ok(ticks[1].t - ticks[0].t >= 100, 'still apart (no flam)');
  assert.ok(ticks[1].t <= got.burst + 20, 'and the second tick starts before the burst is heard');
});

test('fix 2: a heat-5 catch always has more layers than a heat-0 one (two ticks, heavy, thump, glock), never fewer', async () => {
  const cold = await hotCatch(0, {});
  const hot = await hotCatch(5, { stalls: HOT5_LIVE_STALLS });
  const layers = (v) => ({
    ticks: v.starts('moment:catch.wobble:').length,
    heavy: v.haptics.filter((h) => h.intent === 'comboHeavy').length,
    thump: v.haptics.filter((h) => h.intent === 'hitRigid').length,
    glock: v.starts('moment:catch.hot:').length,
  });
  const c = layers(cold.v); const h = layers(hot.v);
  assert.deepEqual(plain(c), { ticks: 2, heavy: 1, thump: 0, glock: 0 }, 'the calm second catch');
  assert.deepEqual(plain(h), { ticks: 2, heavy: 1, thump: 1, glock: 1 }, 'the hot one keeps everything and adds the thump and the glock, even stalled');
});

test('fix 1: the 10th catch (the beam, full show) is the loudest: slam, duck and heavy buzz on the beam frame, then the bell', async () => {
  const { a, e } = await fiftyCatches();
  const c10 = a.perCatch[9];
  assert.equal(c10.repeat, false, 'wow-map 00100bd0: the 10th catch plays the full show');
  assert.equal(c10.lucky, true, 'the beam slam (catch.lucky sh_star_slam) plays');
  assert.equal(c10.burstHapticMs, 600, 'the heavy buzz lands on the beam (the held frame at 600)');
  assert.equal(c10.burst, 'catch.burst', 'then the bell on the burst');
  const slams = e.Trace.traceEvents().filter((x) => x.kind === 'sound' && x.name.startsWith('moment:catch.lucky:primary'));
  assert.equal(slams.length, 6, 'one slam per beam catch (10, 20, 25, 30, 40, 50)');
  const ducks = e.Trace.traceEvents().filter((x) => x.kind === 'duck');
  for (const s of slams) assert.ok(ducks.some((d) => Math.abs(d.t - s.t) <= 25), 'the slam ducks the bed');
  const c2 = a.perCatch[1];
  assert.ok(c10.sounds > c2.sounds, `more layers than an ordinary catch (${c10.sounds} vs ${c2.sounds})`);
});

test('fix 4: the burst never repeats its voicing back to back, and climbs a semitone per heat rung up to a third', async () => {
  const { a } = await fiftyCatches();
  const voiced = a.perCatch.filter((c) => c.burst === 'catch.repeat' || c.burst === 'catch.burst');
  for (let i = 1; i < voiced.length; i++) {
    if (voiced[i].n === voiced[i - 1].n + 1) assert.notEqual(voiced[i].burstPitch, voiced[i - 1].burstPitch, `#${voiced[i].n} differs from #${voiced[i - 1].n}`);
  }
  const c = (n) => a.perCatch[n - 1];
  assert.equal(c(1).burstPitch, 0, 'the golden chord is played as written');
  assert.ok(c(5).burstPitch > c(2).burstPitch + 2, `heat 4 rings higher than heat 1 (${c(5).burstPitch} vs ${c(2).burstPitch})`);
  for (const x of a.perCatch) assert.ok(x.burstPitch <= 4.4 && x.burstPitch >= -0.3, `#${x.n} stays inside a third (${x.burstPitch})`);
  assert.equal(c(25).burstPitch, 0, 'the grand shower is played as written');
  assert.ok(new Set(voiced.map((x) => x.burstPitch)).size >= 8, 'many different voicings across 50 catches');
});

test('fix 4: the hot glockenspiel is in tune with its burst', async () => {
  const { v } = await hotCatch(5, {});
  const burst = v.starts('moment:catch.repeat:primary')[0];
  const glock = v.starts('moment:catch.hot:')[0];
  assert.ok(burst && glock);
  assert.equal(pitchOf(glock), pitchOf(burst));
  assert.equal(glock.t - burst.t, 40, 'rides 40 ms after the sparkle');
});

test('fix 5: nothing sounds or buzzes after the settle; the counter merges its last ticks into one on the done frame', async () => {
  const { a } = await fiftyCatches();
  for (const x of a.perCatch) assert.deepEqual(plain(x.afterDone), [], `#${x.n} after done: ${x.afterDone.join(', ')}`);
  const short = a.perCatch[1];
  assert.equal(short.doneMs, 1290);
  assert.ok(short.counterMs.every((t) => t <= short.doneMs + 20), `every counter tick by the done frame (${short.counterMs.join(', ')})`);
  // A frozen screen: the coin beats come bunched just before done; the waiting ticks merge into one.
  const { v, r } = await hotCatch(2, { stalls: [{ at: 1140, ms: 140 }] });
  const done = r.delivered.find((d) => d.name === 'done').at;
  const late = v.sounds.filter((s) => s.t > done + 25 && s.name.startsWith('moment:'));
  assert.deepEqual(plain(late), [], 'no sound after done');
  assert.ok(v.marks.some((m) => m.name === 'catch-counter-merged'), 'the bunched ticks were merged');
  assert.ok(!v.haptics.some((h) => h.t > done + 5), 'no buzz after done');
});

test('pitch on a moment: the switch-off fallback is never re-pitched, a ladder ignores it, a one-shot carries it', async () => {
  const off = traceEngine({ trace: false });
  await off.GameAudio.init();
  assert.equal(off.Switch.isStudioSoundOn(), false);
  const calls = [];
  const orig = off.GameAudio.play.bind(off.GameAudio);
  off.GameAudio.play = (k, o) => { calls.push([k, o?.pitch]); return orig(k, o); };
  off.Moments.playMoment('catch.repeat', { pitch: 3 });
  assert.equal(calls[0][0], 'fx.coin', 'switch off: today\'s sound');
  assert.equal(calls[0][1], undefined, 'never re-pitched');
  const e = await engine();
  const flush = () => new Promise((r) => setImmediate(r));
  e.Moments.playMoment('catch.repeat', { pitch: 3 });
  e.Moments.playMoment('catch.wobble', { step: 2, pitch: 3 });
  for (let i = 0; i < 6; i++) await flush();
  e.clock.advance(100);
  for (let i = 0; i < 6; i++) await flush();
  const ev = e.Trace.traceEvents().filter((x) => x.kind === 'sound');
  assert.equal(pitchOf(ev.find((s) => s.name.startsWith('moment:catch.repeat:primary'))), 3);
  assert.equal(pitchOf(ev.find((s) => s.name.startsWith('moment:catch.wobble:'))), 0, 'ladder rungs are pre-rendered');
});
