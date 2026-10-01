#!/usr/bin/env node
'use strict';
/**
 * Parity vectors v3 for the Current Quest rules (design v7.1 18.3, 0.A.15 G1).
 * Each vector is a run on library boards (ids + transforms) or inline boards,
 * a knob profile, optional per-voyage Splash starts (`sp`) and an action list
 * that mixes optimal strokes, wrong turns, bumps, undos (slips by time),
 * restarts, rings, tips and the retired action 8. `expect` is the final state
 * from rules.ts. The PHP verifier replays the same file; any mismatch fails
 * both suites.
 *
 *   node tools/current-quest/build-vectors.cjs
 *
 * 360 base cases (re-expected for Haul, goldenAt and the v7.1 Trial) plus the
 * explicit v7.1 vectors listed in 0.A.15 G1.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const R = loadTs('src/games/current-quest/rules.ts');
const S = loadTs('src/games/current-quest/solver.ts');
const L = loadTs('src/games/current-quest/library.ts');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KNOBS = { puzzle: R.PUZZLE_KNOBS, ride: R.RIDE_KNOBS, line: R.LINE_BONUS_KNOBS };
const CONTEXT = { puzzle: 'quick', ride: 'ride', line: 'line' };

function snapshot(run, accepted) {
  return {
    accepted, index: run.index, pos: run.voyage.pos, mask: run.voyage.mask, golden: run.voyage.golden,
    strokes: run.voyage.strokes, spent: run.voyage.spent, moves: run.voyage.moves, phase: run.voyage.phase,
    rings: run.rings, failed: run.failed, complete: run.complete, beached: run.voyage.beached,
    stalled: run.voyage.stalled, shells: R.totalShells(run.results), haul: R.haulOf(run.results),
    undos: run.voyage.undos, slipUsed: run.voyage.slipUsed, tips: run.voyage.tips, ripStrokes: run.voyage.ripStrokes,
    goldenAt: run.voyage.goldenAt, parT: run.voyage.parT, limit: run.voyage.limit, reach: R.goldenReach(run.results),
  };
}

function replay(boards, knobs, sp, actions, times) {
  let run = R.createRun(boards, knobs, sp || undefined);
  const accepted = [];
  actions.forEach((a, k) => {
    const res = R.applyAction(run, a, times ? times[k] : undefined);
    accepted.push(res.ok ? (res.recorded ? 1 : 2) : 0);
    if (res.ok) run = res.run;
  });
  return snapshot(run, accepted);
}

const vectors = [];
const r = rng(0xc0ffee + 3);

// ---------------------------------------------------------------------------
// 360 base cases

for (let n = 0; n < 360; n++) {
  const knobKey = ['puzzle', 'ride', 'line'][n % 3];
  const showdown = knobKey === 'puzzle' && n % 6 === 0;
  const seed = Math.floor(r() * 0xffffffff) >>> 0;
  const boards = showdown ? L.showdownBoards(seed) : L.pickRun(seed, CONTEXT[knobKey], { runsCompleted: 3, tideSeen: true });
  const knobs = { ...KNOBS[knobKey], showdown };
  // Showdown runs start some voyages splashed (some blocked by a Shield or a counter).
  const sp = showdown ? boards.map((_, i) => {
    if (i === 0) return null;
    const roll = r();
    return roll < 0.45 ? { id: `v${n}:${i}`, blocked: 0, by: null } : roll < 0.6 ? { id: `v${n}:${i}`, blocked: 1, by: 'shield' } : null;
  }) : null;
  let run = R.createRun(boards, knobs, sp || undefined);
  const actions = [];
  const times = [];
  const style = n % 5; // 0 perfect, 1 sloppy, 2 undo-heavy (slips), 3 stall-and-recover, 4 chaos
  let guard = 0;
  let t = 1000;
  while (!run.complete && !run.failed && guard++ < 90) {
    const board = R.currentBoard(run);
    const v = run.voyage;
    let a;
    const roll = r();
    if (v.stalled) {
      a = knobKey === 'puzzle' ? (roll < 0.6 ? 5 : 6) : (roll < 0.6 ? 7 : 6);
    } else if (style === 0) {
      a = S.hintFrom(board, v, 1, Infinity)[0];
    } else if (style === 1) {
      a = roll < 0.7 ? S.hintFrom(board, v, 1, Infinity)[0] : Math.floor(r() * (board.P ? 5 : 4));
    } else if (style === 2) {
      a = roll < 0.55 ? S.hintFrom(board, v, 1, Infinity)[0] : roll < 0.8 ? Math.floor(r() * 4) : 5;
    } else if (style === 3) {
      a = roll < 0.45 ? Math.floor(r() * 4) : roll < 0.5 ? 7 : S.hintFrom(board, v, 1, Infinity)[0];
    } else {
      a = roll < 0.4 ? S.hintFrom(board, v, 1, Infinity)[0] : Math.floor(r() * 10);
    }
    if (a === undefined) a = 6;
    // Engine-apply times: a quick undo right after a stroke is a slip (<= 1500 ms).
    t += a === 5 && r() < 0.5 ? 300 + Math.floor(r() * 1400) : 400 + Math.floor(r() * 2200);
    actions.push(a);
    times.push(t);
    const res = R.applyAction(run, a, t);
    if (res.ok) run = res.run;
  }
  vectors.push({
    name: `v${String(n).padStart(3, '0')}-${knobKey}${showdown ? '-showdown' : ''}-s${style}`,
    knobs: knobKey, showdown, seed, boards: L.boardRefs(boards), sp, actions, times, expect: replay(boards, knobs, sp, actions, times),
  });
}

// ---------------------------------------------------------------------------
// Explicit v7.1 vectors (0.A.15 G1)

function lib(id) { return L.boardById(id); }
const coinTrick = L.poolOf('C', 'trick', true)[0];
const coinStd = L.poolOf('CT', 'standard', true)[0];
const goldBoard = L.poolOf('C', 'treasure').find((b) => b.golden >= 0);
const trialBoards = [coinTrick, coinStd];
const sol = (b) => S.solveBoard(b);
function wrongFirst(b) {
  const good = sol(b).solution[0];
  const run = R.createRun([b], R.PUZZLE_KNOBS);
  return [0, 1, 2, 3].find((d) => d !== good && R.previewFor(run, d).valid);
}
function add(name, knobKey, boards, actions, times, sp = null, inline = false) {
  const knobs = KNOBS[knobKey];
  vectors.push({ name, knobs: knobKey, showdown: false, seed: 0, ...(inline ? { inline: boards } : { boards: L.boardRefs(boards) }), sp, actions, times, expect: replay(boards, knobs, sp, actions, times) });
}
const tt = (n, start = 2000, gap = 2000) => Array.from({ length: n }, (_, i) => start + i * gap);

{
  const b = coinTrick; const s = sol(b).solution; const w = wrongFirst(b);
  add('x01-trial-undo-keeps-stroke-spent', 'ride', [b], [w, 5, ...s], tt(2 + s.length));
  add('x02-trial-slip-refunds-once', 'ride', [b], [w, 5, ...s], [1000, 1900, ...tt(s.length, 4000)]);
  add('x03-trial-second-slip-not-refunded', 'ride', [b], [w, 5, w, 5, ...s], [1000, 1400, 2000, 2400, ...tt(s.length, 5000)]);
  add('x04-trial-slip-at-1501-not-refunded', 'ride', [b], [w, 5, ...s], [1000, 2501, ...tt(s.length, 4000)]);
  add('x05-ring-while-not-stalled', 'ride', [b], [7, ...s], tt(1 + s.length));
  add('x06-ring-at-0-rings-rejected', 'ride', [b], [7, 7, 7, ...s], tt(3 + s.length));
  add('x07-tip-costs-a-ring', 'ride', [b], [9, ...s], tt(1 + s.length));
  add('x08-tip-refused-at-0-rings', 'ride', [b], [9, 9, 9, ...s], tt(3 + s.length));
  add('x09-free-restart-keeps-strokes', 'ride', [b], [s[0], 6, ...s], tt(2 + s.length));
  add('x10-puzzle-restart-refunds', 'puzzle', [b], [s[0], 6, ...s], tt(2 + s.length));
  add('x11-puzzle-ring-rejected', 'puzzle', [b], [7, ...s], tt(1 + s.length));
  add('x12-puzzle-tip-forfeits-par-only', 'puzzle', [b], [9, ...s], tt(1 + s.length));
  add('x13-action-8-rejected', 'puzzle', [b], [8, ...s], tt(1 + s.length));
  add('x14-line-3-rings', 'line', [b], [7, 7, 7, 7, ...s], tt(4 + s.length));
}
{
  // Trial stall: burn the base limit, ring +2 at the stall, burn again, fail at 0 rings.
  const b = coinStd;
  let run = R.createRun([b], R.RIDE_KNOBS);
  const acts = [];
  let guard = 0;
  while (!run.failed && guard++ < 60) {
    let a;
    if (run.voyage.stalled) a = 7;
    else a = [0, 1, 2, 3].find((d) => { const pv = R.previewFor(run, d); return pv.valid && !pv.clears; });
    if (a === undefined) break;
    acts.push(a);
    run = R.applyAction(run, a).run;
  }
  add('x15-trial-stall-ring-then-fail', 'ride', [b], acts, tt(acts.length));
}
{
  const b = goldBoard; const g = sol(b).solutionGold;
  add('x16-goldenAt-replay', 'puzzle', [b], g, tt(g.length));
  add('x17-goldenAt-undo', 'puzzle', [b], [...g.slice(0, -1), 5, g[g.length - 1]], tt(g.length + 1));
  add('x18-haul-no-riptide-term', 'puzzle', [b], g, tt(g.length));
}
{
  // R1: a voyage-start Splash for every row k in 1..2P-1 of a test board (inline, splashPhase forced to k).
  const base = L.poolOf('CT', 'standard').find((b) => b.P === 4 && R.splashable(b)) || L.poolOf('CT', 'standard').find((b) => R.splashable(b));
  for (let k = 1; k < base.parByPhase.length; k++) {
    if (base.parByPhase[k] < 0 || base.parGoldByPhase[k] < 0) continue;
    const b = { ...base, id: `${base.id}`, splashPhase: k };
    const run0 = R.createRun([b], R.PUZZLE_KNOBS, [{ id: `k${k}`, blocked: 0, by: null }]);
    const acts = [];
    let run = run0;
    let guard = 0;
    while (!run.complete && guard++ < 30) { const a = S.hintFrom(b, run.voyage, 1, Infinity)[0]; acts.push(a); run = R.applyAction(run, a).run; }
    add(`x19-splash-row-${k}`, 'puzzle', [b], acts, tt(acts.length), [{ id: `k${k}`, blocked: 0, by: null }], true);
  }
  const b = L.showdownBoards(5)[0];
  const s = sol(b).solution;
  add('x20-shield-absorbs-at-start', 'puzzle', [b], s, tt(s.length), [{ id: 'sh', blocked: 1, by: 'shield' }]);
  add('x21-counter-starts-at-phase-0', 'puzzle', [b], s, tt(s.length), [{ id: 'ct', blocked: 1, by: 'counter' }]);
  add('x22-splash-survives-restart', 'puzzle', [b], [s[0], 6, ...s], tt(s.length + 2), [{ id: 'rs', blocked: 0, by: null }]);
  add('x23-splash-on-p0-board-no-effect', 'puzzle', [coinTrick], sol(coinTrick).solution, tt(sol(coinTrick).solution.length), [{ id: 'p0', blocked: 0, by: null }]);
  const sd = L.showdownBoards(77);
  const sdSp = [null, { id: 'a', blocked: 0, by: null }, { id: 'b', blocked: 0, by: null }];
  let run = R.createRun(sd, R.PUZZLE_KNOBS, sdSp);
  const acts = [];
  let guard = 0;
  while (!run.complete && guard++ < 80) { const a = S.hintFrom(R.currentBoard(run), run.voyage, 1, Infinity)[0]; acts.push(a); run = R.applyAction(run, a).run; }
  add('x24-showdown-two-splashed-voyages', 'puzzle', sd, acts, tt(acts.length), sdSp);
}
{
  // Trick Shot slack (+3 Puzzle, +3 Trial) and the 5x5 trick cell under every transform.
  const tb = L.poolOf('C', 'trick')[3];
  for (const tf of [0, 3, 6]) {
    const b = R.transformBoard(tb, tf);
    const s = sol(b).solution;
    add(`x25-trick-tf${tf}`, 'puzzle', [b], s, tt(s.length));
  }
  const tide = L.poolOf(null, 'trick').find((b) => b.P > 0);
  const s = sol(tide).solution;
  add('x26-trick-tide-wait', 'puzzle', [tide], s, tt(s.length));
}

const out = { version: 7, design: 'v7.1', generated: new Date().toISOString(), note: 'accepted: 1 recorded, 2 bump (ok, not recorded), 0 rejected; sp = per-voyage Splash starts; inline = boards given in full', vectors };
fs.writeFileSync(path.join(root, 'tools/current-quest/vectors.v3.json'), JSON.stringify(out));
const complete = vectors.filter((v) => v.expect.complete).length;
const failed = vectors.filter((v) => v.expect.failed).length;
process.stdout.write(`${vectors.length} vectors (${complete} complete, ${failed} failed, ${vectors.length - 360} explicit v7.1)\n`);
