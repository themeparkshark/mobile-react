'use strict';
/**
 * Golden vectors for the swim verifier (design 11.3): 30 runs across modes,
 * tiers, difficulties and bot skills, each as (config, input log) -> expected
 * score / distance / hearts / tokens / banked / state hash / steps.
 * Regenerate after ANY sim change (the file records the SIM_VERSION):
 *   node tools/fixtures/swim/generate.cjs
 * The backend test (WS7) pipes each through verify.cjs and expects ok.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../../tests/helpers/ts-module.cjs');
const core = loadTs('src/games/sharky/sim/core.ts');
const bots = loadTs('src/games/sharky/sim/bots.ts');
const verify = loadTs('src/games/sharky/sim/verify.ts');

const PROFILES = ['ace', 'regular', 'rookie', 'novice'];
const out = [];
for (let i = 0; i < 30; i++) {
  const mode = [0, 0, 1, 2, 3][i % 5];
  const cfg = { seed: (12345 + i * 104729) | 0, mode, difficulty: 1 + (i % 3), tier: [0, 1, 2, 3, 4, 6][i % 6], runs: i % 7 };
  const prof = bots.BOT_PROFILES[PROFILES[i % 4]];
  const { log, s } = bots.planRun(cfg, prof, i * 31 + 7, 4200);
  const proof = verify.buildSwimProof(cfg, log, s, s.step * 1000 / 60 + 1200);
  out.push({ name: `swim-${String(i).padStart(2, '0')}-${core.MODE_NAMES[mode]}-${prof.name}`, proof });
}
const sim = loadTs('src/games/sharky/sim/version.generated.ts').SIM_VERSION;
fs.writeFileSync(path.join(__dirname, 'golden.json'), JSON.stringify({ sim_version: sim, vectors: out }) + '\n');
console.log('wrote', out.length, 'vectors for', sim);
