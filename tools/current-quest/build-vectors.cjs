#!/usr/bin/env node
'use strict';
/**
 * Parity vectors for the Current Quest rules (design 18.3). Each vector is a
 * run on library boards (ids + transforms), a knob profile and an action list
 * that mixes optimal strokes, wrong turns, bumps, undos, restarts, continues,
 * tips and (Showdown) splashes. `expect` is the final state from rules.ts.
 * The PHP verifier replays the same file; any mismatch fails both suites.
 *
 *   node tools/current-quest/build-vectors.cjs
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
    stalled: run.voyage.stalled, shells: R.totalShells(run.results), treasure: R.treasureOf(run.results),
    undos: run.voyage.undos, slipUsed: run.voyage.slipUsed, tips: run.voyage.tips, ripStrokes: run.voyage.ripStrokes,
  };
}

const vectors = [];
const r = rng(0xc0ffee);
for (let n = 0; n < 360; n++) {
  const knobKey = ['puzzle', 'ride', 'line'][n % 3];
  const showdown = knobKey === 'puzzle' && n % 6 === 0;
  const seed = Math.floor(r() * 0xffffffff) >>> 0;
  const boards = L.pickRun(seed, CONTEXT[knobKey], { runsCompleted: 3, tideSeen: true });
  const knobs = { ...KNOBS[knobKey], showdown };
  let run = R.createRun(boards, knobs);
  const actions = [];
  const times = [];
  const accepted = [];
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
      a = roll < 0.45 ? Math.floor(r() * 4) : S.hintFrom(board, v, 1, Infinity)[0];
    } else {
      a = roll < 0.4 ? S.hintFrom(board, v, 1, Infinity)[0] : Math.floor(r() * 10);
      if (a === 8 && !showdown) a = 4;
    }
    if (a === undefined) a = 6;
    // Engine-apply times: a quick undo right after a stroke is a slip (<= 1500 ms).
    t += a === 5 && r() < 0.5 ? 300 + Math.floor(r() * 1400) : 400 + Math.floor(r() * 2200);
    actions.push(a);
    times.push(t);
    const res = R.applyAction(run, a, t);
    accepted.push(res.ok ? (res.recorded ? 1 : 2) : 0);
    if (res.ok) run = res.run;
  }
  vectors.push({
    name: `v${String(n).padStart(3, '0')}-${knobKey}${showdown ? '-showdown' : ''}-s${style}`,
    knobs: knobKey, showdown, seed, boards: L.boardRefs(boards), actions, times, expect: snapshot(run, accepted),
  });
}

const out = { version: 5, design: 'v5', generated: new Date().toISOString(), note: 'accepted: 1 recorded, 2 bump (ok, not recorded), 0 rejected', vectors };
fs.writeFileSync(path.join(root, 'tools/current-quest/vectors.v2.json'), JSON.stringify(out));
const complete = vectors.filter((v) => v.expect.complete).length;
const failed = vectors.filter((v) => v.expect.failed).length;
process.stdout.write(`${vectors.length} vectors (${complete} complete, ${failed} failed)\n`);
