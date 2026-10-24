/**
 * A warm crew, without chat: the crew strip's badges come alive.
 *
 * JOIN: a player who joins the crew drops into their seat from above
 * (SPRING.land), waves twice (0 to 15 degrees and back) and a gold "+1" bubble
 * rises and fades over 900 ms. Players who join together arrive 80 ms apart.
 * One tick buzz for the join (yours, on your phone).
 * STARS: when a player earns stars in a round, three small gold hearts float up
 * from their badge with a sideways drift over 1.2 s, and the badge bobs once.
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

  return <View>
    <Animated.View style={badgeStyle}>{children}</Animated.View>
    <View pointerEvents="none" style={styles.float}>
      <Animated.View style={[styles.plus, plusStyle]}><Text style={styles.plusText} allowFontScaling={false}>+1</Text></Animated.View>
      {Array.from({ length: CREW_FX.hearts }, (_, i) => <Heart key={i} index={i} t={hearts} />)}
    </View>
  </View>;
});

function Heart({ index, t }: { readonly index: number; readonly t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    // Each heart leaves a beat after the one before and drifts on its own sine.
    const k = (t.value - index * 0.15) / 0.7;
    if (k <= 0 || k >= 1) return { opacity: 0 };
    return {
      opacity: k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85,
      transform: [{ translateX: (index - 1) * 12 + 7 * Math.sin(k * Math.PI * 2 + index) }, { translateY: -48 * k }, { scale: 0.7 + 0.4 * k }],
    };
  });
  return <Animated.View style={[styles.heart, style]}><GameIcon name="heart" size={HEART_SIZE} mono={HEART_GOLD} /></Animated.View>;
}

/** Gold, never red (red reads as a miss). Big enough to read at a glance (and on a contact sheet). */
const HEART_GOLD = '#ffc928';
export const HEART_SIZE = 22;
/** The "+1" is at least 22 pt tall. */
export const PLUS_FONT = 20;

const styles = StyleSheet.create({
  float: { position: 'absolute', left: 0, right: 0, top: -4, alignItems: 'center' },
  plus: { position: 'absolute', top: -26, minHeight: 28, justifyContent: 'center', backgroundColor: BRAND.gold, borderRadius: 14,
    borderWidth: 2.5, borderColor: BRAND.white, paddingHorizontal: 7,
    shadowColor: BRAND.navy, shadowOpacity: 0.35, shadowOffset: { width: 0, height: 2 }, shadowRadius: 0 },
  plusText: { fontFamily: 'Shark', fontSize: PLUS_FONT, lineHeight: 23, color: BRAND.navy },
  heart: { position: 'absolute', top: -6 },
});
