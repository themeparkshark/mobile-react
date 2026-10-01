/**
 * Captain Fin (design 7.2): calibrated accuracy and quantile lock times.
 *
 * Per question Fin reads calibration stats (p_correct and the correct-answer
 * lock-time quantiles t10/t30/t50/t70), or tier priors before 30 answers, and
 * plays at his rank's offset. Seeded per (match seed, round), so a match, a
 * ghost replay and the server's grade all see the same Fin. No bluffs, no
 * feints, no tells (7.3): his gaze and fidgets never read his pick or time.
 * Bell rounds: he buzzes on a rank share (50-80%) at 0.9 x his sampled lock
 * time, correctness rolled at his accuracy.
 */
import { createRng, mixSeed, rngFloat, rngGaussian, rngInt, rngWeighted, type Rng } from '../../../gamekit/core/rng';
import {
  BUZZ, FIN_BUZZ_FACTOR, FIN_BUZZ_SHARE, FIN_DEMOTE_AFTER_LOSSES, FIN_LOCK_SIGMA, FIN_PRIORS, FIN_RANKS, FIN_RANK_ORDER, FIN_WRONG_SLOWDOWN,
  WAGER, type Difficulty, type FinRank,
} from './config';
import { clamp, suggestWager, wagerStakes } from './scoring';

export interface QuestionStats {
  p: number;
  /** t10, t30, t50, t70 of correct-answer lock times (ms from unlock). */
  t: readonly [number, number, number, number];
  /** Park answer distribution by choice index (weights), optional. */
  dist?: readonly number[];
  /** Answers on record (calibration needs 30+). Absent for tier priors. */
  n?: number;
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
  /** ms from unlock when he buzzes (bell rounds), or -1 when he holds back. */
  buzzMs: number;
  /** ms from his own tile flip to his answer after a buzz (bell rounds). */
  answerMs: number;
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
  // Bell: a separate seeded stream so adding the bell never shifts his Quick Draw picks.
  const br = createRng(mixSeed(seed >>> 0, (0xb311 + round * 131) >>> 0));
  const buzzes = rngFloat(br) < FIN_BUZZ_SHARE[rank];
  const bt = Math.round(clamp(lockMs * FIN_BUZZ_FACTOR, BUZZ.graceMs + 200, BUZZ.buzzWindowMs - 300));
  const answerMs = Math.round(clamp(500 + rngFloat(br) * 1600, 450, BUZZ.answerMs - 400));
  return { choice, correct: choice === q.correctIndex, lockMs, buzzMs: buzzes ? bt : -1, answerMs };
}

/** Closest Number: truth + Normal(0, tol x (1.1 - accuracy)). */
export function finClosestGuess(seed: number, round: number, rank: FinRank, truth: number, tol: number, p: number, min: number, max: number): number {
  const r = finRng(seed, round + 101);
  const acc = finAccuracy(rank, p);
  return Math.round(clamp(truth + rngGaussian(r) * tol * (1.1 - acc), min, max));
}

/**
 * Fin's wager (5.5): he takes suggestWager() for his own state. Deckhand and
 * First Mate pick one chip off 25% of the time.
 */
export function finWagerIndex(seed: number, rank: FinRank, finScore: number, playerScore: number, finMult = 1): number {
  const r = finRng(seed, 999);
  let idx = suggestWager(finScore, playerScore, finMult).index;
  if ((rank === 'deckhand' || rank === 'firstmate') && rngFloat(r) < 0.25) {
    const step = rngInt(r, 0, 1) === 0 ? -1 : 1;
    idx = clamp(idx + step, 0, WAGER.percents.length - 1);
    if (idx === suggestWager(finScore, playerScore, finMult).index) idx = clamp(idx - 2 * step, 0, WAGER.percents.length - 1);
  }
  return idx;
}

export function finStake(seed: number, rank: FinRank, finScore: number, playerScore: number, finMult = 1): number {
  return wagerStakes(finScore)[finWagerIndex(seed, rank, finScore, playerScore, finMult)];
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

// -- Barks (7.2): 60 lines, max 32 characters, positive, event-keyed, no emoji.
// 20 carry a {name} token (the player's name, trimmed to fit).

export const BARKS = {
  intro: ['Ahoy, {name}! Ready?', 'Fastest fin wins!', 'Buzzers ready, matey!', 'Show me those fins, {name}!'],
  youFast: ['Whoa, fast fins!', 'Quick as a wave, {name}!', 'Now THAT was speedy!', 'Lightning fins, {name}!'],
  youCorrect: ['Nice one, {name}!', 'Sharp shark!', 'You know your stuff!', 'Right on the nose!', 'Spot on, {name}!'],
  finWrong: ['Oops, my bad!', 'Barnacles! Missed it.', 'Well, that was not it!', 'Your round, {name}!'],
  finCorrect: ['Got it!', 'Easy for the captain!', 'Knew that one!', 'Captain scores!'],
  finalLead: ['Big wager time!', 'Let us make it count!', 'Bet smart, {name}!'],
  finalTrail: ['All or nothing, eh?', 'Still anyone\'s game!', 'Your move, {name}!'],
  finWins: ['Good game! Again?', 'Close one! Rematch?', 'Great duel, {name}!'],
  finLoses: ['You got me! Great game!', 'Captain overboard! GG!', 'Well played, {name}!'],
  buzz: ['Hands on the bell!', 'Who rings first?', 'Bell is live, {name}!'],
  steal: ['Steal it!', 'Your chance to steal!', 'Snag it, {name}!'],
  stoleBell: ['Stolen! Nice grab!', 'Sneaky fins, {name}!'],
  comeback: ['What a comeback!', 'Look who caught up!', 'Back in it, {name}!'],
  streak3: ['You are on fire!', 'Three in a row, wow!', 'Hot streak, {name}!'],
  shieldSave: ['Saved by the shield!', 'Lucky shield, matey!'],
  bullseye: ['Bullseye! Spot on!', 'Right on the number!', 'Dead on, {name}!'],
  categoryPick: ['Your pick, matey!', 'Choose wisely, {name}!'],
  categoryFin: ['I will pick this one!', 'My pick, {name}!'],
  allIn: ['ALL IN? Bold shark!', 'Going big, I like it!'],
  rematch: ['Back for more? Yes!', 'Round two, {name}!'],
} as const;

export function pickBark(kind: keyof typeof BARKS, n: number, name = 'matey'): string {
  const list = BARKS[kind];
  const line: string = list[Math.abs(n) % list.length];
  if (line.indexOf('{name}') < 0) return line;
  const room = 32 - (line.length - '{name}'.length);
  const nm = name.length > room ? name.slice(0, Math.max(3, room)) : name;
  const out = line.replace('{name}', nm);
  return out.length <= 32 ? out : line.replace(', {name}', '').replace('{name}', 'matey');
}
