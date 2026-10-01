#!/usr/bin/env node
/**
 * Boss Brawl v7 balance readout (design 9.1): every bot over N seeds per boss.
 *   node tools/boss/balance.cjs [seeds=200] [boss=kraken]
 */
const path = require('node:path');
process.chdir(path.resolve(__dirname, '../..'));
const { loadTs } = require('../tests/helpers/ts-module.cjs');
const bots = loadTs('src/games/boss/sim/bots.ts');
const round = loadTs('src/games/boss/sim/round.ts');
const N = Number(process.argv[2] || 200);
const bosses = (process.argv[3] || 'kraken').split(',');
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pct = (xs, f) => Math.round((100 * xs.filter(f).length) / xs.length);
for (const boss of bosses) {
  const rows = {};
  for (const name of ['padMasher', 'laneMasher', 'guesser', 'kid', 'ringBlind', 'median', 'easySlam', 'mastery']) {
    const rs = [];
    for (let s = 1; s <= N; s++) rs.push(round.summarize(bots.runBotRound(boss, s * 7777, bots.BOTS[name], { variant: 1 })));
    rows[name] = rs;
  }
  const m = med(rows.median.map((s) => s.damage));
  console.log(`\n${boss} (${N} seeds) median=${m}`);
  for (const [name, rs] of Object.entries(rows)) {
    const d = med(rs.map((s) => s.damage));
    console.log(`${name.padEnd(11)} dmg ${String(d).padStart(5)} (${(d / m * 100).toFixed(0).padStart(3)}%) stars ${med(rs.map((s) => s.stars))} KD ${pct(rs, (s) => s.knockdowns > 0)}% TKO ${pct(rs, (s) => s.tko)}% dizzy ${pct(rs, (s) => s.dizzy > 0)}% 3star ${pct(rs, (s) => s.stars === 3)}% chain ${med(rs.map((s) => s.maxChain))} breaks ${med(rs.map((s) => s.breaks))}`);
  }
  const walk = []; for (let s = 1; s <= N; s++) walk.push(round.summarize(bots.runBotRound(boss, s * 7777, bots.BOTS.median, { variant: 1, walk: true })).damage);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`walk/median mean ratio ${(mean(walk) / mean(rows.median.map((s) => s.damage))).toFixed(3)}`);
}
