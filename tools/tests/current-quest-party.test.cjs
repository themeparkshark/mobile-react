'use strict';
/**
 * Lagoon Dash: Current Quest's Same-Board Showdown as a Line Party sim
 * (pure, integer-only, replayed by the server's Node sidecar).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const D = loadTs('src/games/current-quest/party/lagoonDash.ts');
const R = loadTs('src/games/current-quest/rules.ts');
const S = loadTs('src/games/current-quest/solver.ts');
const REG = loadTs('src/games-registry/partySims.ts');

test('lagoon dash: registered, seeded Standard board, deterministic bots that clear inside the window', () => {
  const sim = REG.partySim('lagoon_dash');
  assert.ok(sim);
  assert.equal(sim.roundMs, 45000);
  const b1 = D.buildBoard(1234);
  assert.equal(b1.slot, 'standard');
  assert.equal(R.heightOf(b1), 6);
  assert.deepEqual(plain(D.buildBoard(1234)), plain(b1));
  let cleared = 0;
  for (let seed = 0; seed < 40; seed++) {
    const board = D.buildBoard(seed);
    for (const profile of ['rookie', 'regular', 'ace']) {
      const taps = D.botTaps(board, seed, 1, profile);
      assert.deepEqual(plain(D.botTaps(board, seed, 1, profile)), plain(taps), 'deterministic');
      assert.ok(D.validTaps(taps), `seed ${seed} ${profile} valid`);
      assert.ok(taps.length === 0 || taps[0][0] >= D.THINK_FLOOR_MS);
      if (D.resolve(board, taps).cleared) cleared++;
    }
  }
  assert.ok(cleared >= 110, `bots cleared ${cleared}/120`);
});

test('lagoon dash: score ranks shells, then strokes, then undos, and never time', () => {
  const board = D.buildBoard(77);
  const sol = S.solveBoard(board);
  const fast = sol.solutionGold.map((a, i) => [1000 + i * 400, a]);
  const slow = sol.solutionGold.map((a, i) => [5000 + i * 3000, a]);
  const rf = D.resolve(board, fast);
  const rs = D.resolve(board, slow);
  assert.equal(rf.cleared, true);
  assert.equal(rf.shells, 3);
  assert.equal(rf.score, rs.score, 'a walker who takes longer ties a fast finisher');
  assert.notEqual(D.resultHash(rf), D.resultHash(rs), 'the hash still pins the replay');
  assert.ok(D.scoreOf(true, 3, 30, 19, 3, true) > D.scoreOf(true, 2, 1, 0, 3, false), 'a shell outweighs any stroke count');
  assert.ok(D.scoreOf(true, 2, 6, 19, 3, false) > D.scoreOf(true, 2, 7, 0, 3, false), 'a stroke outweighs any undo count');
  assert.ok(D.scoreOf(false, 0, 9, 0, 2, true) < D.scoreOf(true, 1, 30, 19, 2, false), 'any clear beats progress');
  assert.ok(D.scoreOf(false, 0, 9, 0, 1, false) > 0, 'progress, never zero for trying');
});

test('lagoon dash: a ghost finishes a dropped player from their exact state; bad logs are rejected', () => {
  const board = D.buildBoard(9);
  const sol = S.solveBoard(board);
  const own = sol.solution.slice(0, 2).map((a, i) => [1500 + i * 900, a]);
  const filled = D.ghostFill(board, 9, 2, own, 4000, 'regular');
  assert.deepEqual(plain(filled.slice(0, 2)), plain(own));
  assert.ok(D.validTaps(filled));
  assert.equal(D.resolve(board, filled).cleared, true);
  assert.equal(D.validTaps([[100, 1], [50, 2]]), false, 'unsorted');
  assert.equal(D.validTaps([[100, 7]]), false, 'tips and continues are not party actions');
  assert.equal(D.validTaps([[46000, 1]]), false, 'outside the window');
  assert.equal(D.resolve(board, [[100, 9]]).score, D.resolve(board, []).score, 'an invalid log scores as empty');
});
