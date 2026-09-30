/**
 * Current Quest solver (design 5.1). Exhaustive state graph over
 * (position, pearl mask, golden taken, tide clock) with every stroke costing 1.
 * Well under 4k states per board, so a full build takes a few ms.
 *
 * Used for: library par / parGold, Author target, decision points, the Tide
 * Tip (next optimal strokes), the free first-stroke hint, the near-miss line,
 * the red "No way home" preview and the Splash par adjustment.
 */

import {
  A_TREAD, CELLS, fullMask, simulateStroke, stepCell, tideAt,
  type Board, type Voyage,
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
  return `${b.tiles}|${b.start}|${b.chest}|${b.pearls.join(',')}|${b.golden}|${b.P}`;
}

export function buildGraph(board: Board): SolveGraph {
  const key = boardKey(board);
  const hit = cache.get(key);
  if (hit) return hit;
  const M = board.P ? board.P * 2 : 1;
  const n = CELLS * 8 * 2 * M;
  const next = new Int32Array(n * 5).fill(-1);
  const carried = new Int8Array(n * 5);
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
      carried[s * 5 + a] = a === A_TREAD ? 0 : Math.max(0, sim.path.length - 2);
      if (sim.cleared) { next[s * 5 + a] = sim.golden ? -3 : -2; continue; }
      next[s * 5 + a] = stateKey(M, sim.pos, sim.mask, sim.golden, (m + 1) % M);
    }
  }
  const distClear = reverseDistances(n, next, false);
  const distGold = reverseDistances(n, next, true);
  const graph: SolveGraph = { board, M, nStates: n, next, carried, distClear, distGold };
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

/** Remaining par used by the Splash par adjustment. */
export function remainingPar(board: Board, v: Voyage, withGolden: boolean): number {
  const d = distanceFrom(board, v, withGolden && !v.golden ? true : v.golden);
  return Number.isFinite(d) ? d : 0;
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
  readonly parIsRiptide: boolean;
  readonly authorRiptide: number;
  /** Carries used by the canonical par route. */
  readonly carries: number;
  readonly longestCarry: number;
  readonly treads: number;
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

/** Count optimal routes (capped) and find the best Riptide tile count among them. */
function enumerate(g: SolveGraph, start: number, gold: boolean, cap = 400): { count: number; bestRip: number; anyRiptide: boolean } {
  const dist = gold ? g.distGold : g.distClear;
  let count = 0;
  let bestRip = 0;
  let anyRiptide = false;
  const walk = (s: number, flow: number, rip: number, lit: boolean) => {
    if (count >= cap) return;
    const here = dist[s];
    for (let a = 0; a < 5; a++) {
      const t = g.next[s * 5 + a];
      const c = g.carried[s * 5 + a];
      const f = c >= 1 ? flow + 1 : 0;
      const r = f >= 3 ? rip + c : rip;
      const l = lit || f >= 3;
      if (here === 1 && (t === -3 || (t === -2 && !gold))) {
        count++;
        if (r > bestRip) bestRip = r;
        if (l) anyRiptide = true;
        continue;
      }
      if (t >= 0 && dist[t] === here - 1) walk(t, f, r, l);
      if (count >= cap) return;
    }
  };
  if (dist[start] < INF) walk(start, 0, 0, false);
  return { count, bestRip, anyRiptide };
}

export function solveBoard(board: Board): Solution {
  const g = buildGraph(board);
  const start = stateKey(g.M, board.start, 0, false, 0);
  const par = g.distClear[start];
  const parGold = board.golden >= 0 ? g.distGold[start] : INF;
  if (par >= INF) {
    return { solvable: false, par: 0, parGold: 0, solution: [], solutionGold: [], optimalCount: 0, optimalGoldCount: 0, decisionPoints: 0, parIsRiptide: false, authorRiptide: 0, carries: 0, longestCarry: 0, treads: 0 };
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
    parIsRiptide: clearEnum.anyRiptide, authorRiptide: goldEnum.bestRip,
    carries, longestCarry, treads,
  };
}

/** Walk every current tile's carry; true when a carry would loop (library rejects). */
export function hasCurrentLoop(board: Board): boolean {
  // Follow each current chain; a revisit means a loop.
  for (let i = 0; i < CELLS; i++) {
    const seen = new Set<number>();
    let p = i;
    let d = '^>v<'.indexOf(board.tiles[p]);
    while (d >= 0) {
      if (seen.has(p)) return true;
      seen.add(p);
      p = stepCell(p, d);
      if (p < 0) break;
      if (board.tiles[p] === '#') break;
      d = '^>v<'.indexOf(board.tiles[p]);
    }
  }
  return false;
}
