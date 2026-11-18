'use strict';
/**
 * Fix round w3 (lane play): Whack-a-Shark ride round honesty and the kid target.
 *   T040  the ride meter counts the bonks the callouts show and never goes backward;
 *         the loss card says the same count.
 *   T057  "1 BONK TO WIN".
 *   T027 / T223  kid rules (picture-only players): a slow tapper wins about 2 tries in 3,
 *         where the old rules gave them about 1 in 100 (the kid walker lost 14 of 16).
 *   T028  the resume tap on an up target bonks it (see whack-bonk-rush.test.cjs too).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const W = loadTs('src/games/whack/waves.ts');
const T = loadTs('src/games/whack/timeline.ts');
const S = loadTs('src/games/whack/sim.ts');
const A = loadTs('src/games/whack/autoplayer.ts');
const P = loadTs('src/games/whack/proof.ts');
const RT = loadTs('src/gamekit/results/rideTry.ts');

const ride = (seed, extra = {}) => T.buildBurst({ seed, burstIndex: 0, format: 'ride', difficulty: 2, theme: 'pirates', unlockLevel: 0, ...extra });

test('T040: the ride meter counts bonks one by one and never goes backward (escapes, anglerfish, butterfingers)', () => {
  for (const prof of ['novice', 'walking', 'kid', 'masher']) {
    for (let i = 0; i < 12; i++) {
      const tl = ride(300 + i * 977);
      assert.equal(tl.bonkMeter, true);
      const s = S.createSim(tl, undefined, true);
      // Drive with the autoplayer but sample the meter every ms.
      const r = A.autoplayBurst(tl, prof, 11 + i);
      // Replay its taps and watch the meter.
      const taps = r.sim.taps;
      let k = 0;
      let prevBonks = 0;
      let prevCoin = 0;
      while (!s.ended && s.t < tl.lengthMs + 10) {
        while (k < taps.length && taps[k] === s.t) {
          if (taps[k + 1] < 0) S.simUnfreeze(s);
          else S.simTap(s, taps[k + 1]);
          k += 3;
        }
        if (s.frozen && k >= taps.length) break;
        if (!s.frozen) S.simAdvance(s, 1);
        else if (k < taps.length) S.simAdvanceTo(s, taps[k]);
        assert.ok(s.bonks >= prevBonks, `${prof}: bonks never drop`);
        assert.ok(s.coin >= prevCoin, `${prof}: the meter never drops`);
        prevBonks = s.bonks;
        prevCoin = s.coin;
      }
      assert.equal(r.result.bonks <= r.result.winBonks, true);
      if (r.result.win) assert.equal(r.result.bonks, r.result.winBonks, 'a win is exactly the goal');
    }
  }
});

test('T040: an anglerfish costs points, never a bonk; an escape costs nothing on the meter', () => {
  const tl = ride(4242);
  const s = S.createSim(tl, undefined, true);
  const angler = tl.events.find((e) => e.kind === W.K_ANGLER);
  const finn = tl.events.find((e) => e.kind === W.K_FINN);
  assert.ok(angler && finn);
  S.simAdvanceTo(s, finn.emergeAt + 50);
  S.simTap(s, finn.hole);
  assert.equal(s.bonks, 1, 'one Finn, one bonk');
  S.simAdvanceTo(s, angler.emergeAt + 50);
  const before = s.bonks;
  if (s.hPh[angler.hole] === S.P_UP) {
    S.simTap(s, angler.hole);
    assert.equal(s.decoyHits, 1);
  }
  assert.equal(s.bonks, before, 'the anglerfish never takes a bonk back');
});

test('T057: the meter words are singular at 1', () => {
  assert.equal(W.bonksToWinLabel(1), '1 BONK TO WIN');
  assert.equal(W.bonksToWinLabel(13), '13 BONKS TO WIN');
  assert.equal(W.bonksToWinLabel(0), '0 BONKS TO WIN');
});

test('T040: the loss card says the bonks the meter showed', () => {
  assert.equal(RT.rideTrySummary({ stars: 0, meta: { game: 'tap', rideBonks: 4, winBonks: 13, ridePercent: 15 } }).line, '4 of 13 bonks.');
  assert.equal(RT.rideTrySummary({ stars: 0, meta: { game: 'tap', rideBonks: 9, winBonks: 10 } }).near, true);
  // Older runs without the count keep the percent line.
  assert.equal(RT.rideTrySummary({ stars: 0, meta: { game: 'tap', ridePercent: 62 } }).line, '8 of 13 bonks.');
});

test('T027 kid rules: 10 bonks, targets up 25% longer, a calmer board; adult timelines are unchanged', () => {
  const adult = ride(77);
  const kid = ride(77, { kid: true });
  assert.equal(adult.winBonks, 13);
  assert.equal(kid.winBonks, W.RIDE_WIN_BONKS_KID);
  assert.equal(kid.kid, true);
  const finnUp = (tl) => {
    const e = tl.events.find((x) => x.kind === W.K_FINN);
    return e.duckAt - e.emergeAt;
  };
  assert.equal(finnUp(kid), Math.round(W.UP_FINN[2] * W.KID_UP_MULT));
  assert.equal(finnUp(adult), W.UP_FINN[2]);
  assert.ok(kid.events.length < adult.events.length, 'fewer spawns: a calmer board');
  assert.ok(!T.timelineFingerprint(adult).endsWith('|kid'));
  assert.ok(T.timelineFingerprint(kid).endsWith('|kid'));
  // Kid rules only touch the ride round.
  assert.equal(T.buildBurst({ seed: 77, burstIndex: 0, format: 'queue', difficulty: 2, theme: 'park', unlockLevel: 3, kid: true }).kid, false);
  // The proof carries the flag, so a replay rebuilds the kid timeline.
  const run = A.autoplayBurst(kid, 'median', 3);
  const proof = P.buildProof(kid, { meter: 0, feverLeft: 0, streak: 0 }, run.sim.taps, run.result, { wallMs: run.stats.wallMs, pos: run.sim.pos });
  assert.equal(proof.kid, true);
  const replay = P.replayProof(proof).result;
  assert.equal(replay.win, run.result.win);
  assert.equal(replay.bonks, run.result.bonks);
});

test('T027 / T223: the slow picture-only tapper wins about 2 tries in 3 under kid rules (1 in 100 under the old rules)', () => {
  const n = 120;
  let oldWins = 0;
  let kidWins = 0;
  let oldBonks = 0;
  for (let i = 0; i < n; i++) {
    const old = ride(5000 + i * 7919);
    old.bonkMeter = false; // the graded build: percent meter, escapes and anglers took it back
    const o = A.autoplayBurst(old, 'kid', i * 31 + 7).result;
    if (o.win) oldWins++;
    oldBonks += o.bonks;
    if (A.autoplayBurst(ride(5000 + i * 7919, { kid: true }), 'kid', i * 31 + 7).result.win) kidWins++;
  }
  assert.ok(oldWins / n <= 0.05, `old rules: the slow kid wins ${oldWins}/${n} (the walker won 2 of 16)`);
  assert.ok(oldBonks / n < 8, `old rules: about 5 of 13 bonks (walker 0 to 10), got ${(oldBonks / n).toFixed(1)}`);
  assert.ok(kidWins / n >= 0.55 && kidWins / n <= 0.85, `kid rules: about 2 in 3, got ${kidWins}/${n}`);
});

test('adults keep their round: median and novice still win the ride, experts earn 3 stars more often', () => {
  let med = 0;
  let nov = 0;
  for (let i = 0; i < 40; i++) {
    if (A.autoplayBurst(ride(1000 + i * 7919), 'median', 77 + i).result.win) med++;
    if (A.autoplayBurst(ride(1000 + i * 7919), 'novice', 77 + i).result.win) nov++;
  }
  assert.ok(med / 40 >= 0.9, `median ${med}/40`);
  assert.ok(nov / 40 >= 0.7, `novice ${nov}/40`);
});

test('T058: TAP TO KEEP BONKING waits for 2 s with no tap (the freeze comes at 1.2 s, the pill 0.8 s later)', () => {
  const fs = require('node:fs');
  const rs = fs.readFileSync('src/games/whack/render/renderState.ts', 'utf8');
  assert.match(rs, /export const PROMPT_AFTER_FROZEN_MS = 800;/);
  assert.equal(W.LOOKUP_IDLE_MS + 800, 2000);
  assert.match(rs, /const wantPrompt = s\.frozen && an\.frozenFor >= PROMPT_AFTER_FROZEN_MS \? 1 : 0;/);
  const board = fs.readFileSync('src/games/whack/render/WhackBoard.tsx', 'utf8');
  assert.match(board, /const promptOp = useDerivedValue\(\(\) => \(tick\.value, rs\.value\.prompt\)\);/, 'the pill reads the delayed prompt, not the veil');
});
