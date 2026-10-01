'use strict';
/**
 * Score distribution + chain-gap audit for Sharky Tide Run (design v7.1 5.8).
 *   node tools/sharky/score-sim.cjs [runsPerBot=200] [out.json]
 *   node tools/sharky/score-sim.cjs --replay logs.json [out.json]
 * Runs the policy bots (novice, regular, ace) through the real sim in queue
 * mode at D2 on the tier-4 set and reports, per bot: score spread, distance
 * share, Frenzy share and reach, chain-gap p50/p90 (pockets and Float
 * excluded), play time, hits, bounces, Close Skims and Perfects, plus the
 * lock ratios (ace/regular, regular/novice). --replay takes human input logs
 * ({cfg, inputs} rows from the dev telemetry export) instead of bots.
 *
 * These are bot numbers. Design 5.8 locks nothing until humans have played.
 */
const path = require('node:path');
const fs = require('node:fs');
const { loadTs } = require(path.join(__dirname, '../tests/helpers/ts-module.cjs'));
const core = loadTs('src/games/sharky/sim/core.ts');
const bots = loadTs('src/games/sharky/sim/bots.ts');

const CHAIN_EVS = new Set([core.EV_LINE, core.EV_RING, core.EV_SKIM, core.EV_CHOMP, core.EV_TOKEN, core.EV_REGRAB]);

function measure(cfg, log) {
  const s = core.createSim(cfg);
  let li = 0;
  let last = -1;
  const gaps = [];
  let swim = 0;
  let distPts = 0;
  let frenzyPts = 0;
  let prevScore = 0;
  let prevDist = 0;
  let distAcc = 0;
  while (s.phase !== core.PH_DONE && s.step < 7200) {
    while (li < log.length && log[li].step <= s.step) {
      core.applyInput(s, log[li].kind, log[li].sub, log[li].arg);
      li++;
    }
    const wasFrenzy = s.frenzy > 0;
    core.step(s);
    const swimming = s.phase === core.PH_PLAY && s.float === 0;
    if (swimming) swim++;
    const d = s.dist >> 8;
    if (swimming && s.reviveShield === 0) {
      distAcc += d - prevDist;
      while (distAcc >= 50) {
        distAcc -= 50;
        distPts++;
      }
    }
    prevDist = d;
    if (wasFrenzy || s.frenzy > 0) frenzyPts += Math.max(0, s.score - prevScore);
    prevScore = s.score;
    for (let e = 0; e < s.evN; e++) {
      if (CHAIN_EVS.has(s.ev[e * 5])) {
        if (last >= 0) gaps.push(swim - last);
        last = swim;
      }
    }
  }
  gaps.sort((a, b) => a - b);
  const pct = (p) => (gaps.length ? Math.round((gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] * 1000) / 60) : 0);
  return {
    score: s.score,
    distShare: s.score > 0 ? distPts / s.score : 0,
    frenzyShare: s.score > 0 ? frenzyPts / s.score : 0,
    frenzies: s.stFrenzies,
    hits: s.stHits,
    bounces: s.stBounces,
    closeSkims: s.stCloseSkims,
    skims: s.stSkims,
    perfects: s.stPerfects,
    gates: s.gates,
    playS: s.activeSteps / 60,
    gapP50: pct(0.5),
    gapP90: pct(0.9),
    end: s.endReason,
  };
}

function runOne(profile, seed, diff = 2, tier = 4) {
  const cfg = { seed, mode: core.MODE_QUEUE, difficulty: diff, tier, runs: 6 };
  const { log } = bots.planRun(cfg, profile, seed ^ 0x5bd1e995);
  return measure(cfg, log);
}

function stats(xs) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
  const sorted = [...xs].sort((a, b) => a - b);
  return { mean: Math.round(mean), sd: Math.round(sd), cv: +(sd / Math.max(1, mean)).toFixed(3), p10: sorted[Math.floor(n * 0.1)], p50: sorted[Math.floor(n * 0.5)], p90: sorted[Math.floor(n * 0.9)] };
}

const avg = (rs, k) => +(rs.reduce((a, r) => a + r[k], 0) / rs.length).toFixed(3);

function summarize(rs) {
  return {
    runs: rs.length,
    score: stats(rs.map((r) => r.score)),
    distance_share: avg(rs, 'distShare'),
    frenzy_share: avg(rs, 'frenzyShare'),
    reach_frenzy: +(rs.filter((r) => r.frenzies > 0).length / rs.length).toFixed(3),
    play_s_p50: stats(rs.map((r) => r.playS)).p50,
    chain_gap_ms: { p50: stats(rs.map((r) => r.gapP50)).p50, p90: stats(rs.map((r) => r.gapP90)).p50 },
    hits_mean: avg(rs, 'hits'),
    bounces_mean: avg(rs, 'bounces'),
    close_skims_mean: avg(rs, 'closeSkims'),
    skims_mean: avg(rs, 'skims'),
    perfects_mean: avg(rs, 'perfects'),
    gates_mean: avg(rs, 'gates'),
  };
}

function audit(runs) {
  const out = {};
  for (const name of ['novice', 'regular', 'ace']) {
    const prof = bots.BOT_PROFILES[name];
    const rs = [];
    for (let i = 0; i < runs; i++) rs.push(runOne(prof, 1000 + i * 7919));
    out[name] = summarize(rs);
  }
  out.ratios = {
    ace_over_regular: +(out.ace.score.mean / Math.max(1, out.regular.score.mean)).toFixed(3),
    regular_over_novice: +(out.regular.score.mean / Math.max(1, out.novice.score.mean)).toFixed(3),
  };
  return out;
}

module.exports = { audit, runOne, measure, summarize };

if (require.main === module) {
  const t0 = Date.now();
  let res;
  if (process.argv[2] === '--replay') {
    const rows = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const rs = rows.map((r) => measure(r.cfg, core.decodeInputs(r.inputs)));
    res = { sim_version: core.SIM_VERSION_TAG, source: process.argv[3], humans: summarize(rs) };
  } else {
    const runs = Number(process.argv[2] || 200);
    res = { sim_version: core.SIM_VERSION_TAG, generated: new Date().toISOString(), note: 'bot starting values; design 5.8 locks only after the walking playtest', ...audit(runs) };
  }
  res.ms = Date.now() - t0;
  const outFile = process.argv[2] === '--replay' ? process.argv[4] : process.argv[3];
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(res, null, 2) + '\n');
  console.log(JSON.stringify(res, null, 2));
}
