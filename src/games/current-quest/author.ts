/**
 * Race the Author (design v7.1 0.A.1). Kept out of solver.ts so the shared party sim
 * bundle (and the server's copy of it) does not change for a client-only feature.
 */
import { buildGraph, stateKey } from './solver';
import type { Board } from './rules';

const INF = 1 << 29;

/**
 * The Author route (0.A.1, Trackmania): an optimal Gold route with the most Riptide strokes,
 * as stroke actions. Chart boards send it as the Race the Author ghost after a verified Gold.
 */
export function authorRoute(board: Board, cap = 400): number[] {
  const g = buildGraph(board);
  const start = stateKey(g.M, board.start, 0, false, 0);
  const gold = board.golden >= 0 && g.distGold[start] < INF;
  const dist = gold ? g.distGold : g.distClear;
  if (dist[start] >= INF) return [];
  let best: number[] = [];
  let bestRip = -1;
  let count = 0;
  const stack: number[] = [];
  const walk = (s: number, rip: number) => {
    if (count >= cap) return;
    const here = dist[s];
    for (let a = 0; a < 5; a++) {
      const t = g.next[s * 5 + a];
      const r = rip + g.rip[s * 5 + a];
      if (here === 1 && (t === -3 || (t === -2 && !gold))) {
        count++;
        if (r > bestRip) { bestRip = r; best = [...stack, a]; }
        continue;
      }
      if (t >= 0 && dist[t] === here - 1) { stack.push(a); walk(t, r); stack.pop(); }
      if (count >= cap) return;
    }
  };
  walk(start, 0);
  return best;
}
