'use strict';
/**
 * Whack-a-Shark "Bonk Rush" logic (design studio/design/whack.md): timeline,
 * resolver, walk-safe rules, scoring caps, proof v2 replay and plausibility,
 * multiplayer rules (duel sabotage, raid, ghosts) and autoplayer tuning gates.
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
test('timeline: same inputs give the identical Burst; tells sit on the 8th-note grid', () => {
  const a = T.timelineFingerprint(q(42, 1, 12));
  assert.equal(a, T.timelineFingerprint(q(42, 1, 12)));
  assert.notEqual(a, T.timelineFingerprint(q(43, 1, 12)));
  for (const e of q(42, 3, 12).events) {
    const k = Math.round(e.tellAt / W.EIGHTH_MS);
    assert.ok(Math.abs(e.tellAt - k * W.EIGHTH_MS) <= 0.5, `tell ${e.tellAt} on grid`);
    assert.ok(e.emergeAt - e.tellAt >= 250, 'every tell is at least 250ms');
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

test('onboarding: a fresh profile sees only Finn, Angler and Golden in its first Run; no boss before lifetime 10', () => {
  const allowed = new Set([W.K_FINN, W.K_ANGLER, W.K_GOLDEN]);
  for (let seed = 1; seed < 30; seed++) {
    for (let b = 0; b < 5; b++) {
      const tl = q(seed, b, 0);
      for (const e of tl.events) assert.ok(allowed.has(e.kind), `burst ${b + 1} kind ${e.kind}`);
      assert.equal(tl.boss, false);
    }
    assert.equal(q(seed, 0, 0).events.some((e) => e.kind === W.K_ANGLER), false, 'burst 1 is Finns only');
    assert.equal(q(seed, 4, 0).shape, 'rush', 'Run 1 ends in GOLDEN RUSH');
    assert.equal(q(seed, 4, 5).shape, 'b5', 'lifetime 10 brings the boss');
  }
  const first = q(9, 1, 0);
  const angler = first.events.find((e) => e.first);
  assert.equal(angler.kind, W.K_ANGLER);
  assert.equal(angler.hole, 4);
  assert.equal(angler.emergeAt - angler.tellAt, 500);
  assert.equal(first.callout, "DON'T BONK THE LURE");
  assert.equal(q(9, 2, 0).butterfingers, true, 'Butterfingers unlocks at lifetime Burst 3');
  assert.equal(q(9, 1, 0).butterfingers, false);
  assert.equal(q(9, 4, 0).fever, true, 'fever unlocks at 5');
});

test('ride: Finn, Golden, Angler, Bruiser only; enough non-decoys before the Bruiser to win cleanly', () => {
  const ok = new Set([W.K_FINN, W.K_GOLDEN, W.K_ANGLER, W.K_BRUISER]);
  for (let seed = 1; seed < 80; seed++) {
    const tl = ride(seed);
    for (const e of tl.events) assert.ok(ok.has(e.kind));
    const clean = tl.events.filter((e) => e.tellAt < W.RIDE_BRUISER_FROM && e.kind !== W.K_ANGLER).length;
    assert.ok(clean >= 18, `seed ${seed}: ${clean} clean targets before the Bruiser`);
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
test('grades: QUICK inside 0.35U (and 80ms early grace), GOOD to 0.8U, LATE after; points multiply by tier', () => {
  const tl = q(11, 0, 0);
  const e = tl.events[0];
  const U = e.duckAt - e.emergeAt;
  const g = (at) => {
    const { ev } = drive(tl, [[at, e.hole]]);
    const hit = ev.find((x) => x[0] === S.E_HIT);
    return hit ? hit[2] % 10 : -1;
  };
  assert.equal(g(e.emergeAt - 80), W.G_QUICK);
  assert.ok([W.G_QUICK, W.G_CRIT].includes(g(e.emergeAt + Math.floor(0.35 * U))));
  assert.equal(g(e.emergeAt + Math.floor(0.35 * U) + 2), W.G_GOOD);
  assert.equal(g(e.emergeAt + Math.floor(0.8 * U) + 2), W.G_LATE);
  assert.equal(g(e.emergeAt - 81), -1, 'too early is a whiff');
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

test('Auto Look-Up: an idle player never loses a target; the board freezes at 0.8U and one tap resumes (graded LATE)', () => {
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
  S.simTap(s, h);
  assert.equal(s.frozen, false);
  assert.equal(s.taps[2] & S.TAP_RESUME, 1, 'resume flag bit');
  assert.equal(s.late, 1, 'freezing never helps your grade');
  // Keep idling: every target is either hit or frozen on, never escaped.
  let guard = 0;
  while (!s.ended && guard++ < 200) {
    S.simAdvance(s, 60000);
    if (s.frozen) {
      const hh = s.hPh.findIndex((p, i) => p === S.P_UP && s.evKind[s.hEv[i]] !== W.K_ANGLER);
      S.simTap(s, hh);
    }
  }
  assert.ok(s.ended);
  assert.equal(A.disengagedEscapes(tl, s.taps), 0);
});

test('engaged escape breaks the streak; idle never decays streak or meter', () => {
  const tl = q(8, 4, 30);
  const finns = tl.events.filter((e) => e.kind === W.K_FINN || e.kind === W.K_TENTACLE);
  const taps = finns.slice(0, 5).map((e) => [e.emergeAt + 300, e.hole]);
  const { s, ev, drain } = drive(tl, taps);
  assert.ok(s.streak >= 5, `streak ${s.streak}`);
  const streak = s.streak;
  const meter = s.meter;
  ev.length = 0;
  // Idle until the board freezes: only an engaged escape (within 1200ms of the last touch) may break the streak.
  S.simAdvance(s, 20000);
  drain();
  assert.equal(s.frozen, true);
  const engaged = ev.some((x) => x[0] === S.E_ESCAPE && x[3] === 1);
  if (!engaged) assert.equal(s.streak, streak, 'idle holds the streak');
  assert.equal(s.meter, meter, 'idle never drains the meter');
  // Engaged: keep touching an empty hole while a target escapes -> streak breaks.
  const s2 = S.createSim(tl, { meter: 0, feverLeft: 0, streak: 7 }, true);
  const target = tl.events.find((e) => e.kind === W.K_FINN && e.tellAt > 1500);
  let t = 600;
  while (s2.t < target.duckAt + 5 && !s2.ended) {
    advanceEngaged(s2, t);
    const empty = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((h) => s2.hPh[h] === S.P_EMPTY && h !== target.hole);
    S.simTap(s2, empty);
    t += 700;
  }
  assert.ok(s2.engagedEscapes >= 1);
  assert.ok(s2.streak < 7);
});

test('crits are seeded (same event always crits), capped multiplier x6, golden is flat', () => {
  assert.equal(Math.min(6, W.TIER_MULT[4] * 2), 6);
  const s = S.createSim(q(1, 0, 0));
  s.streak = 99; s.tier = 4; s.fever = true;
  assert.equal(S.multiplier(s), 6);
  // Golden: flat 500 regardless of tier / fever.
  const tl = q(77, 3, 30);
  const g = firstOf(tl, W.K_GOLDEN);
  assert.ok(g, 'B4 has a golden');
  const run = S.createSim(tl, { meter: 0, feverLeft: 5000, streak: 40 }, true);
  advanceEngaged(run, g.emergeAt + 100);
  const before = run.score;
  S.simTap(run, g.hole);
  assert.equal(run.score - before, W.PTS_GOLDEN);
  // Crit determinism: replaying the same QUICK tap twice gives the same crit set.
  const a = A.autoplayBurst(q(5, 3, 30), 'expert', 1);
  const b = A.autoplayBurst(q(5, 3, 30), 'expert', 1);
  assert.equal(a.result.crits, b.result.crits);
});

test('fever: full meter gives 7s of game time, ends by timer only, and carries across the breather', () => {
  const tl = q(14, 3, 30);
  const s = S.createSim(tl, { meter: 99.5, feverLeft: 0, streak: 0 }, true);
  const e = tl.events.find((x) => x.kind === W.K_FINN);
  advanceEngaged(s, e.emergeAt + 10);
  S.simTap(s, e.hole);
  assert.equal(s.fever, true);
  assert.equal(s.feverLeft, W.FEVER_MS);
  // An angler hit breaks the streak but not fever.
  const ang = tl.events.find((x) => x.kind === W.K_ANGLER && x.emergeAt > s.t + 50);
  if (ang) {
    S.simAdvanceTo(s, ang.emergeAt + 10);
    if (!s.frozen) S.simTap(s, ang.hole);
    assert.equal(s.fever, true);
  }
  // Bank mid-fever: the rest carries into the next Burst.
  const res = S.simResult(s);
  assert.ok(res.carry.feverLeft > 0 && res.carry.feverLeft < W.FEVER_MS);
  const next = S.createSim(q(14, 4, 30), res.carry);
  assert.equal(next.fever, true);
});

test('interruptions change nothing: game time is the only clock (same taps, same result)', () => {
  const tl = q(33, 2, 12);
  const run = A.autoplayBurst(tl, 'median', 4);
  const again = S.replayBurst(tl, S.NO_CARRY, triples(run.sim.taps));
  assert.equal(again.score, run.result.score);
  assert.equal(again.maxStreak, run.result.maxStreak);
});

test('boss Burst: tentacles and goldens damage the boss; defeat pays out and starts the Victory Lap', () => {
  const tl = q(2, 4, 30);
  assert.equal(tl.boss, true);
  assert.equal(tl.bossHp, W.BOSS_HP[2]);
  const r = A.autoplayBurst(tl, 'bot', 9);
  assert.ok(r.result.bossDamage > 0);
  let downs = 0;
  for (let seed = 1; seed < 12; seed++) if (A.autoplayBurst(q(seed, 4, 30), 'expert', seed).result.bossDown) downs++;
  assert.ok(downs >= 6, `experts usually bonk the boss (${downs}/11)`);
  const inked = q(2, 4, 30).attacks.filter((a) => a.type === T.A_INK);
  assert.ok(inked.length >= 3, 'the kraken throws ink on a cadence');
});

test('splats hide a hole until swiped', () => {
  const tl = q(2, 4, 30);
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
test('proof v2: an autoplayed ride win verifies; a forged result and a bot are rejected', () => {
  const tl = ride(123456);
  const run = A.autoplayBurst(tl, 'median', 5);
  assert.ok(run.result.win);
  assert.ok(run.result.legacyHits >= 10, 'v1 server floor still holds');
  const proof = P.buildProof(tl, S.NO_CARRY, run.sim.taps, run.result, { wallMs: run.stats.wallMs });
  const ok = P.verifyProof(proof, { serverSeed: 123456 });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.flagged, null);
  // Forged: claim a win with no taps.
  const forged = { ...proof, taps: [], swipes: [], result: { ...proof.result } };
  assert.equal(P.verifyProof(forged).ok, false);
  // Wrong seed.
  assert.equal(P.verifyProof(proof, { serverSeed: 99 }).ok, false);
  // Bot: superhuman reactions on a ride win get rejected.
  const bot = A.autoplayBurst(tl, 'bot', 5);
  const bp = P.buildProof(tl, S.NO_CARRY, bot.sim.taps, bot.result, { wallMs: bot.stats.wallMs });
  const bv = P.verifyProof(bp);
  assert.equal(bv.ok, false);
});

test('proof v2: shared-seed anomalies are flagged (shadow board), never rejected; banked Bursts verify', () => {
  const tl = T.buildBurst({ seed: 777, burstIndex: 1, format: 'weekly', difficulty: 2, theme: 'space', unlockLevel: 3, xform: 2 });
  const bot = A.autoplayBurst(tl, 'bot', 1);
  const v = P.verifyProof(P.buildProof(tl, S.NO_CARRY, bot.sim.taps, bot.result, { wallMs: bot.stats.wallMs }));
  assert.equal(v.ok, true);
  assert.ok(v.flagged);
  // bankAndExit mid-Burst: the partial run verifies.
  const s = S.createSim(q(5, 1, 3), S.NO_CARRY, false);
  const e = q(5, 1, 3).events[0];
  S.simAdvanceTo(s, e.emergeAt + 200);
  S.simTap(s, e.hole);
  S.simAdvance(s, 1500);
  S.simBank(s);
  const res = S.simResult(s);
  const pv = P.verifyProof(P.buildProof(q(5, 1, 3), S.NO_CARRY, s.taps, res, { wallMs: 5000 }));
  assert.equal(pv.ok, true, JSON.stringify(pv));
  assert.equal(pv.result.score, res.score);
});

test('walk boost: meter start pre-fills 50%, golden start adds a golden at 2-3.5s, never in ride or duel', () => {
  assert.equal(q(4, 1, 12, { walkBoost: 'meter' }).meterStart, 50);
  const g = q(4, 1, 12, { walkBoost: 'golden' }).events.filter((e) => e.kind === W.K_GOLDEN && e.tellAt >= 1900 && e.tellAt <= 3800);
  assert.ok(g.length >= 1);
  assert.equal(T.buildBurst({ seed: 4, burstIndex: 0, format: 'ride', difficulty: 2, theme: 'park', unlockLevel: 0, walkBoost: 'meter' }).meterStart, 0);
  assert.equal(T.buildBurst({ seed: 4, burstIndex: 0, format: 'duel', difficulty: 2, theme: 'park', unlockLevel: 9, walkBoost: 'meter' }).meterStart, 0);
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
  const tl = T.buildBurst({ seed: 55, burstIndex: 0, format: 'daily', difficulty: 2, theme: 'park', unlockLevel: 0 });
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
test('tuning: ride wins for median, walking and glance players; walk-safe (0 disengaged escapes)', () => {
  for (const prof of ['median', 'walking', 'glance', 'novice']) {
    let wins = 0;
    let dis = 0;
    const n = 30;
    for (let i = 0; i < n; i++) {
      const tl = ride(1000 + i * 7919);
      const r = A.autoplayBurst(tl, prof, 77 + i);
      if (r.result.win) wins++;
      dis += A.disengagedEscapes(tl, r.sim.taps);
    }
    assert.equal(dis, 0, `${prof}: no target escapes a disengaged player`);
    assert.ok(wins / n >= (prof === 'median' ? 0.9 : 0.7), `${prof} wins ${wins}/${n}`);
  }
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

test('score variance: expert top/median ratio stays under 1.6 on one weekly seed', () => {
  const scores = [];
  for (let i = 0; i < 40; i++) {
    const tl = T.buildBurst({ seed: 2026, burstIndex: 2, format: 'weekly', difficulty: 2, theme: 'park', unlockLevel: 0 });
    scores.push(A.autoplayBurst(tl, 'expert', i).result.score);
  }
  scores.sort((a, b) => a - b);
  assert.ok(scores[scores.length - 1] / scores[scores.length >> 1] <= 1.6);
});

test('golden vectors (PHP parity): every timeline hash and every recorded run still reproduces', () => {
  const crypto = require('node:crypto');
  const V = require('../../src/games/whack/__vectors__/vectors.json');
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  for (const t of V.timelines) assert.equal(sha(T.timelineFingerprint(T.buildBurst(t.input))), t.sha256, JSON.stringify(t.input));
  for (const r of V.runs) {
    const v = P.verifyProof(r.proof);
    assert.ok(v.ok || v.reason === 'reaction' || v.reason === 'robotic', JSON.stringify(v).slice(0, 200));
    const res = P.replayProof(r.proof).result;
    assert.equal(res.score, r.expect.score);
    assert.equal(res.win, r.expect.win);
    assert.equal(res.freezes, r.expect.freezes);
    assert.equal(res.bossDamage, r.expect.bossDamage);
  }
});
