/**
 * The map's wow moments as pure rules (no React, no Reanimated), unit tested in
 * tools/tests/map-wow.test.cjs. Everything here speaks the shared motion language
 * in src/ui/motion.ts (four beats for big moments, two beats for small ones).
 *
 *  - the catch: tap, wobble wobble wobble, a held breath, a gold burst, then the
 *    find flies home and the coins stream into the counter;
 *  - getting warmer: how a find looks far away, close, and in range;
 *  - the spawn pop: finds that arrive together pop one after another;
 *  - the HUD counter: an odometer that rolls each digit, rightmost first.
 */
import { COUNT, DURATION, PARTICLES } from '../../../ui/motion';

/* ------------------------------------------------------------------ the catch */

export interface CatchWobble {
  /** Ms from the tap. */
  readonly at: number;
  /** Peak tilt (degrees), alternating sides. */
  readonly deg: number;
}

export interface CatchPlan {
  /** The press squash (to 0.86) lasts this long. */
  readonly squashMs: number;
  readonly squashTo: number;
  /** Anticipation: from the end of the squash to the hit-stop. */
  readonly anticipationMs: number;
  /** How far the find rises while it gathers (pt). */
  readonly risePt: number;
  /** Three wobbles, each stronger (a Pokemon GO ball: one, two, three). */
  readonly wobbles: readonly CatchWobble[];
  /** The held frame. */
  readonly hitStopAt: number;
  /** The burst lands here (hit-stop end). */
  readonly burstAt: number;
  /** The find pops past full size to this on the burst (SPRING.pop). */
  readonly burstScale: number;
  /** Sparkles drawn inward during the gather, and flung out on the burst. */
  readonly gatherSparkles: number;
  readonly burstSparkles: number;
  /** The fly home starts here. */
  readonly flyAt: number;
  /** Flight time (the arc to the badge or the counter). */
  readonly flyMs: number;
  /** Arc apex above the straight line (pt). */
  readonly arcPt: number;
  /** When the find lands home (the counter bumps on this frame). */
  readonly landAt: number;
  /** A small screen kick away from the tap on the burst (pt), 0 when calm, walking or reduced. */
  readonly kickPt: number;
  /** The second and later catches of a session: two wobbles, no long hold, done in about 1.4 s. */
  readonly repeat: boolean;
  /** The coins burst out of the find on the gold-burst frame and stream into the counter. */
  readonly coinsAt: number;
  /** After the find lands in its badge, the set bar fills over this long, then ticks (gold, a haptic). */
  readonly barMs: number;
  readonly tickAt: number;
  /** The badge leaves here (exits are faster than entrances), and the moment is over at doneAt. */
  readonly exitAt: number;
  readonly exitMs: number;
  readonly doneAt: number;
  /** Round 3. Reduce Motion (a fade, no travel). */
  readonly reduced: boolean;
  /** After the burst the find holds on stage at this size (its hero size); burstScale is the overshoot past it. */
  readonly heroScale: number;
  /** The find's size when it lands in its badge slot (the sticker). */
  readonly landScale: number;
  /** Alex's inked burst: snaps out, holds (the screenshot frame), fades; the gold rays hold this long. */
  readonly inkMs: number;
  readonly goldHoldMs: number;
  /** The badge enters only once the ink burst has started to fade (one celebration at a time). */
  readonly badgeAt: number;
  readonly badgeInMs: number;
}

/**
 * The catch timeline (ms from the tap). Payoff (the burst) inside 1.5 s and everything home and settled
 * inside 2.6 s (the motion language caps), never a still hold over 600 ms. The first catch of a session
 * is the full show; later ones (`repeat`) keep the same four beats but shorter: two wobbles and done in
 * about 1.4 s, so the tenth catch still feels quick. Reduce Motion skips the wobble and the flight and
 * keeps a short fade.
 */
export function catchPlan(options: { readonly reduced: boolean; readonly calm?: boolean; readonly walking?: boolean; readonly repeat?: boolean }): CatchPlan {
  if (options.reduced) {
    const landAt = DURATION.quick;
    return { squashMs: 0, squashTo: 1, anticipationMs: 0, risePt: 0, wobbles: [], hitStopAt: 0, burstAt: 0, burstScale: 1,
      gatherSparkles: 0, burstSparkles: 0, flyAt: 0, flyMs: DURATION.quick, arcPt: 0, landAt, kickPt: 0,
      repeat: !!options.repeat, coinsAt: 0, barMs: 1, tickAt: landAt, exitAt: landAt + 900, exitMs: DURATION.quick, doneAt: landAt + 900 + DURATION.quick,
      reduced: true, heroScale: 1, landScale: 1, inkMs: 1, goldHoldMs: 0, badgeAt: 0, badgeInMs: DURATION.quick };
  }
  const squashMs = DURATION.tap;
  const kickPt = options.calm || options.walking ? 0 : 3;
  if (options.repeat) {
    // Repeat: burst at 450, the badge slides in as the ink fades at 750, the find is home at 1130,
    // the bar ticks and the badge is gone by about 1.44 s.
    const hitStopAt = 380;
    const burstAt = hitStopAt + DURATION.hitStop;
    const flyAt = 750;
    const flyMs = 380;
    const landAt = flyAt + flyMs;
    const barMs = 140;
    const exitMs = 140;
    const exitAt = landAt + barMs + 30;
    return {
      squashMs, squashTo: 0.86, anticipationMs: hitStopAt - squashMs, risePt: 18,
      wobbles: [{ at: 90, deg: 10 }, { at: 240, deg: 14 }],
      hitStopAt, burstAt, burstScale: 1.25,
      gatherSparkles: 4, burstSparkles: 8,
      flyAt, flyMs, arcPt: 60, landAt, kickPt,
      repeat: true, coinsAt: burstAt, barMs, tickAt: landAt + barMs + 10, exitAt, exitMs, doneAt: exitAt + exitMs,
      reduced: false, heroScale: 1.5, landScale: 0.95, inkMs: 520, goldHoldMs: 120, badgeAt: burstAt + 300, badgeInMs: 200,
    };
  }
  // First catch: tap 0, wobbles to 580, held frame 600, burst 670 (the find pops to about 2x on a gold
  // stage, Alex's ink holds full size to about 1055), the badge rises at 1070 as the ink fades, the find
  // flies home 1100 to 1640, the bar fills and ticks gold at 2000, the badge leaves 2250, done 2450.
  const hitStopAt = 600;
  const burstAt = hitStopAt + DURATION.hitStop;
  const flyAt = 1100;
  const flyMs = 540;
  const landAt = flyAt + flyMs;
  const barMs = 340;
  const exitMs = DURATION.exit;
  const exitAt = 2250;
  return {
    squashMs, squashTo: 0.86, anticipationMs: hitStopAt - squashMs, risePt: 24,
    wobbles: [{ at: 90, deg: 8 }, { at: 260, deg: 12 }, { at: 430, deg: 16 }],
    hitStopAt, burstAt, burstScale: 1.24,
    gatherSparkles: 8, burstSparkles: PARTICLES.sparkles,
    flyAt, flyMs, arcPt: 80, landAt, kickPt,
    repeat: false, coinsAt: burstAt, barMs, tickAt: landAt + barMs + 20, exitAt, exitMs, doneAt: exitAt + exitMs,
    reduced: false, heroScale: 1.7, landScale: 0.95, inkMs: 700, goldHoldMs: 160, badgeAt: burstAt + 400, badgeInMs: DURATION.enter,
  };
}

/**
 * The coins of a catch: one coin per coin won (at most 8), sprayed out of the find on the burst, then
 * each arcs into the counter 40 ms after the last. `landAt[i]` is when coin i lands (ms after coinsAt):
 * the first landing starts the counter's roll, every landing punches its icon, the last one bumps it.
 */
export const COIN_STREAM = { max: 8, staggerMs: 40, sprayMs: 200, flightMs: 520, sprayPt: 68, arcPt: 70 } as const;

/** `cap` thins the stream with the power budget (Battery Saver keeps 3 or 4 coins). */
export function coinStreamPlan(coins: number, reduced: boolean, cap: number = COIN_STREAM.max): { readonly count: number; readonly landAt: readonly number[] } {
  if (!(coins > 0)) return { count: 0, landAt: [] };
  if (reduced) return { count: 0, landAt: [0] };
  const count = Math.min(COIN_STREAM.max, Math.max(1, Math.floor(cap)), Math.max(1, Math.floor(coins)));
  const landAt = Array.from({ length: count }, (_, i) => i * COIN_STREAM.staggerMs + COIN_STREAM.sprayMs + COIN_STREAM.flightMs);
  return { count, landAt };
}

/**
 * One streaming coin's position at `t` ms after the burst (layer points): out of the find in a short
 * spray along its own angle, a beat of hang, then a quadratic arc into the counter. Null before it starts
 * and after it lands. Worklet-safe.
 */
export function coinStreamAt(t: number, index: number, count: number, from: { x: number; y: number }, to: { x: number; y: number }):
  { x: number; y: number; scale: number; spin: number } | null {
  'worklet';
  const local = t - index * COIN_STREAM.staggerMs;
  if (local < 0) return null;
  // A fan pointing up and toward the counter, so the spray already leads the eye home.
  const spread = count > 1 ? index / (count - 1) - 0.5 : 0;
  const angle = -Math.PI / 2 + spread * 2.2 + (to.x < from.x ? -0.35 : 0.35);
  const reach = COIN_STREAM.sprayPt * (index % 2 ? 0.8 : 1);
  const sx = from.x + Math.cos(angle) * reach;
  const sy = from.y + Math.sin(angle) * reach;
  if (local < COIN_STREAM.sprayMs) {
    const p = local / COIN_STREAM.sprayMs;
    const out = 1 - (1 - p) * (1 - p);
    return { x: from.x + (sx - from.x) * out, y: from.y + (sy - from.y) * out, scale: 0.4 + 0.6 * out, spin: p * 0.5 };
  }
  const f = (local - COIN_STREAM.sprayMs) / COIN_STREAM.flightMs;
  if (f >= 1) return null;
  // EASE.inOut by hand (cubic), so it reads as a throw: slow off the spray, fast into the chip.
  const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
  const cx = (sx + to.x) / 2;
  const cy = Math.min(sy, to.y) - COIN_STREAM.arcPt;
  const u = 1 - e;
  return { x: u * u * sx + 2 * u * e * cx + e * e * to.x, y: u * u * sy + 2 * u * e * cy + e * e * to.y,
    scale: 1 - 0.45 * e, spin: 0.5 + 2 * e };
}

export type CatchBeatHaptic = 'tapLight' | 'tickSelection' | 'hitMedium' | 'comboHeavy' | 'success' | 'hitSoft';

/**
 * The haptic on every beat, rising through the wobble (tick, light, medium) to the golden burst
 * (heavy, then success 180 ms later). A walking player (in a line, on a path) gets one rung less.
 * Reduce Motion keeps the haptics (the feel is not motion).
 */
export function catchHaptics(plan: CatchPlan, options: { readonly walking?: boolean } = {}): readonly { at: number; intent: CatchBeatHaptic }[] {
  const down: Record<CatchBeatHaptic, CatchBeatHaptic> = {
    tapLight: 'tickSelection', tickSelection: 'tickSelection', hitMedium: 'tapLight', comboHeavy: 'hitMedium', success: 'success', hitSoft: 'hitSoft',
  };
  const steps: { at: number; intent: CatchBeatHaptic }[] = [{ at: 0, intent: 'tapLight' }];
  if (plan.wobbles.length === 3) {
    steps.push({ at: 200, intent: 'tickSelection' }, { at: 350, intent: 'tapLight' }, { at: 480, intent: 'hitMedium' });
  } else if (plan.wobbles.length === 2) {
    steps.push({ at: 150, intent: 'tickSelection' }, { at: 290, intent: 'hitMedium' });
  }
  steps.push({ at: plan.burstAt, intent: 'comboHeavy' }, { at: plan.burstAt + 180, intent: 'success' });
  return options.walking ? steps.map(s => ({ at: s.at, intent: down[s.intent] })) : steps;
}

/**
 * The wobble angle (degrees) at `t` ms after the tap: each wobble swings out and back over 150 ms,
 * alternating sides, the last one the strongest. 0 outside the wobbles. Worklet-safe.
 */
export function wobbleAt(t: number, wobbles: readonly CatchWobble[]): number {
  'worklet';
  for (let i = 0; i < wobbles.length; i++) {
    const w = wobbles[i];
    const local = t - w.at;
    if (local >= 0 && local < 150) {
      const side = i % 2 === 0 ? 1 : -1;
      return side * w.deg * Math.sin((local / 150) * Math.PI);
    }
  }
  return 0;
}

/** A point on the flight's arc (quadratic, apex `arcPt` above the midpoint) at progress `p` 0..1. Worklet-safe. */
export function arcPoint(from: { x: number; y: number }, to: { x: number; y: number }, arcPt: number, p: number): { x: number; y: number } {
  'worklet';
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) - arcPt;
  const u = 1 - p;
  return { x: u * u * from.x + 2 * u * p * cx + p * p * to.x, y: u * u * from.y + 2 * u * p * cy + p * p * to.y };
}

/* -------------------------------------------------------------- getting warmer */

export type FindBand = 'far' | 'mid' | 'near' | 'inRange';

/** Distance bands (m): far over 150, mid 150 to 60, near 60 to catch range, then in range. */
export const BAND_EDGES = { mid: 150, near: 60 } as const;

export function findBand(distance: number | null | undefined, inRange: boolean): FindBand {
  if (inRange) return 'inRange';
  if (distance == null || !Number.isFinite(distance)) return 'far';
  if (distance > BAND_EDGES.mid) return 'far';
  if (distance > BAND_EDGES.near) return 'mid';
  return 'near';
}

export interface BandLook {
  /** 0 far, 1 mid, 2 near, 3 in range (animated between, never snapped). */
  readonly level: number;
  /** The find's opacity. */
  readonly opacity: number;
  /** Gold halo strength at the top of its breath. */
  readonly halo: number;
  /** One halo breath (ms), 0 for none. */
  readonly breathMs: number;
  /** Gentle bob height (pt) and period (ms), 0 for none. */
  readonly bobPt: number;
  readonly bobMs: number;
  /** In range: a hop this high every hopEveryMs, and the gold rings call. */
  readonly hopPt: number;
  readonly hopEveryMs: number;
  readonly rings: boolean;
}

export const BAND_LOOK: Readonly<Record<FindBand, BandLook>> = {
  far: { level: 0, opacity: 0.75, halo: 0, breathMs: 0, bobPt: 0, bobMs: 0, hopPt: 0, hopEveryMs: 0, rings: false },
  mid: { level: 1, opacity: 0.9, halo: 0.25, breathMs: 1800, bobPt: 0, bobMs: 0, hopPt: 0, hopEveryMs: 0, rings: false },
  near: { level: 2, opacity: 1, halo: 0.55, breathMs: 900, bobPt: 4, bobMs: 1600, hopPt: 0, hopEveryMs: 0, rings: false },
  inRange: { level: 3, opacity: 1, halo: 0.75, breathMs: 900, bobPt: 0, bobMs: 0, hopPt: 10, hopEveryMs: 2400, rings: true },
};

/** Band changes cross-fade over this long (never a snap). */
export const BAND_FADE_MS = DURATION.base;

/** The in-range rings: two gold rings expand 1.0 to 2.2 and fade 0.5 to 0 over 1100 ms, 550 ms apart. */
export const RINGS = { periodMs: 1100, offsetMs: 550, from: 1, to: 2.2, opacity: 0.5 } as const;

/** One ring's scale and opacity at time `t` (ms) for ring `i`. Worklet-safe. */
export function ringAt(t: number, i: number): { scale: number; opacity: number } {
  'worklet';
  const p = (((t - i * RINGS.offsetMs) % RINGS.periodMs) + RINGS.periodMs) % RINGS.periodMs / RINGS.periodMs;
  const out = 1 - (1 - p) * (1 - p);
  return { scale: RINGS.from + (RINGS.to - RINGS.from) * out, opacity: RINGS.opacity * (1 - p) };
}

/**
 * The in-range hop at time `t` (ms): a quick spring-like jump at the start of each `everyMs` cycle,
 * then rest (most of the cycle is still, so a field of finds is calm, not a trampoline).
 * Returns the lift (0..1) and the landing squash (0..1). Worklet-safe.
 */
export function hopAt(t: number, everyMs: number, phase: number): { lift: number; squash: number } {
  'worklet';
  if (!(everyMs > 0)) return { lift: 0, squash: 0 };
  const local = ((t + phase * everyMs) % everyMs + everyMs) % everyMs;
  const up = 360;
  if (local < up) {
    const p = local / up;
    return { lift: Math.sin(p * Math.PI), squash: 0 };
  }
  if (local < up + 90) return { lift: 0, squash: Math.sin(((local - up) / 90) * Math.PI) };
  return { lift: 0, squash: 0 };
}

/* --------------------------------------------------------------- the spawn pop */

/** Finds that appear together pop 90 ms apart; at most 5 pop, the rest fade in quietly. */
export const SPAWN = { stepMs: 90, maxPops: 5, windowMs: 700, fadeMs: DURATION.quick, popMs: 180, overshoot: 1.18 } as const;

export interface SpawnClock {
  /** When the current wave started (ms), or -Infinity. */
  waveAt: number;
  /** Finds booked into the current wave. */
  count: number;
}

export function newSpawnClock(): SpawnClock {
  return { waveAt: -Infinity, count: 0 };
}

/**
 * Book one find into the spawn wave at `now`: its delay (ms) and whether it pops (the first five of
 * a wave) or simply fades in. A new wave starts once the last one is older than windowMs.
 */
export function bookSpawn(clock: SpawnClock, now: number): { delay: number; pop: boolean } {
  if (now - clock.waveAt > SPAWN.windowMs) { clock.waveAt = now; clock.count = 0; }
  const index = clock.count++;
  const pop = index < SPAWN.maxPops;
  return { delay: pop ? index * SPAWN.stepMs : SPAWN.maxPops * SPAWN.stepMs, pop };
}

/* ------------------------------------------------------------ the HUD counter */

export interface DigitColumn {
  /** The character shown at rest after the roll. */
  readonly to: string;
  /** The digit it rolls from (null for a column that just appears, or a non-digit). */
  readonly from: number | null;
  /** Start delay (ms): the rightmost digit first, 30 ms per column to the left. */
  readonly delay: number;
  /** Whether this column moves at all. */
  readonly rolls: boolean;
}

/**
 * The odometer plan from one shown string to the next ("1,349" to "1,374"), right aligned, so the
 * ones roll first. Columns whose character is unchanged stay still; a new leading column fades in.
 */
export function digitColumns(fromText: string, toText: string): DigitColumn[] {
  const width = toText.length;
  const pad = (s: string) => (s.length >= width ? s.slice(s.length - width) : ' '.repeat(width - s.length) + s);
  const from = pad(fromText);
  const cols: DigitColumn[] = [];
  let order = 0;
  for (let i = width - 1; i >= 0; i--) {
    const to = toText[i];
    const was = from[i];
    const isDigit = to >= '0' && to <= '9';
    const wasDigit = was >= '0' && was <= '9';
    const rolls = isDigit && was !== to;
    cols.unshift({ to, from: wasDigit ? Number(was) : null, delay: rolls ? order * COUNT.digitStaggerMs : 0, rolls });
    if (rolls) order++;
  }
  return cols;
}

/** Gains this close together merge into one roll (never a stutter). */
export const MERGE_GAINS_MS = 600;

/** The roll's length: 650 ms up, 400 ms down (a spend is quiet). */
export function rollMs(from: number, to: number): number {
  return to >= from ? COUNT.ms : 400;
}

/* ------------------------------------------------- the catch's UI-thread clock */
// Kept at the end of the file: worklets capture the helpers they call when they are created, so every
// helper (wobbleAt included) must already exist above them.

function clamp01(x: number): number {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function easeOut3(x: number): number {
  'worklet';
  const u = 1 - clamp01(x);
  return 1 - u * u * u;
}
function easeIn2(x: number): number {
  'worklet';
  const u = clamp01(x);
  return u * u;
}
function easeInOut3(x: number): number {
  'worklet';
  const u = clamp01(x);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}
/** A spring settling from 1 to 0 over u 0..1 with one small visible overshoot (worklet). */
function settle(u: number, waves = 2.5): number {
  'worklet';
  if (u >= 1) return 0;
  if (u <= 0) return 1;
  return Math.exp(-4 * u) * Math.cos(waves * Math.PI * u) * (1 - u);
}

/** Every visual channel of a common catch at clock time `t` (ms from the tap). */
export interface CatchFrame {
  /** Press squash 0..1 (negative is the small rebound). */
  readonly squash: number;
  /** Gather strength 0..1 (halo, inward sparkles). */
  readonly charge: number;
  /** Rise 0..1 (risePt) and glide 0..1 from the find's spot to the stage point. */
  readonly lift: number;
  readonly glide: number;
  /** Wobble (degrees). */
  readonly wobble: number;
  /** Flash 0..1 (times flashPeak). */
  readonly flash: number;
  /** The find's size (1 at rest on the map). */
  readonly scale: number;
  /** Progress 0..1 of the inked burst, the gold rays' amount, the bloom, sparkles, ring; -1 means not now. */
  readonly ink: number;
  readonly gold: number;
  readonly bloom: number;
  readonly fx: number;
  readonly ring: number;
  /** The flight home 0..1 and the fade once landed. */
  readonly fly: number;
  readonly gone: number;
  /** The badge 0..1, its sticker kick (scale), the landing ring, the bar fill 0..1, its gold tick, the NEW pill. */
  readonly badge: number;
  readonly kick: number;
  readonly landRing: number;
  readonly bar: number;
  readonly barGlow: number;
  readonly newPop: number;
}

/**
 * The catch as one function of the UI-thread clock (round 3). One withTiming drives the clock, every view
 * derives from it, so a busy JS thread can never stretch or desync the beats (round 2 chained JS timers).
 * Worklet-safe and pure, so the frames are unit tested.
 */
export function catchFrame(t: number, p: CatchPlan): CatchFrame {
  'worklet';
  if (p.reduced) {
    const badge = t < p.exitAt ? clamp01(t / p.badgeInMs) : 1 - clamp01((t - p.exitAt) / p.exitMs);
    return { squash: 0, charge: 0, lift: 0, glide: 0, wobble: 0, flash: 0, scale: 1, ink: -1, gold: 0, bloom: 0, fx: -1, ring: -1,
      fly: 0, gone: clamp01(t / p.landAt), badge, kick: 1, landRing: -1, bar: t >= p.landAt ? 1 : 0, barGlow: 0, newPop: t >= p.landAt ? 1 : 0 };
  }
  const sq = p.squashMs;
  const squash = t < 0 ? 0 : t < sq ? easeOut3(t / sq) : settle((t - sq) / 180, 3);
  const antic = clamp01((t - sq) / (p.hitStopAt - sq));
  const b = t - p.burstAt;
  const charge = b < 0 ? antic * antic : 1 - easeOut3(b / 260);
  const lift = easeOut3(antic);
  const glide = easeInOut3(antic);
  const wobble = t < p.hitStopAt ? wobbleAt(t, p.wobbles) : 0;
  const h = t - p.hitStopAt;
  const flash = h < 0 || h >= DURATION.flash ? 0 : h < 40 ? h / 40 : 1 - easeIn2((h - 40) / (DURATION.flash - 40));
  // The find: grows a touch while it gathers, pops past its hero size on the burst, settles there, then
  // shrinks into its sticker slot as it flies.
  const peak = p.heroScale * p.burstScale;
  const fly = easeInOut3((t - p.flyAt) / p.flyMs);
  let scale: number;
  if (b < 0) scale = 1 + 0.12 * charge;
  else if (b < 90) scale = 1.12 + (peak - 1.12) * easeOut3(b / 90);
  else scale = p.heroScale + (peak - p.heroScale) * settle((b - 90) / 420);
  if (t >= p.flyAt) scale = scale + (p.landScale - scale) * fly;
  const ink = b < 0 || b >= p.inkMs ? -1 : b / p.inkMs;
  const goldFade = p.repeat ? 300 : 420;
  const gold = b < 0 ? 0 : b < 120 ? easeOut3(b / 120) : b < 120 + p.goldHoldMs ? 1 : 1 - easeIn2((b - 120 - p.goldHoldMs) / goldFade);
  const bloom = b < 0 ? 0 : b < 140 ? b / 140 : clamp01(1 - (b - 140) / (DURATION.bloom - 140));
  const fx = b < 0 || b >= DURATION.sparkle ? -1 : b / DURATION.sparkle;
  const ring = b < 0 || b >= DURATION.bloom ? -1 : b / DURATION.bloom;
  const gone = t < p.landAt ? 0 : clamp01((t - p.landAt) / 80);
  const badge = t < p.badgeAt ? 0 : t < p.exitAt ? easeOut3((t - p.badgeAt) / p.badgeInMs) : 1 - easeIn2((t - p.exitAt) / p.exitMs);
  const l = t - p.landAt;
  const k = t - p.tickAt;
  let kick = 1;
  if (l >= 0) kick += l < 100 ? 0.22 * (l / 100) : 0.22 * settle((l - 100) / 320);
  if (k >= 0) kick += k < 80 ? 0.1 * (k / 80) : 0.1 * settle((k - 80) / 240);
  const landRing = l < 0 || l >= 520 ? -1 : l / 520;
  const bar = l < 0 ? 0 : easeOut3(l / p.barMs);
  const barGlow = k < 0 ? 0 : k < 90 ? k / 90 : 1 - easeIn2((k - 90) / 420);
  const n = l - 60;
  const newPop = n < 0 ? 0 : n >= 300 ? 1 : 1 - Math.exp(-5 * (n / 300)) * Math.cos(3 * Math.PI * (n / 300));
  return { squash, charge, lift, glide, wobble, flash, scale, ink, gold, bloom, fx, ring, fly, gone, badge, kick, landRing, bar, barGlow, newPop };
}

/**
 * Where the find stages its burst (Pokemon GO centres the catch): it glides from its map spot toward a point
 * that keeps the whole inked burst on screen, at least 12 pt inside the edges, below the header and above
 * the badge. A find already in a good spot barely moves.
 */
export function catchStage(from: { x: number; y: number }, risePt: number,
  area: { readonly width: number; readonly top: number; readonly bottom: number }, radius: number): { x: number; y: number } {
  const margin = 12;
  const loX = radius + margin, hiX = area.width - radius - margin;
  const x = loX > hiX ? area.width / 2 : Math.min(hiX, Math.max(loX, from.x));
  const loY = area.top + radius * 0.9 + margin, hiY = area.bottom - radius - margin;
  const y = loY > hiY ? (loY + hiY) / 2 : Math.min(hiY, Math.max(loY, from.y - risePt));
  return { x, y };
}

/**
 * The HUD chip during a coin stream, from the same clock (worklets): the icon punches on every landing
 * (the last one the full HUD_BUMP), the gold glow and "+N" start with the first landing.
 */
export function hudPunch(t: number, lands: readonly number[]): number {
  'worklet';
  let i = -1;
  for (let j = 0; j < lands.length; j++) if (lands[j] <= t) i = j;
  if (i < 0) return 1;
  const d = t - lands[i];
  const peak = i === lands.length - 1 ? 0.22 : 0.11;
  return 1 + (d < 60 ? peak * (d / 60) : peak * settle((d - 60) / 280));
}

export function hudGlow(t: number, land0: number): number {
  'worklet';
  const d = t - land0;
  if (d < 0 || d >= DURATION.bloom) return 0;
  return d < 160 ? 0.5 * (d / 160) : 0.5 * (1 - easeIn2((d - 160) / (DURATION.bloom - 160)));
}

/**
 * One odometer column on the stream clock: holds `from` until `startAt`, rolls to `to` over `ms` with a small
 * overshoot (EASE.out, then back), then rests. `to` may be past 9 (a roll through 9 to 0). Worklet-safe.
 */
export function rollPos(t: number, startAt: number, from: number, to: number, ms: number): number {
  'worklet';
  const u = (t - startAt) / ms;
  if (u <= 0) return from;
  if (u >= 1) return to;
  const over = to > from ? 0.09 : 0;
  if (u < 0.82) return from + (to + over - from) * easeOut3(u / 0.82);
  return to + over * (1 - easeInOut3((u - 0.82) / 0.18));
}
