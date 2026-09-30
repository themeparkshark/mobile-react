'use strict';
/**
 * Current Quest v2 (design v4): rules engine, solver, library, proof replay,
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
  assert.equal(t.length, 25);
  let start = -1; let chest = -1; let golden = -1; const pearls = []; let tiles = '';
  for (let i = 0; i < 25; i++) {
    const ch = t[i];
    if (ch === 'S') { start = i; tiles += '.'; } else if (ch === 'T') { chest = i; tiles += '.'; } else if (ch === 'p') { pearls.push(i); tiles += '.'; } else if (ch === 'P') { pearls.push(i); tiles += 's'; } else if (ch === 'q') { pearls.push(i); tiles += '>'; } else if (ch === 'G') { golden = i; tiles += '.'; } else tiles += ch;
  }
  const b = { id: 'x', name: 'x', slot: 'standard', set: P ? 'CT' : 'C', ruleset: 2, tiles, start, chest, pearls, golden, P, par: 0, parGold: 0, authorRiptide: 0, ...extra };
  const sol = S.solveBoard(b);
  return { ...b, par: extra.par ?? sol.par, parGold: extra.parGold ?? sol.parGold, authorRiptide: extra.authorRiptide ?? sol.authorRiptide };
}

function play(board, actions, knobs = R.PUZZLE_KNOBS) {
  let run = R.createRun([board], knobs);
  const events = [];
  for (const a of actions) {
    const res = R.applyAction(run, a);
    assert.ok(res.ok, `action ${a} rejected`);
    events.push(...res.events);
    run = res.run;
  }
  return { run, events };
}

const U = 0; const Rt = 1; const D = 2; const Lf = 3; const TREAD = 4; const UNDO = 5; const RESTART = 6; const CONT = 7; const SPLASH = 8; const TIP = 9;

// ---------------------------------------------------------------------------
// Library

test('library: every pool and teach board solves to its par and parGold under all 8 transforms', () => {
  assert.ok(CQ_LIBRARY.length >= 400, `library has ${CQ_LIBRARY.length} boards`);
  for (const b of CQ_LIBRARY) {
    for (let tf = 0; tf < 8; tf++) {
      const tb = R.transformBoard(b, tf);
      const sol = S.solveBoard(tb);
      assert.ok(sol.solvable, `${b.id}~${tf} unsolvable`);
      assert.equal(sol.par, b.par, `${b.id}~${tf} par`);
      assert.equal(sol.parGold, b.parGold, `${b.id}~${tf} parGold`);
    }
  }
});

test('library: filters hold (gap, limit, slots, riptide share, aha, no solutions, no loops, launch ruleset)', () => {
  const cells = {};
  for (const b of CQ_LIBRARY) {
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
});

test('library: teach boards are unsolvable without their verb', () => {
  const t1 = CQ_LIBRARY.find((b) => b.id === 'T1');
  const t2 = CQ_LIBRARY.find((b) => b.id === 'T2');
  assert.ok(t1 && t2);
  assert.equal(S.solveBoard({ ...t1, tiles: t1.tiles.replace(/[\^>v<]/g, '#') }).solvable, false, 'T1 needs currents');
  assert.equal(S.solveBoard({ ...t2, P: 0 }).solvable, false, 'T2 needs the tide');
  assert.ok(t1.teach && t2.teach);
});

test('library: pickRun is deterministic, scored contexts ignore progress and use the coin pool', () => {
  const a = L.pickRun(123456, 'ride', { runsCompleted: 0, tideSeen: false });
  const b = L.pickRun(123456, 'ride', { runsCompleted: 9, tideSeen: true });
  assert.deepEqual(plain(a.map((x) => x.id)), plain(b.map((x) => x.id)));
  assert.deepEqual(plain(a.map((x) => x.slot)), ['warmup', 'standard', 'treasure']);
  for (const x of a) assert.ok(L.boardById(x.id).coin, `${x.id} not coin`);
  assert.notDeepEqual(plain(L.pickRun(1, 'line').map((x) => x.id)), plain(L.pickRun(2, 'line').map((x) => x.id)));
  const first = L.pickRun(5, 'quick', { runsCompleted: 0, tideSeen: false });
  assert.equal(first[0].id, 'T1');
  assert.equal(first[1].P, 0);
  const second = L.pickRun(5, 'quick', { runsCompleted: 1, tideSeen: false });
  assert.equal(second[1].id, 'T2');
  const later = L.pickRun(5, 'quick', { runsCompleted: 4, tideSeen: true });
  assert.ok(later[1].P > 0 && later[2].P > 0 && later[0].P === 0);
  const refs = L.boardRefs(a);
  assert.deepEqual(plain(L.boardsFromRefs(refs).map((x) => x.tiles)), plain(a.map((x) => x.tiles)));
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

test('rules: Trial undo keeps the stroke spent, is refused while stalled; continue and restart cost rings; 0 rings stalled fails', () => {
  const b = mk(['S....', '.....', '..T..', '.....', 'p...G'], 0, { slot: 'standard' });
  const limit = R.limitFor(b, R.RIDE_KNOBS);
  let run = R.createRun([b], R.RIDE_KNOBS);
  assert.equal(run.rings, 2);
  run = R.applyAction(run, Rt).run;
  run = R.applyAction(run, UNDO).run;
  assert.equal(run.voyage.strokes, 0);
  assert.equal(run.voyage.spent, 1);
  for (let i = 1; i < limit; i++) run = R.applyAction(run, i % 2 ? Rt : Lf).run;
  assert.equal(run.voyage.stalled, true);
  assert.equal(R.applyAction(run, UNDO).ok, false, 'trial undo while stalled');
  const c = R.applyAction(run, CONT);
  assert.ok(c.ok);
  assert.equal(c.run.rings, 1);
  assert.equal(c.run.voyage.stalled, false);
  assert.equal(R.strokesLeft(c.run), 2);
  const rs = R.applyAction(c.run, RESTART);
  assert.equal(rs.run.rings, 0);
  assert.equal(rs.run.voyage.spent, 0);
  assert.equal(rs.run.voyage.limitBonus, 0);
  let r3 = rs.run;
  for (let i = 0; i < limit; i++) r3 = R.applyAction(r3, i % 2 ? Lf : Rt).run;
  assert.equal(r3.failed, true);
  assert.equal(R.applyAction(r3, RESTART).ok, false);
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

test('rules: Trial tips spend a ring and are refused at 0 rings; Puzzle tips cost nothing but Par', () => {
  const b = mk(['S....', '.....', '..T..', '.....', 'p...G'], 0);
  let run = R.createRun([b], R.RIDE_KNOBS);
  run = R.applyAction(run, TIP).run;
  run = R.applyAction(run, TIP).run;
  assert.equal(run.rings, 0);
  assert.equal(R.applyAction(run, TIP).ok, false);
  const sol = S.solveBoard(b);
  let p = R.createRun([b], R.PUZZLE_KNOBS);
  p = R.applyAction(p, TIP).run;
  for (const a of sol.solution) p = R.applyAction(p, a).run;
  assert.equal(p.results[0].shellPar, false);
  assert.equal(p.results[0].tips, 1);
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
  const b = CQ_LIBRARY.find((x) => x.slot === 'treasure' && !x.teach);
  const sol = S.solveBoard(b);
  let run = R.createRun([b], R.PUZZLE_KNOBS);
  for (const a of sol.solutionGold) run = R.applyAction(run, a).run;
  const r = run.results[0];
  assert.equal(r.shells, 3);
  assert.equal(r.treasure, 50 * b.pearls.length + 200 + 40 * (R.limitFor(b, R.PUZZLE_KNOBS) - b.parGold));
  assert.ok(r.medal >= 3);
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
      run = R.applyAction(run, act).run;
      a.push(act);
      ts.push(t);
      t += 700;
    }
    voyages.push({ id: b.id.split('~')[0], tf: R.transformOf(b.id), a, t: ts, ready });
  }
  const shells = R.totalShells(run.results);
  return { game: 'current', v: 2, context, profile: knobs.profile, rings: knobs.rings, seed: 1, treasure: R.treasureOf(run.results), stars: R.starsFor(shells, run.complete), shells, elapsed_ms: t + 500, voyages };
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
});

// ---------------------------------------------------------------------------
// Parity vectors (shared with the PHP verifier)

test('parity: vectors.v2.json replays exactly', () => {
  const file = path.join(root, 'tools/current-quest/vectors.v2.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(data.vectors.length >= 300, `${data.vectors.length} vectors`);
  const knobsOf = (p) => ({ puzzle: R.PUZZLE_KNOBS, ride: R.RIDE_KNOBS, line: R.LINE_BONUS_KNOBS }[p]);
  for (const v of data.vectors) {
    const boards = L.boardsFromRefs(v.boards);
    let run = R.createRun(boards, { ...knobsOf(v.knobs), showdown: !!v.showdown });
    const accepted = [];
    for (const a of v.actions) {
      const res = R.applyAction(run, a);
      accepted.push(res.ok ? (res.recorded ? 1 : 2) : 0);
      if (res.ok) run = res.run;
    }
    const got = { accepted, index: run.index, pos: run.voyage.pos, mask: run.voyage.mask, golden: run.voyage.golden, strokes: run.voyage.strokes, spent: run.voyage.spent, moves: run.voyage.moves, phase: run.voyage.phase, rings: run.rings, failed: run.failed, complete: run.complete, beached: run.voyage.beached, stalled: run.voyage.stalled, shells: R.totalShells(run.results), treasure: R.treasureOf(run.results) };
    assert.deepEqual(plain(got), v.expect, `vector ${v.name}`);
  }
});
