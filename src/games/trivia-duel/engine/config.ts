/**
 * Trivia Duel tunables (design doc studio/design/trivia.md, rev 7).
 *
 * Every number the doc names lives here so balance passes never touch logic.
 * Pure data: safe on the UI thread, in node tests and as the source for the
 * PHP port's shared JSON vectors.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';
export type DuelMode = 'ride' | 'queue' | 'ghost' | 'daily' | 'practice';
export type RoundType = 'quick' | 'buzz' | 'final';
export type QuestionFormat = 'choice4' | 'truetale' | 'closest' | 'opened' | 'pair';
export type FinRank = 'deckhand' | 'firstmate' | 'captain' | 'admiral';
export type SpeedTier = 'lightning' | 'great' | 'nice' | 'none';

/** 5.2 grace: clamp(300 + 12 x choice characters, 400, 1100); slider fixed. */
export const GRACE = { base: 300, perChar: 12, min: 400, max: 1100, slider: 800 } as const;

/**
 * 4.1 / 4.2 read-lock (full question visible, tiles face-down), plus seeded
 * jitter. Rev 7 (G10): the ride uses the queue clamp, 600-1500ms.
 */
export const READ_LOCK = {
  ride: { base: 300, perChar: 12, min: 600, max: 1500 },
  queue: { base: 300, perChar: 12, min: 600, max: 1500 },
  jitterMax: 250,
  /** A HOLD during the read-lock restarts it with this much left. */
  holdRestartMs: 600,
} as const;

/** Taps inside this long after unlock are ignored ("not yet" wiggle). */
export const UNLOCK_GUARD_MS = 120;

/** 5.2 streak multipliers (streak after this answer). */
export const STREAK_MULT: readonly [number, number][] = [
  [5, 1.75],
  [3, 1.5],
  [2, 1.2],
  [0, 1],
];
export const HOT_STREAK = 3;
export const BLAZING = 5;

export const POINTS = {
  base: 100,
  speedMax: 100,
  chompSpeedCap: 50,
  buzzBase: 150,
  /** 5.4: a wrong buzz costs a flat 100 (0 with a Shield); the streak holds. */
  buzzWrong: -100,
  stealBase: 125,
  openPhaseFlat: 50,
  /** Ride challenge: correct = 100 + round5(150 x speed fraction), no streak. */
  rideSpeedMax: 150,
  rideWindowMs: 8000,
} as const;

/** 5.2 speed tiers. */
export const TIERS: readonly { tier: SpeedTier; min: number }[] = [
  { tier: 'lightning', min: 95 },
  { tier: 'great', min: 70 },
  { tier: 'nice', min: 35 },
  { tier: 'none', min: 0 },
];

/**
 * 5.4 Buzz Bell (rev 7). Tiles stay face-down for everyone after the
 * read-lock; buzzing flips them for the buzzer only. The bell's speed runs on
 * its own grace and horizon from unlock. The other side's tiles flip 1.0s
 * after a buzz as the steal pick. Nobody by 6s: tiles open for 4s, flat 50.
 */
export const BUZZ = {
  buzzWindowMs: 6000,
  answerMs: 3500,
  graceMs: 400,
  horizonMs: 5000,
  stealFlipMs: 1000,
  stealGraceMs: 300,
  stealHorizonMs: 3000,
  openPhaseMs: 4000,
  hitStopMs: 60,
} as const;

/** 7.2: share of bell rounds Fin buzzes on, by rank. */
export const FIN_BUZZ_SHARE: Record<FinRank, number> = { deckhand: 0.5, firstmate: 0.6, captain: 0.7, admiral: 0.8 };

/**
 * 5.5 wager (rev 7): three chips, always a share of what you hold. A stake
 * never exceeds your score, so no stake is ever free.
 */
export const WAGER = {
  percents: [0, 0.5, 1] as const,
  labels: ['SAFE', 'HALF', 'ALL IN'] as const,
  pickMs: 4000,
  /** suggestWager thresholds: "unbeatable when right" and "covers their best bet". */
  lockMargin: 350,
  coverMargin: 100,
} as const;

/** 5.5 Final answers: press and hold this long to lock (Millionaire). */
export const FINAL_HOLD_MS = 300;

/**
 * C9 Relaxed mode: the same speed points at a calmer pace. Read-lock x1.5,
 * windows +4s, grace and horizon x1.5. Never changes grading or the question band.
 */
export const RELAXED = { readLockScale: 1.5, windowAddMs: 4000, graceScale: 1.5, horizonScale: 1.5 } as const;

/** 5.5 Final category pick: 2 cards, 2.5s, default left (vs Fin, Huddle and live only). */
export const CATEGORY_PICK = { cards: 2, pickMs: 2500 } as const;

/** 15.2 HOLD credit per question in graded modes. */
export const HOLD = { creditMs: 6000 } as const;

/** 7.2 tier priors before 30 answers: p_correct and t10/t30/t50/t70 (ms). */
export const FIN_PRIORS: Record<Difficulty, { p: number; t: readonly [number, number, number, number] }> = {
  easy: { p: 0.8, t: [1300, 2000, 2800, 3800] },
  medium: { p: 0.6, t: [1700, 2600, 3600, 4800] },
  hard: { p: 0.4, t: [2300, 3400, 4600, 6000] },
};

/** 7.2 ranks: accuracy offset and the lock-time quantile he plays at. */
export const FIN_RANKS: Record<FinRank, { acc: number; accCap: number; quantile: 0 | 1 | 2 | 3; promoteAfter: number; stripes: number; label: string }> = {
  deckhand: { acc: -0.1, accCap: 0.96, quantile: 3, promoteAfter: 2, stripes: 0, label: 'Deckhand Fin' },
  firstmate: { acc: 0, accCap: 0.96, quantile: 2, promoteAfter: 3, stripes: 1, label: 'First Mate Fin' },
  captain: { acc: 0.08, accCap: 0.96, quantile: 1, promoteAfter: 4, stripes: 2, label: 'Captain Fin' },
  admiral: { acc: 0.15, accCap: 0.96, quantile: 0, promoteAfter: Infinity, stripes: 3, label: 'Admiral Fin' },
};
export const FIN_RANK_ORDER: readonly FinRank[] = ['deckhand', 'firstmate', 'captain', 'admiral'];
export const FIN_LOCK_SIGMA = 0.25;
export const FIN_WRONG_SLOWDOWN = 1.15;
export const FIN_BUZZ_FACTOR = 0.9;
export const FIN_DEMOTE_AFTER_LOSSES = 3;
/** Fin resolves this long after your lock when you beat him to it (B1). */
export const FIN_RESOLVE_AFTER_MS = 350;

export interface RoundSpec {
  type: RoundType;
  formats: readonly QuestionFormat[];
  difficulty: Difficulty;
  /** Answer window (ms) per format; the first entry is the default. */
  windowMs: number;
  sliderWindowMs?: number;
  horizonMs: number;
  sliderHorizonMs?: number;
}

/** 4.2 queue round table. */
export const QUEUE_ROUNDS: Record<'q1' | 'q2' | 'buzz' | 'q4' | 'final', RoundSpec> = {
  q1: { type: 'quick', formats: ['choice4', 'truetale'], difficulty: 'easy', windowMs: 10000, horizonMs: 6000 },
  q2: { type: 'quick', formats: ['pair', 'closest'], difficulty: 'medium', windowMs: 8000, sliderWindowMs: 14000, horizonMs: 4000, sliderHorizonMs: 7000 },
  buzz: { type: 'buzz', formats: ['choice4'], difficulty: 'medium', windowMs: BUZZ.buzzWindowMs, horizonMs: BUZZ.horizonMs },
  q4: { type: 'quick', formats: ['choice4', 'opened'], difficulty: 'medium', windowMs: 12000, horizonMs: 7000 },
  final: { type: 'final', formats: ['choice4'], difficulty: 'hard', windowMs: 10000, horizonMs: 7000 },
};
export type QueueRoundKey = keyof typeof QUEUE_ROUNDS;
/** Templates rotate per match (match 3 and later): B never first, F always last. */
export const TEMPLATES: readonly (readonly QueueRoundKey[])[] = [
  ['q1', 'q2', 'buzz', 'q4', 'final'],
  ['q1', 'buzz', 'q2', 'q4', 'final'],
];
/**
 * 2.3 feature unlocks by lifetime queue match (1-based): match 1 is QQQQ with
 * no lifelines; match 2 is QQBQ and brings Chomp, the bell, steals and the
 * Shield; match 3 adds Fin's Final.
 */
export const UNLOCK_TEMPLATES: Record<1 | 2, readonly QueueRoundKey[]> = {
  1: ['q1', 'q2', 'q4', 'q4'],
  2: ['q1', 'q2', 'buzz', 'q4'],
};
export const UNLOCKS = { chompFromMatch: 2, bellFromMatch: 2, shieldFromMatch: 2, finalFromMatch: 3 } as const;
export const SUDDEN_DEATH: RoundSpec = { type: 'quick', formats: ['choice4'], difficulty: 'medium', windowMs: 10000, horizonMs: 5000 };

/** 4.1 ride challenge: 3 questions at the gate, 8s window. */
export const RIDE_ROUND: RoundSpec = { type: 'quick', formats: ['choice4', 'truetale'], difficulty: 'easy', windowMs: 8000, horizonMs: 8000 };
export const RIDE_QUESTIONS = 3;
export const RIDE_WIN_CORRECT = 2;
export const RIDE_STARS = { two: 420, three: 600 } as const;

/** 4.4 daily quiz ladder. */
export const DAILY_LADDER: readonly Difficulty[] = ['easy', 'easy', 'medium', 'medium', 'hard'];

/** Content limits (3). */
export const TEXT_LIMITS = { queue: 90, ride: 110, truetale: 60 } as const;

/** 11.1 beat clock (measured): duel_loop, and duel_loop_final = +1 semitone at tape speed. */
export const BEAT = { duelBpm: 135.999, finalBpm: 144.08 } as const;

/** Ceremony timings (11.3 / 11.4). */
export const CEREMONY = {
  vsFirstMs: 1400,
  vsShortMs: 600,
  vsCompressAfterPlays: 3,
  cardDropMs: 300,
  ribbonHoldFirstMs: 500,
  unlockFlipMs: 200,
  unlockStaggerMs: 30,
  snapRevealMs: 450,
  tensionHitStopMs: 70,
  coinArriveStepMs: 110,
  nextQuestionMs: 900,
  finalInterstitialMs: 1200,
  categoryCardMs: 1200,
} as const;

export const CLOSEST_TOL = { year: 8 } as const;
