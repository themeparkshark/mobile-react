'use strict';
/**
 * Bot harness for Sharky Tide Run: runs policy bots through the real sim and
 * records their input logs (so every bot run is also a replay fixture).
 *   node tools/sharky/botrun.cjs [runs] [mode] [diff] [tier]
 */
const path = require('node:path');
const { loadTs } = require(path.join(__dirname, '../tests/helpers/ts-module.cjs'));
const core = loadTs('src/games/sharky/sim/core.ts');

function runBot(cfg, brainArgs, opts = {}) {
  const s = core.createSim(cfg);
  const b = core.createBrain(...brainArgs);
  const log = [];
  const out = [0, 0, 0, 0];
  const max = opts.maxSteps || 20000;
  let revived = false;
  while (s.phase !== core.PH_DONE && s.step < max) {
    const n = core.botDecide(s, b, out);
    for (let k = 0; k < n; k++) {
      log.push({ step: s.step, kind: out[k], sub: 0, arg: 0 });
      core.applyInput(s, out[k], 0, 0);
    }
    if (s.phase === core.PH_WIPE && opts.revive && !revived && s.phaseSteps === 60) {
      revived = true;
      log.push({ step: s.step, kind: core.IN_EXT, sub: core.EXT_REVIVE, arg: 1 });
      core.applyInput(s, core.IN_EXT, core.EXT_REVIVE, 1);
    }
    core.step(s);
    if (opts.onStep) opts.onStep(s);
  }
  return { s, log };
}

const BRAINS = {
  expert: (seed) => [seed, 3, 0, 0, true, false],
  median: (seed) => [seed, 7, 12, 40, true, false],
  novice: (seed) => [seed, 9, 18, 70, false, false],
  spam: (seed) => [seed, 3, 0, 0, true, true],
};

module.exports = { core, runBot, BRAINS };

if (require.main === module) {
  const runs = Number(process.argv[2] || 20);
  const mode = Number(process.argv[3] || 0);
  const diff = Number(process.argv[4] || 2);
  const tier = Number(process.argv[5] || 4);
  for (const name of Object.keys(BRAINS)) {
    const scores = [];
    let hits = 0;
    let wins = 0;
    let steps = 0;
    let frenzies = 0;
    let skims = 0;
    let gates = 0;
    for (let i = 0; i < runs; i++) {
      const seed = 1000 + i * 7919;
      const { s } = runBot({ seed, mode, difficulty: diff, tier, runs: 5 }, BRAINS[name](seed * 3 + 1));
      scores.push(s.score);
      hits += s.stHits;
      steps += s.step;
      frenzies += s.stFrenzies;
      skims += s.stSkims;
      gates += s.gates;
      if (s.endReason === core.END_GATE || s.endReason === core.END_FINISH) wins++;
    }
    scores.sort((a, b) => a - b);
    console.log(name.padEnd(7), 'median', scores[runs >> 1], 'min', scores[0], 'max', scores[runs - 1],
      'hits/run', (hits / runs).toFixed(2), 'secs', (steps / runs / 60).toFixed(1), 'frenzy/run', (frenzies / runs).toFixed(2),
      'skims', (skims / runs).toFixed(1), 'gates', (gates / runs).toFixed(1), 'wins', wins);
  }
}
