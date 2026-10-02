'use strict';
/**
 * Studio engine pass 4: the haptic priority bus (every game's density rule),
 * Core Haptics patterns (AHAP + expo fallback), bubble-letter stamps, the
 * finisher cam plan, the thermal ladder, the screen-event cap, voice groups,
 * Rez quantization and results tallies.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const bus = loadTs('src/gamekit/core/hapticBus.ts');
const pat = loadTs('src/gamekit/core/hapticPattern.ts');
const grammar = loadTs('src/gamekit/core/hapticGrammar.ts');
const stamps = loadTs('src/gamekit/core/stamps.ts');
const fin = loadTs('src/gamekit/core/finisher.ts');
const thermal = loadTs('src/gamekit/core/thermal.ts');
const gov = loadTs('src/gamekit/core/fxGovernor.ts');
const mix = loadTs('src/gamekit/core/audioMix.ts');
const scoring = loadTs('src/gamekit/core/scoring.ts');

const req = (priority, strength = 3, extra = {}) => ({ priority, strength, ...extra });

// ---------------------------------------------------------------------------
// Haptic bus
// ---------------------------------------------------------------------------

test('haptic bus default = the original grammar (60 ms gap, out-rankers fire, critical always, rivals never)', () => {
  const b = bus.createHapticBus();
  const legacy = grammar.createHapticScheduler(60);
  const seq = [[0, 2, 3], [20, 2, 2], [30, 3, 1], [40, 2, 5], [100, 1, 1], [110, 4, 1], [115, -1, 6], [200, 2, 3]];
  for (const [t, p, st] of seq) {
    const a = bus.busOffer(b, t, req(p, st)) === bus.BUS_FIRE;
    const l = grammar.admitHaptic(legacy, t, st, p);
    assert.equal(a, l, `t=${t} p=${p}`);
  }
  assert.equal(b.queue, null, 'the default bus never queues');
});

test('whack bus: one event per 90 ms, lower ones dropped, a blocked one waits <= 30 ms, higher preempts the queued one', () => {
  const b = bus.createHapticBus('whack');
  const P = bus.WHACK_PRIO;
  assert.equal(bus.busOffer(b, 0, req(P.good)), bus.BUS_FIRE);
  assert.equal(bus.busOffer(b, 30, req(P.quick)), bus.BUS_DROP, '60 ms early: would be delayed > 30 ms, so dropped');
  assert.equal(bus.busOffer(b, 70, req(P.flow)), bus.BUS_QUEUED, '20 ms early: queued');
  assert.equal(b.queue.dueAt, 90);
  assert.equal(bus.busOffer(b, 75, req(P.quick)), bus.BUS_QUEUED, 'a higher one replaces the queued lower one');
  assert.equal(b.queue.priority, P.quick);
  assert.equal(bus.busOffer(b, 80, req(P.flow)), bus.BUS_DROP, 'a lower one never displaces the queue');
  assert.equal(bus.busDue(b, 85), null, 'not due yet');
  const due = bus.busDue(b, 90);
  assert.equal(due.priority, P.quick);
  assert.equal(b.lastAt, 90);
  assert.deepEqual(plain(bus.busStats(b)), { fired: 2, dropped: 2, queued: 2, preempted: 1 });
});

test('whack bus: at most one tell per 300 ms; a queued request that waited too long is dropped, never late', () => {
  const b = bus.createHapticBus('whack');
  assert.equal(bus.busOffer(b, 0, req(5, 2, { tell: true })), bus.BUS_FIRE);
  assert.equal(bus.busOffer(b, 200, req(9, 2, { tell: true })), bus.BUS_DROP, 'tell budget');
  assert.equal(bus.busOffer(b, 320, req(5, 2, { tell: true })), bus.BUS_FIRE);
  assert.equal(bus.busOffer(b, 400, req(6)), bus.BUS_QUEUED);
  assert.equal(bus.busDue(b, 460), null, 'JS timer fired 50 ms late: dropped');
  assert.equal(b.queue, null);
});

test('banana bus: 12/s rate cap, a lower request inside 50 ms of a higher one is dropped', () => {
  const b = bus.createHapticBus('banana');
  assert.equal(bus.busOffer(b, 0, req(6)), bus.BUS_FIRE);
  assert.equal(bus.busOffer(b, 30, req(2)), bus.BUS_DROP, 'shadowed by the higher one');
  let fired = 1;
  for (let t = 84; t < 1000; t += 84) if (bus.busOffer(b, t, req(3)) === bus.BUS_FIRE) fired += 1;
  assert.ok(fired <= 12, `fired ${fired}`);
  assert.equal(bus.busOffer(b, 990, req(3)), bus.BUS_DROP);
});

test('sharky bus: 4 gameplay haptics per second, telegraphs exempt; trivia: 6 per second', () => {
  const b = bus.createHapticBus('sharky');
  let n = 0;
  for (let t = 0; t < 1000; t += 100) if (bus.busOffer(b, t, req(2)) === bus.BUS_FIRE) n += 1;
  assert.equal(n, 4);
  assert.equal(bus.busOffer(b, 960, req(3, 2, { tell: true })), bus.BUS_FIRE, 'a telegraph still fires');
  const t6 = bus.createHapticBus('trivia');
  let m = 0;
  for (let t = 0; t < 1000; t += 70) if (bus.busOffer(t6, t, req(2)) === bus.BUS_FIRE) m += 1;
  assert.equal(m, 6);
});

test('line party bus: own direct hits skip the 120 ms cap, others respect it', () => {
  const b = bus.createHapticBus('lineParty');
  assert.equal(bus.busOffer(b, 0, req(2)), bus.BUS_FIRE);
  assert.equal(bus.busOffer(b, 40, req(1)), bus.BUS_DROP);
  assert.equal(bus.busOffer(b, 50, req(1, 3, { input: true })), bus.BUS_FIRE, 'P1-input exempt');
  bus.configureHapticBus(b, 'rhythmDense');
  assert.equal(b.cfg.minGapMs, 90, 'runtime switch for dense bars');
});

// ---------------------------------------------------------------------------
// Core Haptics patterns
// ---------------------------------------------------------------------------

test('AHAP library: every event is in range; DRUM is always duller than RIM; one pattern = one bus strength', () => {
  for (const [name, p] of Object.entries(pat.AHAP_LIBRARY)) {
    for (const e of p) {
      assert.ok(e.i >= 0 && e.i <= 1 && e.s >= 0 && e.s <= 1, name);
      if (e.kind === 'continuous') assert.ok(e.dur > 0, `${name} continuous needs a duration`);
    }
  }
  const L = pat.AHAP_LIBRARY;
  assert.ok(L.rhythmPerfectDrum[0].s < L.rhythmPerfectRim[0].s);
  assert.ok(L.rhythmGreatDrum[0].s < L.rhythmGreatRim[0].s);
  assert.equal(pat.primitiveFor(0.8, 0.45), 'heavy');
  assert.equal(pat.primitiveFor(0.8, 0.75), 'rigid');
  assert.ok(pat.patternBusStrength(L.whackCounter) > pat.patternBusStrength(L.whackLate));
  assert.equal(pat.patternDurationMs(L.champCrouch), 450);
});

test('expo fallback: pulses under 100 ms merge into the strongest (only the first would play anyway)', () => {
  const steps = plain(pat.fallbackSteps(pat.AHAP_LIBRARY.whackCrit));
  assert.equal(steps.length, 1, 'crit x2 at 40 ms -> one pulse');
  const ko = plain(pat.fallbackSteps(pat.AHAP_LIBRARY.bossKo));
  assert.deepEqual(ko.map((s) => s.at), [0, 150, 280, 400, 650]);
  const purr = plain(pat.fallbackSteps(pat.AHAP_LIBRARY.purrTell));
  assert.deepEqual(purr.map((s) => s.at), [0, 100], 'purr 0/50/100 -> two pulses 100 ms apart');
  for (let i = 1; i < ko.length; i++) assert.ok(ko[i].at - ko[i - 1].at >= 100);
  const strengths = grammar.PRIMITIVE_STRENGTH;
  const fb = plain(pat.fallbackSteps([{ t: 0, kind: 'transient', i: 0.3, s: 0.2 }, { t: 40, kind: 'transient', i: 1, s: 0.5 }]));
  assert.equal(fb.length, 1);
  assert.ok(strengths[fb[0].p] >= strengths.heavy, 'the merged pulse keeps the strongest');
});

test('toAhap: transients and continuous events in seconds, rising ramps start below 1 on a peak-intensity event', () => {
  const a = plain(pat.toAhap(pat.AHAP_LIBRARY.champCrouch, 'champCrouch'));
  assert.equal(a.Version, 1);
  const ev = a.Pattern[0].Event;
  assert.equal(ev.EventType, 'HapticContinuous');
  assert.equal(ev.EventDuration, 0.45);
  assert.equal(ev.EventParameters[0].ParameterValue, 0.6, 'event sits at the peak');
  const curve = a.Pattern.find((p) => p.ParameterCurve && p.ParameterCurve.ParameterID === 'HapticIntensityControl').ParameterCurve;
  assert.deepEqual(curve.ParameterCurveControlPoints.map((c) => c.ParameterValue), [0.333, 1]);
  const crit = plain(pat.toAhap(pat.AHAP_LIBRARY.whackCrit));
  assert.deepEqual(crit.Pattern.map((p) => p.Event.Time), [0, 0.04]);
  assert.deepEqual(plain(pat.alignPattern(pat.AHAP_LIBRARY.whackGood, 25)).map((e) => e.t), [25]);
});

// ---------------------------------------------------------------------------
// Stamps
// ---------------------------------------------------------------------------

test('stamp pose: slams from big with an overshoot, squash frame on landing, holds, drifts up and fades', () => {
  const s = stamps.STAMP_STYLES.sharky;
  const p0 = stamps.stampPose(0, s);
  assert.equal(p0.scale, 1.4);
  let minScale = 9;
  for (let t = 0; t <= s.inMs; t += 5) minScale = Math.min(minScale, stamps.stampPose(t, s).scale);
  assert.ok(minScale < 1, 'outBack overshoots below 1 on a shrinking slam');
  const land = stamps.stampPose(s.inMs + 10, s);
  assert.equal(land.sx, 1.08);
  assert.equal(land.sy, 0.92);
  assert.equal(stamps.stampPose(s.inMs + 100, s).alpha, 1);
  const late = stamps.stampPose(s.inMs + s.holdMs + s.outMs / 2, s);
  assert.ok(late.alpha < 1 && late.alpha > 0 && late.dy < 0);
  assert.equal(stamps.stampPose(stamps.stampTotalMs(s), s).done, true);
  assert.equal(stamps.stampPose(50, stamps.STAMP_STYLES.slab).rotate, -12);
});

test('stamp queue: one at a time FIFO, priority jumps the line, spacing, stale items dropped', () => {
  const q = stamps.createStampQueue({ maxLive: 1, spacingMs: 600, maxWaitMs: 2000 });
  const item = (text, priority, at) => ({ text, x: 0, y: 0, style: stamps.STAMP_STYLES.party, color: '#fff', size: 30, priority, pushedAt: at });
  stamps.stampEnqueue(q, item('A', 0, 0));
  stamps.stampEnqueue(q, item('B', 0, 0));
  stamps.stampEnqueue(q, item('SNATCH', 5, 10));
  assert.equal(stamps.stampTake(q, 10).text, 'SNATCH');
  assert.equal(stamps.stampTake(q, 20), null, 'one on screen');
  const total = stamps.stampTotalMs(stamps.STAMP_STYLES.party);
  assert.equal(stamps.stampNextCheckMs(q, 20), 10 + total - 20);
  assert.equal(stamps.stampTake(q, 10 + total).text, 'A');
  assert.equal(stamps.stampTake(q, 2100), null, 'B waited past 2 s');
  assert.equal(q.dropped, 1);
  const fast = stamps.createStampQueue({ maxLive: 3, spacingMs: 600 });
  stamps.stampEnqueue(fast, item('1', 0, 0));
  stamps.stampEnqueue(fast, item('2', 0, 0));
  assert.ok(stamps.stampTake(fast, 0));
  assert.equal(stamps.stampTake(fast, 100), null, '600 ms spacing between starts');
  assert.ok(stamps.stampTake(fast, 600));
});

// ---------------------------------------------------------------------------
// Finisher
// ---------------------------------------------------------------------------

test('finisher plan: Final Bonk = freeze, then 0.25x slow-mo and push 1.10, 3 rings 150 ms apart, confetti, stinger', () => {
  const plan = plain(fin.finisherPlan(fin.FINISHER_PRESETS.bossDefeat));
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].at >= plan[i - 1].at, 'sorted');
  const kinds = (k) => plan.filter((c) => c.kind === k);
  assert.deepEqual(kinds('freeze').map((c) => [c.at, c.a]), [[0, 160]]);
  assert.deepEqual(kinds('slowmo').map((c) => [c.at, c.a, c.b]), [[160, 0.25, 700]]);
  assert.deepEqual(kinds('push').map((c) => c.a), [1.1]);
  assert.deepEqual(kinds('ring').map((c) => c.at), [160, 310, 460]);
  assert.equal(kinds('confetti')[0].a, 60);
  assert.equal(kinds('shake').length, 1, 'boss shakes');
  assert.equal(fin.finisherPlan(fin.FINISHER_PRESETS.rideWin).filter((c) => c.kind === 'shake').length, 0, 'ride win never shakes');
  assert.equal(fin.finisherPlan(fin.FINISHER_PRESETS.rideWin).find((c) => c.kind === 'confetti').a, 24);
  assert.equal(fin.finisherDuration(fin.FINISHER_PRESETS.bossDefeat), 1300);
});

test('finisher reduced motion: no freeze, slow-mo, push, shake or impact frame; stamp, rings, stinger stay; confetti cut', () => {
  const plan = plain(fin.finisherPlan(fin.FINISHER_PRESETS.bossDefeat, true));
  for (const k of ['freeze', 'slowmo', 'push', 'release', 'shake', 'impact']) assert.equal(plan.filter((c) => c.kind === k).length, 0, k);
  assert.ok(plan.some((c) => c.kind === 'stamp'));
  assert.ok(plan.some((c) => c.kind === 'stinger'));
  assert.ok(plan.find((c) => c.kind === 'confetti').a <= 12);
});

// ---------------------------------------------------------------------------
// Thermal ladder
// ---------------------------------------------------------------------------

function feed(s, ms, durMs) {
  let changed = false;
  for (let t = 0; t < durMs; t += ms) changed = thermal.thermalFrame(s, ms) || changed;
  return changed;
}

test('thermal fallback: median frame time +25% over the Run 1 baseline for 10 s steps down once; never back up mid-run', () => {
  const s = thermal.createThermal();
  feed(s, 16.7, 5000);
  assert.ok(Math.abs(s.baseline - 16.7) < 0.01);
  feed(s, 19, 12000);
  assert.equal(s.level, 0, '+14% is not heat');
  feed(s, 22, 9000);
  assert.equal(s.level, 0, 'not for 10 s yet');
  feed(s, 22, 3000);
  assert.equal(s.level, thermal.THERMAL_FAIR);
  feed(s, 16.7, 20000);
  assert.equal(s.level, thermal.THERMAL_FAIR, 'cooling does not step up inside a run');
  thermal.thermalRunEnd(s);
  assert.equal(s.level, 0, 'between runs it recovers a step');
  assert.equal(thermal.THERMAL_SCALES[2].particleCap, 70);
  assert.equal(thermal.THERMAL_SCALES[3].particleCap, 40);
});

test('thermal native signal wins; serious turns on 60-step mode; 120 Hz with p5 under 100 fps for 5 s does too', () => {
  const s = thermal.createThermal();
  assert.equal(thermal.thermalNative(s, 2), true);
  assert.equal(s.step60, true);
  assert.equal(thermal.thermalParticleCap(s, 200), 70);
  feed(s, 40, 20000);
  assert.equal(s.level, 2, 'frame-time fallback is ignored while native exists');
  const h = thermal.createThermal();
  feed(h, 8.33, 2000);
  assert.equal(h.hz, 120);
  // Every 4th frame takes 14 ms: median stays ~8.3 ms (120 Hz), p5 ~71 fps.
  let changed = false;
  for (let i = 0; i < 1000; i++) changed = thermal.thermalFrame(h, i % 4 === 0 ? 14 : 8.33) || changed;
  assert.equal(h.step60, true);
  assert.ok(changed);
});

// ---------------------------------------------------------------------------
// Governor screen cap, audio groups, quantization, tallies
// ---------------------------------------------------------------------------

test('screen-event cap: at most 2 screen-space moments per 250 ms (off by default); force still counts', () => {
  const off = gov.createFxGovernor();
  for (let i = 0; i < 5; i++) assert.equal(gov.govScreenEvent(off, i), true);
  const g = gov.createFxGovernor({ screenEventsPerWindow: 2, screenWindowMs: 250 });
  assert.equal(gov.govScreenEvent(g, 0), true);
  assert.equal(gov.govScreenEvent(g, 50), true);
  assert.equal(gov.govScreenEvent(g, 100), false);
  assert.equal(gov.govScreenEvent(g, 120, true), true, 'puffer hit / TIME! force through');
  assert.equal(gov.govScreenEvent(g, 260), false, 'the forced one still counts');
  assert.equal(gov.govScreenEvent(g, 380), true);
});

test('feel + screen cap: a capped moment keeps particles, sound and haptic but drops flash, camera and stamp', () => {
  const log = [];
  const feelMod = loadTs('src/gamekit/feel.ts', {
    react: { useCallback: (fn) => fn, useRef: (v) => ({ current: v }) },
    './audio/GameAudio': { GameAudio: { play: (n) => log.push(['play', n]), playLadder: () => undefined, duck: () => undefined } },
    './Haptics': { playHaptic: (p) => log.push(['haptic', p]), playPattern: (p, o) => log.push(['pattern', p, !!o.input]), HP: { own: 2, telegraph: 3 } },
  });
  const deps = {
    governor: gov.createFxGovernor({ screenEventsPerWindow: 1, flashMinGapMs: 0, flashesPerWindow: 9 }),
    now: () => 1000,
    fx: { current: { burst: (e) => log.push(['burst', e]), ring: () => undefined, flash: () => log.push(['flash']), bloom: () => log.push(['bloom']),
      vignette: () => log.push(['vignette']), flyUp: () => undefined } },
    stamps: { current: { push: (t) => log.push(['stamp', t]) } },
    camera: { shake: () => log.push(['shake']), punch: () => log.push(['punch']), kick: () => undefined },
    clock: { hitStop: () => undefined, localStop: () => undefined, slowMo: () => undefined },
  };
  const def = { sfx: 'pop', pattern: 'whackQuick', burst: [{ emitter: 'stars' }], flash: { peak: 0.3 }, shake: 0.2, stamp: { style: 'sharky' } };
  feelMod.fireFeel(def, { x: 1, y: 2, stamp: 'POP!', input: true }, deps);
  assert.deepEqual(log, [['play', 'pop'], ['pattern', 'whackQuick', true], ['shake'], ['burst', 'stars'], ['flash'], ['stamp', 'POP!']]);
  log.length = 0;
  feelMod.fireFeel(def, { x: 1, y: 2, stamp: 'POP!' }, deps);
  assert.deepEqual(log, [['play', 'pop'], ['pattern', 'whackQuick', false], ['burst', 'stars'], ['bloom']],
    'over the cap: particles, sound, haptic and a local bloom only');
});

test('voice groups: a capped group steals its own oldest voice', () => {
  const live = [
    { id: 1, cue: 'crowd_ooh', group: 'crowd', priority: 1, startedAt: 0, endsAt: 0 },
    { id: 2, cue: 'tick_a', group: 'tick', priority: 1, startedAt: 5, endsAt: 0 },
  ];
  const d = mix.allocateVoice(live, { cue: 'crowd_gasp', priority: 1, now: 10, maxVoicesForCue: 3, cooldownMs: 0, lastPlayedAt: -1e9, group: 'crowd', groupCap: 1 }, 12);
  assert.deepEqual(plain(d), { action: 'steal', victimId: 1 });
  const free = mix.allocateVoice(live, { cue: 'tick_b', priority: 1, now: 10, maxVoicesForCue: 3, cooldownMs: 0, lastPlayedAt: -1e9, group: 'tick', groupCap: 3 }, 12);
  assert.deepEqual(plain(free), { action: 'play' });
});

test('Rez quantization: snap to the next 16th only when it is <= 50 ms away', () => {
  const c = { bpm: 136, beatsPerBar: 4, offsetMs: 0 };
  const six = 60000 / 136 / 4; // 110.3 ms
  assert.equal(mix.quantizeDelayMs(c, 0), 0, 'on the grid');
  assert.ok(Math.abs(mix.quantizeDelayMs(c, six - 30) - 30) < 0.01);
  assert.equal(mix.quantizeDelayMs(c, six - 70), 0, '70 ms away: play now');
  assert.ok(Math.abs(mix.quantizeDelayMs({ ...c, offsetMs: 20 }, 10) - 10) < 0.01, 'before the first downbeat');
});

test('results tallies: accelerating ticks climbing 0 -> +12 semitones', () => {
  const t = plain(scoring.tallySchedule(6, 500));
  assert.equal(t.at[0], 0);
  assert.equal(t.at[5], 500);
  const gaps = t.at.slice(1).map((v, i) => v - t.at[i]);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] <= gaps[i - 1], 'each gap shorter');
  assert.deepEqual([t.pitch[0], t.pitch[5]], [0, 12]);
  assert.equal(scoring.tallyTickCount(0), 0);
  assert.ok(scoring.tallyTickCount(12) >= 3 && scoring.tallyTickCount(1e9) === 14);
});
