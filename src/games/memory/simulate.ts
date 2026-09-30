/**
 * simulate.ts: Ride Sprint tuning simulation (design 4.1, 13).
 *
 * Plays full server-authoritative runs (engine + layout) with player profiles
 * so the clock (`memory.ride_sprint.clock_ms`) is set by data, not taste.
 */

import { botPick } from './bot';
import { createEngine, rideSprintConfig, step, type MMState } from './engine';
import { boardSeed, buildLayout, makeRng } from './logic';

export interface SimProfile {
  name: string;
  /** Chance of using a known card (memory quality). */
  recall: number;
  /** Mean ms per turn (two flips) and its jitter. */
  turnMs: number;
  jitterMs: number;
  walking: boolean;
}

export const PROFILES: Record<string, SimProfile> = {
  novice: { name: 'novice', recall: 0.55, turnMs: 1700, jitterMs: 500, walking: false },
  kidWalking: { name: 'kidWalking', recall: 0.6, turnMs: 2000, jitterMs: 600, walking: true },
  expert: { name: 'expert', recall: 1, turnMs: 1100, jitterMs: 250, walking: false },
};

export interface SimResult {
  cleared: boolean;
  turns: number;
  elapsedMs: number;
  score: number;
  showtimes: number;
}

export function simulateRide(p: SimProfile, seed: number, clockMs = 45000): SimResult {
  const layout = buildLayout({ pairs: 8, deckSize: 10, seed: boardSeed(seed, 0), golden: true });
  const s: MMState = createEngine(rideSprintConfig(clockMs), { cols: 4, rows: 4, seed });
  const rng = makeRng(seed ^ 0x2545f491);
  if (p.walking) step(s, { t: 'walking', on: true, at: 0 });
  let t = 0;
  for (let guard = 0; guard < 400 && s.status === 'play'; guard++) {
    const half = Math.max(250, (p.turnMs + (rng() * 2 - 1) * p.jitterMs) / 2);
    t += half;
    step(s, { t: 'tick', at: t });
    if (s.status !== 'play') break;
    if (s.phase === 2) step(s, { t: 'dismiss', slot: -1, at: t });
    const slot = botPick(s, p.recall, rng);
    if (slot < 0) break;
    step(s, { t: 'flip', slot, face: layout.faces[s.ids[slot]], at: t });
  }
  return { cleared: s.status === 'cleared', turns: s.turns, elapsedMs: s.elapsedMs, score: s.score, showtimes: s.showtimes };
}

export interface SimSummary {
  runs: number;
  failRate: number;
  failAll3: number;
  meanShowtimes: number;
  medianClearMs: number;
}

export function summarizeProfile(p: SimProfile, runs: number, clockMs = 45000): SimSummary {
  let fails = 0;
  let show = 0;
  const clears: number[] = [];
  for (let i = 0; i < runs; i++) {
    const r = simulateRide(p, 1000 + i * 7919, clockMs);
    if (!r.cleared) fails++;
    else clears.push(r.elapsedMs);
    show += r.showtimes;
  }
  clears.sort((a, b) => a - b);
  const f = fails / runs;
  return {
    runs,
    failRate: f,
    failAll3: f * f * f,
    meanShowtimes: show / runs,
    medianClearMs: clears.length ? clears[Math.floor(clears.length / 2)] : 0,
  };
}
