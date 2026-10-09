import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../ui';

/**
 * The Daily 3 flame badge for other screens (Profile, a player's page, friend
 * rows, Standings rows): Alex's streak flame with the day count in a white
 * pill. Lit while the streak is alive; with no streak it shows the best
 * streak in a calm grey pill (or nothing when there is none).
 *
 * Cheap: one UI-thread flicker that plays twice on mount and then rests
 * (no endless loop in long lists). `still` skips it entirely.
 *
 * Feed it `daily3_streak` / `daily3_best` (friends list) or the Daily 3 state.
 */
export default function StreakFlame({ streak, best = 0, size = 28, still = false }: {
  readonly streak: number;
  readonly best?: number;
  readonly size?: number;
  readonly still?: boolean;
}) {
  const reduced = useReducedGameMotion();
  const t = useSharedValue(0);
  const lit = streak > 0;
  useEffect(() => {
    if (!lit || still || reduced) return;
    t.value = withDelay(200, withRepeat(withSequence(
      withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 360, easing: Easing.inOut(Easing.sin) }),
    ), 2));
    return () => cancelAnimation(t);
  }, [lit, still, reduced, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.value * 0.14 }, { rotate: `${t.value * -6}deg` }] }));
  if (!lit && best < 2) return null;
  const label = lit ? `${streak} day flame` : `Best flame ${best} days`;
  const pill = Math.max(16, Math.round(size * 0.62));
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <Animated.View style={[!lit && styles.resting, style]}>
        <GameIcon name="streak" size={size} />
      </Animated.View>
      <View style={[styles.pill, { height: pill, minWidth: pill, borderRadius: pill / 2, marginLeft: -size * 0.28 }, !lit && styles.pillBest]}>
        <Text style={[styles.text, { fontSize: Math.round(pill * 0.62) }, !lit && styles.textBest]} allowFontScaling={false}>
          {lit ? streak : `Best ${best}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  resting: { opacity: 0.55 },
  pill: { backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  pillBest: { backgroundColor: '#e3eef8', borderColor: '#6d8fb0' },
  text: { fontFamily: 'Shark', color: BRAND.navy, marginTop: 1 },
  textBest: { color: '#3d5f8c' },
});
