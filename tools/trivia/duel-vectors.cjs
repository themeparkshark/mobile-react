'use strict';
/**
 * Trivia Duel shared scoring vectors (design 5, 18.2): the TS engine is the
 * source; the PHP port (WS7, S1b/S2) must reproduce every row exactly.
 *
 *   node tools/trivia/duel-vectors.cjs --write   # regenerate the fixture
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const sc = loadTs('src/games/trivia-duel/engine/scoring.ts');
const FIXTURE = path.join(__dirname, '../tests/fixtures/trivia-duel-vectors.json');

function build() {
  const v = { version: 7, grace: [], speed: [], quick: [], ride: [], bell: [], steal: [], wager: [], suggest: [], final: [], closest: [], stars: [] };
  const choiceSets = [['a', 'b'], ['aaaa', 'bbbb', 'cccc', 'dddd'], ['x'.repeat(30), 'y'.repeat(30), 'z'.repeat(30), 'w'.repeat(30)]];
  for (const c of choiceSets) v.grace.push({ choices: c, g: sc.graceMs(c) });
  v.grace.push({ choices: 'slider', g: sc.graceMs('slider') });
  for (const [g, h] of [[400, 6000], [780, 6000], [1100, 4000], [800, 7000]]) {
    for (let t = 0; t <= 9000; t += 250) {
      v.speed.push({ t, g, h, speed: sc.speedPoints(t, g, h) });
      for (const s of [1, 2, 3, 5]) for (const mods of [{}, { chomp: true }, { holdForfeit: true }]) {
        if (t % 1000 !== 0) continue;
        v.quick.push({ t, g, h, streakAfter: s, mods, pts: sc.quickPoints(true, t, g, h, s, mods) });
      }
    }
  }
  for (let t = 0; t <= 9000; t += 500) for (const mods of [{}, { chomp: true }]) v.ride.push({ t, g: 640, mods, pts: sc.ridePoints(true, t, 640, mods) });
  for (let t = 0; t <= 6000; t += 300) for (const s of [1, 2, 3, 5]) for (const shield of [false, true]) {
    v.bell.push({ t, streakAfter: s, shield, right: sc.buzzPoints(true, t, s, shield), wrong: sc.buzzPoints(false, t, s, shield) });
  }
  for (let t = 0; t <= 3500; t += 250) v.steal.push({ t, pts: sc.stealPoints(true, t) });
  for (const score of [0, 3, 5, 7, 99, 150, 155, 199, 200, 345, 800, 1234, 2999]) v.wager.push({ score, stakes: sc.wagerStakes(score) });
  for (const me of [0, 120, 300, 500, 520, 600, 700, 800, 1000, 1500]) for (const opp of [0, 300, 400, 500, 600, 900]) for (const m of [1, 1.2, 1.5, 1.75]) {
    v.suggest.push({ me, opp, m, ...sc.suggestWager(me, opp, m) });
  }
  for (const [score, right, q, stake] of [[800, true, 250, 400], [800, false, 0, 400], [150, false, 0, 150], [0, true, 170, 0], [345, true, 100, 345]]) v.final.push({ score, right, q, stake, after: sc.applyFinal(score, right, q, stake) });
  for (const [guess, truth, tol, t, h, s] of [[1969, 1969, 8, 0, 7000, 1], [1970, 1969, 8, 0, 7000, 1], [1973, 1969, 8, 7000, 7000, 1], [60, 50, 20, 2000, 7000, 3]]) v.closest.push({ guess, truth, tol, t, h, streakAfter: s, ...sc.closestPoints(guess, truth, tol, t, h, s) });
  for (const [c, n, p] of [[1, 3, 250], [2, 3, 300], [2, 3, 430], [3, 3, 600], [3, 3, 590]]) v.stars.push({ kind: 'ride', correct: c, total: n, points: p, stars: sc.rideStars(c, n, p) });
  for (const [a, b, c, n] of [[500, 600, 3, 5], [610, 600, 3, 5], [800, 600, 3, 5], [610, 600, 5, 5]]) v.stars.push({ kind: 'duel', me: a, opp: b, correct: c, total: n, stars: sc.duelStars(a, b, c, n) });
  return JSON.parse(JSON.stringify(v));
}

if (require.main === module && process.argv.includes('--write')) {
  fs.writeFileSync(FIXTURE, `${JSON.stringify(build(), null, 0)}\n`);
  console.log(`wrote ${FIXTURE}`);
}

module.exports = { build, FIXTURE };
