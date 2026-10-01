'use strict';
/**
 * Current Quest (design v7.1): rules engine, solver, library v3, proof v3 replay,
 * Showdown room, FX governor and parity vectors. Everything here is pure TypeScript loaded
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
const { CQ_LIBRARY } = loadTs('src/games/current-quest/boards.v3.client.ts');
const LIVE = CQ_LIBRARY.filter((b) => !b.retired);

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
const SLACK = (n) => ({ trick: n, warmup: n, standard: n, treasure: n });

// ---------------------------------------------------------------------------
// Library

test('library: every live board solves to its par and parGold under every allowed transform (8 on 5x5, 4 on tall)', () => {
  assert.ok(LIVE.length >= 400, `library has ${LIVE.length} live boards`);
  for (const b of LIVE) {
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
  const H = { trick: 5, warmup: 5, standard: 6, treasure: 7 };
  for (const b of CQ_LIBRARY) {
    assert.equal(R.heightOf(b), H[b.slot], `${b.id} height ${R.heightOf(b)} for ${b.slot}`);
    assert.equal(b.tiles.length, 5 * R.heightOf(b));
    assert.equal('solution' in b, false, `${b.id} ships a solution`);
    assert.equal('solutionGold' in b, false);
    assert.ok(!b.id.startsWith('sealed'), `${b.id} is sealed`);
    assert.equal(b.ruleset, 2);
    if (b.retired) continue;
    const sol = S.solveBoard(b);
    assert.ok(sol.maxCarry <= 10, `${b.id} carries ${sol.maxCarry}`);
    assert.ok(S.longestRun(b) <= 6, `${b.id} run ${S.longestRun(b)}`);
    const gap = b.parGold - b.par;
    if (b.slot === 'trick') assert.ok(gap >= 1 && gap <= 2, `${b.id} trick gap ${gap}`);
    else assert.ok(gap >= 2 && gap <= 4, `${b.id} gap ${gap}`);
    const limit = R.limitFor(b, R.PUZZLE_KNOBS);
    assert.equal(limit, Math.max(b.par + { trick: 3, warmup: 4, standard: 3, treasure: 3 }[b.slot], b.parGold + 2));
    assert.equal(S.hasCurrentLoop(b), false, `${b.id} loops`);
    if (b.slot === 'treasure' && !b.teach) assert.ok(b.par >= 6 && b.par <= 8, `${b.id} Deep par ${b.par}`);
    if (b.slot === 'treasure' || b.teach || b.slot === 'trick') assert.ok(typeof b.aha === 'string' && b.aha.length > 10, `${b.id} aha`);
    if (b.set === 'C') assert.equal(b.P, 0);
    if (b.set === 'CT' && !b.teach && b.slot !== 'trick') assert.ok(b.P >= 3 && b.P <= 4);
    const key = `${b.set}-${b.slot}`;
    (cells[key] = cells[key] || []).push(b);
  }
  for (const key of ['C-treasure', 'CT-treasure']) {
    const list = cells[key].filter((b) => !b.teach);
    const share = list.filter((b) => b.parIsRiptide).length / list.length;
    assert.ok(share >= 0.6, `${key} parIsRiptide share ${share.toFixed(2)}`);
  }
  for (const key of ['C-standard', 'CT-standard']) assert.ok(cells[key].length >= 60, `${key} ${cells[key].length}`);
  for (const key of ['C-treasure', 'CT-treasure']) assert.ok(cells[key].length >= 120, `${key} ${cells[key].length}`);
  // Rookie / Adept / Master terciles; the coin pool is Rookie boards that passed the Trial sim (4.4, 15.2).
  for (const key of Object.keys(cells)) {
    const list = cells[key].filter((b) => !b.teach);
    for (const b of list.filter((x) => x.coin)) {
      assert.equal(b.band, 'rookie', `${b.id} coin outside the Rookie band`);
      assert.ok(b.trialClearRate >= 0.9, `${b.id} trial clear ${b.trialClearRate}`);
    }
  }
  assert.ok(L.poolOf('C', 'trick', true).length >= 6, 'coin openers');
  // v7.1 re-fit (15.2): the Standard coin pool shrank to 7 under the stricter Trial (12 under v5); flagged for the designer.
  for (const [set, slot, min] of [['CT', 'standard', 6], ['CT', 'treasure', 12]]) assert.ok(L.poolOf(set, slot, true).length >= min, `${set}-${slot} coin pool`);
  // The v5 Warm-up cell is retired and never drawn.
  assert.ok(CQ_LIBRARY.filter((b) => b.slot === 'warmup' && !b.teach).every((b) => b.retired));
  assert.equal(L.poolOf('C', 'warmup').length, 0);
});

test('library v3: C-trick cell (R7): 5x5, par 2..3 (tide tags up to 4), 1+ decision point, gap 1..2, and the par route uses its tag verb', () => {
  const trick = LIVE.filter((b) => b.slot === 'trick');
  assert.ok(trick.length >= 60, `trick ${trick.length}`);
  const per = {};
  for (const b of trick) {
    assert.equal(R.heightOf(b), 5);
    const tide = b.ahaTag === 'wait' || b.ahaTag === 'low-road';
    assert.ok(b.par >= 2 && b.par <= (tide ? 4 : 3), `${b.id} par ${b.par}`);
    assert.ok(b.decisionPoints >= 1, `${b.id} decision points`);
    assert.equal(b.P, tide ? 2 : 0, `${b.id} P`);
    const sol = S.solveBoard(b);
    assert.ok(S.routeTags(b, sol.solution).includes(b.ahaTag), `${b.id} route does not use ${b.ahaTag}`);
    per[b.ahaTag] = (per[b.ahaTag] || 0) + 1;
  }
  for (const tag of ['chain', 'long-ride', 'bank-shot', 'backdoor', 'low-road']) assert.ok((per[tag] || 0) >= 10, `${tag} openers ${per[tag]}`);
  assert.ok((per.wait || 0) >= 1, 'wait openers');
});

test('library v3: phase tables (R1) on every tide board; the splash row is never easier and adds at most 2 par', () => {
  let rows = 0;
  for (const b of LIVE.filter((x) => x.P > 0)) {
    const t = S.phaseTable(b);
    assert.deepEqual(plain(b.parByPhase), plain(t.parByPhase), `${b.id} parByPhase`);
    assert.deepEqual(plain(b.parGoldByPhase), plain(t.parGoldByPhase), `${b.id} parGoldByPhase`);
    assert.equal(b.parByPhase.length, 2 * b.P);
    assert.equal(b.parByPhase[0], b.par);
    assert.equal(b.splashPhase, S.splashPhaseOf(b.par, b.parByPhase, b.parGoldByPhase));
    if (b.splashPhase >= 1) {
      rows++;
      const k = b.splashPhase;
      assert.ok(b.parByPhase[k] >= b.par && b.parByPhase[k] <= b.par + 2, `${b.id} splash par`);
      const gap = b.parGoldByPhase[k] - b.parByPhase[k];
      assert.ok(gap >= 1 && gap <= 4, `${b.id} splash gap`);
      // The table row really is the board at that starting phase.
      assert.equal(S.distanceFrom(b, { pos: b.start, mask: 0, golden: false, moves: 0, phase: k }, false), b.parByPhase[k]);
    }
  }
  assert.ok(rows >= 100, `splashable tide boards ${rows}`);
  // Every Showdown voyage is splashable.
  for (let s = 0; s < 40; s++) for (const b of L.showdownBoards(s)) assert.ok(R.splashable(b), `${b.id} not splashable`);
});

test('library v3: every Deep board in the Quick Run pool carries an aha tag; the Trick Shot opener matches it', () => {
  for (let s = 0; s < 300; s++) {
    const run = L.pickRun(s, 'quick', { runsCompleted: 4, tideSeen: true });
    assert.equal(run.length, 2);
    const [trick, deep] = run;
    assert.equal(trick.slot, 'trick');
    assert.equal(deep.slot, 'treasure');
    assert.ok(deep.ahaTag, `${deep.id} has no aha tag`);
    const matched = L.poolOf(deep.P > 0 ? null : 'C', 'trick').some((b) => b.ahaTag === deep.ahaTag);
    if (matched) assert.equal(trick.ahaTag, deep.ahaTag, `${trick.id} vs ${deep.id}`);
  }
});

test('library: teach boards are unsolvable without their verb', () => {
  const t1 = CQ_LIBRARY.find((b) => b.id === 'T1');
  const t2 = CQ_LIBRARY.find((b) => b.id === 'T2');
  assert.ok(t1 && t2);
  assert.equal(S.solveBoard({ ...t1, tiles: t1.tiles.replace(/[\^>v<]/g, '#') }).solvable, false, 'T1 needs currents');
  assert.equal(S.solveBoard({ ...t2, P: 0 }).solvable, false, 'T2 needs the tide');
  assert.ok(t1.teach && t2.teach);
});

test('library: pickRun is deterministic, scored contexts ignore progress and use the coin pool; Quick Run is Trick Shot + Deep', () => {
  const a = L.pickRun(123456, 'ride', { runsCompleted: 0, tideSeen: false });
  const b = L.pickRun(123456, 'ride', { runsCompleted: 9, tideSeen: true });
  assert.deepEqual(plain(a.map((x) => x.id)), plain(b.map((x) => x.id)));
  assert.deepEqual(plain(a.map((x) => x.slot)), ['trick', 'standard', 'treasure']);
  assert.deepEqual(plain(a.map((x) => R.heightOf(x))), [5, 6, 7]);
  assert.equal(a[0].P, 0, 'the coin opener never brings tide');
  for (const x of a) assert.ok(L.boardById(x.id).coin, `${x.id} not coin`);
  for (const x of a) assert.ok(R.transformAllowed(R.transformOf(x.id), R.heightOf(x)), `${x.id} transform`);
  assert.notDeepEqual(plain(L.pickRun(1, 'line').map((x) => x.id)), plain(L.pickRun(2, 'line').map((x) => x.id)));
  assert.equal(L.voyagesFor('quick'), 2);
  assert.equal(L.voyagesFor('ride'), 3);
  assert.equal(L.voyagesFor('daily'), 3);
  assert.equal(L.voyagesFor('showdown'), 3);
  assert.equal(L.voyagesFor('chart'), 1);
  const first = L.pickRun(5, 'quick', { runsCompleted: 0, tideSeen: false });
  assert.equal(first.length, 2);
  assert.equal(first[0].id, 'T1');
  assert.equal(first[1].P, 0);
  assert.equal(first[1].slot, 'treasure');
  const second = L.pickRun(5, 'quick', { runsCompleted: 1, tideSeen: false });
  assert.equal(second[1].id, 'T2');
  assert.equal(second[0].P, 0);
  const later = L.pickRun(5, 'quick', { runsCompleted: 4, tideSeen: true });
  assert.equal(later.length, 2);
  assert.ok(later[0].slot === 'trick' && later[1].P > 0 && later[1].slot === 'treasure' && R.heightOf(later[1]) === 7);
  for (let s = 0; s < 200; s++) for (const x of L.pickRun(s, 'quick', { runsCompleted: 4, tideSeen: true })) {
    assert.ok(R.transformAllowed(R.transformOf(x.id), R.heightOf(x)), `${x.id} transform on 5x${R.heightOf(x)}`);
    assert.ok(!L.boardById(x.id).retired, `${x.id} retired`);
  }
  // Daily Tide: Trick Shot + Standard + Deep, from the date and park alone.
  const d1 = L.pickRun(L.dailySeed('park-a', '2026-10-01'), 'daily');
  const d2 = L.pickRun(L.dailySeed('park-a', '2026-10-01'), 'daily', { runsCompleted: 0, tideSeen: false });
  assert.deepEqual(plain(d1.map((x) => x.id)), plain(d2.map((x) => x.id)));
  assert.deepEqual(plain(d1.map((x) => x.slot)), ['trick', 'standard', 'treasure']);
  assert.notDeepEqual(plain(d1.map((x) => x.id)), plain(L.pickRun(L.dailySeed('park-a', '2026-10-02'), 'daily').map((x) => x.id)));
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

test('rules (0.A.4): Trial undo rewinds and keeps the stroke spent; restart is free and keeps the budget; a ring is +2 at any time; 0 rings stalled fails', () => {
  const b = mk(['S....', '.....', '..T..', '.....', 'p...G', '.....'], 0, { slot: 'standard' });
  const limit = R.limitFor(b, R.RIDE_KNOBS);
  assert.equal(limit, Math.max(b.par + 4, b.parGold + 2), 'Trial slack +4 on Standard');
  let run = R.createRun([b], R.RIDE_KNOBS);
  assert.equal(run.rings, 2);
  run = R.applyAction(run, Rt).run;
  const u = R.applyAction(run, UNDO);
  assert.equal(u.events[0].refunded, false);
  run = u.run;
  assert.equal(run.voyage.strokes, 0);
  assert.equal(run.voyage.spent, 1);
  run = R.applyAction(run, Rt).run;
  run = R.applyAction(run, Rt).run;
  const rs0 = R.applyAction(run, RESTART);
  assert.ok(rs0.ok);
  assert.equal(rs0.run.rings, 2, 'restart is free');
  assert.equal(rs0.run.voyage.spent, 3, 'strokes stay spent');
  assert.equal(rs0.run.voyage.pos, b.start);
  run = rs0.run;
  // A ring any time (not only at a stall): +2 strokes, forfeits Par.
  const early = R.applyAction(run, CONT);
  assert.ok(early.ok, 'ring while not stalled');
  assert.equal(early.events[0].fromStall, false);
  assert.equal(early.run.rings, 1);
  assert.equal(R.strokesLeft(early.run), limit + 2 - 3);
  run = early.run;
  let i = 0;
  while (!run.voyage.stalled) run = R.applyAction(run, i++ % 2 ? Lf : Rt).run;
  assert.equal(R.applyAction(run, UNDO).ok, false, 'trial undo while stalled');
  assert.equal(R.applyAction(run, RESTART).ok, false, 'trial restart while stalled');
  const c = R.applyAction(run, CONT);
  assert.ok(c.ok);
  assert.equal(c.events[0].fromStall, true);
  assert.equal(c.run.rings, 0);
  assert.equal(c.run.voyage.stalled, false);
  assert.equal(R.strokesLeft(c.run), 2);
  assert.equal(R.applyAction(c.run, CONT).ok, false, 'no ring left');
  const r3 = R.applyAction(R.applyAction(c.run, Rt).run, Lf).run;
  assert.equal(r3.failed, true, 'stall with 0 rings fails the run');
  assert.equal(R.applyAction(r3, CONT).ok, false);
  // A Puzzle run never takes a ring.
  assert.equal(R.applyAction(R.createRun([b], R.PUZZLE_KNOBS), CONT).ok, false);
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

test('rules (0.A.4): a Trial tip costs 1 ring and no strokes, is refused at 0 rings and forfeits Par; Puzzle tips cost only Par', () => {
  const b = mk(['S....', '.....', '..T..', '.....', 'p...G'], 0, { slot: 'trick' });
  const sol = S.solveBoard(b);
  let run = R.createRun([b], R.RIDE_KNOBS);
  const t1 = R.applyAction(run, TIP);
  assert.ok(t1.ok);
  assert.equal(t1.events[0].ring, true);
  assert.equal(t1.run.rings, 1, 'a tip uses a ring');
  assert.equal(t1.run.voyage.spent, 0, 'no stroke cost');
  run = R.applyAction(t1.run, TIP).run;
  assert.equal(run.rings, 0);
  assert.equal(R.tipAllowed(run), false);
  assert.equal(R.applyAction(run, TIP).ok, false, 'refused at 0 rings');
  for (const a of sol.solution) run = R.applyAction(run, a).run;
  assert.equal(run.complete, true);
  assert.equal(run.results[0].shellPar, false);
  assert.equal(run.results[0].tips, 2);
  let p = R.createRun([b], R.PUZZLE_KNOBS);
  p = R.applyAction(p, TIP).run;
  assert.equal(p.voyage.spent, 0);
  assert.equal(p.rings, 0);
  assert.equal(R.tipAllowed(p), true, 'Puzzle tips are always offered');
  for (const a of sol.solution) p = R.applyAction(p, a).run;
  assert.equal(p.results[0].shellPar, false);
  assert.equal(p.results[0].tips, 1);
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
  // Trial (0.A.4 silent mercy): the slip keeps Par AND refunds the stroke.
  r = play(b, [wrong, UNDO, ...sol.solution], R.RIDE_KNOBS, [1000, 1800, ...sol.solution.map((_, i) => 4000 + i * 800)]);
  assert.equal(r.events.find((e) => e.type === 'undo').refunded, true);
  assert.equal(r.run.results[0].shellPar, true);
  assert.equal(r.run.results[0].spent, sol.par);
  // A later Trial undo keeps the stroke spent.
  r = play(b, [wrong, UNDO, wrong, UNDO, ...sol.solution], R.RIDE_KNOBS, [1000, 1400, 4000, 9000, ...sol.solution.map((_, i) => 12000 + i * 800)]);
  assert.deepEqual(plain(r.events.filter((e) => e.type === 'undo').map((e) => e.refunded)), [true, false]);
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

test('rules: undo across a tide flip restores the tide', () => {
  const b = mk(['.....', 'S....', '.....', 'p...T', '....G'], 2, {});
  let run = R.createRun([b], R.PUZZLE_KNOBS);
  run = R.applyAction(run, Rt).run;
  run = R.applyAction(run, Rt).run;
  assert.equal(R.tideAt(b.P, run.voyage.moves, run.voyage.phase), R.TIDE_LOW);
  const u = R.applyAction(run, UNDO);
  assert.equal(u.events[0].tideBefore, R.TIDE_LOW);
  assert.equal(u.events[0].tideAfter, R.TIDE_HIGH);
});

function splashBoard() {
  // A tide board with a phase table, as the library writes it.
  const b = mk(['.....', 'S>>s.', '.#...', 'p...T', '..G..'], 2, { slot: 'standard' });
  const t = S.phaseTable(b);
  return { ...b, parByPhase: t.parByPhase, parGoldByPhase: t.parGoldByPhase, splashPhase: S.splashPhaseOf(b.par, t.parByPhase, t.parGoldByPhase) };
}

test('rules (R1): a Splash is a voyage-start parameter from the phase table; action 8 is gone', () => {
  const lib = LIVE.filter((x) => R.splashable(x));
  assert.ok(lib.length > 50);
  for (const b of lib.slice(0, 40)) {
    const k = b.splashPhase;
    const run = R.createRun([b], R.PUZZLE_KNOBS, [{ id: 'sp1', blocked: 0, by: null }]);
    assert.equal(run.voyage.phase, k);
    assert.equal(run.voyage.parT, b.parByPhase[k]);
    assert.equal(run.voyage.parGoldT, b.parGoldByPhase[k]);
    assert.equal(run.voyage.limit, R.limitOf(b.parByPhase[k], b.parGoldByPhase[k], b.slot, R.PUZZLE_KNOBS));
    assert.ok(run.voyage.parT >= b.par && run.voyage.parT <= b.par + 2, 'never easier, at most +2');
    // The splashed board clears at its row's par on the solver route from that phase.
    let r = run;
    let guard = 0;
    while (!r.complete && guard++ < 30) r = R.applyAction(r, S.hintFrom(b, r.voyage, 1, 0)[0]).run;
    assert.equal(r.complete, true, b.id);
    assert.equal(r.results[0].strokes, b.parByPhase[k], `${b.id} splashed par`);
    assert.equal(r.results[0].shellPar, true);
    assert.equal(r.results[0].splashed, true);
    // A blocked Splash (Shield or counter) starts at phase 0.
    const blocked = R.createRun([b], R.PUZZLE_KNOBS, [{ id: 'sp1', blocked: 1, by: 'shield' }]);
    assert.equal(blocked.voyage.phase, 0);
    assert.equal(blocked.voyage.parT, b.par);
  }
  // Undo and restart never remove a Splash: it is the voyage's starting state.
  const b = lib[0];
  let run = R.createRun([b], R.PUZZLE_KNOBS, [{ id: 'x', blocked: 0, by: null }]);
  const a = S.hintFrom(b, run.voyage, 1, 0)[0];
  run = R.applyAction(run, a).run;
  run = R.applyAction(run, RESTART).run;
  assert.equal(run.voyage.phase, b.splashPhase);
  assert.equal(R.applyAction(run, SPLASH).ok, false, 'action 8 is illegal');
  // A Splash on a board without a table, or with P = 0, changes nothing.
  const flat = mk(['S.G..', '.....', '..T..', '.....', 'p....']);
  assert.equal(R.createRun([flat], R.PUZZLE_KNOBS, [{ id: 'x', blocked: 0, by: null }]).voyage.phase, 0);
});

test('rules (R1): queueSplash only lands on a voyage that has not started; one per voyage', () => {
  const sb = splashBoard();
  assert.ok(R.splashable(sb), 'test board is splashable');
  const boards = [sb, sb];
  let run = R.createRun(boards, R.PUZZLE_KNOBS);
  const q1 = R.queueSplash(run, 1, { id: 'a', blocked: 0, by: null });
  assert.ok(q1.ok);
  assert.equal(R.queueSplash(q1.run, 1, { id: 'b', blocked: 0, by: null }).ok, false, 'one per voyage');
  run = R.applyAction(q1.run, S.hintFrom(sb, q1.run.voyage, 1, 0)[0]).run;
  assert.equal(R.queueSplash(run, 0, { id: 'c', blocked: 0, by: null }).ok, false, 'never mid-voyage');
  while (run.index === 0) run = R.applyAction(run, S.hintFrom(sb, run.voyage, 1, 0)[0]).run;
  assert.equal(run.voyage.phase, sb.splashPhase, 'lands at the next voyage start');
  // The current voyage can still take one while nothing is recorded on it.
  const fresh = R.createRun(boards, R.PUZZLE_KNOBS);
  const q0 = R.queueSplash(fresh, 0, { id: 'd', blocked: 0, by: null });
  assert.ok(q0.ok);
  assert.equal(q0.run.voyage.phase, sb.splashPhase);
});

test('rules (0.A.7): goldenAt records the stroke that banked the golden pearl and rewinds with undo', () => {
  const b = mk(['S.G..', '.....', '..T..', '.....', 'p....']);
  let run = R.createRun([b], R.PUZZLE_KNOBS);
  run = R.applyAction(run, Rt).run;
  run = R.applyAction(run, Rt).run;
  assert.equal(run.voyage.goldenAt, 2);
  run = R.applyAction(run, UNDO).run;
  assert.equal(run.voyage.goldenAt, 0);
  assert.equal(run.voyage.golden, false);
});

// ---------------------------------------------------------------------------
// Scoring (3.5, 3.6)

test('scoring: shells, stars, Haul (never shown) and golden reach', () => {
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
  const b = LIVE.find((x) => x.slot === 'treasure' && !x.teach);
  const sol = S.solveBoard(b);
  let run = R.createRun([b], R.PUZZLE_KNOBS);
  for (const a of sol.solutionGold) run = R.applyAction(run, a).run;
  const r = run.results[0];
  assert.equal(r.shells, 3);
  // v7.1: the built v5 formula, no Riptide term (0.A.1).
  assert.equal(r.haul, 50 * b.pearls.length + 200 + 40 * (R.limitFor(b, R.PUZZLE_KNOBS) - b.parGold));
  assert.equal(R.haulOf(run.results), r.haul);
  assert.ok(r.goldenAt >= 1 && r.goldenAt <= b.parGold);
  assert.equal(R.goldenReach(run.results), r.goldenAt);
  assert.ok(r.medal >= 3);
  // Author = Gold AND Riptide strokes >= authorRiptide (riptide never touches Haul).
  assert.equal(r.medal === 4, r.ripStrokes >= b.authorRiptide);
  // Golden reach: a voyage that never banked the pearl counts limit + 1.
  let plainRun = R.createRun([b], R.PUZZLE_KNOBS);
  for (const a of sol.solution) plainRun = R.applyAction(plainRun, a).run;
  if (!plainRun.results[0].shellGolden) assert.equal(R.goldenReach(plainRun.results), plainRun.results[0].limit + 1);
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
  for (const b of LIVE.slice(0, 60)) {
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
// Proof v3 (15.3, 16)

function solvedProof(boards, knobs, context = 'line', sps = null) {
  let run = R.createRun(boards, knobs, sps || undefined);
  let t = 0;
  const voyages = [];
  boards.forEach((b, vi) => {
    const ready = t + 400;
    t = ready + 2000;
    const a = [];
    const ts = [];
    let guard = 0;
    while (run.index === vi && !run.complete && guard++ < 40) {
      const act = S.hintFrom(b, run.voyage, 1, Infinity)[0];
      run = R.applyAction(run, act, t).run;
      a.push(act);
      ts.push(t);
      t += 700;
    }
    voyages.push({ id: b.id.split('~')[0], tf: R.transformOf(b.id), sp: sps ? sps[vi] : null, a, t: ts, ready });
  });
  const shells = R.totalShells(run.results);
  return { game: 'current', v: 3, context, profile: knobs.profile, rings: knobs.rings, seed: 1, haul: R.haulOf(run.results), stars: R.starsFor(shells, run.complete, boards.length), shells, elapsed_ms: t + 500, banked: null, voyages };
}

test('proof v3: a real Trial run verifies; tampering is rejected', () => {
  const boards = L.pickRun(99, 'line');
  const proof = solvedProof(boards, R.LINE_BONUS_KNOBS);
  const ok = R.verifyProof(boards, R.LINE_BONUS_KNOBS, proof);
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(ok.shells, 9);
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, { ...proof, haul: proof.haul + 40 }).reason, 'claim');
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, { ...proof, v: 2 }).reason, 'version');
  const badAct = JSON.parse(JSON.stringify(proof));
  badAct.voyages[1].a[0] = (badAct.voyages[1].a[0] + 2) % 4;
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, badAct).ok, false);
  const nonMono = JSON.parse(JSON.stringify(proof));
  nonMono.voyages[1].t[2] = nonMono.voyages[1].t[1] - 5;
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, nonMono).reason, 'monotonic');
  const fast = JSON.parse(JSON.stringify(proof));
  fast.voyages[1].t[2] = fast.voyages[1].t[1] + 100;
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, fast).reason, 'interval');
  const think = JSON.parse(JSON.stringify(proof));
  think.voyages[2].t[0] = think.voyages[2].ready + 300;
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, think).reason, 'think-floor');
  const bot = JSON.parse(JSON.stringify(proof));
  for (const v of bot.voyages) v.t = v.t.map((x, i) => v.t[0] + i * 200);
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, bot).reason, 'median');
  assert.equal(R.verifyProof(L.pickRun(98, 'line'), R.LINE_BONUS_KNOBS, proof).reason, 'board');
  assert.equal(R.verifyProof(boards, R.PUZZLE_KNOBS, proof).reason, 'profile');
  // Action 8 anywhere is rejected.
  const eight = JSON.parse(JSON.stringify(proof));
  eight.voyages[0].a.splice(1, 0, 8);
  eight.voyages[0].t.splice(1, 0, eight.voyages[0].t[0] + 400);
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, eight).reason, 'splash-action');
  // A Trial voyage never carries a Splash.
  const trialSp = JSON.parse(JSON.stringify(proof));
  trialSp.voyages[1].sp = { id: 'x', blocked: 0, by: null };
  assert.equal(R.verifyProof(boards, R.LINE_BONUS_KNOBS, trialSp).reason, 'splash-trial');
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

test('proof v3: Trial ring and tip actions replay with their ring cost; 7 or 9 with no ring left is rejected', () => {
  const boards = L.pickRun(4242, 'ride');
  const base = solvedProof(boards, R.RIDE_KNOBS, 'ride');
  const p = JSON.parse(JSON.stringify(base));
  const v = p.voyages[1];
  // Ring (+2) then a tip (a ring) before the first stroke: both legal, Par forfeited.
  v.a = [7, 9, ...v.a];
  v.t = [v.t[0], v.t[0] + 400, ...v.t.map((x) => x + 800)];
  for (const w of p.voyages.slice(2)) { w.ready += 800; w.t = w.t.map((x) => x + 800); }
  p.elapsed_ms += 800;
  let run = R.createRun(boards, R.RIDE_KNOBS);
  for (const w of p.voyages) w.a.forEach((a, k) => { run = R.applyAction(run, a, w.t[k]).run; });
  p.shells = R.totalShells(run.results);
  p.haul = R.haulOf(run.results);
  p.stars = R.starsFor(p.shells, true, 3);
  const ok = R.verifyProof(boards, R.RIDE_KNOBS, p);
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(ok.run.rings, 0);
  assert.equal(ok.run.results[1].shellPar, false);
  // A third ring action with no ring left is illegal.
  const q = JSON.parse(JSON.stringify(p));
  q.voyages[2].a = [7, ...q.voyages[2].a];
  q.voyages[2].t = [q.voyages[2].t[0] - 50, ...q.voyages[2].t];
  assert.match(R.verifyProof(boards, R.RIDE_KNOBS, q).reason, /^illegal|think-floor|interval/);
});

test('proof v3: Splash starts (sp) replay; a counter needs a verified Par on the previous voyage; unissued ids are rejected', () => {
  const boards = L.showdownBoards(31337);
  const knobs = { ...R.PUZZLE_KNOBS, showdown: true };
  const sps = [null, { id: 'sd:1', blocked: 0, by: null }, { id: 'sd:2', blocked: 1, by: 'counter' }];
  const proof = solvedProof(boards, knobs, 'showdown', sps);
  const ok = R.verifyProof(boards, knobs, proof);
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(ok.run.results[1].splashed, true);
  assert.equal(ok.run.results[1].par, boards[1].parByPhase[boards[1].splashPhase]);
  assert.equal(ok.run.results[2].splashed, false, 'a counter starts at phase 0');
  // Issuance check (server log): an id it never issued fails.
  assert.equal(R.verifyProof(boards, knobs, proof, { issued: (vi, sp) => sp.id !== 'sd:1' }).reason, 'splash-issue');
  // A counter on the first voyage (no previous Par) is rejected.
  const bad = JSON.parse(JSON.stringify(proof));
  bad.voyages[0].sp = { id: 'sd:0', blocked: 1, by: 'counter' };
  assert.equal(R.verifyProof(boards, knobs, bad).reason, 'counter');
  // An unblocked Splash with a `by` is malformed.
  const odd = JSON.parse(JSON.stringify(proof));
  odd.voyages[1].sp = { id: 'sd:1', blocked: 0, by: 'shield' };
  assert.equal(R.verifyProof(boards, knobs, odd).reason, 'splash');
});

test('proof v3: a failed Trial posts a verified partial proof (R8 banked voyages)', () => {
  const boards = L.pickRun(5150, 'ride');
  let run = R.createRun(boards, R.RIDE_KNOBS);
  const voyages = [];
  let t = 0;
  // Clear voyage 0 at par, then burn every stroke and ring on voyage 1.
  for (let vi = 0; vi < 2 && !run.failed; vi++) {
    const ready = t + 400; t = ready + 2000;
    const a = []; const ts = [];
    let guard = 0;
    while (run.index === vi && !run.failed && guard++ < 60) {
      let act;
      if (vi === 0) act = S.hintFrom(boards[vi], run.voyage, 1, Infinity)[0];
      else if (run.voyage.stalled) act = 7;
      else act = [0, 1, 2, 3].find((d) => R.previewFor(run, d).valid && !R.previewFor(run, d).clears);
      run = R.applyAction(run, act, t).run; a.push(act); ts.push(t); t += 700;
    }
    voyages.push({ id: boards[vi].id.split('~')[0], tf: R.transformOf(boards[vi].id), sp: null, a, t: ts, ready });
  }
  voyages.push({ id: boards[2].id.split('~')[0], tf: R.transformOf(boards[2].id), sp: null, a: [], t: [], ready: t + 400 });
  assert.equal(run.failed, true);
  const proof = { game: 'current', v: 3, context: 'ride', profile: 'trial', rings: 2, seed: 1, haul: 0, stars: 0, shells: R.totalShells(run.results), elapsed_ms: t + 500, banked: null, failed: true, voyages };
  const v = R.verifyProof(boards, R.RIDE_KNOBS, proof);
  assert.equal(v.ok, true, v.reason);
  assert.equal(v.run.results.length, 1);
  assert.equal(R.verifyProof(boards, R.RIDE_KNOBS, { ...proof, shells: proof.shells + 1 }).reason, 'claim');
});

// ---------------------------------------------------------------------------
// Parity vectors (shared with the PHP verifier)

test('parity: vectors.v3.json replays exactly', () => {
  const file = path.join(root, 'tools/current-quest/vectors.v3.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(data.vectors.length >= 390, `${data.vectors.length} vectors`);
  const knobsOf = (p) => ({ puzzle: R.PUZZLE_KNOBS, ride: R.RIDE_KNOBS, line: R.LINE_BONUS_KNOBS }[p]);
  for (const v of data.vectors) {
    const boards = v.inline ? v.inline : L.boardsFromRefs(v.boards);
    let run = R.createRun(boards, { ...knobsOf(v.knobs), showdown: !!v.showdown }, v.sp || undefined);
    const accepted = [];
    v.actions.forEach((a, k) => {
      const res = R.applyAction(run, a, v.times ? v.times[k] : undefined);
      accepted.push(res.ok ? (res.recorded ? 1 : 2) : 0);
      if (res.ok) run = res.run;
    });
    const got = { accepted, index: run.index, pos: run.voyage.pos, mask: run.voyage.mask, golden: run.voyage.golden, strokes: run.voyage.strokes, spent: run.voyage.spent, moves: run.voyage.moves, phase: run.voyage.phase, rings: run.rings, failed: run.failed, complete: run.complete, beached: run.voyage.beached, stalled: run.voyage.stalled, shells: R.totalShells(run.results), haul: R.haulOf(run.results), undos: run.voyage.undos, slipUsed: run.voyage.slipUsed, tips: run.voyage.tips, ripStrokes: run.voyage.ripStrokes, goldenAt: run.voyage.goldenAt, parT: run.voyage.parT, limit: run.voyage.limit, reach: R.goldenReach(run.results) };
    assert.deepEqual(plain(got), v.expect, `vector ${v.name}`);
  }
});

// ---------------------------------------------------------------------------
// Presentation logic (pure): motion timeline, FX governor, subtitle table

const M = loadTs('src/games/current-quest/motion.ts');
const G = loadTs('src/games/current-quest/fxGovernor.ts');
const T = loadTs('src/games/current-quest/themeSubtitle.ts');

test('motion (J6): a carry grabs for 80 ms, rides the 110/90/75/65 curve, overshoots toward the blocker and settles', () => {
  assert.deepEqual([1, 2, 3, 4, 6].map((k) => M.carryTime(k)), [110, 200, 275, 340, 470]);
  assert.equal(M.carryProgress(110, 5), 1);
  assert.equal(M.carryProgress(155, 5), 1.5);
  assert.equal(M.carryProgress(9999, 3), 3);
  const pts = [0, 0, 100, 0, 200, 0, 300, 0];
  const plan = { kind: M.PLAN_STROKE, t0: 0, pts, carry: 2, facing: 1, dive: 0, beached: 0, wasBeached: 0, bx: 0, by: 0, speed: 1, rip: 0 };
  const f = M.newFrame();
  M.evalShark(plan, M.T_ANTIC + M.T_TRAVEL, 0, f);
  assert.ok(Math.abs(f.x - 100) < 1);
  M.evalShark(plan, M.T_ANTIC + M.T_TRAVEL + M.T_GRAB + 110 + 45, 0, f);
  assert.ok(Math.abs(f.x - 250) < 1, `mid ride x ${f.x}`);
  assert.equal(f.pose, M.POSE_SURF, 'every carry rides in the surf pose');
  assert.equal(f.carrying, 1);
  assert.ok(f.sx > 1.2, 'stretch along travel holds near 1.25');
  assert.equal(f.roll, 1, 'no corkscrew on an ordinary carry');
  const rip = { ...plan, carry: 2, rip: 1 };
  M.evalShark(rip, M.T_ANTIC + M.T_TRAVEL + M.T_GRAB + 110, 0, f);
  assert.ok(f.roll < 1, 'Riptide strokes corkscrew');
  M.evalShark(plan, M.T_ANTIC + M.T_TRAVEL + M.T_GRAB + M.carryTime(2) + 10, 0, f);
  assert.ok(f.x > 300, 'overshoot past the last tile toward the blocker');
  M.evalShark(plan, M.planDuration(plan) + 5, 0, f);
  assert.ok(Math.abs(f.x - 300) < 0.5);
  assert.equal(f.done, true);
  assert.equal(M.planDuration(plan), M.T_ANTIC + M.T_TRAVEL + M.T_GRAB + M.carryTime(2) + M.T_SPIT);
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

test('showdown: 3 seeded tide voyages, deterministic crew that finishes inside 210 s, rank key with no time', () => {
  const boards = SD.showdownBoards(777);
  assert.equal(boards.length, 3);
  assert.deepEqual(plain(boards.map((b) => b.slot)), ['standard', 'standard', 'treasure']);
  assert.ok(boards.every((b) => b.P > 0 && R.splashable(b)));
  assert.equal(SD.SHOWDOWN_WINDOW_MS, 210000);
  const a = SD.crewOnlyRoom(777);
  const b = SD.crewOnlyRoom(777);
  for (const seat of [1, 2, 3]) {
    const ra = SD.racerOf(a, seat);
    const rb = SD.racerOf(b, seat);
    assert.deepEqual(plain(ra.run.actions), plain(rb.run.actions), 'deterministic');
    assert.deepEqual(plain(ra.run.splashes), plain(rb.run.splashes));
    assert.equal(ra.run.complete, true, `${ra.name} finishes`);
    assert.ok(ra.times[ra.times.length - 1] < SD.SHOWDOWN_WINDOW_MS);
    // Replays through the same rules (with its Splash starts) to the same result.
    let run = R.createRun(boards, SD.SHOWDOWN_KNOBS, ra.run.splashes);
    ra.run.actions.forEach((acts) => acts.forEach((act) => { run = R.applyAction(run, act).run; }));
    assert.equal(R.totalShells(run.results), R.totalShells(ra.run.results));
  }
  const fin = { voyagesCleared: 3, shells: 7, strokes: 20, undos: 0, riptides: 1, goldenReach: 15, tempo: 20000, finished: true, finishedAt: 1 };
  assert.ok(SD.compareRacers(fin, { ...fin, shells: 6 }) < 0);
  assert.ok(SD.compareRacers(fin, { ...fin, strokes: 21 }) < 0);
  assert.ok(SD.compareRacers(fin, { ...fin, undos: 1 }) < 0);
  assert.ok(SD.compareRacers(fin, { ...fin, riptides: 0 }) < 0, 'Riptides desc (R4)');
  assert.ok(SD.compareRacers(fin, { ...fin, goldenReach: 16 }) < 0, 'golden reach asc (0.A.7)');
  assert.ok(SD.compareRacers({ ...fin, finished: false, voyagesCleared: 1 }, fin) > 0);
  assert.ok(SD.scoreOf(fin) > SD.scoreOf({ ...fin, strokes: 21 }));
  assert.ok(SD.scoreOf(fin) > SD.scoreOf({ ...fin, goldenReach: 17 }));
  // No time key anywhere: everything equal ties and shares a rank (DEAD HEAT), whatever the tempo.
  assert.equal(SD.compareRacers(fin, { ...fin, tempo: 1 }), 0);
  assert.equal(SD.scoreOf(fin), SD.scoreOf({ ...fin, tempo: 999999 }));
  assert.deepEqual(plain(SD.placesOf([{ p: fin }, { p: { ...fin, tempo: 5 } }, { p: { ...fin, strokes: 22 } }])), [1, 1, 3]);
});

test('showdown room (R2, 0.A.6): a Par clear aims a Splash; it lands only at the next voyage start; counter blocks instead of sending; never onto a last voyage', () => {
  const room = SD.createRoom(4242);
  const me = SD.racerOf(room, 0);
  const play = (seat, t0) => {
    const r = SD.racerOf(room, seat);
    const vi = r.run.index;
    const evs = [];
    let t = t0;
    let guard = 0;
    while (r.run.index === vi && !r.run.complete && guard++ < 40) {
      const act = S.hintFrom(room.boards[vi], r.run.voyage, 1, 0)[0];
      evs.push(...SD.roomApply(room, seat, act, t).room);
      t += 800;
    }
    return { evs, t };
  };
  // I clear voyage 0 at Par: an aim opens with every splashable racer.
  let res = play(0, 2000);
  const aim = res.evs.find((e) => e.type === 'aim');
  assert.ok(aim, 'aim offered');
  assert.deepEqual(plain(aim.options), [1, 2, 3]);
  const sent = SD.sendSplash(room, 0, 2, res.t, true);
  assert.equal(sent.type, 'sent');
  assert.equal(sent.chosen, true);
  assert.ok(SD.racerOf(room, 2).pending, 'the wave waits on the target chip');
  assert.deepEqual(plain(SD.splashableSeats(room, 0)), [1, 3], 'one Splash per voyage');
  // The target's current voyage is untouched; the Splash lands as its next voyage starts.
  const t2 = SD.racerOf(room, 2);
  assert.equal(t2.run.voyage.phase, 0);
  // Seat 2 clears voyage 0 but NOT at Par (an undo first): the Splash lands.
  SD.roomApply(room, 2, [0, 1, 2, 3].find((d) => R.previewFor(t2.run, d).valid), 2000);
  SD.roomApply(room, 2, 5, 4000); // past the 1.5 s slip window: Par is gone
  res = play(2, 4800);
  const landed = res.evs.find((e) => e.type === 'landed');
  assert.ok(landed, `landed: ${JSON.stringify(res.evs)}`);
  assert.equal(t2.run.voyage.phase, room.boards[1].splashPhase);
  assert.equal(landed.parTo, room.boards[1].parByPhase[room.boards[1].splashPhase]);
  assert.equal(t2.revenge, 0, 'revenge target set');
  // Seat 1 gets a Splash then clears at Par: the counter blocks it and no Splash is sent (never both).
  SD.sendSplash(room, 3, 1, 5000, true);
  res = play(1, 6000);
  const blocked = res.evs.find((e) => e.type === 'blocked');
  assert.ok(blocked && blocked.by === 'counter', JSON.stringify(res.evs));
  assert.equal(res.evs.some((e) => e.type === 'sent'), false);
  assert.equal(SD.racerOf(room, 1).run.voyage.phase, 0);
  assert.deepEqual(plain(SD.racerOf(room, 1).run.splashes[1]), { id: blocked.id, blocked: 1, by: 'counter' });
  // Auto target: revenge first.
  me.revenge = 3;
  assert.equal(SD.autoTarget(room, 0), 3);
  // A racer on its last voyage is never splashable.
  const r3 = SD.racerOf(room, 3);
  while (r3.run.index < 2) play(3, 20000 + r3.run.index * 10000);
  assert.equal(SD.splashableSeats(room, 0).includes(3), false);
});

test('showdown room (R3): First Find goes to the first bank of a voyage golden pearl and arms a Shield that absorbs the next Splash', () => {
  const room = SD.createRoom(9001);
  const b0 = room.boards[0];
  const gold = (seat, t0) => {
    const r = SD.racerOf(room, seat);
    let t = t0; const evs = [];
    let guard = 0;
    while (r.run.index === 0 && guard++ < 40) {
      const act = S.hintFrom(b0, r.run.voyage, 1, Infinity)[0];
      evs.push(...SD.roomApply(room, seat, act, t).room);
      t += 700;
    }
    return evs;
  };
  SD.sendSplash(room, 3, 0, 1000, true);
  const evs = gold(0, 2000);
  const ff = evs.find((e) => e.type === 'first-find');
  assert.ok(ff && ff.seat === 0);
  assert.equal(room.firstFind[0], 0);
  // Gold route clears at parGold: that is Par, so the counter (not the Shield) takes the incoming Splash.
  assert.ok(evs.some((e) => e.type === 'blocked' && e.by === 'counter'));
  assert.equal(SD.racerOf(room, 0).shield, true, 'Shield still up');
  // Seat 1 banks the same golden pearl later: no second First Find.
  const evs1 = gold(1, 5000);
  assert.equal(evs1.some((e) => e.type === 'first-find'), false);
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

// ---------------------------------------------------------------------------
// v7.1 presentation logic (pure): haptic density, Daily streak, Chart v0

const HAP = loadTs('src/games/current-quest/cqHaptics.ts', { '../../gamekit/Haptics': { firePrimitive: () => undefined } });
const PR = loadTs('src/games/current-quest/progress.ts', { '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => undefined } } });
const CH = loadTs('src/games/current-quest/chart.ts');

test('haptics (J15, P13): a scripted 10-tile Riptide carry schedules at most 3 haptics, none within 100 ms; heavy only on the golden pearl', () => {
  const grab = 0;
  const carry = M.carryTime(10);
  const spit = M.T_GRAB + carry + 40;
  for (const rip of [true, false]) {
    const plan = HAP.carryPlan(10, grab, M.T_GRAB + M.carryTime(5), spit, rip);
    assert.ok(plan.length <= 3, `${plan.length} haptics`);
    for (let k = 1; k < plan.length; k++) assert.ok(plan[k].at - plan[k - 1].at >= 100, `gap ${plan[k].at - plan[k - 1].at}`);
    assert.equal(plan.some((s) => s.p === 'heavy'), false);
  }
  // Spacing keeps the stronger of two colliding steps.
  assert.deepEqual(plain(HAP.spaceSteps([{ at: 0, p: 'selection' }, { at: 40, p: 'medium' }, { at: 90, p: 'light' }, { at: 200, p: 'light' }])),
    [{ at: 40, p: 'medium' }, { at: 200, p: 'light' }]);
  // The global gate drops anything within 100 ms of the last fired haptic.
  HAP.resetCqHaptics();
  assert.equal(HAP.cqFire('light', 1000), true);
  assert.equal(HAP.cqFire('light', 1050), false);
  assert.equal(HAP.cqFire('light', 1100), true);
  // Every heavy in the game's source sits on the golden pearl path only.
  const src = fs.readFileSync(path.join(root, 'src/games/current-quest/CurrentQuestGame.tsx'), 'utf8');
  assert.equal((src.match(/'heavy'|comboHeavy/g) || []).length, 0, 'the game calls heavy only through CQH.golden');
});

test('daily: streak ticks on consecutive days, holds on the same day, resets after a gap; first completion is the scored one', () => {
  assert.equal(PR.streakAfter(null, 0, '2026-10-01'), 1);
  assert.equal(PR.streakAfter('2026-10-01', 1, '2026-10-02'), 2);
  assert.equal(PR.streakAfter('2026-10-02', 2, '2026-10-02'), 2);
  assert.equal(PR.streakAfter('2026-10-02', 5, '2026-10-05'), 1);
  assert.equal(PR.liveStreak({ lastDaily: '2026-10-01', dailyStreak: 4 }, '2026-10-02'), 4);
  assert.equal(PR.liveStreak({ lastDaily: '2026-10-01', dailyStreak: 4 }, '2026-10-04'), 0);
  assert.equal(PR.dailyNumber('2026-10-01'), 1);
  assert.equal(PR.dailyNumber('2026-10-12'), 12);
  const e = { shells: 7, strokes: [3, 6, 8], pars: [3, 5, 7], grid: [[true, true, true], [true, true, false], [true, false, false]] };
  const a = PR.recordDaily({ ...PR.EMPTY_PROGRESS }, '2026-10-01', e);
  assert.equal(a.scored, true);
  const b = PR.recordDaily(a.next, '2026-10-01', { ...e, shells: 9 });
  assert.equal(b.scored, false, 'practice after the scored attempt');
  assert.equal(b.next.daily['2026-10-01'].shells, 7);
  assert.equal(b.next.dailyStreak, 1);
  assert.equal(PR.recordDaily(b.next, '2026-10-02', e).next.dailyStreak, 2);
  // NEW BEST only beats a stored best.
  const p = PR.withBest({ ...PR.EMPTY_PROGRESS }, 'quick', 4);
  assert.equal(PR.isNewBest({ ...PR.EMPTY_PROGRESS }, 'quick', 6), false);
  assert.equal(PR.isNewBest(p, 'quick', 5), true);
  assert.equal(PR.isNewBest(p, 'quick', 4), false);
});

test('chart v0: 24 nodes in 2 chapters, teach first, Deep last, live boards; chapter 2 opens after 10 clears; nodes open in order', () => {
  assert.equal(CH.CHART_V0.length, 2);
  for (const ch of CH.CHART_V0) {
    assert.equal(ch.nodes.length, 12, `${ch.name} nodes`);
    assert.equal(ch.nodes[0].boardId, ch.chapter === 1 ? 'T1' : 'T2');
    const last = L.boardById(ch.nodes[11].boardId);
    assert.equal(last.slot, 'treasure');
    assert.equal(new Set(ch.nodes.map((n) => n.boardId)).size, 12, 'no repeats');
    for (const n of ch.nodes) {
      const b = L.boardById(n.boardId);
      assert.ok(b && !b.retired, `${n.id} ${n.boardId}`);
      if (ch.chapter === 1) assert.equal(b.P, 0, `${n.id} has tide in chapter 1`);
    }
  }
  const medals = {};
  assert.equal(CH.chapterOpen(2, medals), false);
  assert.equal(CH.nodeOpen(CH.CHART_V0[0].nodes[1], medals), false);
  CH.CHART_V0[0].nodes.slice(0, 10).forEach((n) => { medals[n.id] = { medal: 1, shells: 1 }; });
  assert.equal(CH.chapterOpen(2, medals), true);
  assert.equal(CH.nodeOpen(CH.CHART_V0[0].nodes[10], medals), true);
  assert.equal(CH.markOf({ medal: 2, shells: 2 }), 'sketch');
  assert.equal(CH.markOf({ medal: 3, shells: 3 }), 'ink');
  assert.equal(CH.markOf(undefined), 'none');
});
