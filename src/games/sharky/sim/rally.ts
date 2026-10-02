/**
 * Rally rules (design v7.1 section 11), shared by the phone, the lab server and
 * the server verifier: one seeded course of about 18s (lead-in, a split gate,
 * the Ride Gate finish) at the fixed 400-460 u/s curve, D2 and the tier-3
 * hazard set for everyone, no catch-up and no speed deciders. Placements are
 * by verified score; within 1%, more Close Skims wins. House-crew seats and
 * ghosts in empty seats are planned deterministically from (seed, seat,
 * profile) and always labeled as ghosts.
 */

import { MODE_RALLY, END_FINISH, encodeInputs, hash2, type SimConfig, type SimState } from './core';
import { BOT_PROFILES, planRun } from './bots';

/** A DNF after 45s of sim time (the course takes about 18s). */
export const RALLY_MAX_STEPS = 2700;
export const RALLY_SEATS = 4;
export const HOUSE_CREW = [
  { name: 'Captain Fin', profile: 'ace' },
  { name: 'Bubbles', profile: 'regular' },
  { name: 'Coral', profile: 'rookie' },
  { name: 'Chomps', profile: 'regular' },
];

export function rallyConfig(seed: number): SimConfig {
  return { seed: seed | 0, mode: MODE_RALLY, difficulty: 2, tier: 3, runs: 9 };
}

/** A house-crew (ghost-seat) rally run: full input log and outcome, identical everywhere. */
export function rallyBot(seed: number, seat: number, profile: string): { inputs: string; finishStep: number; score: number; closeSkims: number; finished: boolean } {
  const p = BOT_PROFILES[profile] ?? BOT_PROFILES.regular;
  const { log, s } = planRun(rallyConfig(seed), p, hash2(seed, seat + 101), RALLY_MAX_STEPS);
  return { inputs: encodeInputs(log), finishStep: s.finishStep, score: s.score, closeSkims: s.stCloseSkims, finished: s.endReason === END_FINISH };
}

/**
 * Rally order (design 11.3): finishers before DNFs, then higher verified
 * score; within 1% of score, more Close Skims wins. Negative = a ranks first.
 */
export function rallyCompare(a: { finished: boolean; score: number; closeSkims?: number }, b: { finished: boolean; score: number; closeSkims?: number }): number {
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  const hi = Math.max(a.score, b.score, 1);
  if (Math.abs(a.score - b.score) * 100 <= hi) {
    const d = (b.closeSkims ?? 0) - (a.closeSkims ?? 0);
    if (d !== 0) return d;
  }
  return b.score - a.score;
}

/** A sortable key for when a comparator is not available (score first; ties by Close Skims). */
export function rallyRankKey(finished: boolean, score: number, closeSkims: number): number {
  return (finished ? 1e12 : 0) + score * 1000 + Math.min(999, closeSkims);
}

export function rallyOutcome(s: SimState): { finished: boolean; finishStep: number; score: number; closeSkims: number; distance: number } {
  return { finished: s.endReason === END_FINISH, finishStep: s.finishStep, score: s.score, closeSkims: s.stCloseSkims, distance: s.dist >> 8 };
}

/** Score split at each gate (Trackmania splits compare score at the gate, design 7.10). */
export function splitDelta(mine: number[], theirs: number[], gate: number): number {
  return (mine[gate] ?? 0) - (theirs[gate] ?? 0);
}

export { HOUSE_CREW as RALLY_HOUSE_CREW };
