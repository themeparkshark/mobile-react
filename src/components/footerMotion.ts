/**
 * The footer's pick-a-tab bounce, shared by every screen's footer.
 *
 * Each tab screen renders its own Wrapper, so the old footer gets the tap and a
 * new footer appears a moment later. The motion lives in module-level shared
 * values: the new footer picks up the same hop, glow and spin mid-flight on the
 * UI thread, and it reads as one footer that never left.
 *
 * Pick a tab: the icon squashes wide (1.15 by 0.88, the anticipation), then hops 11 pt and pops 1 to 1.25 to 1 (SPRING.pop), its label
 * lifts into place, a warm sunlight glow slides from the old tab to the new one
 * (SPRING.settle) and fades out, a gold ring with a soft gold disc pulses out under the new icon
 * with four little stars, and the old icon dips to 0.92 and back. The big compass (the map) gets its own flourish:
 * a squash (anticipation), the pop, a small wobble that pivots on its base (its
 * baked shadow never swings), a white glint and nine gold star sparkles that clear its rim. Every
 * fifth compass pick is the rare one: twelve bigger stars fly high over the footer wave with a second,
 * wider gold ring (one burst, still inside the sparkle cap). Tapping
 * the tab you are on gives a small wiggle instead. At rest every value is
 * identity, so the footer looks exactly as it always has.
 */
import { cancelAnimation, makeMutable, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { EASE, DURATION, SPRING } from '../ui/motionEasing';

/** The five tabs in footer order. The center one (index 2) is the compass. */
export const FOOTER_TABS = ['News', 'Leaderboard', 'Explore', 'Social', 'Profile'] as const;
export const COMPASS_INDEX = 2;

/** The footer choreography numbers (pure data, unit tested). */
export const FOOTER_MOTION = {
  /** Small icons hop high enough to feel (10 to 12 pt); the big compass hops less, it squashes and wobbles too. */
  hopPt: 11,
  compassHopPt: 8,
  popScale: 1.25,
  sinkScale: 0.92,
  labelLiftPt: 2,
  labelMs: DURATION.quick,
  glowPeak: 1,
  glowHoldMs: 520,
  glowFadeMs: 300,
  /** Anticipation for every pick: squash wide and short before the pop (the compass and the small icons). */
  compassSquashMs: 80,
  compassSquashX: 0.15,
  compassSquashY: 0.12,
  /** The compass wobble (degrees), pivoting on its base. */
  compassWobbleDeg: 8,
  /** The gold ring that pulses off a picked icon (with a soft gold disc under it). */
  ringMs: 560,
  ringFrom: 0.7,
  ringTo: 1.9,
  ringDiscPeak: 0.78,
  /** The ring stays at full brightness for this share of its pulse before it fades (a crisp edge you can see). */
  ringHold: 0.35,
  /** Sparkles off the compass (before the power budget). */
  compassSparkles: 9,
  /** Little stars off a small icon's pick. */
  smallSparkles: 6,
  smallDist: [32, 52] as readonly [number, number],
  smallSize: [14, 20] as readonly [number, number],
  /** The rare compass pick: one bigger burst (replaces the normal one, so it stays inside the cap). */
  rareSparkles: 10,
  /**
   * Two fans of big inked gold stars, up and out over the footer wave (rareFanFrom to rareFanTo degrees above
   * the horizon), short enough that they stay clear of the STANDINGS label and the Social icon below them and
   * low enough that they never reach the cards: five left, five right, big enough to read at arm's length.
   */
  rareFanFrom: 30,
  rareFanTo: 72,
  rareDist: [62, 96] as readonly [number, number],
  rareSize: [32, 40] as readonly [number, number],
  /**
   * The alternate rare: a TPS shark leaps out of the footer wave at swimEnter (share of the width) with a splash
   * ring, swims along the crest over the icons and dives back in at swimLeave with a second splash (ms across).
   */
  swimMs: 1900,
  swimPt: 60,
  swimEnter: 0.08,
  swimLeave: 0.92,
  /** The wave's crest (pt from the top of the icon row) and how high over it the shark swims. */
  swimCrestY: -4,
  swimLiftPt: 26,
  /** Each splash ring grows and fades over this share of the swim. */
  swimSplashSpan: 0.18,
  /** The rare pick's shock ring grows this far (times its size) and a sun glow blooms under the compass. */
  rareRingTo: 3.6,
  rareSunPeak: 0.85,
  glintDelayMs: 160,
  glintMs: 500,
  wiggleScale: 1.08,
  wiggleDeg: 7,
} as const;

/** Which tab index a route is, or -1 when it is not a footer tab. */
export function footerIndex(route: string | undefined | null): number {
  if (!route) return -1;
  return (FOOTER_TABS as readonly string[]).indexOf(route);
}

/** What a tap on tab `to` does when the player is on tab `from` (-1 for a non-tab screen). */
export function footerTapKind(from: number, to: number): 'select' | 'reselect' | 'none' {
  if (to < 0 || to >= FOOTER_TABS.length) return 'none';
  return from === to ? 'reselect' : 'select';
}

export const footerMotion = {
  hopIndex: makeMutable(-1),
  hopY: makeMutable(0),
  hopScale: makeMutable(1),
  hopRotate: makeMutable(0),
  sinkIndex: makeMutable(-1),
  sinkScale: makeMutable(1),
  labelLift: makeMutable(0),
  labelOpacity: makeMutable(1),
  glowX: makeMutable(0),
  glowOpacity: makeMutable(0),
  /** Compass squash amount: 1 is wide and short, a spring back through 0 overshoots into a small stretch. */
  compassSquash: makeMutable(0),
  /** Compass wobble (degrees), pivoting on the base. */
  compassWobble: makeMutable(0),
  /** The gold ring off the picked icon (0 to 1, one shot). */
  ring: makeMutable(0),
  /** The compass sparkle burst (0 to 1, one shot). */
  burst: makeMutable(0),
  glint: makeMutable(0),
  /** The rare burst: every RARE_EVERY-th compass pick throws a big ring of stars instead of the normal one. */
  burstRare: makeMutable(0),
  /** A small icon's four stars (0 to 1, one shot). */
  burstSmall: makeMutable(0),
  /** The rare pick's wide gold shock ring (0 to 1, one shot). */
  ringRare: makeMutable(0),
  /** The alternate rare: the little shark's swim along the footer (0 to 1, one shot). */
  swim: makeMutable(0),
  /** Reaches 1 on the rare pick's burst frame: the footer answers in the hand then (UI thread, no JS timer). */
  rareBuzz: makeMutable(0),
};

/**
 * The rare compass pick comes after these many picks in turn (4, then 7, then 5, then 6, and round again):
 * always the same for everyone (no luck involved), but not a beat a kid can count.
 */
export const RARE_GAPS = [4, 7, 5, 6] as const;
/** The average gap (kept for anything that asks how often). */
export const RARE_EVERY = 5;
let compassPicks = 0;
let rarePicks = 0;
/** Which rare pick this is (1, 2, 3...): each one lays its stars out a little differently, so the 50th still surprises. */
export const rarePickCount = makeMutable(0);
/** The star layout seed for rare pick n: a new pattern each time, cycling through a handful. Pure (unit tested). */
export function rareSeed(n: number): number {
  'worklet';
  return 7 + (Math.max(0, n) % 6) * 5;
}
/** Whether compass pick number n (1-based) is a rare one. Pure (unit tested). */
export function isRareCompassPick(n: number): boolean {
  if (!(n > 0)) return false;
  let at = 0;
  for (let k = 0; at < n; k++) at += RARE_GAPS[k % RARE_GAPS.length];
  return at === n;
}
/**
 * The swim-by shark at swim progress p (0 to 1): its centre (pt, in the icon row), tilt and opacity. Under the crest
 * at both ends (it leaps out, nose up, and dives back in, nose down), over it in between, with a small bob.
 * Pure worklet (unit tested).
 */
export function footerSwimAt(p: number, width: number, pt: number): { x: number; y: number; rot: number; opacity: number } {
  'worklet';
  const F = FOOTER_MOTION;
  const x = width * (F.swimEnter + (F.swimLeave - F.swimEnter) * p);
  const up = Math.min(1, Math.sin(Math.PI * p) * 1.8);
  const y = F.swimCrestY + pt * 0.35 - (pt * 0.35 + F.swimLiftPt) * up + Math.sin(p * Math.PI * 6) * 5 * up;
  const rot = -28 * Math.cos(Math.PI * p) + Math.cos(p * Math.PI * 6) * 6 * up;
  const opacity = p <= 0 || p >= 1 ? 0 : p < 0.06 ? p / 0.06 : p > 0.94 ? (1 - p) / 0.06 : 1;
  return { x, y, rot, opacity };
}

/** What rare pick number r (1-based) is: every third one is the shark swimming by, the rest are star fans. Pure. */
export function rareKind(r: number): 'stars' | 'swim' {
  return r > 0 && r % 3 === 0 ? 'swim' : 'stars';
}

/** Start the footer bounce for a tap on tab `to` from tab `from`. Does nothing with Reduce Motion. */
export function playFooterTap(from: number, to: number, reduced: boolean): { rare: boolean } {
  const kind = footerTapKind(from, to);
  if (kind === 'none' || reduced) return { rare: false };
  const m = footerMotion;
  const F = FOOTER_MOTION;
  cancelAnimation(m.hopY); cancelAnimation(m.hopScale); cancelAnimation(m.hopRotate);
  m.hopIndex.value = to;
  if (kind === 'reselect') {
    m.hopY.value = 0;
    m.hopScale.value = withSequence(withTiming(F.wiggleScale, { duration: 80, easing: EASE.out }), withSpring(1, SPRING.pop));
    m.hopRotate.value = withSequence(
      withTiming(-F.wiggleDeg, { duration: 60 }), withTiming(F.wiggleDeg, { duration: 90 }),
      withTiming(-F.wiggleDeg / 2, { duration: 80 }), withSpring(0, SPRING.stamp));
    return { rare: false };
  }
  m.hopRotate.value = 0;
  // Every pick: a quick squash wide and short (anticipation), then the hop and the pop.
  cancelAnimation(m.compassSquash);
  m.compassSquash.value = withSequence(
    withTiming(1, { duration: F.compassSquashMs, easing: EASE.charge }), withSpring(0, SPRING.pop));
  m.hopY.value = withDelay(F.compassSquashMs, withSequence(
    withTiming(-F.hopPt, { duration: 110, easing: EASE.out }), withSpring(0, SPRING.pop)));
  m.hopScale.value = withDelay(F.compassSquashMs, withSequence(
    withTiming(F.popScale, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
  // The label lifts 2 pt into its spot and fades up.
  m.labelLift.value = F.labelLiftPt;
  m.labelOpacity.value = 0.35;
  m.labelLift.value = withTiming(0, { duration: F.labelMs, easing: EASE.out });
  m.labelOpacity.value = withTiming(1, { duration: F.labelMs, easing: EASE.out });
  // The old tab dips and settles.
  cancelAnimation(m.sinkScale);
  m.sinkIndex.value = from;
  m.sinkScale.value = from >= 0
    ? withSequence(withTiming(F.sinkScale, { duration: 90, easing: EASE.out }), withSpring(1, SPRING.settle))
    : 1;
  // The gold glow slides from the old tab to the new one, then fades away (nothing stays lit at rest).
  cancelAnimation(m.glowX); cancelAnimation(m.glowOpacity);
  if (from < 0) m.glowX.value = to;
  else m.glowX.value = withSpring(to, SPRING.settle);
  m.glowOpacity.value = withSequence(
    withTiming(F.glowPeak, { duration: 90, easing: EASE.out }),
    withDelay(F.glowHoldMs, withTiming(0, { duration: F.glowFadeMs, easing: EASE.in })));
  // A thin gold ring pulses off the new icon.
  cancelAnimation(m.ring);
  m.ring.value = 0;
  m.ring.value = withDelay(F.compassSquashMs + 40, withTiming(1, { duration: F.ringMs, easing: EASE.out }));
  if (to !== COMPASS_INDEX) {
    cancelAnimation(m.burstSmall);
    m.burstSmall.value = 0;
    m.burstSmall.value = withDelay(F.compassSquashMs + 60, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
  }
  if (to === COMPASS_INDEX) {
    // The compass: squash (anticipation), then the hop and pop, a wobble on its base, a glint and sparkles.
    cancelAnimation(m.compassWobble); cancelAnimation(m.glint); cancelAnimation(m.burst);
    m.hopY.value = withDelay(F.compassSquashMs, withSequence(
      withTiming(-F.compassHopPt, { duration: 110, easing: EASE.out }), withSpring(0, SPRING.pop)));
    m.hopScale.value = withDelay(F.compassSquashMs, withSequence(
      withTiming(F.popScale, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
    const w = F.compassWobbleDeg;
    m.compassWobble.value = withDelay(F.compassSquashMs + 110, withSequence(
      withTiming(-w, { duration: 70, easing: EASE.out }), withTiming(w * 0.75, { duration: 100, easing: EASE.inOut }),
      withTiming(-w * 0.35, { duration: 90, easing: EASE.inOut }), withSpring(0, SPRING.stamp)));
    m.glint.value = 0;
    m.glint.value = withDelay(F.glintDelayMs, withTiming(1, { duration: F.glintMs, easing: EASE.inOut }, done => {
      if (done) m.glint.value = 0;
    }));
    compassPicks += 1;
    const rare = isRareCompassPick(compassPicks);
    cancelAnimation(m.burstRare); cancelAnimation(m.ringRare);
    m.burst.value = 0;
    m.burstRare.value = 0;
    m.ringRare.value = 0;
    // The rare pick throws one big burst instead of the normal one (never two bursts at once).
    const burst = withDelay(F.compassSquashMs + 60, withTiming(1, { duration: rare ? DURATION.sparkle + 200 : DURATION.sparkle, easing: EASE.out }));
    if (rare) {
      rarePicks += 1;
      rarePickCount.value = rarePicks;
      // Star fans on most rare picks; every third one, the little shark swims along the footer instead.
      if (rareKind(rarePicks) === 'swim') {
        m.burst.value = burst;
        cancelAnimation(m.swim);
        m.swim.value = 0;
        m.swim.value = withDelay(F.compassSquashMs + 80, withTiming(1, { duration: F.swimMs, easing: EASE.inOut }));
      } else {
        m.burstRare.value = burst;
      }
      m.ringRare.value = withDelay(F.compassSquashMs + 100, withTiming(1, { duration: F.ringMs + 240, easing: EASE.out }));
      cancelAnimation(m.rareBuzz);
      m.rareBuzz.value = 0;
      m.rareBuzz.value = withDelay(RARE_HAPTIC_AT, withTiming(1, { duration: 0 }));
    } else {
      m.burst.value = burst;
    }
    return { rare };
  }
  return { rare: false };
}

/** The rare compass pick answers in the hand a beat after the press tick, on its burst (ms after the tap). */
export const RARE_HAPTIC_AT = FOOTER_MOTION.compassSquashMs + 60;

// Dev only: the lane captures can play a footer pick over the debugger (the map screen freezes dev JS in a busy simulator).
// Release-like timing captures too (EXPO_PUBLIC_MOTION_CAPTURE, never set in store builds).
if ((typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_MOTION_CAPTURE) {
  (globalThis as { __playFooterTap?: typeof playFooterTap }).__playFooterTap = playFooterTap;
}
