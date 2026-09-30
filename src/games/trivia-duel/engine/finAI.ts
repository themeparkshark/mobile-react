/**
 * Captain Fin (design 7.2): calibrated accuracy and quantile lock times.
 *
 * Per question Fin reads calibration stats (p_correct and the correct-answer
 * lock-time quantiles t10/t30/t50/t70), or tier priors before 30 answers, and
 * plays at his rank's offset. Seeded per (match seed, round), so a match, a
 * ghost replay and the server's grade all see the same Fin. No bluffs, no
 * feints: low ranks buzz wrong more and hand you steals.
 */
import { createRng, mixSeed, rngFloat, rngGaussian, rngInt, rngWeighted, type Rng } from '../../../gamekit/core/rng';
import {
  FIN_BUZZ_FACTOR, FIN_DEMOTE_AFTER_LOSSES, FIN_LOCK_SIGMA, FIN_PRIORS, FIN_RANKS, FIN_RANK_ORDER, FIN_WRONG_SLOWDOWN,
  WAGER, type Difficulty, type FinRank,
} from './config';
import { clamp, wagerStakes } from './scoring';

export interface QuestionStats {
  p: number;
  /** t10, t30, t50, t70 of correct-answer lock times (ms from unlock). */
  t: readonly [number, number, number, number];
  /** Park wrong-answer distribution by choice index (weights), optional. */
  dist?: readonly number[];
}

export function priorStats(difficulty: Difficulty): QuestionStats {
  return FIN_PRIORS[difficulty];
}

export function finAccuracy(rank: FinRank, p: number): number {
  const r = FIN_RANKS[rank];
  return clamp(p + r.acc, 0.05, r.accCap);
}

export function finQuantileMs(rank: FinRank, stats: QuestionStats): number {
  return stats.t[FIN_RANKS[rank].quantile];
}

export function finRng(seed: number, round: number): Rng {
  return createRng(mixSeed(seed >>> 0, (0x5f1d + round * 7919) >>> 0));
}

export interface FinAnswer {
  choice: number;
  correct: boolean;
  /** ms from unlock when he locks. */
  lockMs: number;
  /** ms from unlock when he buzzes (buzz rounds). */
  buzzMs: number;
}

export interface FinQuestion {
  correctIndex: number;
  choiceCount: number;
  windowMs: number;
  graceMs: number;
  stats: QuestionStats;
  /** Tiles Fin may not pick (none today; kept for Chomp-style shapes). */
  removed?: readonly number[];
}

/**
 * Sample Fin's answer. Lock time is log-normal around the rank quantile
 * (sigma 0.25), clamped to [g + 200, W - 600]; wrong answers hesitate 1.15x.
 */
export function finAnswer(seed: number, round: number, rank: FinRank, q: FinQuestion): FinAnswer {
  const r = finRng(seed, round);
  const acc = finAccuracy(rank, q.stats.p);
  const correct = rngFloat(r) < acc;
  let choice = q.correctIndex;
  if (!correct) {
    const wrong: number[] = [];
    const weights: number[] = [];
    for (let i = 0; i < q.choiceCount; i++) {
      if (i === q.correctIndex || (q.removed && q.removed.indexOf(i) >= 0)) continue;
      wrong.push(i);
      weights.push(q.stats.dist ? Math.max(0.01, q.stats.dist[i] ?? 1) : 1);
    }
    choice = wrong.length ? wrong[rngWeighted(r, weights)] : q.correctIndex;
  }
  const median = finQuantileMs(rank, q.stats);
  let t = median * Math.exp(FIN_LOCK_SIGMA * rngGaussian(r));
  if (!correct) t *= FIN_WRONG_SLOWDOWN;
  const lo = q.graceMs + 200;
  const hi = Math.max(lo, q.windowMs - 600);
  const lockMs = Math.round(clamp(t, lo, hi));
  return { choice, correct: choice === q.correctIndex, lockMs, buzzMs: Math.round(Math.max(lo, lockMs * FIN_BUZZ_FACTOR)) };
}

/** Closest Number: truth + Normal(0, tol x (1.1 - accuracy)). */
export function finClosestGuess(seed: number, round: number, rank: FinRank, truth: number, tol: number, p: number, min: number, max: number): number {
  const r = finRng(seed, round + 101);
  const acc = finAccuracy(rank, p);
  return Math.round(clamp(truth + rngGaussian(r) * tol * (1.1 - acc), min, max));
}

/**
 * Fin's wager (5.5): leading by 200+ = 25%, within 200 = 50%, trailing = ALL IN.
 * Deckhand and First Mate add one chip of noise either way.
 */
export function finWagerIndex(seed: number, rank: FinRank, finScore: number, playerScore: number): number {
  const r = finRng(seed, 999);
  const lead = finScore - playerScore;
  let idx = lead >= 200 ? 1 : lead > -200 ? 2 : 3;
  if (rank === 'deckhand' || rank === 'firstmate') {
    const n = rngInt(r, -1, 1);
    idx = clamp(idx + n, 0, WAGER.percents.length - 1);
  }
  return idx;
}

export function finStake(seed: number, rank: FinRank, finScore: number, playerScore: number): number {
  return wagerStakes(finScore)[finWagerIndex(seed, rank, finScore, playerScore)];
}

// -- Rank ladder (7.2): promote after N wins at a rank, demote after 3 straight losses.

export interface FinRankState {
  rank: FinRank;
  winsAtRank: number;
  lossStreak: number;
}

export function createRankState(rank: FinRank = 'deckhand'): FinRankState {
  return { rank, winsAtRank: 0, lossStreak: 0 };
}

export function applyMatchToRank(s: FinRankState, playerWon: boolean): { promoted: boolean; demoted: boolean } {
  const i = FIN_RANK_ORDER.indexOf(s.rank);
  if (playerWon) {
    s.lossStreak = 0;
    s.winsAtRank += 1;
    if (s.winsAtRank >= FIN_RANKS[s.rank].promoteAfter && i < FIN_RANK_ORDER.length - 1) {
      s.rank = FIN_RANK_ORDER[i + 1];
      s.winsAtRank = 0;
      return { promoted: true, demoted: false };
    }
    return { promoted: false, demoted: false };
  }
  s.lossStreak += 1;
  if (s.lossStreak >= FIN_DEMOTE_AFTER_LOSSES && i > 0) {
    s.rank = FIN_RANK_ORDER[i - 1];
    s.lossStreak = 0;
    s.winsAtRank = 0;
    return { promoted: false, demoted: true };
  }
  return { promoted: false, demoted: false };
}

// -- Barks (7.3): max 32 characters, always positive, no emoji. -----------------

export const BARKS = {
  intro: ['Ahoy! Ready to race?', 'Fastest fin wins!', 'Buzzers ready, matey!', 'Let us see those fins!'],
  youFast: ['Whoa, fast fins!', 'Quick as a wave!', 'Now THAT was speedy!'],
  youCorrect: ['Nice one!', 'Sharp shark!', 'You know your stuff!', 'Right on the nose!'],
  finWrong: ['Oops, my bad!', 'Barnacles! Missed it.', 'Well, that was not it!'],
  finCorrect: ['Got it!', 'Easy for the captain!', 'Knew that one!'],
  finalLead: ['Big wager time!', 'Let us make it count!'],
  finalTrail: ['All or nothing, eh?', 'Still anyone\'s game!'],
  finWins: ['Good game! Again?', 'Close one! Rematch?'],
  finLoses: ['You got me! Great game!', 'Captain overboard! GG!'],
  buzz: ['Hands on the bell!', 'Who rings first?'],
  steal: ['Steal it!', 'Your chance to steal!'],
} as const;

export function pickBark(kind: keyof typeof BARKS, n: number): string {
  const list = BARKS[kind];
  return list[Math.abs(n) % list.length];
}
