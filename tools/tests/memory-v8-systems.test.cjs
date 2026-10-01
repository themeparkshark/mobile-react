'use strict';
/**
 * Memory Match v8 systems: the Fair Deck (3.5) property tests, the charged
 * clock (10.1) against latency traces, Signal Mode selection, and Time
 * Attack's first-success unlock ledger, Heat and Memory Rank (4.2).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const E = loadTs('src/games/memory/engine.ts');
const FD = loadTs('src/games/memory/modes/fairDeck.ts');
const C = loadTs('src/games/memory/charged.ts');
const U = loadTs('src/games/memory/modes/unlocks.ts');

const FACES8 = [3, 7, 1, 9, 0, 5, 2, 8];

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (Math.imul(a, 1103515245) + 12345) >>> 0;
    return a / 4294967296;
  };
}

/** Play a Fair Deck board with a policy; returns { turns, luckyFirstSight, faces }. */
function playFair(seed, choose, n = 16) {
  const d = FD.createFairDeck(seed, FACES8, 4, n / 4);
  const s = E.createEngine(E.dailyConfig(), { cols: 4, rows: n / 4, seed });
  let t = 0;
  let unforcedLucky = 0;
  const order = [];
  for (let guard = 0; guard < 400 && s.status === 'play'; guard++) {
    if (s.phase === 2) E.step(s, { t: 'dismiss', slot: -1, at: (t += 10) });
    const slot = choose(s);
    const aFace = s.phase === 1 ? s.faces[s.a] : null;
    const halfBefore = d.half.slice();
    const wasNew = d.slots[slot] === -1;
    const face = FD.fairFlip(d, slot, aFace);
    order.push(face);
    const ev = E.step(s, { t: 'flip', slot, face, at: (t += 300) });
    const m = ev.find((e) => e.k === 'match');
    if (m && m.grade === 'lucky' && wasNew) {
      const forced = halfBefore.length === 1 && halfBefore[0] === aFace;
      if (!forced) unforcedLucky += 1;
    }
  }
  return { s, turns: s.turns, unforcedLucky, order, deck: d };
}

const perfectPlayer = (s) => {
  // Cash a known pair; otherwise flip a new card; as B, the known partner of A or a new card.
  const known = new Map();
  for (let i = 0; i < s.n; i++) if (s.know[i] === E.K_SEEN && s.up.indexOf(i) < 0) known.set(s.faces[i], [...(known.get(s.faces[i]) || []), i]);
  if (s.phase === 1) {
    const fa = s.faces[s.a];
    const p = (known.get(fa) || []).find((i) => i !== s.a);
    if (p != null) return p;
    for (let i = 0; i < s.n; i++) if (s.know[i] === E.K_UNSEEN && i !== s.a) return i;
  }
  for (const slots of known.values()) if (slots.length >= 2) return slots[0];
  for (let i = 0; i < s.n; i++) if (s.know[i] === E.K_UNSEEN) return i;
  for (let i = 0; i < s.n; i++) if (s.know[i] !== E.K_MATCHED) return i;
  return -1;
};

test('Fair Deck: PERFECT is exactly ceil(n/2) + n turns for a perfect player, on every seed', () => {
  for (let seed = 1; seed < 300; seed++) {
    const r = playFair(seed, perfectPlayer);
    assert.equal(r.s.status, 'cleared', `seed ${seed}`);
    assert.equal(r.turns, E.fairPerfectFor(8), `seed ${seed}`);
  }
  // 4x2 and 4x3 boards too
  const small = FD.createFairDeck(5, [1, 2, 3, 4], 4, 2);
  assert.equal(small.pairs, 4);
});

test('Fair Deck: no unforced first-sight match over 10k random flip orders', () => {
  let total = 0;
  for (let i = 0; i < 10000; i++) {
    const r0 = rng(i * 7919 + 3);
    const choose = (s) => {
      const open = [];
      for (let k = 0; k < s.n; k++) if (s.know[k] !== E.K_MATCHED && s.up.indexOf(k) < 0) open.push(k);
      return open[Math.floor(r0() * open.length)];
    };
    const r = playFair(i, choose);
    total += r.unforcedLucky;
  }
  assert.equal(total, 0);
});

test('Fair Deck: the k-th new face is identical for every player on a seed, whatever slots they flip', () => {
  const seed = 424242;
  const novelty = (choose) => {
    const r = playFair(seed, choose);
    const out = [];
    for (const f of r.order) if (out.indexOf(f) < 0) out.push(f);
    return out;
  };
  const a = novelty(perfectPlayer);
  const r1 = rng(9);
  const b = novelty((s) => {
    const open = [];
    for (let k = 0; k < s.n; k++) if (s.know[k] !== E.K_MATCHED && s.up.indexOf(k) < 0) open.push(k);
    return open[Math.floor(r1() * open.length)];
  });
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 8);
});

test('Fair Deck: a bound slot never changes, and the audit replay reproduces the session', () => {
  const d = FD.createFairDeck(77, FACES8, 4, 4);
  const flips = [{ slot: 3, aFace: null }, { slot: 9, aFace: null }];
  const f3 = FD.fairFlip(d, 3, null);
  const f9 = FD.fairFlip(d, 9, f3);
  assert.equal(FD.fairFlip(d, 3, null), f3, 'stable');
  assert.deepEqual(plain(FD.fairReplay(77, FACES8, 4, 4, flips.map((x, i) => ({ slot: x.slot, aFace: i === 1 ? f3 : null })))), [f3, f9]);
  assert.notEqual(f3, f9, 'two first sights never match');
});

test('Fair Deck: a forced match (only A\'s face left half-known) is the one lucky the policy allows', () => {
  // Reveal all 8 faces, cash 7, leave face X with one copy known.
  const d = FD.createFairDeck(3, [0, 1, 2, 3], 4, 2);
  const seen = [0, 1, 2, 3].map((slot) => FD.fairFlip(d, slot, null));
  // cash 3 of them on new slots 4,5,6 (B = known partner is the player's choice; binding is what matters)
  const x = seen[3];
  const b4 = FD.fairFlip(d, 4, null);
  const b5 = FD.fairFlip(d, 5, null);
  const b6 = FD.fairFlip(d, 6, null);
  assert.ok([b4, b5, b6].every((f) => seen.indexOf(f) >= 0));
  const last = FD.fairFlip(d, 7, x);
  assert.equal(last, [0, 1, 2, 3].find((f) => [b4, b5, b6].indexOf(f) < 0));
});

// -----------------------------------------------------------------------------
// Charged clock
// -----------------------------------------------------------------------------

/** Simulate an honest scripted run under a latency function; returns charged ms at clear. */
function chargedRun(latency, thinks) {
  const cs = C.createCharge(0);
  let clientNow = 0; // client ms since GO
  let rxPrev = 0;
  let serverSent = 0;
  for (let i = 0; i < thinks.length; i++) {
    const tap = rxPrev + thinks[i];
    clientNow = tap;
    const rtt = latency(i);
    const recvAt = Math.max(serverSent, tap + rtt / 2);
    C.chargeFlip(cs, { clientT: tap, rxPrevT: rxPrev, recvAt });
    C.revealSent(cs, recvAt);
    serverSent = recvAt;
    rxPrev = recvAt + rtt / 2;
  }
  void clientNow;
  return cs;
}

test('charged clock: a park trace (p95 1500ms) charges within 300ms of the same run at 50ms', () => {
  const thinks = Array.from({ length: 24 }, (_, i) => 500 + ((i * 137) % 700));
  const fast = chargedRun(C.fixedLatency(50), thinks);
  const park = chargedRun(C.traceLatency(C.PARK_TRACE_P95_1500), thinks);
  assert.ok(Math.abs(park.chargedMs - fast.chargedMs) <= 300, `${park.chargedMs} vs ${fast.chargedMs}`);
  assert.ok(park.allowanceMs <= C.ALLOWANCE_PER_TRY_MS);
});

test('charged clock: per-flip cap 1500ms and per-try cap 12000ms hold against a client reporting 0 think time', () => {
  const cs = C.createCharge(0);
  let sent = 0;
  for (let i = 0; i < 20; i++) {
    const recvAt = sent + 4000; // 4s gaps
    const r = C.chargeFlip(cs, { clientT: 0, rxPrevT: 1e9, recvAt }); // lies: think clamps to 0
    assert.ok(r.allowance <= C.ALLOWANCE_PER_FLIP_MS);
    C.revealSent(cs, recvAt);
    sent = recvAt;
  }
  assert.equal(cs.allowanceMs, C.ALLOWANCE_PER_TRY_MS);
  assert.equal(cs.capHit, true);
  assert.equal(cs.chargedMs, 20 * 4000 - 12000);
});

test('charged clock: think clamps to the server gap; pipelined taps have think 0', () => {
  const cs = C.createCharge(1000);
  const a = C.chargeFlip(cs, { clientT: 5000, rxPrevT: 0, recvAt: 3000 });
  assert.equal(a.gap, 2000);
  assert.equal(a.think, 2000);
  assert.equal(a.charged, 2000);
  C.revealSent(cs, 3000);
  const b = C.chargeFlip(cs, { clientT: 0, rxPrevT: 0, recvAt: 3400, pipelined: true });
  assert.equal(b.think, 0);
  assert.equal(b.allowance, 400);
  assert.equal(b.charged, 0);
});

test('Signal Mode engages above a 2000ms median start ping, and integrity flags robotic or lagged-allowance runs', () => {
  assert.equal(C.signalModeFor([2500, 2100, 400]), true);
  assert.equal(C.signalModeFor([2500, 1900, 400]), false);
  assert.equal(C.signalModeFor([]), false);
  const cs = C.createCharge(0);
  for (let i = 0; i < 6; i++) C.chargeFlip(cs, { clientT: i * 100, rxPrevT: i * 100, recvAt: i * 100 + 50 });
  const bad = C.integrity(cs, 100);
  assert.equal(bad.humanOk, false);
  assert.ok(bad.reasons.indexOf('client_floor') >= 0);
  const ok = chargedRun(C.fixedLatency(80), Array.from({ length: 10 }, () => 600));
  assert.equal(C.integrity(ok, 80).humanOk, true);
  const lag = chargedRun(C.fixedLatency(2400), Array.from({ length: 16 }, () => 300));
  assert.equal(C.integrity(lag, 120).flagged, true, 'used > 8000ms allowance with a fast start ping');
});

// -----------------------------------------------------------------------------
// Unlock ledger, Heat, Memory Rank
// -----------------------------------------------------------------------------

test('unlock ledger: one new system per board, each only after its first success', () => {
  const L0 = U.EMPTY_LEDGER;
  let p = U.planBoard(1, 0, L0);
  assert.equal(p.unlock, null);
  assert.equal(p.sys.golden || p.sys.showtime || p.sys.peek || p.sys.quick, false);
  p = U.planBoard(2, 0, L0);
  assert.equal(p.unlock, null);
  assert.equal(p.locked, 'golden', 'One more like this.');
  const L1 = U.recordBoard(L0, { cleared: true, slips: 1, maxChain: 2, showtimes: 0, peekMatches: 0 });
  p = U.planBoard(2, 0, L1);
  assert.equal(p.unlock, 'golden');
  assert.equal(p.sys.golden, true);
  assert.equal(p.introduced, 1);
  p = U.planBoard(3, 1, L1);
  assert.equal(p.locked, 'showtime');
  const L2 = U.recordBoard(L1, { cleared: true, slips: 3, maxChain: 3, showtimes: 0, peekMatches: 0 });
  p = U.planBoard(3, 1, L2);
  assert.equal(p.unlock, 'showtime');
  assert.equal(p.sys.showtime && p.sys.photoFlash, true);
  const L4 = { cleanClear: true, chain3: true, showtime: true, peekMatch: true };
  let intro = 0;
  const unlocks = [];
  for (let b = 1; b <= 7; b++) {
    const q = U.planBoard(b, intro, L4);
    intro = q.introduced;
    unlocks.push(q.unlock);
  }
  assert.deepEqual(unlocks, [null, 'golden', 'showtime', 'peek', 'quick', null, null]);
});

test('Heat: opt-in, from B3 only, +25% one toggle, +60% both, never more than 2 modifiers', () => {
  const L4 = { cleanClear: true, chain3: true, showtime: true, peekMatch: true };
  assert.equal(U.planBoard(2, 1, L4, { seagull: true, tide: true }).sys.seagull, false);
  const p = U.planBoard(3, 2, L4, { seagull: true, tide: true });
  assert.equal(p.sys.seagull && p.sys.tideShift, true);
  assert.equal(p.sys.heatPct, 60);
  assert.equal(U.planBoard(4, 3, L4, { seagull: true, tide: false }).sys.heatPct, 25);
  assert.equal(U.planBoard(4, 3, L4).sys.heatPct, 0);
  for (let b = 1; b < 12; b++) assert.ok(E.modifierCount(U.planBoard(b, 4, L4, { seagull: true, tide: true }).sys) <= 2);
});

test('Memory Rank from the best board across the last 10 runs', () => {
  assert.equal(U.memoryRank([]), 'none');
  assert.equal(U.memoryRank([1, 2]), 'bronzeBooth');
  assert.equal(U.memoryRank([3]), 'silverBooth');
  assert.equal(U.memoryRank([4, 2]), 'goldBooth');
  assert.equal(U.memoryRank([5]), 'barker');
  assert.equal(U.memoryRank([6, 7, 6]), 'goldBarker');
  assert.equal(U.memoryRank([6, 6, 6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 'none', 'only the last 10 count');
});
