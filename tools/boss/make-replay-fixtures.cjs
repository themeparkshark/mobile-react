#!/usr/bin/env node
'use strict';
/**
 * Golden replay fixtures for the Boss Brawl v4 server replay (WS6 PHP port).
 * Each fixture is a full round (3 bout proofs) played by a bot, with pauses,
 * device offsets, walk and tide flags mixed in, plus the expected integer
 * damage per bout. `node tools/boss/make-replay-fixtures.cjs` rewrites them;
 * tools/tests/boss-encounter.test.cjs asserts the TS sim still matches.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const bots = loadTs('src/games/boss/sim/bots.ts');
const round = loadTs('src/games/boss/sim/round.ts');
const enc = loadTs('src/games/boss/sim/encounter.ts');
const C = loadTs('src/games/boss/sim/constants.ts');

function fixtureRound(boss, seed, botName, k) {
  const walk = k % 3 === 1;
  const offset = [0, 35, -60, 120][k % 4];
  let carry = enc.freshCarry();
  const proofs = [];
  for (let n = 0; n < 3; n++) {
    const cfg = { boss, seed, bout: n, carry, walk, tide: n > 0 && k % 2 === 0, offset, variant: k % 3 };
    const played = bots.runBotBout(cfg, bots.BOTS[botName], seed + n);
    // Mix in pause / resume markers (they must not change the outcome) at a quiet time.
    const log = played.log.map((e) => ({ ...e }));
    if (k % 2 === 1 && log.length > 2) {
      const at = log[1].t;
      log.splice(2, 0, { t: at, k: C.IN_PAUSE }, { t: at, k: C.IN_RESUME });
    }
    const b = enc.replayBout(cfg, log, played.endT);
    proofs.push({ ...round.boutProof(b), variant: cfg.variant });
    carry = enc.carryOut(b);
  }
  return { boss, seed, bot: botName, variant: k % 3, bouts: proofs, damage: proofs.map((p) => p.damage) };
}

const out = path.join(__dirname, '../tests/fixtures/boss-replays');
fs.mkdirSync(out, { recursive: true });
for (const boss of ['kraken', 'robo_shark', 'ghost_squid']) {
  const list = [];
  let k = 0;
  for (const bot of ['masher', 'guesser', 'ringBlind', 'median', 'mastery']) {
    for (let i = 0; i < 4; i++) list.push(fixtureRound(boss, 1000 + 97 * k + i, bot, k++));
  }
  fs.writeFileSync(path.join(out, `${boss}.json`), `${JSON.stringify({ version: 4, boss, rounds: list })}\n`);
  console.log(boss, list.length, 'rounds');
}
