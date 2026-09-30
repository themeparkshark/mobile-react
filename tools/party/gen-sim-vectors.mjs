#!/usr/bin/env node
/**
 * Golden vectors for every Line Party sim (design 11.3: 200+ per game).
 *
 *   node tools/party/gen-sim-vectors.mjs
 *
 * Writes tools/fixtures/party-sim/<game>.json. Each vector is a seed plus a tap
 * log (human-like, bot, ghost-filled, bump-heavy) and the exact {score, hash}
 * the sim returns. The same files run in the node tests, in the backend's
 * sidecar and PHP-port tests (copied to tests/Fixtures/party-sim/), and in the
 * in-app Hermes check, so any engine or port difference fails loudly.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildBundle } from '../build-sim-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tools/fixtures/party-sim');
const PER_GAME = 208;

export function loadBundle() {
  const { code, hash } = buildBundle();
  const module = { exports: {} };
  vm.runInNewContext(`(function (module, exports) {${code}\n})`, { Math })(module, module.exports);
  return { hash, sims: module.exports.PARTY_SIMS };
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
}

/** A thumb in a moving line: real hits, late taps, bumps, double taps. */
function humanTaps(sim, board, seed) {
  const next = lcg(seed ^ 0x5bd1e995);
  const taps = [];
  const holes = sim.key === 'bonk_race' ? 9 : 4;
  if (sim.key === 'bonk_race') {
    for (const s of board) {
      const roll = next() % 100;
      if (s.kind === 'lure' ? roll < 20 : roll < 70) taps.push([Math.min(sim.roundMs, s.at + 150 + (next() % 1000)), s.hole]);
      if (roll > 92) {
        const t = Math.min(sim.roundMs, s.at + (next() % 400));
        for (let k = 0; k < 3; k++) taps.push([Math.min(sim.roundMs, t + k * 85), next() % holes]);
      }
    }
  } else {
    for (const q of board) {
      const roll = next() % 100;
      if (roll < 15) taps.push([q.unlockAt + (next() % 200), next() % 4]); // bump before the guard
      if (roll < 85) taps.push([Math.min(sim.roundMs, q.unlockAt + 300 + (next() % 6000)), roll < 60 ? q.correct : next() % q.choices]);
      if (roll > 70) taps.push([Math.min(sim.roundMs, q.unlockAt + 6500 + (next() % 2000)), next() % 4]); // late tap
    }
  }
  taps.sort((a, b) => a[0] - b[0]);
  return taps.slice(0, sim.maxTaps);
}

function main() {
  const { hash, sims } = loadBundle();
  fs.mkdirSync(outDir, { recursive: true });
  const profiles = ['rookie', 'regular', 'ace'];
  for (const sim of Object.values(sims)) {
    const seeds = [0, 1, 7, 42, 4294967295, 2147483648, 3735928559];
    const gen = lcg(0x1234abcd ^ sim.version);
    while (seeds.length < PER_GAME) seeds.push(gen());
    const vectors = seeds.map((seed, i) => {
      const board = sim.build(seed);
      const seat = i % 4;
      const profile = profiles[i % 3];
      const human = humanTaps(sim, board, seed);
      const until = 1000 + ((i * 977) % (sim.roundMs - 2000));
      const logs = {
        human,
        bot: sim.botTaps(board, seed, seat, profile),
        ghost_fill: sim.ghostFill(board, seed, seat, human, until, profile),
        empty: [],
      };
      const out = { seed, seat, profile, until_ms: until, logs: {} };
      for (const [name, taps] of Object.entries(logs)) {
        const r = sim.resolve(board, taps);
        out.logs[name] = { taps, score: r.score, hash: sim.resultHash(r) };
      }
      return out;
    });
    const file = path.join(outDir, `${sim.key}.json`);
    fs.writeFileSync(file, JSON.stringify({ game: sim.key, sim_version: sim.version, round_ms: sim.roundMs, sim_bundle: hash, vectors }));
    console.log(`${sim.key}@${sim.version}: ${vectors.length} seeds x 4 logs -> ${path.relative(root, file)} (${fs.statSync(file).size} bytes)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
