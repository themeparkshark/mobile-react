'use strict';
/**
 * Bonk Race v3 sim (src/games/party/bonkRace.ts, design rev 7 7.1). Golden
 * vectors for the server live in tools/fixtures/party-sim/bonk_race.json and
 * are checked by party-sim-bundle.test.cjs; these are the rule tests and the
 * rev 7 acceptance items that live in the sim.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const sim = loadTs('src/games/party/bonkRace.ts');

const seeds = Array.from({ length: 200 }, (_, i) => (Math.imul(i + 3, 2654435761) >>> 0));
const grid = (k) => Math.floor((k * 220590) / 1000);

test('11 bars = 88 eighths = 19,411 board-ms on the 135.999 BPM grid', () => {
  assert.equal(sim.ROUND_MS, 19411);
  assert.equal(sim.BUBBLE_SEAL_MS, 1764);
});

test('over 200 seeds every mark lands on the eighth grid and every rise is exactly 1 beat (2 eighths) before it', () => {
  const eighth = new Map(Array.from({ length: 89 }, (_, k) => [grid(k), k]));
  for (const seed of seeds) {
    for (const s of sim.buildTimeline(seed)) {
      const k = eighth.get(s.mark);
      assert.ok(k !== undefined, `seed ${seed}: mark ${s.mark} off the grid`);
      assert.equal(s.at, grid(k - 2), `seed ${seed}: rise of mark ${s.mark}`);
      // Bars 1-2 mark on beats only (even eighths).
      if (k < 16) assert.equal(k % 2, 0, `seed ${seed}: bar 1-2 mark on a half-beat`);
    }
  }
});

test('beat judgement: |tap - mark| <= 50 PERFECT 160, <= 110 GREAT 130, beyond GOOD 100; golden 3x', () => {
  assert.deepEqual([0, 50, -50, 51, 110, -110, 111, -300, 500].map((d) => sim.judge(5000, 5000 + d)), [0, 0, 0, 1, 1, 1, 2, 2, 2]);
  const board = [
    { id: 0, at: 1000, mark: 1441, hole: 0, kind: 'finn', up: 1100, sg: 0, tell: 1000 },
    { id: 1, at: 2000, mark: 2441, hole: 1, kind: 'finn', up: 1100, sg: 0, tell: 2000 },
    { id: 2, at: 3000, mark: 3441, hole: 2, kind: 'finn', up: 1100, sg: 0, tell: 3000 },
    { id: 3, at: 4000, mark: 4441, hole: 3, kind: 'golden', up: 1100, sg: 0, tell: 4000 },
    { id: 4, at: 5000, mark: 5441, hole: 4, kind: 'lure', up: 1100, sg: 0, tell: 5000 },
  ];
  const r = sim.resolve(board, [[1441 + 50, 0], [2441 - 110, 1], [3441 + 300, 2], [4441, 3]]);
  assert.equal(r.score, 160 + 130 + 100 + 480);
  assert.deepEqual(plain(r.judgements), [2, 1, 1]);
  assert.deepEqual(plain(r.offsets), [50, -110, 300, 0]);
  assert.deepEqual(plain(r.reactions), [491, 331, 741, 441]);
  // Early taps while up are GOOD too.
  assert.equal(sim.resolve(board, [[1000, 0]]).score, 100);
});

test('lures never get a ring: no mark judgement, -150 flat, and the board never puts one in bars 1-2', () => {
  for (const seed of seeds) {
    const board = sim.buildTimeline(seed);
    assert.ok(!board.some((s) => s.kind === 'lure' && s.mark < grid(16)), `seed ${seed}`);
  }
  const lure = [{ id: 0, at: 1000, mark: 1441, hole: 0, kind: 'lure', up: 1100, sg: 0, tell: 1000 }];
  const r = sim.resolve(lure, [[1441, 0]]);
  assert.equal(r.lureHits, 1);
  assert.deepEqual(plain(r.judgements), [0, 0, 0]);
});

test('Shared Goldens: same hole at marks 1,764/5,294/8,823/12,353/15,882 on every board, never with a lure', () => {
  for (const seed of seeds) {
    const a = sim.buildTimeline(seed);
    assert.deepEqual(plain(a), plain(sim.buildTimeline(seed)));
    const sg = a.filter((s) => s.sg > 0);
    assert.deepEqual(plain(sg.map((s) => s.mark)), [1764, 5294, 8823, 12353, 15882]);
    assert.deepEqual(plain(sg.map((s) => s.at)), [1323, 4852, 8382, 11911, 15441]);
    for (const g of sg) {
      assert.equal(g.kind, 'golden');
      assert.ok(g.at - g.tell >= 441 && g.at - g.tell <= 442, 'telegraphed one beat before the rise');
      assert.ok(!a.some((s) => s.kind === 'lure' && s.mark === g.mark), `seed ${seed}: lure on a Shared Golden downbeat`);
      assert.ok(!a.some((s) => s.id !== g.id && s.hole === g.hole && s.at < g.at + g.up && s.at + s.up > g.tell), `seed ${seed}: hole clash`);
    }
  }
});

test('the ramp: up-times 1,323 / 1,102 / 992 ms, at most 3 regular targets up', () => {
  for (const seed of seeds) {
    const board = sim.buildTimeline(seed);
    for (const s of board) {
      const expect = s.mark < grid(16) ? 1323 : s.mark < grid(72) ? 1102 : 992;
      assert.equal(s.up, expect, `seed ${seed} mark ${s.mark}`);
      const up = board.filter((o) => o.at <= s.at && s.at < o.at + o.up).length;
      assert.ok(up <= 4, `seed ${seed}`); // 3 regular + the Shared Golden
    }
  }
});

function lane(n, kindAt = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: i, at: 1000 + i * 600, mark: 1441 + i * 600, hole: i % 9, kind: kindAt[i] || 'finn', up: 560, sg: 0, tell: 1000 + i * 600 }));
}
const onMark = (board) => board.map((s) => [s.mark, s.hole]);

test('streak: x1 for 1-5, +0.5 per 5, cap x3; a lure drops ONE tier (x3 -> x2.5); escapes never touch it', () => {
  assert.deepEqual([1, 5, 6, 10, 11, 16, 21, 40].map(sim.multTenths), [10, 10, 15, 15, 20, 25, 30, 30]);
  assert.equal(sim.lureDrop(23), 15);
  const board = lane(26, { 23: 'lure' });
  const taps = onMark(board.slice(0, 25));
  const r = sim.resolve(board, taps);
  assert.equal(r.lureHits, 1);
  const before = sim.resolve(board, taps.slice(0, 23)).score;
  assert.equal(r.score - before, -150 + 400, 'lure -150 flat, next PERFECT 160 x2.5');
  const skip = onMark(board.slice(0, 12).filter((_, i) => i !== 10));
  assert.equal(sim.resolve(board, skip).maxStreak, 11);
});

test('Butterfingers (3 whiffs inside 1 s) fully resets to x1; single bumps are free', () => {
  const board = lane(12);
  const hits = onMark(board.slice(0, 11));
  const bump = [...hits.slice(0, 10), [7000, 8], ...hits.slice(10)].sort((a, b) => a[0] - b[0]);
  assert.equal(sim.resolve(board, bump).score, sim.resolve(board, hits).score);
  const mash = [...hits.slice(0, 10), [7000, 8], [7100, 8], [7200, 8], ...hits.slice(10)].sort((a, b) => a[0] - b[0]);
  const r = sim.resolve(board, mash);
  assert.equal(r.butterfingers, 1);
  assert.equal(sim.resolve(board, hits).score - r.score, 160, 'hit 11 scores x1 (160) instead of x2 (320)');
});

test('Splash: earned only on streak hits 10 and 20, max 2 per round', () => {
  const board = lane(32, { 25: 'lure' });
  const r = sim.resolve(board, onMark(board));
  assert.deepEqual(plain(sim.splashEarned(r)), [board[9].mark, board[19].mark]);
  // A lure at 25 drops to 15; climbing back to 20 would earn a third, but the cap is 2.
  assert.equal(r.splashes.length, 2);
  const nine = sim.resolve(board, onMark(board.slice(0, 9)));
  assert.deepEqual(plain(nine.splashes), []);
  // Butterfingers before 10 means the 10th hit of the NEW streak earns it.
  const b2 = lane(16);
  const mash = [...onMark(b2.slice(0, 5)), [3900, 8], [3950, 8], [4000, 8], ...onMark(b2.slice(5))].sort((a, b) => a[0] - b[0]);
  assert.deepEqual(plain(sim.resolve(b2, mash).splashes), [b2[14].mark]);
});

test('a bubble seals the next spawn\'s hole for 4 beats, eats spawns under it, and clears on the 2nd tap without touching the streak', () => {
  const board = lane(10);
  // Lands at 2300: the next spawn to rise is id 3 (at 2800, hole 3).
  const base = onMark(board);
  const log = [...base, [2300, 1001]].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const r = sim.resolve(board, log);
  assert.equal(r.bubbles, 1);
  assert.equal(r.eaten, 1, 'the target that rose under it is gone');
  assert.equal(r.bubbleTaps, 1, 'the tap meant for the eaten target cracks the bubble');
  assert.equal(r.bubblesCleared, 0);
  assert.equal(r.whiffs, 0, 'bubble taps are never whiffs');
  // Two taps pop it before the target rises: nothing is eaten.
  const cleared = [...base, [2300, 1001], [2400, 3], [2500, 3]].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const c = sim.resolve(board, cleared);
  assert.equal(c.bubblesCleared, 1);
  assert.equal(c.eaten, 0);
  assert.equal(c.maxStreak, 10, 'clearing never breaks the streak');
  assert.equal(c.score, sim.resolve(board, base).score);
  // Uncleared, it expires after 1,764 ms.
  const late = [...base.filter(([, h]) => h !== 3), [2300, 1001]].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const e = sim.resolve(board, late);
  assert.equal(e.eaten, 1);
  assert.equal(e.escapes, 0, 'an eaten target is not an escape');
});

test('ghosts clear the bubbles they receive and never whiff on them', () => {
  for (const seed of seeds.slice(0, 80)) {
    const board = sim.buildTimeline(seed);
    const incoming = [[grid(12), 1], [grid(36), 2], [grid(64), 3]];
    for (const p of ['rookie', 'regular', 'ace']) {
      const taps = sim.botTaps(board, seed, 1, p, 0, incoming);
      assert.ok(sim.validTaps(taps));
      const r = sim.resolve(board, taps);
      assert.equal(r.bubbles, 3);
      assert.equal(r.whiffs, 0, `seed ${seed} ${p}`);
      assert.ok(r.bubblesCleared >= 2, `seed ${seed} ${p} cleared ${r.bubblesCleared}`);
    }
  }
});

test('settleShared: +200 to the smallest |offset|, ties within 17 ms share, misses get nothing', () => {
  const s = sim.settleShared([[9, 20, -1, 30, 12], [10, 38, -1, -1, 14], null, [27, 37, -1, 29, 30]]);
  assert.deepEqual(plain(s.bonus), [800, 400, 0, 400]);
  assert.deepEqual(plain(s.golds.map((g) => g.winners)), [[0, 1], [0, 3], [], [0, 3], [0, 1]]);
  assert.deepEqual(plain(s.golds.map((g) => g.offset)), [9, 20, -1, 29, 12]);
});

test('Shared Golden is golden points on the judgement, feeds the streak, offset recorded for the room settle', () => {
  const board = sim.buildTimeline(12345);
  const g = board.find((s) => s.sg === 1);
  const r = sim.resolve(board, [[g.mark - 30, g.hole]]);
  assert.equal(r.score, 480);
  assert.equal(r.sgHits, 1);
  assert.deepEqual(plain(r.sgOffsets), [30, -1, -1, -1, -1]);
  assert.deepEqual(plain(r.offsets), [], 'shared offsets stay out of the anti-cheat timing stats');
});

test('prefix resolve(untilMs) equals resolving only the entries before it', () => {
  for (const seed of seeds.slice(0, 40)) {
    const board = sim.buildTimeline(seed);
    const taps = sim.botTaps(board, seed, 1, 'regular', 0, [[grid(20), 1]]);
    const until = 7058;
    const a = sim.resolve(board, taps, until);
    const b = sim.resolve(board, taps.filter(([t]) => t < until), until);
    assert.equal(sim.resultHash(a), sim.resultHash(b));
  }
});

test('explain() names the biggest lost-points moment, including a Splash that landed', () => {
  const board = lane(26, { 23: 'lure' });
  const m = sim.explain(board, onMark(board.slice(0, 25)));
  assert.equal(m.kind, 'lure');
  assert.ok(m.cost > 150);
  assert.equal(sim.explain(board, onMark(board.filter((s) => s.kind !== 'lure'))).kind, 'none');
  const clean = lane(12);
  const splashed = [...onMark(clean), [2300, 1001]].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const k = sim.explain(clean, splashed);
  assert.equal(k.kind, 'splashed');
  assert.equal(k.bar, sim.barOf(2300));
  const real = sim.buildTimeline(77);
  const g = real.find((s) => s.sg === 3);
  const mine = [[g.mark + 60, g.hole]];
  const settle = sim.settleShared([sim.resolve(real, mine).sgOffsets, [-1, -1, 20, -1, -1]]);
  const s = sim.explain(real, mine, settle, 0);
  assert.ok(['snatch_missed', 'shared_missed'].includes(s.kind));
});

test('band check: perfect-read score per seed, band +/-5% of the version mean', () => {
  let inBand = 0;
  for (const seed of seeds) {
    const board = sim.buildTimeline(seed);
    const score = sim.bandCheck(board);
    assert.ok(score > 9000 && score < 22000, `seed ${seed}: ${score}`);
    if (sim.bandOk(board)) {
      inBand++;
      assert.ok(Math.abs(score - sim.BAND_MEAN) * 100 <= 5 * sim.BAND_MEAN);
    }
  }
  assert.ok(inBand >= 40, `only ${inBand}/200 seeds in band`);
});

test('crew profiles give a real ladder and profile ghosts are clamped to human ranges', () => {
  const avg = { rookie: 0, regular: 0, ace: 0 };
  for (const seed of seeds.slice(0, 60)) {
    const board = sim.buildTimeline(seed);
    for (const p of Object.keys(avg)) avg[p] += sim.resolve(board, sim.botTaps(board, seed, 2, p)).score / 60;
  }
  assert.ok(avg.rookie < avg.regular && avg.regular < avg.ace, JSON.stringify(avg));
  const style = sim.styleOf({ hitPct: 100, offBias: -900, offSpread: 1, lurePct: -5, sgPct: 100, sgBias: 0, sgSpread: 0, clearMin: 0, clearSpread: 0 });
  assert.deepEqual(plain(style), { hitPct: 95, offBias: -200, offSpread: 40, lurePct: 0, sgPct: 98, sgBias: 0, sgSpread: 30, clearMin: 200, clearSpread: 50 });
});

test('render-only juice: one log rendered with 40 freezes and with 0 gives the same resolve hash', () => {
  const board = sim.buildTimeline(4242);
  const taps = sim.botTaps(board, 4242, 0, 'ace');
  const rendered = taps.map(([t, h], i) => ({ renderMs: t + Math.min(40, i) * 33, boardMs: t, h }));
  assert.equal(sim.resultHash(sim.resolve(board, rendered.map((x) => [x.boardMs, x.h]))), sim.resultHash(sim.resolve(board, taps)));
});

test('walk safety: no step, cadence or stillness input exists in the sims or the party scoring code', () => {
  const root = path.resolve(__dirname, '../..');
  const files = ['src/games/party/bonkRace.ts', 'src/games/trivia-duel/party/triviaSprint.ts', 'src/games-registry/partySims.ts'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.ok(!/\b(step|steps|stride|cadence|pedometer|still(ness)?|accelerometer|motion)\b/i.test(src), `${f} reads movement`);
  }
});
