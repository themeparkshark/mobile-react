/**
 * Trivia Duel scoring (design 5.x). Pure and worklet-safe: the live ticker on
 * the UI thread and the lock handler call the SAME functions with the SAME
 * elapsed value, so locking on any frame awards exactly what the ticker showed.
 * The server grades with a PHP port of this file (shared JSON vectors in
 * tools/tests/fixtures/trivia-duel-vectors.json).
 */
import {
  BUZZ, GRACE, HOT_STREAK, BLAZING, POINTS, READ_LOCK, RELAXED, RIDE_STARS, RIDE_WIN_CORRECT, STREAK_MULT, TIERS, WAGER,
  type SpeedTier,
} from './config';

// Worklet-safe copies: worklets capture module-level values, not imported bindings.
const W_BASE: number = POINTS.base;
const W_SPEED_MAX: number = POINTS.speedMax;
const W_CHOMP_CAP: number = POINTS.chompSpeedCap;
const W_RIDE_WINDOW: number = POINTS.rideWindowMs;
const W_RIDE_SPEED_MAX: number = POINTS.rideSpeedMax;
const W_MULT: number[][] = STREAK_MULT.map((m) => [m[0], m[1]]);
const W_TIERS: { tier: SpeedTier; min: number }[] = TIERS.map((t) => ({ tier: t.tier, min: t.min }));
const W_HOT: number = HOT_STREAK;
const W_BLAZING: number = BLAZING;
const W_BUZZ_BASE: number = POINTS.buzzBase;
const W_BELL_G: number = BUZZ.graceMs;
const W_BELL_H: number = BUZZ.horizonMs;

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
export function speedPoints(t: number, g: number, h: number, max?: number): number {
  'worklet';
  const m = max === undefined ? W_SPEED_MAX : max;
  if (h <= g) return t <= g ? m : 0;
  return round5(m * clamp(1 - (t - g) / (h - g), 0, 1));
}

export function streakMult(streakAfter: number): number {
  'worklet';
  for (let i = 0; i < W_MULT.length; i++) if (streakAfter >= W_MULT[i][0]) return W_MULT[i][1];
  return 1;
}

export function flameTier(streak: number): 0 | 1 | 2 | 3 | 5 {
  'worklet';
  if (streak >= W_BLAZING) return 5;
  if (streak >= W_HOT) return 3;
  if (streak >= 2) return 2;
  if (streak >= 1) return 1;
  return 0;
}

export function speedTier(speed: number): SpeedTier {
  'worklet';
  for (let i = 0; i < W_TIERS.length; i++) if (speed >= W_TIERS[i].min) return W_TIERS[i].tier;
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
  return mods.chomp ? Math.min(s, W_CHOMP_CAP) : s;
}

/** The ticker value shown at `t`: `+{100 + speed}` (before the streak multiplier). */
export function tickerValue(t: number, g: number, h: number, mods: SpeedMods = {}): number {
  'worklet';
  return W_BASE + creditedSpeed(t, g, h, mods);
}

/** Quick Draw / Final question points (before any wager stake). */
export function quickPoints(correct: boolean, t: number, g: number, h: number, streakAfter: number, mods: SpeedMods = {}): number {
  'worklet';
  if (!correct) return 0;
  return Math.round(tickerValue(t, g, h, mods) * streakMult(streakAfter));
}

/** 4.1 ride challenge points: 100 + round5(150 x speed fraction), no streak multiplier. */
export function ridePoints(correct: boolean, t: number, g: number, mods: SpeedMods = {}, h?: number): number {
  'worklet';
  if (!correct) return 0;
  if (mods.holdForfeit) return W_BASE;
  let s = speedPoints(t, g, h === undefined ? W_RIDE_WINDOW : h, W_RIDE_SPEED_MAX);
  if (mods.chomp) s = Math.min(s, W_CHOMP_CAP);
  return W_BASE + s;
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

/**
 * 5.4 buzz: correct = (150 + speed) x mult with the bell's own grace (400ms)
 * and horizon (5s) from unlock; wrong = a flat -100 (0 with a Shield).
 */
export function buzzPoints(correct: boolean, buzzT: number, streakAfter: number, shield: boolean, mods: SpeedMods = {}): number {
  if (!correct) return shield ? 0 : POINTS.buzzWrong;
  return Math.round(bellValue(buzzT, mods) * streakMult(streakAfter));
}

/** The bell's live stake before the multiplier: 150 + speed(buzz t). Worklet-safe. */
export function bellValue(buzzT: number, mods: SpeedMods = {}): number {
  'worklet';
  return W_BUZZ_BASE + creditedSpeed(buzzT, W_BELL_G, W_BELL_H, mods);
}

/** 5.4 steal: 125 + speed(t from your own tile flip, g 300, H 3s), max 225, no multiplier. */
export function stealPoints(correct: boolean, stealT: number, mods: SpeedMods = {}): number {
  if (!correct) return 0;
  return POINTS.stealBase + creditedSpeed(stealT, BUZZ.stealGraceMs, BUZZ.stealHorizonMs, mods);
}

/** Simultaneous buzzes (vs Fin, ghost, Huddle): the lower scored time wins; equal goes to side a. */
export function buzzFirst(aMs: number, bMs: number): 'a' | 'b' {
  return aMs <= bMs ? 'a' : 'b';
}

/** Relaxed scaling (C9) for one round's timing. */
export function relaxedTiming(t: { readLockMs: number; windowMs: number; graceMs: number; horizonMs: number }): { readLockMs: number; windowMs: number; graceMs: number; horizonMs: number } {
  const windowMs = t.windowMs + RELAXED.windowAddMs;
  return {
    readLockMs: Math.round(t.readLockMs * RELAXED.readLockScale),
    windowMs,
    graceMs: Math.round(t.graceMs * RELAXED.graceScale),
    horizonMs: Math.min(windowMs, Math.round(t.horizonMs * RELAXED.horizonScale)),
  };
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

/**
 * 5.5 wager stakes (rev 7): SAFE 0, HALF round5(score / 2), ALL IN = score.
 * Always a share of what you hold, so a stake can never exceed your score
 * and no stake is ever free (S0-3: the old fixed stakes under 200 are gone).
 */
export function wagerStakes(score: number): number[] {
  const s = Math.max(0, Math.floor(score));
  return WAGER.percents.map((p) => (p >= 1 ? s : Math.min(s, round5(p * s))));
}

export interface WagerSuggestion {
  index: number;
  reason: string;
}

/**
 * 5.5 suggestWager (the gold-glow chip; doing nothing takes it):
 *  1. a chip that makes you unbeatable when right (you + 100m + stake > 2 x opp + 350): the smallest one;
 *  2. else trailing: ALL IN;
 *  3. else (leading or tied): the smallest chip with you + 100m + stake > 2 x opp + 100, else SAFE.
 * `m` is the multiplier your streak would carry into a right answer.
 */
export function suggestWager(me: number, opp: number, m: number): WagerSuggestion {
  const stakes = wagerStakes(me);
  const right = (k: number) => me + Math.round(POINTS.base * m) + stakes[k];
  for (let k = 0; k < stakes.length; k++) {
    if (right(k) > 2 * opp + WAGER.lockMargin) return { index: k, reason: "Wins it if you're right." };
  }
  if (me < opp) return { index: stakes.length - 1, reason: 'You need it all.' };
  for (let k = 0; k < stakes.length; k++) {
    if (right(k) > 2 * opp + WAGER.coverMargin) return { index: k, reason: 'Covers their best bet.' };
  }
  return { index: 0, reason: 'Keeps the lead if they miss.' };
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
  /** 2.3: the Shield unlocks from a player's second match. */
  shieldOn: boolean;
}

export function createStreak(streak = 0, shield = false, shieldOn = true): StreakState {
  return { streak, best: streak, shield: shield && shieldOn, shieldOn };
}

export interface StreakEvent {
  streak: number;
  ignited: boolean;
  blazing: boolean;
  shieldGranted: boolean;
  shieldUsed: boolean;
  broke: boolean;
}

/**
 * Apply one graded answer to the streak. A wrong answer or timeout with a
 * Shield is absorbed: the streak holds and the Shield pops. `hold` (a wrong
 * buzz, 5.3) neither increments nor resets the streak; a held Shield still
 * zeroes the -100, so it pops.
 */
export function applyStreak(s: StreakState, correct: boolean, hold = false): StreakEvent {
  const ev: StreakEvent = { streak: s.streak, ignited: false, blazing: false, shieldGranted: false, shieldUsed: false, broke: false };
  if (hold) {
    if (s.shield) { s.shield = false; ev.shieldUsed = true; }
    return ev;
  }
  if (correct) {
    s.streak += 1;
    if (s.streak > s.best) s.best = s.streak;
    if (s.streak === HOT_STREAK) {
      ev.ignited = true;
      if (!s.shield && s.shieldOn) { s.shield = true; ev.shieldGranted = true; }
    }
    if (s.streak === BLAZING) ev.blazing = true;
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
