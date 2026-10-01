/**
 * Async ghosts (design 11.1): a rival's verified run replayed on the same
 * seed, shown at YOUR clock step (Trackmania rule), so freezes never matter.
 * Ghosts live in the rival strip and as a tick on the lane rail, never as a
 * basket in your field.
 *
 * The ghost is the real sim driven by the rival's logged inputs, so its
 * basket, pile and score are exact. Worklet-safe: it advances on the UI thread
 * next to your own sim.
 */

import { createSim, finalScore, step, type SimConfig, type SimState } from './sim';
import { createBot, botInput, BOT_EXPERT, type Bot } from './bots';

export interface Ghost {
  sim: SimState;
  log: number[];
  cursor: number;
  name: string;
  /** Final verified score (for the comparison line). */
  final: number;
}

export interface GhostCompare {
  line: string;
  won: boolean;
}

export function createGhost(cfg: SimConfig, log: number[], name: string, final: number): Ghost {
  'worklet';
  return { sim: createSim(cfg), log, cursor: 0, name, final };
}

/** Advance the ghost until its clock reaches `clock` (or its run ends). */
export function ghostAdvance(g: Ghost, clock: number): void {
  'worklet';
  const s = g.sim;
  let guard = 0;
  while (!s.done && g.cursor < g.log.length && s.clock < clock && guard < 8) {
    const v = g.log[g.cursor++];
    step(s, v & 1, v >> 1);
    // Frozen stretches of the rival's log cost no clock: keep going.
    if (s.holdTs > 0) guard++;
  }
}

/**
 * Staff ghost "Finn": the Expert bot's run on the given seed (the daily seed
 * in the queue). Returns the input log and final score.
 */
export function finnRun(cfg: SimConfig, seed = 0x46494e4e): { log: number[]; score: number } {
  const s = createSim({ ...cfg, cards: 0xffff });
  const b: Bot = createBot(BOT_EXPERT, seed);
  for (let n = 0; n < 40000 && !s.done; n++) {
    const q4 = botInput(s, b);
    step(s, 1, q4);
  }
  return { log: s.log.slice(), score: finalScore(s) };
}

/** One comparison line from the biggest stat delta ("They caught 4 more PERFECTs"). */
export function compareLine(me: SimState, rival: SimState, rivalName: string): GhostCompare {
  const my = finalScore(me);
  const theirs = finalScore(rival);
  const won = my >= theirs;
  const deltas: [number, string][] = [
    [rival.perfects - me.perfects, 'PERFECTs'],
    [rival.maxChain - me.maxChain, 'longer chain'],
    [rival.bounces - me.bounces, 'ball bounces'],
    [rival.fevers - me.fevers, 'Golden Hours'],
    [me.misses - rival.misses, 'fewer misses'],
  ];
  if (won) {
    const best = deltas.reduce((a, b) => (b[0] < a[0] ? b : a));
    const n = -best[0];
    if (n <= 0) return { line: `You beat ${rivalName} by ${my - theirs}`, won };
    return { line: `You beat ${rivalName}: ${n} more ${best[1].replace('fewer misses', 'catches kept')}`, won };
  }
  const best = deltas.reduce((a, b) => (b[0] > a[0] ? b : a));
  if (best[0] <= 0) return { line: `${rivalName} won by ${theirs - my}`, won };
  if (best[1] === 'longer chain') return { line: `${rivalName}'s chain ran ${best[0]} longer`, won };
  if (best[1] === 'fewer misses') return { line: `${rivalName} missed ${best[0]} fewer`, won };
  return { line: `${rivalName} got ${best[0]} more ${best[1]}`, won };
}
