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

/** A thumb in a moving line: hits around the mark, early and late taps, bumps, mashes, bubbles landing. */
function humanTaps(sim, board, seed) {
  const next = lcg(seed ^ 0x5bd1e995);
  const taps = [];
  if (sim.key === 'bonk_race') {
    const end = sim.roundMs - 1;
    for (const s of board) {
      const roll = next() % 100;
      // Off the mark by -300..+400 ms, Shared Goldens tighter (people go for the downbeat).
      const off = s.sg > 0 ? (next() % 241) - 100 : (next() % 701) - 300;
      if (s.kind === 'lure' ? roll < 20 : roll < 72) taps.push([Math.max(0, Math.min(end, s.mark + off)), s.hole]);
      if (roll > 92) {
        const t = Math.min(end, s.at + (next() % 400));
        for (let k = 0; k < 3; k++) taps.push([Math.min(end, t + k * 85), next() % 9]);
      }
    }
    // Half the logs take Splashes: landings on half-bar downbeats, then 0-3 taps that may clear them.
    if (next() % 2 === 0) {
      const count = 1 + (next() % 3);
      let half = 2 + (next() % 6);
      for (let n = 1; n <= count && half < 22; n++) {
        const land = Math.floor((half * 4 * 220590) / 1000);
        taps.push([land, 1000 + n]);
        const k = next() % 4;
        for (let j = 0; j < k; j++) taps.push([Math.min(end, land + 200 + j * 180), next() % 9]);
        half += 3 + (next() % 8);
      }
    }
    taps.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    // One landing per n, at most 400 entries.
    return taps.slice(0, sim.maxTaps);
  }
  for (const q of board) {
    const roll = next() % 100;
    if (roll < 15) taps.push([q.unlockAt + (next() % 200), 10 + (next() % 4)]); // bump around the guard
    if (roll < 85) taps.push([Math.min(sim.roundMs - 1, q.unlockAt + 300 + (next() % 6000)), 10 + (roll < 60 ? q.correct : next() % q.choices)]);
    if (roll > 70) taps.push([Math.min(sim.roundMs - 1, q.closeAt + (next() % 2000)), 10 + (next() % 4)]); // late tap
  }
  taps.sort((a, b) => a[0] - b[0]);
  return taps.slice(0, sim.maxTaps);
}

/** Splashes due on a ghost seat: 0-3 landings on half-bar downbeats. */
function incomingFor(sim, seed) {
  if (sim.key !== 'bonk_race') return [];
  const next = lcg(seed ^ 0x2545f491);
  const out = [];
  let half = 3 + (next() % 5);
  const count = next() % 4;
  // Numbered from 5 so a ghost-filled human log (landings 1-3 of its own) never repeats an n.
  for (let n = 5; n < 5 + count && half < 22; n++) {
    out.push([Math.floor((half * 4 * 220590) / 1000), n]);
    half += 2 + (next() % 9);
  }
  return out;
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
      const incoming = incomingFor(sim, seed);
      const until = 1000 + ((i * 977) % (sim.roundMs - 2000));
      const logs = {
        human,
        bot: sim.botTaps(board, seed, seat, profile),
        ghost_fill: sim.ghostFill(board, seed, seat, human, until, profile, incoming.filter(([t]) => t >= until)),
        ghost_incoming: sim.botTaps(board, seed, seat, profile, 0, incoming),
        empty: [],
      };
      const out = { seed, seat, profile, until_ms: until, incoming, band: sim.bandCheck(board), band_ok: sim.bandOk(board), logs: {} };
      const results = [];
      for (const [name, taps] of Object.entries(logs)) {
        const r = sim.resolve(board, taps);
        results.push(r);
        out.logs[name] = { taps, score: r.score, hash: sim.resultHash(r), splashes: sim.splashEarned(r) };
      }
      // The four logs as one room: SNATCH settle, then each seat's key moment.
      const settle = sim.settle(results);
      out.settle = JSON.parse(JSON.stringify(settle));
      Object.keys(logs).forEach((name, j) => {
        out.logs[name].explain = JSON.parse(JSON.stringify(sim.explain(board, logs[name], settle, j)));
      });
      // Prefix resolve (Bonk Royale splits) on the human log.
      const pr = sim.resolve(board, human, until);
      out.prefix = { until_ms: until, score: pr.score, hash: sim.resultHash(pr) };
      return out;
    });
    const file = path.join(outDir, `${sim.key}.json`);
    fs.writeFileSync(file, JSON.stringify({ game: sim.key, sim_version: sim.version, round_ms: sim.roundMs, sim_bundle: hash, vectors }));
    console.log(`${sim.key}@${sim.version}: ${vectors.length} seeds x 5 logs -> ${path.relative(root, file)} (${fs.statSync(file).size} bytes)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
