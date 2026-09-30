/**
 * Sprint Race rules shared by the phone, the lab server and the server
 * verifier (design 10.4): one seeded 7,500u course, D2 and the tier-3 hazard
 * set for everyone, house-crew seats planned deterministically from
 * (seed, seat, profile), placements by fewest sim steps to the finish.
 */

import { MODE_RACE, END_FINISH, encodeInputs, hash2, type SimConfig, type SimState } from './core';
import { BOT_PROFILES, planRun } from './bots';

export const RACE_MAX_STEPS = 2700; // 45s of sim time: a DNF after that
export const RACE_SEATS = 4;
export const HOUSE_CREW = [
  { name: 'Captain Fin', profile: 'ace' },
  { name: 'Bubbles', profile: 'regular' },
  { name: 'Coral', profile: 'rookie' },
  { name: 'Chomps', profile: 'regular' },
];

export function raceConfig(seed: number): SimConfig {
  return { seed: seed | 0, mode: MODE_RACE, difficulty: 2, tier: 3, runs: 9 };
}

/** A house-crew racer's full input log and outcome (identical everywhere). */
export function raceBot(seed: number, seat: number, profile: string): { inputs: string; finishStep: number; score: number; finished: boolean } {
  const p = BOT_PROFILES[profile] ?? BOT_PROFILES.regular;
  const { log, s } = planRun(raceConfig(seed), p, hash2(seed, seat + 101), RACE_MAX_STEPS);
  return { inputs: encodeInputs(log), finishStep: s.finishStep, score: s.score, finished: s.endReason === END_FINISH };
}

/** Rank key: finishers by fewest steps (within 3 steps, score breaks the tie), then distance. */
export function raceRankKey(finished: boolean, finishStep: number, score: number, distance: number): number {
  if (!finished) return distance;
  return 1e9 - Math.floor(finishStep / 3) * 1e4 + Math.min(9999, score);
}

export function raceOutcome(s: SimState): { finished: boolean; finishStep: number; score: number; distance: number } {
  return { finished: s.endReason === END_FINISH, finishStep: s.finishStep, score: s.score, distance: s.dist >> 8 };
}

export { HOUSE_CREW as RACE_HOUSE_CREW };
