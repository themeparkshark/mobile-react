'use strict';
/**
 * Memory Match engine (design v8, mm-6): the 3.2 truth table first (four match
 * grades), then scoring, the turn-based gauge and Showtime pot, Photo Flash,
 * QUICK, the one miss-hold rule, clocks (line bleed, pending, charged, Signal
 * Mode), strikes, twists, grades, seeds and replay.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const E = loadTs('src/games/memory/engine.ts');
const L = loadTs('src/games/memory/logic.ts');

// faces[i] = floor(i / 2): slots 0,1 are face 0; 2,3 face 1; ...
const PAIRED = (n) => Array.from({ length: n }, (_, i) => Math.floor(i / 2));

/** Time Attack with every system on (for gauge, Showtime, QUICK tests). */
function taAll(extra = {}) {
  return { ...E.timeAttackConfig(), gauge: true, photoFlash: true, quickBonus: 25, ...extra };
}

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
    act(a) { const out = E.step(s, a); ev.push(...out); return out; },
    tick(at) { const out = E.step(s, { t: 'tick', at }); ev.push(...out); return out; },
    kinds() { return ev.map((e) => e.k); },
    last(k) { return [...ev].reverse().find((e) => e.k === k); },
  };
  return api;
}

test('engine version is mm-6', () => {
  assert.equal(E.ENGINE_VERSION, 'mm-6');
});

// -----------------------------------------------------------------------------
// 3.2 truth table
// -----------------------------------------------------------------------------

test('truth table: lucky match (B unseen) pays 60 and HOLDS the chain', () => {
  const g = make();
  g.flip(0, 100);
  const m = g.flip(1, 400).find((e) => e.k === 'match');
  assert.equal(m.grade, 'lucky');
  assert.equal(m.recall, false);
  assert.equal(m.chain, 0, 'lucky never grows the chain');
  assert.equal(m.parts.base, 60);
  assert.equal(m.parts.value, 60);
  assert.equal(g.s.luckies, 1);
  assert.deepEqual(plain(g.s.verdicts), [E.V_LUCKY]);
});

test('truth table: recall match when B was seen before this flip: 160, chain +1', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300); // scout
  g.flip(1, 2000); // dismiss + flip 1
  const m = g.flip(0, 2300).find((e) => e.k === 'match');
  assert.equal(m.grade, 'recall');
  assert.equal(m.parts.base, 160);
  assert.equal(m.chain, 1);
  assert.equal(m.seenSlot, 0);
});

test('truth table: glimpse match (B glimpsed, not seen) pays 120 and holds the chain; glimpse never slips', () => {
  const g = make();
  g.act({ t: 'reveal', slots: [1, 5], faces: [0, 2], at: 50 });
  g.flip(0, 100);
  const m = g.flip(1, 300).find((e) => e.k === 'match');
  assert.equal(m.grade, 'glimpse');
  assert.equal(m.parts.base, 120);
  assert.equal(g.s.chain, 0, 'glimpse holds');
  assert.equal(g.s.glimpses, 1);
  // glimpsed slot 5 (face 2): a miss with it as B is a scout, not a slip
  g.flip(2, 600);
  const out = g.flip(5, 900);
  assert.ok(out.find((e) => e.k === 'scout'));
  // its glimpsed partner never makes the first card a slip (a) either
  const h = make();
  h.act({ t: 'reveal', slots: [1], faces: [0], at: 10 });
  h.flip(0, 100);
  assert.ok(h.flip(4, 300).find((e) => e.k === 'scout'), 'A partner glimpsed only: scout');
});

test('truth table: scout when no better tap was known', () => {
  const g = make();
  g.flip(0, 100);
  const out = g.flip(2, 300);
  assert.deepEqual(plain(out.map((e) => e.k)), ['flip', 'scout']);
});

test('truth table: slip (a) A partner seen and B is not it, ghost points at the partner', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300);
  g.flip(1, 2000);
  const slip = g.flip(4, 2200).find((e) => e.k === 'slip');
  assert.equal(slip.kind, 'a');
  assert.equal(slip.ghost, 0);
  assert.equal(g.s.chain, 0);
});

test('truth table: slip (b) B was seen and is not the partner', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300);
  g.flip(4, 2000);
  const slip = g.flip(2, 2200).find((e) => e.k === 'slip');
  assert.equal(slip.kind, 'b');
  assert.equal(slip.ghost, -1);
});

test('truth table: A seen, partner unseen, B unseen is a scout (opening with a known card)', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300);
  g.flip(0, 2000);
  assert.ok(g.flip(6, 2200).find((e) => e.k === 'scout'));
});

test('truth table: gull miss holds the chain, is never a slip and never counts as a scout', () => {
  const faces = PAIRED(16);
  faces[14] = E.FACE_GULL; faces[15] = E.FACE_GULL;
  const g = make({ ...E.rideSprintConfig(), seagull: true }, faces);
  g.flip(0, 100); g.flip(2, 300); g.flip(1, 600); g.flip(0, 800); // recall chain 1
  g.flip(4, 1000);
  const out = g.flip(14, 1200);
  assert.ok(out.find((e) => e.k === 'gullMiss'));
  assert.equal(g.s.chain, 1);
  assert.equal(g.s.slips, 0);
  assert.equal(g.s.scouts, 1, 'only the earlier scout');
  assert.equal(g.s.verdicts[g.s.verdicts.length - 1], E.V_GULL);
});

test('truth table: gull miss takes precedence over a slip', () => {
  const faces = PAIRED(16);
  faces[14] = E.FACE_GULL; faces[15] = E.FACE_GULL;
  const g = make({ ...E.rideSprintConfig(), seagull: true }, faces);
  g.flip(0, 100); g.flip(2, 300); // 0 and 2 seen
  g.flip(1, 2000); // partner 0 seen
  assert.ok(g.flip(14, 2200).find((e) => e.k === 'gullMiss'), 'gull beats slip (a)');
});

test('truth table: a miss involving a moved card (or a moved known partner) is a scout', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300);
  g.tick(2000);
  g.s.moved[0] = 1;
  g.flip(1, 2100);
  assert.ok(g.flip(4, 2300).find((e) => e.k === 'scout'));
});

test('chain grows only on recall, never breaks on a scout, always breaks on a slip', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300); // scout
  g.flip(1, 600); g.flip(0, 800); // recall 1
  g.flip(4, 1000); g.flip(5, 1200); // lucky: holds at 1
  assert.equal(g.s.chain, 1);
  g.flip(6, 1400); g.flip(8, 1600); // scout
  assert.equal(g.s.chain, 1);
  g.flip(3, 3200); g.flip(2, 3400); // recall 2
  assert.equal(g.s.chain, 2);
  g.flip(10, 3600); g.flip(6, 3800); // B=6 seen (face 3), not partner of 10 (face 5): slip
  assert.equal(g.s.chain, 0);
});

// -----------------------------------------------------------------------------
// Scoring
// -----------------------------------------------------------------------------

test('scoring: bases 60 / 120 / 160; every product is an integer; recall chain 3 in Showtime = 480', () => {
  assert.equal(E.matchValue('lucky', 0, false), 60);
  assert.equal(E.matchValue('glimpse', 0, false), 120);
  assert.equal(E.matchValue('recall', 1, false), 160);
  assert.equal(E.matchValue('recall', 2, false), 240);
  assert.equal(E.matchValue('recall', 3, false), 320);
  assert.equal(E.matchValue('recall', 3, true), 480);
  assert.equal(E.matchValue('lucky', 3, true), 180, 'lucky uses the current chain without growing it');
  for (const gr of ['recall', 'glimpse', 'lucky']) for (let c = 0; c < 12; c++) for (const st of [true, false]) {
    assert.ok(Number.isInteger(E.matchValue(gr, c, st)));
  }
});

test('tierUp marks chain 2 and chain 3 (success haptic, SWEET RUN)', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300); g.flip(4, 500); g.flip(6, 700); // 2 scouts
  g.flip(1, 2400); const m1 = g.flip(0, 2600).find((e) => e.k === 'match');
  g.flip(3, 2800); const m2 = g.flip(2, 3000).find((e) => e.k === 'match');
  g.flip(5, 3200); const m3 = g.flip(4, 3400).find((e) => e.k === 'match');
  g.flip(7, 3600); const m4 = g.flip(6, 3800).find((e) => e.k === 'match');
  assert.deepEqual([m1.tierUp, m2.tierUp, m3.tierUp, m4.tierUp], [0, 2, 3, 0]);
});

test('QUICK pays +25 only when unlocked and the match lands within 1500ms of the previous turn resolving', () => {
  const g = make(taAll());
  g.flip(0, 100);
  let m = g.flip(1, 1400).find((e) => e.k === 'match');
  assert.equal(m.parts.quick, 25);
  g.flip(2, 2000);
  m = g.flip(3, 3000).find((e) => e.k === 'match');
  assert.equal(m.parts.quick, 0, '1600ms after the previous resolve');
  const off = make();
  off.flip(0, 100);
  assert.equal(off.flip(1, 300).find((e) => e.k === 'match').parts.quick, 0, 'Ride Sprint: QUICK off');
});

test('Golden Coin: x2, +3s, +1 gauge pip; Time Attack overtime x2, Ride Sprint overtime is look and sound only', () => {
  const faces = PAIRED(12);
  faces[0] = E.FACE_GOLD; faces[1] = E.FACE_GOLD;
  const g = make(taAll(), faces, 4, 3);
  g.flip(0, 100);
  const m = g.flip(1, 300).find((e) => e.k === 'match');
  assert.equal(m.parts.golden, true);
  assert.equal(m.parts.value, 120 + 25, 'lucky 60 x2 + QUICK');
  assert.equal(g.s.gauge, 1, 'lucky 0 + golden 1');
  assert.equal(g.s.clockLeftMs, 30000 - 300 + 3000 + 1500);
  g.tick(34300 - 9000); // 9s left: overtime
  assert.equal(g.s.overtime, true);
  g.flip(2, 25400);
  const m2 = g.flip(3, 25600).find((e) => e.k === 'match');
  assert.equal(m2.parts.overtime, true);
  assert.equal(m2.parts.value, 60 * 2, "x2 overtime, no QUICK (slow turn)");
  const r = make();
  r.tick(36000);
  assert.equal(r.s.overtime, true);
  r.flip(0, 36100);
  const rm = r.flip(1, 36300).find((e) => e.k === 'match');
  assert.equal(rm.parts.overtime, false);
  assert.equal(rm.parts.value, 60);
});

test('Ride Sprint final pair bonus: +50 per whole second left, +100 PERFECT; stars and edition', () => {
  const g = make();
  let t = 0;
  // Perfect-play script on a known layout: scout 2 new, then cash both.
  for (let p = 0; p < 8; p++) { g.flip(p * 2, (t += 300)); g.flip(p * 2 + 1, (t += 300)); }
  const c = g.last('cleared');
  assert.equal(g.s.status, 'cleared');
  assert.equal(c.secondsLeft, Math.floor((45000 - t) / 1000));
  assert.equal(c.perfect, true);
  assert.equal(c.bonus, 50 * c.secondsLeft + 100);
  assert.equal(E.rideStars(g.s), 3);
  assert.equal(E.editionForStars(3), 'gold');
  assert.equal(E.luckyChip(g.s), 'This board: 8 lucky pairs');
});

test('par and PERFECT: random layouts 1.614n, Fair Deck ceil(n/2)+n', () => {
  assert.deepEqual([6, 8, 10, 15].map(E.parFor), [10, 13, 17, 25]);
  assert.deepEqual([6, 8, 10].map(E.perfectFor), [9, 12, 15]);
  assert.deepEqual([4, 6, 8, 10].map(E.fairPerfectFor), [6, 9, 12, 15]);
  assert.equal(E.fairParFor(8), 14);
});

// -----------------------------------------------------------------------------
// Showtime gauge (turn-based) and the pot
// -----------------------------------------------------------------------------

test('gauge: recall +2, glimpse +1, lucky +0; no time drain at all', () => {
  const g = make(taAll());
  g.flip(0, 100); g.flip(1, 300); // lucky +0
  assert.equal(g.s.gauge, 0);
  g.act({ t: 'reveal', slots: [3], faces: [1], at: 400 });
  g.flip(2, 500); g.flip(3, 700); // glimpse +1
  assert.equal(g.s.gauge, 1);
  g.flip(4, 900); g.flip(6, 1100); // scout (first in a row: free)
  g.flip(5, 2700); g.flip(4, 2900); // recall +2
  assert.equal(g.s.gauge, 3);
  g.tick(20000);
  assert.equal(g.s.gauge, 3, 'thinking never costs pips');
});

test('gauge: the first scout in a row is free, each further consecutive scout drains 1; any match resets the run; a slip empties it', () => {
  const g = make(taAll());
  g.flip(0, 100); g.flip(2, 300); // scout run 1 (gauge 0 anyway)
  g.flip(1, 2000); g.flip(0, 2200); // recall +2, run resets
  assert.equal(g.s.gauge, 2);
  g.flip(4, 2400); g.flip(6, 2600); // scout 1: free
  assert.equal(g.s.gauge, 2);
  const out = g.flip(8, 4300).concat(g.flip(10, 4500)); // scout 2: -1
  assert.ok(out.find((e) => e.k === 'gauge' && e.delta === -1));
  assert.equal(g.s.gauge, 1);
  g.flip(12, 6200); g.flip(14, 6400); // scout 3: -1
  assert.equal(g.s.gauge, 0);
  const h = make(taAll());
  h.flip(0, 100); h.flip(2, 300); h.flip(1, 2000); h.flip(0, 2200); // gauge 2
  h.flip(4, 2400); h.flip(2, 2600); // B=2 seen (face 1), not partner of 4: slip (b)
  assert.equal(h.s.gauge, 0);
});

/** Build a Showtime: 3 recall matches on glimpsed-then-seen cards. */
function toShowtime(g) {
  // See 1,3,5 first by scouting them in pairs: (1,3) then (5,7) -> scouts.
  g.flip(1, 100); g.flip(3, 300); // scout (run 1)
  g.flip(0, 2000); g.flip(1, 2200); // recall, gauge 2
  g.flip(2, 2400); g.flip(3, 2600); // recall, gauge 4
  g.flip(5, 2800); g.flip(7, 3000); // scout (run 1, free)
  g.flip(4, 4700); return g.flip(5, 4900); // recall, gauge 6 -> Showtime
}

test('Showtime: full gauge starts a 5-turn burst at x1.5; matches stack in the pot and pay in one tally when it ends', () => {
  const g = make(taAll({ quickBonus: 0 }));
  const on = toShowtime(g);
  assert.ok(on.find((e) => e.k === 'showtimeOn'));
  assert.equal(E.inShowtime(g.s), true);
  assert.equal(g.s.showTurnsLeft, 5);
  const before = g.s.score;
  // Turn 1: recall at chain 4 in Showtime -> 160 x2 x1.5 = 480, into the pot.
  g.flip(6, 5100);
  const m = g.flip(7, 5300).find((e) => e.k === 'match');
  assert.equal(m.pot, true);
  assert.equal(m.parts.showHalves, 3);
  assert.equal(m.parts.value, 480);
  assert.equal(g.s.score, before, 'pot holds it');
  assert.equal(g.s.pot, 480);
  assert.equal(g.s.showTurnsLeft, 4);
  // Turns 2-4: scouts (no drain during Showtime).
  g.flip(8, 5500); g.flip(10, 5700);
  g.flip(12, 7400); const w = g.flip(14, 7600);
  assert.ok(w.find((e) => e.k === 'showtimeTurn' && e.left === 2));
  g.flip(9, 9300); const warn = g.flip(8, 9500); // recall (8 seen), turn 4 -> left 1 + warn
  assert.ok(warn.find((e) => e.k === 'showtimeWarn'));
  assert.equal(g.s.pot, 480 + 480);
  // Turn 5 ends it: pot pays in full.
  g.flip(11, 9700); const end = g.flip(10, 9900);
  const pay = end.find((e) => e.k === 'potPay');
  assert.ok(pay);
  assert.equal(pay.value, 480 * 3);
  assert.deepEqual(plain(pay.pairs), [6, 7, 9, 8, 11, 10]);
  assert.ok(end.find((e) => e.k === 'showtimeOff' && e.reason === 'done'));
  assert.equal(g.s.score, before + 480 * 3);
  assert.equal(g.s.gauge, 0);
  assert.equal(E.inShowtime(g.s), false);
});

test('Showtime: a slip ends it early and the pot still pays in full', () => {
  const g = make(taAll({ quickBonus: 0 }));
  toShowtime(g);
  g.flip(6, 5100); g.flip(7, 5300); // pot 480
  const before = g.s.score;
  g.flip(8, 5500); g.flip(10, 5700); // scout
  g.flip(9, 7400); const out = g.flip(12, 7600); // 9 = face 4, partner 8 seen: slip (a)
  const pay = out.find((e) => e.k === 'potPay');
  assert.equal(pay.value, 480);
  assert.ok(out.find((e) => e.k === 'showtimeOff' && e.reason === 'slip'));
  assert.equal(g.s.score, before + 480);
});

test('Showtime: the board-clearing match in a burst pays the pot before the clear', () => {
  const faces = PAIRED(8);
  const g = make(taAll({ quickBonus: 0 }), faces, 4, 2);
  g.flip(1, 100); g.flip(3, 300);
  g.flip(0, 2000); g.flip(1, 2200);
  g.flip(2, 2400); g.flip(3, 2600);
  g.flip(5, 2800); g.flip(7, 3000);
  g.flip(4, 4700); const on = g.flip(5, 4900); // gauge 6 but... 3 pairs left of 4: showtime
  assert.ok(on.find((e) => e.k === 'showtimeOn'));
  g.flip(6, 5100); const fin = g.flip(7, 5300);
  const kinds = fin.map((e) => e.k);
  assert.ok(kinds.indexOf('potPay') >= 0 && kinds.indexOf('potPay') < kinds.indexOf('boardClear'));
});

test('Photo Flash: a row or column pick on Showtime entry, at most 3 cards nearest the well (Wide Flash 5)', () => {
  const g = make(taAll({ quickBonus: 0 }));
  const on = toShowtime(g);
  const pick = on.find((e) => e.k === 'photoPick');
  assert.equal(pick.slot, 5);
  // slot 5 = row 1 col 1. Row: 4,6,7 minus matched/seen (4 matched, 7 seen) -> 6. Column: 1,9,13 -> 1 matched -> 9,13.
  const col = g.act({ t: 'photoPick', axis: 'col', at: 5000 }).find((e) => e.k === 'photoFlash');
  assert.deepEqual(plain(col.slots), [9, 13]);
  assert.equal(col.axis, 'col');
  assert.equal(g.act({ t: 'photoPick', axis: 'row', at: 5001 }).length, 0, 'once per board');
  // the cap: a fresh 4x5 board, row pick from slot 0 on an untouched row
  const s = E.createEngine({ ...E.timeAttackConfig(), photoCap: 3 }, { cols: 4, rows: 5, seed: 1 });
  assert.deepEqual(plain(E.photoSlots(s, 8, 'col')), [4, 12, 0]);
  assert.deepEqual(plain(E.photoSlots(s, 8, 'col', 5)), [4, 12, 0, 16]);
  assert.deepEqual(plain(E.photoSlots(s, 9, 'row')), [8, 10, 11]);
});

// -----------------------------------------------------------------------------
// The one miss-hold rule
// -----------------------------------------------------------------------------

test('miss hold: auto flip-back at 1500ms walking or standing; the next tap quick-dismisses', () => {
  for (const walking of [false, true]) {
    const g = make();
    if (walking) g.act({ t: 'walking', on: true, at: 0 });
    g.flip(0, 100); g.flip(2, 300);
    g.tick(1799);
    assert.equal(g.s.phase, 2);
    const out = g.tick(1800);
    assert.deepEqual(plain(out.find((e) => e.k === 'hide')), { k: 'hide', a: 0, b: 2, quick: false });
  }
  const q = make();
  q.flip(0, 100); q.flip(2, 300);
  q.flip(4, 500);
  assert.equal(q.ev.find((e) => e.k === 'hide').quick, true);
  assert.equal(q.s.a, 4);
});

test('miss hold: touch and hold keeps the pair up to 2500ms after B landed; release after 1500 flips back at once', () => {
  const g = make();
  g.flip(0, 100); g.flip(2, 300);
  g.act({ t: 'hold', on: true, at: 900 });
  g.tick(2700);
  assert.equal(g.s.phase, 2, 'held past 1500');
  const out = g.tick(2800);
  assert.ok(out.find((e) => e.k === 'hide'), 'max 2500ms after B');
  const h = make();
  h.flip(0, 100); h.flip(2, 300);
  h.act({ t: 'hold', on: true, at: 900 });
  h.tick(2000);
  assert.equal(h.s.phase, 2);
  assert.ok(h.act({ t: 'hold', on: false, at: 2100 }).find((e) => e.k === 'hide'));
  const steady = make({ ...E.timeAttackConfig(), autoHoldMs: 2500 });
  steady.flip(0, 100); steady.flip(2, 300);
  steady.tick(2700);
  assert.equal(steady.s.phase, 2, 'Steady Hand charm');
});

// -----------------------------------------------------------------------------
// Clocks
// -----------------------------------------------------------------------------

test('Ride Sprint clock runs continuously, times out, and never depends on movement', () => {
  const g = make();
  for (let i = 0; i < 40; i++) {
    g.act({ t: 'walking', on: i % 2 === 0, at: i * 1000 });
    g.act({ t: 'lineMoving', on: i % 2 === 0, at: i * 1000 + 1 });
  }
  assert.equal(g.s.clockLeftMs, 45000 - 39001);
  const out = g.tick(45000);
  assert.ok(out.find((e) => e.k === 'timeout'));
  assert.equal(E.rideStars(g.s), 0);
});

test('Ride Sprint: the rope stops while a reveal is pending, and charged time reconciles the clock', () => {
  const g = make();
  g.tick(1000);
  g.act({ t: 'pending', on: true, at: 1000 });
  g.tick(4000);
  assert.equal(g.s.clockLeftMs, 44000, 'no drain while pending');
  g.act({ t: 'pending', on: false, at: 4000 });
  g.tick(5000);
  assert.equal(g.s.clockLeftMs, 43000);
  g.act({ t: 'charged', ms: 1500, at: 5000 });
  assert.equal(g.s.clockLeftMs, 43500, 'server charged 1500ms so far');
  const out = g.act({ t: 'charged', ms: 45000, at: 5100 });
  assert.ok(out.find((e) => e.k === 'timeout'));
});

test('Signal Mode: no clock, scored on turns; out of turns uncleared is a timeout; stars by turns', () => {
  const g = make(E.rideSprintConfig(45000, 24));
  assert.equal(g.s.cfg.clockMs, null);
  g.tick(600000);
  assert.equal(g.s.status, 'play');
  let t = 600000;
  for (let i = 0; i < 24 && g.s.status === 'play'; i++) { g.flip(0, (t += 2000)); g.flip(2, (t += 200)); }
  assert.equal(g.s.status, 'timeout');
  assert.equal(g.s.turns, 24);
  const c = make(E.rideSprintConfig(45000, 24));
  t = 0;
  for (let p = 0; p < 8; p++) { c.flip(p * 2, (t += 9000)); c.flip(p * 2 + 1, (t += 9000)); }
  assert.equal(c.s.status, 'cleared');
  assert.equal(E.rideStars(c.s), 3, 'turns only, never time');
});

test('Time Attack: the clock never freezes standing still; it bleeds at 0.5x only while the line moves and you are idle', () => {
  const g = make(E.timeAttackConfig());
  g.flip(0, 100); g.flip(1, 300); // match +1.5s
  g.tick(10300);
  assert.equal(g.s.clockLeftMs, 30000 - 10300 + 1500, 'standing still costs full time');
  g.act({ t: 'lineMoving', on: true, at: 10300 });
  assert.equal(E.isLineBleed(g.s), true, 'idle since 300');
  g.tick(12300);
  assert.equal(g.s.clockLeftMs, 21200 - 1000);
  g.flip(2, 12300); // a card up: full speed
  assert.equal(E.isLineBleed(g.s), false);
  g.tick(13300);
  assert.equal(g.s.clockLeftMs, 20200 - 1000);
  g.flip(4, 13300); g.tick(13400); // miss hold up
  g.flip(6, 13500); g.tick(15000); // dismiss + flip; tap at 13500
  // hold ended at 15000 (13500 + 1500), then idle edge at 13500 + 1500 = 15000
  g.act({ t: 'lineMoving', on: false, at: 15000 });
  g.tick(16000);
  assert.equal(E.isLineBleed(g.s), false, 'off the line: never a slow-down');
});

test('Time Attack slip costs 2s, match +1.5s, cap 45s, staircase and glimpse lengths', () => {
  const g = make(E.timeAttackConfig(), PAIRED(12), 4, 3);
  g.flip(0, 100); g.flip(2, 300);
  g.flip(1, 500); g.flip(4, 700); // slip (a)
  assert.equal(g.s.clockLeftMs, 30000 - 700 - 2000);
  assert.deepEqual([E.nextPairs(6, 0), E.nextPairs(6, 1), E.nextPairs(8, 2), E.nextPairs(8, 4), E.nextPairs(10, 0), E.nextPairs(6, 5)], [8, 8, 8, 6, 10, 6]);
  assert.deepEqual([E.glimpseMs(6, 0), E.glimpseMs(8, 0), E.glimpseMs(10, 0), E.glimpseMs(10, 5)], [1200, 1000, 800, 600]);
});

test('Time Attack board clear pays 250 x board + 100 per turn under par (Heat +25%) and deals the next board', () => {
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
  const h = make({ ...E.timeAttackConfig(), heatPct: 25 }, PAIRED(12), 4, 3);
  t = 0;
  for (let p = 0; p < 6; p++) { h.flip(p * 2, (t += 200)); h.flip(p * 2 + 1, (t += 200)); }
  assert.equal(h.last('boardClear').bonus, Math.round(650 * 1.25));
  assert.deepEqual([0, 1, 3, 5].map(E.timeAttackStars), [0, 1, 2, 3]);
});

// -----------------------------------------------------------------------------
// Daily Sudden Death (Fair Deck stars)
// -----------------------------------------------------------------------------

test('Daily: no clock, two slips and out; stars from Fair Deck par 14 / PERFECT 12', () => {
  const g = make(E.dailyConfig());
  g.tick(600000);
  assert.equal(g.s.status, 'play');
  g.flip(0, 600100); g.flip(2, 600300);
  g.flip(1, 601000); g.flip(4, 601200); // slip 1
  assert.equal(g.s.strikes, 1);
  g.flip(5, 602000); g.flip(0, 602200); // slip 2
  assert.equal(g.s.status, 'out');
  const c = make(E.dailyConfig());
  let t = 0;
  for (let p = 0; p < 8; p++) { c.flip(p * 2, (t += 300)); c.flip(p * 2 + 1, (t += 300)); }
  assert.equal(c.s.turns, 8);
  assert.equal(E.dailyStars(c.s), 3);
  assert.equal(c.last('cleared').bonus, 100 * (14 - 8) + 100 + 150);
  assert.equal(c.s.gauge, 0, 'no gauge in the Daily');
});

// -----------------------------------------------------------------------------
// Mode flags (the 4.0 matrix) and editions
// -----------------------------------------------------------------------------

test('mode matrix: Ride Sprint shows only the rim timer and chain; Heat and charms never in ranked or paid modes', () => {
  const ride = E.modeFlags('ride');
  assert.equal(ride.clock, 'charged');
  assert.equal(ride.scoreOnHud, false);
  assert.equal(ride.golden || ride.showtime || ride.photoFlash || ride.peek || ride.quick || ride.railToken, false);
  assert.equal(ride.overtime, 'look');
  for (const m of ['ride', 'daily', 'lineDuel', 'race']) {
    assert.equal(E.modeFlags(m).heat, false, m);
    assert.equal(E.modeFlags(m).charm, false, m);
  }
  assert.equal(E.modeFlags('timeAttack').heat, true);
  assert.equal(E.modeFlags('warmup').glint, true);
  assert.equal(E.modeFlags('daily').strikes, true);
  assert.equal(E.rideSprintConfig().gauge, false);
  assert.equal(E.rideSprintConfig().quickBonus, 0);
  assert.equal(E.dailyConfig().fair, true);
  assert.equal(E.warmupConfig().clockMs, null);
});

test('coin editions: stars mint Bronze / Silver / Gold and a later Ticket only upgrades', () => {
  assert.deepEqual([0, 1, 2, 3].map(E.editionForStars), ['none', 'bronze', 'silver', 'gold']);
  assert.deepEqual(plain(E.upgradeEdition(null, 'silver')), { edition: 'silver', upgraded: false });
  assert.deepEqual(plain(E.upgradeEdition('bronze', 'gold')), { edition: 'gold', upgraded: true });
  assert.deepEqual(plain(E.upgradeEdition('gold', 'bronze')), { edition: 'gold', upgraded: false });
  assert.deepEqual(plain(E.upgradeEdition('silver', 'silver')), { edition: 'silver', upgraded: false });
});

// -----------------------------------------------------------------------------
// Twists
// -----------------------------------------------------------------------------

test('Tide Shift: every 6 resolved turns, only stationary, moves knowledge with the cards', () => {
  const cfg = { ...E.timeAttackConfig(), tideShift: true };
  const g = make(cfg);
  g.act({ t: 'walking', on: true, at: 0 });
  let t = 0;
  for (const [a, b] of [[0, 2], [4, 6], [8, 10], [12, 14]]) { g.flip(a, (t += 200)); g.flip(b, (t += 200)); }
  g.act({ t: 'walking', on: false, at: (t += 200) });
  g.flip(1, (t += 100)); g.flip(0, (t += 100));
  g.flip(3, (t += 100)); g.flip(2, (t += 100));
  assert.equal(g.ev.filter((e) => e.k === 'tide').length, 0);
  t += 3500;
  g.flip(5, t); g.flip(4, (t += 100));
  const tide = g.last('tide');
  assert.ok(tide);
  const row = tide.row * 4;
  assert.ok(g.s.moved.slice(row, row + 4).some((m) => m === 1));
});

test('Seagull swap: after a gull miss flips back, two seen face-down cards swap (never while walking)', () => {
  const faces = PAIRED(16);
  faces[14] = E.FACE_GULL; faces[15] = E.FACE_GULL;
  const cfg = { ...E.timeAttackConfig(), seagull: true };
  const g = make(cfg, faces);
  g.flip(0, 100); g.flip(2, 300);
  g.flip(4, 2000); g.flip(14, 2200);
  const before = plain(g.s.ids);
  g.tick(4000);
  const sw = g.last('gullSwap');
  assert.ok(sw);
  assert.notDeepEqual(plain(g.s.ids), before);
  assert.equal(g.s.moved[sw.s1], 1);
  assert.equal(g.s.know[sw.s1], E.K_SEEN);
  const w = make(cfg, faces);
  w.act({ t: 'walking', on: true, at: 0 });
  w.flip(0, 100); w.flip(2, 300); w.flip(4, 2000); w.flip(14, 2200); w.tick(6000);
  assert.equal(w.last('gullSwap'), undefined);
});

// -----------------------------------------------------------------------------
// Grades and tips
// -----------------------------------------------------------------------------

test('grades, RECALL % and the coaching tip', () => {
  const g = make();
  let t = 0;
  for (let p = 0; p < 8; p++) { g.flip(p * 2, (t += 300)); g.flip(p * 2 + 1, (t += 300)); }
  const gr = E.gradesFor(g.s);
  assert.equal(gr.speed, 'S');
  assert.equal(gr.memory, 'C', 'all lucky: no recall');
  assert.equal(gr.chain, 'C', 'lucky never grows the chain');
  assert.equal(gr.tip, E.TIPS.chain);
  const s1 = make();
  s1.flip(0, 100); s1.flip(2, 300); s1.flip(1, 2000); s1.flip(4, 4200);
  assert.equal(E.gradesFor(s1.s).tip, E.TIPS.slipA);
  const s2 = make();
  s2.flip(0, 100); s2.flip(2, 300); s2.flip(4, 2000); s2.flip(2, 2200);
  assert.equal(E.gradesFor(s2.s).tip, E.TIPS.slipB);
  const r = make();
  r.flip(0, 100); r.flip(2, 300); r.flip(1, 500); r.flip(0, 700); r.flip(3, 900); r.flip(2, 1100);
  r.flip(4, 1300); r.flip(2 + 4, 1500); r.flip(5, 1700); r.flip(6, 1900); // slip (a) on 5: partner 4 seen
  assert.equal(E.recallPct(r.s), Math.round((100 * 2) / 3));
  assert.equal(E.median([5, 1, 3]), 3);
  assert.equal(E.median([4, 1, 3, 2]), 3);
});

// -----------------------------------------------------------------------------
// Seeds, layouts, replay
// -----------------------------------------------------------------------------

test('seed per run: PLAY AGAIN deals a different board; same (seed, runIndex) same board', () => {
  const a = L.buildLayout({ pairs: 8, deckSize: 10, seed: L.boardSeed(1234, 0) });
  const b = L.buildLayout({ pairs: 8, deckSize: 10, seed: L.boardSeed(1234, 1) });
  const a2 = L.buildLayout({ pairs: 8, deckSize: 10, seed: L.boardSeed(1234, 0) });
  assert.deepEqual(plain(a), plain(a2));
  assert.notDeepEqual(plain(a.faces), plain(b.faces));
  assert.equal(a.faces.length, 16);
  assert.equal(a.faces.filter((f) => f === E.FACE_GOLD).length, 0, 'Ride Sprint: 8 plain pairs');
  const ta = L.buildLayout({ pairs: 10, deckSize: 10, seed: 5, golden: true, gull: true });
  assert.equal(ta.cols * ta.rows, 20);
  assert.equal(ta.faces.filter((f) => f === E.FACE_GULL).length, 2);
  assert.deepEqual(plain(L.shapeForPairs(4)), { cols: 4, rows: 2, pairs: 4 });
  assert.deepEqual(plain(L.shapeForPairs(6)), { cols: 4, rows: 3, pairs: 6 });
});

test('replay: a flip log replays to the identical state (proof and PHP parity)', () => {
  const layout = L.buildLayout({ pairs: 8, deckSize: 10, seed: 99 });
  const cfg = E.rideSprintConfig();
  const g = make(cfg, layout.faces);
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

test('movement soak: toggling walking and the line every 3s never pauses Ride Sprint and the clock is continuous', () => {
  const g = make(E.rideSprintConfig(50000));
  for (let t = 0; t <= 39000; t += 3000) {
    g.act({ t: 'walking', on: (t / 3000) % 2 === 0, at: t });
    g.act({ t: 'lineMoving', on: (t / 3000) % 2 === 0, at: t });
  }
  assert.equal(g.s.clockLeftMs, 50000 - 39000);
  assert.equal(g.s.status, 'play');
});

test('the accelerometer (walking) can never slow any clock', () => {
  for (const cfg of [E.rideSprintConfig(), E.timeAttackConfig(), E.lineDuelConfig()]) {
    const a = make(cfg);
    const b = make(cfg);
    b.act({ t: 'walking', on: true, at: 0 });
    a.tick(9000); b.tick(9000);
    assert.equal(a.s.clockLeftMs, b.s.clockLeftMs, cfg.mode);
  }
});
