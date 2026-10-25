// wow-sound wave 5 round 1 (Oct 24 2026): the sound and buzz that ship with wow-map wave 4 (grand 25th, treat,
// server-commit hold), laid on the UI clock's plan. Real engine on the silent TraceBackend, virtual clock. Nothing
// here can make a sound.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { traceEngine } = require('./helpers/studio-trace-harness.cjs');
const { wowMapCatch } = require('../audio/wowmap-catch-beats.cjs');
const session = require('../audio/trace-catch-session.cjs');

const plain = (v) => JSON.parse(JSON.stringify(v));
const root = path.resolve(__dirname, '../..');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

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
const minGap = (hs) => hs.slice(1).reduce((m, h, k) => Math.min(m, h.t - hs[k].t), Infinity);

let fifty = null;
async function fiftyCatches() {
  if (!fifty) { const { e, catchesAt } = await session.run(); fifty = { e, a: session.analyse(e, catchesAt) }; }
  return fifty;
}

/** A run of quick catches up to `heat`, then catch `opts` (a hot one). */
async function hotCatch(heat, opts) {
  const e = await engine();
  for (let i = 0; i < heat; i++) { await wowMapCatch(e, { repeat: i > 0 }); e.clock.advance(20_000); }
  const r = await wowMapCatch(e, { repeat: true, ...opts });
  return { e, r, v: view(e, r) };
}

test('blocker 1: 50 catches on the wave 4 map (treats, beams, grands, slow answers): no two buzzes under 90 ms apart, nothing after done', async () => {
  const { a } = await fiftyCatches();
  for (const c of a.perCatch) {
    assert.deepEqual(plain(c.flams), [], `#${c.n}: ${c.buzzes.join(' ')}`);
    assert.ok(c.minGapMs >= 90, `#${c.n} closest buzzes ${c.minGapMs} ms`);
    assert.deepEqual(plain(c.afterDone), [], `#${c.n} after done: ${c.afterDone.join(', ')}`);
  }
  const c = (n) => a.perCatch[n - 1];
  // The milestones land cold and hot, as the grade asked: the 10th at heat 5, the 20th at 0, the grand 25th at 5, the 50th at 0.
  assert.deepEqual([c(10).heat, c(20).heat, c(25).heat, c(50).heat], [5, 0, 5, 0]);
  assert.ok(a.perCatch.filter((x) => x.hold > 0).length >= 15, 'a third of the catches wait on a slow answer');
  assert.ok(a.perCatch.some((x) => x.treat && x.hold === 0) && a.perCatch.some((x) => x.treat && x.hold > 0), 'treats with and without a hold');
});

test('blocker 1: the grand 25th: the beam heavy on the held frame, its second heavy one beat after the burst, the success at +180, no thump', async () => {
  const { a } = await fiftyCatches();
  for (const n of [25, 50]) {
    const g = a.perCatch[n - 1];
    assert.equal(g.grand, true);
    assert.equal(g.burst, 'catch.milestone', `#${n} rings the grand shower`);
    assert.deepEqual(plain(g.heavies), [600, g.burstPlanMs + 90], `#${n} heavies (heat ${g.heat})`);
    assert.equal(g.successMs, g.burstPlanMs + 180, `#${n} success keeps its 180 ms`);
    assert.equal(g.thumpMs, -1, `#${n} the grand never thumps (its own second heavy takes that beat)`);
  }
  assert.equal(a.perCatch[24].heat, 5, 'the hot grand');
  assert.equal(a.perCatch[49].heat, 0, 'the cold grand');
});

test('blocker 1: a beam catch with a hot run: beam heavy, thump on burst + 90, success on burst + 180 (wave 4 thumped after the success)', async () => {
  const { a } = await fiftyCatches();
  const b = a.perCatch[9];
  assert.equal(b.beam && !b.grand, true);
  assert.equal(b.heat, 5);
  assert.deepEqual(plain(b.buzzes.filter((x) => /comboHeavy|hitRigid|success/.test(x))), ['comboHeavy@600', 'hitRigid@760', 'success@850']);
});

test('the beam lands on the held frame even when the server answers late (it is in the tap\'s ladder now)', async () => {
  const e = await engine();
  const r = await wowMapCatch(e, { n: 10, serverMs: 1500 });
  const v = view(e, r);
  assert.ok(r.hold > 800, `the clock held ${r.hold} ms`);
  const slam = v.starts('moment:catch.lucky:primary')[0];
  assert.ok(slam, 'the slam plays');
  assert.equal(slam.t, 600 + 20, 'on the held frame (600), not after the hold');
  assert.ok(v.haptics.some((h) => h.intent === 'comboHeavy' && h.t === 600), 'with its heavy buzz');
  const burst = r.delivered.find((d) => d.name === 'burst').at;
  assert.equal(burst, 670 + r.hold, 'the burst waits for the answer');
});

test('fix 3: a burst beat that reaches JS 60 ms late: heavy, thump and success all still buzz, 90 ms apart (the golden triplet keeps its shape)', async () => {
  const { r, v } = await hotCatch(5, { stalls: [{ at: 420, ms: 60 }] });
  const burst = r.delivered.find((d) => d.name === 'burst');
  assert.ok(burst.at - burst.planned >= 50, `the burst came late (${burst.at} vs ${burst.planned})`);
  const at = (intent) => v.haptics.find((h) => h.intent === intent && h.t >= burst.planned)?.t;
  const heavy = at('comboHeavy'), thump = at('hitRigid'), success = at('success');
  assert.ok(heavy !== undefined && thump !== undefined && success !== undefined, v.haptics.map((h) => `${h.intent}@${h.t}`).join(' '));
  assert.equal(heavy, burst.at, 'the heavy on the frame JS got it');
  assert.equal(thump - heavy, 90);
  assert.equal(success - heavy, 180);
  // On time: the thump is exactly on the plan's beat.
  const calm = await hotCatch(5, {});
  const b2 = calm.r.delivered.find((d) => d.name === 'burst');
  assert.equal(calm.v.haptics.find((h) => h.intent === 'hitRigid').t, b2.planned + 90);
});

test('fix 3: wobble ticks after a late first beat are laid on the plan (they fit before the hit-stop), never under 100 ms apart', async () => {
  const e = await engine();
  const r = await wowMapCatch(e, { stalls: [{ at: 190, ms: 120 }] });
  const v = view(e, r);
  const w1 = r.delivered.find((d) => d.name === 'wobble1');
  assert.ok(w1.at >= 300, `the first wobble came ${w1.at - w1.planned} ms late`);
  const ticks = v.starts('moment:catch.wobble:').map((s) => s.t);
  assert.equal(ticks.length, 3);
  for (let i = 1; i < 3; i++) assert.ok(ticks[i] - ticks[i - 1] >= 100, `apart (${ticks.join(', ')})`);
  assert.ok(ticks[2] <= 600 - 50, `the last tick is in the gather, before the held frame (${ticks[2]})`);
  const buzz = v.haptics.filter((h) => h.t > 100 && h.t < 600).map((h) => h.t);
  assert.equal(buzz.length, 3, `three wobble buzzes (${buzz.join(', ')})`);
  assert.ok(minGap(v.haptics.filter((h) => h.t > 100 && h.t < 600)) >= 90);
});

test('fix 3: the stamp always buzzes, even when a frozen turn hands it over with the success and the flight', async () => {
  const { r, v } = await hotCatch(5, { stalls: [{ at: 600, ms: 450 }] });
  const land = r.delivered.find((d) => d.name === 'land');
  assert.ok(land.at - land.planned > 0 || r.delivered.find((d) => d.name === 'success').at >= 1000, 'the turn bunched them');
  const after = v.haptics.filter((h) => h.t >= land.at);
  assert.ok(after.some((h) => h.intent === 'tapLight'), `the stamp's buzz (${v.haptics.map((h) => `${h.intent}@${h.t}`).join(' ')})`);
  assert.ok(!v.marks.some((m) => m.name === 'catch-beat-stale' && /tapLight/.test(m.detail ?? '')), 'never dropped as stale');
  assert.ok(minGap(v.haptics) >= 90, `and no flam (${v.haptics.map((h) => `${h.intent}@${h.t}`).join(' ')})`);
});

test('fix 4: when a stall hands the burst and the flight over together, the slide waits 120 ms after the bell', async () => {
  const e = await engine();
  const r = await wowMapCatch(e, { stalls: [{ at: 650, ms: 600 }] });
  const v = view(e, r);
  const got = Object.fromEntries(r.delivered.map((d) => [d.name, d.at]));
  assert.ok(got.fly - got.burst < 10, `burst ${got.burst} and fly ${got.fly} in one turn`);
  const bell = v.starts('moment:catch.firstOfDay:primary')[0] ?? v.starts('moment:catch.burst:primary')[0];
  const slide = v.starts('moment:catch.fly:primary')[0];
  assert.ok(bell && slide);
  assert.ok(slide.t - bell.t >= 100, `one celebration sound at a time (${slide.t - bell.t} ms)`);
  // Unstalled: the flight's own beat is far behind the bell anyway, nothing is moved.
  const e2 = await engine();
  const r2 = await wowMapCatch(e2, {});
  assert.ok(!view(e2, r2).marks.some((m) => m.name === 'catch-fly-spaced'));
});

test('fix 5: the last counter tick is heard by the done frame on every catch (the merged tick never trails it)', async () => {
  const { a } = await fiftyCatches();
  for (const x of a.perCatch) {
    const coins = x.counterMs.filter((t) => t !== x.barMs);
    assert.ok(coins.every((t) => t <= x.doneMs + 25), `#${x.n} ticks ${x.counterMs.join(', ')} done ${x.doneMs}`);
  }
});

test('fix 6: the burst voicings are heard: each turns its own tail, the nudges only go up, and the heat cap never rings lower', async () => {
  const e = await engine();
  const P = e.Plan;
  for (let n = 1; n <= 8; n++) for (let h = 0; h <= 7; h++) {
    const v = P.burstVoicing(n, h);
    assert.ok(v.semis >= Math.min(4, h), `n ${n} heat ${h}: ${v.semis}`);
  }
  for (let n = 1; n <= 12; n++) {
    assert.ok(P.burstVoicing(n + 1, 6).semis >= P.burstVoicing(n, 5).semis, 'heat 6 never under heat 5');
    assert.ok(P.burstVoicing(n + 1, 7).semis >= P.burstVoicing(n, 6).semis, 'heat 7 never under heat 6');
  }
  for (const name of ['catch.burst', 'catch.repeat']) {
    const sets = e.Map.MOMENTS[name].voicings;
    assert.equal(sets.length, P.BURST_VOICINGS.length, `${name}: one tail per voicing`);
    const keys = sets.map((s) => s.map((l) => `${l.ref}@${l.delayMs}`).join('+'));
    assert.equal(new Set(keys).size, keys.length, `${name}: every tail differs (${keys.join(' | ')})`);
    for (const set of sets) for (const l of set) assert.ok(e.Moments.studioReady(name) && l.ref.startsWith('shared/'), 'approved shared studio cues only');
  }
  const { a } = await fiftyCatches();
  const repeats = a.perCatch.filter((x) => x.burst === 'catch.repeat');
  assert.ok(new Set(repeats.map((x) => x.tail)).size >= 4, `the short show turns its tails (${[...new Set(repeats.map((x) => x.tail))].join(' ')})`);
  // A hot short catch starts the counter one rung higher than the same heat on the full show.
  assert.equal(P.counterLift(4, true), P.counterLift(4, false) + 1);
  assert.equal(P.counterLift(0, true), 0);
});

test('fix 8: the hooks get their own shaped buzz: Daily 3 check, the flame\'s ignite, the chest pop (120 ms apart, kid-safe)', async () => {
  const e = await engine();
  const H = e.Haptics;
  const G = require(path.join(root, 'tools/tests/helpers/ts-module.cjs')).loadTs('src/gamekit/core/hapticGrammar.ts', {}, {});
  for (const [moment, pattern] of [['loop.daily3Check', 'daily3Check'], ['loop.daily3Done', 'streakIgnite'], ['loop.flameGrow', 'streakIgnite'], ['chest.open', 'chestOpen']]) {
    assert.equal(e.Map.MOMENTS[moment].haptic, pattern, moment);
    const steps = G.HAPTIC_PATTERNS[pattern];
    assert.ok(steps.length >= 2, `${pattern} is a sequence`);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i].at - steps[i - 1].at >= 120, `${pattern} clears the 120 ms gate`);
    assert.ok(!steps.some((s) => s.p === 'warning' || s.p === 'error'), `${pattern} never feels like a loss`);
  }
  e.haptics.length = 0;
  const t0 = e.clock.now;
  e.Moments.playMoment('chest.open', { haptic: true });
  for (let i = 0; i < 12; i++) { e.clock.advance(50); await flush(); }
  assert.equal(e.haptics.filter((h) => h.t >= t0).length, 5, `the chest pop's five pulses (${e.haptics.map((h) => `${h.intent}@${h.t - t0}`).join(' ')})`);
  assert.ok(H, 'haptics module loaded');
  const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  assert.match(src('src/components/retention/useRetention.tsx'), /if \(studioReady\(moment\)\) playMoment\(moment, \{ haptic: true \}\);/);
  assert.match(src('src/components/DailyGiftModal.tsx'), /if \(studioReady\('chest\.open'\)\) \{ playMoment\('chest\.open', \{ haptic: true \}\); return; \}/);
  assert.match(src('src/components/retention/RewardReveal.tsx'), /studioReady\('chest\.open'\)\) playMoment\('chest\.open', \{ haptic: true \}\)/);
});

test('HomeCatchMoment hands catchAudio the UI clock: due time per beat, the beam in the tap ladder, the grand mark and its second heavy as a UI beat', () => {
  const src = fs.readFileSync(path.join(root, 'src/screens/ExploreScreen/HomeCatchMoment.tsx'), 'utf8');
  assert.match(src, /runOnJS\(onBeat\)\(b\.kind, b\.arg, Date\.now\(\) - \(t - b\.at\)\)/);
  assert.match(src, /catchBeatAt\(plannedAt\);/);
  assert.match(src, /beats\.value = beam \? \[\.\.\.ladder, \{ at: plan\.hitStopAt, kind: BEAT\.beam, arg: 0 \}\] : ladder;/);
  assert.match(src, /if \(grand\) catchMark\('grand'\);/);
  assert.match(src, /if \(current\.grand\) list\.push\(\{ at: plan\.burstAt \+ 90, kind: BEAT\.haptic, arg: BEAT_HAPTICS\.indexOf\('comboHeavy'\) \}\);/);
  assert.doesNotMatch(src, /catchHaptic\('comboHeavy', 3\); \}, 120\)/, 'no JS timer heavy at +120');
  // A miss takes the beam back out (never a slam on a boing).
  assert.match(src, /grandSV\.value = 0;\n\s+beats\.value = ladder;/);
});

test('release-like capture: catch lines and moment starts (with delays) land in the capture buffer; nothing in a store bundle', async () => {
  const cap = await engine({ dev: false, trace: false, env: { EXPO_PUBLIC_MOTION_CAPTURE: 'HomeCatchPreview', EXPO_PUBLIC_STUDIO_CAPTURE: 'on' } });
  assert.equal(cap.Switch.studioCapture(), 'on');
  assert.equal(cap.Switch.isStudioSoundOn(), true, 'studio on for the A/B, inside the muted run');
  cap.GameAudio.setSfxEnabled(false);
  assert.equal(cap.GameAudio.isSfxEnabled(), true, 'the capture keeps the engine running (master gain pinned to 0)');
  await wowMapCatch(cap, { n: 1 });
  const lines = cap.Catch.catchTraceBuffer.join('\n');
  assert.match(lines, /\[catch-av\] \d+ mark burst/);
  assert.match(lines, /\[moment\] \d+ studio catch\.wobble shared\/coin_tick step=1 \+\d+ms/);
  assert.match(lines, /\[catch-av\] \d+ start catch\.firstOfDay/);
  const off = await engine({ dev: false, trace: false, env: { EXPO_PUBLIC_MOTION_CAPTURE: 'HomeCatchPreview', EXPO_PUBLIC_STUDIO_CAPTURE: 'off' } });
  assert.equal(off.Switch.isStudioSoundOn(), false);
  const store = await engine({ dev: false, trace: false, env: { EXPO_PUBLIC_STUDIO_MUTE: undefined } });
  assert.equal(store.Switch.studioCapture(), null);
  await wowMapCatch(store, { n: 1 });
  assert.equal(store.Catch.catchTraceBuffer.length, 0, 'a store bundle records nothing');
  // Never without the mute: the A/B cannot switch studio sound on in an audible run.
  const loud = await engine({ dev: false, trace: false, env: { EXPO_PUBLIC_STUDIO_MUTE: undefined, EXPO_PUBLIC_MOTION_CAPTURE: 'HomeCatchPreview', EXPO_PUBLIC_STUDIO_CAPTURE: 'on' } });
  assert.equal(loud.Switch.studioCapture(), null);
});

test('live release run (load 100): a wobble buzz that comes too late is dropped rather than flammed into the burst', async () => {
  const { r, v } = await hotCatch(5, { stalls: [{ at: 280, ms: 70 }] });
  const burst = r.delivered.find((d) => d.name === 'burst').at;
  const near = v.haptics.filter((h) => h.t > burst - 90 && h.t < burst);
  assert.deepEqual(plain(near), [], `nothing in the beat before the burst (${v.haptics.map((h) => `${h.intent}@${h.t}`).join(' ')})`);
  assert.ok(minGap(v.haptics) >= 90, v.haptics.map((h) => `${h.intent}@${h.t}`).join(' '));
});

test('live release run (load 100): a late thump timer never pulls the golden success under one beat gap', async () => {
  const { v } = await hotCatch(5, { stalls: [{ at: 425, ms: 40 }, { at: 550, ms: 30 }] });
  const thump = v.haptics.find((h) => h.intent === 'hitRigid');
  const success = v.haptics.find((h) => h.intent === 'success' && h.t > 400);
  assert.ok(thump && success, v.haptics.map((h) => `${h.intent}@${h.t}`).join(' '));
  assert.ok(success.t - thump.t >= 90, `success ${success.t - thump.t} ms after the thump`);
  assert.ok(minGap(v.haptics) >= 90, v.haptics.map((h) => `${h.intent}@${h.t}`).join(' '));
});
