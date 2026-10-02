#!/usr/bin/env node
/**
 * Bonk Race score distribution (design rev 7, 7.1.7 / M1, sim v3).
 *
 *   node tools/bonk-score-dist.mjs [--seeds 500] [--out <file.json>]
 *
 * Plays every seed with the crew profiles (rookie, regular, ace) and a
 * "perfect read" (every ringed target dead on its mark, every lure left: the
 * sim's own bandCheck), then settles each 4-seat room (rookie, regular, ace,
 * perfect) for the SNATCH bonus. Also reports the band (bot perfect-read
 * score within +/-5% of the version mean) used for ranked and KOTQ seeds. Prints and writes p10/p50/p90 per
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
    .filter((s) => s.kind !== 'lure' && s.mark < sim.roundMs)
    .map((s) => [s.mark, s.hole])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
let bandIn = 0;
let perfectSum = 0;

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
  if (sim.bandOk(board)) bandIn += 1;
  perfectSum += sim.bandCheck(board);
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
  requirement: 'ace_to_perfect_p50 >= 1.5 (design 7.1.7)',
  band: { mean_perfect_read_this_run: Math.round(perfectSum / SEEDS), sim_band_mean: 15048, pct: 5, seeds_in_band: +(bandIn / SEEDS).toFixed(3) },
  medal_lines_board_score: { bronze_p40: pct(field, 40), silver_p70: pct(field, 70), gold_p90: pct(field, 90) },
  // Measured 2026-10-01 on 500 seeds by patching one constant at a time (scratch run, same profiles).
  knob_what_ifs_ace_gap: {
    as_designed: 1.372,
    'knob 1: LAST 2 BARS up-time 992 -> 661 ms': 1.372,
    'knob 2: PERFECT window 50 -> 40 ms': 1.396,
    'knobs 1 + 2': 1.396,
    'GOOD 100 -> 60': 1.421,
    'GREAT 130 -> 110 and GOOD 100 -> 60': 1.528,
    'PERFECT 160 -> 200': 1.532,
    note: 'knobs 1-2 barely move a bot that taps around the mark; the per-hit spread (160/130/100) caps the ceiling. Design call needed (NETCODE.md R7).',
  },
  baseline_v2_rev6: { rookie_p50: 2750, regular_p50: 4200, ace_p50: 5925, perfect_p50: 9200, gap: 1.553 },
  profiles: sim.key === 'bonk_race' ? 'crew profiles from bonkRace.ts BOT_PROFILES (ace = the rev 6 ace thumb mapped onto marks: 86% hits, -110..+160 ms around the mark)' : null,
};
console.log(JSON.stringify(out, null, 2));
if (OUT) {
  fs.writeFileSync(path.resolve(root, OUT), `${JSON.stringify(out, null, 2)}\n`);
  console.error(`wrote ${OUT}`);
}
if (out.ace_to_perfect_p50 < 1.5) {
  console.error(`FAIL: ace-to-perfect p50 gap ${out.ace_to_perfect_p50} is under 1.5x (see NETCODE.md R7 for the measured knobs).`);
  process.exitCode = 1;
}
