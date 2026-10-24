/**
 * gameMoments.ts: the in-game moment language every mini-game shares
 * (wow-games lane, Oct 24 2026). Pure data and worklet-safe math, no React,
 * so it is unit tested (tools/tests/game-moments.test.cjs) and runs on the UI
 * thread inside useDerivedValue.
 *
 *   - The start: 3, 2, 1 slam in at 0, 700, 1400 ms, GO bursts at 2100 (play
 *     opens on that frame), the GO tail clears at 2600.
 *   - The last 5 seconds: the clock turns gold (never red), a soft gold edge
 *     breathes once a second, each second stamps in, TIME! slams at 0.
 *   - Combo tiers: x1 white, x2 sky blue, x3 gold, x5 gold with a white-hot
 *     core and a flame ring; size, colour, sparkles, haptic and pitch all climb.
 *   - Callouts: one at a time, a newer one replaces the older, the same word
 *     at most once per 600 ms.
 *
 * Timings come from src/ui/motion.ts (DURATION, SPRING, SLAM_SQUASH, KICK).
 */

import { DURATION, GOLD_FX, KICK, SLAM_SQUASH, SPRING } from '../../ui/motion';

// ---------------------------------------------------------------------------
// Small worklet math.

export function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Ease in (accelerating into the hit), cubic. */
export function easeInCubic(p: number): number {
  'worklet';
  const q = clamp01(p);
  return q * q * q;
}

/** Ease out (soft landing), cubic. */
export function easeOutCubic(p: number): number {
  'worklet';
  const q = 1 - clamp01(p);
  return 1 - q * q * q;
}

/**
 * A damped spring sampled at `ms` (the same physics as Reanimated withSpring
 * for an underdamped config), from `from` to `to`. Used where the pose is a
 * pure function of one clock (countdown, stamps) so it can be frame-stepped.
 */
export function springAt(ms: number, cfg: { readonly damping: number; readonly stiffness: number; readonly mass: number },
  from: number, to: number): number {
  'worklet';
  if (ms <= 0) return from;
  const t = ms / 1000;
  const w0 = Math.sqrt(cfg.stiffness / cfg.mass);
  const zeta = cfg.damping / (2 * Math.sqrt(cfg.stiffness * cfg.mass));
  const x0 = from - to;
  if (zeta >= 1) {
    const e = Math.exp(-w0 * t);
    return to + e * (x0 + w0 * x0 * t);
  }
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const e = Math.exp(-zeta * w0 * t);
  return to + e * (x0 * Math.cos(wd * t) + ((zeta * w0 * x0) / wd) * Math.sin(wd * t));
}

// ---------------------------------------------------------------------------
// The start: 3-2-1-GO.

export const COUNT_STEP_MS = 700;
/** GO lands, play input opens on this frame. */
export const GO_AT_MS = 2100;
/** The GO tail (sparkles, fade) is gone. */
export const COUNT_END_MS = 2600;
/** A number starts leaving here (ms after it lands) and is gone at COUNT_STEP_MS. */
const EXIT_FROM = 560;

export type CountLabel = '3' | '2' | '1' | 'GO!';

export interface CountStep {
  readonly label: CountLabel;
  readonly at: number;
  /** Fill, outline and drop-ink colours (bubble letters). */
  readonly fill: string;
  readonly stroke: string;
  readonly ink: string;
  /** Glow ring behind the number. */
  readonly ring: string;
  /** Haptic grammar name (core/hapticGrammar HAPTIC_PATTERNS). */
  readonly haptic: 'tick' | 'tap' | 'incoming';
  /** Studio cue (wow-sound switch on) and today's SFX name (switch off). */
  readonly cue: string;
  readonly variant: string | null;
  readonly sfx: 'countdown' | 'go';
}

/** 3 brand blue, 2 white with a blue outline, 1 gold, GO gold with a white core. */
export const COUNT_STEPS: readonly CountStep[] = [
  { label: '3', at: 0, fill: '#2aa9f5', stroke: '#05346e', ink: '#05346e', ring: '#bfe5ff', haptic: 'tick', cue: 'ui_tick', variant: null, sfx: 'countdown' },
  { label: '2', at: COUNT_STEP_MS, fill: '#ffffff', stroke: '#0768b9', ink: '#05346e', ring: '#ffffff', haptic: 'tick', cue: 'ui_tick', variant: null, sfx: 'countdown' },
  { label: '1', at: COUNT_STEP_MS * 2, fill: GOLD_FX.rays, stroke: '#7a4300', ink: '#05346e', ring: GOLD_FX.raysSoft, haptic: 'tap', cue: 'ui_tick_high', variant: null, sfx: 'countdown' },
  { label: 'GO!', at: GO_AT_MS, fill: GOLD_FX.rays, stroke: '#7a4300', ink: '#05346e', ring: GOLD_FX.core, haptic: 'incoming', cue: 'sh_go_horn', variant: 'sh_whistle', sfx: 'go' },
];

/**
 * Steps for a count style: the full 3-2-1-GO or a single GO. A repeat start
 * (quick) skips the 3: 2-1-GO in 1.4 s, the same clock, the same GO.
 */
export function countSteps(style: 'full' | 'go' | 'none', quick = false): readonly CountStep[] {
  if (style === 'none') return [];
  if (style === 'go') return COUNT_STEPS.slice(3);
  return quick ? COUNT_STEPS.slice(1) : COUNT_STEPS;
}

/** The count waits for the stage to draw, but never longer than this. */
export const STAGE_READY_MAX_MS = 4000;

const countStarts: Record<string, number> = {};
/** Count one start of a game this app session; returns how many starts it has had (1 = the first). */
export function noteCountStart(gameId: string): number {
  countStarts[gameId] = (countStarts[gameId] ?? 0) + 1;
  return countStarts[gameId];
}
/** Test hook. */
export function resetCountStarts(): void {
  for (const k of Object.keys(countStarts)) delete countStarts[k];
}

/** About one start in eight throws a gold confetti GO; never the first play (that one teaches the rhythm). */
export const RARE_GO_CHANCE = 0.125;
export function isRareGo(startNo: number, rand: number): boolean {
  return startNo > 1 && rand < RARE_GO_CHANCE;
}
/** A rare GO throws more sparkles (still within PARTICLES.sparkles). */
export const RARE_GO_SPARKLES = 12;

export interface CountPose {
  /** Which step is on screen (index into COUNT_STEPS), -1 for none. */
  readonly index: number;
  readonly scale: number;
  readonly sx: number;
  readonly sy: number;
  readonly alpha: number;
  /** The ring behind the number. */
  readonly ringScale: number;
  readonly ringAlpha: number;
  /** 0..1 progress of GO's sparkle burst (0 before GO). */
  readonly sparkle: number;
  /** Screen kick (pt, downward) at GO. */
  readonly kick: number;
  /** The countdown scrim (1 until GO, then gone). */
  readonly scrim: number;
  /** A hand-drawn wobble (radians): each number swings in tilted and rocks once as it lands. */
  readonly rot: number;
}

const NONE: CountPose = { index: -1, scale: 1, sx: 1, sy: 1, alpha: 0, ringScale: 1, ringAlpha: 0, sparkle: 0, kick: 0, scrim: 0, rot: 0 };
/** How far a number tilts as it swings in (radians, about 7 degrees); 3 and 1 lean left, 2 and GO right. */
export const COUNT_TILT = 0.12;

/**
 * The whole countdown as a pure function of one clock (ms since the 3 landed).
 * Each number: enters from 1.6 and opacity 0 to 1.0 in DURATION.slam on an
 * ease-in (accelerating into the hit), lands with the SLAM_SQUASH for 50 ms,
 * a ring blooms 0.6 to 1.8 and fades over 400 ms, holds, then leaves to 0.8
 * between 560 and 700 ms. GO pops from 0 on SPRING.pop (one overshoot),
 * throws 8 sparkles and a KICK.maxPt screen kick, and exits by 2600.
 * Reduced: 160 ms fades with the same timings, no travel, no kick, no sparkles.
 */
export function countPose(t: number, reduced: boolean, calm: boolean): CountPose {
  'worklet';
  if (t < 0 || t >= COUNT_END_MS) return NONE;
  const index = t >= GO_AT_MS ? 3 : Math.floor(t / COUNT_STEP_MS);
  const local = t - (index === 3 ? GO_AT_MS : index * COUNT_STEP_MS);
  const scrim = t < GO_AT_MS ? 1 : 1 - clamp01((t - GO_AT_MS) / DURATION.quick);
  if (reduced) {
    const life = index === 3 ? COUNT_END_MS - GO_AT_MS : COUNT_STEP_MS;
    const a = Math.min(clamp01(local / DURATION.quick), clamp01((life - local) / DURATION.quick));
    return { index, scale: 1, sx: 1, sy: 1, alpha: a, ringScale: 1, ringAlpha: 0, sparkle: 0, kick: 0, scrim, rot: 0 };
  }
  const dir = index % 2 === 0 ? -1 : 1;
  if (index < 3) {
    let scale = 1;
    let alpha = 1;
    let sx = 1;
    let sy = 1;
    if (local < DURATION.slam) {
      const p = easeInCubic(local / DURATION.slam);
      scale = 1.6 - 0.6 * p;
      alpha = clamp01(local / (DURATION.slam * 0.6));
    } else if (local < DURATION.slam + 50) {
      sx = 1 + SLAM_SQUASH;
      sy = 1 - SLAM_SQUASH;
    } else if (local < DURATION.slam + 130) {
      const p = easeOutCubic((local - DURATION.slam - 50) / 80);
      sx = 1 + SLAM_SQUASH * (1 - p);
      sy = 1 - SLAM_SQUASH * (1 - p);
    } else if (local >= EXIT_FROM) {
      const p = easeInCubic((local - EXIT_FROM) / (COUNT_STEP_MS - EXIT_FROM));
      scale = 1 - 0.2 * p;
      alpha = 1 - p;
    }
    const rp = clamp01((local - DURATION.slam) / 400);
    const ringScale = 0.6 + 1.2 * easeOutCubic(rp);
    const ringAlpha = local < DURATION.slam ? 0 : 0.85 * (1 - rp);
    // Tilted on the way in, then one rock past level and back (SPRING.pop), like a hand-drawn card.
    const rot = local < DURATION.slam
      ? dir * COUNT_TILT * (1 - easeInCubic(local / DURATION.slam) * 0.6)
      : springAt(local - DURATION.slam, SPRING.pop, dir * COUNT_TILT * 0.4, 0);
    return { index, scale, sx, sy, alpha, ringScale, ringAlpha, sparkle: 0, kick: 0, scrim, rot };
  }
  // GO.
  const exitFrom = COUNT_END_MS - GO_AT_MS - 150;
  let scale = springAt(local, SPRING.pop, 0, 0.95);
  let alpha = clamp01(local / 60);
  if (local >= exitFrom) {
    const p = easeInCubic((local - exitFrom) / 150);
    scale = scale + 0.25 * p;
    alpha = 1 - p;
  }
  const sparkle = clamp01(local / 500);
  const kp = local / KICK.ms;
  const kick = calm || kp >= 1 ? 0 : KICK.maxPt * Math.sin(Math.PI * clamp01(kp)) * (1 - clamp01(kp) * 0.5);
  const rp = clamp01(local / 420);
  const rot = springAt(local, SPRING.pop, dir * COUNT_TILT, 0);
  return { index, scale, sx: 1, sy: 1, alpha, ringScale: 0.6 + 1.6 * easeOutCubic(rp), ringAlpha: 0.9 * (1 - rp), sparkle, kick, scrim, rot };
}

/** Where sparkle k of n sits at progress p of GO's burst (offset from the GO centre, pt) and its opacity. */
export function goSparkle(k: number, n: number, p: number): { x: number; y: number; alpha: number; scale: number } {
  'worklet';
  const ang = (k / n) * Math.PI * 2 - Math.PI / 2 + (k % 2 ? 0.2 : 0);
  const r = 46 + 120 * easeOutCubic(p) * (k % 2 ? 0.8 : 1);
  const fall = 26 * p * p;
  return {
    x: Math.cos(ang) * r,
    y: Math.sin(ang) * r + fall,
    alpha: p <= 0 ? 0 : p < 0.15 ? p / 0.15 : 1 - clamp01((p - 0.45) / 0.55),
    scale: 0.6 + 0.6 * (1 - p),
  };
}

/**
 * Confetti piece k of n on a rare GO at progress p (0..1 over the GO tail): it
 * pops up and out from the GO, gravity pulls it down, it spins and fades.
 * Gold, white and brand blue only.
 */
export function goConfetti(k: number, n: number, p: number): { x: number; y: number; alpha: number; rot: number; color: number } {
  'worklet';
  const ang = -Math.PI / 2 + ((k / Math.max(1, n)) - 0.5) * Math.PI * 1.5;
  const speed = 210 + ((k * 37) % 7) * 18;
  const q = clamp01(p);
  const x = Math.cos(ang) * speed * q * 0.9;
  const y = Math.sin(ang) * speed * q + 300 * q * q;
  return {
    x,
    y,
    alpha: q <= 0 ? 0 : q < 0.1 ? q / 0.1 : 1 - clamp01((q - 0.55) / 0.45),
    rot: (k % 2 ? 1 : -1) * q * 9 + k,
    color: k % 3,
  };
}
export const CONFETTI_COLORS = [GOLD_FX.rays, '#ffffff', '#2aa9f5'] as const;
/** Confetti cap per burst (motion PARTICLES.confetti). */
export const PARTICLE_MAX_CONFETTI = 28;

/** Sparkles on GO before the power budget (momentParticles scales them again). */
export const GO_SPARKLES = 8;

// ---------------------------------------------------------------------------
// The last 5 seconds.

export const FINAL_SECONDS = 5;

export interface FinalSecondsBeat {
  /** Seconds left being shown (5..1), 0 for TIME!, null outside the window. */
  readonly second: number | null;
  /** Edge vignette peak (gold) for this second. */
  readonly vignette: number;
  readonly haptic: 'tick' | 'finisher' | null;
  readonly cue: string | null;
  readonly variant: string | null;
  readonly sfx: string | null;
}

/** What the shell plays when the seconds-left counter changes. */
export function finalSecondsBeat(secondsLeft: number | null | undefined): FinalSecondsBeat {
  if (secondsLeft == null || !Number.isFinite(secondsLeft) || secondsLeft > FINAL_SECONDS || secondsLeft < 0) {
    return { second: null, vignette: 0, haptic: null, cue: null, variant: null, sfx: null };
  }
  const s = Math.floor(secondsLeft);
  if (s === 0) return { second: 0, vignette: 0, haptic: 'finisher', cue: 'sh_whistle', variant: null, sfx: 'go' };
  return { second: s, vignette: 0.12, haptic: 'tick', cue: 'mm_clock_tick', variant: 'tv_heartbeat_soft', sfx: 'countdown' };
}

/** The timer pill pulse inside a second (ms since the second turned): 1 to 1.15 and back with one soft overshoot. */
export function timerPulse(msIntoSecond: number): number {
  'worklet';
  if (msIntoSecond < 0) return 1;
  if (msIntoSecond < 90) return 1 + 0.15 * easeOutCubic(msIntoSecond / 90);
  return springAt(msIntoSecond - 90, SPRING.stamp, 1.15, 1);
}

/** The gold edge breathing at 1 Hz in the last 5 s (0..peak). */
export function finalVignette(msIntoSecond: number, peak: number): number {
  'worklet';
  const p = clamp01(msIntoSecond / 1000);
  return peak * Math.sin(Math.PI * p);
}

export interface FinalStampPose {
  readonly scale: number;
  readonly sx: number;
  readonly sy: number;
  readonly rot: number;
  readonly alpha: number;
  /** The gold ring left on the clock (1 full at the start of the second, 0 closed). */
  readonly ring: number;
}

/**
 * The last-5 stamp at `t` ms into its second: it slams from 1.6 in
 * DURATION.slam on an ease-in, squashes SLAM_SQUASH for 50 ms, rocks once
 * (SPRING.pop), then holds. 5 to 2 dim a little at the end of their second
 * (the next one replaces them); the 1 stays at full strength until TIME!.
 * TIME! slams from 1.8 and holds 1.1 s, then fades.
 */
export function finalStampPose(t: number, isTime: boolean, isLast: boolean, reduced: boolean): FinalStampPose {
  'worklet';
  if (t < 0) return { scale: 1, sx: 1, sy: 1, rot: 0, alpha: 0, ring: 0 };
  const ring = 1 - clamp01(t / 1000);
  if (reduced) {
    const a = isTime ? (t > 1100 ? 1 - clamp01((t - 1100) / 300) : 1) : isLast ? 1 : t < 800 ? 0.95 : 0.95 * (1 - clamp01((t - 800) / 160) * 0.5);
    return { scale: 1, sx: 1, sy: 1, rot: 0, alpha: a, ring };
  }
  const from = isTime ? 1.8 : 1.6;
  const dir = isTime ? -1 : 1;
  let scale = 1;
  let sx = 1;
  let sy = 1;
  let rot = 0;
  if (t < DURATION.slam) {
    const p = easeInCubic(t / DURATION.slam);
    scale = from - (from - 1) * p;
    rot = dir * COUNT_TILT * (1 - p * 0.6);
  } else {
    if (t < DURATION.slam + 50) { sx = 1 + SLAM_SQUASH; sy = 1 - SLAM_SQUASH; } else if (t < DURATION.slam + 130) {
      const q = easeOutCubic((t - DURATION.slam - 50) / 80);
      sx = 1 + SLAM_SQUASH * (1 - q);
      sy = 1 - SLAM_SQUASH * (1 - q);
    }
    rot = springAt(t - DURATION.slam, SPRING.pop, dir * COUNT_TILT * 0.4, 0);
  }
  const enter = clamp01(t / (DURATION.slam * 0.6));
  let alpha = enter;
  if (isTime) alpha = t > 1100 ? 1 - clamp01((t - 1100) / 300) : enter;
  else if (!isLast) alpha = enter * (1 - 0.35 * clamp01((t - 760) / 240));
  return { scale, sx, sy, rot, alpha, ring };
}

/** Final-seconds colour: white turns gold (never red). */
export const FINAL_COLOR = { calm: '#ffffff', hot: GOLD_FX.rays, edge: GOLD_FX.glow } as const;

// ---------------------------------------------------------------------------
// Combo tiers.

export interface ComboTierStyle {
  /** Badge size relative to x1. */
  readonly size: number;
  readonly fill: string;
  readonly text: string;
  /** White-hot core (x5). */
  readonly core: boolean;
  /** Flickering flame ring (x5, ambient budget). */
  readonly flame: boolean;
  readonly sparkles: number;
  readonly haptic: 'tap' | 'goodHit' | 'crit' | 'feverStart';
  /** Semitones up for the tier cue (pitch climbs with the tier). */
  readonly pitch: number;
}

const TIER_STYLES: readonly ComboTierStyle[] = [
  { size: 1, fill: '#ffffff', text: '#05346e', core: false, flame: false, sparkles: 0, haptic: 'tap', pitch: 0 },
  { size: 1.12, fill: '#2aa9f5', text: '#ffffff', core: false, flame: false, sparkles: 8, haptic: 'goodHit', pitch: 2 },
  { size: 1.25, fill: GOLD_FX.rays, text: '#5a3200', core: false, flame: false, sparkles: 10, haptic: 'crit', pitch: 4 },
  { size: 1.4, fill: GOLD_FX.rays, text: '#5a3200', core: true, flame: true, sparkles: 12, haptic: 'feverStart', pitch: 7 },
];

/**
 * The look of a combo multiplier: x1 white, x2 sky blue, x3 gold, x5 and up
 * gold with a white-hot core and a flame ring. In between values take the
 * tier below (x1.5 looks like x1, x2.5 like x2, x4 like x3).
 */
export function comboTierStyle(multiplier: number): ComboTierStyle {
  'worklet';
  if (multiplier >= 5) return TIER_STYLES[3];
  if (multiplier >= 3) return TIER_STYLES[2];
  if (multiplier >= 2) return TIER_STYLES[1];
  return TIER_STYLES[0];
}

/** Tier rank 0..3 for a multiplier (used to fire tier-up only when the look changes). */
export function comboTierRank(multiplier: number): number {
  'worklet';
  return multiplier >= 5 ? 3 : multiplier >= 3 ? 2 : multiplier >= 2 ? 1 : 0;
}

/** The stamp a badge lands with: from 1.8 to its tier size. */
export const TIER_STAMP_FROM = 1.8;

// ---------------------------------------------------------------------------
// Callouts: one at a time.

export interface CalloutGate {
  /** The word on screen and when it went up. */
  word: string | null;
  at: number;
  /** Last time each word was shown. */
  last: Record<string, number>;
}

export const CALLOUT_SAME_WORD_MS = 600;
export const CALLOUT_LIFE_MS = 900;

export function createCalloutGate(): CalloutGate {
  return { word: null, at: -1e9, last: {} };
}

/**
 * May this callout go up now? The same word waits CALLOUT_SAME_WORD_MS; a
 * different word replaces whatever is up (the caller clears the old one).
 */
export function calloutAdmit(g: CalloutGate, word: string, now: number): boolean {
  const last = g.last[word] ?? -1e9;
  if (now - last < CALLOUT_SAME_WORD_MS) return false;
  g.last[word] = now;
  g.word = word;
  g.at = now;
  return true;
}

/** Keep a callout of width `w` centred near x inside [pad, width - pad]. */
export function clampCalloutX(x: number, w: number, width: number, pad = 10): number {
  const half = w / 2;
  if (width <= w + pad * 2) return width / 2;
  return Math.max(pad + half, Math.min(width - pad - half, x));
}
