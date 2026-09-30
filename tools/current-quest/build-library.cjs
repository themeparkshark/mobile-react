#!/usr/bin/env node
'use strict';
/**
 * Current Quest library builder (design 5.1 / 5.2).
 *
 *   node tools/current-quest/build-library.cjs [--quick] [--out-server <dir>]
 *
 * Generates candidate 5x5 lagoon boards, solves them with the same solver the
 * app ships (src/games/current-quest/solver.ts), filters, grades, ranks by
 * quality, rejects near-duplicates under all 8 transforms and writes:
 *   - src/games/current-quest/boards.v2.client.ts  (pool + teach boards, NO solutions, NO sealed ids)
 *   - <server dir>/boards.v2.server.json            (same ids WITH canonical solutions)
 *   - <server dir>/boards.v2.sealed.json            (Daily Tide / Showdown set, server only)
 *   - <server dir>/library-report.json              (counts, filters, hashes)
 * Deterministic: a fixed seed per cell, so re-running produces the same files.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadTs } = require('../tests/helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const R = loadTs('src/games/current-quest/rules.ts');
const S = loadTs('src/games/current-quest/solver.ts');

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const outServerIdx = args.indexOf('--out-server');
const SERVER_DIR = outServerIdx >= 0 ? args[outServerIdx + 1]
  : '/Users/dustinsparage/apps/tps-prime-time-audit/studio/currentquest/library';

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ---------------------------------------------------------------------------
// Cells (slot x mechanic set) and their filters

const CELLS = [
  { key: 'C-warmup', set: 'C', slot: 'warmup', count: 60, par: [3, 5], pearls: [2, 2], rocks: [3, 6], runs: [1, 3], sand: [0, 0], P: [0], carries: 1, maxDecision: 1, trap: false, maxOptimal: 99 },
  { key: 'C-standard', set: 'C', slot: 'standard', count: 60, par: [5, 7], pearls: [2, 3], rocks: [4, 7], runs: [2, 4], sand: [0, 0], P: [0], carries: 2, trap: true, maxOptimal: 6 },
  { key: 'C-treasure', set: 'C', slot: 'treasure', count: 120, par: [6, 8], pearls: [2, 3], rocks: [4, 7], runs: [3, 4], sand: [0, 0], P: [0], carries: 3, trap: true, maxOptimal: 6, riptideShare: 0.6 },
  { key: 'CT-standard', set: 'CT', slot: 'standard', count: 60, par: [5, 7], pearls: [2, 3], rocks: [3, 6], runs: [2, 3], sand: [2, 4], P: [3, 4], carries: 2, trap: true, tide: true, maxOptimal: 6 },
  { key: 'CT-treasure', set: 'CT', slot: 'treasure', count: 120, par: [6, 8], pearls: [2, 3], rocks: [3, 6], runs: [2, 4], sand: [2, 4], P: [3, 4], carries: 3, trap: true, tide: true, maxOptimal: 6, riptideShare: 0.6 },
];
const SEALED = [
  { key: 'sealed-CT-standard', base: 'CT-standard', count: 60 },
  { key: 'sealed-CT-treasure', base: 'CT-treasure', count: 60 },
];

const DIRS = '^>v<';

function candidate(r, cell) {
  const tiles = new Array(25).fill('.');
  const used = new Set();
  const P = pick(r, cell.P);
  // Currents: straight runs of 2..4 same-direction tiles.
  const runs = ri(r, cell.runs[0], cell.runs[1]);
  for (let k = 0; k < runs; k++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const d = ri(r, 0, 3);
      const len = ri(r, 2, 4);
      let p = ri(r, 0, 24);
      const cells = [];
      let ok = true;
      for (let j = 0; j < len; j++) {
        if (p < 0 || tiles[p] !== '.') { ok = false; break; }
        cells.push(p);
        p = R.stepCell(p, d);
      }
      if (!ok) continue;
      for (const c of cells) tiles[c] = DIRS[d];
      break;
    }
  }
  const openCells = () => tiles.map((t, i) => (t === '.' && !used.has(i) ? i : -1)).filter((i) => i >= 0);
  const rocks = ri(r, cell.rocks[0], cell.rocks[1]);
  for (let k = 0; k < rocks; k++) { const o = openCells(); if (!o.length) break; tiles[pick(r, o)] = '#'; }
  const sand = ri(r, cell.sand[0], cell.sand[1]);
  for (let k = 0; k < sand; k++) { const o = openCells(); if (!o.length) break; tiles[pick(r, o)] = 's'; }
  const take = (pred, from) => { const src = from || tiles.map((_, i) => i); const o = src.filter((i) => pred(tiles[i]) && !used.has(i)); if (!o.length) return -1; const c = pick(r, o); used.add(c); return c; };
  const start = take((t) => t === '.');
  if (start < 0) return null;
  // Chest on a reachable open cell, then pearls on cells still reachable
  // with the chest closed (a locked chest blocks like coral).
  const seen0 = reach({ tiles: tiles.join(''), start, chest: -1, P });
  const chest = take((t) => t === '.', [...seen0].filter((i) => i !== start));
  if (chest < 0) return null;
  const seen = reach({ tiles: tiles.join(''), start, chest, P });
  const reachable = [...seen].filter((i) => i !== start && i !== chest);
  if (reachable.length < 5) return null;
  const nP = ri(r, cell.pearls[0], cell.pearls[1]);
  const pearls = [];
  for (let k = 0; k < nP; k++) { const c = take((t) => t !== '#', reachable); if (c >= 0) pearls.push(c); }
  const golden = take((t) => t !== '#', reachable);
  if (golden < 0 || pearls.length !== nP) return null;
  return { tiles: tiles.join(''), start, chest, pearls: pearls.sort((a, b) => a - b), golden, P };
}

/** Cells visited by any stroke sequence from the start (chest closed, pearls ignored). */
function reach(b) {
  const board = { ...b, pearls: [0], golden: -1, id: 'r', name: 'r', slot: 'standard', set: 'C', ruleset: 2, par: 0, parGold: 0, authorRiptide: 0 };
  const M = b.P ? b.P * 2 : 1;
  const seenState = new Set([b.start * 16 + 0]);
  const cells = new Set([b.start]);
  const queue = [[b.start, 0]];
  while (queue.length) {
    const [pos, m] = queue.shift();
    const tide = R.tideAt(b.P, m, 0);
    for (let a = 0; a < (b.P ? 5 : 4); a++) {
      const sim = R.simulateStroke(board, pos, 0, false, tide, a === 4 ? -1 : a);
      if (sim.bump) continue;
      for (const c of sim.path) cells.add(c);
      const key = sim.pos * 16 + ((m + 1) % M);
      if (!seenState.has(key)) { seenState.add(key); queue.push([sim.pos, (m + 1) % M]); }
    }
  }
  return cells;
}

function asBoard(c, cell, id) {
  return { id, name: id, slot: cell.slot, set: cell.set, ruleset: 2, tiles: c.tiles, start: c.start, chest: c.chest, pearls: c.pearls, golden: c.golden, P: c.P, par: 0, parGold: 0, authorRiptide: 0 };
}

/** Greedy Manhattan walker (trap filter): chase the nearest pearl, then the chest. */
function greedy(board, limit) {
  let run = R.createRun([board], R.PUZZLE_KNOBS);
  const man = (a, b) => Math.abs(R.rowOf(a) - R.rowOf(b)) + Math.abs(R.colOf(a) - R.colOf(b));
  for (let n = 0; n < limit; n++) {
    const v = run.voyage;
    const goals = board.pearls.filter((p, k) => !(v.mask & (1 << k)));
    const targets = goals.length ? goals : [board.chest];
    let best = -1;
    let bestScore = Infinity;
    for (let a = 0; a < 4; a++) {
      const pv = R.previewFor(run, a);
      if (!pv.valid) continue;
      const land = pv.path[pv.path.length - 1];
      const score = pv.clears ? -1 : Math.min(...targets.map((t) => man(land, t))) - pv.pearls * 3;
      if (score < bestScore) { bestScore = score; best = a; }
    }
    if (best < 0) return Infinity;
    const res = R.applyAction(run, best);
    run = res.run;
    if (run.complete) return n + 1;
  }
  return Infinity;
}

function withTiles(board, tiles, P) { return { ...board, tiles, P }; }

function tideMatters(board, sol) {
  if (!board.P) return false;
  const flat = S.solveBoard(withTiles(board, board.tiles, 0));
  if (!flat.solvable || flat.par !== sol.par || flat.parGold !== sol.parGold) return true;
  // Phase shifted by one move.
  const shifted = S.distanceFrom(board, { pos: board.start, mask: 0, golden: false, moves: 0, phase: 1 }, false);
  return shifted !== sol.par;
}

function spread(board) {
  const rows = new Set();
  const cols = new Set();
  for (let i = 0; i < 25; i++) if (board.tiles[i] !== '.') { rows.add(R.rowOf(i)); cols.add(R.colOf(i)); }
  return (rows.size + cols.size) / 10;
}

function signature(board) {
  // Tile string with objects overlaid, for near-duplicate checks.
  const t = board.tiles.split('');
  t[board.start] = 'S'; t[board.chest] = 'T'; t[board.golden] = 'G';
  for (const p of board.pearls) t[p] = 'p';
  return t.join('');
}

function allTransforms(board) {
  const out = [];
  for (let tf = 0; tf < 8; tf++) out.push(signature(R.transformBoard(board, tf)));
  return out;
}

function hamming(a, b) { let d = 0; for (let i = 0; i < 25; i++) if (a[i] !== b[i]) d++; return d; }

const NAME_A = ['Coral', 'Tidal', 'Pearl', 'Lagoon', 'Driftwood', 'Sandy', 'Bubble', 'Seashell', 'Sunny', 'Breezy', 'Foamy', 'Starfish', 'Kelp', 'Current', 'Splashy', 'Reef', 'Clamshell', 'Gull', 'Harbor', 'Treasure'];
const NAME_B = ['Two-Step', 'Corner', 'Shortcut', 'Loop', 'Detour', 'Dash', 'Drift', 'Hop', 'Glide', 'Zigzag', 'Slide', 'Sprint', 'Run', 'Crossing', 'Channel', 'Switchback', 'Getaway', 'Ride', 'Shuffle', 'Wander'];

function nameFor(r) { return `${pick(r, NAME_A)} ${pick(r, NAME_B)}`; }

function ahaFor(board, sol) {
  const bits = [];
  if (sol.longestCarry >= 3) bits.push(`ride the long ${sol.longestCarry}-tile current`);
  else if (sol.carries >= 2) bits.push(`chain ${sol.carries} current rides`);
  else bits.push('let one current do the swimming');
  if (sol.treads) bits.push(`tread ${sol.treads === 1 ? 'once' : `${sol.treads} times`} so the tide turns on time`);
  else if (board.P) bits.push('time the dry sandbar as a stopper');
  bits.push(`the golden pearl costs ${sol.parGold - sol.par} extra strokes`);
  const s = bits.join(', ');
  return s[0].toUpperCase() + s.slice(1);
}

function grade(sol, traps, tideSens) {
  return sol.par + 1.5 * sol.decisionPoints + 2 * traps + 1.5 * (tideSens ? 1 : 0);
}

function buildCell(cell, seed, accepted, want) {
  const r = rng(seed);
  const pool = [];
  const sigs = accepted.map(allTransforms).flat();
  let tries = 0;
  const maxTries = QUICK ? 4000 : 400000;
  const target = QUICK ? Math.ceil(want / 4) : want;
  // Over-generate 2x, then keep the top by quality.
  const collectN = target * 2;
  const rej = {};
  const no = (k) => { rej[k] = (rej[k] || 0) + 1; };
  while (pool.length < collectN && tries < maxTries) {
    tries++;
    const c = candidate(r, cell);
    if (!c) { no('cand'); continue; }
    const board = asBoard(c, cell, 'tmp');
    if (S.hasCurrentLoop(board)) { no('loop'); continue; }
    const sol = S.solveBoard(board);
    if (!sol.solvable || !sol.parGold) { no('unsolvable'); continue; }
    if (sol.par < cell.par[0]) { no('parLow'); continue; }
    if (sol.par > cell.par[1]) { no('parHigh'); continue; }
    const gap = sol.parGold - sol.par;
    if (gap < 2 || gap > 4) { no('gap'); continue; }
    if (sol.carries < cell.carries) { no('carries'); continue; }
    if (cell.maxDecision != null && sol.decisionPoints > cell.maxDecision) { no('decision'); continue; }
    if (sol.optimalCount > cell.maxOptimal) { no('optimal'); continue; }
    const limit = Math.max(sol.par + 3, sol.parGold + 2);
    const g = greedy(board, limit + 2);
    const trap = !(g <= sol.par + 1);
    if (cell.trap && !trap) { no('trap'); continue; }
    const tideSens = tideMatters(board, sol);
    if (cell.tide && !tideSens) { no('tide'); continue; }
    const sig = signature(board);
    if (sigs.some((s) => hamming(s, sig) < 5)) { no('dup'); continue; }
    const quality = sol.decisionPoints + Math.min(3, sol.carries) + (tideSens ? 1.5 : 0) + spread(board) + (sol.parIsRiptide ? 2 : 0);
    const gr = grade(sol, trap ? 1 : 0, tideSens);
    pool.push({ board, sol, quality, grade: gr, trap, tideSens });
    sigs.push(...allTransforms(board));
  }
  pool.sort((a, b) => b.quality - a.quality);
  let chosen = pool.slice(0, target);
  if (cell.riptideShare) {
    // Keep at least 60% parIsRiptide in the Treasure cell (design 5.1).
    const need = Math.ceil(target * cell.riptideShare);
    const rip = pool.filter((p) => p.sol.parIsRiptide);
    const non = pool.filter((p) => !p.sol.parIsRiptide);
    if (rip.length >= need) chosen = rip.slice(0, Math.max(need, target - non.length)).concat(non).slice(0, target);
    chosen.sort((a, b) => b.quality - a.quality);
  }
  if (process.env.CQ_DEBUG) process.stdout.write(`  ${cell.key} rejects ${JSON.stringify(rej)}\n`);
  return { chosen, tries, generated: pool.length };
}

function finalize(entries, cell, prefix, nameSeed) {
  const r = rng(nameSeed);
  // Coin pool: the easier half of each cell by grade (Ride Challenge window, 15.2).
  const grades = entries.map((e) => e.grade).sort((a, b) => a - b);
  const coinCut = grades[Math.floor(grades.length / 2)] ?? Infinity;
  return entries.map((e, i) => {
    const id = `${prefix}-${String(i + 1).padStart(3, '0')}`;
    const b = e.board;
    return {
      id, name: nameFor(r), slot: cell.slot, set: cell.set, ruleset: 2,
      tiles: b.tiles, start: b.start, chest: b.chest, pearls: b.pearls, golden: b.golden, P: b.P,
      par: e.sol.par, parGold: e.sol.parGold, authorRiptide: e.sol.authorRiptide,
      decisionPoints: e.sol.decisionPoints, parIsRiptide: e.sol.parIsRiptide,
      grade: Math.round(e.grade * 10) / 10, coin: e.grade <= coinCut,
      aha: ahaFor(b, e.sol), curated: false,
      solution: e.sol.solution, solutionGold: e.sol.solutionGold,
    };
  });
}

// ---------------------------------------------------------------------------
// Teach boards (hand-authored; the new verb is the only way through)

function fromRows(rows, P) {
  const t = rows.join('').replace(/ /g, '');
  let start = -1; let chest = -1; let golden = -1; const pearls = []; let tiles = '';
  for (let i = 0; i < 25; i++) {
    const ch = t[i];
    if (ch === 'S') { start = i; tiles += '.'; } else if (ch === 'T') { chest = i; tiles += '.'; } else if (ch === 'p') { pearls.push(i); tiles += '.'; } else if (ch === 'P') { pearls.push(i); tiles += 's'; } else if (ch === 'G') { golden = i; tiles += '.'; } else tiles += ch;
  }
  return { tiles, start, chest, pearls, golden, P };
}

const TEACH = [
  {
    id: 'T1', name: 'Easy Breezy', set: 'C', slot: 'warmup', teach: 'Currents carry you. Free ride!', verb: 'current',
    aha: 'The coral wall has one gap and a current runs through it: ride it to the chest side',
    rows: ['..#..', 'p.#.G', 'S>>>.', '..#.p', '..#.T'], P: 0,
  },
  {
    id: 'T2', name: 'Low Tide Stop', set: 'CT', slot: 'standard', teach: 'Low tide dries the sandbars. A dry bar stops your ride.', verb: 'tide',
    aha: 'Wait for low tide so the dry sandbar stops the current right under the chest',
    rows: ['.#T#.', '.#.#.', 'S>>s.', 'pp...', '.G...'], P: 2,
  },
];

function buildTeach() {
  const out = [];
  for (const t of TEACH) {
    const c = fromRows(t.rows, t.P);
    const board = { id: t.id, name: t.name, slot: t.slot, set: t.set, ruleset: 2, ...c, par: 0, parGold: 0, authorRiptide: 0 };
    const sol = S.solveBoard(board);
    if (!sol.solvable) throw new Error(`teach ${t.id} unsolvable`);
    // Verb check: without the verb the board must not be solvable (or not within limit).
    const limit = Math.max(sol.par + 4, sol.parGold + 2);
    let without;
    if (t.verb === 'current') without = S.solveBoard({ ...board, tiles: board.tiles.replace(/[\^>v<]/g, '#') });
    else without = S.solveBoard({ ...board, P: 0 });
    const verbNeeded = !without.solvable || without.par > limit;
    out.push({
      ...board, par: sol.par, parGold: sol.parGold, authorRiptide: sol.authorRiptide, decisionPoints: sol.decisionPoints,
      parIsRiptide: sol.parIsRiptide, teach: t.teach, aha: t.aha, coin: true, curated: true, verb: t.verb, verbNeeded,
      solution: sol.solution, solutionGold: sol.solutionGold,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

function main() {
  const t0 = Date.now();
  const teach = buildTeach();
  const pool = [];
  const sealed = [];
  const report = { generatedAt: new Date().toISOString(), quick: QUICK, cells: {}, teach: teach.map((t) => ({ id: t.id, par: t.par, parGold: t.parGold, verbNeeded: t.verbNeeded })) };
  const accepted = [];
  CELLS.forEach((cell, ci) => {
    const res = buildCell(cell, 0x5eed + ci * 7919, accepted, cell.count);
    const entries = finalize(res.chosen, cell, cell.key, 0xabc + ci);
    entries.forEach((e) => accepted.push(e));
    pool.push(...entries);
    report.cells[cell.key] = { wanted: cell.count, kept: entries.length, generated: res.generated, tries: res.tries,
      parIsRiptide: entries.filter((e) => e.parIsRiptide).length, coin: entries.filter((e) => e.coin).length };
    process.stdout.write(`${cell.key}: kept ${entries.length}/${cell.count} (generated ${res.generated}, tries ${res.tries})\n`);
  });
  SEALED.forEach((sc, si) => {
    const cell = CELLS.find((c) => c.key === sc.base);
    const res = buildCell(cell, 0x5ea1ed + si * 104729, accepted, sc.count);
    const entries = finalize(res.chosen, cell, sc.key, 0xdef + si);
    entries.forEach((e) => accepted.push(e));
    sealed.push(...entries);
    report.cells[sc.key] = { wanted: sc.count, kept: entries.length, generated: res.generated, tries: res.tries };
    process.stdout.write(`${sc.key}: kept ${entries.length}/${sc.count}\n`);
  });

  const server = [...teach, ...pool];
  const client = server.map(({ solution, solutionGold, curated, verb, verbNeeded, ...rest }) => rest);
  const clientJson = JSON.stringify(client);
  const serverJson = JSON.stringify({ version: 2, boards: server }, null, 0);
  const sealedJson = JSON.stringify({ version: 2, boards: sealed }, null, 0);
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  report.hashes = { client: sha(clientJson), server: sha(serverJson), sealed: sha(sealedJson), clientIds: sha(client.map((b) => b.id).join(',')) };
  report.ms = Date.now() - t0;

  const header = `/* eslint-disable */
// GENERATED by tools/current-quest/build-library.cjs. Do not edit by hand.
// Client library v2: pool + teach boards. No solutions, no sealed (Daily/Showdown) boards.
// sha256(client json) ${report.hashes.client}
import type { Board } from './rules';

export const CQ_LIBRARY_HASH = '${report.hashes.client}';
export const CQ_LIBRARY: readonly Board[] = `;
  const lines = client.map((b) => `  ${JSON.stringify(b)},`).join('\n');
  fs.writeFileSync(path.join(root, 'src/games/current-quest/boards.v2.client.ts'), `${header}[\n${lines}\n];\n`);
  fs.mkdirSync(SERVER_DIR, { recursive: true });
  fs.writeFileSync(path.join(SERVER_DIR, 'boards.v2.server.json'), serverJson);
  fs.writeFileSync(path.join(SERVER_DIR, 'boards.v2.sealed.json'), sealedJson);
  fs.writeFileSync(path.join(SERVER_DIR, 'library-report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`done in ${report.ms} ms: ${client.length} client boards, ${sealed.length} sealed\n`);
}

main();
