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
import { COUNT, DURATION, KICK, PARTICLES } from '../../../ui/motion';

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
  /** Round 4. The burst exit: the ink and the gold rays suck back into the find (anticipation for the flight). */
  readonly suckAt: number;
  readonly suckMs: number;
  /**
   * Round 5. The next goal: the set's next missing find pops onto the badge's corner as a navy silhouette in a
   * gold ring (a picture, no words), so every catch ends pointing at the next one.
   */
  readonly nextAt: number;
  /**
   * Wave 5 round 3: the repeat's fidget (round-robin, so catch 40 still varies): 0 the two wobbles, 1 a full twirl
   * while it rises (`twirl` degrees), 2 two little hops (`hopPt` high) with the wobbles turned the other way.
   */
  readonly fidget: 0 | 1 | 2;
  readonly twirl: number;
  readonly hopPt: number;
}

/**
 * Wave 5 round 3: a repeat holds its breath until about when the server usually answers, so the hit-stop and the
 * burst land on their planned beats instead of 140 to 175 ms late (the burst never plays before the server says yes).
 * The held frame is the median of this session's recent answer times plus a frame, kept between min and max.
 */
export const REPEAT_HELD = { min: 360, max: 560, lead: 20, samples: 5 } as const;

/** The repeat's held frame (ms from the tap) from this session's recent answer times (ms from the tap). Pure. */
export function heldFromAnswers(answers: readonly number[]): number {
  const recent = answers.filter(ms => Number.isFinite(ms) && ms > 0).slice(-REPEAT_HELD.samples);
  if (!recent.length) return REPEAT_HELD.min;
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return Math.round(Math.min(REPEAT_HELD.max, Math.max(REPEAT_HELD.min, mid + REPEAT_HELD.lead)));
}

/**
 * The catch timeline (ms from the tap). Payoff (the burst) inside 1.5 s and everything home and settled
 * inside 2.6 s (the motion language caps), never a still hold over 600 ms. The first catch of a session
 * is the full show; later ones (`repeat`) keep the same four beats but shorter: two wobbles and done in
 * about 1.4 s, so the tenth catch still feels quick. Reduce Motion skips the wobble and the flight and
 * keeps a short fade.
 */
export function catchPlan(options: { readonly reduced: boolean; readonly calm?: boolean; readonly walking?: boolean; readonly repeat?: boolean; readonly milestone?: boolean;
  /** Wave 4: a 5th-catch treat (the star tier) keeps the snappy repeat but holds its burst 280 ms, so the stars read as a reward. */
  readonly treat?: boolean;
  /** Wave 5 round 3: the repeat's held frame (heldFromAnswers), and its fidget (burstVariant). */
  readonly heldAt?: number; readonly fidget?: 0 | 1 | 2 }): CatchPlan {
  if (options.reduced) {
    const landAt = DURATION.quick;
    return { squashMs: 0, squashTo: 1, anticipationMs: 0, risePt: 0, wobbles: [], hitStopAt: 0, burstAt: 0, burstScale: 1,
      gatherSparkles: 0, burstSparkles: 0, flyAt: 0, flyMs: DURATION.quick, arcPt: 0, landAt, kickPt: 0,
      repeat: !!options.repeat, coinsAt: 0, barMs: 1, tickAt: landAt, exitAt: landAt + 900, exitMs: DURATION.quick, doneAt: landAt + 900 + DURATION.quick,
      reduced: true, heroScale: 1, landScale: 1, inkMs: 1, goldHoldMs: 0, badgeAt: 0, badgeInMs: DURATION.quick, suckAt: 0, suckMs: 1, nextAt: landAt,
      fidget: 0, twirl: 0, hopPt: 0 };
  }
  const squashMs = DURATION.tap;
  // A milestone catch (the beam) kicks the map the full KICK.maxPt; none while walking or in calm power.
  const kickPt = options.calm || options.walking ? 0 : options.milestone ? KICK.maxPt : 3;
  if (options.repeat) {
    // Wave 5 round 3: the held frame waits for about when the server answers (REPEAT_HELD, 360 to 560 ms), then the
    // burst holds 170 ms (280 on the 5th-catch treat), sucks back, and the flight and the badge are a touch quicker,
    // so a repeat is still done in about 1.3 to 1.5 s.
    const hitStopAt = Math.round(Math.min(REPEAT_HELD.max, Math.max(REPEAT_HELD.min, options.heldAt ?? REPEAT_HELD.min)));
    const burstAt = hitStopAt + DURATION.hitStop;
    const suckAt = burstAt + (options.treat ? 280 : 170);
    const suckMs = 90;
    const flyAt = suckAt + suckMs;
    const flyMs = 280;
    const landAt = flyAt + flyMs;
    const barMs = 110;
    const exitMs = 130;
    // The next goal pops 20 ms into the flight and stays at least 440 ms (read, then the where flight, then the exit).
    const exitAt = landAt + barMs + 70;
    const fidget = options.fidget ?? 0;
    // The wobbles keep their rhythm whatever the held frame: the first early, the last 140 ms before the hold.
    const late = Math.max(200, hitStopAt - 140);
    const wobbles = fidget === 1 ? [] : fidget === 2 ? [{ at: 90, deg: -12 }, { at: late, deg: 16 }] : [{ at: 90, deg: 10 }, { at: late, deg: 14 }];
    return {
      squashMs, squashTo: 0.86, anticipationMs: hitStopAt - squashMs, risePt: 18,
      wobbles,
      hitStopAt, burstAt, burstScale: 1.25,
      gatherSparkles: 4, burstSparkles: 8,
      flyAt, flyMs, arcPt: 60, landAt, kickPt,
      repeat: true, coinsAt: options.treat ? burstAt + TREAT_COINS_DELAY_MS : burstAt, barMs, tickAt: landAt + barMs + 10, exitAt, exitMs, doneAt: exitAt + exitMs,
      reduced: false, heroScale: 1.5, landScale: 0.95, inkMs: suckAt + suckMs - burstAt, goldHoldMs: 120, badgeAt: flyAt, badgeInMs: 200,
      suckAt, suckMs, nextAt: flyAt + 20,
      fidget, twirl: fidget === 1 ? 360 : 0, hopPt: fidget === 2 ? 16 : 0,
    };
  }
  // First catch (round 4): tap 0, wobbles to 580, held frame 600, burst 670 (the find pops to about 2x on a gold
  // stage while its coins spray out past the rays), Alex's ink holds full size to 1090, then the ink and the rays
  // suck back into the find (1090 to 1210, the anticipation for the flight). The badge pops in on that frame
  // (never through the rays), the find flies home 1210 to 1750, the bar fills and ticks gold, the badge
  // leaves 2250, done 2450.
  const hitStopAt = 600;
  const burstAt = hitStopAt + DURATION.hitStop;
  const suckAt = burstAt + 420;
  const suckMs = 120;
  const flyAt = suckAt + suckMs;
  const flyMs = 540;
  const landAt = flyAt + flyMs;
  const barMs = 340;
  // Round 5: the badge stays a beat longer (to 2380) so the next-goal silhouette reads; still settled by 2.6 s.
  const exitMs = DURATION.exit;
  const exitAt = 2380;
  return {
    squashMs, squashTo: 0.86, anticipationMs: hitStopAt - squashMs, risePt: 24,
    wobbles: [{ at: 90, deg: 8 }, { at: 260, deg: 12 }, { at: 430, deg: 16 }],
    hitStopAt, burstAt, burstScale: 1.24,
    gatherSparkles: 8, burstSparkles: PARTICLES.sparkles,
    flyAt, flyMs, arcPt: 80, landAt, kickPt,
    repeat: false, coinsAt: burstAt, barMs, tickAt: landAt + barMs + 20, exitAt, exitMs, doneAt: exitAt + exitMs,
    reduced: false, heroScale: 1.7, landScale: 0.95, inkMs: suckAt + suckMs - burstAt, goldHoldMs: 160, badgeAt: flyAt, badgeInMs: DURATION.enter,
    // Wave 5 round 3: the next goal pops 200 ms after the find lands (it used to pop mid-flight, and the badge then sat
    // still for about 600 ms): land 1750, the next goal 1930, the bar's tick 2110, its ring 2130, the exit 2380.
    suckAt, suckMs, nextAt: landAt + 180,
    fidget: 0, twirl: 0, hopPt: 0,
  };
}

/**
 * Round 4: the burst changes with the session's catch count, so the 50th catch still surprises. Milestones
 * only (never chance): every 5th catch throws a star spray, every 10th drops the gold beam first, the 25th
 * (and every 25th) is the grand one (beam, bigger ink, every ring and star). Ordinary repeats rotate the
 * classic burst, a gold ring burst and a star burst, each a slightly different size.
 */
export interface BurstVariant {
  readonly kind: 'classic' | 'rings' | 'stars' | 'beam' | 'grand' | 'hero' | 'golden';
  /** Alex's inked burst size (1 is the classic). */
  readonly inkScale: number;
  /** Gold rings rippling out from the find (1 to 3, 90 ms apart). */
  readonly rings: number;
  /** Flung stars (the mounted pool is 8). */
  readonly stars: number;
  readonly beam: boolean;
  /** A milestone: the full KICK and the heavier haptic. */
  readonly milestone: boolean;
  /** Wave 4: the 5th-catch treat (the star tier holds its burst longer on the snappy repeat). */
  readonly treat: boolean;
  /** Wave 4: the 25th: a gold confetti shower. */
  readonly grand: boolean;
  /**
   * Wave 5 round 2: the hand-inked spike fan behind Alex's burst shows on milestones only (the 10th and the 25th).
   * A common is Alex's inked star alone on a soft gold bloom, one clear read (the two stacked looked like a mace).
   */
  readonly fan: boolean;
  /** Wave 5 round 2: a second ring of rays turning the other way (the 10th and the 25th). */
  readonly counterRing: boolean;
  /** Wave 5 round 2: the 5th-catch treat's stars arc into the coin counter (they lead the coins home). */
  readonly homeStars: boolean;
  /** Wave 5 round 3: the player's first catch ever: centre stage, Alex's star at about 85% of the screen, a screen-wide bloom. */
  readonly hero: boolean;
  /** Wave 5 round 3: the find glides to the middle of the screen for its burst (Pokemon GO centres the catch). */
  readonly centre: boolean;
  /** Wave 5 round 3: a repeat's fidget (round-robin) and its chime's pitch step, so ordinary repeats never play the same twice running. */
  readonly fidget: 0 | 1 | 2;
  readonly pitch: number;
  /** Wave 5 round 3: a golden find (the server marks it): the beam drops on it too, because the find really is rare. */
  readonly golden: boolean;
}

export const BURST_STARS_MAX = 8;
export const BURST_RINGS_MAX = 3;

/**
 * Wave 5 round 3, the staircase (each tier at least 1.12x the last, and each adds something new):
 * 1st catch of a session 1.05 (Alex's star, bloom, two rings, centre stage), 5th 1.3 (eight big stars with gold
 * trails fly into the counter, which punches once per star), 10th 1.47 (the beam, the spike fan and a
 * counter-turning ring), 25th 1.7 (all of it and confetti). The first catch ever is the hero (1.44, centre stage, a
 * screen-wide bloom). Ordinary repeats stay a touch smaller, rotate three looks and three fidgets, and step their
 * chime up, so the 40th catch still varies. A golden find (a real server flag, never chance) gets the beam.
 */
export function burstVariant(catchNumber: number, options: { readonly firstEver?: boolean; readonly golden?: boolean } = {}): BurstVariant {
  const n = Math.max(1, Math.floor(catchNumber));
  const base = { beam: false, milestone: false, treat: false, grand: false, fan: false, counterRing: false, homeStars: false,
    hero: false, centre: false, fidget: 0 as 0 | 1 | 2, pitch: 0, golden: false };
  if (options.firstEver) return { ...base, kind: 'hero', inkScale: 1.44, rings: 3, stars: 8, hero: true, centre: true };
  if (n % 25 === 0) return { ...base, kind: 'grand', inkScale: 1.7, rings: 3, stars: 8, beam: true, milestone: true, grand: true, fan: true, counterRing: true, centre: true };
  if (n % 10 === 0) return { ...base, kind: 'beam', inkScale: 1.47, rings: 3, stars: 8, beam: true, milestone: true, fan: true, counterRing: true, centre: true };
  if (n % 5 === 0) return { ...base, kind: 'stars', inkScale: 1.3, rings: 2, stars: 8, treat: true, homeStars: true, centre: true };
  if (n === 1) return { ...base, kind: 'classic', inkScale: 1.05, rings: 2, stars: 4, centre: true, golden: !!options.golden, beam: !!options.golden };
  const fidget = (n % 3) as 0 | 1 | 2;
  // The chime climbs a step with each repeat (four steps, then round again).
  const pitch = 2 * (n % 4);
  const golden = !!options.golden;
  if (golden) return { ...base, kind: 'golden', inkScale: 1.15, rings: 2, stars: 6, beam: true, golden: true, fidget, pitch };
  if (fidget === 0) return { ...base, kind: 'rings', inkScale: 0.9, rings: 3, stars: 2, fidget, pitch };
  if (fidget === 1) return { ...base, kind: 'stars', inkScale: 0.95, rings: 1, stars: 6, fidget, pitch };
  return { ...base, kind: 'classic', inkScale: 1, rings: 1, stars: 4, fidget, pitch };
}

/**
 * Wave 5 round 3: the 5th-catch treat stars lead the coins home. Star i flings out over the top (outMs), then arcs into
 * the coin counter at `to` (relative pt), 45 ms after the one before (after a short hang past the tips), and lands at homeStarLand(i) ms after the burst
 * (the counter punches on each landing). Big (about 40 pt to 25 pt), so they read at phone size.
 */
export const HOME_STARS = { outMs: 140, hangMs: 160, flyMs: 420, staggerMs: 45, from: 1.45, to: 0.9 } as const;
export function homeStarLand(i: number): number {
  return i * HOME_STARS.staggerMs + HOME_STARS.outMs + HOME_STARS.hangMs + HOME_STARS.flyMs;
}
/** Wave 5 round 3: on the treat the coins wait for the stars (they spray out once the burst has sucked back), so every star lands on its own. */
export const TREAT_COINS_DELAY_MS = 400;

/** A treat star `d` ms after the burst (index i of n), relative to the find, or null when it is not on screen. Worklet. */
export function homeStarAt(d: number, i: number, n: number, to: { x: number; y: number }): { x: number; y: number; scale: number } | null {
  'worklet';
  const local = d - i * HOME_STARS.staggerMs;
  if (local <= 0 || n <= 0 || local >= HOME_STARS.outMs + HOME_STARS.hangMs + HOME_STARS.flyMs) return null;
  const angle = -Math.PI / 2 + (i - (n - 1) / 2) * (n > 4 ? 0.42 : 0.8);
  // Out past the tips of the 5th's ink burst (about 165 pt), so the stars hang on the map, not gold on gold.
  const reach = i % 2 ? 168 : 186;
  const ox = Math.cos(angle) * reach, oy = Math.sin(angle) * reach;
  if (local < HOME_STARS.outMs) {
    const u = local / HOME_STARS.outMs;
    const out = 1 - (1 - u) * (1 - u) * (1 - u);
    return { x: ox * out, y: oy * out, scale: (u < 0.3 ? u / 0.3 : 1) * HOME_STARS.from };
  }
  // They hang a beat at the tips (a ring of stars around the find, bobbing), then fly home once the burst is gone.
  if (local < HOME_STARS.outMs + HOME_STARS.hangMs) {
    const h = (local - HOME_STARS.outMs) / HOME_STARS.hangMs;
    return { x: ox, y: oy - 6 * Math.sin(h * Math.PI), scale: HOME_STARS.from * (1 + 0.08 * Math.sin(h * Math.PI)) };
  }
  const f = (local - HOME_STARS.outMs - HOME_STARS.hangMs) / HOME_STARS.flyMs;
  const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
  const cx = (ox + to.x) / 2, cy = Math.min(oy, to.y) - 60;
  const u = 1 - e;
  return { x: u * u * ox + 2 * u * e * cx + e * e * to.x, y: u * u * oy + 2 * u * e * cy + e * e * to.y,
    scale: HOME_STARS.from - (HOME_STARS.from - HOME_STARS.to) * e };
}

/** The beam drops this long before the held frame and lands on it (the flash is its impact). */
export const BEAM = { dropMs: 300, fadeMs: 420, sparkles: 5 } as const;

/**
 * The beam at clock `t` (round 4): the drop 0..1 (its head reaches the find at 1, on the held frame), then
 * a fade 0..1 while it narrows; -1 when it is not on screen. Worklet-safe.
 */
export function beamAt(t: number, p: CatchPlan): { drop: number; fade: number } | null {
  'worklet';
  const d = t - (p.hitStopAt - BEAM.dropMs);
  if (d < 0 || p.reduced) return null;
  if (d < BEAM.dropMs) { const u = d / BEAM.dropMs; return { drop: u * u, fade: 0 }; }
  const f = (d - BEAM.dropMs) / BEAM.fadeMs;
  if (f >= 1) return null;
  return { drop: 1, fade: f };
}

/**
 * Wave 4: the grand catch's gold confetti (the 25th). Each piece pops up and out of the find on the burst, then
 * flutters down under gravity and fades; `null` when it is not on screen. Capped by the caller (power budget).
 * Worklet-safe and pure (the pieces are drawn in the burst's one Skia canvas).
 */
export const CONFETTI = { max: 14, ms: 1500 } as const;
export function confettiAt(t: number, p: CatchPlan, i: number, count: number): { x: number; y: number; rot: number; sx: number; alpha: number } | null {
  'worklet';
  const d = t - p.burstAt;
  if (d < 0 || d >= CONFETTI.ms || p.reduced || count <= 0) return null;
  const u = d / CONFETTI.ms;
  // A fan over the top half, each piece its own speed (deterministic, never random).
  const a = -Math.PI / 2 + ((i + 0.5) / count - 0.5) * Math.PI * 1.25;
  const v = 300 + ((i * 37) % 5) * 45;
  const s = d / 1000;
  const x = Math.cos(a) * v * s * (1 - 0.35 * u) + Math.sin(d / 110 + i) * 14 * u;
  const y = Math.sin(a) * v * s + 520 * s * s;
  return { x, y, rot: d / 160 * (i % 2 ? -1 : 1) + i, sx: Math.cos(d / 90 + i * 1.3), alpha: u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3 };
}

/**
 * The coins of a catch: one coin per coin won (at most 8), sprayed out of the find on the burst, then
 * each arcs into the counter 40 ms after the last. `landAt[i]` is when coin i lands (ms after coinsAt):
 * the first landing starts the counter's roll, every landing punches its icon, the last one bumps it.
 */
/**
 * Round 4: the coins spray out past the gold rays' tips (130 pt) so the burst frame shows the find ringed by
 * readable coins, each 40 pt with Alex's ink rim, shrinking to about 25 pt as it lands in the counter.
 */
export const COIN_STREAM = { max: 8, staggerMs: 40, sprayMs: 200, flightMs: 520, sprayPt: 165, arcPt: 70, sizePt: 40, landScale: 0.62 } as const;

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
  const angle = -Math.PI / 2 + spread * 2.6 + (to.x < from.x ? -0.3 : 0.3);
  const reach = COIN_STREAM.sprayPt * (index % 2 ? 0.84 : 1);
  const sx = from.x + Math.cos(angle) * reach;
  const sy = from.y + Math.sin(angle) * reach;
  if (local < COIN_STREAM.sprayMs) {
    const p = local / COIN_STREAM.sprayMs;
    const out = 1 - (1 - p) * (1 - p);
    return { x: from.x + (sx - from.x) * out, y: from.y + (sy - from.y) * out, scale: 0.4 + 0.6 * out, spin: p * 0.25 };
  }
  const f = (local - COIN_STREAM.sprayMs) / COIN_STREAM.flightMs;
  if (f >= 1) return null;
  // EASE.inOut by hand (cubic), so it reads as a throw: slow off the spray, fast into the chip.
  const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
  const cx = (sx + to.x) / 2;
  const cy = Math.min(sy, to.y) - COIN_STREAM.arcPt;
  const u = 1 - e;
  return { x: u * u * sx + 2 * u * e * cx + e * e * to.x, y: u * u * sy + 2 * u * e * cy + e * e * to.y,
    scale: 1 - (1 - COIN_STREAM.landScale) * e, spin: 0.25 + 2 * e };
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
  /** Round 4. The ink and rays sucking back into the find 0..1 (the burst exit), the badge's pop scale, the map kick (pt). */
  readonly suck: number;
  readonly badgeScale: number;
  readonly shake: number;
  /** Wave 5 round 3: the repeat fidget's hop (pt up), 0 for the other fidgets. */
  readonly hop: number;
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
      fly: 0, gone: clamp01(t / p.landAt), badge, kick: 1, landRing: -1, bar: t >= p.landAt ? 1 : 0, barGlow: 0, newPop: t >= p.landAt ? 1 : 0,
      suck: 0, badgeScale: 1, shake: 0, hop: 0 };
  }
  const sq = p.squashMs;
  const squash = t < 0 ? 0 : t < sq ? easeOut3(t / sq) : settle((t - sq) / 180, 3);
  const antic = clamp01((t - sq) / (p.hitStopAt - sq));
  const b = t - p.burstAt;
  const charge = b < 0 ? antic * antic : 1 - easeOut3(b / 260);
  const lift = easeOut3(antic);
  const glide = easeInOut3(antic);
  // Wave 5 round 3: the fidgets. A twirl turns the find once while it rises; a hop bounces it twice.
  const wobble = t < p.hitStopAt ? wobbleAt(t, p.wobbles) + (p.twirl ? p.twirl * easeInOut3(antic) : 0) : 0;
  const hop = p.hopPt > 0 && t < p.hitStopAt && t > sq ? p.hopPt * Math.abs(Math.sin(antic * Math.PI * 2)) : 0;
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
  // Round 4: the burst exit is one clean beat, never a muddy cross-fade. The ink and the rays hold at full
  // strength, then suck back into the find over suckMs (EASE.in); the badge pops in only after that.
  const suck = t < p.suckAt ? 0 : clamp01((t - p.suckAt) / p.suckMs);
  const gold = b < 0 || suck >= 1 ? 0 : b < 120 ? easeOut3(b / 120) : 1;
  const bloom = b < 0 ? 0 : b < 140 ? b / 140 : clamp01(1 - (b - 140) / (DURATION.bloom - 140));
  const fx = b < 0 || b >= DURATION.sparkle ? -1 : b / DURATION.sparkle;
  const ring = b < 0 || b >= DURATION.bloom ? -1 : b / DURATION.bloom;
  const gone = t < p.landAt ? 0 : clamp01((t - p.landAt) / 80);
  // The badge pops in (fully opaque within 70 ms, scale 0.6 to about 1.05 and back to 1, SPRING.pop's one overshoot).
  const bin = (t - p.badgeAt) / p.badgeInMs;
  const badge = t < p.badgeAt ? 0 : t < p.exitAt ? clamp01((t - p.badgeAt) / 70) : 1 - easeIn2((t - p.exitAt) / p.exitMs);
  const badgeScale = t < p.badgeAt ? 0.6 : t < p.exitAt ? 1 - 0.4 * settle(clamp01(bin), 2.2) : 1 - 0.08 * easeIn2((t - p.exitAt) / p.exitMs);
  // The map kicks away on the burst (KICK.ms), then springs back with one small wobble.
  const kb = b / KICK.ms;
  const shake = b < 0 || kb >= 1 || p.kickPt <= 0 ? 0 : p.kickPt * Math.sin(kb * Math.PI * 2.5) * (1 - kb);
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
  return { squash, charge, lift, glide, wobble, flash, scale, ink, gold, bloom, fx, ring, fly, gone, badge, kick, landRing, bar, barGlow, newPop,
    suck, badgeScale, shake, hop };
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

/**
 * Round 5: an odometer digit's opacity from its distance to the window (in digit heights). Fully shown within
 * 0.15 of the centre, gone by 0.6, so a rolling digit fades out well inside the pill's rim (no clip needed).
 */
export function digitCellOpacity(d: number): number {
  'worklet';
  const a = Math.abs(d);
  if (a <= 0.15) return 1;
  if (a >= 0.6) return 0;
  return 1 - (a - 0.15) / 0.45;
}

/**
 * Wave 5: an odometer cell's pose from its distance to the window (in digit heights). Exactly one digit shows at
 * a time (the nearest one, |d| under 0.5), so a mid-roll frame never reads as a half digit ("3_0"): it slides
 * only 0.42 of its offset and squashes to 0.75 tall at the swap, a quick flip that stays inside the pill.
 */
export function digitCellPose(d: number): { opacity: number; y: number; sy: number } {
  'worklet';
  const a = Math.abs(d);
  if (a >= 0.5) return { opacity: 0, y: 0, sy: 1 };
  return { opacity: 1, y: d * 0.42, sy: 1 - 0.5 * a };
}

/** Wave 5: the counter's one landing pop when its roll ends (scale over 240 ms, peak COUNT.finalBump 1.12). */
export function countLandPop(t: number, rollEnd: number): number {
  'worklet';
  const d = t - rollEnd;
  if (d <= 0 || d >= 240) return 1;
  return 1 + 0.12 * Math.sin(Math.PI * (d / 240));
}

/**
 * Round 5: the next-goal silhouette on the badge at clock time `t`: pops from 0 to one overshoot (SPRING.pop feel),
 * then bobs 2 pt and its gold ring pulses outward once every 700 ms. Worklet; scale 0 before nextAt.
 */
export function nextGoalAt(t: number, p: CatchPlan): { scale: number; bob: number; ring: number } {
  'worklet';
  const d = t - p.nextAt;
  if (d < 0) return { scale: 0, bob: 0, ring: -1 };
  const scale = d < 120 ? 1.2 * easeOut3(d / 120) : 1 + 0.2 * settle((d - 120) / 300);
  const ring = d < 200 ? -1 : ((d - 200) % 700) / 700;
  return { scale, bob: -2 * Math.sin(d / 160), ring };
}

/**
 * Wave 5 round 2, where to walk next: on the session's last catch in range the next-goal disc leaves the badge and
 * arcs onto the next find (or its edge arrow): 420 ms flight, a landing pop with a gold ring, a short bob there,
 * then a fade. It starts once the disc has been read on the badge (about 450 ms), and always before the badge leaves.
 */
export const WHERE = { flightMs: 420, popMs: 200, stayMs: 900, fadeMs: 220, arcPt: 70, totalMs: 420 + 200 + 900 + 220, trailDots: 7, trailMs: 1100 } as const;

/**
 * Wave 5 round 3: after the disc lands, the spot keeps a gold pulse (a beacon ring every 800 ms) for 2.4 s, so a kid
 * can point to where to walk. It stops by itself, and never plays under Reduce Motion or on Battery Saver.
 */
export const BEACON = { ms: 2400, periodMs: 800 } as const;

/** The beacon's ring `d` ms after it starts: scale and opacity, or null once it is over. Worklet. */
export function beaconAt(d: number): { scale: number; opacity: number } | null {
  'worklet';
  if (d < 0 || d >= BEACON.ms) return null;
  const u = (d % BEACON.periodMs) / BEACON.periodMs;
  const fade = d > BEACON.ms - BEACON.periodMs ? 1 - (d - (BEACON.ms - BEACON.periodMs)) / BEACON.periodMs : 1;
  return { scale: 0.9 + 1.1 * (1 - (1 - u) * (1 - u)), opacity: 0.85 * (1 - u) * fade };
}

export function whereFlightAt(p: CatchPlan): number {
  return Math.min(p.nextAt + 450, p.exitAt - 60);
}

/** The where-next disc `d` ms after its flight starts (layer points), or null when it is not on screen. Worklet. */
export function whereAt(d: number, from: { x: number; y: number }, to: { x: number; y: number }):
  { x: number; y: number; scale: number; rot: number; alpha: number; ring: number } | null {
  'worklet';
  if (d < 0 || d >= WHERE.totalMs) return null;
  if (d < WHERE.flightMs) {
    const e = easeInOut3(d / WHERE.flightMs);
    const at = arcPoint(from, to, WHERE.arcPt, e);
    return { x: at.x, y: at.y, scale: 1 - 0.25 * Math.sin(e * Math.PI) * 0.6, rot: 8 - 8 * e, alpha: 1, ring: -1 };
  }
  const l = d - WHERE.flightMs;
  const pop = l < WHERE.popMs ? 1 + 0.22 * Math.sin((l / WHERE.popMs) * Math.PI) : 1;
  const ring = l < 520 ? l / 520 : -1;
  const fadeFrom = WHERE.popMs + WHERE.stayMs;
  const alpha = l < fadeFrom ? 1 : 1 - clamp01((l - fadeFrom) / WHERE.fadeMs);
  return { x: to.x, y: to.y - 3 * Math.sin(l / 140), scale: pop * (1 - 0.15 * (1 - alpha)), rot: 0, alpha, ring };
}

/**
 * Wave 5 round 3: the where-next disc leaves a dotted trail: dot i (of WHERE.trailDots) appears as the disc passes its
 * spot on the arc and fades over trailMs. Null when the dot is not on screen. Worklet.
 */
export function whereTrailAt(d: number, i: number, from: { x: number; y: number }, to: { x: number; y: number }):
  { x: number; y: number; alpha: number; scale: number } | null {
  'worklet';
  const n = WHERE.trailDots;
  const q = (i + 1) / (n + 1);
  // The disc's eased progress passes q at this time (easeInOut3 inverted by a small search, cheap: 12 steps).
  let lo = 0, hi = 1;
  for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (easeInOut3(mid) < q) lo = mid; else hi = mid; }
  const at = lo * WHERE.flightMs;
  const local = d - at;
  if (local < 0 || local >= WHERE.trailMs) return null;
  const p = arcPoint(from, to, WHERE.arcPt, q);
  const pop = local < 120 ? local / 120 : 1;
  return { x: p.x, y: p.y, alpha: local < 120 ? pop : 1 - (local - 120) / (WHERE.trailMs - 120), scale: 0.5 + 0.5 * pop };
}

/* -------------------------------------------------------------- the funny miss */

/**
 * Wave 5 round 3: the server said no. Within a frame the find boings: a squash in the grab (0 to 120 ms), a hop back
 * to its own spot (120 to 420 ms, 30 pt high, stretched), a landing squash, then a "nope" shake that settles by 900 ms.
 * A dotted "come closer" ring pulls in around the find twice from 380 ms (MISS.ringMs). The shark shrugs at 150 ms.
 * Funny, never sad, and no words are needed (the line under it is optional).
 */
export const MISS = { squashMs: 120, hopMs: 300, landMs: 100, shakeMs: 380, hopPt: 30, doneMs: 950, shrugAt: 150, ringAt: 380, ringMs: 1600, rings: 2 } as const;

/**
 * The find on a miss `d` ms after the server's no: back 0..1 (from where it was to its own spot), its hop (pt up),
 * squash (x and y scale) and rotation (deg). Worklet.
 */
export function missAt(d: number): { back: number; hop: number; sx: number; sy: number; rot: number } {
  'worklet';
  if (d <= 0) return { back: 0, hop: 0, sx: 1, sy: 1, rot: 0 };
  const a = MISS.squashMs, b = a + MISS.hopMs, c = b + MISS.landMs, e = c + MISS.shakeMs;
  if (d < a) { const u = Math.sin((d / a) * Math.PI * 0.5); return { back: 0, hop: 0, sx: 1 + 0.25 * u, sy: 1 - 0.25 * u, rot: 0 }; }
  if (d < b) {
    const u = (d - a) / MISS.hopMs;
    const s = Math.sin(u * Math.PI);
    // Squashed to stretched in the first third of the hop, then back to round before it lands.
    const k = clamp01(u * 3), r = clamp01((u - 0.66) / 0.34);
    return { back: easeInOut3(u), hop: MISS.hopPt * s, sx: 1.25 - 0.4 * k + 0.15 * r, sy: 0.75 + 0.4 * k - 0.15 * r, rot: -10 * s };
  }
  if (d < c) { const u = Math.sin(((d - b) / MISS.landMs) * Math.PI); return { back: 1, hop: 0, sx: 1 + 0.18 * u, sy: 1 - 0.18 * u, rot: 0 }; }
  if (d < e) { const u = (d - c) / MISS.shakeMs; return { back: 1, hop: 0, sx: 1, sy: 1, rot: 12 * Math.sin(u * Math.PI * 4) * (1 - u) }; }
  return { back: 1, hop: 0, sx: 1, sy: 1, rot: 0 };
}

/** The dotted "come closer" ring `d` ms after the server's no: it pulls in twice and turns slowly; null when gone. Worklet. */
export function missRingAt(d: number): { scale: number; opacity: number; rot: number } | null {
  'worklet';
  const l = d - MISS.ringAt;
  if (l < 0 || l >= MISS.ringMs) return null;
  const per = MISS.ringMs / MISS.rings;
  const u = (l % per) / per;
  const s = 1 - (1 - u) * (1 - u);
  const fade = l > MISS.ringMs - 200 ? (MISS.ringMs - l) / 200 : 1;
  return { scale: 1.9 - 0.9 * s, opacity: (u < 0.2 ? u / 0.2 : 1) * fade * 0.95, rot: l * 0.03 };
}

/* Round 5: the catch's hand-inked sunburst (CatchRays draws it once with Skia). */
export const CATCH_RAY_COUNT = 16;

/** Deterministic wobble per ray (0..1), so every catch draws the same hand-made fan. */
function wob(i: number, k: number): number {
  const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** One ray's outline (pure, unit tested): a tapered, slightly bent spike from r0 to its tip. */
export function catchRayShape(i: number, size: number): { angle: number; r0: number; len: number; half: number; bend: number } {
  const long = i % 2 === 0;
  const angle = (i / CATCH_RAY_COUNT) * Math.PI * 2 + (wob(i, 1) - 0.5) * 0.08;
  const r0 = size * 0.11;
  const len = (size / 2) * (long ? 0.9 : 0.64) * (0.9 + 0.1 * wob(i, 2));
  const half = (long ? 17 : 11) * (0.85 + 0.3 * wob(i, 3)) * (size / 320);
  const bend = (wob(i, 4) - 0.5) * 7 * (size / 320);
  return { angle, r0, len, half, bend };
}

/* ------------------------------------------------- the controls coming back */

/** Round 4: map controls return after a catch in STAGGER slots, each popping from 0.85 (see catchPresence). */
export const CHROME_BACK = { stepMs: 60, popMs: 260, fadeMs: 110, from: 0.85, slots: 4 } as const;


/**
 * A map control's fade and pop for its stagger slot (0 first): hidden while a catch plays (from the tap
 * frame), then back in its own window as the catch ends. Worklet; slot 0 is the HUD's close goal (the
 * free-Ticket pips), so the catch always ends pointing at the next goal.
 */
export function chromeBack(slot: number, shown: number, dim: number, back: number): { opacity: number; scale: number } {
  'worklet';
  if (!back || shown > 0.001) return { opacity: Math.max(0, 1 - Math.max(shown, dim) * 1.6), scale: 1 };
  const t = (1 - dim) * (CHROME_BACK.stepMs * (CHROME_BACK.slots - 1) + CHROME_BACK.popMs) - slot * CHROME_BACK.stepMs;
  if (t <= 0) return { opacity: 0, scale: CHROME_BACK.from };
  const u = Math.min(1, t / CHROME_BACK.popMs);
  // A spring from 0.85 with one small overshoot (about 1.03, PRESS.overshoot).
  const wave = u >= 1 ? 0 : Math.exp(-4 * u) * Math.cos(2.3 * Math.PI * u) * (1 - u);
  return { opacity: Math.min(1, t / CHROME_BACK.fadeMs), scale: 1 - (1 - CHROME_BACK.from) * wave };
}

