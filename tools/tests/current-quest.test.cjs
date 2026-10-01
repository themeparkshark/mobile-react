'use strict';
/**
 * Current Quest v2 (design v5): rules engine, solver, library, proof replay,
 * FX governor and parity vectors. Everything here is pure TypeScript loaded
 * through the shared ts-module helper, the same code the app ships.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const R = loadTs('src/games/current-quest/rules.ts');
const S = loadTs('src/games/current-quest/solver.ts');
const L = loadTs('src/games/current-quest/library.ts');
const { CQ_LIBRARY } = loadTs('src/games/current-quest/boards.v2.client.ts');

/** Rows use: . water, # rock, ^>v< current, s sandbar, S start, T chest, p pearl, P pearl on sandbar, q pearl on a > current, G golden. */
function mk(rows, P = 0, extra = {}) {
  const t = rows.join('').replace(/ /g, '');
  assert.equal(t.length, 5 * rows.length);
  let start = -1; let chest = -1; let golden = -1; const pearls = []; let tiles = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === 'S') { start = i; tiles += '.'; } else if (ch === 'T') { chest = i; tiles += '.'; } else if (ch === 'p') { pearls.push(i); tiles += '.'; } else if (ch === 'P') { pearls.push(i); tiles += 's'; } else if (ch === 'q') { pearls.push(i); tiles += '>'; } else if (ch === 'G') { golden = i; tiles += '.'; } else tiles += ch;
  }
  const b = { id: 'x', name: 'x', slot: 'standard', set: P ? 'CT' : 'C', ruleset: 2, H: rows.length, tiles, start, chest, pearls, golden, P, par: 0, parGold: 0, authorRiptide: 0, ...extra };
  const sol = S.solveBoard(b);
  return { ...b, par: extra.par ?? sol.par, parGold: extra.parGold ?? sol.parGold, authorRiptide: extra.authorRiptide ?? sol.authorRiptide };
}

function play(board, actions, knobs = R.PUZZLE_KNOBS, times = null) {
  let run = R.createRun([board], knobs);
  const events = [];
  for (let k = 0; k < actions.length; k++) {
    const a = actions[k];
    const res = R.applyAction(run, a, times ? times[k] : undefined);
    assert.ok(res.ok, `action ${a} rejected`);
    events.push(...res.events);
    run = res.run;
  }
  return { run, events };
}

const U = 0; const Rt = 1; const D = 2; const Lf = 3; const TREAD = 4; const UNDO = 5; const RESTART = 6; const CONT = 7; const SPLASH = 8; const TIP = 9;

// ---------------------------------------------------------------------------
// Library

test('library: every pool and teach board solves to its par and parGold under every allowed transform (8 on 5x5, 4 on tall)', () => {
  assert.ok(CQ_LIBRARY.length >= 400, `library has ${CQ_LIBRARY.length} boards`);
  for (const b of CQ_LIBRARY) {
    const allowed = R.allowedTransforms(R.heightOf(b));
    assert.equal(allowed.length, R.heightOf(b) === 5 ? 8 : 4);
    for (const tf of allowed) {
      const tb = R.transformBoard(b, tf);
      const sol = S.solveBoard(tb);
      assert.ok(sol.solvable, `${b.id}~${tf} unsolvable`);
      assert.equal(sol.par, b.par, `${b.id}~${tf} par`);
      assert.equal(sol.parGold, b.parGold, `${b.id}~${tf} parGold`);
    }
  }
});

test('library: filters hold (heights, gap, limit, slots, riptide share, carry caps, aha, no solutions, no loops, launch ruleset)', () => {
  const cells = {};
  const H = { warmup: 5, standard: 6, treasure: 7 };
  for (const b of CQ_LIBRARY) {
    assert.equal(R.heightOf(b), H[b.slot], `${b.id} height ${R.heightOf(b)} for ${b.slot}`);
    assert.equal(b.tiles.length, 5 * R.heightOf(b));
    const sol = S.solveBoard(b);
    assert.ok(sol.maxCarry <= 10, `${b.id} carries ${sol.maxCarry}`);
    assert.ok(S.longestRun(b) <= 6, `${b.id} run ${S.longestRun(b)}`);
    assert.equal('solution' in b, false, `${b.id} ships a solution`);
    assert.equal('solutionGold' in b, false);
    assert.ok(!b.id.startsWith('sealed'), `${b.id} is sealed`);
    assert.equal(b.ruleset, 2);
    assert.ok(b.parGold - b.par >= 2 && b.parGold - b.par <= 4, `${b.id} gap ${b.parGold - b.par}`);
    const limit = R.limitFor(b, R.PUZZLE_KNOBS);
    assert.equal(limit, Math.max(b.par + { warmup: 4, standard: 3, treasure: 3 }[b.slot], b.parGold + 2));
    assert.equal(S.hasCurrentLoop(b), false, `${b.id} loops`);
    if (b.slot === 'treasure' && !b.teach) assert.ok(b.par >= 6 && b.par <= 8, `${b.id} treasure par ${b.par}`);
    if (b.slot === 'treasure' || b.teach) assert.ok(typeof b.aha === 'string' && b.aha.length > 10, `${b.id} aha`);
    if (b.set === 'C') assert.equal(b.P, 0);
    if (b.set === 'CT' && !b.teach) assert.ok(b.P >= 3 && b.P <= 4);
    const key = `${b.set}-${b.slot}`;
    (cells[key] = cells[key] || []).push(b);
  }
  for (const key of ['C-treasure', 'CT-treasure']) {
    const list = cells[key].filter((b) => !b.teach);
    const share = list.filter((b) => b.parIsRiptide).length / list.length;
    assert.ok(share >= 0.6, `${key} parIsRiptide share ${share.toFixed(2)}`);
  }
  for (const key of ['C-warmup', 'C-standard', 'CT-standard']) assert.ok(cells[key].length >= 60, `${key} ${cells[key].length}`);
  for (const key of ['C-treasure', 'CT-treasure']) assert.ok(cells[key].length >= 120, `${key} ${cells[key].length}`);
  // Rookie / Adept / Master terciles; the coin pool is Rookie boards that passed the Trial sim (4.4, 15.2).
  for (const key of Object.keys(cells)) {
    const list = cells[key].filter((b) => !b.teach);
    const rookie = list.filter((b) => b.band === 'rookie').length;
    assert.ok(Math.abs(rookie - list.length / 3) <= 1, `${key} rookie ${rookie}/${list.length}`);
    for (const b of list.filter((x) => x.coin)) {
      assert.equal(b.band, 'rookie', `${b.id} coin outside the Rookie band`);
      assert.ok(b.trialClearRate >= 0.9, `${b.id} trial clear ${b.trialClearRate}`);
    }
  }
  for (const key of ['C-warmup', 'CT-standard', 'CT-treasure']) assert.ok(cells[key].filter((b) => b.coin).length >= 10, `${key} coin pool`);
});

test('library: teach boards are unsolvable without their verb', () => {
  const t1 = CQ_LIBRARY.find((b) => b.id === 'T1');
  const t2 = CQ_LIBRARY.find((b) => b.id === 'T2');
  assert.ok(t1 && t2);
  assert.equal(S.solveBoard({ ...t1, tiles: t1.tiles.replace(/[\^>v<]/g, '#') }).solvable, false, 'T1 needs currents');
  assert.equal(S.solveBoard({ ...t2, P: 0 }).solvable, false, 'T2 needs the tide');
  assert.ok(t1.teach && t2.teach);
});

test('library: pickRun is deterministic, scored contexts ignore progress and use the coin pool; Quick Run is 2 voyages', () => {
  const a = L.pickRun(123456, 'ride', { runsCompleted: 0, tideSeen: false });
  const b = L.pickRun(123456, 'ride', { runsCompleted: 9, tideSeen: true });
  assert.deepEqual(plain(a.map((x) => x.id)), plain(b.map((x) => x.id)));
  assert.deepEqual(plain(a.map((x) => x.slot)), ['warmup', 'standard', 'treasure']);
  assert.deepEqual(plain(a.map((x) => R.heightOf(x))), [5, 6, 7]);
  for (const x of a) assert.ok(L.boardById(x.id).coin, `${x.id} not coin`);
  for (const x of a) assert.ok(R.transformAllowed(R.transformOf(x.id), R.heightOf(x)), `${x.id} transform`);
  assert.notDeepEqual(plain(L.pickRun(1, 'line').map((x) => x.id)), plain(L.pickRun(2, 'line').map((x) => x.id)));
  assert.equal(L.voyagesFor('quick'), 2);
  assert.equal(L.voyagesFor('ride'), 3);
  const first = L.pickRun(5, 'quick', { runsCompleted: 0, tideSeen: false });
  assert.equal(first.length, 2);
  assert.equal(first[0].id, 'T1');
  assert.equal(first[1].P, 0);
  assert.equal(first[1].slot, 'treasure');
  const second = L.pickRun(5, 'quick', { runsCompleted: 1, tideSeen: false });
  assert.equal(second[1].id, 'T2');
  const later = L.pickRun(5, 'quick', { runsCompleted: 4, tideSeen: true });
  assert.equal(later.length, 2);
  assert.ok(later[0].P === 0 && later[1].P > 0 && later[1].slot === 'treasure' && R.heightOf(later[1]) === 7);
  for (let s = 0; s < 200; s++) for (const x of L.pickRun(s, 'quick', { runsCompleted: 4, tideSeen: true })) {
    assert.ok(R.transformAllowed(R.transformOf(x.id), R.heightOf(x)), `${x.id} transform on 5x${R.heightOf(x)}`);
  }
  const refs = L.boardRefs(a);
  assert.deepEqual(plain(L.boardsFromRefs(refs).map((x) => x.tiles)), plain(a.map((x) => x.tiles)));
  // A 90-degree transform id on a tall board is rejected everywhere.
  const tall = CQ_LIBRARY.find((x) => R.heightOf(x) === 7);
  assert.equal(L.boardsFromRefs([{ id: tall.id, tf: 1 }]), null);
  assert.throws(() => R.transformBoard(tall, 3));
  assert.equal(R.transformCell(0, 4, 7), -1);
});

test('rules: tall-board transforms map portrait to portrait (rotate 180, mirror left-right, mirror top-bottom)', () => {
  const b = mk(['S>...', '.....', '..#..', '.....', '...p.', '.....', '..T.G']);
  for (const tf of [2, 5, 7]) {
    const t = R.transformBoard(b, tf);
    assert.equal(t.tiles.length, 35);
    const sol = S.solveBoard(t);
    assert.equal(sol.par, S.solveBoard(b).par, `tf ${tf}`);
  }
  assert.equal(R.transformCell(0, 2, 7), 34);
  assert.equal(R.transformCell(0, 5, 7), 4);
  assert.equal(R.transformCell(0, 7, 7), 30);
  assert.equal(R.transformBoard(b, 5).tiles[3], '<', 'a right current mirrors to a left one');
});

// ---------------------------------------------------------------------------
// Resolution order (3.4) and profile vectors (18.3)

test('rules: a current carries tile by tile, stops before coral and collects mid-carry', () => {
  const b = mk(['.....', 'S>q>#', '..T..', '.....', '....G']);
  const { run, events } = play(b, [Rt]);
  const st = events.find((e) => e.type === 'stroke');
  assert.deepEqual(plain(st.path), [5, 6, 7, 8]);
  // A pearl on open water ends the ride (only current tiles carry).
  const still = mk(['.....', 'S>p>#', '..T..', '.....', '....G']);
  assert.deepEqual(plain(play(still, [Rt]).events[0].path), [5, 6, 7]);
  assert.equal(st.carried, 2);
  assert.equal(st.pearls.length, 1);
  assert.equal(st.unlocked, true);
  assert.equal(run.voyage.pos, 8);
  assert.equal(run.voyage.strokes, 1);
});

test('rules: upstream swims bump and are never recorded', () => {
  const b = mk(['.....', 'S<<<.', '.....', 'p..T.', '....G']);
  const { run, events } = play(b, [Rt]);
  assert.equal(events[0].type, 'bump');
  assert.equal(events[0].reason, 'upstream');
  assert.equal(run.voyage.strokes, 0);
  assert.deepEqual(plain(run.actions[0]), []);
});

test('rules: a carry uses the tide at stroke start even when the stroke flips it', () => {
  // P = 1: HIGH before the stroke, LOW after. The carry crosses a sandbar at HIGH.
  const b = mk(['.....', 'S>>s.', '.....', 'p...T', '....G'], 1);
  const { run, events } = play(b, [Rt]);
  const st = events.find((e) => e.type === 'stroke');
  assert.equal(st.tideBefore, R.TIDE_HIGH);
  assert.equal(st.tideAfter, R.TIDE_LOW);
  assert.deepEqual(plain(st.path), [5, 6, 7, 8]);
  // Resting on the sandbar when it dries: beached, no cost.
  assert.equal(run.voyage.beached, true);
  assert.equal(run.voyage.strokes, 1);
  // Swim off a dry sandbar is always allowed.
  const off = R.applyAction(run, Rt);
  assert.ok(off.ok && off.recorded);
  assert.equal(off.run.voyage.pos, 9);
  assert.equal(off.run.voyage.beached, false);
});

test('rules: a LOW sandbar blocks entry and stops a carry before it', () => {
  const b = mk(['.....', 'S>>s.', '.....', 'p...T', '....G'], 1);
  let run = R.createRun([b], R.PUZZLE_KNOBS);
  run = R.applyAction(run, D).run; // move 1: tide LOW now
  assert.equal(R.tideAt(b.P, run.voyage.moves, run.voyage.phase), R.TIDE_LOW);
  run = R.applyAction(run, U).run; // back to start, tide HIGH again (moves 2)
  run = R.applyAction(run, TREAD).run; // tread: 1 stroke, tide LOW (moves 3)
  assert.equal(run.voyage.strokes, 3);
  const res = R.applyAction(run, Rt);
  const st = res.events.find((e) => e.type === 'stroke');
  assert.deepEqual(plain(st.path), [5, 6, 7]);
});

test('rules: tread costs 1 stroke, 1 move, and turns the tide on schedule; no tread without tide', () => {
  const b = mk(['.....', 'S....', '.....', 'p...T', '....G'], 2);
  const { run, events } = play(b, [TREAD, TREAD]);
  assert.equal(run.voyage.strokes, 2);
  assert.equal(run.voyage.moves, 2);
  assert.equal(events[1].tideAfter, R.TIDE_LOW);
  const flat = mk(['.....', 'S....', '.....', 'p...T', '....G']);
  assert.equal(R.applyAction(R.createRun([flat], R.PUZZLE_KNOBS), TREAD).ok, false);
});

test('rules: the chest blocks until every pearl is in, then clears (clear stroke counts)', () => {
  const b = mk(['S.T.p', '.....', '.....', '.....', 'G....']);
  let { run, events } = play(b, [Rt]);
  const bump = R.applyAction(run, Rt);
  assert.equal(bump.events[0].reason, 'locked');
  ({ run } = play(b, [Rt, D, Rt, Rt, Rt, U, Lf, Lf]));
  assert.equal(run.complete, true);
  assert.equal(run.results[0].strokes, 8);
  void events;
});

test('rules: clearing on the stroke that reaches the limit is a clear, not a stall', () => {
  const b = mk(['SpT..', '.....', '.....', '.....', '.....'], 0, { golden: -1, parGold: 0 });
  const knobs = { ...R.PUZZLE_KNOBS, slack: { warmup: 2, standard: 2, treasure: 2 } };
  assert.equal(R.limitFor(b, knobs), 4);
  const { run, events } = play(b, [D, U, Rt, Rt], knobs);
  assert.equal(run.complete, true);
  assert.equal(run.results[0].spent, 4);
  assert.equal(events.some((e) => e.type === 'stall'), false);
});

test('rules: a carry that takes the last pearl can end in the chest (clear mid-carry)', () => {
  const b = mk(['.....', 'S>q>T', '.....', '.....', '....G']);
  const { run, events } = play(b, [Rt]);
  const st = events.find((e) => e.type === 'stroke');
  assert.equal(st.unlocked, true);
  assert.equal(st.cleared, true);
  assert.equal(run.complete, true);
  assert.equal(run.results[0].strokes, 1);
});

test('rules: stall at the limit; Puzzle allows undo/restart only, undo refunds and forfeits Par', () => {
  const b = mk(['S....', '.....', '..T..', '.....', 'p...G'], 0, { slot: 'standard' });
  const limit = R.limitFor(b, R.PUZZLE_KNOBS);
  let run = R.createRun([b], R.PUZZLE_KNOBS);
  for (let i = 0; i < limit; i++) run = R.applyAction(run, i % 2 ? Lf : Rt).run;
  assert.equal(run.voyage.stalled, true);
  assert.equal(R.applyAction(run, D).ok, false);
  assert.equal(R.applyAction(run, CONT).ok, false);
  const u = R.applyAction(run, UNDO);
  assert.ok(u.ok);
  assert.equal(u.run.voyage.stalled, false);
  assert.equal(u.run.voyage.strokes, limit - 1);
  assert.equal(u.run.voyage.spent, limit - 1);
  const rs = R.applyAction(run, RESTART);
  assert.ok(rs.ok);
  assert.equal(rs.run.voyage.spent, 0);
  assert.equal(rs.run.rings, 0);
  // Any undo forfeits the Par shell even with a perfect finish afterwards.
  const sol = S.solveBoard(b);
  let p = R.createRun([b], R.PUZZLE_KNOBS);
  p = R.applyAction(p, sol.solution[0]).run;
  p = R.applyAction(p, UNDO).run;
  for (const a of sol.solution) p = R.applyAction(p, a).run;
  assert.equal(p.complete, true);
  assert.equal(p.results[0].shellPar, false);
  assert.equal(p.results[0].strokes, sol.par);
});

test('rules: Trial undo keeps the stroke spent and is refused while stalled; restart is free and keeps the budget; rings fall only at a stall; 0 rings stalled fails', () => {
  const b = mk(['S....', '.....', '..T..', '.....', 'p...G', '.....'], 0, { slot: 'standard' });
  const limit = R.limitFor(b, R.RIDE_KNOBS);
  assert.equal(limit, Math.max(b.par + 4, b.parGold + 2), 'Trial slack +4 on Standard');
  let run = R.createRun([b], R.RIDE_KNOBS);
  assert.equal(run.rings, 2);
  run = R.applyAction(run, Rt).run;
  run = R.applyAction(run, UNDO).run;
  assert.equal(run.voyage.strokes, 0);
  assert.equal(run.voyage.spent, 1);
  run = R.applyAction(run, Rt).run;
  run = R.applyAction(run, Rt).run;
  const rs0 = R.applyAction(run, RESTART);
  assert.ok(rs0.ok);
  assert.equal(rs0.run.rings, 2, 'restart is free');
  assert.equal(rs0.run.voyage.spent, 3, 'the budget remembers');
  assert.equal(rs0.run.voyage.pos, b.start);
  run = rs0.run;
  for (let i = 3; i < limit; i++) run = R.applyAction(run, i % 2 ? Rt : Lf).run;
  assert.equal(run.voyage.stalled, true);
  assert.equal(R.applyAction(run, UNDO).ok, false, 'trial undo while stalled');
  assert.equal(R.applyAction(run, RESTART).ok, false, 'trial restart while stalled');
  const c = R.applyAction(run, CONT);
  assert.ok(c.ok);
  assert.equal(c.run.rings, 1);
  assert.equal(c.run.voyage.stalled, false);
  assert.equal(R.strokesLeft(c.run), 2);
  let r3 = R.applyAction(c.run, Rt).run;
  r3 = R.applyAction(r3, Lf).run;
  assert.equal(r3.voyage.stalled, true);
  r3 = R.applyAction(r3, CONT).run;
  assert.equal(r3.rings, 0);
  r3 = R.applyAction(R.applyAction(r3, Rt).run, Lf).run;
  assert.equal(r3.failed, true);
  assert.equal(R.applyAction(r3, CONT).ok, false);
});

test('rules: clear after a continue is a clear without the Par shell', () => {
  const b = mk(['SpT..', '.....', '.....', '.....', '.....'], 0, { golden: -1, parGold: 0 });
  const knobs = { ...R.RIDE_KNOBS, slack: { warmup: 2, standard: 2, treasure: 2 } };
  let { run } = play(b, [D, U, D, U], knobs);
  assert.equal(run.voyage.stalled, true);
  ({ run } = { run: R.applyAction(run, CONT).run });
  ({ run } = { run: R.applyAction(R.applyAction(run, Rt).run, Rt).run });
  assert.equal(run.complete, true);
  assert.equal(run.results[0].shellClear, true);
  assert.equal(run.results[0].shellPar, false);
  assert.equal(run.results[0].continues, 1);
  assert.equal(run.rings, 1);
});

test('rules: a Trial tip costs 2 strokes of budget (never a ring), is refused at 2 left and can stall; Puzzle tips cost only Par', () => {
  const b = mk(['S....', '.....', '..T..', '.....', 'p...G'], 0, { slot: 'warmup' });
  let run = R.createRun([b], R.RIDE_KNOBS);
  const lim = R.limitFor(b, R.RIDE_KNOBS);
  const t1 = R.applyAction(run, TIP);
  assert.ok(t1.ok);
  assert.equal(t1.events[0].cost, 2);
  assert.equal(t1.run.rings, 2, 'no ring');
  assert.equal(t1.run.voyage.spent, 2);
  assert.equal(t1.run.voyage.strokes, 0);
  run = t1.run;
  while (R.strokesLeft(run) > 2) run = R.applyAction(run, run.voyage.pos === b.start ? Rt : Lf).run;
  assert.equal(R.tipAllowed(run), false);
  assert.equal(R.applyAction(run, TIP).ok, false, 'refused at left <= 2');
  assert.equal(R.strokesLeft(run), 2);
  assert.equal(lim - run.voyage.spent, 2);
  const sol = S.solveBoard(b);
  let p = R.createRun([b], R.PUZZLE_KNOBS);
  p = R.applyAction(p, TIP).run;
  assert.equal(p.voyage.spent, 0);
  for (const a of sol.solution) p = R.applyAction(p, a).run;
  assert.equal(p.results[0].shellPar, false);
  assert.equal(p.results[0].tips, 1);
  // A tip that leaves the budget at the limit stalls (step 9 runs after action 9).
  const tight = { ...R.RIDE_KNOBS, tipCost: 3 };
  let q = R.createRun([b], tight);
  while (R.strokesLeft(q) > 4) q = R.applyAction(q, q.voyage.pos === b.start ? Rt : Lf).run;
  const st = R.applyAction(q, TIP);
  assert.ok(st.ok);
  assert.equal(R.strokesLeft(st.run), 1);
});

test('rules: the first undo within 1.5 s of its stroke is a free slip (Par kept); a second slip, or one at 1501 ms, forfeits Par', () => {
  const b = mk(['S....', '.....', '..T..', '.....', 'p...G'], 0, { slot: 'warmup', golden: -1, parGold: 0 });
  const sol = S.solveBoard(b);
  const wrong = sol.solution[0] === Rt ? D : Rt;
  // Slip at exactly 1500 ms: Par kept.
  let r = play(b, [wrong, UNDO, ...sol.solution], R.PUZZLE_KNOBS, [1000, 2500, ...sol.solution.map((_, i) => 4000 + i * 800)]);
  assert.equal(r.events.find((e) => e.type === 'undo').slip, true);
  assert.equal(r.run.results[0].shellPar, true);
  assert.equal(r.run.results[0].undos, 0);
  // 1501 ms: not a slip.
  r = play(b, [wrong, UNDO, ...sol.solution], R.PUZZLE_KNOBS, [1000, 2501, ...sol.solution.map((_, i) => 4000 + i * 800)]);
  assert.equal(r.events.find((e) => e.type === 'undo').slip, false);
  assert.equal(r.run.results[0].shellPar, false);
  // Only the first slip of a voyage is free.
  r = play(b, [wrong, UNDO, wrong, UNDO, ...sol.solution], R.PUZZLE_KNOBS, [1000, 1400, 2000, 2400, ...sol.solution.map((_, i) => 4000 + i * 800)]);
  const undos = r.events.filter((e) => e.type === 'undo');
  assert.deepEqual(plain(undos.map((e) => e.slip)), [true, false]);
  assert.equal(r.run.results[0].shellPar, false);
  // No times (bots, legacy replays): never a slip.
  r = play(b, [wrong, UNDO, ...sol.solution]);
  assert.equal(r.run.results[0].shellPar, false);
  // Trial: a slip keeps Par but the stroke stays spent.
  r = play(b, [wrong, UNDO, ...sol.solution], R.RIDE_KNOBS, [1000, 1800, ...sol.solution.map((_, i) => 4000 + i * 800)]);
  assert.equal(r.run.results[0].shellPar, true);
  assert.equal(r.run.results[0].spent, sol.par + 1);
});

test('rules: hold-to-scrub of 3 strokes counts 3 undos; restart counts as one undo and is free in Puzzle', () => {
  const b = mk(['S....', '.....', '..T..', '.....', 'p...G'], 0, { slot: 'warmup' });
  const r = play(b, [Rt, Rt, D, UNDO, UNDO, UNDO], R.PUZZLE_KNOBS, [1000, 3000, 5000, 9000, 9250, 9500]);
  assert.equal(r.run.voyage.undos, 3);
  assert.equal(r.run.voyage.strokes, 0);
  assert.equal(r.run.voyage.spent, 0);
  const rs = play(b, [Rt, Rt, RESTART], R.PUZZLE_KNOBS, [1000, 3000, 5000]);
  assert.equal(rs.run.voyage.undos, 1);
  assert.equal(rs.run.voyage.spent, 0);
  assert.equal(rs.run.voyage.pos, b.start);
});

test('rules: Riptide strokes: 2 chained runs of 1 tile each, a single 5-tile run; 4 tiles in one run is not', () => {
  // Swim onto a 1-tile right run that hands to a 1-tile down run.
  const chain = mk(['S>v..', '..#..', '..p..', '..#.T', '....G']);
  let st = play(chain, [Rt]).events.find((e) => e.type === 'stroke');
  assert.equal(st.runs, 2);
  assert.equal(st.riptide, true);
  assert.deepEqual(plain(st.handoffs), [2]);
  const long = mk(['S....', 'v....', 'v....', 'v....', 'v....', 'v....', '.p.TG']);
  st = play(long, [D]).events.find((e) => e.type === 'stroke');
  assert.equal(st.carried, 5);
  assert.equal(st.runs, 1);
  assert.equal(st.riptide, true);
  const four = mk(['S....', 'v....', 'v....', 'v....', 'v....', '.....', '.p.TG']);
  st = play(four, [D]).events.find((e) => e.type === 'stroke');
  assert.equal(st.carried, 4);
  assert.equal(st.riptide, false);
  // Riptide strokes feed the Author medal only; the preview announces them before you commit.
  const pv = R.previewFor(R.createRun([chain], R.PUZZLE_KNOBS), Rt);
  assert.equal(pv.riptide, true);
  assert.equal(R.isRiptide(1, 4), false);
  assert.equal(R.isRiptide(2, 1), true);
});

test('rules: undo across a tide flip restores the tide; a Splash survives undo', () => {
  const b = mk(['.....', 'S....', '.....', 'p...T', '....G'], 2, {});
  let run = R.createRun([b], { ...R.PUZZLE_KNOBS, showdown: true });
  run = R.applyAction(run, Rt).run;
  run = R.applyAction(run, Rt).run;
  assert.equal(R.tideAt(b.P, run.voyage.moves, run.voyage.phase), R.TIDE_LOW);
  const u = R.applyAction(run, UNDO);
  assert.equal(u.events[0].tideBefore, R.TIDE_LOW);
  assert.equal(u.events[0].tideAfter, R.TIDE_HIGH);
  let s = R.applyAction(R.createRun([b], { ...R.PUZZLE_KNOBS, showdown: true }), Rt).run;
  s = R.applyAction(s, SPLASH).run;
  assert.equal(s.voyage.phase, 1);
  s = R.applyAction(s, UNDO).run;
  assert.equal(s.voyage.phase, 1, 'phase is world state');
  assert.equal(R.tideAt(b.P, s.voyage.moves, s.voyage.phase), R.TIDE_HIGH);
});

test('rules: a Shield from a golden pearl absorbs exactly one Splash; Splash on P = 0 changes no tide', () => {
  const b = mk(['S.G..', '.....', '..T..', '.....', 'p....'], 2);
  let run = R.createRun([b], { ...R.PUZZLE_KNOBS, showdown: true });
  run = R.applyAction(run, Rt).run;
  run = R.applyAction(run, Rt).run;
  assert.equal(run.voyage.golden, true);
  assert.equal(run.voyage.shield, true);
  const s1 = R.applyAction(run, SPLASH);
  assert.equal(s1.events[0].blocked, true);
  assert.equal(s1.run.voyage.phase, 0);
  const s2 = R.applyAction(s1.run, SPLASH);
  assert.equal(s2.events[0].blocked, false);
  assert.equal(s2.run.voyage.phase, 1);
  const flat = mk(['S.G..', '.....', '..T..', '.....', 'p....']);
  const f = R.applyAction(R.createRun([flat], { ...R.PUZZLE_KNOBS, showdown: true }), SPLASH);
  assert.equal(f.events[0].tideBefore, f.events[0].tideAfter);
});

test('rules: a Splash can beach a shark resting on a sandbar', () => {
  const b = mk(['.....', 'S.P..', '.....', '....T', '....G'], 3);
  let run = R.createRun([b], { ...R.PUZZLE_KNOBS, showdown: true });
  run = R.applyAction(run, Rt).run;
  run = R.applyAction(run, Rt).run; // on the sandbar, moves 2, tide HIGH
  const s = R.applyAction(run, SPLASH); // phase 1: (2+1)/3 = 1 -> LOW
  assert.equal(s.events[0].beached, true);
  assert.equal(s.run.voyage.beached, true);
});

// ---------------------------------------------------------------------------
// Scoring (3.5, 3.6)

test('scoring: shells, stars and the two-part treasure', () => {
  assert.equal(R.starsFor(9, true), 3);
  assert.equal(R.starsFor(8, true), 3);
  assert.equal(R.starsFor(7, true), 2);
  assert.equal(R.starsFor(6, true), 2);
  assert.equal(R.starsFor(5, true), 1);
  assert.equal(R.starsFor(3, true), 1);
  assert.equal(R.starsFor(9, false), 0);
  assert.equal(R.shellsToNextStar(4), 2);
  assert.equal(R.shellsToNextStar(7), 1);
  assert.equal(R.shellsToNextStar(9), 0);
  // 2-voyage Quick Run (6 shells): 2-3 = 1 star, 4-5 = 2, 6 = 3.
  assert.equal(R.starsFor(6, true, 2), 3);
  assert.equal(R.starsFor(5, true, 2), 2);
  assert.equal(R.starsFor(4, true, 2), 2);
  assert.equal(R.starsFor(3, true, 2), 1);
  assert.equal(R.starsFor(2, true, 2), 1);
  assert.equal(R.shellsToNextStar(3, 2), 1);
  assert.equal(R.shellsToNextStar(5, 2), 1);
  assert.equal(R.shellsToNextStar(6, 2), 0);
  const b = CQ_LIBRARY.find((x) => x.slot === 'treasure' && !x.teach);
  const sol = S.solveBoard(b);
  let run = R.createRun([b], R.PUZZLE_KNOBS);
  for (const a of sol.solutionGold) run = R.applyAction(run, a).run;
  const r = run.results[0];
  assert.equal(r.shells, 3);
  assert.equal(r.treasure, 50 * b.pearls.length + 200 + 40 * (R.limitFor(b, R.PUZZLE_KNOBS) - b.parGold));
  assert.ok(r.medal >= 3);
  // Author = Gold AND Riptide strokes >= authorRiptide (riptide never touches treasure).
  assert.equal(r.medal === 4, r.ripStrokes >= b.authorRiptide);
});

test('solver: the wrong-turn marker finds the first state with no way home in budget', () => {
  const b = mk(['S....', '.....', '..T..', '.....', 'p...G'], 0, { slot: 'warmup' });
  const lim = R.limitFor(b, R.PUZZLE_KNOBS);
  let run = R.createRun([b], R.PUZZLE_KNOBS);
  for (let i = 0; i < lim; i++) run = R.applyAction(run, i % 2 ? Lf : Rt).run;
  assert.equal(run.voyage.stalled, true);
  const v = run.voyage;
  const states = [...v.stack.map((x) => ({ pos: x.pos, mask: x.mask, golden: x.golden, moves: x.moves, phase: 0 })), { pos: v.pos, mask: v.mask, golden: v.golden, moves: v.moves, phase: 0 }];
  const budget = [...v.stack.map((x) => lim - x.spent), lim - v.spent];
  const k = S.firstDeadState(b, states, budget);
  assert.ok(k > 0, `dead at ${k}`);
  assert.ok(S.distanceFrom(b, states[k - 1], false) <= budget[k - 1], 'the state before still had a way home');
});

test('solver: following the Tide Tip from any point on a route reaches the chest at par', () => {
  for (const b of CQ_LIBRARY.slice(0, 60)) {
    let run = R.createRun([b], R.PUZZLE_KNOBS);
    let guard = 0;
    while (!run.complete && guard++ < 30) {
      const [a] = S.hintFrom(b, run.voyage, 1, Infinity);
      run = R.applyAction(run, a).run;
    }
    assert.equal(run.complete, true, b.id);
    assert.equal(run.results[0].strokes, b.golden >= 0 ? b.parGold : b.par, b.id);
  }
});

// ---------------------------------------------------------------------------
// Proof v2 (15.3, 16)

function solvedProof(boards, knobs, context = 'line') {
  let run = R.createRun(boards, knobs);
  let t = 0;
  const voyages = [];
  for (const b of boards) {
    const sol = S.solveBoard(b);
    const ready = t + 400;
    t = ready + 2000;
    const a = [];
    const ts = [];
    for (const act of sol.solutionGold) {
      run = R.applyAction(run, act, t).run;
      a.push(act);
      ts.push(t);
      t += 700;
    }
    voyages.push({ id: b.id.split('~')[0], tf: R.transformOf(b.id), a, t: ts, ready });
  }
  const shells = R.totalShells(run.results);
  return { game: 'current', v: 2, context, profile: knobs.profile, rings: knobs.rings, seed: 1, treasure: R.treasureOf(run.results), stars: R.starsFor(shells, run.complete, boards.length), shells, elapsed_ms: t + 500, voyages };
}

test('proof: a real Trial run verifies; tampering is rejected', () => {
  const boards = L.pickRun(99, 'line');
  const proof = solvedProof(boards, R.LINE_BONUS_KNOBS);
  const ok = R.verifyProof(boards, R.LINE_BONUS_KNOBS, proof);
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(ok.shells, 9);
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, { ...proof, treasure: proof.treasure + 40 }).reason, 'claim');
  const badAct = JSON.parse(JSON.stringify(proof));
  badAct.voyages[1].a[0] = (badAct.voyages[1].a[0] + 2) % 4;
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, badAct).ok, false);
  const nonMono = JSON.parse(JSON.stringify(proof));
  nonMono.voyages[0].t[2] = nonMono.voyages[0].t[1] - 5;
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, nonMono).reason, 'monotonic');
  const fast = JSON.parse(JSON.stringify(proof));
  fast.voyages[0].t[2] = fast.voyages[0].t[1] + 100;
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, fast).reason, 'interval');
  const think = JSON.parse(JSON.stringify(proof));
  think.voyages[2].t[0] = think.voyages[2].ready + 300;
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, think).reason, 'think-floor');
  const bot = JSON.parse(JSON.stringify(proof));
  for (const v of bot.voyages) v.t = v.t.map((x, i) => v.t[0] + i * 200);
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, bot).reason, 'median');
  assert.equal(R.verifyProof(L.pickRun(98, 'line'), R.LINE_BONUS_KNOBS, proof).reason, 'board');
  assert.equal(R.verifyProof(boards, R.PUZZLE_KNOBS, proof).reason, 'profile');
  // A 2-voyage Quick Run proof (6 shells) verifies with 2-voyage stars.
  const quick = L.pickRun(7, 'quick', { runsCompleted: 5, tideSeen: true });
  const qp = solvedProof(quick, R.PUZZLE_KNOBS, 'quick');
  const qv = R.verifyProof(quick, R.PUZZLE_KNOBS, qp);
  assert.equal(qv.ok, true, qv.reason);
  assert.equal(qv.shells, 6);
  assert.equal(qv.stars, 3);
  // A slip undo in the proof keeps the Par shell on the server too.
  const slip = JSON.parse(JSON.stringify(qp));
  const v0 = slip.voyages[0];
  const wrong = [0, 1, 2, 3].find((d) => d !== v0.a[0] && R.previewFor(R.createRun(quick, R.PUZZLE_KNOBS), d).valid);
  v0.a = [wrong, 5, ...v0.a];
  v0.t = [v0.t[0], v0.t[0] + 900, ...v0.t.map((x) => x + 2000)];
  for (const v of slip.voyages.slice(1)) { v.ready += 2000; v.t = v.t.map((x) => x + 2000); }
  slip.elapsed_ms += 2000;
  const sv = R.verifyProof(quick, R.PUZZLE_KNOBS, slip);
  assert.equal(sv.ok, true, sv.reason);
  assert.equal(sv.shells, 6);
});

// ---------------------------------------------------------------------------
// Parity vectors (shared with the PHP verifier)

test('parity: vectors.v2.json replays exactly', () => {
  const file = path.join(root, 'tools/current-quest/vectors.v2.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(data.vectors.length >= 360, `${data.vectors.length} vectors`);
  const knobsOf = (p) => ({ puzzle: R.PUZZLE_KNOBS, ride: R.RIDE_KNOBS, line: R.LINE_BONUS_KNOBS }[p]);
  for (const v of data.vectors) {
    const boards = L.boardsFromRefs(v.boards);
    let run = R.createRun(boards, { ...knobsOf(v.knobs), showdown: !!v.showdown });
    const accepted = [];
    v.actions.forEach((a, k) => {
      const res = R.applyAction(run, a, v.times ? v.times[k] : undefined);
      accepted.push(res.ok ? (res.recorded ? 1 : 2) : 0);
      if (res.ok) run = res.run;
    });
    const got = { accepted, index: run.index, pos: run.voyage.pos, mask: run.voyage.mask, golden: run.voyage.golden, strokes: run.voyage.strokes, spent: run.voyage.spent, moves: run.voyage.moves, phase: run.voyage.phase, rings: run.rings, failed: run.failed, complete: run.complete, beached: run.voyage.beached, stalled: run.voyage.stalled, shells: R.totalShells(run.results), treasure: R.treasureOf(run.results), undos: run.voyage.undos, slipUsed: run.voyage.slipUsed, tips: run.voyage.tips, ripStrokes: run.voyage.ripStrokes };
    assert.deepEqual(plain(got), v.expect, `vector ${v.name}`);
  }
});

// ---------------------------------------------------------------------------
// Presentation logic (pure): motion timeline, FX governor, subtitle table

const M = loadTs('src/games/current-quest/motion.ts');
const G = loadTs('src/games/current-quest/fxGovernor.ts');
const T = loadTs('src/games/current-quest/themeSubtitle.ts');

test('motion: a carry rides 75 ms per tile, overshoots toward the blocker and settles on the last tile', () => {
  const pts = [0, 0, 100, 0, 200, 0, 300, 0];
  const plan = { kind: M.PLAN_STROKE, t0: 0, pts, carry: 2, facing: 1, dive: 0, beached: 0, wasBeached: 0, bx: 0, by: 0, speed: 1, rip: 0 };
  const f = M.newFrame();
  M.evalShark(plan, M.T_ANTIC + M.T_TRAVEL, 0, f);
  assert.ok(Math.abs(f.x - 100) < 1);
  M.evalShark(plan, M.T_ANTIC + M.T_TRAVEL + M.T_GRAB + M.T_TILE * 1.5, 0, f);
  assert.ok(Math.abs(f.x - 250) < 1, `mid ride x ${f.x}`);
  assert.equal(f.pose, M.POSE_SURF, 'every carry rides in the surf pose');
  assert.equal(f.carrying, 1);
  assert.ok(f.sx > 1.2, 'stretch along travel holds near 1.25');
  assert.equal(f.roll, 1, 'no corkscrew on an ordinary carry');
  const rip = { ...plan, carry: 2, rip: 1 };
  M.evalShark(rip, M.T_ANTIC + M.T_TRAVEL + M.T_GRAB + M.T_TILE * 1.0, 0, f);
  assert.ok(f.roll < 1, 'Riptide strokes corkscrew');
  M.evalShark(plan, M.T_ANTIC + M.T_TRAVEL + M.T_GRAB + M.T_TILE * 2 + 10, 0, f);
  assert.ok(f.x > 300, 'overshoot past the last tile toward the blocker');
  M.evalShark(plan, M.planDuration(plan) + 5, 0, f);
  assert.ok(Math.abs(f.x - 300) < 0.5);
  assert.equal(f.done, true);
  assert.equal(M.planDuration(plan), M.T_ANTIC + M.T_TRAVEL + M.T_GRAB + M.T_TILE * 2 + M.T_SPIT);
});

test('motion: bump swaps to the ouch pose and returns home; mesh indices cover the 10x3 grid', () => {
  const plan = { ...M.idlePlan(50, 50, 1), kind: M.PLAN_BUMP, pts: [50, 50], bx: 150, by: 50 };
  const f = M.newFrame();
  M.evalShark(plan, 60, 0, f);
  assert.equal(f.pose, M.POSE_OUCH);
  assert.ok(f.x > 60 && f.x < 70);
  M.evalShark(plan, 400, 0, f);
  assert.ok(Math.abs(f.x - 50) < 0.5);
  assert.equal(M.meshIndices().length, 9 * 2 * 6);
  const out = Array.from({ length: 30 }, () => ({ x: 0, y: 0 }));
  M.meshVertices({ ...M.newFrame(), x: 100, y: 100 }, 80, 40, true, 0, 0, out);
  assert.ok(Math.abs(out[0].x - 60) < 0.01 && Math.abs(out[9].x - 140) < 0.01);
});

test('fx governor: flash gap and cap, punch vs shake, one hit-stop per stroke, priority, GOLDEN banner first', () => {
  const g = G.createGovernor();
  assert.equal(G.requestFlash(g, 1000, 0.5), 0.2);
  assert.equal(G.requestFlash(g, 2500, 0.1), 0);
  assert.equal(G.requestFlash(g, 3100, 0.1), 0.1);
  assert.equal(G.requestShake(g, 5000), true);
  assert.equal(G.requestPunch(g, 5100), false);
  assert.equal(G.requestPunch(g, 5200), true);
  assert.equal(G.requestShake(g, 5300), false);
  assert.equal(G.requestHitStop(g, 7), true);
  assert.equal(G.requestHitStop(g, 7), false);
  assert.equal(G.requestHitStop(g, 8), true);
  // Scripted golden + unlock + riptide on one stroke: golden keeps the big moves.
  assert.equal(G.claimBig(g, 9, G.PRI_GOLDEN), true);
  assert.equal(G.claimBig(g, 9, G.PRI_UNLOCK), false);
  assert.equal(G.claimBig(g, 9, G.PRI_RIPTIDE), false);
  const at = G.bannerAt(g, 10000, G.PRI_GOLDEN);
  assert.equal(at, 10000);
  assert.equal(G.bannerAt(g, 10050, G.PRI_RIPTIDE), 10000 + G.GOLDEN_BANNER_MS + G.BANNER_AFTER_GOLDEN_MS);
});

test('subtitle comes from the land table, never the ride name', () => {
  assert.equal(T.themeSubtitle('pirates'), 'Pirate Harbor');
  assert.equal(T.themeSubtitle(undefined), 'Lagoon');
  assert.equal(T.themeSubtitle('Space Mountain'), 'Lagoon');
  assert.equal(T.themeSubtitle('Pirates of the Caribbean').includes('Caribbean'), false);
});

// ---------------------------------------------------------------------------
// Showdown (14.1)

const SD = loadTs('src/games/current-quest/showdown.ts');

test('showdown: seeded boards, deterministic crew bots that finish inside the window, rank key', () => {
  const boards = SD.showdownBoards(777);
  assert.equal(boards.length, 2);
  assert.deepEqual(plain(boards.map((b) => b.slot)), ['standard', 'treasure']);
  assert.ok(boards.every((b) => b.P > 0));
  for (const seat of SD.HOUSE_CREW) {
    const a = SD.botActions(777, seat, boards);
    const b = SD.botActions(777, seat, boards);
    assert.deepEqual(plain(a), plain(b), 'deterministic');
    assert.ok(a.times.every((t, i) => i === 0 || t > a.times[i - 1]));
    // Replays through the same rules to a finished run.
    let run = R.createRun(boards, SD.SHOWDOWN_KNOBS);
    for (const act of a.actions) run = R.applyAction(run, act).run;
    assert.equal(run.complete, true, `${seat.name} finishes`);
    assert.ok(a.times[a.times.length - 1] < SD.SHOWDOWN_WINDOW_MS);
  }
  const fin = { voyagesCleared: 2, shells: 5, strokes: 14, undos: 0, tempo: 20000, finished: true, finishedAt: 1 };
  assert.ok(SD.compareRacers(fin, { ...fin, shells: 4 }) < 0);
  assert.ok(SD.compareRacers(fin, { ...fin, strokes: 15 }) < 0);
  assert.ok(SD.compareRacers(fin, { ...fin, undos: 1 }) < 0);
  assert.ok(SD.compareRacers({ ...fin, finished: false, voyagesCleared: 1 }, fin) > 0);
  assert.ok(SD.compareRacers({ ...fin, finished: false, voyagesCleared: 1, shells: 3 }, { ...fin, finished: false, voyagesCleared: 0, shells: 0 }) < 0);
  assert.ok(SD.scoreOf(fin) > SD.scoreOf({ ...fin, strokes: 16 }));
  // No time key anywhere: equal shells, strokes and undos tie and share a rank, whatever the tempo.
  assert.equal(SD.compareRacers(fin, { ...fin, tempo: 1 }), 0);
  assert.equal(SD.scoreOf(fin), SD.scoreOf({ ...fin, tempo: 999999 }));
  assert.deepEqual(plain(SD.placesOf([{ p: fin }, { p: { ...fin, tempo: 5 } }, { p: { ...fin, strokes: 20 } }])), [1, 1, 3]);
  assert.equal(SD.splashTarget([{ seat: 0, p: fin }, { seat: 2, p: { ...fin, finished: false, shells: 3 } }, { seat: 3, p: { ...fin, finished: false, shells: 1 } }], 0), 2);
});

test('showdown: a Splash to a bot shifts its tide and the bot still finishes (replan through the solver)', () => {
  const boards = SD.showdownBoards(4242);
  const bot = SD.createBot(4242, SD.HOUSE_CREW[2], boards, 0);
  bot.inbox = 2;
  for (let t = 0; t <= SD.SHOWDOWN_WINDOW_MS && !bot.run.complete; t += 250) SD.stepBot(bot, t);
  assert.equal(bot.run.complete, true);
  assert.ok(bot.run.actions.flat().filter((a) => a === R.A_SPLASH).length >= 1);
});

// ---------------------------------------------------------------------------
// Ink FX rule (9.13): no dash effects and no hairlines in this game's code.

test('ink lint: no DashPathEffect and no stroke under 2 px in src/games/current-quest', () => {
  const dir = path.join(root, 'src/games/current-quest');
  for (const f of fs.readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.equal(/DashPathEffect|DashPath|dashPathEffect/.test(src), false, `${f} uses a dash effect`);
    for (const m of src.matchAll(/strokeWidth=\{([0-9.]+)\}/g)) assert.ok(Number(m[1]) >= 2, `${f} strokeWidth ${m[1]}`);
  }
});
