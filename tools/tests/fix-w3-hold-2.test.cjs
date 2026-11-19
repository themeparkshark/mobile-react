'use strict';
/**
 * Fix round w3, hold-fix 2: the items checker 2 sent back.
 *   T040  blind mashing never wins a Whack ride round on the bonk meter (the Nov 3 safety tapper
 *         scored 0 of 13; after b21824b6 it won with 3 stars in 25 s). The meter still never goes back.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const W = loadTs('src/games/whack/waves.ts');
const T = loadTs('src/games/whack/timeline.ts');
const S = loadTs('src/games/whack/sim.ts');
const A = loadTs('src/games/whack/autoplayer.ts');
const P = loadTs('src/games/whack/proof.ts');

const ride = (seed, extra = {}) => T.buildBurst({ seed, burstIndex: 0, format: 'ride', difficulty: 2, theme: 'pirates', unlockLevel: 0, ...extra });

/** The device safety tapper (verify-2 tools/ride.py W): every hole in turn, gapMs apart, never aims. */
function seqMash(tl, gapMs, start) {
  const s = S.createSim(tl, undefined, true);
  let h = start % 9;
  let next = 300;
  let bonksSeen = 0;
  while (!s.ended && s.t < tl.lengthMs + 5) {
    if (s.t >= next) { S.simTap(s, h); h = (h + 1) % 9; next += gapMs; }
    if (s.frozen) { if (s.tapCount >= W.MAX_TAPS) break; S.simUnfreeze(s); continue; }
    S.simAdvance(s, 1);
    assert.ok(s.bonks >= bonksSeen, 'the meter never goes back');
    bonksSeen = s.bonks;
  }
  return { sim: s, result: S.simResult(s) };
}

test('T040 hold-2: a blind 9-hole mash never wins the ride coin (adult and kid rules)', () => {
  for (const kid of [false, true]) {
    for (const gap of [50, 92, 150]) {
      let wins = 0;
      let bonks = 0;
      for (let i = 0; i < 30; i++) {
        const r = seqMash(ride(9000 + i * 7919, { kid }), gap, i).result;
        if (r.win) wins++;
        bonks += r.bonks;
      }
      assert.equal(wins, 0, `${kid ? 'kid' : 'adult'} mash every ${gap} ms won ${wins}/30`);
      assert.ok(bonks / 30 <= 1, `${kid ? 'kid' : 'adult'} mash every ${gap} ms got ${(bonks / 30).toFixed(1)} bonks`);
    }
    let rnd = 0;
    for (let i = 0; i < 30; i++) if (A.autoplayBurst(ride(9000 + i * 7919, { kid }), 'masher', i * 31 + 7).result.win) rnd++;
    assert.equal(rnd, 0, `random masher (12 taps a second) won ${rnd}/30`);
  }
});

test('T040 hold-2: aimed play keeps its round (stray taps, slow kid, every adult profile)', () => {
  const N = 40;
  const rate = (prof, kid) => {
    let w = 0;
    for (let i = 0; i < N; i++) if (A.autoplayBurst(ride(9000 + i * 7919, { kid }), prof, i * 31 + 7).result.win) w++;
    return w / N;
  };
  for (const prof of ['novice', 'median', 'expert', 'walking', 'glance', 'onbeat']) assert.ok(rate(prof, false) >= 0.95, prof);
  // An aimed player who also bumps 2 random holes a second still wins every round.
  assert.ok(rate({ ...A.PROFILES.median, bumpsPerSec: 2 }, false) >= 0.95, 'median plus 2 stray taps a second');
  // The slow picture-only kid (1 tap a second) never slips: still about 2 wins in 3 under kid rules.
  const kid = rate('kid', true);
  assert.ok(kid >= 0.55 && kid <= 0.85, `kid ${kid}`);
});

test('T040 hold-2: Butterfingers slips the fins on the bonk meter; a slipped tap bonks nothing, a stop and an aimed tap bonks again', () => {
  const tl = ride(4242);
  const s = S.createSim(tl, undefined, true);
  const finn = tl.events.find((e) => e.kind === W.K_FINN && e.emergeAt > 2500);
  assert.ok(finn);
  // Three whiffs inside a second on empty holes, just before the Finn pops.
  // Keep the board live (an idle board freezes for a look-up), then three whiffs inside a second.
  while (s.t < finn.emergeAt - 400) { S.simAdvance(s, 1); if (s.frozen) S.simUnfreeze(s); }
  for (let k = 0; k < 3; k++) {
    const h = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((x) => x !== finn.hole && s.hPh[x] === S.P_EMPTY && s.hSplat[x] !== S.SPLAT_DOWN && s.t >= s.hLock[x]);
    S.simTap(s, h);
    S.simAdvance(s, 60);
  }
  assert.equal(s.butters >= 1, true, 'butterfingers');
  assert.ok(s.slipUntil > s.t, 'the fins slip');
  S.simAdvanceTo(s, finn.emergeAt + 20);
  const before = s.bonks;
  S.simTap(s, finn.hole);
  assert.equal(s.bonks, before, 'a slipped tap bonks nothing');
  assert.ok(s.slips >= 1);
  // Stop for the slip, then aim.
  S.simAdvanceTo(s, Math.max(s.slipUntil, s.t) + 1);
  if (s.hPh[finn.hole] === S.P_UP) {
    S.simTap(s, finn.hole);
    assert.equal(s.bonks, before + 1, 'an aimed tap after a stop bonks');
  }
  // The proof replays the same slips (the taps are logged).
  const run = seqMash(ride(77), 92, 0);
  const proof = P.buildProof(ride(77), { meter: 0, feverLeft: 0, streak: 0 }, run.sim.taps, run.result, { wallMs: run.result.elapsedMs ?? 25000, pos: run.sim.pos });
  const replay = P.replayProof(proof).result;
  assert.equal(replay.win, run.result.win);
  assert.equal(replay.bonks, run.result.bonks);
});

test('T040 hold-2: slips only exist on the bonk meter ride (queue, daily and party rules are unchanged)', () => {
  const q = T.buildBurst({ seed: 5, burstIndex: 0, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 9 });
  const s = S.createSim(q, undefined, true);
  assert.equal(s.bonkMeter, false);
  S.simAdvanceTo(s, 1500);
  for (let i = 0; i < 6; i++) { S.simTap(s, i); S.simAdvance(s, 50); }
  assert.equal(s.slipUntil, -1);
});
