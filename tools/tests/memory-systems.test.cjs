'use strict';
/**
 * Memory Match systems: golden vectors (PHP parity), server-revealed board
 * source, the tuning simulation and the proof payload shape.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const E = loadTs('src/games/memory/engine.ts');
const B = loadTs('src/games/memory/boardSource.ts');
const S = loadTs('src/games/memory/simulate.ts');
const vectors = require(path.resolve(__dirname, '../../src/games/memory/engine.vectors.json'));

test('golden vectors replay to their expected summaries (the PHP port uses the same file)', () => {
  assert.equal(vectors.engine, E.ENGINE_VERSION);
  assert.ok(vectors.vectors.length >= 30);
  const statuses = new Set();
  for (const v of vectors.vectors) {
    const s = E.replayLog(v.config, v.init, v.layout, v.log, v.endAt);
    assert.deepEqual(plain(E.summarize(s)), v.expect, v.id);
    statuses.add(v.expect.status);
  }
  assert.ok(statuses.has('cleared'));
  assert.ok(statuses.has('timeout') || statuses.has('out'), 'vectors cover a failure end');
});

test('server-revealed board: the client learns one face per flip and agrees with the authority', () => {
  const cfg = E.rideSprintConfig();
  const src = B.createSimReveal({ cfg, layout: { pairs: 8, deckSize: 10, seed: 99, golden: true }, deckSize: 10, engineSeed: 5 });
  assert.equal(src.kind, 'reveal');
  assert.equal(src.faceAt(0, [0]), null, 'no layout on the client');
  assert.equal(src.endReveal([]), null, 'no reveal while the session runs');
  const client = E.createEngine(cfg, { cols: 4, rows: 4, seed: 5 });
  const seen = new Map();
  let t = 0;
  for (let guard = 0; guard < 200 && client.status === 'play'; guard++) {
    t += 400;
    const a = E.step(client, { t: 'tick', at: t });
    src.send({ t: 'tick', at: t });
    if (client.phase === 2) { E.step(client, { t: 'dismiss', slot: -1, at: t }); src.send({ t: 'dismiss', slot: -1, at: t }); }
    let slot = -1;
    if (client.phase === 1) {
      const fa = client.faces[client.a];
      slot = [...(seen.get(fa) ?? [])].find((x) => x !== client.a && client.know[x] !== E.K_MATCHED) ?? -1;
    }
    if (slot < 0) for (let i = 0; i < 16; i++) if (client.know[i] === E.K_UNSEEN && client.up.indexOf(i) < 0) { slot = i; break; }
    if (slot < 0) for (let i = 0; i < 16; i++) if (client.know[i] !== E.K_MATCHED && client.up.indexOf(i) < 0) { slot = i; break; }
    const { face } = src.flip(slot, t);
    seen.set(face, [...(seen.get(face) ?? []), slot]);
    E.step(client, { t: 'flip', slot, face, at: t });
    void a;
  }
  assert.equal(client.status, 'cleared');
  assert.deepEqual(plain(src.verdict()), plain(E.summarize(client)), 'client prediction equals the authority verdict');
  assert.equal(src.endReveal(client.ids).length, 16);
});

test('proof: a cleared Ride Sprint always clears the legacy verifier floor (score >= 400)', () => {
  for (let i = 0; i < 40; i++) {
    const r = S.simulateRide(S.PROFILES.novice, 77 + i * 13);
    if (r.cleared) assert.ok(r.score >= 400, `score ${r.score}`);
  }
});

test('tuning simulation: experts clear fast, walking kids slower, and a 3-try Ticket almost never fails at 45s', () => {
  const expert = S.summarizeProfile(S.PROFILES.expert, 150);
  const kid = S.summarizeProfile(S.PROFILES.kidWalking, 150);
  assert.ok(expert.medianClearMs < kid.medianClearMs);
  assert.ok(expert.meanShowtimes >= kid.meanShowtimes);
  assert.ok(kid.failAll3 < 0.03, 'under 3% per Ticket over 3 tries');
});
