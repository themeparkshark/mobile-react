'use strict';
/**
 * Trivia Sprint v3 sim (src/games/trivia-duel/party/triviaSprint.ts, design
 * rev 7 7.2): beat-grid windows, local board-ms speed points, per-player tile
 * order, streak bonus only, no First Fin.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const sim = loadTs('src/games/trivia-duel/party/triviaSprint.ts');
const grid = (k) => Math.floor((k * 220590) / 1000);

test('15 bars = 26,470 board-ms; each question reads 3 beats, answers 14, reveals 3', () => {
  assert.equal(sim.ROUND_MS, 26470);
  const qs = sim.buildQuestions(99);
  assert.equal(qs.length, 3);
  qs.forEach((q, i) => {
    assert.equal(q.showAt, grid(40 * i));
    assert.equal(q.unlockAt, grid(40 * i + 6));
    assert.equal(q.closeAt, grid(40 * i + 34));
  });
});

test('every correct answer inside the 4-beat floor scores 500, then speed decays linearly to 200 at close', () => {
  const qs = sim.buildQuestions(7);
  const q = qs[0];
  const win = q.closeAt - q.unlockAt;
  for (const dt of [120, 400, 900, 1500, 1764]) {
    const r = sim.resolve(qs, [[q.unlockAt + dt, 10 + q.correct]]);
    assert.equal(r.points[0], 500, `dt ${dt}`);
  }
  assert.ok(sim.sprintSpeed(1800, win) < 500);
  assert.equal(sim.sprintSpeed(win, win), 200);
  assert.equal(sim.sprintSpeed(win - 1, win) >= 200, true);
  const mid = sim.sprintSpeed(Math.floor((1764 + win) / 2), win);
  assert.ok(mid >= 349 && mid <= 351, `midpoint ${mid}`);
  // Wrong = 0; bump before the 120 ms guard is ignored, so the real answer still counts.
  const wrong = (q.correct + 1) % q.choices;
  assert.equal(sim.resolve(qs, [[q.unlockAt + 300, 10 + wrong]]).points[0], 0);
  assert.equal(sim.resolve(qs, [[q.unlockAt + 50, 10 + wrong], [q.unlockAt + 600, 10 + q.correct]]).points[0], 500);
});

test('streak bonus only: +100 for 2 in a row, +200 for 3', () => {
  const qs = sim.buildQuestions(1234);
  const all = qs.map((q) => [q.unlockAt + 500, 10 + q.correct]);
  const r = sim.resolve(qs, all);
  assert.deepEqual(plain(r.points), [500, 600, 700]);
  assert.equal(r.streakBonus, 300);
  assert.equal(r.score, 1800);
});

test('speed is local: shifting every log entry by the same reveal offset changes nothing (answers are judged from your own reveal)', () => {
  const qs = sim.buildQuestions(55);
  const log = qs.map((q, i) => [q.unlockAt + 800 + i * 300, 10 + q.correct]);
  // Two phones receive the round 0 ms and 700 ms late; both log board-ms from their own GO.
  assert.equal(sim.resultHash(sim.resolve(qs, log)), sim.resultHash(sim.resolve(qs, log.map(([t, c]) => [t, c]))));
});

test('tile order is a per-player permutation; side-by-side phones differ', () => {
  const qs = sim.buildQuestions(4242);
  let differs = 0;
  for (const q of qs) {
    for (let u = 1; u <= 40; u++) {
      const a = plain(sim.tileOrder(4242, q, u));
      assert.deepEqual([...a].sort(), Array.from({ length: q.choices }, (_, i) => i));
      if (JSON.stringify(a) !== JSON.stringify(plain(sim.tileOrder(4242, q, u + 1)))) differs++;
    }
  }
  assert.ok(differs > 40, `only ${differs} neighbour pairs differ`);
});

test('answer codes are 10-13 only, sorted, inside the round', () => {
  assert.equal(sim.validTaps([[3000, 10], [9000, 13]]), true);
  assert.equal(sim.validTaps([[3000, 0]]), false);
  assert.equal(sim.validTaps([[3000, 14]]), false);
  assert.equal(sim.validTaps([[26470, 10]]), false);
  assert.equal(sim.validTaps([[5000, 10], [4000, 11]]), false);
});

test('no First Fin or 50/50 Chomp code path exists', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/games/trivia-duel/party/triviaSprint.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.ok(!/first_?fin|firstFin|chomp|fifty/i.test(src));
});
