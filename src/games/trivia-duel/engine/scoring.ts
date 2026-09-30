/**
 * Trivia Duel scoring (design 5.x). Pure and worklet-safe: the live ticker on
 * the UI thread and the lock handler call the SAME functions with the SAME
 * elapsed value, so locking on any frame awards exactly what the ticker showed.
 * The server grades with a PHP port of this file (shared JSON vectors in
 * tools/tests/fixtures/trivia-duel-vectors.json).
 */
import {
  BUZZ, GRACE, HOT_STREAK, BLAZING, POINTS, READ_LOCK, RIDE_STARS, RIDE_WIN_CORRECT, STREAK_MULT, TIERS, WAGER,
  type SpeedTier,
} from './config';

export function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

/** Round to the nearest 5 (the ticker only ever shows multiples of 5). */
export function round5(v: number): number {
  'worklet';
  return Math.round(v / 5) * 5;
}

/** Total displayed characters across the choices. */
export function choiceChars(choices: readonly string[]): number {
  let n = 0;
  for (let i = 0; i < choices.length; i++) n += choices[i].length;
  return n;
}

/** 5.2 grace window: reading time for the answers before speed starts to drain. */
export function graceMs(choices: readonly string[] | 'slider'): number {
  if (choices === 'slider') return GRACE.slider;
  return clamp(GRACE.base + GRACE.perChar * choiceChars(choices), GRACE.min, GRACE.max);
}

/** Read-lock length before jitter (tiles face-down, question text visible). */
export function readLockMs(questionChars: number, family: 'ride' | 'queue'): number {
  const r = READ_LOCK[family];
  return clamp(r.base + r.perChar * questionChars, r.min, r.max);
}

/** Speed points 0..max with a horizon H: after H a correct answer still scores its base. */
export function speedPoints(t: number, g: number, h: number, max: number = POINTS.speedMax): number {
  'worklet';
  if (h <= g) return t <= g ? max : 0;
  return round5(max * clamp(1 - (t - g) / (h - g), 0, 1));
}

export function streakMult(streakAfter: number): number {
  'worklet';
  for (let i = 0; i < STREAK_MULT.length; i++) if (streakAfter >= STREAK_MULT[i][0]) return STREAK_MULT[i][1];
  return 1;
}

export function flameTier(streak: number): 0 | 1 | 2 | 3 | 5 {
  'worklet';
  if (streak >= BLAZING) return 5;
  if (streak >= HOT_STREAK) return 3;
  if (streak >= 2) return 2;
  if (streak >= 1) return 1;
  return 0;
}

export function speedTier(speed: number): SpeedTier {
  'worklet';
  for (let i = 0; i < TIERS.length; i++) if (speed >= TIERS[i].min) return TIERS[i].tier;
  return 'none';
}

export interface SpeedMods {
  /** Chomp caps speed at 50. */
  chomp?: boolean;
  /** HOLD after unlock forfeits the speed bonus. */
  holdForfeit?: boolean;
}

/** Speed actually credited for a lock at `t` ms after unlock. */
export function creditedSpeed(t: number, g: number, h: number, mods: SpeedMods = {}): number {
  'worklet';
  if (mods.holdForfeit) return 0;
  const s = speedPoints(t, g, h);
  return mods.chomp ? Math.min(s, POINTS.chompSpeedCap) : s;
}

/** The ticker value shown at `t`: `+{100 + speed}` (before the streak multiplier). */
export function tickerValue(t: number, g: number, h: number, mods: SpeedMods = {}): number {
  'worklet';
  return POINTS.base + creditedSpeed(t, g, h, mods);
}

/** Quick Draw / Final question points (before any wager stake). */
export function quickPoints(correct: boolean, t: number, g: number, h: number, streakAfter: number, mods: SpeedMods = {}): number {
  'worklet';
  if (!correct) return 0;
  return Math.round(tickerValue(t, g, h, mods) * streakMult(streakAfter));
}

/** 4.1 ride challenge points: 100 + round5(150 x speed fraction), no streak multiplier. */
export function ridePoints(correct: boolean, t: number, g: number, mods: SpeedMods = {}): number {
  'worklet';
  if (!correct) return 0;
  if (mods.holdForfeit) return POINTS.base;
  let s = speedPoints(t, g, POINTS.rideWindowMs, POINTS.rideSpeedMax);
  if (mods.chomp) s = Math.min(s, POINTS.chompSpeedCap);
  return POINTS.base + s;
}

export function rideWon(correctCount: number): boolean {
  return correctCount >= RIDE_WIN_CORRECT;
}

/** 4.1 stars (provisional, server-tunable). */
export function rideStars(correctCount: number, total: number, points: number): number {
  if (!rideWon(correctCount)) return 0;
  if (correctCount === total && points >= RIDE_STARS.three) return 3;
  if (points >= RIDE_STARS.two) return 2;
  return 1;
}

/** 5.3 buzz: correct = (150 + speed) x mult, wrong = -75 (0 with a Shield). */
export function buzzPoints(correct: boolean, buzzT: number, g: number, streakAfter: number, shield: boolean, mods: SpeedMods = {}): number {
  if (!correct) return shield ? 0 : POINTS.buzzWrong;
  const s = creditedSpeed(buzzT, g, BUZZ.horizonMs, mods);
  return Math.round((POINTS.buzzBase + s) * streakMult(streakAfter));
}

/** 5.3 steal: 100 + speed(steal time, g 300, H 3s). */
export function stealPoints(correct: boolean, stealT: number, mods: SpeedMods = {}): number {
  if (!correct) return 0;
  return POINTS.stealBase + creditedSpeed(stealT, BUZZ.stealGraceMs, BUZZ.stealHorizonMs, mods);
}

/** Buzz order: lower scored time wins; within 30ms is a photo finish (seeded coin flip). */
export function buzzOrder(aMs: number, bMs: number, coin: number): { first: 'a' | 'b'; photoFinish: boolean } {
  const photo = Math.abs(aMs - bMs) <= BUZZ.photoFinishMs;
  if (photo) return { first: coin < 0.5 ? 'a' : 'b', photoFinish: true };
  return { first: aMs <= bMs ? 'a' : 'b', photoFinish: false };
}

/** 5.2 Closest Number accuracy 0..1. */
export function closestAccuracy(guess: number, truth: number, tol: number): number {
  return clamp(1 - Math.abs(guess - truth) / tol, 0, 1);
}

export function closestPoints(guess: number, truth: number, tol: number, t: number, h: number, streakAfter: number, mods: SpeedMods = {}): { points: number; accuracy: number; correct: boolean; bullseye: boolean } {
  const a = closestAccuracy(guess, truth, tol);
  const correct = a >= 0.8;
  const speed = creditedSpeed(t, GRACE.slider, h, mods);
  const points = Math.round(round5((POINTS.base + speed) * a) * streakMult(correct ? streakAfter : 0));
  return { points, accuracy: a, correct, bullseye: a >= 0.97 };
}

/** 5.5 wager stakes for the current score. */
export function wagerStakes(score: number): number[] {
  if (score < WAGER.fixedBelow) return WAGER.fixed.slice();
  return WAGER.percents.map((p) => Math.round(score * p));
}

/** Final: correct = question points + stake; wrong/timeout = -stake. Score never drops below 0. */
export function applyFinal(score: number, correct: boolean, questionPts: number, stake: number): number {
  return Math.max(0, correct ? score + questionPts + stake : score - stake);
}

/** 4.2 duel stars: loss 0; win 1; win by 150+ or 4+ correct 2; all 5 correct 3. */
export function duelStars(myScore: number, oppScore: number, correct: number, total: number): number {
  if (myScore <= oppScore) return 0;
  if (correct >= total && total > 0) return 3;
  if (myScore - oppScore >= 150 || correct >= 4) return 2;
  return 1;
}

// -- Streak, Shield, lifelines (5.4 / 6) ---------------------------------------

export interface StreakState {
  streak: number;
  best: number;
  shield: boolean;
  freezeEarned: boolean;
}

export function createStreak(streak = 0, shield = false): StreakState {
  return { streak, best: streak, shield, freezeEarned: false };
}

export interface StreakEvent {
  streak: number;
  ignited: boolean;
  blazing: boolean;
  shieldGranted: boolean;
  shieldUsed: boolean;
  freezeGranted: boolean;
  broke: boolean;
}

/**
 * Apply one graded answer to the streak. A wrong answer or timeout with a
 * Shield is absorbed: the streak holds and the Shield pops.
 */
export function applyStreak(s: StreakState, correct: boolean): StreakEvent {
  const ev: StreakEvent = { streak: s.streak, ignited: false, blazing: false, shieldGranted: false, shieldUsed: false, freezeGranted: false, broke: false };
  if (correct) {
    s.streak += 1;
    if (s.streak > s.best) s.best = s.streak;
    if (s.streak === HOT_STREAK) {
      ev.ignited = true;
      if (!s.shield) { s.shield = true; ev.shieldGranted = true; }
    }
    if (s.streak === BLAZING) ev.blazing = true;
    if (s.streak >= 2 && !s.freezeEarned) { s.freezeEarned = true; ev.freezeGranted = true; }
  } else if (s.shield) {
    s.shield = false;
    ev.shieldUsed = true;
  } else {
    ev.broke = s.streak > 0;
    s.streak = 0;
  }
  ev.streak = s.streak;
  return ev;
}
