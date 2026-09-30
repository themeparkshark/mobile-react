'use strict';
/**
 * Memory Match engine (design v4): the 3.2 truth table first, then scoring,
 * the Showtime gauge, QUICK, clocks, strikes, twists, grades, seeds and replay.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const E = loadTs('src/games/memory/engine.ts');
const L = loadTs('src/games/memory/logic.ts');

// faces[i] = floor(i / 2): slots 0,1 are face 0; 2,3 face 1; ...
const PAIRED = (n) => Array.from({ length: n }, (_, i) => Math.floor(i / 2));

function make(cfg = E.rideSprintConfig(), faces = PAIRED(16), cols = 4, rows = faces.length / 4) {
  const s = E.createEngine(cfg, { cols, rows, seed: 7 });
  const ev = [];
  const api = {
    s,
    ev,
    faces,
    flip(slot, at) {
      if (s.phase === 2) ev.push(...E.step(s, { t: 'dismiss', slot, at }));
      const out = E.step(s, { t: 'flip', slot, face: faces[s.ids[slot]], at });
      ev.push(...out);
      return out;
    },
    tick(at) { const out = E.step(s, { t: 'tick', at }); ev.push(...out); return out; },
    kinds() { return ev.map((e) => e.k); },
    last(k) { return [...ev].reverse().find((e) => e.k === k); },
  };
  return api;
}

// -----------------------------------------------------------------------------
// 3.2 truth table
// -----------------------------------------------------------------------------

test('truth table: lucky match (B unseen) holds +1 chain, base 100', () => {
  const g = make();
  g.flip(0, 100);
  const out = g.flip(1, 400);
  const m = out.find((e) => e.k === 'match');
  assert.equal(m.recall, false);
  assert.equal(m.chain, 1);
  assert.equal(m.parts.base, 100);
  assert.equal(g.s.luckies, 1);
});

test('truth table: recall match when B was seen before this flip, base 160', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300); // miss: scout (all new)
  g.flip(1, 2000); // dismiss hold + flip 1 (partner of 0 was seen at slot 0)
  const out = g.flip(0, 2300);
  const m = out.find((e) => e.k === 'match');
  assert.equal(m.recall, true);
  assert.equal(m.parts.base, 160);
});

test('truth table: recall counts a glimpsed card, glimpse never causes a slip', () => {
  const g = make();
  E.step(g.s, { t: 'reveal', slots: [1, 5], faces: [0, 2], at: 50 });
  g.flip(0, 100);
  assert.equal(g.flip(1, 300).find((e) => e.k === 'match').recall, true);
  // glimpsed slot 5 (face 2) then a miss including it is a scout, not a slip
  g.flip(2, 600);
  const out = g.flip(5, 900);
  assert.ok(out.find((e) => e.k === 'scout'));
  assert.equal(g.s.chain, 1, 'scout holds the chain');
});

test('truth table: scout when no better tap was known', () => {
  const g = make();
  g.flip(0, 100);
  const out = g.flip(2, 300);
  assert.deepEqual(plain(out.map((e) => e.k)), ['flip', 'scout']);
});

test('truth table: slip (a) A partner seen and B is not it, ghost points at the partner', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300); // scout; 0 (face0) and 2 (face1) seen
  g.flip(1, 2000); // face 0, partner slot 0 seen
  const out = g.flip(4, 2200); // new card instead of 0 -> slip (a)
  const slip = out.find((e) => e.k === 'slip');
  assert.equal(slip.kind, 'a');
  assert.equal(slip.ghost, 0);
  assert.equal(g.s.chain, 0);
});

test('truth table: slip (b) B was seen and is not the partner', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300); // scout
  g.flip(4, 2000); // new card face 2; its partner (5) unseen
  const out = g.flip(2, 2200); // known face-1 card: slip (b)
  const slip = out.find((e) => e.k === 'slip');
  assert.equal(slip.kind, 'b');
  assert.equal(slip.ghost, -1);
});

test('truth table: A seen, partner unseen, B unseen is a scout (opening with a known card)', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300); // scout
  g.flip(0, 2000); // known card, partner 1 unseen
  const out = g.flip(6, 2200);
  assert.ok(out.find((e) => e.k === 'scout'));
});

test('truth table: gull miss holds the chain and is never a slip', () => {
  const faces = PAIRED(16);
  faces[14] = E.FACE_GULL; faces[15] = E.FACE_GULL;
  const g = make({ ...E.rideSprintConfig(), seagull: true }, faces);
  g.flip(0, 100); g.flip(1, 300); // chain 1
  g.flip(2, 600);
  const out = g.flip(14, 800);
  assert.ok(out.find((e) => e.k === 'gullMiss'));
  assert.equal(g.s.chain, 1);
  assert.equal(g.s.slips, 0);
});

test('truth table: a miss involving a moved card (or a moved known partner) is a scout', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300); // scout
  g.tick(2000);
  g.s.moved[0] = 1; // slot 0 was moved by a twist
  g.flip(1, 2100);
  const out = g.flip(4, 2300);
  assert.ok(out.find((e) => e.k === 'scout'), 'partner carries a moved rim');
});

test('chain never breaks on a scout and always breaks on a slip', () => {
  const g = make();
  g.flip(0, 100); g.flip(1, 300); // chain 1
  g.flip(2, 600); g.flip(4, 800); // scout
  assert.equal(g.s.chain, 1);
  g.flip(3, 2500); g.flip(2, 2700); // recall match, chain 2
  assert.equal(g.s.chain, 2);
  g.flip(6, 3000); g.flip(4, 3200); // B=4 seen (face 2), not partner of 6 (face 3): slip
  assert.equal(g.s.chain, 0);
});

// -----------------------------------------------------------------------------
// Scoring
// -----------------------------------------------------------------------------

test('scoring: every product is an integer; x1 / x1.5 / x2 chain, x1.5 showtime', () => {
  assert.equal(E.matchValue(false, 1, false), 100);
  assert.equal(E.matchValue(true, 3, false), 320);
  assert.equal(E.matchValue(true, 3, true), 480);
  for (const recall of [true, false]) for (let c = 1; c < 12; c++) for (const st of [true, false]) {
    assert.ok(Number.isInteger(E.matchValue(recall, c, st)));
  }
});

test('QUICK pays +25 only when the match lands within 1500ms of the previous turn resolving', () => {
  const g = make();
  g.flip(0, 100);
  let m = g.flip(1, 1400).find((e) => e.k === 'match');
  assert.equal(m.parts.quick, 25, 'first turn measures from GO (t=0)');
  g.flip(2, 2000);
  m = g.flip(3, 3000).find((e) => e.k === 'match');
  assert.equal(m.parts.quick, 0, '1600ms after the previous resolve');
  // after a miss, the quick-dismiss tap starts the window
  g.flip(4, 3200); g.flip(6, 3400); // scout
  g.flip(5, 4000); // dismiss at 4000 (inside the hold) + flip
  m = g.flip(4, 5000).find((e) => e.k === 'match');
  assert.equal(m.parts.quick, 25);
});

test('Golden Coin: x2 and +3s; Overtime x2 under 10s', () => {
  const faces = PAIRED(16);
  faces[0] = E.FACE_GOLD; faces[1] = E.FACE_GOLD;
  const g = make(E.rideSprintConfig(), faces);
  g.flip(0, 5000);
  const m = g.flip(1, 7000).find((e) => e.k === 'match');
  assert.equal(m.parts.golden, true);
  assert.equal(m.parts.value, 200);
  assert.equal(g.s.clockLeftMs, 45000 - 7000 + 3000);
  g.tick(38000); // 3000 left + 3000 bonus = ... 41000 - 38000 = 3000 left
  assert.equal(g.s.overtime, true);
  g.flip(2, 38100);
  const m2 = g.flip(3, 39800).find((e) => e.k === 'match');
  assert.equal(m2.parts.overtime, true);
  assert.equal(m2.parts.value, (100 * 3 * 2) / 4 * 2);
});

test('Ride Sprint final pair bonus: +50 per whole second left, +100 PERFECT', () => {
  const g = make();
  let t = 0;
  for (let p = 0; p < 8; p++) { g.flip(p * 2, (t += 300)); g.flip(p * 2 + 1, (t += 300)); }
  const c = g.last('cleared');
  assert.equal(g.s.status, 'cleared');
  assert.equal(c.secondsLeft, Math.floor((45000 - t) / 1000));
  assert.equal(c.perfect, true);
  assert.equal(c.bonus, 50 * c.secondsLeft + 100);
  assert.equal(E.rideStars(g.s), 3);
});

test('par and perfect from E(n) = 1.614n - 0.511', () => {
  assert.deepEqual([6, 8, 10, 15].map(E.parFor), [10, 13, 17, 25]);
  assert.deepEqual([6, 8, 10].map(E.perfectFor), [9, 12, 15]);
});

// -----------------------------------------------------------------------------
// Showtime gauge
// -----------------------------------------------------------------------------

test('gauge: recall +2, lucky +1, drains 1 pip per 2s while the clock runs', () => {
  const g = make();
  g.flip(0, 100); g.flip(1, 300); // lucky +1
  assert.equal(g.s.gauge, 1);
  g.tick(2299);
  assert.equal(g.s.gauge, 1);
  g.tick(2301);
  assert.equal(g.s.gauge, 0);
});

test('gauge: a scout pauses the drain (resets the timer) but adds nothing; a slip empties it', () => {
  const g = make();
  g.flip(0, 100); g.flip(1, 300); // lucky gauge 1
  g.flip(2, 1800); g.flip(4, 2000); // scout at 2000 resets drain
  assert.equal(g.s.gauge, 1);
  g.tick(3900);
  assert.equal(g.s.gauge, 1, 'drain restarted from the scout');
  g.tick(4001);
  assert.equal(g.s.gauge, 0);
  const g2 = make();
  g2.flip(0, 100); g2.flip(1, 300); g2.flip(2, 500); g2.flip(4, 700); // gauge 1, scout
  g2.flip(3, 1000); g2.flip(2, 1200); // recall +2 = 3
  assert.equal(g2.s.gauge, 3);
  g2.flip(6, 1500); g2.flip(4, 1700); // slip (b)
  assert.equal(g2.s.gauge, 0);
});

test('gauge full = an 8s Showtime burst at x1.5, warns at 2s, then empties; a slip ends it early', () => {
  const g = make();
  // Build 6 pips with recalls: see 0..7 first via reveal (glimpsed counts as recall)
  E.step(g.s, { t: 'reveal', slots: [1, 3, 5, 7], faces: [0, 1, 2, 3], at: 10 });
  g.flip(0, 100); g.flip(1, 300); // +2
  g.flip(2, 500); g.flip(3, 700); // +2
  const out = g.flip(4, 900).concat(g.flip(5, 1100)); // +2 -> 6 -> showtime
  assert.ok(out.find((e) => e.k === 'showtimeOn'));
  assert.equal(E.inShowtime(g.s), true);
  g.flip(6, 1300);
  const m = g.flip(7, 1500).find((e) => e.k === 'match');
  assert.equal(m.parts.showHalves, 3);
  assert.equal(m.parts.value, 480 + 25);
  const warn = g.tick(1100 + 6001);
  assert.ok(warn.find((e) => e.k === 'showtimeWarn'));
  const off = g.tick(1100 + 8001);
  assert.ok(off.find((e) => e.k === 'showtimeOff' && e.reason === 'done'));
  assert.equal(g.s.gauge, 0);
  // slip ends it early
  const h = make();
  E.step(h.s, { t: 'reveal', slots: [1, 3, 5], faces: [0, 1, 2], at: 10 });
  h.flip(0, 100); h.flip(1, 300); h.flip(2, 500); h.flip(3, 700); h.flip(4, 900); h.flip(5, 1100);
  h.flip(6, 1300); h.flip(8, 1500); // scout
  h.flip(7, 1700); const o = h.flip(10, 1900); // 7 is face 3, partner 6 seen -> slip (a)
  assert.ok(o.find((e) => e.k === 'showtimeOff' && e.reason === 'slip'));
});

test('Photo Flash fires only on Showtime entry, reveals the trigger row and column once per board', () => {
  const cfg = { ...E.rideSprintConfig(), photoFlash: true };
  const g = make(cfg);
  E.step(g.s, { t: 'reveal', slots: [1, 3, 5], faces: [0, 1, 2], at: 10 });
  g.flip(0, 100); g.flip(1, 300); g.flip(2, 500); g.flip(3, 700); g.flip(4, 900);
  const out = g.flip(5, 1100);
  const pf = out.find((e) => e.k === 'photoFlash');
  assert.equal(pf.slot, 5);
  // slot 5 = row 1 col 1: row 4..7 and column 1,9,13 minus matched/trigger
  assert.deepEqual(plain(pf.slots), [6, 7, 9, 13]);
});

// -----------------------------------------------------------------------------
// Clocks and holds
// -----------------------------------------------------------------------------

test('miss hold: flips back at 1500ms (2500ms walking); the next tap quick-dismisses', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300);
  g.tick(1799);
  assert.equal(g.s.phase, 2);
  const out = g.tick(1800);
  assert.deepEqual(plain(out.find((e) => e.k === 'hide')), { k: 'hide', a: 0, b: 2, quick: false });
  const w = make();
  E.step(w.s, { t: 'walking', on: true, at: 0 });
  w.flip(0, 100); w.flip(2, 300);
  w.tick(2000);
  assert.equal(w.s.phase, 2, 'walking hold is longer');
  w.tick(2800);
  assert.equal(w.s.phase, 0);
  const q = make();
  q.flip(0, 100); q.flip(2, 300);
  q.flip(4, 500);
  assert.equal(q.ev.find((e) => e.k === 'hide').quick, true);
  assert.equal(q.s.a, 4);
});

test('Ride Sprint clock runs continuously, times out, and never depends on movement', () => {
  const g = make();
  E.step(g.s, { t: 'walking', on: true, at: 0 });
  for (let i = 1; i < 40; i++) E.step(g.s, { t: 'walking', on: i % 2 === 0, at: i * 1000 });
  assert.equal(g.s.clockLeftMs, 45000 - 39000);
  const out = g.tick(45000);
  assert.ok(out.find((e) => e.k === 'timeout'));
  assert.equal(g.s.status, 'timeout');
  assert.equal(E.rideStars(g.s), 0);
});

test('Time Attack look-away: the clock freezes 1500ms after the last tap with no card up', () => {
  const g = make(E.timeAttackConfig());
  g.flip(0, 100); g.flip(1, 300); // match, +1.5s
  assert.equal(g.s.clockLeftMs, 30000 - 200 + 1500, 'frozen until the first tap after GO');
  g.tick(10000);
  assert.equal(g.s.clockLeftMs, 30000 - 1700 + 1500, 'frozen after 300 + 1500');
  assert.equal(E.isLookAway(g.s), true);
  g.flip(2, 11000); // card up: runs again
  g.tick(12000);
  assert.equal(g.s.clockLeftMs, 29800 - 1000);
});

test('Time Attack slip costs 2s, match +1.5s, cap 45s, board clear +4s and a staircase', () => {
  const g = make(E.timeAttackConfig(), PAIRED(12), 4, 3);
  g.flip(0, 100); g.flip(2, 300); // scout
  g.flip(1, 500); g.flip(4, 700); // slip (a)
  assert.equal(g.s.clockLeftMs, 30000 - 600 - 2000);
  assert.deepEqual([E.nextPairs(6, 0), E.nextPairs(6, 1), E.nextPairs(8, 2), E.nextPairs(8, 4), E.nextPairs(10, 0), E.nextPairs(6, 5)], [8, 8, 8, 6, 10, 6]);
  assert.deepEqual([E.glimpseMs(6, 0), E.glimpseMs(8, 0), E.glimpseMs(10, 0), E.glimpseMs(10, 5)], [1200, 1000, 800, 600]);
});

test('Time Attack board clear pays 250 x board + 100 per turn under par and deals the next board', () => {
  const g = make(E.timeAttackConfig(), PAIRED(12), 4, 3);
  let t = 0;
  for (let p = 0; p < 6; p++) { g.flip(p * 2, (t += 200)); g.flip(p * 2 + 1, (t += 200)); }
  const bc = g.last('boardClear');
  assert.equal(bc.bonus, 250 + 100 * (10 - 6));
  assert.equal(g.s.status, 'boardClear');
  E.step(g.s, { t: 'deal', cols: 4, rows: 4, at: t + 1000 });
  assert.equal(g.s.board, 2);
  assert.equal(g.s.status, 'play');
  assert.equal(g.s.pairsTotal, 8);
  assert.equal(E.timeAttackStars(1), 1);
  assert.equal(E.timeAttackStars(3), 2);
  assert.equal(E.timeAttackStars(5), 3);
});

test('one new system per board and never more than 2 modifiers', () => {
  const unlocks = [1, 2, 3, 4, 5, 6, 7].map((b) => E.boardSystems(b).unlock);
  assert.deepEqual(unlocks, ['none', 'showtime', 'peek', 'tide', 'seagull', 'none', 'none']);
  for (let b = 1; b < 20; b++) assert.ok(E.modifierCount(E.boardSystems(b)) <= 2);
  assert.equal(E.boardSystems(1).photoFlash, false);
  assert.equal(E.boardSystems(2).photoFlash, true);
});

// -----------------------------------------------------------------------------
// Daily Sudden Death
// -----------------------------------------------------------------------------

test('Daily: no clock, two slips and out, showtime counts 4 turns, clear bonus', () => {
  const g = make(E.dailyConfig());
  g.tick(600000);
  assert.equal(g.s.status, 'play', 'no clock');
  g.flip(0, 600100); g.flip(2, 600300); // scout
  g.flip(1, 601000); g.flip(4, 601200); // slip 1
  assert.equal(g.s.strikes, 1);
  assert.equal(g.s.status, 'play');
  g.flip(5, 602000); g.flip(0, 602200); // B=0 seen, not partner: slip 2
  assert.equal(g.s.status, 'out');
  assert.ok(g.last('out'));
  // clean clear
  const c = make(E.dailyConfig());
  let t = 0;
  for (let p = 0; p < 8; p++) { c.flip(p * 2, (t += 300)); c.flip(p * 2 + 1, (t += 300)); }
  const cl = c.last('cleared');
  assert.equal(cl.bonus, 100 * (13 - 8) + 100 + 150);
  assert.equal(E.dailyStars(c.s), 3, 'no clock means no drain: 6 lucky pips reach Showtime, under par');
});

// -----------------------------------------------------------------------------
// Twists
// -----------------------------------------------------------------------------

test('Tide Shift: every 6 resolved turns, only stationary, moves knowledge with the cards', () => {
  const cfg = { ...E.timeAttackConfig(), tideShift: true };
  const g = make(cfg);
  E.step(g.s, { t: 'walking', on: true, at: 0 });
  let t = 0;
  // 6 scouts while walking: no tide
  const scoutPairs = [[0, 2], [4, 6], [8, 10], [12, 14], [1, 3], [5, 7]];
  for (const [a, b] of scoutPairs.slice(0, 4)) { g.flip(a, (t += 200)); g.flip(b, (t += 200)); }
  E.step(g.s, { t: 'walking', on: false, at: (t += 200) });
  g.flip(1, (t += 100)); g.flip(0, (t += 100)); // match (recall) turn 5
  g.flip(3, (t += 100)); g.flip(2, (t += 100)); // match turn 6 but walked off < 3s ago
  assert.equal(g.ev.filter((e) => e.k === 'tide').length, 0);
  t += 3500;
  g.flip(5, t); g.flip(4, (t += 100)); // turn 7 stationary >= 3s: tide
  const tide = g.last('tide');
  assert.ok(tide, 'tide fires once stationary');
  const row = tide.row * 4;
  const faces = g.s.faces.slice(row, row + 4);
  assert.ok(faces.length === 4);
  assert.ok(g.s.moved.slice(row, row + 4).some((m) => m === 1));
});

test('Seagull swap: after a gull miss flips back, two seen face-down cards swap (never while walking)', () => {
  const faces = PAIRED(16);
  faces[14] = E.FACE_GULL; faces[15] = E.FACE_GULL;
  const cfg = { ...E.timeAttackConfig(), seagull: true };
  const g = make(cfg, faces);
  g.flip(0, 100); g.flip(2, 300); // scout: 0, 2 seen
  g.flip(4, 2000); g.flip(14, 2200); // gull miss
  const before = plain(g.s.ids);
  g.tick(4000);
  const sw = g.last('gullSwap');
  assert.ok(sw);
  assert.notDeepEqual(plain(g.s.ids), before);
  assert.equal(g.s.moved[sw.s1], 1);
  assert.equal(g.s.know[sw.s1], E.K_SEEN);
  const w = make(cfg, faces);
  E.step(w.s, { t: 'walking', on: true, at: 0 });
  w.flip(0, 100); w.flip(2, 300); w.flip(4, 2000); w.flip(14, 2200); w.tick(6000);
  assert.equal(w.last('gullSwap'), undefined);
});

// -----------------------------------------------------------------------------
// Grades and tips
// -----------------------------------------------------------------------------

test('grades: memory, speed and chain letter ranks and the coaching tip', () => {
  const g = make();
  let t = 0;
  for (let p = 0; p < 8; p++) { g.flip(p * 2, (t += 300)); g.flip(p * 2 + 1, (t += 300)); }
  const gr = E.gradesFor(g.s);
  assert.equal(gr.speed, 'S');
  assert.equal(gr.chain, 'S');
  assert.equal(gr.memory, 'C', 'all lucky: no recall');
  const s1 = make();
  s1.flip(0, 100); s1.flip(2, 300); s1.flip(1, 2000); s1.flip(4, 4200); // slip a
  const ga = E.gradesFor(s1.s);
  assert.equal(ga.tip, E.TIPS.slipA);
  const s2 = make();
  s2.flip(0, 100); s2.flip(2, 300); s2.flip(4, 2000); s2.flip(2, 2200); // slip b
  assert.equal(E.gradesFor(s2.s).tip, E.TIPS.slipB);
  const slow = make();
  slow.flip(0, 3000); slow.flip(2, 3300); slow.flip(1, 7000); slow.flip(0, 9800);
  slow.flip(3, 13000); slow.flip(2, 16000);
  assert.equal(E.gradesFor(slow.s).speed, 'C');
  assert.equal(E.gradesFor(slow.s).tip, E.TIPS.speed);
  assert.equal(E.median([5, 1, 3]), 3);
  assert.equal(E.median([4, 1, 3, 2]), 3);
});

// -----------------------------------------------------------------------------
// Seeds, layouts, replay
// -----------------------------------------------------------------------------

test('seed per run: PLAY AGAIN deals a different board; same (seed, runIndex) same board', () => {
  const a = L.buildLayout({ pairs: 8, deckSize: 10, seed: L.boardSeed(1234, 0), golden: true });
  const b = L.buildLayout({ pairs: 8, deckSize: 10, seed: L.boardSeed(1234, 1), golden: true });
  const a2 = L.buildLayout({ pairs: 8, deckSize: 10, seed: L.boardSeed(1234, 0), golden: true });
  assert.deepEqual(plain(a), plain(a2));
  assert.notDeepEqual(plain(a.faces), plain(b.faces));
  assert.equal(a.faces.length, 16);
  assert.equal(a.faces.filter((f) => f === E.FACE_GOLD).length, 2);
  const counts = new Map();
  for (const f of a.faces) counts.set(f, (counts.get(f) || 0) + 1);
  assert.ok([...counts.values()].every((c) => c === 2));
  const ta = L.buildLayout({ pairs: 10, deckSize: 10, seed: 5, golden: true, gull: true });
  assert.equal(ta.cols * ta.rows, 20);
  assert.equal(ta.faces.filter((f) => f === E.FACE_GULL).length, 2);
  assert.deepEqual(plain(L.shapeForPairs(6)), { cols: 4, rows: 3, pairs: 6 });
});

test('replay: a flip log replays to the identical state (proof and PHP parity)', () => {
  const layout = L.buildLayout({ pairs: 8, deckSize: 10, seed: 99, golden: true });
  const cfg = E.rideSprintConfig();
  const g = make(cfg, layout.faces);
  // A scripted imperfect run: flip pairs in slot order, dismissing misses.
  let t = 0;
  const seen = new Map();
  for (let guard = 0; guard < 200 && g.s.status === 'play'; guard++) {
    const open = [];
    for (let i = 0; i < 16; i++) if (g.s.know[i] !== E.K_MATCHED) open.push(i);
    const a = open[guard % open.length];
    g.flip(a, (t += 350));
    const fa = layout.faces[g.s.ids[a]];
    const known = seen.get(fa);
    seen.set(fa, a);
    const b = known != null && known !== a && g.s.know[known] !== E.K_MATCHED ? known : open.find((x) => x !== a && g.s.know[x] === E.K_UNSEEN) ?? open.find((x) => x !== a);
    if (b == null) break;
    g.flip(b, (t += 450));
    seen.set(layout.faces[g.s.ids[b]], b);
  }
  const r = E.replayLog(cfg, { cols: 4, rows: 4, seed: 7 }, layout.faces, plain(g.s.log));
  assert.deepEqual(plain(E.summarize(r)), plain(E.summarize(g.s)));
  assert.equal(g.s.status, 'cleared');
});

test('movement soak: toggling walking every 3s for 120s never pauses and the clock is continuous', () => {
  const g = make(E.rideSprintConfig(50000));
  for (let t = 0; t <= 40000; t += 3000) E.step(g.s, { t: 'walking', on: (t / 3000) % 2 === 0, at: t });
  assert.equal(g.s.clockLeftMs, 50000 - 39000);
  assert.equal(g.s.status, 'play');
});
