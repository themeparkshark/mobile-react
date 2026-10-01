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
const FD = loadTs('src/games/memory/modes/fairDeck.ts');
const C = loadTs('src/games/memory/charged.ts');
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
  assert.ok(vectors.vectors.some((v) => v.expect.showtimes > 0), 'vectors cover Showtime and the pot');
  assert.ok(vectors.vectors.some((v) => v.config.signalTurns > 0), 'vectors cover Signal Mode');
});

test('golden vectors: the Fair Deck binds the same faces and the charged clock charges the same ms', () => {
  assert.ok(vectors.fair.length >= 20);
  for (const v of vectors.fair) {
    assert.deepEqual(plain(FD.fairReplay(v.seed, v.faces, v.cols, v.rows, v.flips)), v.expect, v.id);
  }
  for (const v of vectors.charged) {
    const cs = C.createCharge(v.goAt);
    v.flips.forEach((f, i) => {
      assert.deepEqual(plain(C.chargeFlip(cs, f)), v.expect.per[i], `${v.id} flip ${i}`);
      C.revealSent(cs, f.recvAt);
    });
    assert.equal(cs.chargedMs, v.expect.chargedMs);
    assert.equal(cs.allowanceMs, v.expect.allowanceMs);
  }
});

test('server-revealed board: the client learns one face per flip and agrees with the authority', () => {
  const cfg = E.rideSprintConfig();
  const src = B.createSimReveal({ cfg, layout: { pairs: 8, deckSize: 10, seed: 99 }, deckSize: 10, engineSeed: 5 });
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
  const v = plain(src.verdict());
  delete v.chargedMs;
  delete v.allowanceMs;
  assert.deepEqual(v, plain(E.summarize(client)), 'client prediction equals the authority verdict');
  assert.equal(src.endReveal(client.ids).length, 16);
});

test('proof: a cleared Ride Sprint always clears the legacy verifier floor (score >= 400)', () => {
  for (let i = 0; i < 40; i++) {
    const r = S.simulateRide(S.PROFILES.novice, 77 + i * 13);
    if (r.cleared) assert.ok(r.score >= 400, `score ${r.score}`);
  }
});

test('tuning simulation (v8 4.1, 45s charged): careless ~20% first-try fail, honest walking kid under 3% per Ticket, skilled 3-star 15-35%', () => {
  const careless = S.summarizeProfile(S.PROFILES.careless, 1200);
  const kid = S.summarizeProfile(S.PROFILES.kidHonest, 1200);
  const skilled = S.summarizeProfile(S.PROFILES.skilled, 1200);
  assert.ok(careless.failRate >= 0.14 && careless.failRate <= 0.28, `careless first-try fail ${careless.failRate}`);
  assert.ok(kid.failRate >= 0.07 && kid.failRate <= 0.18, `kid first-try fail ${kid.failRate}`);
  assert.ok(kid.failAll3 < 0.03, 'under 3% per Ticket over 3 tries');
  assert.ok(skilled.star3Rate >= 0.15 && skilled.star3Rate <= 0.35, `skilled 3-star ${skilled.star3Rate}`);
  assert.ok(skilled.medianClearMs < kid.medianClearMs);
});

const immediate = () => Promise.resolve();

test('charged reveal board: a slow signal never costs the clock; the rope reconciles to the server charge', async () => {
  const cfg = E.rideSprintConfig();
  const run = async (lat) => {
    const src = B.createSimReveal({ cfg, layout: { pairs: 8, deckSize: 10, seed: 31 }, deckSize: 10, engineSeed: 5, latencyMs: lat, wait: immediate });
    const client = E.createEngine(cfg, { cols: 4, rows: 4, seed: 5 });
    const seen = new Map();
    let clientNow = 0;
    let rxPrev = 0;
    let lastCharged = 0;
    let i = 0;
    for (let guard = 0; guard < 200 && client.status === 'play'; guard++) {
      clientNow = rxPrev + 450; // honest think time
      E.step(client, { t: 'tick', at: clientNow });
      if (client.phase === 2) E.step(client, { t: 'dismiss', slot: -1, at: clientNow });
      let slot = -1;
      if (client.phase === 1) slot = [...(seen.get(client.faces[client.a]) ?? [])].find((x) => x !== client.a && client.know[x] !== E.K_MATCHED) ?? -1;
      if (slot < 0) for (let k = 0; k < 16; k++) if (client.know[k] === E.K_UNSEEN && client.up.indexOf(k) < 0) { slot = k; break; }
      if (slot < 0) for (let k = 0; k < 16; k++) if (client.know[k] !== E.K_MATCHED && client.up.indexOf(k) < 0) { slot = k; break; }
      const res = await src.flip(slot, clientNow, { clientT: clientNow, rxPrevT: rxPrev });
      const rtt = typeof lat === 'function' ? lat(i) : lat;
      i += 1;
      rxPrev = clientNow + rtt;
      seen.set(res.face, [...(seen.get(res.face) ?? []), slot]);
      E.step(client, { t: 'flip', slot, face: res.face, at: clientNow });
      lastCharged = res.chargedMs;
    }
    return { client, src, charged: lastCharged };
  };
  const fast = await run(50);
  const park = await run(C.traceLatency(C.PARK_TRACE_P95_1500));
  assert.equal(fast.src.verdict().status, 'cleared');
  assert.equal(park.src.verdict().status, 'cleared');
  assert.ok(Math.abs(park.charged - fast.charged) <= 300, `${park.charged} vs ${fast.charged}`);
  const slow = await run(5000);
  assert.ok(slow.charged > fast.charged, 'beyond the allowance caps, time does charge');
});

test('Fair Deck reveal board: no layout on the client, a perfect player clears the Daily in exactly 12 turns', async () => {
  const cfg = E.dailyConfig();
  const src = B.createSimFairReveal({ cfg, faces: [0, 1, 2, 3, 4, 5, 6, 7], pairs: 8, seed: 77, engineSeed: 3 });
  assert.equal(src.kind, 'fair');
  assert.equal(src.faceAt(0, [0]), null);
  const client = E.createEngine(cfg, { cols: 4, rows: 4, seed: 3 });
  const seen = new Map();
  let t = 0;
  for (let guard = 0; guard < 100 && client.status === 'play'; guard++) {
    t += 500;
    if (client.phase === 2) E.step(client, { t: 'dismiss', slot: -1, at: t });
    let slot = -1;
    if (client.phase === 1) slot = [...(seen.get(client.faces[client.a]) ?? [])].find((x) => x !== client.a && client.know[x] !== E.K_MATCHED) ?? -1;
    if (slot < 0 && client.phase === 0) for (const slots of seen.values()) { const live = slots.filter((x) => client.know[x] !== E.K_MATCHED); if (live.length >= 2) { slot = live[0]; break; } }
    if (slot < 0) for (let k = 0; k < 16; k++) if (client.know[k] === E.K_UNSEEN && client.up.indexOf(k) < 0) { slot = k; break; }
    const res = await src.flip(slot, t);
    seen.set(res.face, [...(seen.get(res.face) ?? []), slot]);
    E.step(client, { t: 'flip', slot, face: res.face, at: t });
  }
  assert.equal(client.status, 'cleared');
  assert.equal(client.turns, E.fairPerfectFor(8));
  assert.equal(client.luckies, 0, 'zero luck');
  assert.equal(E.dailyStars(client), 3);
  assert.equal(src.endReveal(client.ids).length, 16);
});
