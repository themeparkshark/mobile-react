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
/** The GO tail (held beat, burst, sparkles, fade) is gone. */
export const COUNT_END_MS = 2700;
/** GO lands at full size this long after GO_AT_MS (ease-out pop), then holds one beat. */
export const GO_LAND_MS = 110;
/** The held beat at full size (the hit-stop of the start), then the burst. */
export const GO_HOLD_MS = 140;
/** GO's peak scale (the money frame), inside the prize overshoot range 1.18 to 1.35. */
export const GO_PEAK = 1.3;
/** GO starts leaving here (ms after GO_AT_MS); the exit is faster than the entrance read. */
const GO_EXIT_FROM = 480;
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
  /** GO's gold ray fan behind it (GoldBurst amount, 0..1). */
  readonly gold: number;
  /** The swell on GO's burst frame (GoldBurst bloom, 0 to 1 to 0). */
  readonly bloom: number;
  /** The white flash on GO's held beat (0..1, scaled by flashPeak by the drawer). */
  readonly flash: number;
}

const NONE: CountPose = { index: -1, scale: 1, sx: 1, sy: 1, alpha: 0, ringScale: 1, ringAlpha: 0, sparkle: 0, kick: 0, scrim: 0, rot: 0, gold: 0, bloom: 0, flash: 0 };
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
    return { index, scale: 1, sx: 1, sy: 1, alpha: a, ringScale: 1, ringAlpha: 0, sparkle: 0, kick: 0, scrim, rot: 0, gold: 0, bloom: 0, flash: 0 };
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
    return { index, scale, sx, sy, alpha, ringScale, ringAlpha, sparkle: 0, kick: 0, scrim, rot, gold: 0, bloom: 0, flash: 0 };
  }
  // GO, the money frame, in four beats:
  //   1 pop: 0.5 to GO_PEAK (1.3) in GO_LAND_MS on an ease-out, the gold fan gathering behind it;
  //   2 held beat: GO_HOLD_MS at full size with the landing squash, the flash and the screen kick;
  //   3 burst: the fan blooms, sparkles fly out toward the play field, GO springs to 1.0 (SPRING.pop);
  //   4 exit: up and out in 120 ms (faster than the entrance read), gone by COUNT_END_MS.
  const holdEnd = GO_LAND_MS + GO_HOLD_MS;
  let scale: number;
  let sx = 1;
  let sy = 1;
  if (local < GO_LAND_MS) scale = 0.5 + (GO_PEAK - 0.5) * easeOutCubic(local / GO_LAND_MS);
  else if (local < holdEnd) {
    scale = GO_PEAK;
    const q = local - GO_LAND_MS;
    const k = q < 50 ? 1 : 1 - easeOutCubic((q - 50) / 80);
    sx = 1 + SLAM_SQUASH * k;
    sy = 1 - SLAM_SQUASH * k;
  } else scale = springAt(local - holdEnd, SPRING.pop, GO_PEAK, 1);
  let alpha = clamp01(local / 50);
  let gold = local < GO_LAND_MS ? 0.3 * (local / GO_LAND_MS) : local < holdEnd ? 0.3 + 0.7 * easeOutCubic((local - GO_LAND_MS) / GO_HOLD_MS) : 1;
  if (local >= GO_EXIT_FROM) {
    const p = easeInCubic((local - GO_EXIT_FROM) / (COUNT_END_MS - GO_AT_MS - GO_EXIT_FROM));
    scale = scale + 0.2 * p;
    alpha = 1 - p;
    gold = gold * (1 - p);
  }
  const bp = (local - holdEnd) / 260;
  const bloom = bp <= 0 || bp >= 1 ? 0 : Math.sin(Math.PI * bp);
  const fp = (local - GO_LAND_MS) / GO_HOLD_MS;
  const flash = fp < 0 || fp >= 1 ? 0 : 1 - easeOutCubic(fp);
  const sparkle = clamp01((local - holdEnd) / (COUNT_END_MS - GO_AT_MS - holdEnd));
  const kp = (local - GO_LAND_MS) / KICK.ms;
  const kick = calm || kp < 0 || kp >= 1 ? 0 : KICK.maxPt * Math.sin(Math.PI * clamp01(kp)) * (1 - clamp01(kp) * 0.5);
  const rp = clamp01((local - GO_LAND_MS) / 420);
  const rot = springAt(local, SPRING.pop, dir * COUNT_TILT, 0);
  return { index, scale, sx, sy, alpha, ringScale: 0.6 + 1.6 * easeOutCubic(rp), ringAlpha: local < GO_LAND_MS ? 0 : 0.9 * (1 - rp), sparkle, kick, scrim, rot, gold, bloom, flash };
}

/** Where sparkle k of n sits at progress p of GO's burst (offset from the GO centre, pt) and its opacity. */
export function goSparkle(k: number, n: number, p: number): { x: number; y: number; alpha: number; scale: number } {
  'worklet';
  // A wide fan opening downward, toward the play field (234 degrees centred on straight down).
  const ang = Math.PI / 2 + ((n > 1 ? k / (n - 1) : 0.5) - 0.5) * Math.PI * 1.3 + (k % 2 ? 0.12 : 0);
  const r = 56 + 190 * easeOutCubic(p) * (k % 2 ? 0.78 : 1);
  const fall = 40 * p * p;
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

// ---------------------------------------------------------------------------
// The finish beat (FINISH!, TIME!): the climax of the last-5 drumroll.

/**
 * The whole finish beat (wow-games r4: payoff, then hand off; no dead hold). The label lands at
 * DURATION.slam, holds until FINISH_HANDOFF_MS while the rings and the gold fan roll out, and leaves
 * on DURATION.exit while the next card rises out of the rings (one clock, a cross-fade, no gap).
 */
export const FINISH_HANDOFF_MS = 560;
/**
 * r6: the repeat version (the middle Bursts of a Run, the ones that end on the short ripple): the same slam,
 * rings and fan, held about 60 percent as long, so the tenth run is never slower than the first.
 */
export const FINISH_HANDOFF_SHORT_MS = 340;
/**
 * r5: one shared exit. The label, the ray fan, the rings and the sparkles all leave together on this one
 * ease-out (never rays alone after the label: the r4 ghost beat). Exits stay faster than entrances.
 */
export const FINISH_EXIT_MS = DURATION.slam;
export const FINISH_BEAT_MS = FINISH_HANDOFF_MS + FINISH_EXIT_MS + 40;
/** Coin sparkles per finish burst (motion PARTICLES.sparkles cap). */
export const FINISH_SPARKLES_MAX = 12;
/** The FINISH! ray fan is this share of GO's (GO is the start's money frame; the end is a close second). */
export const FINISH_FAN_OF_GO = 0.8;

export interface FinishPose extends FinalStampPose {
  /** Gold shockwave ring (pt) and its opacity. */
  readonly ringR: number;
  readonly ringA: number;
  /** A thin white ring just behind it. */
  readonly ring2R: number;
  readonly ring2A: number;
  /** Landing flash 0..1 (scaled by flashPeak). */
  readonly flash: number;
  /** The gold ray fan behind the label (GoldBurst amount) and its landing swell. */
  readonly gold: number;
  readonly bloom: number;
}

/**
 * The finish beat at `t` ms: the label slams from 1.8 (finalStampPose TIME!),
 * lands at DURATION.slam with the squash; on that frame the gold ring rolls
 * out 40 to 210 pt over 380 ms and fades, a white ring follows 60 ms later,
 * the flash peaks then fades over 160 ms and the gold fan opens behind it.
 * At FINISH_HANDOFF_MS the label and fan leave on DURATION.exit (exits faster than entrances).
 * Reduced: the label fades, no rings, no flash, no fan.
 */
export function finishPose(t: number, reduced: boolean, handoff: number = FINISH_HANDOFF_MS): FinishPose {
  'worklet';
  const base = finalStampPose(t, true, false, reduced);
  // One shared fade for every piece (easeOut: quick to start leaving, soft at the end).
  const out = t <= handoff ? 1 : 1 - easeOutCubic(clamp01((t - handoff) / FINISH_EXIT_MS));
  const alpha = t < 0 || t >= handoff + FINISH_EXIT_MS ? 0
    : reduced ? (t < DURATION.quick ? clamp01(t / DURATION.quick) : 1) * out : base.alpha * out;
  if (t < 0 || reduced || alpha <= 0) return { ...base, alpha, ringR: 0, ringA: 0, ring2R: 0, ring2A: 0, flash: 0, gold: 0, bloom: 0 };
  const land = DURATION.slam;
  const p1 = clamp01((t - land) / 380);
  const p2 = clamp01((t - land - 60) / 420);
  const fp = (t - land) / 160;
  const bt = (t - land) / 320;
  // The fan never outlives (or outshines) the label: it is capped by the label's own alpha.
  const gold = Math.min(alpha, t < land ? 0.35 * clamp01(t / land) : Math.min(1, 0.35 + 0.65 * clamp01((t - land) / 80)) * out);
  return {
    ...base,
    alpha,
    ringR: t < land ? 0 : 40 + 170 * easeOutCubic(p1),
    ringA: t < land ? 0 : 0.9 * (1 - p1) * out,
    ring2R: t < land + 60 ? 0 : 30 + 150 * easeOutCubic(p2),
    ring2A: t < land + 60 ? 0 : 0.7 * (1 - p2) * out,
    flash: fp < 0 || fp >= 1 ? 0 : 1 - easeOutCubic(fp),
    gold,
    bloom: bt < 0 || bt >= 1 ? 0 : Math.sin(Math.PI * bt) * (1 - 0.4 * bt) * out,
  };
}

/**
 * Coin sparkle k of n at `t` ms of the finish beat: out in a full ring from the landing, gravity, spin and a
 * fade; r5: they leave with the label on the shared exit (finishPose), never after it.
 */
export function finishSparkle(k: number, n: number, t: number, handoff: number = FINISH_HANDOFF_MS): { x: number; y: number; alpha: number; scale: number; rot: number } {
  'worklet';
  const p = clamp01((t - DURATION.slam) / 820);
  if (t < DURATION.slam || t >= handoff + FINISH_EXIT_MS) return { x: 0, y: 0, alpha: 0, scale: 0, rot: 0 };
  const out = t <= handoff ? 1 : 1 - easeOutCubic(clamp01((t - handoff) / FINISH_EXIT_MS));
  const ang = (k / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2 + (k % 2 ? 0.26 : 0);
  const r = 60 + 150 * easeOutCubic(p) * (k % 2 ? 0.72 : 1);
  return {
    x: Math.cos(ang) * r,
    y: Math.sin(ang) * r + 90 * p * p,
    alpha: (p < 0.08 ? p / 0.08 : 1 - clamp01((p - 0.4) / 0.6)) * out,
    scale: 0.6 + 0.7 * (1 - p),
    rot: p * 3 + k,
  };
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

/** Fly-up sizes in order (a combo tier steps the size up). */
const FLY_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
export type FlySize = (typeof FLY_SIZES)[number];
/** Score fly-up colour by combo tier: x1 white, x2 sky, x3 gold, x5 white-hot gold (never red). */
export const TIER_TEXT = ['#ffffff', '#7fd6ff', '#ffcf3b', '#fff3b0'] as const;
/** The fly-up look of a hit: the grade sets the base size; x3 steps it up one, x5 two, and the colour climbs from x2. */
export function tierFlyLook(base: FlySize, rank: number): { flySize: FlySize; flyColor: string | undefined } {
  const r = Math.max(0, Math.min(3, rank));
  const i = Math.min(FLY_SIZES.length - 1, FLY_SIZES.indexOf(base) + (r >= 2 ? 1 : 0) + (r >= 3 ? 1 : 0));
  return { flySize: FLY_SIZES[i], flyColor: r > 0 ? TIER_TEXT[r] : undefined };
}

/** The chase bead's offset from the ghost on a track of half-width `half` for a pace delta (+ is ahead), never past the ends. */
export function chaseOffset(pace: number, half: number): number {
  'worklet';
  return Math.tanh(pace / 700) * Math.max(0, half);
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
