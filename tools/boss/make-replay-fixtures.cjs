#!/usr/bin/env node
'use strict';
/**
 * Golden replay fixtures for the Boss Brawl v7 server replay (sim-runner, {game: 'boss', sim_version: 7}).
 * Each fixture is a full round (3 bout proofs) played by a bot, with pauses,
 * device offsets, walk and novice flags, boons and all three bout-3 variants
 * (A0, A, B) mixed in, plus the expected integer
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
const pat = loadTs('src/games/boss/sim/patterns.ts');

function fixtureRound(boss, seed, botName, k) {
  const walk = k % 3 === 1;
  const offset = [0, 35, -60, 120][k % 4];
  const novice = k % 5 === 2;
  let carry = enc.freshCarry();
  const proofs = [];
  for (let n = 0; n < 3; n++) {
    const cfg = { boss, seed, bout: n, carry, walk, offset, variant: k % 3, novice };
    const offer = n > 0 ? pat.boonOffer(seed, n) : null;
    const played = bots.runBotBout(cfg, bots.BOTS[botName], seed + n, offer ? offer[k % 2] : -1);
    // Mix in pause / resume markers (they must not change the outcome) at a quiet time.
    const log = played.log.map((e) => ({ ...e }));
    if (k % 2 === 1 && log.length > 2) {
      const at = log[1].t;
      log.splice(2, 0, { t: at, k: C.IN_PAUSE }, { t: at, k: C.IN_RESUME });
    }
    const b = enc.replayBout(cfg, log, played.endT);
    proofs.push(round.boutProof(b));
    carry = enc.carryOut(b);
    if (carry.tko) break;
  }
  return { boss, seed, bot: botName, variant: k % 3, bouts: proofs, damage: proofs.map((p) => p.damage) };
}

const out = path.join(__dirname, '../tests/fixtures/boss-replays');
fs.mkdirSync(out, { recursive: true });
for (const boss of ['kraken', 'robo_shark', 'ghost_squid']) {
  const list = [];
  let k = 0;
  for (const bot of ['guesser', 'kid', 'median', 'easySlam', 'mastery']) {
    for (let i = 0; i < 4; i++) list.push(fixtureRound(boss, 1000 + 97 * k + i, bot, k++));
  }
  fs.writeFileSync(path.join(out, `${boss}.json`), `${JSON.stringify({ version: C.SIM_VERSION, boss, rounds: list })}\n`);
  console.log(boss, list.length, 'rounds');
}
