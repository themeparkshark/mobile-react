#!/usr/bin/env node
/**
 * Bonk Race score distribution (design rev 6, 7.1.2 / M1).
 *
 *   node tools/bonk-score-dist.mjs [--seeds 500] [--out <file.json>]
 *
 * Plays every seed with the crew profiles (rookie, regular, ace) and a
 * "perfect read" (every finn and golden quick, every lure skipped, every
 * Shared Golden at 150 ms), then settles each 4-seat room (rookie, regular,
 * ace, perfect) for the SNATCH bonus. Prints and writes p10/p50/p90 per
 * profile, the ace-to-perfect p50 gap (requirement: at least 1.5x) and the
 * medal lines the ranked lane uses (bronze p40, silver p70, gold p90 of the
 * human-like field).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from './party/gen-sim-vectors.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const SEEDS = Number(arg('--seeds', 500));
const OUT = arg('--out', null);

const { hash, sims } = loadBundle();
const sim = sims.bonk_race;
const PROFILES = ['rookie', 'regular', 'ace'];

function perfectTaps(board) {
  return board
    .filter((s) => s.kind !== 'lure')
    .map((s) => [s.at + (s.sg > 0 ? 150 : 220), s.hole])
    .filter(([t]) => t <= sim.roundMs)
    .sort((a, b) => a[0] - b[0]);
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const raw = { rookie: [], regular: [], ace: [], perfect: [] };
const settled = { rookie: [], regular: [], ace: [], perfect: [] };
const snatchWins = { rookie: 0, regular: 0, ace: 0, perfect: 0 };
let spawnCount = 0;
let lures = 0;
let goldens = 0;
let s = 0x9e3779b9;
for (let i = 0; i < SEEDS; i++) {
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  const seed = s;
  const board = sim.build(seed);
  spawnCount += board.length;
  lures += board.filter((x) => x.kind === 'lure').length;
  goldens += board.filter((x) => x.kind === 'golden' && x.sg === 0).length;
  const logs = { rookie: sim.botTaps(board, seed, 0, 'rookie'), regular: sim.botTaps(board, seed, 1, 'regular'), ace: sim.botTaps(board, seed, 2, 'ace'), perfect: perfectTaps(board) };
  const results = Object.fromEntries(Object.entries(logs).map(([k, taps]) => [k, sim.resolve(board, taps)]));
  const order = Object.keys(results);
  const settle = sim.settle(order.map((k) => results[k]));
  order.forEach((k, j) => {
    raw[k].push(results[k].score);
    settled[k].push(results[k].score + settle.bonus[j]);
    snatchWins[k] += settle.bonus[j] / 200;
  });
}

const summary = (arr) => ({ p10: pct(arr, 10), p25: pct(arr, 25), p50: pct(arr, 50), p75: pct(arr, 75), p90: pct(arr, 90), max: Math.max(...arr) });
const field = [...raw.rookie, ...raw.regular, ...raw.ace];
const out = {
  game: 'bonk_race',
  sim_version: sim.version,
  sim_bundle: hash,
  seeds: SEEDS,
  round_ms: sim.roundMs,
  generated_by: 'tools/bonk-score-dist.mjs',
  avg_spawns: +(spawnCount / SEEDS).toFixed(2),
  avg_lures: +(lures / SEEDS).toFixed(2),
  avg_goldens_excluding_shared: +(goldens / SEEDS).toFixed(2),
  board_score: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, summary(v)])),
  with_snatch_bonus_4_seat_room: Object.fromEntries(Object.entries(settled).map(([k, v]) => [k, summary(v)])),
  snatches_per_round: Object.fromEntries(Object.entries(snatchWins).map(([k, v]) => [k, +(v / SEEDS).toFixed(2)])),
  ace_to_perfect_p50: +(pct(raw.perfect, 50) / pct(raw.ace, 50)).toFixed(3),
  requirement: 'ace_to_perfect_p50 >= 1.5 (design 7.1.2)',
  medal_lines_board_score: { bronze_p40: pct(field, 40), silver_p70: pct(field, 70), gold_p90: pct(field, 90) },
  baseline_v1_rev5: { rookie_p50: 2500, regular_p50: 4000, ace_p50: 5850, perfect_p50: 9750 },
};
console.log(JSON.stringify(out, null, 2));
if (OUT) {
  fs.writeFileSync(path.resolve(root, OUT), `${JSON.stringify(out, null, 2)}\n`);
  console.error(`wrote ${OUT}`);
}
if (out.ace_to_perfect_p50 < 1.5) {
  console.error(`FAIL: ace-to-perfect p50 gap ${out.ace_to_perfect_p50} is under 1.5x; raise the lure penalty to -200 first.`);
  process.exitCode = 1;
}
