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

test('T027: the slow forgetful kid wins about 2 Tickets in 3 on the ride board (8 pairs, resting clock)', () => {
  const Bt = loadTs('src/games/memory/bot.ts');
  const kid = Bt.BOT.kid;
  const shell = (seed, cfg) => {
    let a = seed;
    const rand = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    const faces = [];
    for (let p = 0; p < 8; p++) faces.push(p, p);
    for (let i = faces.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [faces[i], faces[j]] = [faces[j], faces[i]]; }
    const s = E.createEngine(cfg, { cols: 4, rows: 4, seed: 5 });
    let t = 1200;
    for (let k = 0; k < 400 && s.status === 'play'; k++) {
      t += kid.minMs + rand() * (kid.maxMs - kid.minMs);
      E.step(s, { t: 'tick', at: t });
      if (s.status !== 'play') break;
      const slot = Bt.botPick(s, kid.recall, rand);
      if (slot < 0) continue;
      if (s.phase === 2) E.step(s, { t: 'dismiss', slot, at: t });
      if (s.status !== 'play' || s.know[slot] === E.K_MATCHED || s.up.indexOf(slot) >= 0) continue;
      E.step(s, { t: 'flip', slot, face: faces[slot], at: t });
    }
    return s.status === 'cleared';
  };
  const n = 200;
  let tickets = 0;
  for (let i = 0; i < n; i++) {
    let won = false;
    for (let sh = 0; sh < 3 && !won; sh++) won = shell(i * 97 + sh * 13 + 1, E.rideSprintConfig());
    if (won) tickets++;
  }
  assert.ok(tickets / n >= 0.55 && tickets / n <= 0.85, `kid wins ${tickets}/${n} Tickets`);
});
