'use strict';
// Dev tuning report (not a test file): node tools/tests/whack-tune.cjs [runs]
const { loadTs } = require('./helpers/ts-module.cjs');
const tl = loadTs('src/games/whack/timeline.ts');
const ap = loadTs('src/games/whack/autoplayer.ts');
const N = Number(process.argv[2] || 100);
function ride(profile, d) {
  let wins = 0, three = 0, fill = [], freezes = 0, dis = 0;
  for (let i = 0; i < N; i++) {
    const t = tl.buildBurst({ seed: 1000 + i * 7919, burstIndex: 0, format: 'ride', difficulty: d, theme: 'pirates', unlockLevel: 0 });
    const r = ap.autoplayBurst(t, profile, 77 + i);
    if (r.result.win) { wins++; fill.push(r.result.winAt); }
    if (r.result.stars === 3) three++;
    freezes += r.result.freezes;
    dis += ap.disengagedEscapes(t, r.sim.taps);
  }
  fill.sort((a, b) => a - b);
  return `ride d${d} ${profile.padEnd(8)} win ${(100 * wins / N).toFixed(0)}% 3star ${(100 * three / N).toFixed(0)}% medFill ${fill.length ? (fill[fill.length >> 1] / 1000).toFixed(1) : '-'}s freezes/run ${(freezes / N).toFixed(2)} disengagedEsc ${dis}`;
}
function queue(profile, d, unlock) {
  const scores = [];
  for (let i = 0; i < N; i++) {
    let carry, total = 0;
    for (let b = 0; b < 5; b++) {
      const t = tl.buildBurst({ seed: 5000 + i * 104729, burstIndex: b, format: 'queue', difficulty: d, theme: 'park', unlockLevel: unlock });
      const r = ap.autoplayBurst(t, profile, 91 + i * 5 + b, carry);
      carry = r.result.carry; total += r.result.score;
    }
    scores.push(total);
  }
  scores.sort((a, b) => a - b);
  const q = (f) => scores[Math.min(scores.length - 1, Math.floor(f * scores.length))];
  return `queue d${d} L${unlock} ${profile.padEnd(8)} p10 ${q(0.1)} med ${q(0.5)} p90 ${q(0.9)} p99 ${q(0.99)}`;
}
for (const d of [1, 2, 3]) for (const p of ['novice', 'median', 'walking', 'glance', 'expert', 'masher', 'bot']) console.log(ride(p, d));
for (const L of [0, 5, 20]) for (const p of ['novice', 'median', 'expert', 'masher', 'walking']) console.log(queue(p, 2, L));
