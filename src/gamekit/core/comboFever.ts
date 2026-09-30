/**
 * comboFever.ts: configurable combo + fever framework (pure, worklet-safe).
 *
 * One mutable state struct and three calls: comboHit, comboMiss, comboTick.
 * Each returns an event bitmask (no allocation) that the game turns into
 * feel: tier-up slams, fever entry, combo-break shakes, milestone ribbons.
 *
 * Supports every studio design:
 *   - streak tiers with multipliers and brand colours (no purple)
 *   - windowMs (Infinity for Whack: only misses break the combo)
 *   - fever by streak threshold OR by a charge meter that drains
 *   - fever duration, extend-on-hit, and a "last second" warning edge
 *   - milestones (every N) for crowd waves, ribbons, claps
 *   - grace misses (walk-safe: one bumped tap need not break a big combo)
 */

export interface ComboTier {
  /** Streak needed. */
  at: number;
  mult: number;
  /** Colour for the badge (brand: blue, teal, gold, coral). */
  color: string;
  label: string;
}

export interface FeverConfig {
  /** 'streak': fever starts at `at` streak. 'meter': meter fills to 1. */
  mode: 'streak' | 'meter' | 'off';
  at: number;
  /** Meter charge per hit (weight-scaled) when mode = 'meter'. */
  chargePerHit: number;
  /** Meter drain per second while not in fever. */
  drainPerSec: number;
  durationMs: number;
  /** Extra ms added per hit during fever (capped at durationMs remaining). */
  extendPerHitMs: number;
  /** Multiplier applied on top of the tier multiplier during fever. */
  mult: number;
  /** Warn this many ms before fever ends. */
  warnMs: number;
}

export interface ComboFeverConfig {
  windowMs: number;
  tiers: ComboTier[];
  fever: FeverConfig;
  /** Misses forgiven per streak before it breaks (walk-safe bumps). */
  graceMisses: number;
  /** Fire EV_MILESTONE every N streak (0 = never). */
  milestoneEvery: number;
  /** A miss ends fever immediately. */
  missEndsFever: boolean;
}

/** Brand tier colours. Purple is gone (bright world rule). */
export const TIER_COLORS = {
  blue: '#00a5f5',
  teal: '#1fc8b8',
  gold: '#fec90e',
  coral: '#ff6b5c',
} as const;

export const DEFAULT_COMBO_FEVER: ComboFeverConfig = {
  windowMs: 1600,
  tiers: [
    { at: 0, mult: 1, color: TIER_COLORS.blue, label: '' },
    { at: 3, mult: 2, color: TIER_COLORS.blue, label: 'NICE' },
    { at: 6, mult: 3, color: TIER_COLORS.teal, label: 'GREAT' },
    { at: 10, mult: 5, color: TIER_COLORS.gold, label: 'AMAZING' },
    { at: 20, mult: 8, color: TIER_COLORS.coral, label: 'UNSTOPPABLE' },
  ],
  fever: {
    mode: 'streak',
    at: 10,
    chargePerHit: 0.1,
    drainPerSec: 0.05,
    durationMs: 6000,
    extendPerHitMs: 0,
    mult: 1,
    warnMs: 1000,
  },
  graceMisses: 0,
  milestoneEvery: 25,
  missEndsFever: false,
};

export const EV_HIT = 1;
export const EV_TIER_UP = 2;
export const EV_FEVER_START = 4;
export const EV_FEVER_END = 8;
export const EV_BREAK = 16;
export const EV_TIMEOUT = 32;
export const EV_MILESTONE = 64;
export const EV_FEVER_WARN = 128;
export const EV_GRACE = 256;

export interface ComboFeverState {
  cfg: ComboFeverConfig;
  streak: number;
  maxStreak: number;
  tier: number;
  mult: number;
  lastHitAt: number;
  graceLeft: number;
  meter: number;
  fever: boolean;
  feverUntil: number;
  feverCount: number;
  warned: boolean;
  /** Streak value when it last broke (for "combo lost x23" text). */
  lastBreak: number;
  hits: number;
  misses: number;
}

export function createComboFever(cfg: ComboFeverConfig = DEFAULT_COMBO_FEVER): ComboFeverState {
  'worklet';
  return {
    cfg,
    streak: 0,
    maxStreak: 0,
    tier: 0,
    mult: cfg.tiers.length ? cfg.tiers[0].mult : 1,
    lastHitAt: 0,
    graceLeft: cfg.graceMisses,
    meter: 0,
    fever: false,
    feverUntil: 0,
    feverCount: 0,
    warned: false,
    lastBreak: 0,
    hits: 0,
    misses: 0,
  };
}

export function tierFor(cfg: ComboFeverConfig, streak: number): number {
  'worklet';
  let t = 0;
  for (let i = 0; i < cfg.tiers.length; i++) if (streak >= cfg.tiers[i].at) t = i;
  return t;
}

/** Total multiplier now (tier x fever). */
export function comboMultiplier(s: ComboFeverState): number {
  'worklet';
  return s.mult * (s.fever ? s.cfg.fever.mult : 1);
}

function startFever(s: ComboFeverState, now: number): number {
  'worklet';
  s.fever = true;
  s.feverUntil = now + s.cfg.fever.durationMs;
  s.feverCount += 1;
  s.warned = false;
  s.meter = 1;
  return EV_FEVER_START;
}

function breakStreak(s: ComboFeverState): number {
  'worklet';
  const had = s.streak;
  s.lastBreak = had;
  s.streak = 0;
  s.tier = 0;
  s.mult = s.cfg.tiers.length ? s.cfg.tiers[0].mult : 1;
  s.graceLeft = s.cfg.graceMisses;
  return had > 0 ? EV_BREAK : 0;
}

/** Register a hit. `weight` scales meter charge (QUICK hits charge more). */
export function comboHit(s: ComboFeverState, now: number, weight = 1): number {
  'worklet';
  let ev = EV_HIT;
  ev |= comboTick(s, now);
  s.hits += 1;
  s.streak += 1;
  s.lastHitAt = now;
  if (s.streak > s.maxStreak) s.maxStreak = s.streak;
  const t = tierFor(s.cfg, s.streak);
  if (t > s.tier) ev |= EV_TIER_UP;
  s.tier = t;
  s.mult = s.cfg.tiers.length ? s.cfg.tiers[t].mult : 1;
  if (s.cfg.milestoneEvery > 0 && s.streak % s.cfg.milestoneEvery === 0) ev |= EV_MILESTONE;
  const f = s.cfg.fever;
  if (s.fever) {
    if (f.extendPerHitMs > 0) {
      const cap = now + f.durationMs;
      s.feverUntil = Math.min(cap, s.feverUntil + f.extendPerHitMs);
    }
  } else if (f.mode === 'streak') {
    if (s.streak >= f.at && (s.streak - f.at) % Math.max(1, f.at) === 0) ev |= startFever(s, now);
  } else if (f.mode === 'meter') {
    s.meter = Math.min(1, s.meter + f.chargePerHit * weight);
    if (s.meter >= 1) ev |= startFever(s, now);
  }
  return ev;
}

/** Register a miss. Grace misses soften it; otherwise the streak breaks. */
export function comboMiss(s: ComboFeverState, now: number): number {
  'worklet';
  let ev = comboTick(s, now);
  s.misses += 1;
  if (s.graceLeft > 0 && s.streak > 0) {
    s.graceLeft -= 1;
    return ev | EV_GRACE;
  }
  ev |= breakStreak(s);
  if (s.fever && s.cfg.missEndsFever) {
    s.fever = false;
    s.feverUntil = 0;
    s.meter = 0;
    ev |= EV_FEVER_END;
  }
  return ev;
}

/** Advance time: window timeouts, fever end/warn and meter drain. */
export function comboTick(s: ComboFeverState, now: number, dtMs = 0): number {
  'worklet';
  let ev = 0;
  if (s.streak > 0 && s.cfg.windowMs !== Infinity && now - s.lastHitAt > s.cfg.windowMs) {
    ev |= breakStreak(s) ? EV_TIMEOUT | EV_BREAK : 0;
  }
  if (s.fever) {
    const left = s.feverUntil - now;
    if (left <= 0) {
      s.fever = false;
      s.meter = 0;
      ev |= EV_FEVER_END;
    } else if (!s.warned && left <= s.cfg.fever.warnMs) {
      s.warned = true;
      ev |= EV_FEVER_WARN;
    } else if (s.cfg.fever.mode === 'meter') {
      s.meter = left / s.cfg.fever.durationMs;
    }
  } else if (s.cfg.fever.mode === 'meter' && dtMs > 0 && s.meter > 0) {
    s.meter = Math.max(0, s.meter - (s.cfg.fever.drainPerSec * dtMs) / 1000);
  }
  return ev;
}

/** Fever progress 0..1 remaining (for the meter / shimmer). */
export function feverRemaining(s: ComboFeverState, now: number): number {
  'worklet';
  if (!s.fever) return 0;
  const left = s.feverUntil - now;
  return left <= 0 ? 0 : Math.min(1, left / s.cfg.fever.durationMs);
}

/** Shift time-based fields after a pause/restore so nothing expires unfairly. */
export function comboShiftTime(s: ComboFeverState, deltaMs: number): void {
  'worklet';
  s.lastHitAt += deltaMs;
  if (s.fever) s.feverUntil += deltaMs;
}

export function hasEv(mask: number, ev: number): boolean {
  'worklet';
  return (mask & ev) !== 0;
}
