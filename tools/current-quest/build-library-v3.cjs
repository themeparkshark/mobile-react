#!/usr/bin/env node
'use strict';
/**
 * Current Quest library v3 (design v7.1): augments the v2 library instead of
 * regenerating it, so every v2 board keeps its id, tiles and par.
 *
 *   node tools/current-quest/build-library-v3.cjs [--quick] [--server-dir <dir>]
 *
 * Adds, per design 5.1 (v7 additions) and 0.A:
 *   (a) R1 phase tables on every tide board: parByPhase[k], parGoldByPhase[k]
 *       for k = 0..2P-1 and splashPhase (the smallest k >= 1 with
 *       par0 <= par_k <= par0 + 2 and 1 <= parGold_k - par_k <= 4). A sealed
 *       board with no valid splash row is struck (`retired: true`).
 *   (b) R7 ahaTag on every board whose canonical par route uses a tag verb
 *       (chain, long-ride, bank-shot, backdoor, wait, low-road).
 *   (c) The `C-trick` cell (R7): 72 Trick Shot openers on 5x5, 12 per tag,
 *       par 2 to 3 (2 to 4 for the two tide tags, see TRICK_PAR), at least 1
 *       decision point, parGold - par in [1, 2], and the canonical par route
 *       uses its tag's verb (solver-checked). The two tide tags use P = 2.
 *   (d) Curator titles on sealed boards (R10), drawn from per-tag title lists
 *       until a curator renames them.
 *   (e) The v5 Warm-up cell retires (`retired: true`); C-trick replaces it.
 *   (f) The coin trial re-run under the 0.A.4 Trial (undo keeps the stroke
 *       spent, ring = +2 any time, tip = 1 ring) with the "No way home" dead
 *       sheet modelled, plus perfectRate (6+ shells) and masterRate (8+) of
 *       clears (0.A.5).
 *
 * Writes src/games/current-quest/boards.v3.client.ts and, in the server dir,
 * boards.v3.server.json, boards.v3.sealed.json and library-report.v3.json.
 * Deterministic: fixed seeds throughout.
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
const dirIdx = args.indexOf('--server-dir');
const SERVER_DIR = dirIdx >= 0 ? args[dirIdx + 1] : '/Users/dustinsparage/apps/tps-prime-time-audit/studio/currentquest/library';

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
const DIRS = '^>v<';
const TAGS = ['chain', 'long-ride', 'bank-shot', 'backdoor', 'wait', 'low-road'];

// ---------------------------------------------------------------------------
// (a) phase tables, (b) aha tags, (d) titles

function phaseFields(board) {
  if (!board.P) return {};
  const t = S.phaseTable(board);
  return { parByPhase: t.parByPhase, parGoldByPhase: t.parGoldByPhase, splashPhase: S.splashPhaseOf(board.par, t.parByPhase, t.parGoldByPhase) };
}

function tagOf(board) {
  const sol = board.solution && board.solution.length ? board.solution : S.solveBoard(board).solution;
  return S.routeTags(board, sol)[0] ?? null;
}

const TITLES = {
  chain: ['Hand-Off', 'Relay Run', 'Pass It On', 'Chain Reaction', 'Double Ride', 'Two-Current Trick', 'Tag Team', 'Switch Lanes'],
  'long-ride': ['Ride It Out', 'Express Lane', 'All Aboard', 'The Long Glide', 'Free Ride', 'Long Way Round', 'Cruise Control', 'Full Lap'],
  'bank-shot': ['Bank It', 'Stop Right There', 'Pearl Brake', 'Sticky Landing', 'Bullseye', 'Parked', 'Right on the Dot', 'Soft Landing'],
  backdoor: ['Back Door', 'Round the Back', 'Sneak In', 'Side Entrance', 'Knock Twice', 'The Long Way In', 'Come Around', 'Hidden Gate'],
  wait: ['Wait For It', 'Hold Your Breath', 'Patience Pays', 'Tread Lightly', 'Not Yet', 'Count to Two', 'Timing Is Everything', 'Easy Does It'],
  'low-road': ['Low Road', 'Sandbar Stop', 'Dry Dock', 'Low Tide Shortcut', 'Beach Brake', 'Mind the Sand', 'High and Dry', 'Sand Trap'],
};

// ---------------------------------------------------------------------------
// (c) the C-trick cell

/** Per-tag generator bias. Tide tags need par 4 on P = 2 boards to reach a LOW stroke (2 HIGH moves first). */
const TRICK_CFG = {
  chain: { runs: [2, 3], len: [2, 3], chain: 0.9, P: 0 },
  'long-ride': { runs: [1, 2], len: [4, 5], chain: 0.7, P: 0 },
  'bank-shot': { runs: [1, 3], len: [2, 4], chain: 0.4, P: 0, bank: true },
  backdoor: { runs: [1, 3], len: [2, 4], chain: 0.4, P: 0 },
  wait: { runs: [1, 2], len: [2, 4], chain: 0.3, P: 2, sandEnd: 1 },
  'low-road': { runs: [1, 3], len: [2, 4], chain: 0.3, P: 2, sandEnd: 0.85 },
};
const TRICK_PAR = { chain: [2, 3], 'long-ride': [2, 3], 'bank-shot': [2, 3], backdoor: [2, 3], wait: [2, 4], 'low-road': [2, 4] };
const TRICK_PER_TAG = QUICK ? 4 : 12;

function trickCandidate(r, tag) {
  const c = TRICK_CFG[tag];
  const H = 5;
  const N = 25;
  const t = new Array(N).fill('.');
  const ends = [];
  const runs = ri(r, c.runs[0], c.runs[1]);
  for (let k = 0; k < runs; k++) {
    for (let at = 0; at < 20; at++) {
      const d = ri(r, 0, 3);
      const len = ri(r, c.len[0], c.len[1]);
      let p = ri(r, 0, N - 1);
      const cs = [];
      let ok = true;
      for (let j = 0; j < len; j++) {
        if (p < 0 || t[p] !== '.') { ok = false; break; }
        cs.push(p);
        p = R.stepCell(p, d, H);
      }
      if (!ok) continue;
      for (const x of cs) t[x] = DIRS[d];
      let endCell = cs[cs.length - 1];
      let after = p;
      if (r() < c.chain && p >= 0 && t[p] === '.') {
        const d2 = (d + (r() < 0.5 ? 1 : 3)) % 4;
        let q = p;
        const n2 = ri(r, 1, 2);
        for (let j = 0; j < n2; j++) {
          if (q < 0 || t[q] !== '.') break;
          t[q] = DIRS[d2];
          endCell = q;
          q = R.stepCell(q, d2, H);
        }
        after = q;
      }
      ends.push({ endCell, after });
      break;
    }
  }
  if (c.sandEnd) for (const e of ends) if (e.after >= 0 && t[e.after] === '.' && r() < c.sandEnd) t[e.after] = 's';
  const open = () => t.map((x, i) => (x === '.' ? i : -1)).filter((i) => i >= 0);
  const rocks = ri(r, 2, 5);
  for (let k = 0; k < rocks; k++) { const o = open(); if (o.length) t[pick(r, o)] = '#'; }
  if (c.P) { const n = ri(r, 0, 2); for (let k = 0; k < n; k++) { const o = open(); if (o.length) t[pick(r, o)] = 's'; } }
  const used = new Set();
  const take = (pred, from) => {
    const o = (from || t.map((_, i) => i)).filter((i) => pred(t[i]) && !used.has(i));
    if (!o.length) return -1;
    const x = pick(r, o);
    used.add(x);
    return x;
  };
  const start = take((x) => x === '.');
  const chest = take((x) => x === '.');
  // The toy opener holds 1 or 2 required pearls (par 2 to 3 leaves no room for 3).
  const nP = r() < 0.55 ? 1 : 2;
  const pearls = [];
  for (let k = 0; k < nP; k++) {
    let x = -1;
    if (c.bank && k === 0) x = take((y) => y !== '#', ends.map((e) => e.endCell));
    if (x < 0) x = take((y) => y !== '#');
    pearls.push(x);
  }
  const golden = take((x) => x !== '#');
  if ([start, chest, golden, ...pearls].some((x) => x < 0)) return null;
  return {
    id: 'tmp', name: 'tmp', slot: 'trick', set: c.P ? 'CT' : 'C', ruleset: 2, H, tiles: t.join(''), start, chest,
    pearls: pearls.sort((a, b) => a - b), golden, P: c.P, par: 0, parGold: 0, authorRiptide: 0,
  };
}

function signature(board) {
  const t = board.tiles.split('');
  t[board.start] = 'S'; t[board.chest] = 'T'; t[board.golden] = 'G';
  for (const p of board.pearls) t[p] = 'p';
  return t.join('');
}
function hamming(a, b) {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

function buildTrick(seed, sigsIn) {
  const out = [];
  const report = {};
  const sigs = sigsIn.slice();
  TAGS.forEach((tag, ti) => {
    const r = rng(seed + ti * 7919);
    const got = [];
    let tries = 0;
    const maxTries = QUICK ? 40000 : tag === 'wait' ? 900000 : 300000;
    const want = TRICK_PER_TAG * 2;
    while (got.length < want && tries < maxTries) {
      tries++;
      const b = trickCandidate(r, tag);
      if (!b || S.hasCurrentLoop(b)) continue;
      const sol = S.solveBoard(b);
      if (!sol.solvable || !sol.parGold) continue;
      const [lo, hi] = TRICK_PAR[tag];
      if (sol.par < lo || sol.par > hi) continue;
      const gap = sol.parGold - sol.par;
      if (gap < 1 || gap > 2) continue;
      if (sol.decisionPoints < 1) continue;
      if (sol.maxCarry > 10 || S.longestRun(b) > 6) continue;
      const tags = S.routeTags(b, sol.solution);
      if (!tags.includes(tag)) continue;
      const sig = signature(b);
      const all = R.allowedTransforms(5).map((tf) => signature(R.transformBoard(b, tf)));
      if (sigs.some((s) => all.some((x) => hamming(s, x) < 4))) continue;
      sigs.push(sig);
      const quality = sol.decisionPoints + (tags.length > 1 ? 0.5 : 0) + (sol.parIsRiptide ? 1 : 0) - Math.abs(sol.par - 2.5) * 0.2;
      got.push({ board: b, sol, tag, quality });
    }
    got.sort((a, b) => b.quality - a.quality);
    const chosen = got.slice(0, TRICK_PER_TAG);
    report[tag] = { kept: chosen.length, found: got.length, tries };
    process.stdout.write(`  C-trick ${tag}: kept ${chosen.length}/${TRICK_PER_TAG} (found ${got.length}, tries ${tries})\n`);
    out.push(...chosen);
  });
  return { entries: out, report };
}

const TRICK_NAMES_A = ['Pocket', 'Quick', 'Little', 'Tiny', 'Nifty', 'Sneaky', 'Snappy', 'Mini', 'Zippy', 'Plucky'];
const TRICK_NAMES = {
  chain: ['Hand-Off', 'Relay', 'Switch'], 'long-ride': ['Glide', 'Cruise', 'Express'], 'bank-shot': ['Bank Shot', 'Brake', 'Landing'],
  backdoor: ['Back Door', 'Sneak', 'Side Gate'], wait: ['Wait', 'Pause', 'Breather'], 'low-road': ['Low Road', 'Sand Stop', 'Dry Dock'],
};
const TRICK_AHA = {
  chain: 'One swim hands you from one current to the next',
  'long-ride': 'One swim into the long current does all the work',
  'bank-shot': 'The current stops you right on the pearl',
  backdoor: 'The chest opens from its far side: go around',
  wait: 'Tread once so the tide turns, then ride',
  'low-road': 'At low tide the dry sandbar stops your ride in the right spot',
};

// ---------------------------------------------------------------------------
// (f) the v7.1 Trial noisy player

const TEMP = Number(process.env.CQ_TEMP || 0.95);
const SIM_PLAYS = QUICK ? 60 : 200;
const COIN_FLOOR = Number(process.env.CQ_COIN_FLOOR || 0.9);
const GOLD_CHASE = Number(process.env.CQ_GOLD_CHASE || 0.5);

/**
 * A casual player (softmax over solver distance, temperature TEMP). It chases
 * the golden pearl on a GOLD_CHASE share of voyages when it still fits the
 * strokes left. When the dead sheet rises (the state cannot clear in the
 * strokes left, 0.A.3) it undoes back toward a state that can, which costs
 * no budget but keeps the strokes spent, and uses a ring (+2) when no undo
 * helps. At a stall it uses a ring or the run fails.
 */
function noisyPlay(board, knobs, rand, ringsIn) {
  let run = R.createRun([board], knobs);
  run.rings = ringsIn;
  const chase = board.golden >= 0 && rand() < GOLD_CHASE;
  let t = 2000;
  let guard = 0;
  const apply = (a) => { t += 2000; const res = R.applyAction(run, a, t); if (res.ok) run = res.run; return res.ok; };
  while (!run.complete && !run.failed && guard++ < 90) {
    const v = run.voyage;
    if (v.stalled) {
      if (!apply(R.A_CONTINUE)) break;
      continue;
    }
    const left = R.strokesLeft(run);
    if (!(S.distanceFrom(board, v, false) <= left)) {
      const fixable = v.stack.some((s) => S.distanceFrom(board, { pos: s.pos, mask: s.mask, golden: s.golden, moves: s.moves, phase: v.phase }, false) <= left);
      if (fixable && apply(R.A_UNDO)) continue;
      if (run.rings > 0 && apply(R.A_CONTINUE)) continue;
    }
    const goldNow = chase && !v.golden && S.distanceFrom(board, v, true) <= left;
    const scored = [];
    for (let a = 0; a < (board.P ? 5 : 4); a++) {
      const pv = R.previewFor(run, a);
      if (!pv.valid) continue;
      let d;
      if (pv.clears) d = goldNow && !pv.goldenHeld ? 30 : 1;
      else {
        const rest = S.distanceFrom(board, { pos: pv.path[pv.path.length - 1], mask: pv.mask, golden: pv.goldenHeld, moves: v.moves + 1, phase: v.phase }, goldNow);
        d = 1 + (Number.isFinite(rest) ? rest : 30);
      }
      scored.push({ a, d });
    }
    if (!scored.length) break;
    const best = Math.min(...scored.map((x) => x.d));
    const w = scored.map((x) => Math.exp(-(x.d - best) / TEMP));
    const sum = w.reduce((p, q) => p + q, 0);
    let roll = rand() * sum;
    let choice = scored[scored.length - 1].a;
    for (let k = 0; k < scored.length; k++) { roll -= w[k]; if (roll <= 0) { choice = scored[k].a; break; } }
    apply(choice);
  }
  return { cleared: run.complete, ringsUsed: ringsIn - run.rings, shells: R.totalShells(run.results) };
}

function trialSim(board, seed, knobs) {
  const rand = rng(seed);
  let clear0 = 0;
  let clear1 = 0;
  for (let k = 0; k < SIM_PLAYS; k++) {
    const res = noisyPlay(board, knobs, rand, 2);
    if (res.cleared && res.ringsUsed === 0) clear0++;
    if (res.cleared && res.ringsUsed <= 1) clear1++;
  }
  return { clear0: clear0 / SIM_PLAYS, clear1: clear1 / SIM_PLAYS };
}

function bandsOf(entries, gradeOf) {
  const order = entries.map((e, i) => ({ g: gradeOf(e), i })).sort((a, b) => a.g - b.g || a.i - b.i);
  const rank = new Array(entries.length);
  order.forEach((o, k) => { rank[o.i] = k; });
  return entries.map((_, i) => (rank[i] < entries.length / 3 ? 'rookie' : rank[i] < (entries.length * 2) / 3 ? 'adept' : 'master'));
}

// ---------------------------------------------------------------------------

function main() {
  const t0 = Date.now();
  const prevServer = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'boards.v2.server.json'), 'utf8')).boards;
  const prevSealed = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'boards.v2.sealed.json'), 'utf8')).boards;
  const report = { generatedAt: new Date().toISOString(), quick: QUICK, base: 'boards.v2', temp: TEMP, goldChase: GOLD_CHASE, cells: {} };
  const trickSlack = Number(process.env.CQ_TRICK_SLACK || R.RIDE_KNOBS.slack.trick);
  const RIDE = { ...R.RIDE_KNOBS, slack: { ...R.RIDE_KNOBS.slack, trick: trickSlack } };

  // (a), (b), (e) on the v2 pool and teach boards.
  const pool = prevServer.map((b) => {
    const tag = tagOf(b);
    const out = { ...b, ...phaseFields(b), ...(tag ? { ahaTag: tag } : {}) };
    if (b.slot === 'warmup' && !b.teach) out.retired = true;
    return out;
  });
  // (a), (b), (d) on the sealed set.
  const titleCount = {};
  const sealed = prevSealed.map((b) => {
    const tag = tagOf(b);
    const pf = phaseFields(b);
    const out = { ...b, ...pf, ...(tag ? { ahaTag: tag } : {}) };
    if (tag) {
      const n = titleCount[tag] = (titleCount[tag] || 0) + 1;
      out.title = TITLES[tag][(n - 1) % TITLES[tag].length];
    }
    if (!(pf.splashPhase >= 1) || !tag) out.retired = true;
    return out;
  });

  // (c) the C-trick cell.
  const sigs = pool.filter((b) => (b.H ?? 5) === 5).map(signature);
  const trick = buildTrick(0x7a1c, sigs);
  report.cells['C-trick'] = trick.report;
  const tBands = bandsOf(trick.entries, (e) => e.sol.par + 1.5 * e.sol.decisionPoints + (e.board.P ? 1.5 : 0));
  const nameR = rng(0x7a1d);
  const trickBoards = trick.entries.map((e, i) => {
    const id = `C-trick-${String(i + 1).padStart(3, '0')}`;
    const b = { ...e.board, id };
    return {
      id, name: `${pick(nameR, TRICK_NAMES_A)} ${pick(nameR, TRICK_NAMES[e.tag])}`, slot: 'trick', set: b.set, ruleset: 2, H: 5,
      tiles: b.tiles, start: b.start, chest: b.chest, pearls: b.pearls, golden: b.golden, P: b.P,
      par: e.sol.par, parGold: e.sol.parGold, authorRiptide: e.sol.authorRiptide, decisionPoints: e.sol.decisionPoints,
      parIsRiptide: e.sol.parIsRiptide, ahaTag: e.tag, ...phaseFields({ ...b, par: e.sol.par }),
      grade: Math.round((e.sol.par + 1.5 * e.sol.decisionPoints) * 10) / 10, band: tBands[i], coin: false,
      aha: TRICK_AHA[e.tag], curated: false, solution: e.sol.solution, solutionGold: e.sol.solutionGold,
    };
  });

  // (f) resim every Rookie board in the coin cells under the v7.1 Trial.
  const coinCell = (b) => !b.retired && !b.teach && b.band === 'rookie'
    && ((b.slot === 'trick' && b.set === 'C') || (b.set === 'CT' && (b.slot === 'standard' || b.slot === 'treasure')));
  const all = [...pool, ...trickBoards];
  all.forEach((b, i) => {
    if (b.teach) return;
    if (!coinCell(b)) { b.coin = false; delete b.trialClearRate; delete b.trialFirstRate; return; }
    const sim = trialSim(b, 0x71a1 + i * 31, RIDE);
    b.trialClearRate = Math.round(sim.clear1 * 1000) / 1000;
    b.trialFirstRate = Math.round(sim.clear0 * 1000) / 1000;
    b.coin = sim.clear1 >= COIN_FLOOR;
  });

  // Run-level coin trial: Trick Shot + Standard + Deep, 2 shared rings, fresh boards on the retry.
  const coinOf = (slot, set) => all.filter((b) => b.coin && b.slot === slot && (!set || b.set === set));
  const lists = [coinOf('trick', 'C'), coinOf('standard', 'CT'), coinOf('treasure', 'CT')];
  const runRand = rng(0xc017);
  const playRun = () => {
    if (lists.some((l) => !l.length)) return { cleared: false, shells: 0 };
    const triple = lists.map((list) => list[Math.floor(runRand() * list.length)]);
    let rings = 2;
    let shells = 0;
    for (const b of triple) {
      const res = noisyPlay(b, RIDE, runRand, rings);
      if (!res.cleared) return { cleared: false, shells };
      rings -= res.ringsUsed;
      shells += res.shells;
    }
    return { cleared: true, shells };
  };
  let first = 0; let within2 = 0; let clears = 0; let perfect = 0; let master = 0;
  const RUNS = QUICK ? 300 : 2000;
  for (let k = 0; k < RUNS; k++) {
    let a = playRun();
    if (a.cleared) { first++; within2++; } else { a = playRun(); if (a.cleared) within2++; }
    if (a.cleared) { clears++; if (a.shells >= 6) perfect++; if (a.shells >= 8) master++; }
  }
  report.coinTrial = {
    runs: RUNS, rules: 'v7.1 0.A.4', trickSlack, firstTry: first / RUNS, within2: within2 / RUNS,
    perfectRate: clears ? perfect / clears : 0, masterRate: clears ? master / clears : 0,
    pool: { trick: lists[0].length, standard: lists[1].length, treasure: lists[2].length },
  };
  process.stdout.write(`coin trial (v7.1): first ${(first / RUNS * 100).toFixed(1)}%, within 2 ${(within2 / RUNS * 100).toFixed(1)}%, perfect ${(report.coinTrial.perfectRate * 100).toFixed(1)}%, master ${(report.coinTrial.masterRate * 100).toFixed(1)}% (pool ${JSON.stringify(report.coinTrial.pool)})\n`);

  // Cell summaries.
  const deep = all.filter((b) => b.slot === 'treasure' && !b.teach);
  const tagCount = (list) => Object.fromEntries(TAGS.map((t) => [t, list.filter((b) => b.ahaTag === t).length]).concat([['none', list.filter((b) => !b.ahaTag).length]]));
  report.tags = { deep: tagCount(deep), standard: tagCount(all.filter((b) => b.slot === 'standard' && !b.teach)), sealed: tagCount(sealed), trick: tagCount(trickBoards) };
  report.sealed = { total: sealed.length, retired: sealed.filter((b) => b.retired).length, splashable: sealed.filter((b) => b.splashPhase >= 1).length };
  report.phase = {
    tideBoards: all.filter((b) => b.P > 0).length,
    splashable: all.filter((b) => b.P > 0 && b.splashPhase >= 1).length,
    parDelta: (() => {
      const d = {};
      for (const b of [...all, ...sealed]) if (b.splashPhase >= 1) { const k = b.parByPhase[b.splashPhase] - b.par; d[k] = (d[k] || 0) + 1; }
      return d;
    })(),
  };
  process.stdout.write(`tags: ${JSON.stringify(report.tags)}\nsealed: ${JSON.stringify(report.sealed)}\nphase: ${JSON.stringify(report.phase)}\n`);

  const server = all;
  const client = server.map(({ solution, solutionGold, curated, verb, verbNeeded, ...rest }) => rest);
  const clientJson = JSON.stringify(client);
  const serverJson = JSON.stringify({ version: 3, boards: server });
  const sealedJson = JSON.stringify({ version: 3, boards: sealed });
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  report.hashes = { client: sha(clientJson), server: sha(serverJson), sealed: sha(sealedJson), clientIds: sha(client.map((b) => b.id).join(',')) };
  report.ms = Date.now() - t0;
  const header = `/* eslint-disable */
// GENERATED by tools/current-quest/build-library-v3.cjs. Do not edit by hand.
// Client library v3: pool + teach + C-trick boards with R1 phase tables and R7 aha tags.
// No solutions, no sealed (Daily/Showdown) boards. Retired boards stay for history only.
// sha256(client json) ${report.hashes.client}
import type { Board } from './rules';

export const CQ_LIBRARY_HASH = '${report.hashes.client}';
export const CQ_LIBRARY: readonly Board[] = `;
  fs.writeFileSync(path.join(root, 'src/games/current-quest/boards.v3.client.ts'), `${header}[\n${client.map((b) => `  ${JSON.stringify(b)},`).join('\n')}\n];\n`);
  fs.writeFileSync(path.join(SERVER_DIR, 'boards.v3.server.json'), serverJson);
  fs.writeFileSync(path.join(SERVER_DIR, 'boards.v3.sealed.json'), sealedJson);
  fs.writeFileSync(path.join(SERVER_DIR, 'library-report.v3.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`done in ${report.ms} ms: ${client.length} client boards (${trickBoards.length} C-trick), ${sealed.length} sealed\n`);
}

main();
