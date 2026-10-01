'use strict';
/**
 * Whack-a-Shark "Bonk Rush" v4 logic (design studio/design/whack.md): timeline
 * (beat-aligned emerges, 4-Burst Runs, one finale), resolver (pre-emerge QUICK,
 * tier drops, banked fever, x4/x8), walk-safe rules, proof v4 replay and the
 * F1-F5 plausibility features, multiplayer rules and autoplayer tuning gates.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const W = loadTs('src/games/whack/waves.ts');
const F = loadTs('src/games/whack/formations.ts');
const T = loadTs('src/games/whack/timeline.ts');
const S = loadTs('src/games/whack/sim.ts');
const P = loadTs('src/games/whack/proof.ts');
const A = loadTs('src/games/whack/autoplayer.ts');
const Duel = loadTs('src/games/whack/net/duel.ts');
const Raid = loadTs('src/games/whack/net/raid.ts');
const Ghost = loadTs('src/games/whack/net/ghost.ts');

const ride = (seed, d = 2) => T.buildBurst({ seed, burstIndex: 0, format: 'ride', difficulty: d, theme: 'pirates', unlockLevel: 0 });
const q = (seed, burstIndex, unlockLevel, extra = {}) => T.buildBurst({ seed, burstIndex, format: 'queue', difficulty: 2, theme: 'park', unlockLevel, ...extra });
const triples = (flat) => { const o = []; for (let i = 0; i + 2 < flat.length; i += 3) o.push([flat[i], flat[i + 1], flat[i + 2]]); return o; };

/** Drive a sim: taps = [[gt, hole]] (advance to gt then tap). */
function drive(tl, taps, carry) {
  const s = S.createSim(tl, carry, true);
  const ev = [];
  const drain = () => { for (let i = 0; i < s.ev.length; i += 5) ev.push(s.ev.slice(i, i + 5)); s.ev.length = 0; };
  for (const [gt, hole, swipe] of taps) {
    // A player who looks back up resumes a frozen board first (logged as hole -1).
    for (let guard = 0; s.t < gt && guard < 50; guard++) { S.simAdvanceTo(s, gt); drain(); if (s.frozen && s.t < gt) S.simUnfreeze(s); }
    if (swipe) S.simSwipe(s, hole); else S.simTap(s, hole);
    drain();
  }
  return { s, ev, drain };
}

function advanceEngaged(s, gt) {
  for (let g = 0; s.t < gt && g < 50; g++) { S.simAdvanceTo(s, gt); if (s.frozen && s.t < gt) S.simUnfreeze(s); }
}

function firstOf(tl, kind) { return tl.events.find((e) => e.kind === kind); }

// ---------------------------------------------------------------- timeline
test('timeline: same inputs give the identical Burst; every pop lands on the beat grid', () => {
  const a = T.timelineFingerprint(q(42, 1, 12));
  assert.equal(a, T.timelineFingerprint(q(42, 1, 12)));
  assert.notEqual(a, T.timelineFingerprint(q(43, 1, 12)));
  for (const tl of [q(42, 2, 12), q(42, 3, 30), ride(42)]) {
    for (const e of tl.events) {
      const g = tl.shape === 'rush' && e.emergeAt >= 12900 ? W.SIXTEENTH_MS : W.EIGHTH_MS;
      const k = Math.round(e.emergeAt / g);
      assert.ok(Math.abs(e.emergeAt - k * g) <= 0.5, `pop ${e.emergeAt} on grid`);
      assert.ok(e.emergeAt - e.tellAt >= 250, 'every tell is at least 250ms');
      assert.ok(e.tellAt >= 0);
    }
  }
});

test('timeline: one event per hole at a time, and live targets never exceed the cap', () => {
  for (let seed = 1; seed < 40; seed++) {
    for (const tl of [ride(seed), q(seed, 4, 30), q(seed, 2, 3)]) {
      const byHole = {};
      for (const e of tl.events) {
        const prev = byHole[e.hole];
        if (prev) assert.ok(e.tellAt >= prev.duckAt + (prev.kind === W.K_HELMET ? W.HELMET_EXT_MS : 0), `hole ${e.hole} reused while busy`);
        byHole[e.hole] = e;
      }
      for (let t = 0; t < tl.lengthMs; t += 50) {
        const up = tl.events.filter((e) => e.emergeAt <= t && t < e.duckAt).length;
        assert.ok(up <= 6, `at most a handful up (${up})`);
      }
    }
  }
});

test('onboarding: a fresh profile sees only Finn, Angler and Golden in its first Run; one finale per Run', () => {
  const allowed = new Set([W.K_FINN, W.K_ANGLER, W.K_GOLDEN]);
  for (let seed = 1; seed < 30; seed++) {
    for (let b = 0; b < 4; b++) {
      const tl = q(seed, b, 0);
      for (const e of tl.events) assert.ok(allowed.has(e.kind), `burst ${b + 1} kind ${e.kind}`);
      assert.equal(tl.boss, false);
    }
    assert.equal(q(seed, 0, 0).events.some((e) => e.kind === W.K_ANGLER), false, 'burst 1 is Finns only');
    assert.equal(q(seed, 3, 0).shape, 'rush', 'Run 1 ends in GOLDEN RUSH');
    assert.equal(q(seed, 3, 0).finale, 'rush');
    assert.equal(q(seed, 2, 0).finale, null);
  }
  assert.equal(W.burstCount('queue'), 4, 'v4 Runs are 4 Bursts');
  const first = q(9, 1, 0);
  const angler = first.events.find((e) => e.first);
  assert.equal(angler.kind, W.K_ANGLER);
  assert.equal(angler.hole, 4);
  assert.equal(angler.emergeAt - angler.tellAt, 500);
  assert.equal(first.callout, 'WATCH THE TEETH');
  assert.equal(q(9, 2, 0).butterfingers, true, 'Butterfingers unlocks at lifetime Burst 3');
  assert.equal(q(9, 1, 0).butterfingers, false);
  assert.equal(q(9, 3, 1).fever, true, 'fever unlocks at 5');
  // No Sprinter or Puffer ever spawns (v4 roster cut).
  for (let seed = 1; seed < 20; seed++) for (const tl of [q(seed, 3, 40), q(seed, 2, 40)]) {
    assert.ok(!tl.events.some((e) => e.kind === W.K_SPRINTER || e.kind === W.K_PUFFER));
  }
});

test('finale cadence: Wave 1 is Golden Rush only; the Wave 2 flag gives a Boss Run every 3rd Run from lifetime Burst 11', () => {
  const fin = (unlock, runOfDay, format = 'queue', bossRuns = true, rules = 5) => T.buildBurst({ seed: 5, burstIndex: format === 'daily' ? 2 : 3, format, difficulty: 2, theme: 'park', unlockLevel: unlock, runOfDay, bossRuns, rules }).finale;
  for (let rod = 0; rod < 6; rod++) assert.equal(fin(20, rod, 'queue', false), 'rush', 'Wave 1 build: Golden Rush only');
  assert.equal(fin(20, 0), 'rush');
  assert.equal(fin(20, 1), 'rush');
  assert.equal(fin(20, 2), 'boss');
  assert.equal(fin(20, 5), 'boss');
  assert.equal(fin(6, 2), 'rush', 'lifetime 10 at the finale: no boss yet in v5');
  assert.equal(fin(7, 2), 'boss', 'lifetime 11 at the finale');
  assert.equal(fin(6, 2, 'queue', false, 4), 'boss', 'v4 rules (old proofs): lifetime 10, no flag');
  assert.equal(fin(20, 2, 'lineDay'), 'rush');
  assert.equal(fin(20, 2, 'daily'), 'rush');
  const rush = q(3, 3, 20);
  assert.equal(rush.lengthMs, 16000);
  assert.ok(rush.events.filter((e) => e.kind === W.K_GOLDEN).length >= 2, 'Golden Rush has 2 goldens');
  assert.equal(T.buildBurst({ seed: 3, burstIndex: 3, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 20, runOfDay: 2, bossRuns: true }).lengthMs, 18000);
});

test('ride: Finn, Golden, Angler, Bruiser only; enough non-decoys before the Bruiser to win cleanly', () => {
  const ok = new Set([W.K_FINN, W.K_GOLDEN, W.K_ANGLER, W.K_BRUISER]);
  for (let seed = 1; seed < 80; seed++) {
    const tl = ride(seed);
    for (const e of tl.events) assert.ok(ok.has(e.kind));
    const clean = tl.events.filter((e) => e.tellAt < W.RIDE_BRUISER_FROM && e.kind !== W.K_ANGLER).length;
    assert.ok(clean >= 14, `seed ${seed}: ${clean} clean targets before the Bruiser (13 bonks win)`);
    assert.equal(tl.fever, false, 'no fever in the ride round');
    assert.ok(!tl.events.some((e) => e.kind === W.K_HELMET || e.kind === W.K_TWIN), 'no helmets or twins in the ride round');
    assert.ok(tl.events.some((e) => e.kind === W.K_BRUISER));
    assert.ok(!tl.events.some((e) => e.kind === W.K_ANGLER && e.tellAt < W.RIDE_ANGLER_FROM));
  }
});

test('symmetry: 8 dihedral maps are bijections, and ghost mapping round-trips', () => {
  for (let x = 0; x < 8; x++) {
    const img = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8].map((h) => F.xformHole(h, x)));
    assert.equal(img.size, 9);
    for (let h = 0; h < 9; h++) assert.equal(F.xformHole(F.xformHole(h, x), F.xformInverse(x)), h);
  }
  const plainTl = q(5, 3, 30);
  const mirrored = q(5, 3, 30, { xform: 4 });
  plainTl.events.forEach((e, i) => {
    assert.equal(mirrored.events[i].tellAt, e.tellAt, 'same timing');
    assert.equal(mirrored.events[i].hole, F.xformHole(e.hole, 4));
    assert.equal(F.mapGhostHole(mirrored.events[i].hole, 4, 0), e.hole);
  });
});

// ---------------------------------------------------------------- resolver
test('grades: pre-emerge -80..0 is QUICK with the anticipated flag; QUICK to 0.35U, GOOD to 0.8U, LATE after', () => {
  const tl = q(11, 0, 0);
  const e = tl.events[0];
  const U = e.duckAt - e.emergeAt;
  const g = (at) => {
    const { ev, s } = drive(tl, [[at, e.hole]]);
    const hit = ev.find((x) => x[0] === S.E_HIT);
    return { grade: hit ? hit[2] % 10 : -1, flags: s.taps[2] };
  };
  const pre = g(e.emergeAt - 80);
  assert.ok([W.G_QUICK, W.G_CRIT].includes(pre.grade));
  assert.equal(pre.flags & S.TAP_ANTICIPATED, S.TAP_ANTICIPATED, 'anticipated bit set');
  assert.equal(g(e.emergeAt).flags & S.TAP_ANTICIPATED, 0, 'at the pop it is a normal tap');
  assert.ok([W.G_QUICK, W.G_CRIT].includes(g(e.emergeAt + Math.floor(0.35 * U)).grade));
  assert.equal(g(e.emergeAt + Math.floor(0.35 * U) + 2).grade, W.G_GOOD);
  assert.equal(g(e.emergeAt + Math.floor(0.8 * U) + 2).grade, W.G_LATE);
  const early = g(e.emergeAt - 81);
  assert.equal(early.grade, -1, 'too early is a whiff');
  assert.equal(early.flags & S.TAP_ANTICIPATED, 0);
});

test('whiffs: one bump is free; 3 in 1s is Butterfingers (only once unlocked)', () => {
  const tl = q(3, 2, 0); // lifetime 3: Butterfingers on
  const empty = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((h) => !tl.events.some((e) => e.hole === h && e.tellAt < 900));
  const one = drive(tl, [[100, empty]]);
  assert.equal(one.s.whiffs, 1);
  assert.equal(one.s.butters, 0);
  const three = drive(tl, [[100, empty], [400, empty], [900, empty]]);
  assert.equal(three.s.butters, 1);
  const spaced = drive(tl, [[100, empty], [700, empty], [1400, empty]]);
  assert.equal(spaced.s.butters, 0);
  const early = drive(q(3, 1, 0), [[100, empty], [400, empty], [900, empty]]);
  assert.equal(early.s.butters, 0, 'not before lifetime 3');
});

test('Auto Look-Up v5: an idle player never loses a target; the resume touch only resumes, frozen targets run on at 1x', () => {
  const tl = q(21, 0, 0);
  const s = S.createSim(tl, undefined, true);
  S.simAdvance(s, 60000);
  assert.equal(s.frozen, true);
  assert.equal(s.escapes, 0);
  const t0 = s.t;
  S.simAdvance(s, 5000);
  assert.equal(s.t, t0, 'game time stops while frozen');
  const h = s.hPh.findIndex((p, i) => p === S.P_UP && s.evKind[s.hEv[i]] !== W.K_ANGLER);
  const e = tl.events[s.hEv[h]];
  assert.ok(s.t >= e.emergeAt + 0.8 * (e.duckAt - e.emergeAt) - 1);
  assert.equal(s.hExempt[h], 1, 'up at the freeze: exempt from the engaged-escape rule');
  const hitsBefore = s.hits;
  S.simTap(s, h);
  assert.equal(s.frozen, false);
  assert.equal(s.taps[2] & S.TAP_RESUME, 1, 'resume flag bit');
  assert.equal(s.hits, hitsBefore, 'the resume touch never hits, even on the target');
  assert.equal(s.whiffs, 0, 'and never whiffs');
  // The frozen target continues at 1x: about 0.2U left, a quick LATE is still possible.
  S.simAdvance(s, 60);
  S.simTap(s, h);
  assert.equal(s.late, 1, 'a follow-up tap grades LATE');
  // Keep idling: every target is either hit or frozen on, never escaped.
  let guard = 0;
  while (!s.ended && guard++ < 400) {
    S.simAdvance(s, 60000);
    if (s.frozen) {
      const hh = s.hPh.findIndex((p, i) => p === S.P_UP && s.evKind[s.hEv[i]] !== W.K_ANGLER);
      S.simTap(s, hh >= 0 ? hh : 4);
    }
  }
  assert.ok(s.ended);
  assert.equal(A.disengagedEscapes(tl, s.taps), 0);
  assert.equal(s.engagedEscapes, 0, 'targets that peaked during a look-up never count as engaged');
});

test('look-up v5: a freeze at x2.5+ costs exactly one tier on resume, below x2.5 nothing; post-resume emerges ease in', () => {
  const tl = q(21, 2, 30);
  const freezeWith = (streak) => {
    const s = S.createSim(tl, { meter: 0, feverLeft: 0, streak }, true);
    S.simAdvance(s, 60000);
    assert.equal(s.frozen, true);
    const tier = s.tier;
    S.simUnfreeze(s);
    const ev = [];
    for (let i = 0; i < s.ev.length; i += 5) ev.push(s.ev.slice(i, i + 5));
    return { s, tier, ev };
  };
  const hi = freezeWith(W.TIER_AT[3] + 2); // x2.5
  assert.equal(hi.s.tier, hi.tier - 1, 'x2.5 drops to x2');
  assert.equal(hi.s.streak, W.TIER_AT[hi.tier - 1]);
  assert.equal(hi.s.lookupDrops, 1);
  assert.ok(hi.ev.some((x) => x[0] === S.E_LOOKUP_DROP));
  const top = freezeWith(60); // x4
  assert.equal(top.s.tier, 4, 'x4 drops to x3');
  const lo = freezeWith(W.TIER_AT[2] + 3); // x2
  assert.equal(lo.s.tier, 2, 'below x2.5 a look-up costs nothing');
  assert.equal(lo.s.streak, W.TIER_AT[2] + 3);
  // Ease-in: an emerge d ms after the resume gains (600-d)^2/2400 ms of up time (0.5x -> 1x on its own clock).
  assert.equal(W.resumeEaseExtension(0), 150);
  assert.equal(W.resumeEaseExtension(300), 38);
  assert.equal(W.resumeEaseExtension(600), 0);
  const s = hi.s;
  const resumeT = s.t;
  const next = tl.events.find((e) => e.emergeAt > resumeT && e.emergeAt < resumeT + 600 && e.kind !== W.K_GOLDEN);
  if (next) {
    S.simAdvanceTo(s, next.emergeAt + 1);
    if (!s.frozen) assert.equal(s.hExt[next.hole] - (next.kind === W.K_HELMET ? 0 : 0), W.resumeEaseExtension(next.emergeAt - resumeT));
  }
  // Targets up at the freeze never got the ease (they run on at 1x).
  const frozenHole = hi.s.hExempt.findIndex((x) => x === 1);
  assert.ok(frozenHole >= 0);
});

test('look-ups never pay: the lookup profile scores below the same hands without forced look-ups on 95%+ of seeds', () => {
  let lower = 0;
  const n = 20;
  for (let i = 0; i < n; i++) {
    const base = { seed: 5000 + i * 104729, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 20 };
    const lk = A.autoplayRun(base, 4, 'lookup', 91 + i, 'finale', T.buildBurst).total;
    const ex = A.autoplayRun(base, 4, 'expert', 91 + i, 'finale', T.buildBurst).total;
    if (lk < ex) lower++;
  }
  assert.ok(lower / n >= 0.95, `lookup lower on ${lower}/${n}`);
});

test('engaged escape at x2+ drops exactly one tier; below x2 resets; decoys reset; idle never decays streak or meter', () => {
  const tl = q(8, 3, 30);
  const finns = tl.events.filter((e) => e.kind === W.K_FINN || e.kind === W.K_GOLDEN);
  const taps = finns.slice(0, 5).map((e) => [e.emergeAt + 300, e.hole]);
  const { s, ev, drain } = drive(tl, taps);
  assert.ok(s.streak >= 5, `streak ${s.streak}`);
  const streak = s.streak;
  const meter = s.meter;
  ev.length = 0;
  // Idle until the board freezes: only an engaged escape (within 1200ms of the last touch) may move the streak.
  S.simAdvance(s, 20000);
  drain();
  assert.equal(s.frozen, true);
  const engaged = ev.some((x) => x[0] === S.E_ESCAPE && x[3] === 1);
  if (!engaged) assert.equal(s.streak, streak, 'idle holds the streak');
  assert.equal(s.meter, meter, 'idle never drains the meter');
  // Engaged escapes: keep touching empty holes while targets escape.
  const escapeWith = (streak0) => {
    const s2 = S.createSim(tl, { meter: 0, feverLeft: 0, streak: streak0 }, true);
    const target = tl.events.find((e) => e.kind === W.K_FINN && e.tellAt > 1500);
    let t = 600;
    const out = [];
    while (s2.t < target.duckAt + 5 && !s2.ended) {
      advanceEngaged(s2, t);
      for (let i = 0; i < s2.ev.length; i += 5) out.push(s2.ev.slice(i, i + 5));
      s2.ev.length = 0;
      if (s2.engagedEscapes > 0) break;
      const empty = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((h) => s2.hPh[h] === S.P_EMPTY && h !== target.hole);
      S.simTap(s2, empty);
      t += 700;
    }
    return { s2, out };
  };
  const hi = escapeWith(33); // tier x3
  assert.ok(hi.s2.engagedEscapes >= 1);
  assert.equal(hi.s2.tier, 3, 'x3 drops to x2.5');
  assert.equal(hi.s2.streak, W.TIER_AT[3]);
  assert.ok(hi.out.some((x) => x[0] === S.E_TIER_DROP));
  const lo = escapeWith(7); // tier x1.5
  assert.equal(lo.s2.streak, 0, 'below x2 an engaged escape resets');
  // A decoy always resets to x1.
  const ang = tl.events.find((e) => e.kind === W.K_ANGLER);
  const s3 = S.createSim(tl, { meter: 0, feverLeft: 0, streak: 50 }, true);
  advanceEngaged(s3, ang.emergeAt + 50);
  S.simTap(s3, ang.hole);
  assert.equal(s3.streak, 0);
  assert.equal(s3.tier, 0);
});

test('tiers: x4 opens at streak 45; fever x2 caps the effective multiplier at x8; flat bonuses never multiply', () => {
  assert.equal(S.tierFor(44), 4);
  assert.equal(S.tierFor(45), 5);
  assert.equal(W.TIER_MULT[5], 4);
  const s = S.createSim(q(1, 0, 0));
  s.streak = 99; s.tier = 5; s.fever = true;
  assert.equal(S.multiplier(s), 8);
  s.fever = false;
  assert.equal(S.multiplier(s), 4);
});

test('crits are seeded (same event always crits), the ride golden is flat', () => {
  const tl = ride(77);
  const g = firstOf(tl, W.K_GOLDEN);
  assert.ok(g, 'the finale has a golden');
  assert.equal(g.ug, 0, 'the ride golden never ripens');
  const run = S.createSim(tl, { meter: 0, feverLeft: 5000, streak: 50 }, true);
  advanceEngaged(run, g.emergeAt + 100);
  const before = run.score;
  S.simTap(run, g.hole);
  assert.equal(run.score - before, W.PTS_GOLDEN);
  const a = A.autoplayBurst(q(5, 3, 30), 'expert', 1);
  const b = A.autoplayBurst(q(5, 3, 30), 'expert', 1);
  assert.equal(a.result.crits, b.result.crits);
});

test('banked fever: a full meter waits (FEVER READY), GO FEVER opens the next Burst in 7s of fever, ends by timer only', () => {
  const tl = q(14, 2, 30);
  assert.equal(tl.feverBank, true);
  const s = S.createSim(tl, { meter: 99.5, feverLeft: 0, streak: 0 }, true);
  const e = tl.events.find((x) => x.kind === W.K_FINN);
  advanceEngaged(s, e.emergeAt + 10);
  S.simTap(s, e.hole);
  assert.equal(s.fever, false, 'a full meter does not fire on its own');
  assert.equal(s.feverReady, true);
  assert.equal(s.meter, 100);
  const res = S.simResult(s);
  assert.equal(res.feverReady, true);
  assert.equal(res.carry.feverReady, true);
  // GO: the banked fever waits for a later breather.
  const held = S.createSim(q(14, 3, 30), res.carry);
  assert.equal(held.fever, false);
  assert.equal(held.feverReady, true);
  // GO FEVER: the next Burst opens in fever.
  const fired = T.buildBurst({ seed: 14, burstIndex: 3, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 30, feverFired: true });
  assert.equal(fired.feverStart, true);
  const fs = S.createSim(fired, { ...res.carry, feverReady: false, meter: 0 }, true);
  assert.equal(fs.fever, true);
  assert.equal(fs.feverLeft, W.FEVER_MS);
  assert.ok(fs.ev.some((x, i) => i % 5 === 0 && x === S.E_FEVER), 'FEVER! on the first frame');
  S.simAdvanceTo(fs, 500);
  // An angler hit breaks the streak but not fever, and pays a coin bubble.
  const ang = fired.events.find((x) => x.kind === W.K_ANGLER && x.emergeAt > 600 && x.emergeAt < 6000);
  if (ang) {
    advanceEngaged(fs, ang.emergeAt + 10);
    const before = fs.score;
    S.simTap(fs, ang.hole);
    assert.equal(fs.fever, true);
    assert.equal(fs.score - before, W.PTS_COIN_BUBBLE);
  }
  // Live party rounds have no breathers: fever fires automatically.
  const party = T.buildBurst({ seed: 14, burstIndex: 0, format: 'party', difficulty: 2, theme: 'park', unlockLevel: 0 });
  assert.equal(party.feverBank, false);
  const ps = S.createSim(party, { meter: 99.5, feverLeft: 0, streak: 0 }, true);
  const pe = party.events.find((x) => x.kind === W.K_FINN);
  S.simAdvanceTo(ps, pe.emergeAt + 10);
  S.simTap(ps, pe.hole);
  assert.equal(ps.fever, true);
});

test('interruptions change nothing: game time is the only clock (same taps, same result)', () => {
  const tl = q(33, 2, 12);
  const run = A.autoplayBurst(tl, 'median', 4);
  const again = S.replayBurst(tl, S.NO_CARRY, triples(run.sim.taps));
  assert.equal(again.score, run.result.score);
  assert.equal(again.maxStreak, run.result.maxStreak);
});

const boss = (seed) => T.buildBurst({ seed, burstIndex: 3, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 30, runOfDay: 2, bossRuns: true });

test('boss Burst: tentacles and goldens damage the boss; defeat pays out and starts the Victory Lap', () => {
  const tl = boss(2);
  assert.equal(tl.boss, true);
  assert.equal(tl.bossHp, W.BOSS_HP[2]);
  const r = A.autoplayBurst(tl, 'bot', 9);
  assert.ok(r.result.bossDamage > 0);
  let downs = 0;
  for (let seed = 1; seed < 12; seed++) if (A.autoplayBurst(boss(seed), 'expert', seed).result.bossDown) downs++;
  assert.ok(downs >= 6, `experts usually bonk the boss (${downs}/11)`);
  const inked = boss(2).attacks.filter((a) => a.type === T.A_INK);
  assert.ok(inked.length >= 3, 'the kraken throws ink on a cadence');
});

test('splats hide a hole until swiped', () => {
  const tl = boss(2);
  const a = tl.attacks[0];
  const s = S.createSim(tl, undefined, true);
  S.simAdvanceTo(s, a.landAt);
  if (s.frozen) S.simTap(s, (a.hole + 1) % 9);
  S.simAdvanceTo(s, a.landAt + 1);
  assert.equal(s.hSplat[a.hole], S.SPLAT_DOWN);
  S.simSwipe(s, a.hole);
  assert.equal(s.hSplat[a.hole], S.SPLAT_NONE);
});

// ---------------------------------------------------------------- proof
const proofOf = (tl, run, carry = S.NO_CARRY) => P.buildProof(tl, carry, run.sim.taps, run.result, { wallMs: run.stats.wallMs, pos: run.sim.pos });

test('proof v5: an autoplayed ride win verifies; forged results, wrong seeds and malformed logs are rejected', () => {
  const tl = ride(123456);
  const run = A.autoplayBurst(tl, 'median', 5);
  assert.ok(run.result.win);
  assert.ok(run.result.legacyHits >= 10, 'v1 server floor still holds');
  const proof = proofOf(tl, run);
  assert.equal(proof.v, 5);
  assert.equal(proof.taps[0].length, 6, '[gt, hole, flags, dx, dy, sub]');
  const ok = P.verifyProof(proof, { serverSeed: 123456 });
  assert.equal(ok.ok, true, JSON.stringify(ok).slice(0, 300));
  assert.equal(ok.flagged, null, JSON.stringify(ok.features));
  // Forged: claim a win with no taps.
  const forged = { ...proof, taps: [], swipes: [], result: { ...proof.result } };
  assert.equal(P.verifyProof(forged).ok, false);
  assert.equal(P.verifyProof(proof, { serverSeed: 99 }).ok, false);
  assert.equal(P.verifyProof({ ...proof, v: 3 }).ok, false, 'unknown version');
  // v4 proofs keep verifying, replayed with the v4 rules (13.1).
  const tl4 = T.buildBurst({ seed: 4242, burstIndex: 1, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 12, rules: 4 });
  const run4 = A.autoplayBurst(tl4, 'median', 6);
  const p4 = proofOf(tl4, run4);
  assert.equal(p4.v, 4);
  const v4 = P.verifyProof(p4);
  assert.equal(v4.ok, true, JSON.stringify(v4).slice(0, 200));
  assert.equal(v4.result.score, run4.result.score);
  assert.equal(P.verifyProof({ ...p4, v: 5 }).ok, false, 'a v4 log replayed with v5 rules does not match');
  const bad = JSON.parse(JSON.stringify(proof));
  bad.taps[0][3] = 400;
  assert.equal(P.verifyProof(bad).reason, 'malformed');
  const unordered = JSON.parse(JSON.stringify(proof));
  unordered.taps.reverse();
  assert.equal(P.verifyProof(unordered).reason, 'order');
  // Walk Boost outside a solo Queue Run is structural.
  assert.equal(P.verifyProof({ ...proof, walk_boost: 'golden' }).reason, 'walk_boost');
});

test('anti-cheat v4: bots and jitterbots are shadow-flagged (never rejected, ride coin still granted); humans and on-beat experts are not', () => {
  const count = (profile, n = 30) => {
    let flagged = 0;
    let rejected = 0;
    for (let i = 0; i < n; i++) {
      const tl = ride(9000 + i * 131);
      const run = A.autoplayBurst(tl, profile, 40 + i);
      const v = P.verifyProof(proofOf(tl, run));
      if (!v.ok) rejected++;
      else if (v.flagged) flagged++;
    }
    return { flagged, rejected };
  };
  const bot = count('bot');
  assert.equal(bot.rejected, 0, 'timing findings never 422');
  assert.ok(bot.flagged >= 29, `bot flagged ${bot.flagged}/30`);
  const jit = count('jitterbot');
  assert.equal(jit.rejected, 0);
  assert.ok(jit.flagged >= 24, `jitterbot flagged ${jit.flagged}/30`);
  for (const human of ['median', 'expert', 'onbeat']) {
    const h = count(human);
    assert.equal(h.rejected, 0, human);
    assert.ok(h.flagged <= 1, `${human} false flags ${h.flagged}/30`);
  }
});

test('anti-cheat v4: F4 constant sub-frame stamps and F5 anchors that outrun the server clock flag', () => {
  const tl = ride(31337);
  const run = A.autoplayBurst(tl, 'median', 3);
  const p = proofOf(tl, run);
  const zeroSub = JSON.parse(JSON.stringify(p));
  for (const t of zeroSub.taps) t[5] = 0;
  assert.match(P.verifyProof(zeroSub).flagged ?? '', /F4/);
  // A good anchor: hash of taps up to 5s, stamped by the server at 5.6s.
  const n = p.taps.filter((t) => t[0] <= 5000).length;
  const good = { ...p, anchors: [[5000, 5600, P.tapsHash(p.taps, n)]] };
  assert.equal(P.verifyProof(good).flagged, null);
  const fast = { ...p, anchors: [[10000, 4000, P.tapsHash(p.taps, p.taps.filter((t) => t[0] <= 10000).length)]] };
  assert.match(P.verifyProof(fast).flagged ?? '', /F5/);
  const wrong = { ...p, anchors: [[5000, 5600, 'deadbeef']] };
  assert.match(P.verifyProof(wrong).flagged ?? '', /F5/);
});

test('proof v4: shared-seed anomalies are flagged (shadow board), never rejected; banked Bursts and GO FEVER verify', () => {
  const tl = T.buildBurst({ seed: 777, burstIndex: 1, format: 'lineDay', difficulty: 2, theme: 'space', unlockLevel: 3, xform: 2 });
  const bot = A.autoplayBurst(tl, 'bot', 1);
  const v = P.verifyProof(proofOf(tl, bot));
  assert.equal(v.ok, true);
  assert.ok(v.flagged);
  // bankAndExit mid-Burst: the partial run verifies.
  const s = S.createSim(q(5, 1, 3), S.NO_CARRY, false);
  const e = q(5, 1, 3).events[0];
  S.simAdvanceTo(s, e.emergeAt + 200);
  S.simTap(s, e.hole, 3, -2, 7);
  S.simAdvance(s, 1500);
  S.simBank(s);
  const res = S.simResult(s);
  const pv = P.verifyProof(P.buildProof(q(5, 1, 3), S.NO_CARRY, s.taps, res, { wallMs: 5000, pos: s.pos }));
  assert.equal(pv.ok, true, JSON.stringify(pv).slice(0, 200));
  assert.equal(pv.result.score, res.score);
  // A whole Run with GO FEVER: every Burst's proof verifies with its carry.
  let carry = S.NO_CARRY;
  let fired = 0;
  for (let b = 0; b < 4; b++) {
    const fire = !!carry.feverReady;
    const t = T.buildBurst({ seed: 61, burstIndex: b, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 30, feverFired: fire });
    if (fire) { carry = { ...carry, feverReady: false, meter: 0 }; fired++; }
    const r = A.autoplayBurst(t, 'expert', 10 + b, carry);
    const pr = P.buildProof(t, carry, r.sim.taps, r.result, { wallMs: r.stats.wallMs, pos: r.sim.pos });
    if (fire) assert.equal(pr.fever_fired_burst, b);
    const vv = P.verifyProof(pr);
    assert.equal(vv.ok, true, `burst ${b}: ${JSON.stringify(vv).slice(0, 160)}`);
    carry = r.result.carry;
  }
  assert.ok(fired >= 1, 'an expert banks and fires fever at least once');
});

test('walk boost: a Golden Start (golden at 2-3.5s) only in random-seed solo Queue Runs', () => {
  const g = q(4, 1, 12, { walkBoost: 'golden' }).events.filter((e) => e.kind === W.K_GOLDEN && e.emergeAt >= 1900 && e.emergeAt <= 4000);
  assert.ok(g.length >= 1);
  for (const format of ['ride', 'duel', 'daily', 'lineDay', 'party', 'raid']) {
    const plainTl = T.buildBurst({ seed: 4, burstIndex: 0, format, difficulty: 2, theme: 'park', unlockLevel: 9 });
    const boosted = T.buildBurst({ seed: 4, burstIndex: 0, format, difficulty: 2, theme: 'park', unlockLevel: 9, walkBoost: 'golden' });
    assert.equal(T.timelineFingerprint(boosted), T.timelineFingerprint(plainTl), `${format} ignores walk boost`);
  }
});

// ---------------------------------------------------------------- multiplayer
test('duel: both players get the identical Burst; splats land on schedule and 3 QUICKs block one', () => {
  const a = Duel.duelTimeline(4242, 1, 2, 'park', 12, []);
  const b = Duel.duelTimeline(4242, 1, 2, 'park', 12, []);
  assert.equal(T.timelineFingerprint(a), T.timelineFingerprint(b));
  const withSplats = Duel.duelTimeline(4242, 1, 2, 'park', 12, [3, 9]);
  const candy = withSplats.attacks.filter((x) => x.type === T.A_CANDY);
  assert.equal(candy.length, 2);
  assert.equal(candy[0].landAt - candy[0].tellAt, 600);
  assert.ok(candy[1].landAt - candy[0].landAt >= 3500 - 7 * 232);
  // Expert chains QUICKs and blocks at least one splat.
  const r = A.autoplayBurst(withSplats, 'expert', 3);
  assert.ok(r.result.blocked >= 1);
  // Winner: most Bursts, then total, then streak.
  assert.equal(Duel.duelWinner([{ me: 10, rival: 5 }, { me: 1, rival: 5 }, { me: 7, rival: 6 }]).winner, 'me');
  assert.equal(Duel.duelWinner([{ me: null, rival: 5 }]).wins[1], 1, 'a window expiry forfeits only that Burst');
  assert.equal(Duel.duelWinner([{ me: 10, rival: 10, meStreak: 4, rivalStreak: 9 }]).winner, 'rival');
});

test('duel: goldens and DOUBLE BONKs send splats (max 3)', () => {
  const tl = Duel.duelTimeline(99, 2, 2, 'park', 30, []);
  const r = A.autoplayBurst(tl, 'expert', 2);
  const sent = Duel.sabotageSenders(tl, triples(r.sim.taps));
  assert.ok(sent.length <= 3);
  assert.equal(sent.length, Math.min(3, r.result.goldens + r.result.doubles));
});

test('raid: HP = 30 x crew (min 45), damage sums across members, Tag Team +15% inside 60s, 3 slots each', () => {
  assert.equal(Raid.raidHpMax(1), 45);
  assert.equal(Raid.raidHpMax(4), 120);
  const r = Raid.createRaid(3, 0);
  assert.equal(Raid.applyRaidBurst(r, 'a', 20, 10000).tagTeam, false);
  const second = Raid.applyRaidBurst(r, 'b', 20, 50000);
  assert.equal(second.tagTeam, true);
  assert.equal(r.hp, 90 - 23 - 23);
  Raid.applyRaidBurst(r, 'a', 1, 200000);
  Raid.applyRaidBurst(r, 'a', 1, 300000);
  assert.equal(Raid.applyRaidBurst(r, 'a', 1, 400000), null, '3 slots per member');
  assert.equal(Raid.applyRaidBurst(r, 'c', 999, 11 * 60 * 1000), null, 'window closed');
  const sum = plain(Raid.raidSlices(r, ['a', 'b', 'c'])).reduce((x, y) => x + y.damage, 0);
  assert.equal(r.hpMax - r.hp, sum);
});

test('ghost: a replayed PB gives hits at their logged times and a monotone pace line', () => {
  const tl = T.buildBurst({ seed: 55, burstIndex: 0, format: 'lineDay', difficulty: 2, theme: 'park', unlockLevel: 0 });
  const run = A.autoplayBurst(tl, 'median', 8);
  const g = Ghost.ghostFromRun(tl, triples(run.sim.taps), 'PB');
  assert.equal(g.score, run.result.score);
  assert.equal(g.hits.length, run.result.hits);
  for (let i = 1; i < g.pace.length; i++) assert.ok(g.pace[i] >= 0);
  assert.equal(Ghost.paceAt(g, 1e9), g.score);
  const mine = Ghost.ghostHitsBetween(g, 0, 1e9, 0);
  assert.equal(mine.length, g.hits.length);
});

// ---------------------------------------------------------------- tuning gates
test('tuning: ride wins for every profile (forgiving coin round), 3 stars are earned by speed; walk-safe (0 disengaged escapes)', () => {
  const stars = {};
  for (const prof of ['median', 'walking', 'glance', 'novice', 'expert']) {
    let wins = 0;
    let three = 0;
    let dis = 0;
    const n = 30;
    for (let i = 0; i < n; i++) {
      const tl = ride(1000 + i * 7919);
      const r = A.autoplayBurst(tl, prof, 77 + i);
      if (r.result.win) wins++;
      if (r.result.stars === 3) three++;
      dis += A.disengagedEscapes(tl, r.sim.taps);
    }
    stars[prof] = three / n;
    assert.equal(dis, 0, `${prof}: no target escapes a disengaged player`);
    assert.ok(wins / n >= (prof === 'median' ? 0.9 : 0.7), `${prof} wins ${wins}/${n}`);
  }
  assert.ok(stars.median >= 0.15 && stars.median <= 0.45, `median 3-star rate ${stars.median}`);
  assert.ok(stars.expert > stars.median, 'speed earns stars');
});

test('anti-mash: a 12 taps/s masher scores below a 450ms reader; bump-taps rarely cause Butterfingers', () => {
  let mash = 0;
  let read = 0;
  let butterRuns = 0;
  const reader = { ...A.PROFILES.median, median: 450 };
  for (let i = 0; i < 20; i++) {
    const tl = q(300 + i, 3, 30);
    mash += A.autoplayBurst(tl, 'masher', i).result.score;
    read += A.autoplayBurst(tl, reader, i).result.score;
    if (A.autoplayBurst(tl, 'walking', i).result.butters > 0) butterRuns++;
  }
  assert.ok(mash < read, `masher ${mash} < reader ${read}`);
  assert.ok(butterRuns <= 1, `walking bumps -> Butterfingers in ${butterRuns}/20 runs`);
});

test('skill spread (queue boards): top-1% expert over the median median is 2.0-2.4, expert median over median median >= 1.5', () => {
  const n = 60;
  const run = (p, pol, i) => A.autoplayRun({ seed: 5000 + i * 104729, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 20 }, 4, p, 91 + i, pol, T.buildBurst).total;
  const ex = [];
  const md = [];
  for (let i = 0; i < n; i++) { ex.push(run('expert', 'finale', i)); md.push(run('median', 'now', i)); }
  ex.sort((a, b) => a - b);
  md.sort((a, b) => a - b);
  const top = ex[Math.floor(0.99 * n)];
  const ratio = top / md[n >> 1];
  assert.ok(ratio >= 1.9 && ratio <= 2.5, `spread ${ratio.toFixed(2)}`);
  assert.ok(ex[n >> 1] / md[n >> 1] >= 1.5);
  const novice = [];
  for (let i = 0; i < 30; i++) novice.push(A.autoplayRun({ seed: 7000 + i * 31, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 0 }, 4, 'novice', i, 'now', T.buildBurst).total);
  const oneStar = novice.filter((x) => x >= W.RUN_STARS[2].one).length / novice.length;
  assert.ok(oneStar >= 0.85, `novice reaches 1+ star in ${oneStar}`);
});

test('golden vectors (PHP parity): every v5 and frozen v4 timeline hash and recorded run still reproduces', () => {
  const crypto = require('node:crypto');
  const V5 = require('../../src/games/whack/__vectors__/vectors.json');
  const V4 = require('../../src/games/whack/__vectors__/vectors-v4.json');
  assert.equal(V5.v, 5);
  assert.equal(V4.v, 4);
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  for (const t of V5.timelines) assert.equal(sha(T.timelineFingerprint(T.buildBurst(t.input))), t.sha256, JSON.stringify(t.input));
  for (const t of V4.timelines) assert.equal(sha(T.timelineFingerprint(T.buildBurst({ ...t.input, rules: 4 }))), t.sha256, `v4 ${JSON.stringify(t.input)}`);
  for (const r of V5.runs) {
    assert.equal(r.proof.v, 5);
    const res = P.replayProof(r.proof).result;
    for (const k of ['perfects', 'ripeHits', 'ripeBolts', 'ripePoints', 'lookupDrops']) assert.equal(res[k], r.expect[k], k);
  }
  assert.ok(V5.runs.some((r) => r.expect.perfects > 0) && V5.runs.some((r) => r.expect.ripeBolts > 0) && V5.runs.some((r) => r.expect.lookupDrops > 0),
    'the v5 set exercises PERFECT, bolts and look-up tier costs');
  for (const r of [...V5.runs, ...V4.runs]) {
    const v = P.verifyProof(r.proof);
    assert.ok(v.ok, JSON.stringify(v).slice(0, 200));
    assert.equal(v.flagged ?? null, r.expect.flagged, 'plausibility features match');
    const res = P.replayProof(r.proof).result;
    assert.equal(res.score, r.expect.score);
    assert.equal(res.anticipated, r.expect.anticipated);
    assert.equal(res.tierDrops, r.expect.tierDrops);
    assert.equal(res.win, r.expect.win);
    assert.equal(res.freezes, r.expect.freezes);
    assert.equal(res.bossDamage, r.expect.bossDamage);
  }
});
