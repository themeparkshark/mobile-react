'use strict';
/**
 * Golden vectors (v4) for the Whack PHP replay port (design 13.3).
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
const THEMES = ['park', 'pirates', 'mansion', 'space', 'jungle', 'backlot'];
const timelines = [];
// v4: 4-Burst Runs (finale = Golden Rush or Boss Run by runOfDay), Line of the Day xforms, GO FEVER Bursts, Golden Start.
const formats = [['ride', [0]], ['queue', [0, 1, 2, 3]], ['lineDay', [0, 1, 2, 3]], ['duel', [0, 1, 2]], ['raid', [0]], ['daily', [0, 1, 2]], ['party', [0]]];
for (let seed = 1; seed <= 40; seed++) {
  for (const [format, bursts] of formats) {
    for (const d of [1, 2, 3]) {
      for (const b of bursts) {
        const input = {
          seed: seed * 2654435761 >>> 0, burstIndex: b, format, difficulty: d, theme: THEMES[seed % 6], unlockLevel: (seed * 7) % 25,
          xform: format === 'lineDay' ? seed % 8 : 0, walkBoost: format === 'queue' && seed % 3 === 0 ? 'golden' : null,
          runOfDay: seed % 4, feverFired: b > 0 && seed % 5 === 0,
        };
        timelines.push({ input, sha256: sha(T.timelineFingerprint(T.buildBurst(input))) });
      }
    }
  }
}
const runs = [];
const profiles = ['novice', 'median', 'expert', 'onbeat', 'glance', 'walking', 'masher', 'bot', 'jitterbot'];
for (let k = 0; k < 72; k++) {
  const format = ['ride', 'queue', 'lineDay', 'raid'][k % 4];
  const burst = format === 'queue' || format === 'lineDay' ? k % 4 : 0;
  const fire = (format === 'queue' || format === 'lineDay') && burst > 0 && k % 3 === 0;
  const input = {
    seed: (k + 11) * 40503 >>> 0, burstIndex: burst, format, difficulty: 1 + (k % 3), theme: 'pirates', unlockLevel: 12,
    xform: format === 'lineDay' ? k % 8 : 0, walkBoost: null, runOfDay: k % 3, feverFired: fire,
  };
  const tl = T.buildBurst(input);
  // Carry a streak into later Bursts so tier drops and x4 show up in the vectors.
  const carry = burst > 0 ? { meter: fire ? 0 : 40, feverLeft: 0, streak: [0, 14, 33, 47][burst], feverReady: false } : S.NO_CARRY;
  const r = A.autoplayBurst(tl, profiles[k % profiles.length], k, carry);
  const proof = P.buildProof(tl, carry, r.sim.taps, r.result, { wallMs: r.stats.wallMs, pos: r.sim.pos });
  runs.push({
    proof,
    expect: {
      score: r.result.score, win: r.result.win, hits: r.result.legacyHits, maxStreak: r.result.maxStreak, freezes: r.result.freezes,
      bossDamage: r.result.bossDamage, elapsedMs: r.result.elapsedMs, anticipated: r.result.anticipated, tierDrops: r.result.tierDrops,
      feverReady: r.result.feverReady, flagged: P.verifyProof(proof).flagged ?? null,
    },
  });
}
const out = { v: 4, generated: 'tools/whack/gen-vectors.cjs', fingerprint: 'timelineFingerprint() in src/games/whack/timeline.ts', timelines, runs };
const file = path.resolve(__dirname, '../../src/games/whack/__vectors__/vectors.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`wrote ${timelines.length} timelines, ${runs.length} runs -> ${path.relative(process.cwd(), file)} (${fs.statSync(file).size} bytes)`);
