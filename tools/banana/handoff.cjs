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
if (!out.includes('fixtures')) fs.writeFileSync(path.join(out, 'constants.json'), JSON.stringify(constants, null, 1));

// Rev 5: 24 vectors. Each slot names what it must contain; seeds are searched
// deterministically (first seed that qualifies) so the set is reproducible.
const base = { deck: 'park', unlock: 3, cards: 0xffff, assist: false, twist: 0 };
function run(over, kind, botSeed) {
  const cfg = { ...base, ...over };
  const s = sim.createSim(cfg);
  bots.runBot(s, bots.createBot(kind, botSeed ?? cfg.seed), sim.step);
  return { cfg, s };
}
function events(over, kind) {
  const cfg = { ...base, ...over };
  const s = sim.createSim(cfg);
  const b = bots.createBot(kind, cfg.seed);
  const ev = { locks: 0, unlocks: 0, optMiss: 0, walls: 0, maxRun: 0 };
  let lastVx = 0;
  for (let n = 0; n < 40000 && !s.done; n++) {
    sim.step(s, 1, bots.botInput(s, b));
    if (s.bOn === 1 && lastVx !== 0 && Math.sign(s.bVx) === -Math.sign(lastVx) && (s.bX < 40 * 256 || s.bX > 360 * 256)) ev.walls++;
    lastVx = s.bOn === 1 ? s.bVx : 0;
    if (s.bN > ev.maxRun) ev.maxRun = s.bN;
    for (let e = 0; e < s.evN; e++) {
      if (s.evK[e] === sim.EV_GATE && s.evA[e] === 1) ev.locks++;
      if (s.evK[e] === sim.EV_GATE && s.evA[e] === 2) ev.unlocks++;
      if (s.evK[e] === sim.EV_MISS && s.evC[e] === 0) {
        for (let i = 0; i < 28; i++) if (s.iSt[i] === 3 && s.iMust[i] === 1 && s.iOpt[i] === 1 && (s.iX[i] >> 8) === s.evA[e]) ev.optMiss++;
      }
    }
  }
  return { cfg, s, ev };
}
const slots = [
  // name, config, bot, predicate(state, ev) or null
  ['ride human d2', { difficulty: 2, mode: 0 }, bots.BOT_HUMAN, null],
  ['ride expert d3', { difficulty: 3, mode: 0 }, bots.BOT_EXPERT, null],
  ['ride kid d1', { difficulty: 1, mode: 0 }, bots.BOT_KID, null],
  ['ride casual d3', { difficulty: 3, mode: 0 }, bots.BOT_CASUAL, null],
  ['heavy freeze 1 (ride)', { difficulty: 2, mode: 0 }, bots.BOT_FREEZE_SPAM, null],
  ['heavy freeze 2 (ride d3)', { difficulty: 3, mode: 0 }, bots.BOT_FREEZE_SPAM, null],
  ['heavy freeze 3 (queue)', { difficulty: 2, mode: 1 }, bots.BOT_FREEZE_SPAM, null],
  ['heavy freeze 4 (line walker)', { difficulty: 2, mode: 0 }, bots.BOT_LINE_WALKER, null],
  ['heavy freeze 5 (queue line walker)', { difficulty: 1, mode: 1 }, bots.BOT_LINE_WALKER, null],
  ['cards 1 (ride first run)', { difficulty: 2, mode: 0, cards: 0 }, bots.BOT_HUMAN, null],
  ['cards 2 (queue run 1)', { difficulty: 2, mode: 1, unlock: 1, cards: 0 }, bots.BOT_HUMAN, null],
  ['rim roll save 1', { difficulty: 2, mode: 0 }, bots.BOT_HUMAN, (s) => s.saves > 0],
  ['rim roll save 2', { difficulty: 3, mode: 1 }, bots.BOT_CASUAL, (s) => s.saves > 0],
  ['chain breaks on misses 1', { difficulty: 2, mode: 0 }, bots.BOT_KID, (s) => s.misses >= 3],
  ['chain breaks on misses 2', { difficulty: 3, mode: 1 }, bots.BOT_KID, (s) => s.misses >= 3],
  ['long juggle 1 (30+ bounces, gold)', { difficulty: 2, mode: 0 }, bots.BOT_EXPERT, (s, ev) => ev.maxRun >= 30 && s.goldBalls > 0],
  ['long juggle 2 (wall hits)', { difficulty: 3, mode: 0 }, bots.BOT_EXPERT, (s, ev) => ev.maxRun >= 30 && ev.walls > 0],
  ['long juggle 3 (queue)', { difficulty: 2, mode: 1 }, bots.BOT_EXPERT, (s, ev) => ev.maxRun >= 30],
  ['long juggle 4 (d1)', { difficulty: 1, mode: 0 }, bots.BOT_EXPERT, (s, ev) => ev.maxRun >= 30 && s.goldBalls > 0],
  ['ball gate 1 (held at x2, then unlocked)', { difficulty: 2, mode: 0 }, bots.BOT_HUMAN, (s, ev) => ev.locks > 0 && ev.unlocks > 0],
  ['ball gate 2 (queue)', { difficulty: 2, mode: 1 }, bots.BOT_HUMAN, (s, ev) => ev.locks > 0 && ev.unlocks > 0],
  ['multi-catch 1', { difficulty: 2, mode: 0 }, bots.BOT_EXPERT, (s) => s.multi >= 2],
  ['multi-catch 2 (queue tip-over)', { difficulty: 2, mode: 1 }, bots.BOT_EXPERT, (s) => s.multi >= 3],
];
const vectors = [];
let seedBase = 1000;
for (const [name, over, kind, pred] of slots) {
  let pick = null;
  for (let k = 0; k < 400 && !pick; k++) {
    const seed = seedBase + k;
    const r = events({ seed, ...over }, kind);
    if (!pred || pred(r.s, r.ev)) pick = r;
  }
  if (!pick) throw new Error(`no seed found for ${name}`);
  seedBase += 37;
  const p = proof.buildProof(pick.cfg, pick.s, pick.s.steps * 17);
  vectors.push({ name, proof: plain(p), expect: { score: p.score, clock: pick.s.clock, end: p.end } });
}
// GRAZE: a scripted skimmer that parks 68 fu beside every landing puffer.
{
  let found = null;
  for (let seed = 4000; seed < 4400 && !found; seed++) {
    const cfg = { ...base, seed, difficulty: 3, mode: 1 };
    const s = sim.createSim(cfg);
    const b = bots.createBot(bots.BOT_EXPERT, seed);
    for (let n = 0; n < 40000 && !s.done; n++) {
      let q = bots.botInput(s, b);
      let soon = 1 << 30;
      for (let i = 0; i < 28; i++) {
        if (s.iSt[i] !== 1 || s.iKind[i] !== 5) continue;
        const r = s.iLand[i] - (s.iAge[i] >> 8);
        if (r >= 0 && r < 30 && r < soon) {
          soon = r;
          const px = s.iX[i] >> 8;
          const t = px + 68 <= 338 ? px + 68 : px - 68;
          q = t * 16;
          b.x = t;
        }
      }
      sim.step(s, 1, q);
    }
    if (s.grazes > 0) found = { cfg, s };
  }
  if (!found) throw new Error('no graze vector');
  const p = proof.buildProof(found.cfg, found.s, found.s.steps * 17);
  vectors.push({ name: 'graze (scripted skimmer)', proof: plain(p), expect: { score: p.score, clock: found.s.clock, end: p.end } });
}
// Two heart-outs: stand under the puffers (first two d3 Ride seeds that end on hearts).
for (let seed = 3001, got = 0; got < 2 && seed < 3400; seed++) {
  const cfg = { ...base, seed, difficulty: 3, mode: 0 };
  const s = sim.createSim(cfg);
  for (let n = 0; n < 40000 && !s.done; n++) {
    let target = 200;
    for (let i = 0; i < 28; i++) if (s.iSt[i] === 1 && s.iKind[i] === 5) target = s.iX[i] >> 8;
    sim.step(s, 1, Math.max(62, Math.min(338, target)) * 16);
  }
  if (s.endReason !== sim.END_HEARTS) continue;
  got++;
  const p = proof.buildProof(cfg, s, s.steps * 17);
  vectors.push({ name: `hearts out ride ${seed}`, proof: plain(p), expect: { score: p.score, clock: s.clock, end: p.end } });
}
fs.writeFileSync(path.join(out, 'golden-vectors.json'), JSON.stringify(vectors));
console.log(`wrote ${out}: constants.json, golden-vectors.json (${vectors.length} vectors, ends: ${vectors.map((v) => v.expect.end).join(',')})`);
