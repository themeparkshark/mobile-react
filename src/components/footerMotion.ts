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
  ringDiscPeak: 0.55,
  /** Sparkles off the compass (before the power budget). */
  compassSparkles: 9,
  /** Little stars off a small icon's pick. */
  smallSparkles: 4,
  /** The rare compass pick: one bigger burst (replaces the normal one, so it stays inside the cap). */
  rareSparkles: 12,
  rareDist: [96, 150] as readonly [number, number],
  rareSize: [20, 28] as readonly [number, number],
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
};

/** Every this many compass picks, the flourish is a little bigger (a small surprise on the tenth tap). */
export const RARE_EVERY = 5;
let compassPicks = 0;
/** Whether compass pick number n (1-based) is a rare one. Pure (unit tested). */
export function isRareCompassPick(n: number): boolean {
  return n > 0 && n % RARE_EVERY === 0;
}

/** Start the footer bounce for a tap on tab `to` from tab `from`. Does nothing with Reduce Motion. */
export function playFooterTap(from: number, to: number, reduced: boolean): void {
  const kind = footerTapKind(from, to);
  if (kind === 'none' || reduced) return;
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
    return;
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
      m.burstRare.value = burst;
      m.ringRare.value = withDelay(F.compassSquashMs + 100, withTiming(1, { duration: F.ringMs + 240, easing: EASE.out }));
    } else {
      m.burst.value = burst;
    }
  }
}
