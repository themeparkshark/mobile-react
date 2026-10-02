#!/usr/bin/env node
'use strict';
/**
 * Banana Basket bot calibration (design rev 8, 5.4 / 5.5 / G6).
 *
 * Runs every bot on N seeds per difficulty on the full Ride (and ride_intro
 * for the first-ticket check), derives bot-seeded star targets from the G6
 * percentile rules and writes studio/design/banana-calibration.md with every
 * G6 line marked PASS or MISS. Bots set starting values only; P2 human
 * telemetry locks the real targets (G19).
 *
 *   node tools/banana/calibrate.cjs [seeds=300] [--write-constants]
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const N = Number(process.argv.find((a) => /^\d+$/.test(a)) || 300);
const sim = loadTs('src/games/banana-basket/sim.ts');
const bots = loadTs('src/games/banana-basket/bots.ts');
const C = loadTs('src/games/banana-basket/constants.ts');
const OUT = '/Users/dustinsparage/apps/tps-prime-time-audit/studio/design/banana-calibration.md';

const B = bots;
const KINDS = [B.BOT_KID, B.BOT_CASUAL, B.BOT_HUMAN, B.BOT_HUMAN_NO_BALL, B.BOT_EXPERT, B.BOT_SUPER, B.BOT_EXPERT_NO_BALL, B.BOT_EXPERT_NO_AIM, B.BOT_PULSE, B.BOT_STARE, B.BOT_SHIELD, B.BOT_LINE_WALKER];

function runAll(rules, d) {
  const res = {};
  for (const k of KINDS) {
    const scores = [];
    let forks = 0;
    let both = 0;
    let gh = 0;
    let maxMq = 0;
    for (let i = 0; i < N; i++) {
      const seed = 100000 + d * 7919 + i * 104729;
      const s = sim.createSim({ seed, difficulty: d, mode: sim.MODE_RIDE, rules, deck: 'park', unlock: 3, cards: 0xffff, assist: false, twist: 0 });
      bots.runBot(s, bots.createBot(k, seed ^ 0x55), (st, t, q) => {
        sim.step(st, t, q);
        if (st.ghQ > 0 && st.rushOn) gh++;
      });
      scores.push(sim.finalScore(s));
      forks += s.forksBall + s.forksBunch + s.forksBoth;
      both += s.forksBoth;
      void maxMq;
    }
    scores.sort((a, b) => a - b);
    res[k] = { scores, forks, both, ghInRush: gh };
  }
  return res;
}

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * arr.length)))];
const share = (arr, t) => arr.filter((v) => v >= t).length / arr.length;
const med = (arr) => pct(arr, 50);
const round5 = (v) => Math.round(v / 50) * 50;
const cv = (arr) => {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length);
  return sd / m;
};

const lines = [];
const table = [];
const gates = [];
const t0 = Date.now();
for (let d = 1; d <= 3; d++) {
  const R = runAll(C.R_RIDE, d);
  const S = (k) => R[k].scores;
  // 1 star: Human >= 95% and Human-no-ball 80-88%.
  const one = round5(Math.min(pct(S(B.BOT_HUMAN), 4), pct(S(B.BOT_HUMAN_NO_BALL), 16)));
  // 3 stars: Human 15-25% (p80), Expert >= 60%.
  const three = round5(Math.min(pct(S(B.BOT_HUMAN), 80), pct(S(B.BOT_EXPERT), 38)));
  const two = round5(Math.sqrt(one * three));
  // Crown: Super >= 50%, Expert <= 20%, Human <= 2%.
  const crown = round5(Math.max(pct(S(B.BOT_EXPERT), 81), pct(S(B.BOT_HUMAN), 99), Math.min(pct(S(B.BOT_SUPER), 48), pct(S(B.BOT_EXPERT), 95))));
  table.push([one, two, three, crown]);
  const t = [one, two, three, crown];
  const g = (name, ok, val) => gates.push(`| d${d} | ${name} | ${val} | ${ok ? 'PASS' : 'MISS'} |`);
  g('Human 1-star >= 95%', share(S(B.BOT_HUMAN), one) >= 0.95, `${Math.round(share(S(B.BOT_HUMAN), one) * 100)}%`);
  const hnb = share(S(B.BOT_HUMAN_NO_BALL), one);
  g('Human-no-ball 1-star 80-88%', hnb >= 0.8 && hnb <= 0.88, `${Math.round(hnb * 100)}%`);
  if (d === 1) g('Kid d1 1-star >= 70%', share(S(B.BOT_KID), one) >= 0.7, `${Math.round(share(S(B.BOT_KID), one) * 100)}%`);
  const h3 = share(S(B.BOT_HUMAN), three);
  g('Human 3-star 15-25%', h3 >= 0.15 && h3 <= 0.25, `${Math.round(h3 * 100)}%`);
  g('Casual 3-star <= 8%', share(S(B.BOT_CASUAL), three) <= 0.08, `${Math.round(share(S(B.BOT_CASUAL), three) * 100)}%`);
  g('Expert 3-star >= 60%', share(S(B.BOT_EXPERT), three) >= 0.6, `${Math.round(share(S(B.BOT_EXPERT), three) * 100)}%`);
  g('Crown: Super Expert >= 50%', share(S(B.BOT_SUPER), crown) >= 0.5, `${Math.round(share(S(B.BOT_SUPER), crown) * 100)}%`);
  g('Crown: Expert <= 20%', share(S(B.BOT_EXPERT), crown) <= 0.2, `${Math.round(share(S(B.BOT_EXPERT), crown) * 100)}%`);
  g('Crown: Human <= 2%', share(S(B.BOT_HUMAN), crown) <= 0.02, `${Math.round(share(S(B.BOT_HUMAN), crown) * 100)}%`);
  const sup = med(S(B.BOT_SUPER)) / med(S(B.BOT_EXPERT));
  g('Super Expert median >= 15% above Expert', sup >= 1.15, `${Math.round((sup - 1) * 100)}%`);
  const eh = med(S(B.BOT_EXPERT)) / med(S(B.BOT_HUMAN));
  g('Expert/Human median 2.0-3.5', eh >= 2 && eh <= 3.5, eh.toFixed(2));
  const enb = 1 - med(S(B.BOT_EXPERT_NO_BALL)) / med(S(B.BOT_EXPERT));
  g('Expert-no-ball >= 25% below Expert', enb >= 0.25, `${Math.round(enb * 100)}%`);
  const ena = 1 - med(S(B.BOT_EXPERT_NO_AIM)) / med(S(B.BOT_EXPERT));
  g('Expert-no-aim >= 12% below Expert', ena >= 0.12, `${Math.round(ena * 100)}%`);
  const fb = R[B.BOT_EXPERT].forks ? R[B.BOT_EXPERT].both / R[B.BOT_EXPERT].forks : 0;
  g('Expert forks_both <= 30% of forks', fb <= 0.3, `${Math.round(fb * 100)}% of ${R[B.BOT_EXPERT].forks}`);
  g('Pulse median <= no-freeze Expert', med(S(B.BOT_PULSE)) <= med(S(B.BOT_EXPERT)), `${med(S(B.BOT_PULSE))} vs ${med(S(B.BOT_EXPERT))}`);
  g('Shield median <= no-freeze Expert', med(S(B.BOT_SHIELD)) <= med(S(B.BOT_EXPERT)), `${med(S(B.BOT_SHIELD))} vs ${med(S(B.BOT_EXPERT))}`);
  const st = med(S(B.BOT_STARE)) / med(S(B.BOT_EXPERT)) - 1;
  g('Stare <= +2%', st <= 0.02, `${(st * 100).toFixed(1)}%`);
  g('Expert CV <= 12% (seed fairness)', cv(S(B.BOT_EXPERT)) <= 0.12, `${(cv(S(B.BOT_EXPERT)) * 100).toFixed(1)}%`);
  g('No Golden Hour frame in Gold Rush', KINDS.every((k) => R[k].ghInRush === 0), `${KINDS.reduce((a, k) => a + R[k].ghInRush, 0)} frames`);
  lines.push(`### Difficulty ${d} (full Ride, ${N} seeds)`, '', '| Bot | p10 | p25 | median | p75 | p90 |', '|---|---|---|---|---|---|');
  for (const k of KINDS) {
    const a = S(k);
    lines.push(`| ${bots.BOT_NAMES[k]} | ${pct(a, 10)} | ${pct(a, 25)} | ${med(a)} | ${pct(a, 75)} | ${pct(a, 90)} |`);
  }
  lines.push('');
  // First-ticket check on ride_intro (G19 proxy): Kid and Human first attempts vs the 1-star target.
  const I = runAll(C.R_INTRO, d);
  g('ride_intro: Human 1-star (first-ticket proxy) >= 85%', share(I[B.BOT_HUMAN].scores, one) >= 0.85, `${Math.round(share(I[B.BOT_HUMAN].scores, one) * 100)}%`);
  g('ride_intro: Kid 1-star', true, `${Math.round(share(I[B.BOT_KID].scores, one) * 100)}% (info)`);
  void t;
}
const md = [
  '# Banana Basket: bot calibration (design rev 8, G6)',
  '',
  `Generated ${new Date().toISOString()} by \`tools/banana/calibrate.cjs\` on branch claude/mg-banana (sim bb2r8), ${N} seeds per difficulty per bot. Bots set starting values only; P2 human telemetry locks the targets (G19).`,
  '',
  '## Bot-seeded star table (the game uses these rows; doc-sync accepts them until the doc table is updated)',
  '',
  '| Difficulty | 1 star | 2 stars | 3 stars | Gold Crown |',
  '|---|---|---|---|---|',
  ...table.map((r, i) => `| ${i + 1} | ${r.join(' | ')} |`),
  '',
  'Why the doc table (360-3500) does not fit: with rev 8 scoring (quarters, x4 chain, POP grade on hanging coins at 50 base and Lucky Bunch at 150 base) an engaged run scores 4,000-10,000. The doc values were written before the scoring and prize economy were final.',
  '',
  '## G6 gates',
  '',
  '| Difficulty | Gate | Value | Result |',
  '|---|---|---|---|',
  ...gates,
  '',
  '## Score distributions',
  '',
  ...lines,
  '## Design notes from calibration',
  '',
  '- Crosswind: the doc text "±6 fu/s per step" is 360 fu/s², which carries the ball off the field in one cycle. The game uses 60 fu/s² (about 50 fu of drift per bounce cycle). Designer to confirm.',
  '- Falling-item POPs by the ball are limited to the sky band (y <= 380) with a core-overlap radius; with the full sprite radius the ball vacuumed up most bananas and the basket stopped mattering (bot runs caught 7 bananas in the basket against 49 POPs).',
  `- Run time: ${Math.round((Date.now() - t0) / 1000)} s.`,
  '',
];
fs.writeFileSync(OUT, md.join('\n'));
console.log(`wrote ${OUT}`);
console.log(table.map((r, i) => `d${i + 1}: ${r.join(' / ')}`).join('\n'));
console.log(gates.filter((g) => g.includes('MISS')).join('\n'));
if (process.argv.includes('--write-constants')) {
  const p = path.resolve(__dirname, '../../src/games/banana-basket/constants.ts');
  let src = fs.readFileSync(p, 'utf8');
  const rows = table.map((r) => `  [${r.join(', ')}],`).join('\n');
  src = src.replace(/export const STARS_RIDE[\s\S]*?\n\];/, `export const STARS_RIDE: readonly (readonly [number, number, number, number])[] = [\n  [${table[0].join(', ')}],\n${rows}\n];`);
  fs.writeFileSync(p, src);
  console.log('updated STARS_RIDE in constants.ts');
}
