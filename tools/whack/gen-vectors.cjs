'use strict';
/**
 * Golden vectors for the Whack PHP replay port (design 11.2).
 *   node tools/whack/gen-vectors.cjs            (writes src/games/whack/__vectors__/vectors.json)
 * Timelines: seeds x formats x difficulties x Burst indexes, plus symmetry
 * transforms and walk boosts. Runs: autoplayed tap logs (every profile,
 * including look-up freezes, whiffs and splat swipes) with the resolver's
 * result. PHP must reproduce every timeline fingerprint hash and every result.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const T = loadTs('src/games/whack/timeline.ts');
const S = loadTs('src/games/whack/sim.ts');
const A = loadTs('src/games/whack/autoplayer.ts');
const P = loadTs('src/games/whack/proof.ts');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const timelines = [];
const formats = [['ride', [0]], ['queue', [0, 1, 2, 3, 4]], ['weekly', [0, 2, 4]], ['duel', [0, 1, 2]], ['raid', [0]], ['daily', [0, 1, 2]]];
for (let seed = 1; seed <= 40; seed++) {
  for (const [format, bursts] of formats) {
    for (const d of [1, 2, 3]) {
      for (const b of bursts) {
        const input = { seed: seed * 2654435761 >>> 0, burstIndex: b, format, difficulty: d, theme: ['park', 'pirates', 'mansion', 'space', 'jungle', 'backlot'][seed % 6], unlockLevel: (seed * 7) % 25, xform: format === 'weekly' ? seed % 8 : 0, walkBoost: format === 'queue' && seed % 3 === 0 ? (seed % 2 ? 'golden' : 'meter') : null };
        timelines.push({ input, sha256: sha(T.timelineFingerprint(T.buildBurst(input))) });
      }
    }
  }
}
const runs = [];
const profiles = ['novice', 'median', 'expert', 'glance', 'walking', 'masher'];
for (let k = 0; k < 60; k++) {
  const format = ['ride', 'queue', 'weekly', 'raid'][k % 4];
  const input = { seed: (k + 11) * 40503 >>> 0, burstIndex: format === 'queue' ? k % 5 : 0, format, difficulty: 1 + (k % 3), theme: 'pirates', unlockLevel: 12, xform: format === 'weekly' ? k % 8 : 0, walkBoost: null };
  const tl = T.buildBurst(input);
  const r = A.autoplayBurst(tl, profiles[k % profiles.length], k);
  const proof = P.buildProof(tl, S.NO_CARRY, r.sim.taps, r.result, { wallMs: r.stats.wallMs });
  runs.push({ proof, expect: { score: r.result.score, win: r.result.win, hits: r.result.legacyHits, maxStreak: r.result.maxStreak, freezes: r.result.freezes, bossDamage: r.result.bossDamage, elapsedMs: r.result.elapsedMs } });
}
const out = { v: 2, generated: 'tools/whack/gen-vectors.cjs', fingerprint: 'timelineFingerprint() in src/games/whack/timeline.ts', timelines, runs };
const file = path.resolve(__dirname, '../../src/games/whack/__vectors__/vectors.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`wrote ${timelines.length} timelines, ${runs.length} runs -> ${path.relative(process.cwd(), file)} (${fs.statSync(file).size} bytes)`);
