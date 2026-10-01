/**
 * simulate.ts: Ride Sprint tuning simulation (design v8 4.1, 13).
 *
 * Plays full server-authoritative runs (engine + layout, 8 plain pairs) with
 * three player profiles so the clock (`memory.ride_sprint.clock_ms`, 45-50s)
 * is set by data, not taste:
 *   careless   no recall strategy, 50% recall reliability: ~20% first-try fail
 *   kidHonest  80% reliability, walking taps: 10-15% first-try, under 3% per Ticket
 *   skilled    adult, near-perfect recall: 3-star rate 15-35%
 * Time is charged time (the network never costs the player a second).
 */

import { botPick } from './bot';
import { createEngine, rideSprintConfig, rideStars, step, type MMState } from './engine';
import { boardSeed, buildLayout, makeRng } from './logic';

export interface SimProfile {
  name: string;
  /** Chance of using a known card (memory quality). */
  recall: number;
  /** Mean ms per flip (think + tap) and its jitter. */
  flipMs: number;
  jitterMs: number;
  /** Extra ms the player looks at a miss before the next tap (quick-dismiss habit). */
  missLookMs: number;
  walking: boolean;
}

export const PROFILES: Record<string, SimProfile> = {
  careless: { name: 'careless', recall: 0.5, flipMs: 1080, jitterMs: 324, missLookMs: 500, walking: false },
  kidHonest: { name: 'kidHonest', recall: 0.8, flipMs: 1380, jitterMs: 414, missLookMs: 650, walking: true },
  skilled: { name: 'skilled', recall: 0.97, flipMs: 1240, jitterMs: 372, missLookMs: 250, walking: false },
  // Legacy names (older tests and tools).
  novice: { name: 'novice', recall: 0.55, flipMs: 850, jitterMs: 250, missLookMs: 500, walking: false },
  kidWalking: { name: 'kidWalking', recall: 0.8, flipMs: 980, jitterMs: 320, missLookMs: 650, walking: true },
  expert: { name: 'expert', recall: 1, flipMs: 560, jitterMs: 130, missLookMs: 150, walking: false },
};

export interface SimResult {
  cleared: boolean;
  turns: number;
  elapsedMs: number;
  score: number;
  showtimes: number;
  stars: number;
}

export function simulateRide(p: SimProfile, seed: number, clockMs = 45000): SimResult {
  const layout = buildLayout({ pairs: 8, deckSize: 10, seed: boardSeed(seed, 0) });
  const s: MMState = createEngine(rideSprintConfig(clockMs), { cols: 4, rows: 4, seed });
  const rng = makeRng(seed ^ 0x2545f491);
  if (p.walking) step(s, { t: 'walking', on: true, at: 0 });
  let t = 0;
  for (let guard = 0; guard < 600 && s.status === 'play'; guard++) {
    let dt = Math.max(220, p.flipMs + (rng() * 2 - 1) * p.jitterMs);
    if (s.phase === 2) dt += p.missLookMs * rng();
    t += dt;
    step(s, { t: 'tick', at: t });
    if (s.status !== 'play') break;
    if (s.phase === 2) step(s, { t: 'dismiss', slot: -1, at: t });
    const slot = botPick(s, p.recall, rng);
    if (slot < 0) break;
    step(s, { t: 'flip', slot, face: layout.faces[s.ids[slot]], at: t });
  }
  return { cleared: s.status === 'cleared', turns: s.turns, elapsedMs: s.elapsedMs, score: s.score, showtimes: s.showtimes, stars: rideStars(s) };
}

export interface SimSummary {
  runs: number;
  failRate: number;
  failAll3: number;
  meanShowtimes: number;
  medianClearMs: number;
  star3Rate: number;
  medianStars: number;
}

export function summarizeProfile(p: SimProfile, runs: number, clockMs = 45000): SimSummary {
  let fails = 0;
  let show = 0;
  let star3 = 0;
  const clears: number[] = [];
  const stars: number[] = [];
  for (let i = 0; i < runs; i++) {
    const r = simulateRide(p, 1000 + i * 7919, clockMs);
    if (!r.cleared) fails++;
    else clears.push(r.elapsedMs);
    if (r.stars >= 3) star3++;
    stars.push(r.stars);
    show += r.showtimes;
  }
  clears.sort((a, b) => a - b);
  stars.sort((a, b) => a - b);
  const f = fails / runs;
  return {
    runs,
    failRate: f,
    failAll3: f * f * f,
    meanShowtimes: show / runs,
    medianClearMs: clears.length ? clears[Math.floor(clears.length / 2)] : 0,
    star3Rate: star3 / runs,
    medianStars: stars[Math.floor(stars.length / 2)] ?? 0,
  };
}
