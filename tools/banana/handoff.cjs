#!/usr/bin/env node
'use strict';
/**
 * Writes the WS7 server handoff for Banana Basket (never into the backend
 * repo): constants.json (tuning + baked tables + star targets) and
 * golden-vectors.json (proofs whose replayed scores BananaReplay.php must
 * reproduce exactly, including heavy freezes, heart outs, cards, queue sets
 * and Gull Send).
 *
 *   node tools/banana/handoff.cjs [outDir]
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const out = process.argv[2] || '/Users/dustinsparage/apps/tps-prime-time-audit/studio/handoff/banana';
const C = loadTs('src/games/banana-basket/constants.ts');
const T = loadTs('src/games/banana-basket/tables.ts');
const sim = loadTs('src/games/banana-basket/sim.ts');
const bots = loadTs('src/games/banana-basket/bots.ts');
const proof = loadTs('src/games/banana-basket/proof.ts');

const plain = (v) => JSON.parse(JSON.stringify(v));
fs.mkdirSync(out, { recursive: true });
const constants = {};
for (const [k, v] of Object.entries(C)) if (typeof v === 'number' || typeof v === 'string' || Array.isArray(v)) constants[k] = plain(v);
for (const [k, v] of Object.entries(T)) constants[k] = plain(v);
fs.writeFileSync(path.join(out, 'constants.json'), JSON.stringify(constants, null, 1));

const cases = [
  ['ride human d2', { seed: 1001, difficulty: 2, mode: 0 }, bots.BOT_HUMAN],
  ['ride expert d3', { seed: 1002, difficulty: 3, mode: 0 }, bots.BOT_EXPERT],
  ['ride kid d1', { seed: 1003, difficulty: 1, mode: 0 }, bots.BOT_KID],
  ['ride freeze spam', { seed: 1004, difficulty: 2, mode: 0 }, bots.BOT_FREEZE_SPAM],
  ['ride line walker', { seed: 1005, difficulty: 2, mode: 0 }, bots.BOT_LINE_WALKER],
  ['ride cards (first run)', { seed: 1006, difficulty: 2, mode: 0, cards: 0 }, bots.BOT_HUMAN],
  ['ride casual d3', { seed: 1007, difficulty: 3, mode: 0 }, bots.BOT_CASUAL],
  ['queue unlock 1', { seed: 2001, difficulty: 2, mode: 1, unlock: 1, cards: 0 }, bots.BOT_HUMAN],
  ['queue unlock 2', { seed: 2002, difficulty: 2, mode: 1, unlock: 2 }, bots.BOT_EXPERT],
  ['queue breezy', { seed: 2003, difficulty: 2, mode: 1, unlock: 5, twist: 2 }, bots.BOT_HUMAN],
  ['queue beach party', { seed: 2004, difficulty: 2, mode: 1, unlock: 5, twist: 3 }, bots.BOT_EXPERT],
  ['queue splash deck', { seed: 2005, difficulty: 2, mode: 1, unlock: 5, deck: 'ocean' }, bots.BOT_KID],
  ['queue gull send', { seed: 2006, difficulty: 2, mode: 1, unlock: 5, gulls: [100, 190, 900, 990] }, bots.BOT_HUMAN],
  ['queue freeze spam', { seed: 2007, difficulty: 3, mode: 1, unlock: 5 }, bots.BOT_FREEZE_SPAM],
  ['queue assist', { seed: 2008, difficulty: 1, mode: 1, unlock: 5, assist: true }, bots.BOT_KID],
];
const vectors = [];
for (const [name, over, kind] of cases) {
  const cfg = { deck: 'park', unlock: 5, cards: 0xffff, assist: false, twist: 2, ...over };
  const s = sim.createSim(cfg);
  bots.runBot(s, bots.createBot(kind, cfg.seed), sim.step);
  const p = proof.buildProof(cfg, s, s.steps * 17);
  vectors.push({ name, proof: plain(p), expect: { score: p.score, clock: s.clock, end: p.end } });
}
// A heart-out: stand still under the puffers.
{
  const cfg = { seed: 3001, difficulty: 3, mode: 0, deck: 'park', unlock: 5, cards: 0xffff, assist: false, twist: 0 };
  const s = sim.createSim(cfg);
  for (let n = 0; n < 40000 && !s.done; n++) {
    let target = 200;
    for (let i = 0; i < 28; i++) if (s.iSt[i] === 1 && s.iKind[i] === 5) target = s.iX[i] >> 8;
    sim.step(s, 1, Math.max(62, Math.min(338, target)) * 16);
  }
  const p = proof.buildProof(cfg, s, s.steps * 17);
  vectors.push({ name: 'ride hearts out', proof: plain(p), expect: { score: p.score, clock: s.clock, end: p.end } });
}
fs.writeFileSync(path.join(out, 'golden-vectors.json'), JSON.stringify(vectors));
console.log(`wrote ${out}: constants.json, golden-vectors.json (${vectors.length} vectors, ends: ${vectors.map((v) => v.expect.end).join(',')})`);
