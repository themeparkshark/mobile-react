'use strict';
/**
 * Fix round w3 (lane play): Memory Match.
 *   T049 the loss card counts the best shell of the Ticket, never only the last board.
 *   T063 a card flips on touch-down, so a quick tap always flips it.
 *   T064 deck progress never says "XP" beside the server's player XP.
 *   T066 a resumed board starts with a full rope (the clock starts on the first flip, T042).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');

const RT = loadTs('src/gamekit/results/rideTry.ts');
const E = loadTs('src/games/memory/engine.ts');
const game = fs.readFileSync('src/games/memory/MemoryGame.tsx', 'utf8');

test('T049: both ride loss paths pass the best shell; the line says the best try', () => {
  const calls = game.match(/noteRideTry\(\{ stars: 0, meta: rideTryMeta\(/g) ?? [];
  assert.equal(calls.length, 2, 'the timeout path and the give-up path');
  assert.doesNotMatch(game, /noteRideTry\(\{ stars: 0, meta: \{ game: 'memory', pairs: r\.eng\.pairs, pairsTotal: r\.eng\.pairsTotal \} \}\)/);
  assert.match(game, /bestPairs: Math\.max\(pairs, bestEarlier\)/);
  assert.match(game, /if \(r\.mode === 'ride'\) rideBestPairsRef\.current = Math\.max\(bestEarlier, r\.eng\.pairs\);/);
  assert.equal(RT.rideTrySummary({ stars: 0, meta: { game: 'memory', pairs: 0, pairsTotal: 8, bestPairs: 4 } }).line, 'Best try: 4 of 8 pairs.');
});

test('T063: the touch-down flips the card; the lift only releases it', () => {
  assert.match(game, /flippedOnDown\.current = true;\n\s+tapSlotRef\.current\(s\);/);
  assert.match(game, /if \(flippedOnDown\.current\) \{\n\s+flippedOnDown\.current = false;\n\s+return;/);
});

test('T064: deck progress has its own word', () => {
  assert.match(game, /return `\+\$\{points\} \$\{label\.toUpperCase\(\)\} DECK`;/);
  assert.doesNotMatch(game, /`\+\$\{xp\} XP`/);
});

test('T066: a fresh or resumed ride board keeps a full rope until the first flip', () => {
  const s = E.createEngine(E.rideSprintConfig(), { cols: 4, rows: 4, seed: 3 });
  E.step(s, { t: 'tick', at: 9000 });
  assert.equal(s.clockLeftMs, 45000);
});
