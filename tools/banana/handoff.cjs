#!/usr/bin/env node
'use strict';
/**
 * Writes the WS7 server handoff for Banana Basket bb2r8 (never into the
 * backend repo): constants.json (tuning + baked tables + star targets) and
 * golden-vectors.json: the 24 proofs design rev 8 section 10 names, whose
 * replayed scores and stats BananaReplay.php must reproduce exactly.
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

const base = { deck: 'park', unlock: 3, cards: 0xffff, assist: false, twist: 0, rules: C.R_RIDE };
const RIDE = sim.MODE_RIDE;
const QUEUE = sim.MODE_QUEUE;
const HEAT = sim.MODE_HEAT;

/** Run a bot (or a scripted driver) and gather the events the predicates need. */
function drive(over, kind, script) {
  const cfg = { ...base, ...over };
  const s = sim.createSim(cfg);
  const b = bots.createBot(kind, cfg.seed);
  const ev = { locks: 0, unlocks: 0, walls: 0, zonesAt: { 1: new Set(), 6: new Set(), 12: new Set() }, zones: new Set(), luckyPops: 0, coinPops: 0, shieldPuffer: 0, shieldGull: 0, saveThenFall: 0, saved: false };
  let lastVx = 0;
  const step = (t, q) => {
    sim.step(s, t, q);
    if (s.bOn === 1 && lastVx !== 0 && Math.sign(s.bVx) === -Math.sign(lastVx) && (s.bX < 40 * 256 || s.bX > 360 * 256)) ev.walls++;
    lastVx = s.bOn === 1 ? s.bVx : 0;
    for (let e = 0; e < s.evN; e++) {
      const k = s.evK[e];
      if (k === sim.EV_GATE && s.evA[e] === 1) ev.locks++;
      if (k === sim.EV_GATE && s.evA[e] === 2) ev.unlocks++;
      if (k === sim.EV_ZONE) {
        ev.zones.add(s.evB[e]);
        if (ev.zonesAt[s.evC[e]]) ev.zonesAt[s.evC[e]].add(s.evB[e]);
      }
      if (k === sim.EV_PRIZE && s.evA[e] === 2) {
        if ((s.evC[e] & 15) === C.K_LUCKY) ev.luckyPops++;
        else ev.coinPops++;
      }
      if (k === sim.EV_SHIELD) {
        if (s.evB[e] === 1) ev.shieldPuffer++;
        else ev.shieldGull++;
      }
      if (k === sim.EV_PAIL && s.evA[e] !== undefined && s.evB[e] === 1) ev.saved = true;
      if (k === sim.EV_BALL_LOST && ev.saved) ev.saveThenFall++;
    }
  };
  if (script) script(s, b, step);
  else bots.runBot(s, b, (_s, t, q) => step(t, q));
  return { cfg, s, ev };
}

/** Scripted juggler: aims zone (bounce n mod 5) every bounce, ignores items. */
function zoneSweep(s, b, step) {
  for (let n = 0; n < 40000 && !s.done; n++) {
    let x = s.bx >> 8;
    if (s.bOn === 1 && s.bVy > 0 && s.bPredStep >= 0) x = (s.bPredX >> 8) - C.ZONE_MID[(s.bN + 1) % 5];
    step(1, Math.max(62, Math.min(338, x)) * 16);
  }
}

/** Stand under the puffers (heart-outs). */
function underPuffers(s, b, step) {
  for (let n = 0; n < 40000 && !s.done; n++) {
    let target = 200;
    for (let i = 0; i < 28; i++) if (s.iSt[i] === 1 && s.iKind[i] === C.K_PUFFER) target = s.iX[i] >> 8;
    step(1, Math.max(62, Math.min(338, target)) * 16);
  }
}

/** Expert, but it skims every puffer 68 fu off center for CLOSE CALL. */
function skimmer(s, b, step) {
  for (let n = 0; n < 40000 && !s.done; n++) {
    let q = bots.botInput(s, b);
    for (let i = 0; i < 28; i++) {
      if (s.iSt[i] !== 1 || s.iKind[i] !== C.K_PUFFER) continue;
      const r = s.iLand[i] - (s.iAge[i] >> 8);
      if (r >= 0 && r < 20) {
        const px = s.iX[i] >> 8;
        const t = px + 68 <= 338 ? px + 68 : px - 68;
        q = t * 16;
        b.x = t;
      }
    }
    step(1, q);
  }
}

const slots = [
  // name, config, bot, predicate(state, ev), script
  ['heavy freeze 1 (ride, line walker)', { difficulty: 2, mode: RIDE }, bots.BOT_LINE_WALKER, null],
  ['heavy freeze 2 (queue ranked, line walker)', { difficulty: 2, mode: QUEUE }, bots.BOT_LINE_WALKER, null],
  ['heavy freeze 3 (ride d3, stare)', { difficulty: 3, mode: RIDE }, bots.BOT_STARE, null],
  ['queued freeze + parked shield (puffer)', { difficulty: 3, mode: RIDE }, bots.BOT_SHIELD, (s, ev) => ev.shieldPuffer > 0],
  ['queued freeze + parked shield (gull)', { difficulty: 3, mode: QUEUE, unlock: 3 }, bots.BOT_SHIELD, (s, ev) => ev.shieldGull > 0],
  ['pulse pattern', { difficulty: 2, mode: RIDE }, bots.BOT_PULSE, null],
  ['hearts end 1 (ride d3)', { difficulty: 3, mode: RIDE }, bots.BOT_KID, (s) => s.endReason === sim.END_HEARTS, underPuffers],
  ['hearts end 2 (queue)', { difficulty: 3, mode: QUEUE }, bots.BOT_KID, (s) => s.endReason === sim.END_HEARTS, underPuffers],
  ['teaching cards (queue run 1, fresh)', { difficulty: 2, mode: QUEUE, unlock: 1, cards: 0 }, bots.BOT_HUMAN, null],
  ['ride_intro 1 (fresh cards)', { difficulty: 2, mode: RIDE, rules: C.R_INTRO, cards: 0 }, bots.BOT_HUMAN, null],
  ['ride_intro 2 (d1 kid)', { difficulty: 1, mode: RIDE, rules: C.R_INTRO }, bots.BOT_KID, null],
  ['long juggle 1 (30+ bounces, Gold Rush gold)', { difficulty: 2, mode: RIDE }, bots.BOT_SUPER, (s) => s.bestLife >= 30 && s.goldBalls > 0],
  ['long juggle 2 (walls)', { difficulty: 3, mode: RIDE }, bots.BOT_SUPER, (s, ev) => s.bestLife >= 30 && ev.walls > 0],
  ['long juggle 3 (queue)', { difficulty: 2, mode: QUEUE }, bots.BOT_SUPER, (s) => s.bestLife >= 30],
  ['zone sweep (all 5 zones, bounce 12)', { difficulty: 1, mode: RIDE }, bots.BOT_EXPERT, (s, ev) => ev.zones.size === 5 && s.bestLife >= 12, zoneSweep],
  ['ball gate 1 (held at x2, then unlocked)', { difficulty: 2, mode: RIDE }, bots.BOT_HUMAN, (s, ev) => ev.locks > 0 && ev.unlocks > 0],
  ['ball gate 2 (queue)', { difficulty: 2, mode: QUEUE }, bots.BOT_HUMAN, (s, ev) => ev.locks > 0 && ev.unlocks > 0],
  ['pail save 1', { difficulty: 2, mode: RIDE }, bots.BOT_HUMAN, (s) => s.pailSaves > 0],
  ['pail save 2 (second fall after a save)', { difficulty: 2, mode: RIDE }, bots.BOT_HUMAN, (s, ev) => s.pailSaves > 0 && ev.saveThenFall > 0],
  ['prize POP (hanging coin)', { difficulty: 2, mode: RIDE }, bots.BOT_EXPERT, (s, ev) => ev.coinPops > 0],
  ['prize POP (Lucky Bunch)', { difficulty: 2, mode: RIDE }, bots.BOT_SUPER, (s, ev) => ev.luckyPops > 0],
  ['BONK + CLOSE CALL', { difficulty: 3, mode: RIDE }, bots.BOT_EXPERT, (s) => s.bonks > 0 && s.closeCalls > 0, skimmer],
  ['Park Twist (Crosswind, queue ranked)', { difficulty: 2, mode: QUEUE, unlock: 3, twist: C.TWIST_CROSSWIND }, bots.BOT_HUMAN, null],
  ['Wide Basket (queue run 1)', { difficulty: 2, mode: QUEUE, unlock: 1, assist: true }, bots.BOT_HUMAN, null],
  ['Line Heat run', { difficulty: 2, mode: HEAT, twist: C.TWIST_PRIZES, heatId: 9000123 }, bots.BOT_HUMAN, null],
];
const vectors = [];
let seedBase = 1000;
for (const [name, over, kind, pred, script] of slots) {
  let pick = null;
  for (let k = 0; k < 600 && !pick; k++) {
    const seed = seedBase + k;
    const r = drive({ seed, ...over }, kind, script);
    if (!pred || pred(r.s, r.ev)) pick = r;
  }
  if (!pick) throw new Error(`no seed found for ${name}`);
  seedBase += 37;
  const p = proof.buildProof(pick.cfg, pick.s, pick.s.steps * 17);
  vectors.push({ name, proof: plain(p), expect: { score: p.score, clock: pick.s.clock, end: p.end } });
}
fs.writeFileSync(path.join(out, 'golden-vectors.json'), JSON.stringify(vectors));
// Line Party Snack Dash (party.ts, v2.1 adapter): sidecar vectors, 8 seeds x 3 profiles + a ghost-filled drop.
if (!out.includes('fixtures')) {
  const party = loadTs('src/games/banana-basket/party.ts');
  const pv = [];
  for (let k = 0; k < 8; k++) {
    const seed = 5000 + k * 97;
    const board = party.build(seed);
    for (const [seat, prof] of [[0, 'rookie'], [1, 'regular'], [2, 'ace']]) {
      const taps = party.botTaps(board, seed, seat, prof);
      const r = party.resolve(board, taps);
      pv.push({ seed, seat, profile: prof, taps, expect: { score: r.score, hash: party.resultHash(r) } });
    }
    const own = party.botTaps(board, seed, 3, 'ace').filter(([t]) => t < 9000);
    const taps = party.ghostFill(board, seed, 3, own, 9000, 'regular');
    const r = party.resolve(board, taps);
    pv.push({ seed, seat: 3, profile: 'regular', dropAtMs: 9000, taps, expect: { score: r.score, hash: party.resultHash(r) } });
  }
  fs.writeFileSync(path.join(out, 'snack-dash-vectors.json'), JSON.stringify(pv));
  console.log(`wrote snack-dash-vectors.json (${pv.length})`);
}
console.log(`wrote ${out}: constants.json, golden-vectors.json (${vectors.length} vectors, ends: ${vectors.map((v) => v.expect.end).join(',')})`);
