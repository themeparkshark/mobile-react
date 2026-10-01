'use strict';
/** Memory Race: placements, attack gate, deterministic crew, attack push-back. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const R = loadTs('src/games/memory/race/raceSim.ts');
const E = loadTs('src/games/memory/engine.ts');

test('placements: first clear wins, then most pairs, then score', () => {
  const p = R.placements([
    { key: 'me', pairs: 8, score: 900, clearAt: 30000 },
    { key: 'a', pairs: 8, score: 2000, clearAt: 28000 },
    { key: 'b', pairs: 6, score: 3000, clearAt: null },
    { key: 'c', pairs: 6, score: 1000, clearAt: null },
  ]);
  assert.deepEqual(plain(p), { a: 1, me: 2, b: 3, c: 4 });
});

test('attack gate: 5s shield, one incoming per 3s, at most 2 stored and released later', () => {
  const g = R.createAttackGate();
  assert.equal(R.offerAttack(g, 4000), false, 'opening shield');
  assert.equal(R.offerAttack(g, 6000), true);
  assert.equal(R.offerAttack(g, 7000), false);
  assert.equal(R.offerAttack(g, 7100), false);
  assert.equal(R.offerAttack(g, 7200), false);
  assert.equal(g.stored, 2, 'capped at 2');
  assert.equal(R.releaseStored(g, 8000), false);
  assert.equal(R.releaseStored(g, 9001), true);
  assert.equal(R.releaseStored(g, 10000), false);
  assert.equal(R.releaseStored(g, 12002), true);
  assert.equal(g.stored, 0);
});

test('crew seats are deterministic from the round seed and play the real engine', () => {
  const layout = R.raceLayout(777);
  const crew = R.crewFor(777);
  assert.equal(crew.length, 3);
  assert.deepEqual(plain(R.crewFor(777).map((c) => c.id)), plain(crew.map((c) => c.id)));
  const a = R.simulateCrew(777, 1, crew[0], layout);
  const b = R.simulateCrew(777, 1, crew[0], layout);
  assert.deepEqual(plain(a.frames), plain(b.frames));
  // The flip log replays on the server engine to the same pairs.
  const s = E.createEngine(E.raceConfig(), { cols: 4, rows: 4, seed: R.seatSeed(777, 1) });
  R.glimpseAll(s, layout);
  for (let i = 0; i + 1 < a.log.length; i += 2) {
    const slot = a.log[i];
    const at = a.log[i + 1];
    if (slot < 0) { E.step(s, { t: 'dismiss', slot: -1, at }); continue; }
    E.step(s, { t: 'tick', at });
    if (s.phase === 2) E.step(s, { t: 'dismiss', slot: -1, at });
    E.step(s, { t: 'flip', slot, face: layout.faces[s.ids[slot]], at });
  }
  assert.equal(s.pairs, a.final.pairs);
});

test('a Gull Swap pushes a crew seat back and aces beat rookies on average', () => {
  const layout = R.raceLayout(4242);
  const seat = R.HOUSE_CREW[0];
  const base = R.simulateCrew(4242, 1, seat, layout);
  const hit = R.simulateCrew(4242, 1, seat, layout, [6000, 12000]);
  const at = 20000;
  assert.ok(R.frameAt(hit, at).pairs <= R.frameAt(base, at).pairs);
  let ace = 0;
  let rookie = 0;
  for (let i = 0; i < 40; i++) {
    const l = R.raceLayout(9000 + i);
    ace += R.simulateCrew(9000 + i, 1, R.HOUSE_CREW[0], l).final.pairs;
    rookie += R.simulateCrew(9000 + i, 2, R.HOUSE_CREW[2], l).final.pairs;
  }
  assert.ok(ace > rookie, `ace ${ace} rookie ${rookie}`);
});

test('engine attack: swaps two seen face-down cards, queues while a card is up, keeps knowledge with the cards', () => {
  const faces = Array.from({ length: 16 }, (_, i) => Math.floor(i / 2));
  const s = E.createEngine(E.raceConfig(), { cols: 4, rows: 4, seed: 3 });
  const flip = (slot, at) => { if (s.phase === 2) E.step(s, { t: 'dismiss', slot, at }); return E.step(s, { t: 'flip', slot, face: faces[s.ids[slot]], at }); };
  flip(0, 100); flip(2, 300); // scout: 0 and 2 seen, held face up
  const ev = E.step(s, { t: 'attack', at: 400 });
  assert.equal(ev.length, 0, 'queued while cards are up');
  const out = E.step(s, { t: 'tick', at: 2000 }); // hold ends -> swap
  const sw = out.find((e) => e.k === 'gullSwap');
  assert.ok(sw);
  assert.equal(s.know[sw.s1], E.K_SEEN);
  assert.equal(s.moved[sw.s1], 1);
});

test('Line Party tap logs replay on the engine to the crew seat result (registration waits on the rev 7 sim port)', () => {
  const P = loadTs('src/games/memory/race/partyGame.ts', {});
  assert.equal(P.MEMORY_RACE_ROUND_MS, 46600);
  const seed = 31337;
  const layout = R.raceLayout(seed);
  const run = R.simulateCrew(seed, 2, R.HOUSE_CREW[1], layout);
  const taps = [];
  for (let i = 0; i + 1 < run.log.length; i += 2) taps.push([run.log[i + 1], run.log[i]]);
  const replay = P.replayRaceTaps(seed, taps);
  assert.equal(replay.pairs, run.final.pairs);
  assert.equal(P.replayRaceScore(seed, taps), replay.score);
});
