/**
 * A warm crew, without chat: the crew strip's badges come alive.
 *
 * JOIN: a player who joins the crew drops into their seat from above
 * (SPRING.land), waves twice (0 to 15 degrees and back) and a gold "+1" bubble
 * rises and fades over 900 ms. Players who join together arrive 80 ms apart.
 * One tick buzz for the join (yours, on your phone).
 * STARS: when a player earns stars in a round, three solid gold hearts with a
 * white outline pop from their badge (past full size, then settle), rise in a
 * fan with a sideways drift over 1.2 s, a sparkle twinkles on the badge and the
 * badge bobs once.
 * Nobody else's stars ever buzz the phone (rival and other players' events are
 * quiet), and there is no sound for them either.
 *
 * Motion only: the badge keeps its exact place in the row (transforms on a
 * wrapper, the hearts and the bubble float in an absolute layer above it), so
 * the strip looks the same at rest. UI thread only (Reanimated); one-shot, no
 * loops. Reduce Motion: no travel, the badge is simply there.
 */
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { queueHaptic } from '../../../gamekit/Haptics';
import { playMoment } from '../../../gamekit/audio/playMoment';
import { GameIcon } from '../../../ui';
import { BRAND } from '../../../ui/tokens';
import { EASE, SPRING } from '../../../ui/motionEasing';

/** The crew moments' beat sheet (ms), pure numbers so tests can read them. */
export const CREW_FX = {
  dropPt: 20,
  waveDeg: 15,
  waveMs: 500,
  plusOneMs: 900,
  joinStaggerMs: 80,
  heartsMs: 1200,
  hearts: 3,
} as const;

export const CrewBadgeFx = memo(function CrewBadgeFx({ joinOrder, starsKey, reduced, children }: {
  /** Null when this badge was already in the crew; otherwise its place among the players joining now (0, 1, ...). */
  readonly joinOrder: number | null;
  /** Changes when this player earns stars (their running total); the first value never celebrates. */
  readonly starsKey: number;
  readonly reduced: boolean;
  readonly children: ReactNode;
}) {
  // Only the order at mount matters (a badge is keyed by its player, so a new player mounts a new badge).
  const join = useRef(joinOrder).current;
  const drop = useSharedValue(join != null && !reduced ? 0 : 1);
  const wave = useSharedValue(0);
  const plus = useSharedValue(0);
  const hearts = useSharedValue(0);
  const bob = useSharedValue(0);
  const lastStars = useRef(starsKey);

  useEffect(() => {
    if (join == null || reduced) return undefined;
    const delay = join * CREW_FX.joinStaggerMs;
    drop.value = 0;
    drop.value = withDelay(delay, withSpring(1, SPRING.land));
    const half = CREW_FX.waveMs / 4;
    wave.value = withDelay(delay + 180, withSequence(
      withTiming(1, { duration: half, easing: EASE.out }), withTiming(0, { duration: half, easing: EASE.inOut }),
      withTiming(1, { duration: half, easing: EASE.inOut }), withTiming(0, { duration: half, easing: EASE.in })));
    plus.value = withDelay(delay + 120, withTiming(1, { duration: CREW_FX.plusOneMs, easing: EASE.out }));
    // One tick for the join, only for the first of a group arriving together.
    if (join === 0) { queueHaptic('tickSelection'); playMoment('ui.toast'); }
    return () => { [drop, wave, plus].forEach(v => cancelAnimation(v)); };
    // One-shot per join (on mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const before = lastStars.current;
    lastStars.current = starsKey;
    if (reduced || starsKey <= before) return undefined;
    // Hearts for a good round: quiet (never a buzz or a sound for another player's moment).
    hearts.value = 0;
    hearts.value = withTiming(1, { duration: CREW_FX.heartsMs, easing: EASE.out });
    bob.value = withSequence(withTiming(1, { duration: 140, easing: EASE.out }), withSpring(0, SPRING.stamp));
    return () => { cancelAnimation(hearts); cancelAnimation(bob); };
  }, [starsKey, reduced, hearts, bob]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 2.5),
    transform: [
      { translateY: -CREW_FX.dropPt * (1 - drop.value) - 5 * bob.value },
      { rotate: `${CREW_FX.waveDeg * wave.value}deg` },
      { scale: 1 + 0.12 * bob.value },
    ],
  }));
  const plusStyle = useAnimatedStyle(() => {
    const t = plus.value;
    if (t <= 0 || t >= 1) return { opacity: 0 };
    // Pops in past full size (SPRING.pop feel), then rises and fades.
    const pop = t < 0.18 ? 0.6 + 0.65 * (t / 0.18) : t < 0.3 ? 1.25 - 0.25 * ((t - 0.18) / 0.12) : 1;
    return { opacity: t < 0.12 ? t / 0.12 : t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45, transform: [{ translateY: -30 * t }, { scale: pop }] };
  });

  const sparkStyle = useAnimatedStyle(() => {
    // A sparkle twinkles on the badge as the hearts leave it (one quick pop and turn).
    const k = hearts.value / 0.28;
    if (k <= 0 || k >= 1) return { opacity: 0 };
    return { opacity: k < 0.7 ? 1 : (1 - k) / 0.3, transform: [{ scale: k < 0.35 ? 1.3 * (k / 0.35) : 1.3 - 0.5 * ((k - 0.35) / 0.65) }, { rotate: `${90 * k}deg` }] };
  });

  return <View>
    <Animated.View style={badgeStyle}>{children}</Animated.View>
    <Animated.View pointerEvents="none" style={[styles.spark, sparkStyle]}><GameIcon name="sparkle" size={SPARK_SIZE} /></Animated.View>
    <View pointerEvents="none" style={styles.float}>
      <Animated.View style={[styles.plus, plusStyle]}><Text style={styles.plusText} allowFontScaling={false}>+1</Text></Animated.View>
      {Array.from({ length: CREW_FX.hearts }, (_, i) => <Heart key={i} index={i} t={hearts} />)}
    </View>
  </View>;
});

function Heart({ index, t }: { readonly index: number; readonly t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    // Each heart leaves a beat after the one before: it pops past full size (0.4 to 1.25, then 1), rises in a fan
    // (left, up, right) on its own sine drift, and stays solid until it is nearly gone.
    const k = (t.value - index * 0.12) / 0.72;
    if (k <= 0 || k >= 1) return { opacity: 0 };
    const pop = k < 0.12 ? 0.4 + 0.85 * (k / 0.12) : k < 0.24 ? 1.25 - 0.25 * ((k - 0.12) / 0.12) : 1;
    return {
      opacity: k < 0.08 ? k / 0.08 : k < 0.7 ? 1 : (1 - k) / 0.3,
      transform: [{ translateX: (index - 1) * HEART_FAN * Math.min(1, k * 1.6) + 5 * Math.sin(k * Math.PI * 2 + index) },
        { translateY: -HEART_RISE * k }, { rotate: `${(index - 1) * 12 * Math.min(1, k * 2)}deg` }, { scale: pop }],
    };
  });
  // A solid gold heart on a white one a little bigger: a clean white outline that reads on the blue rail.
  return <Animated.View style={[styles.heart, style]}>
    <GameIcon name="heart" size={HEART_SIZE + HEART_OUTLINE * 2} mono={BRAND.white} />
    <View style={styles.heartInk}><GameIcon name="heart" size={HEART_SIZE} mono={HEART_GOLD} /></View>
  </Animated.View>;
}

/** Gold, never red (red reads as a miss). Big enough to read at a glance (and on a contact sheet). */
const HEART_GOLD = '#ffc928';
export const HEART_SIZE = 30;
/** The white rim around each heart (pt per side). */
const HEART_OUTLINE = 3;
/** How far the outer hearts fan out sideways, and how high they all rise (pt). */
const HEART_FAN = 24;
const HEART_RISE = 58;
const SPARK_SIZE = 22;
/** The "+1" is at least 22 pt tall. */
export const PLUS_FONT = 20;

const styles = StyleSheet.create({
  // Wider than the 28 pt badge, so the +1 bubble never wraps into a sliver; centred on the badge.
  float: { position: 'absolute', left: -30, right: -30, top: -4, alignItems: 'center' },
  plus: { position: 'absolute', top: -26, minHeight: 28, minWidth: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.gold, borderRadius: 14,
    borderWidth: 2.5, borderColor: BRAND.white, paddingHorizontal: 7,
    shadowColor: BRAND.navy, shadowOpacity: 0.35, shadowOffset: { width: 0, height: 2 }, shadowRadius: 0 },
  plusText: { fontFamily: 'Shark', fontSize: PLUS_FONT, lineHeight: 23, color: BRAND.navy },
  heart: { position: 'absolute', top: -14, alignItems: 'center', justifyContent: 'center' },
  heartInk: { position: 'absolute' },
  spark: { position: 'absolute', right: -8, top: -8 },
});
