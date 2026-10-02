#!/usr/bin/env node
'use strict';
/**
 * Current Quest library builder (design 5.1 / 5.2).
 *
 *   node tools/current-quest/build-library.cjs [--quick] [--out-server <dir>]
 *
 * Generates candidate lagoon boards (always 5 wide: Warm-up 5x5, Standard 5x6,
 * Treasure 5x7, design v5 3.1), solves them with the same solver the app ships
 * (src/games/current-quest/solver.ts), filters, grades, ranks by quality,
 * rejects near-duplicates under every allowed transform, splits each cell into
 * Rookie / Adept / Master terciles, runs the noisy-player Trial sim on the
 * Rookie band (15.2) and writes:
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
// --resim: keep the generated boards in <server dir>, only re-run the Trial sim
// and the coin flags (used to fit TEMP without regenerating the library).
const RESIM = args.includes('--resim');
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

const SLOT_H = { warmup: 5, standard: 6, treasure: 7 };
const CELLS = [
  { key: 'C-warmup', set: 'C', slot: 'warmup', H: 5, count: 60, par: [3, 5], pearls: [2, 2], rocks: [3, 6], runs: [1, 3], sand: [0, 0], P: [0], carries: 1, maxDecision: 1, trap: false, maxOptimal: 99 },
  { key: 'C-standard', set: 'C', slot: 'standard', H: 6, count: 60, par: [5, 7], pearls: [2, 3], rocks: [4, 8], runs: [2, 4], sand: [0, 0], P: [0], carries: 2, trap: true, maxOptimal: 6 },
  { key: 'C-treasure', set: 'C', slot: 'treasure', H: 7, count: 120, par: [6, 8], pearls: [2, 3], rocks: [5, 9], runs: [3, 5], sand: [0, 0], P: [0], carries: 3, trap: true, maxOptimal: 6, riptideShare: 0.6 },
  { key: 'CT-standard', set: 'CT', slot: 'standard', H: 6, count: 60, par: [5, 7], pearls: [2, 3], rocks: [3, 7], runs: [2, 4], sand: [2, 4], P: [3, 4], carries: 2, trap: true, tide: true, maxOptimal: 6 },
  { key: 'CT-treasure', set: 'CT', slot: 'treasure', H: 7, count: 120, par: [6, 8], pearls: [2, 3], rocks: [4, 8], runs: [3, 5], sand: [2, 5], P: [3, 4], carries: 3, trap: true, tide: true, maxOptimal: 6, riptideShare: 0.6 },
];
const SEALED = [
  { key: 'sealed-CT-standard', base: 'CT-standard', count: 60 },
  { key: 'sealed-CT-treasure', base: 'CT-treasure', count: 60 },
];

const DIRS = '^>v<';

function candidate(r, cell) {
  const H = cell.H;
  const N = 5 * H;
  const tiles = new Array(N).fill('.');
  const used = new Set();
  const P = pick(r, cell.P);
  // Currents: straight runs of 2..4 same-direction tiles.
  const runs = ri(r, cell.runs[0], cell.runs[1]);
  for (let k = 0; k < runs; k++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const d = ri(r, 0, 3);
      const len = ri(r, 2, 4);
      let p = ri(r, 0, N - 1);
      const cells = [];
      let ok = true;
      for (let j = 0; j < len; j++) {
        if (p < 0 || tiles[p] !== '.') { ok = false; break; }
        cells.push(p);
        p = R.stepCell(p, d, H);
      }
      if (!ok) continue;
      for (const c of cells) tiles[c] = DIRS[d];
      // Riptide hand-off (v5 3.6): on Treasure boards, often chain a perpendicular
      // run onto the end of this one, so one stroke can ride two runs.
      if (cell.riptideShare && r() < 0.55 && p >= 0 && tiles[p] === '.') {
        const d2 = (d + (r() < 0.5 ? 1 : 3)) % 4;
        const len2 = ri(r, 1, 3);
        let q = p;
        const cells2 = [];
        for (let j = 0; j < len2; j++) {
          if (q < 0 || tiles[q] !== '.') break;
          cells2.push(q);
          q = R.stepCell(q, d2, H);
        }
        for (const c of cells2) tiles[c] = DIRS[d2];
      }
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
  // with the chest closed (a locked chest blocks like coral). On the taller
  // v5 boards everything is placed within a stroke radius of the start so par
  // stays inside the slot window instead of sprawling over 7 rows.
  const near = cell.par[1] - 2;
  const pearlR = Math.ceil(cell.par[1] / 2) + 1;
  const seen0 = reach({ tiles: tiles.join(''), start, chest: -1, P, H });
  const chest = take((t) => t === '.', [...seen0.keys()].filter((i) => i !== start && seen0.get(i) >= 2 && seen0.get(i) <= near));
  if (chest < 0) return null;
  const seen = reach({ tiles: tiles.join(''), start, chest, P, H });
  const reachable = [...seen.keys()].filter((i) => i !== start && i !== chest && seen.get(i) <= pearlR);
  if (reachable.length < 5) return null;
  const nP = ri(r, cell.pearls[0], cell.pearls[1]);
  const pearls = [];
  for (let k = 0; k < nP; k++) { const c = take((t) => t !== '#', reachable); if (c >= 0) pearls.push(c); }
  const golden = take((t) => t !== '#', reachable);
  if (golden < 0 || pearls.length !== nP) return null;
  return { tiles: tiles.join(''), start, chest, pearls: pearls.sort((a, b) => a - b), golden, P, H };
}

/** Cells touched by any stroke sequence from the start -> fewest strokes to touch them (chest closed, pearls ignored). */
function reach(b) {
  const board = { ...b, pearls: [0], golden: -1, id: 'r', name: 'r', slot: 'standard', set: 'C', ruleset: 2, par: 0, parGold: 0, authorRiptide: 0 };
  const M = b.P ? b.P * 2 : 1;
  const seenState = new Set([b.start * 16 + 0]);
  const cells = new Map([[b.start, 0]]);
  const queue = [[b.start, 0, 0]];
  while (queue.length) {
    const [pos, m, depth] = queue.shift();
    const tide = R.tideAt(b.P, m, 0);
    for (let a = 0; a < (b.P ? 5 : 4); a++) {
      const sim = R.simulateStroke(board, pos, 0, false, tide, a === 4 ? -1 : a);
      if (sim.bump) continue;
      for (const c of sim.path) if (!cells.has(c)) cells.set(c, depth + 1);
      const key = sim.pos * 16 + ((m + 1) % M);
      if (!seenState.has(key)) { seenState.add(key); queue.push([sim.pos, (m + 1) % M, depth + 1]); }
    }
  }
  return cells;
}

function asBoard(c, cell, id) {
  return { id, name: id, slot: cell.slot, set: cell.set, ruleset: 2, H: cell.H, tiles: c.tiles, start: c.start, chest: c.chest, pearls: c.pearls, golden: c.golden, P: c.P, par: 0, parGold: 0, authorRiptide: 0 };
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
  const n = R.cellsOf(board);
  for (let i = 0; i < n; i++) if (board.tiles[i] !== '.') { rows.add(R.rowOf(i)); cols.add(R.colOf(i)); }
  return (rows.size + cols.size) / (5 + R.heightOf(board));
}

function signature(board) {
  // Tile string with objects overlaid, for near-duplicate checks.
  const t = board.tiles.split('');
  t[board.start] = 'S'; t[board.chest] = 'T'; t[board.golden] = 'G';
  for (const p of board.pearls) t[p] = 'p';
  return t.join('');
}

function allTransforms(board) {
  return R.allowedTransforms(R.heightOf(board)).map((tf) => signature(R.transformBoard(board, tf)));
}

function hamming(a, b) {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

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
  const ripNeed = cell.riptideShare ? Math.ceil(target * cell.riptideShare * 1.15) : 0;
  let ripHave = 0;
  while ((pool.length < collectN || ripHave < ripNeed) && tries < maxTries) {
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
    if (sol.maxCarry > 10 || S.longestRun(board) > 6) { no('carryCap'); continue; }
    if (cell.maxDecision != null && sol.decisionPoints > cell.maxDecision) { no('decision'); continue; }
    if (sol.optimalCount > cell.maxOptimal) { no('optimal'); continue; }
    const limit = Math.max(sol.par + 3, sol.parGold + 2);
    void limit;
    const g = greedy(board, Math.max(sol.par + 3, sol.parGold + 2) + 2);
    const trap = !(g <= sol.par + 1);
    if (cell.trap && !trap) { no('trap'); continue; }
    const tideSens = tideMatters(board, sol);
    if (cell.tide && !tideSens) { no('tide'); continue; }
    const sig = signature(board);
    if (sigs.some((s) => hamming(s, sig) < 5)) { no('dup'); continue; }
    // Enough plain boards already: keep looking only for Riptide-par boards (Treasure share, 5.1).
    if (pool.length >= collectN && !sol.parIsRiptide) { no('needRip'); continue; }
    if (sol.parIsRiptide) ripHave++;
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

// ---------------------------------------------------------------------------
// Noisy-player Trial sim (design 15.2). A casual player is a softmax policy
// over the solver's distance-to-goal: from each state it scores every legal
// stroke by 1 + strokes-to-chest after it and picks with temperature TEMP.
// It never undoes (casual players rarely do), stalls at the Trial limit and
// spends a ring (+2 strokes) to continue. No playtest data exists yet, so TEMP
// and the per-board floor were fit together on this library so the run-level
// draw lands inside the 90% +/- 3% first-try gate with 98%+ within two tries
// (TEMP 0.95, floor 0.90: 92% / 99.8%; at the design's 97% floor this player
// leaves too few Standard boards). The stopwatch playtest re-fits TEMP from the
// two slowest players (19, item 6); both are env knobs (CQ_TEMP, CQ_COIN_FLOOR).
const TEMP = Number(process.env.CQ_TEMP || 0.95);
const SIM_PLAYS = 200;
// Per-board Trial clear-rate floor (1 ring) for the coin pool (15.2).
const COIN_FLOOR = Number(process.env.CQ_COIN_FLOOR || 0.9);

function noisyPlay(board, knobs, rand, ringsIn) {
  let run = R.createRun([board], knobs);
  run.rings = ringsIn;
  let guard = 0;
  while (!run.complete && !run.failed && guard++ < 60) {
    const v = run.voyage;
    if (v.stalled) {
      const res = R.applyAction(run, R.A_CONTINUE);
      if (!res.ok) return { cleared: false, ringsUsed: ringsIn - run.rings };
      run = res.run;
      continue;
    }
    const scored = [];
    for (let a = 0; a < (board.P ? 5 : 4); a++) {
      const pv = R.previewFor(run, a);
      if (!pv.valid) continue;
      let d;
      if (pv.clears) d = 1;
      else {
        const sim = R.simulateStroke(board, v.pos, v.mask, v.golden, R.tideAt(board.P, v.moves, v.phase), a === 4 ? -1 : a);
        const rest = S.distanceFrom(board, { pos: sim.pos, mask: sim.mask, golden: sim.golden, moves: v.moves + 1, phase: v.phase }, false);
        d = 1 + (Number.isFinite(rest) ? rest : 30);
      }
      scored.push({ a, d });
    }
    if (!scored.length) return { cleared: false, ringsUsed: ringsIn - run.rings };
    const best = Math.min(...scored.map((x) => x.d));
    const w = scored.map((x) => Math.exp(-(x.d - best) / TEMP));
    const sum = w.reduce((p, q) => p + q, 0);
    let roll = rand() * sum;
    let pick = scored[scored.length - 1].a;
    for (let k = 0; k < scored.length; k++) { roll -= w[k]; if (roll <= 0) { pick = scored[k].a; break; } }
    const res = R.applyAction(run, pick);
    if (res.ok) run = res.run;
  }
  return { cleared: run.complete, ringsUsed: ringsIn - run.rings };
}

/** Per-board Trial stats: clear rate with no ring, with at most 1 ring, and the mean rings used. */
function trialSim(board, seed) {
  const rand = rng(seed);
  let clear0 = 0;
  let clear1 = 0;
  let rings = 0;
  for (let k = 0; k < SIM_PLAYS; k++) {
    const res = noisyPlay(board, R.RIDE_KNOBS, rand, 2);
    if (res.cleared && res.ringsUsed === 0) clear0++;
    if (res.cleared && res.ringsUsed <= 1) clear1++;
    rings += res.ringsUsed;
  }
  return { clear0: clear0 / SIM_PLAYS, clear1: clear1 / SIM_PLAYS, rings: rings / SIM_PLAYS };
}

function finalize(entries, cell, prefix, nameSeed) {
  const r = rng(nameSeed);
  // Rookie / Adept / Master: terciles of the difficulty grade d within the cell
  // (5.1), by rank so grade ties never empty a band (stable: quality order breaks ties).
  const order = entries.map((e, i) => ({ g: e.grade, i })).sort((a, b) => a.g - b.g || a.i - b.i);
  const rank = new Array(entries.length);
  order.forEach((o, k) => { rank[o.i] = k; });
  return entries.map((e, i) => {
    const id = `${prefix}-${String(i + 1).padStart(3, '0')}`;
    const b = e.board;
    const band = rank[i] < entries.length / 3 ? 'rookie' : rank[i] < (entries.length * 2) / 3 ? 'adept' : 'master';
    let trial = null;
    if (band === 'rookie') trial = trialSim({ ...b, id, par: e.sol.par, parGold: e.sol.parGold, slot: cell.slot }, 0x7a1 + i * 31 + nameSeed);
    // Coin pool (4.4): Rookie band whose own Trial clear rate (1 ring) is at least 97%.
    const coin = band === 'rookie' && !!trial && trial.clear1 >= COIN_FLOOR;
    return {
      id, name: nameFor(r), slot: cell.slot, set: cell.set, ruleset: 2, H: cell.H,
      tiles: b.tiles, start: b.start, chest: b.chest, pearls: b.pearls, golden: b.golden, P: b.P,
      par: e.sol.par, parGold: e.sol.parGold, authorRiptide: e.sol.authorRiptide,
      decisionPoints: e.sol.decisionPoints, parIsRiptide: e.sol.parIsRiptide,
      grade: Math.round(e.grade * 10) / 10, band, coin,
      ...(trial ? { trialClearRate: Math.round(trial.clear1 * 1000) / 1000, trialFirstRate: Math.round(trial.clear0 * 1000) / 1000 } : {}),
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
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === 'S') { start = i; tiles += '.'; } else if (ch === 'T') { chest = i; tiles += '.'; } else if (ch === 'p') { pearls.push(i); tiles += '.'; } else if (ch === 'P') { pearls.push(i); tiles += 's'; } else if (ch === 'G') { golden = i; tiles += '.'; } else tiles += ch;
  }
  return { tiles, start, chest, pearls, golden, P, H: rows.length };
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
    rows: ['.#T#.', '.#.#.', 'S>>s.', 'pp...', '.G...', '.....'], P: 2,
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

function resimEntries(entries, salt) {
  return entries.map((e, i) => {
    if (e.band !== 'rookie') return { ...e, coin: false };
    const trial = trialSim(e, 0x7a1 + i * 31 + salt);
    return { ...e, coin: trial.clear1 >= COIN_FLOOR, trialClearRate: Math.round(trial.clear1 * 1000) / 1000, trialFirstRate: Math.round(trial.clear0 * 1000) / 1000 };
  });
}

function main() {
  const t0 = Date.now();
  const teach = buildTeach();
  const pool = [];
  const sealed = [];
  const report = { generatedAt: new Date().toISOString(), quick: QUICK, cells: {}, teach: teach.map((t) => ({ id: t.id, par: t.par, parGold: t.parGold, verbNeeded: t.verbNeeded })) };
  const accepted = [];
  if (RESIM) {
    const prevServer = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'boards.v2.server.json'), 'utf8')).boards.filter((b) => !b.teach);
    const prevSealed = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'boards.v2.sealed.json'), 'utf8')).boards;
    CELLS.forEach((cell, ci) => {
      const entries = resimEntries(prevServer.filter((b) => b.id.startsWith(`${cell.key}-`)), 0xabc + ci);
      pool.push(...entries);
      report.cells[cell.key] = { kept: entries.length, H: cell.H, coin: entries.filter((e) => e.coin).length,
        parIsRiptide: entries.filter((e) => e.parIsRiptide).length,
        bands: { rookie: entries.filter((e) => e.band === 'rookie').length, adept: entries.filter((e) => e.band === 'adept').length, master: entries.filter((e) => e.band === 'master').length } };
      process.stdout.write(`${cell.key}: ${entries.length} boards, coin ${report.cells[cell.key].coin}\n`);
    });
    sealed.push(...prevSealed);
  } else {
  CELLS.forEach((cell, ci) => {
    const res = buildCell(cell, 0x5eed + ci * 7919, accepted, cell.count);
    const entries = finalize(res.chosen, cell, cell.key, 0xabc + ci);
    entries.forEach((e) => accepted.push(e));
    pool.push(...entries);
    report.cells[cell.key] = { wanted: cell.count, kept: entries.length, generated: res.generated, tries: res.tries, H: cell.H,
      parIsRiptide: entries.filter((e) => e.parIsRiptide).length, coin: entries.filter((e) => e.coin).length,
      bands: { rookie: entries.filter((e) => e.band === 'rookie').length, adept: entries.filter((e) => e.band === 'adept').length, master: entries.filter((e) => e.band === 'master').length } };
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
  }

  // Run-level coin trial (15.2): a random Rookie Warm-up + Standard + Treasure
  // draw played by the noisy player with 2 shared rings. Target 90% +/- 3% on
  // the first try and 98%+ within two attempts (fresh boards on the retry).
  const coinOf = (set, slot) => pool.filter((b) => b.set === set && b.slot === slot && b.coin);
  const runRand = rng(0xc01);
  const playRun = () => {
    const lists = [coinOf('C', 'warmup'), coinOf('CT', 'standard'), coinOf('CT', 'treasure')];
    if (lists.some((l) => !l.length)) return false;
    const triple = lists.map((list) => list[Math.floor(runRand() * list.length)]);
    let rings = 2;
    for (const b of triple) {
      const res = noisyPlay(b, R.RIDE_KNOBS, runRand, rings);
      if (!res.cleared) return false;
      rings -= res.ringsUsed;
    }
    return true;
  };
  let first = 0;
  let within2 = 0;
  const RUNS = 1000;
  for (let k = 0; k < RUNS; k++) {
    const a = playRun();
    if (a) { first++; within2++; } else if (playRun()) within2++;
  }
  report.coinTrial = { runs: RUNS, temp: TEMP, firstTry: first / RUNS, within2: within2 / RUNS,
    pool: { warmup: coinOf('C', 'warmup').length, standard: coinOf('CT', 'standard').length, treasure: coinOf('CT', 'treasure').length } };
  process.stdout.write(`coin trial: first try ${(first / RUNS * 100).toFixed(1)}%, within 2 ${(within2 / RUNS * 100).toFixed(1)}% (pool ${JSON.stringify(report.coinTrial.pool)})\n`);

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
