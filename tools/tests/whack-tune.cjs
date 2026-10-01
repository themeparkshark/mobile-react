'use strict';
// Dev tuning report (not a test file): node tools/tests/whack-tune.cjs [runs]
// Prints ride win rates and fill times, Queue Run score quantiles per profile,
// and the v4 skill spread (top-1% expert / median median, target 2.0-2.4).
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
function queueScores(profile, d, unlock, policy, n = N, runOfDay = 0) {
  const scores = [];
  for (let i = 0; i < n; i++) {
    const r = ap.autoplayRun({ seed: 5000 + i * 104729, format: 'queue', difficulty: d, theme: 'park', unlockLevel: unlock, runOfDay }, 4, profile, 91 + i, policy, tl.buildBurst);
    scores.push(r.total);
  }
  return scores.sort((a, b) => a - b);
}
const qt = (s, f) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
function queue(profile, d, unlock, policy) {
  const s = queueScores(profile, d, unlock, policy);
  return `queue d${d} L${unlock} ${profile.padEnd(8)} ${policy.padEnd(6)} p10 ${qt(s, 0.1)} med ${qt(s, 0.5)} p90 ${qt(s, 0.9)} p99 ${qt(s, 0.99)}`;
}
if (!process.argv.includes('--queue-only')) for (const d of [1, 2, 3]) for (const p of ['novice', 'median', 'walking', 'glance', 'expert', 'masher', 'bot']) console.log(ride(p, d));
for (const L of [0, 5, 20]) for (const p of ['novice', 'median', 'expert', 'masher', 'walking']) console.log(queue(p, 2, L, p === 'expert' ? 'finale' : 'now'));
const ex = queueScores('expert', 2, 20, 'finale', N * 2);
const md = queueScores('median', 2, 20, 'now', N * 2);
console.log(`spread top1% expert / median median = ${(qt(ex, 0.99) / qt(md, 0.5)).toFixed(2)} (target 2.0-2.4); expert med / median med = ${(qt(ex, 0.5) / qt(md, 0.5)).toFixed(2)} (>= 1.5)`);
const cv = (s) => { const m = s.reduce((a, b) => a + b, 0) / s.length; return Math.sqrt(s.reduce((a, b) => a + (b - m) * (b - m), 0) / s.length) / m; };
// Luck check: the same profile on ONE board seed (Line of the Day), different players.
const fixed = (p, pol) => { const o = []; for (let i = 0; i < N; i++) o.push(ap.autoplayRun({ seed: 424242, format: 'lineDay', difficulty: 2, theme: 'park', unlockLevel: 0 }, 4, p, 300 + i, pol, tl.buildBurst).total); return o; };
console.log(`CV on one seed: expert ${cv(fixed('expert', 'finale')).toFixed(3)} median ${cv(fixed('median', 'now')).toFixed(3)} (<= 0.12); across seeds expert ${cv(ex).toFixed(3)} median ${cv(md).toFixed(3)}`);
