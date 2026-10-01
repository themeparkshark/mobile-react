'use strict';
/**
 * Score distribution + chain-gap audit for Sharky Tide Run (design 5.1, 4.4, 14.11c-d).
 *   node tools/sharky/score-sim.cjs [runsPerBot=1000] [out.json]
 * Runs the policy bots (novice, regular = median, ace = expert) through the real
 * sim in queue mode at D2 on the fixed tier-3 set, and reports per bot: mean,
 * spread (std/mean), Frenzy share of points (banked pot / score), the longest
 * gap between chain events while swimming (pockets and Float excluded), and the
 * share of runs that reach Frenzy.
 */
const path = require('node:path');
const fs = require('node:fs');
const { loadTs } = require(path.join(__dirname, '../tests/helpers/ts-module.cjs'));
const core = loadTs('src/games/sharky/sim/core.ts');
const bots = loadTs('src/games/sharky/sim/bots.ts');

const CHAIN_EVS = new Set([core.EV_LINE, core.EV_RING, core.EV_SKIM, core.EV_CHOMP, core.EV_TOKEN]);

function runOne(profile, seed, diff = 2, tier = 4) {
  const cfg = { seed, mode: core.MODE_QUEUE, difficulty: diff, tier, runs: 6 };
  const { log } = bots.planRun(cfg, profile, seed ^ 0x5bd1e995);
  // Replay the planned log step by step to measure chain gaps.
  const s = core.createSim(cfg);
  let li = 0;
  let last = -1;
  let gap = 0;
  let swimSteps = 0;
  while (s.phase !== core.PH_DONE && s.step < 7200) {
    while (li < log.length && log[li].step === s.step) {
      core.applyInput(s, log[li].kind, log[li].sub, log[li].arg);
      li++;
    }
    core.step(s);
    const swimming = s.phase === core.PH_PLAY && s.float === 0 && s.sprint >= 0;
    if (swimming) swimSteps++;
    for (let e = 0; e < s.evN; e++) {
      if (CHAIN_EVS.has(s.ev[e * 5])) {
        if (last >= 0 && swimSteps - last > gap) gap = swimSteps - last;
        last = swimSteps;
      }
    }
  }
  return { score: s.score, banked: s.banked, frenzies: s.stFrenzies, hits: s.stHits, gapMs: Math.round((gap * 1000) / 60) };
}

function stats(xs) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
  const sorted = [...xs].sort((a, b) => a - b);
  return { mean: Math.round(mean), sd: Math.round(sd), cv: +(sd / Math.max(1, mean)).toFixed(3), p10: sorted[Math.floor(n * 0.1)], p50: sorted[Math.floor(n * 0.5)], p90: sorted[Math.floor(n * 0.9)] };
}

function audit(runs) {
  const out = {};
  for (const name of ['novice', 'regular', 'ace']) {
    const prof = bots.BOT_PROFILES[name];
    const rs = [];
    for (let i = 0; i < runs; i++) rs.push(runOne(prof, 1000 + i * 7919));
    const score = stats(rs.map((r) => r.score));
    const frenzyShare = rs.reduce((a, r) => a + r.banked, 0) / Math.max(1, rs.reduce((a, r) => a + r.score, 0));
    const gaps = rs.map((r) => r.gapMs).sort((a, b) => a - b);
    out[name] = {
      runs, score,
      frenzy_share: +frenzyShare.toFixed(3),
      reach_frenzy: +(rs.filter((r) => r.frenzies > 0).length / runs).toFixed(3),
      chain_gap_ms: { p50: gaps[Math.floor(runs * 0.5)], p90: gaps[Math.floor(runs * 0.9)], max: gaps[runs - 1] },
      hits_mean: +(rs.reduce((a, r) => a + r.hits, 0) / runs).toFixed(2),
    };
  }
  return out;
}

module.exports = { audit, runOne };

if (require.main === module) {
  const runs = Number(process.argv[2] || 1000);
  const t0 = Date.now();
  const res = { sim_version: core.SIM_VERSION_TAG, generated: new Date().toISOString(), ...audit(runs), ms: Date.now() - t0 };
  const outFile = process.argv[3];
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(res, null, 2) + '\n');
  console.log(JSON.stringify(res, null, 2));
}
