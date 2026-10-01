'use strict';
/**
 * Whack Rush (src/games/whack/party/whackRush.ts): Whack-a-Shark as a live
 * Line Party round. The server replays every seat with this sim through the
 * sidecar bundle, so it must be deterministic, reject malformed logs, and keep
 * the walk-safe rules without Auto Look-Up (the room clock never stops).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const rush = loadTs('src/games/whack/party/whackRush.ts');
const registry = loadTs('src/games-registry/partySims.ts');

test('registered as a party sim with the Line Party contract', () => {
  const sim = registry.partySim('whack_rush');
  assert.ok(sim);
  assert.equal(sim.roundMs, 20000);
  assert.equal(sim.version, rush.WHACK_RUSH_VERSION);
  const board = sim.build(123);
  assert.equal(board.lengthMs, sim.roundMs);
  assert.equal(board.lookUp, false);
  assert.equal(board.boss, false);
  assert.equal(board.attacks.length, 0);
});

test('same seed, same board and the same bots on every phone and on the server', () => {
  for (const seed of [0, 1, 42, 4294967295, 3735928559]) {
    const a = rush.buildBoard(seed);
    const b = rush.buildBoard(seed);
    assert.deepEqual(plain(a.events), plain(b.events));
    for (const p of ['rookie', 'regular', 'ace']) {
      const ta = rush.botTaps(a, seed, 2, p);
      assert.deepEqual(plain(ta), plain(rush.botTaps(b, seed, 2, p)));
      assert.ok(rush.validTaps(ta), `bot log valid (${p})`);
      assert.equal(rush.resultHash(rush.resolve(a, ta)), rush.resultHash(rush.resolve(b, ta)));
    }
    // Different seats play differently (no mirror bots).
    assert.notDeepEqual(plain(rush.botTaps(a, seed, 0, 'ace')), plain(rush.botTaps(a, seed, 1, 'ace')));
  }
});

test('a real mix: finns, goldens, lures, helmets and twins in 20 seconds', () => {
  const kinds = new Set();
  let n = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const b = rush.buildBoard(seed * 7919);
    n += b.events.length;
    b.events.forEach((e) => kinds.add(e.kind));
    assert.ok(b.events.every((e) => e.tellAt >= 0 && e.duckAt <= 20000 + 1500));
  }
  for (const k of [0, 1, 2, 3]) assert.ok(kinds.has(k), `kind ${k} appears`);
  assert.ok(n / 20 >= 24, `about 30 targets per round, got ${n / 20}`);
});

test('skill shows: aces beat regulars beat rookies over 40 seeds', () => {
  const med = (p) => {
    const a = [];
    for (let seed = 1; seed <= 40; seed++) {
      const b = rush.buildBoard(seed * 104729);
      a.push(rush.resolve(b, rush.botTaps(b, seed, 1, p)).score);
    }
    a.sort((x, y) => x - y);
    return a[20];
  };
  const r = med('rookie');
  const g = med('regular');
  const a = med('ace');
  assert.ok(r < g && g < a, `${r} < ${g} < ${a}`);
});

test('no Auto Look-Up in a live round: an idle board keeps running and never freezes', () => {
  const b = rush.buildBoard(77);
  const idle = rush.resolve(b, []);
  assert.equal(idle.score, 0);
  assert.ok(idle.escapes > 0, 'targets escape an idle seat');
  // A tap after a long idle gap resolves at exactly its board time.
  const e = b.events.find((x) => x.kind === 0 && x.emergeAt > 8000);
  const late = rush.resolve(b, [[e.emergeAt + 100, e.hole]]);
  assert.equal(late.hits, 1);
  assert.deepEqual(plain(late.reactions), [100]);
});

test('walk-safe: a stray bump is a free whiff; a mash breaks the streak', () => {
  const b = rush.buildBoard(9);
  const finns = b.events.filter((e) => e.kind === 0).slice(0, 4);
  const clean = finns.map((e) => [e.emergeAt + 200, e.hole]);
  const base = rush.resolve(b, clean);
  const emptyHole = (t) => [0, 1, 2, 3, 4, 5, 6, 7, 8].find((h) => !b.events.some((e) => e.hole === h && e.tellAt - 500 <= t && t <= e.duckAt + 500));
  const bumpT = finns[1].emergeAt + 400;
  const bumped = rush.resolve(b, [...clean, [bumpT, emptyHole(bumpT)]].sort((x, y) => x[0] - y[0]));
  assert.equal(bumped.score, base.score);
  assert.equal(bumped.whiffs, 1);
  assert.equal(bumped.butters, 0);
});

test('malformed logs are rejected before replay', () => {
  assert.ok(rush.validTaps([[0, 0], [10, 8], [10, 4]]));
  assert.ok(!rush.validTaps([[10, 0], [5, 1]]), 'out of order');
  assert.ok(!rush.validTaps([[10, 9]]), 'hole 9');
  assert.ok(!rush.validTaps([[20001, 0]]), 'after the round');
  assert.ok(!rush.validTaps([[1.5, 0]]), 'fractional ms');
  assert.ok(!rush.validTaps([[1, 0, 1]]), 'extra field');
  assert.ok(!rush.validTaps(Array.from({ length: 401 }, (_, i) => [i, 0])), 'over 400 taps');
});

test('ghost fill keeps my taps before I left, then my ghost plays on', () => {
  const b = rush.buildBoard(31337);
  const own = rush.botTaps(b, 5, 3, 'regular');
  const until = 9000;
  const filled = rush.ghostFill(b, 31337, 3, own, until, 'regular');
  assert.deepEqual(plain(filled.filter(([t]) => t < until)), plain(own.filter(([t]) => t < until)));
  assert.ok(filled.some(([t]) => t >= until));
  assert.ok(rush.validTaps(filled));
});
