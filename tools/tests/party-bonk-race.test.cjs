'use strict';
/**
 * Bonk Race sim (src/games/party/bonkRace.ts): the committed golden vectors are
 * what the server's PHP port is checked against, so this test fails whenever the
 * TS sim changes without regenerating them (generate-bonk-race-vectors.cjs).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const sim = loadTs('src/games/party/bonkRace.ts');
const vectors = require('./fixtures/party/bonk_race_vectors.json');

test('the committed vectors still match the sim (regenerate them together with the PHP port)', () => {
  assert.equal(vectors.version, sim.BONK_RACE_VERSION);
  for (const v of vectors.vectors) {
    const spawns = sim.buildTimeline(v.seed);
    assert.equal(spawns.length, v.spawn_count, `seed ${v.seed}`);
    assert.deepEqual(plain(spawns.slice(0, 4)), v.first_spawns);
    assert.deepEqual(plain(sim.resolve(spawns, v.human.taps)), v.human.result);
    assert.deepEqual(plain(sim.botTaps(spawns, v.seed, v.bot.seat, v.bot.profile)), v.bot.taps);
  }
});

test('walk-safe scoring: stray bumps are free, a mash breaks the streak, escapes never do', () => {
  const spawns = [
    { id: 0, at: 1000, hole: 0, kind: 'finn', up: 1200 },
    { id: 1, at: 3000, hole: 1, kind: 'finn', up: 1200 },
    { id: 2, at: 6000, hole: 2, kind: 'lure', up: 1200 },
  ];
  let r = sim.resolve(spawns, [[1100, 0], [2000, 8], [3100, 1]]);
  assert.equal(r.maxStreak, 2);
  assert.equal(r.score, 300, 'two QUICK hits at x1');
  r = sim.resolve(spawns, [[1100, 0], [6100, 2]]);
  assert.equal(r.lureHits, 1);
  assert.equal(r.score, 0, 'score never goes negative');
  assert.equal(sim.validTaps([[5, 0], [4, 0]]), false);
});

test('house bots give a real range to chase, and every seat is deterministic', () => {
  const avg = { rookie: 0, regular: 0, ace: 0 };
  for (let i = 0; i < 60; i++) {
    const seed = (Math.imul(i + 11, 2654435761)) >>> 0;
    const spawns = sim.buildTimeline(seed);
    for (const p of Object.keys(avg)) avg[p] += sim.resolve(spawns, sim.botTaps(spawns, seed, i % 4, p)).score / 60;
  }
  assert.ok(avg.rookie < avg.regular && avg.regular < avg.ace, JSON.stringify(avg));
  const spawns = sim.buildTimeline(99);
  assert.deepEqual(plain(sim.botTaps(spawns, 99, 2, 'ace')), plain(sim.botTaps(spawns, 99, 2, 'ace')));
});
