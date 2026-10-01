'use strict';
/**
 * Regenerates bonk_race_vectors.json from src/games/party/bonkRace.ts.
 * The same file is copied to the backend (tests/Fixtures/party/) and replayed by
 * PHPUnit, so the TS and PHP ports of the Bonk Race sim are proven identical.
 *
 *   node tools/tests/fixtures/party/generate-bonk-race-vectors.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../../helpers/ts-module.cjs');

const sim = loadTs('src/games/party/bonkRace.ts');

function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function timelineHash(spawns) {
  return fnv(spawns.map((s) => `${s.id},${s.at},${s.hole},${s.kind},${s.up}`).join(';'));
}

/** A human-ish log: hits, late taps, whiffs, bump bursts, lure bonks. */
function humanTaps(spawns, seed) {
  const next = sim.rng((seed ^ 0x5bd1e995) >>> 0);
  const taps = [];
  for (const s of spawns) {
    const roll = next() % 100;
    const react = 250 + (next() % 900);
    if (s.kind === 'lure' ? roll < 20 : roll < 70) taps.push([Math.min(sim.ROUND_MS, s.at + react), s.hole]);
    if (roll > 93) {
      const t = Math.min(sim.ROUND_MS, s.at + (next() % 400));
      taps.push([t, next() % 9]);
      taps.push([Math.min(sim.ROUND_MS, t + 90), next() % 9]);
      taps.push([Math.min(sim.ROUND_MS, t + 180), next() % 9]);
    }
  }
  taps.sort((a, b) => a[0] - b[0]);
  return taps.slice(0, sim.MAX_TAPS);
}

const vectors = [];
let seed = 0x1234abcd;
const seeds = [0, 1, 7, 42, 4294967295, 2147483648, 3735928559];
while (seeds.length < 160) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  seeds.push(seed);
}
const profiles = ['rookie', 'regular', 'ace'];
seeds.forEach((s, i) => {
  const spawns = sim.buildTimeline(s);
  const human = humanTaps(spawns, s);
  const profile = profiles[i % 3];
  const seat = i % 4;
  const bot = sim.botTaps(spawns, s, seat, profile);
  const until = 3000 + (i * 977) % 15000;
  const filled = sim.ghostFill(spawns, s, seat, human, until, profile);
  const plain = (r) => JSON.parse(JSON.stringify(r));
  vectors.push({
    seed: s,
    spawn_count: spawns.length,
    timeline_hash: timelineHash(spawns),
    first_spawns: plain(spawns.slice(0, 4)),
    human: { taps: human, result: plain(sim.resolve(spawns, human)), hash: sim.resultHash(sim.resolve(spawns, human)) },
    bot: { seat, profile, taps: bot, hash: sim.resultHash(sim.resolve(spawns, bot)) },
    ghost_fill: { seat, profile, until_ms: until, taps_hash: fnv(JSON.stringify(filled)), hash: sim.resultHash(sim.resolve(spawns, filled)) },
  });
});

const out = { version: sim.BONK_RACE_VERSION, generated_by: 'src/games/party/bonkRace.ts', vectors };
const file = path.join(__dirname, 'bonk_race_vectors.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`wrote ${vectors.length} vectors to ${path.relative(process.cwd(), file)} (${fs.statSync(file).size} bytes)`);
