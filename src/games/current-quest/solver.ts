/**
 * Current Quest solver (design 5.1). Exhaustive state graph over
 * (position, pearl mask, golden taken, tide clock) with every stroke costing 1.
 * A 5x7 board with tide is 35 x 8 x 2 x 8 = 4,480 states, so a full build
 * takes a few ms.
 *
 * Used for: library par / parGold, Author target, decision points, the Tide
 * Tip (next optimal strokes), the free first-stroke hint, the near-miss line,
 * the "No way home" previews and dead sheet (v7.1 0.A.3), the R1 phase tables
 * and the R7 aha tags. Verifiers never need it (a Splash is a table lookup).
 */

import {
  A_TREAD, cellsOf, fullMask, heightOf, isRiptide, simulateStroke, stepCell, tideAt, TIDE_LOW,
  type AhaTag, type Board, type Voyage,
} from './rules';

const INF = 1 << 29;

export interface SolveGraph {
  readonly board: Board;
  readonly M: number;
  readonly nStates: number;
  /** next[s*5 + a] = successor state, -1 bump, -2 clear, -3 clear with golden. */
  readonly next: Int32Array;
  /** carried tiles for s,a. */
  readonly carried: Int8Array;
  /** 1 when stroke s,a is a Riptide stroke. */
  readonly rip: Int8Array;
  /** Distance (strokes) to any clear / to a clear holding the golden pearl. */
  readonly distClear: Int32Array;
  readonly distGold: Int32Array;
}

export function stateKey(M: number, pos: number, mask: number, golden: boolean, m: number): number {
  return ((pos * 8 + mask) * 2 + (golden ? 1 : 0)) * M + m;
}

function decode(M: number, s: number): { pos: number; mask: number; golden: boolean; m: number } {
  const m = s % M;
  let r = (s - m) / M;
  const g = r % 2; r = (r - g) / 2;
  const mask = r % 8;
  const pos = (r - mask) / 8;
  return { pos, mask, golden: g === 1, m };
}

const cache = new Map<string, SolveGraph>();

function boardKey(b: Board): string {
  return `${heightOf(b)}|${b.tiles}|${b.start}|${b.chest}|${b.pearls.join(',')}|${b.golden}|${b.P}`;
}

export function buildGraph(board: Board): SolveGraph {
  const key = boardKey(board);
  const hit = cache.get(key);
  if (hit) return hit;
  const M = board.P ? board.P * 2 : 1;
  const n = cellsOf(board) * 8 * 2 * M;
  const next = new Int32Array(n * 5).fill(-1);
  const carried = new Int8Array(n * 5);
  const rip = new Int8Array(n * 5);
  const acts = board.P ? 5 : 4;
  const full = fullMask(board);
  for (let s = 0; s < n; s++) {
    const { pos, mask, golden, m } = decode(M, s);
    if (mask > full || (golden && board.golden < 0)) continue;
    const tile = board.tiles[pos];
    if (tile === '#' || pos === board.chest) continue;
    const tide = tideAt(board.P, m, 0);
    for (let a = 0; a < acts; a++) {
      const sim = simulateStroke(board, pos, mask, golden, tide, a === A_TREAD ? -1 : a);
      if (sim.bump) continue;
      const c = a === A_TREAD ? 0 : Math.max(0, sim.path.length - 2);
      carried[s * 5 + a] = c;
      rip[s * 5 + a] = a !== A_TREAD && isRiptide(sim.runs, c) ? 1 : 0;
      if (sim.cleared) { next[s * 5 + a] = sim.golden ? -3 : -2; continue; }
      next[s * 5 + a] = stateKey(M, sim.pos, sim.mask, sim.golden, (m + 1) % M);
    }
  }
  const distClear = reverseDistances(n, next, false);
  const distGold = reverseDistances(n, next, true);
  const graph: SolveGraph = { board, M, nStates: n, next, carried, rip, distClear, distGold };
  if (cache.size > 64) cache.clear();
  cache.set(key, graph);
  return graph;
}

function reverseDistances(n: number, next: Int32Array, gold: boolean): Int32Array {
  const dist = new Int32Array(n).fill(INF);
  // Reverse adjacency.
  const counts = new Int32Array(n + 1);
  for (let s = 0; s < n; s++) for (let a = 0; a < 5; a++) { const t = next[s * 5 + a]; if (t >= 0) counts[t + 1]++; }
  for (let i = 0; i < n; i++) counts[i + 1] += counts[i];
  const fill = counts.slice(0, n);
  const rev = new Int32Array(counts[n]);
  for (let s = 0; s < n; s++) for (let a = 0; a < 5; a++) { const t = next[s * 5 + a]; if (t >= 0) rev[fill[t]++] = s; }
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let s = 0; s < n; s++) {
    for (let a = 0; a < 5; a++) {
      const t = next[s * 5 + a];
      if (t === -3 || (t === -2 && !gold)) { dist[s] = 1; queue[tail++] = s; break; }
    }
  }
  while (head < tail) {
    const s = queue[head++];
    const d = dist[s] + 1;
    for (let k = counts[s]; k < counts[s + 1]; k++) {
      const p = rev[k];
      if (dist[p] > d) { dist[p] = d; queue[tail++] = p; }
    }
  }
  return dist;
}

function voyageState(g: SolveGraph, board: Board, v: Pick<Voyage, 'pos' | 'mask' | 'golden' | 'moves' | 'phase'>): number {
  const m = board.P ? (v.moves + v.phase) % g.M : 0;
  return stateKey(g.M, v.pos, v.mask, v.golden, m);
}

/** Minimum strokes from a voyage state to a clear (golden: a clear holding the golden pearl). */
export function distanceFrom(board: Board, v: Pick<Voyage, 'pos' | 'mask' | 'golden' | 'moves' | 'phase'>, golden = false): number {
  const g = buildGraph(board);
  const s = voyageState(g, board, v);
  const d = (golden ? g.distGold : g.distClear)[s];
  return d >= INF ? Infinity : d;
}

/**
 * "No way home" (0.A.3): can this state still clear within `left` strokes?
 * Display only (previews, dead sheet); nothing goes into the proof.
 */
export function canClear(board: Board, v: Pick<Voyage, 'pos' | 'mask' | 'golden' | 'moves' | 'phase'>, left: number): boolean {
  return distanceFrom(board, v, false) <= left;
}

/**
 * R1 phase table: par and parGold when a voyage starts at tide phase k, for
 * k = 0..2P-1 (row 0 is the board's own par). -1 marks an unsolvable row.
 */
export function phaseTable(board: Board): { parByPhase: number[]; parGoldByPhase: number[] } {
  const g = buildGraph(board);
  const parByPhase: number[] = [];
  const parGoldByPhase: number[] = [];
  const rows = board.P ? board.P * 2 : 1;
  for (let k = 0; k < rows; k++) {
    const s = stateKey(g.M, board.start, 0, false, k % g.M);
    const p = g.distClear[s];
    const pg = board.golden >= 0 ? g.distGold[s] : INF;
    parByPhase.push(p >= INF ? -1 : p);
    parGoldByPhase.push(pg >= INF ? -1 : pg);
  }
  return { parByPhase, parGoldByPhase };
}

/**
 * R1 splash row: the smallest k >= 1 with par0 <= parByPhase[k] <= par0 + 2,
 * solvable, and parGoldByPhase[k] - parByPhase[k] in 1..4. -1 when none.
 * Never easier than the unsplashed board, and at most +2 par.
 */
export function splashPhaseOf(par0: number, parByPhase: readonly number[], parGoldByPhase: readonly number[]): number {
  for (let k = 1; k < parByPhase.length; k++) {
    const p = parByPhase[k];
    const pg = parGoldByPhase[k];
    if (p < 0 || pg < 0) continue;
    if (p < par0 || p > par0 + 2) continue;
    if (pg - p < 1 || pg - p > 4) continue;
    return k;
  }
  return -1;
}

/** One stroke of a replayed route, with what the aha tagger needs. */
export interface RouteStroke {
  readonly action: number;
  readonly path: number[];
  readonly carried: number;
  readonly runs: number;
  readonly tideBefore: number;
  readonly tideAfter: number;
  /** The carry stopped because the next tile was a dry sandbar (LOW). */
  readonly stoppedByDry: boolean;
  /** The stroke ended (not in the chest) on a pearl or the golden pearl it took this stroke. */
  readonly landedOnPickup: boolean;
  readonly cleared: boolean;
}

/** Replay an action list from the voyage start (phase 0) and describe each stroke. */
export function routeStrokes(board: Board, actions: readonly number[], phase = 0): RouteStroke[] {
  const H = heightOf(board);
  const out: RouteStroke[] = [];
  let pos = board.start; let mask = 0; let golden = false; let moves = 0;
  for (const a of actions) {
    const tide = tideAt(board.P, moves, phase);
    const dir = a === A_TREAD ? -1 : a;
    const sim = simulateStroke(board, pos, mask, golden, tide, dir);
    if (sim.bump) break;
    const carried = dir < 0 ? 0 : Math.max(0, sim.path.length - 2);
    const end = sim.path[sim.path.length - 1];
    let stoppedByDry = false;
    if (carried > 0 && !sim.cleared && tide === TIDE_LOW) {
      const c = '^>v<'.indexOf(board.tiles[end]);
      const nxt = c >= 0 ? stepCell(end, c, H) : -1;
      stoppedByDry = nxt >= 0 && board.tiles[nxt] === 's';
    }
    const tookHere = sim.pearls.some((p) => p.cell === end) || (sim.goldenTaken && end === board.golden);
    moves += 1;
    out.push({
      action: a, path: sim.path, carried, runs: sim.runs, tideBefore: tide,
      tideAfter: sim.cleared ? tide : tideAt(board.P, moves, phase), stoppedByDry,
      landedOnPickup: carried > 0 && !sim.cleared && tookHere, cleared: sim.cleared,
    });
    pos = sim.pos; mask = sim.mask; golden = sim.golden;
    if (sim.cleared) break;
  }
  return out;
}

/** Which aha verbs a route uses (R7), in tag priority order. */
export function routeTags(board: Board, actions: readonly number[]): AhaTag[] {
  const st = routeStrokes(board, actions);
  const tags: AhaTag[] = [];
  if (st.some((x) => x.action === A_TREAD && x.tideAfter !== x.tideBefore)) tags.push('wait');
  if (st.some((x) => x.stoppedByDry)) tags.push('low-road');
  if (st.some((x) => x.runs >= 2 && isRiptide(x.runs, x.carried))) tags.push('chain');
  if (st.some((x) => x.carried >= 5)) tags.push('long-ride');
  if (st.some((x) => x.landedOnPickup)) tags.push('bank-shot');
  const last = st[st.length - 1];
  if (last?.cleared && last.path.length >= 2) {
    // Backdoor: the chest is entered from its far side (the tile before it is farther from the start).
    const before = last.path[last.path.length - 2];
    const man = (a: number, b: number) => Math.abs(((a / 5) | 0) - ((b / 5) | 0)) + Math.abs((a % 5) - (b % 5));
    if (man(before, board.start) > man(board.chest, board.start)) tags.push('backdoor');
  }
  return tags;
}

/**
 * The next `count` optimal strokes from a voyage state. Aims for the golden
 * pearl when it is still reachable inside `budget` strokes, else any clear.
 */
export function hintFrom(board: Board, v: Pick<Voyage, 'pos' | 'mask' | 'golden' | 'moves' | 'phase'>, count = 2, budget = Infinity): number[] {
  const g = buildGraph(board);
  let s = voyageState(g, board, v);
  const dg = g.distGold[s];
  const useGold = board.golden >= 0 && dg < INF && dg <= budget;
  const dist = useGold ? g.distGold : g.distClear;
  const out: number[] = [];
  for (let k = 0; k < count; k++) {
    const here = dist[s];
    if (here >= INF) break;
    let best = -1;
    for (let a = 0; a < 5; a++) {
      const t = g.next[s * 5 + a];
      if (t === -3 || (t === -2 && !useGold)) { if (here === 1) { best = a; break; } continue; }
      if (t >= 0 && dist[t] === here - 1) { best = a; break; }
    }
    if (best < 0) break;
    out.push(best);
    const t = g.next[s * 5 + best];
    if (t < 0) break;
    s = t;
  }
  return out;
}

export interface Solution {
  readonly solvable: boolean;
  readonly par: number;
  readonly parGold: number;
  readonly solution: number[];
  readonly solutionGold: number[];
  readonly optimalCount: number;
  readonly optimalGoldCount: number;
  readonly decisionPoints: number;
  /** Some optimal par route contains a Riptide stroke (library alignment, 5.1). */
  readonly parIsRiptide: boolean;
  /** Most Riptide strokes on any optimal Gold route (the Author target). */
  readonly authorRiptide: number;
  /** Most Riptide strokes on any optimal par route. */
  readonly parRiptides: number;
  /** Carries used by the canonical par route. */
  readonly carries: number;
  readonly longestCarry: number;
  readonly treads: number;
  /** Longest carry any legal stroke on the board can make (library cap: 10). */
  readonly maxCarry: number;
}

function maxCarryOf(g: SolveGraph): number {
  let m = 0;
  for (let k = 0; k < g.carried.length; k++) if (g.carried[k] > m) m = g.carried[k];
  return m;
}

function route(g: SolveGraph, start: number, gold: boolean): number[] {
  const dist = gold ? g.distGold : g.distClear;
  const out: number[] = [];
  let s = start;
  let guard = 0;
  while (s >= 0 && dist[s] < INF && guard++ < 64) {
    const here = dist[s];
    let pick = -1;
    for (let a = 0; a < 5; a++) {
      const t = g.next[s * 5 + a];
      if (here === 1 && (t === -3 || (t === -2 && !gold))) { pick = a; out.push(a); return out; }
      if (t >= 0 && dist[t] === here - 1) { pick = a; break; }
    }
    if (pick < 0) break;
    out.push(pick);
    s = g.next[s * 5 + pick];
  }
  return out;
}

/** Count optimal routes (capped) and find the most Riptide strokes among them. */
function enumerate(g: SolveGraph, start: number, gold: boolean, cap = 400): { count: number; bestRip: number; anyRiptide: boolean } {
  const dist = gold ? g.distGold : g.distClear;
  let count = 0;
  let bestRip = 0;
  const walk = (s: number, rip: number) => {
    if (count >= cap) return;
    const here = dist[s];
    for (let a = 0; a < 5; a++) {
      const t = g.next[s * 5 + a];
      const r = rip + g.rip[s * 5 + a];
      if (here === 1 && (t === -3 || (t === -2 && !gold))) {
        count++;
        if (r > bestRip) bestRip = r;
        continue;
      }
      if (t >= 0 && dist[t] === here - 1) walk(t, r);
      if (count >= cap) return;
    }
  };
  if (dist[start] < INF) walk(start, 0);
  return { count, bestRip, anyRiptide: bestRip > 0 };
}

export function solveBoard(board: Board): Solution {
  const g = buildGraph(board);
  const start = stateKey(g.M, board.start, 0, false, 0);
  const par = g.distClear[start];
  const parGold = board.golden >= 0 ? g.distGold[start] : INF;
  if (par >= INF) {
    return { solvable: false, par: 0, parGold: 0, solution: [], solutionGold: [], optimalCount: 0, optimalGoldCount: 0, decisionPoints: 0, parIsRiptide: false, authorRiptide: 0, parRiptides: 0, carries: 0, longestCarry: 0, treads: 0, maxCarry: 0 };
  }
  const solution = route(g, start, false);
  const solutionGold = parGold < INF ? route(g, start, true) : [];
  const clearEnum = enumerate(g, start, false);
  const goldEnum = parGold < INF ? enumerate(g, start, true) : { count: 0, bestRip: 0, anyRiptide: false };
  // Decision points: states on the canonical par route where 2+ strokes stay within par + 1.
  let decisionPoints = 0;
  let carries = 0;
  let longestCarry = 0;
  let treads = 0;
  let s = start;
  let spent = 0;
  for (const a of solution) {
    let good = 0;
    for (let b = 0; b < 5; b++) {
      const t = g.next[s * 5 + b];
      const cost = t === -2 || t === -3 ? 1 : t >= 0 ? 1 + g.distClear[t] : INF;
      if (spent + cost <= par + 1) good++;
    }
    if (good >= 2) decisionPoints++;
    const c = g.carried[s * 5 + a];
    if (c >= 1) carries++;
    if (c > longestCarry) longestCarry = c;
    if (a === A_TREAD) treads++;
    const t = g.next[s * 5 + a];
    spent++;
    if (t < 0) break;
    s = t;
  }
  return {
    solvable: true, par, parGold: parGold >= INF ? 0 : parGold, solution, solutionGold,
    optimalCount: clearEnum.count, optimalGoldCount: goldEnum.count, decisionPoints,
    parIsRiptide: clearEnum.anyRiptide, authorRiptide: goldEnum.bestRip, parRiptides: clearEnum.bestRip,
    carries, longestCarry, treads, maxCarry: maxCarryOf(g),
  };
}

/** Walk every current tile's carry; true when a carry would loop (library rejects). */
export function hasCurrentLoop(board: Board): boolean {
  const H = heightOf(board);
  const n = cellsOf(board);
  for (let i = 0; i < n; i++) {
    const seen = new Set<number>();
    let p = i;
    let d = '^>v<'.indexOf(board.tiles[p]);
    while (d >= 0) {
      if (seen.has(p)) return true;
      seen.add(p);
      p = stepCell(p, d, H);
      if (p < 0) break;
      if (board.tiles[p] === '#') break;
      d = '^>v<'.indexOf(board.tiles[p]);
    }
  }
  return false;
}

/** Longest single current run on the board (library cap: 6 tiles). */
export function longestRun(board: Board): number {
  const H = heightOf(board);
  const n = cellsOf(board);
  let best = 0;
  for (let i = 0; i < n; i++) {
    const d = '^>v<'.indexOf(board.tiles[i]);
    if (d < 0) continue;
    let len = 1;
    let p = stepCell(i, d, H);
    while (p >= 0 && board.tiles[p] === board.tiles[i]) { len++; p = stepCell(p, d, H); }
    if (len > best) best = len;
  }
  return best;
}

/**
 * The wrong-turn marker (6): given the states after each stroke of the
 * surviving stack (state 0 = voyage start), the index of the first state
 * from which no clear fits the remaining budget, or -1. `budgetAt[k]` is the
 * strokes left at state k.
 */
export function firstDeadState(board: Board, states: readonly Pick<Voyage, 'pos' | 'mask' | 'golden' | 'moves' | 'phase'>[], budgetAt: readonly number[]): number {
  for (let k = 0; k < states.length; k++) {
    const d = distanceFrom(board, states[k], false);
    if (!(d <= budgetAt[k])) return k;
  }
  return -1;
}
