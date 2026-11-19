'use strict';
/**
 * Fix round w4 (lane play-kid) T051: a tap on a Beat the Buzzer tile is never swallowed.
 * Cause: a tile only took touches once React had re-rendered it face up ('up'), which lags the UI-thread
 * unlock (more under load), so a tap on a still-striped tile hit a disabled gesture and vanished with no sign
 * (walk-lc-new 176: a right answer lost). Now striped tiles are touchable and the question clock decides.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');

const G = loadTs('src/games/trivia-duel/engine/tapGate.ts');
const tile = fs.readFileSync('src/games/trivia-duel/ui/Tile.tsx', 'utf8');
const duel = fs.readFileSync('src/games/trivia-duel/TriviaDuel.tsx', 'utf8');
const { read, live, sub, locked, wait, idle } = G.TAP_PH;

test('T051: the clock gate: early before the tiles open, lock once they are, never a silent drop while open', () => {
  assert.equal(G.tileTapOutcome(read, 0, -400, false, 120), 'early');
  assert.equal(G.tileTapOutcome(live, 0, 40, false, 120), 'early', 'inside the 120 ms guard: a wiggle, the next tap counts');
  assert.equal(G.tileTapOutcome(live, 0, 121, false, 120), 'lock', 'the first tap after the guard locks, drawn or not');
  assert.equal(G.tileTapOutcome(live, 2, 500, false, 120), 'early', 'a bell round before the buzz says not yet');
  assert.equal(G.tileTapOutcome(sub, 2, 500, false, 120), 'sub');
  assert.equal(G.tileTapOutcome(live, 0, 900, true, 120), 'none', 'a chomped tile is gone');
  for (const ph of [locked, wait, idle]) assert.equal(G.tileTapOutcome(ph, 0, 900, false, 120), 'none');
});

test('T051: striped tiles take touches (the gate decides) and the board uses the gate', () => {
  assert.match(tile, /const live = \(state === 'up' \|\| state === 'down'\) && !disabled;/);
  assert.match(duel, /const out = tileTapOutcome\(q\.phase, q\.kind, my, \(\(q\.removed >> i\) & 1\) === 1, GUARD_MS\);/);
  // A held (paused) board draws every tile striped: those never take a tap.
  assert.match(duel, /onTouch=\{onTileTouch\}\n\s+disabled=\{held\}/);
});
