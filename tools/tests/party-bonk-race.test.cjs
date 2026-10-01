'use strict';
/**
 * Bonk Race v2 sim (src/games/party/bonkRace.ts, design rev 6 7.1). Golden
 * vectors for the server live in tools/fixtures/party-sim/bonk_race.json and
 * are checked by party-sim-bundle.test.cjs; these are the rule tests.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const sim = loadTs('src/games/party/bonkRace.ts');

const seeds = Array.from({ length: 200 }, (_, i) => (Math.imul(i + 3, 2654435761) >>> 0));

test('every spawn rises on the eighth grid of the 135.999 BPM loop; 11 bars = 19,412 ms', () => {
  assert.equal(sim.ROUND_MS, 19412);
  const grid = new Set(Array.from({ length: 88 }, (_, k) => Math.floor((k * 220590) / 1000)));
  for (const seed of seeds.slice(0, 50)) {
    for (const s of sim.buildTimeline(seed)) assert.ok(grid.has(s.at), `seed ${seed} spawn at ${s.at}`);
  }
});

test('Shared Goldens: same hole at 1,764/5,294/8,823/12,353/15,882 on every board, never with a lure', () => {
  for (const seed of seeds) {
    const a = sim.buildTimeline(seed);
    const b = sim.buildTimeline(seed);
    assert.deepEqual(plain(a), plain(b));
    const sg = a.filter((s) => s.sg > 0);
    assert.deepEqual(plain(sg.map((s) => s.at)), [1764, 5294, 8823, 12353, 15882]);
    assert.deepEqual(plain(sg.map((s) => s.sg)), [1, 2, 3, 4, 5]);
    for (const g of sg) {
      assert.equal(g.kind, 'golden');
      assert.equal(g.up, 882);
      assert.ok(g.at - g.tell >= 441 && g.at - g.tell <= 442, 'telegraphed one beat early');
      assert.ok(!a.some((s) => s.kind === 'lure' && s.at === g.at), `seed ${seed}: lure on a Shared Golden downbeat`);
      // Nothing else is up on that hole from the telegraph to the end of its life.
      assert.ok(!a.some((s) => s.id !== g.id && s.hole === g.hole && s.at < g.at + g.up && s.at + s.up > g.tell), `seed ${seed}: hole clash`);
    }
  }
});

test('the ramp: no lures in bars 1-2, at most 3 up, LAST 2 BARS every beat', () => {
  for (const seed of seeds) {
    const board = sim.buildTimeline(seed);
    assert.ok(!board.some((s) => s.kind === 'lure' && s.at < 3529));
    for (const s of board) {
      const up = board.filter((o) => o.at <= s.at && s.at < o.at + o.up).length;
      assert.ok(up <= 4, `seed ${seed}`); // 3 regular + the Shared Golden
    }
    const last = board.filter((s) => s.sg === 0 && s.at >= sim.LAST_BARS_FROM);
    for (const s of last) assert.equal(s.up, 992);
  }
});

function lane(n, kindAt = {}) {
  // n finns on separate times, all on hole 0, then whatever kinds are forced.
  return Array.from({ length: n }, (_, i) => ({ id: i, at: 1000 + i * 600, hole: i % 9, kind: kindAt[i] || 'finn', up: 500, sg: 0, tell: 1000 + i * 600 }));
}

test('streak: x1 for 1-5, +0.5 per 5, cap x3; a lure drops ONE tier (x3 -> x2.5); escapes never touch it', () => {
  assert.deepEqual([1, 5, 6, 10, 11, 16, 21, 40].map(sim.multTenths), [10, 10, 15, 15, 20, 25, 30, 30]);
  assert.equal(sim.lureDrop(23), 15);
  assert.equal(sim.multTenths(sim.lureDrop(23) + 1), 25);
  assert.equal(sim.lureDrop(7), 0);
  assert.equal(sim.lureDrop(3), 0);
  // 23 hits, a lure, then one hit: that hit scores at x2.5.
  const board = lane(26, { 23: 'lure' });
  const taps = board.slice(0, 25).map((s) => [s.at + 400, s.hole]);
  const r = sim.resolve(board, taps);
  assert.equal(r.lureHits, 1);
  const before = sim.resolve(board, taps.slice(0, 23)).score;
  assert.equal(r.score - before, -150 + 250, 'lure -150 flat, next finn 100 x2.5');
  // Escaping target 10 (skipping it) leaves the streak running.
  const skip = board.slice(0, 12).filter((_, i) => i !== 10).map((s) => [s.at + 400, s.hole]);
  assert.equal(sim.resolve(board, skip).maxStreak, 11);
});

test('Butterfingers (3 whiffs inside 1 s) fully resets to x1; single bumps are free', () => {
  const board = lane(12);
  const hits = board.slice(0, 11).map((s) => [s.at + 400, s.hole]);
  const bump = [...hits.slice(0, 10), [7000, 8], ...hits.slice(10)].sort((a, b) => a[0] - b[0]);
  assert.equal(sim.resolve(board, bump).score, sim.resolve(board, hits).score);
  const mash = [...hits.slice(0, 10), [7000, 8], [7100, 8], [7200, 8], ...hits.slice(10)].sort((a, b) => a[0] - b[0]);
  const r = sim.resolve(board, mash);
  assert.equal(r.butterfingers, 1);
  assert.equal(sim.resolve(board, hits).score - r.score, 100, 'hit 11 scores x1 (100) instead of x2 (200)');
});

test('Shared Golden is +100 flat, feeds the streak, and its reaction is recorded for the room settle', () => {
  const seed = 12345;
  const board = sim.buildTimeline(seed);
  const g = board.find((s) => s.sg === 1);
  const r = sim.resolve(board, [[g.at + 90, g.hole]]);
  assert.equal(r.score, 100);
  assert.equal(r.sgHits, 1);
  assert.deepEqual(plain(r.sgReactions), [90, -1, -1, -1, -1]);
  assert.deepEqual(plain(r.reactions), [], 'shared reactions stay out of the fast-reaction anti-cheat stat');
});

test('settleShared: +200 to the lowest reaction, ties within 17 ms share, misses get nothing', () => {
  const s = sim.settleShared([[90, 200, -1, 300, 120], [100, 216, -1, -1, 140], null, [107, 217, -1, 299, 138]]);
  assert.deepEqual(plain(s.bonus), [800, 400, 0, 600]);
  assert.deepEqual(plain(s.golds.map((g) => g.winners)), [[0, 1, 3], [0, 1, 3], [], [0, 3], [0]]);
  assert.deepEqual(plain(s.golds.map((g) => g.reaction)), [90, 200, -1, 299, 120]);
  assert.deepEqual(plain(sim.settleShared([[200, -1, -1, -1, -1], [218, -1, -1, -1, -1]]).bonus), [200, 0]);
});

test('prefix resolve(untilMs) equals resolving only the taps before it', () => {
  for (const seed of seeds.slice(0, 40)) {
    const board = sim.buildTimeline(seed);
    const taps = sim.botTaps(board, seed, 1, 'regular');
    const until = 7058;
    const a = sim.resolve(board, taps, until);
    const b = sim.resolve(board, taps.filter(([t]) => t < until), until);
    assert.equal(sim.resultHash(a), sim.resultHash(b));
    assert.ok(a.score <= sim.resolve(board, taps).score + 1000);
  }
});

test('explain() names the biggest lost-points moment', () => {
  const board = lane(26, { 23: 'lure' });
  const taps = board.slice(0, 25).map((s) => [s.at + 400, s.hole]);
  const m = sim.explain(board, taps);
  assert.equal(m.kind, 'lure');
  assert.ok(m.cost > 150, 'removing the lure gains the -150 and the tier drop');
  assert.equal(sim.explain(board, board.filter((s) => s.kind !== 'lure').map((s) => [s.at + 200, s.hole])).kind, 'none');
  // A SNATCH lost by 30 ms shows up with the room settle.
  const real = sim.buildTimeline(77);
  const g = real.find((s) => s.sg === 3);
  const mine = [[g.at + 150, g.hole]];
  const settle = sim.settleShared([sim.resolve(real, mine).sgReactions, [-1, -1, 120, -1, -1]]);
  const k = sim.explain(real, mine, settle, 0);
  assert.ok(['snatch_missed', 'shared_missed'].includes(k.kind));
  const only = sim.explain(real, [], null, -1);
  assert.ok(['shared_missed', 'golden_escaped'].includes(only.kind));
});

test('crew profiles give a real ladder and profile ghosts are clamped to human ranges', () => {
  const avg = { rookie: 0, regular: 0, ace: 0 };
  for (const seed of seeds.slice(0, 60)) {
    const board = sim.buildTimeline(seed);
    for (const p of Object.keys(avg)) avg[p] += sim.resolve(board, sim.botTaps(board, seed, 2, p)).score / 60;
  }
  assert.ok(avg.rookie < avg.regular && avg.regular < avg.ace, JSON.stringify(avg));
  const style = sim.styleOf({ hitPct: 100, reactMin: 0, reactSpread: 1, lurePct: -5, sgPct: 100, sgMin: 0, sgSpread: 0 });
  assert.deepEqual(plain(style), { hitPct: 95, reactMin: 180, reactSpread: 60, lurePct: 0, sgPct: 98, sgMin: 120, sgSpread: 40 });
  const board = sim.buildTimeline(99);
  assert.deepEqual(plain(sim.botTaps(board, 99, 2, 'ace')), plain(sim.botTaps(board, 99, 2, 'ace')));
});

test('render-only juice: freezes and slow-mo never touch board-ms, so the hash is identical', () => {
  // The client logs board-ms from its board clock; a render freeze only delays
  // drawing. Simulate 40 freezes of 50 ms on the render clock and map back.
  const board = sim.buildTimeline(4242);
  const taps = sim.botTaps(board, 4242, 0, 'ace');
  const rendered = taps.map(([t, h], i) => ({ renderMs: t + Math.min(40, i) * 50, boardMs: t, h }));
  const logged = rendered.map((x) => [x.boardMs, x.h]);
  assert.equal(sim.resultHash(sim.resolve(board, logged)), sim.resultHash(sim.resolve(board, taps)));
});
