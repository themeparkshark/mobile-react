import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import { BRAND, GameIcon, SHADOW } from '../../ui';
import type { ButtonAttention } from '../../services/retention/logic';

/**
 * Daily 3 on the map, in the same column and style as the recenter and chest
 * buttons. One glance: the streak flame and its number, three pips (one per
 * goal) and one attention state. Loops run on the UI thread and stop when the
 * map is not on screen (`active`) or motion is reduced.
 */
export default function Daily3MapButton({ pips, streak, attention, onPress, popIndex, popKey, active, reducedMotion }: {
  readonly pips: readonly boolean[];
  readonly streak: number;
  readonly attention: ButtonAttention;
  readonly onPress: () => void;
  /** A pip that just turned done (index), replayed whenever popKey changes. */
  readonly popIndex: number | null;
  readonly popKey: number;
  readonly active: boolean;
  readonly reducedMotion: boolean;
}) {
  const bounce = useSharedValue(0);
  const flicker = useSharedValue(0);
  const pop = useSharedValue(0);
  const ready = attention === 'claim' || attention === 'weekly';

  useEffect(() => {
    cancelAnimation(bounce); cancelAnimation(flicker);
    bounce.value = 0; flicker.value = 0;
    if (!active || reducedMotion) return;
    if (ready) {
      // A hop every ~2.4 s: noticeable from across the map, never frantic.
      bounce.value = withRepeat(withSequence(
        withTiming(-7, { duration: 180, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 6, stiffness: 260 }),
        withDelay(1800, withTiming(0, { duration: 1 })),
      ), -1);
    } else if (attention === 'risk') {
      flicker.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
    return () => { cancelAnimation(bounce); cancelAnimation(flicker); };
  }, [active, reducedMotion, ready, attention, bounce, flicker]);

  useEffect(() => {
    if (popIndex === null || popKey === 0) return;
    pop.value = 0;
    pop.value = reducedMotion ? 1 : withSequence(withTiming(1, { duration: 160 }), withDelay(500, withTiming(0, { duration: 260 })));
  }, [popKey, popIndex, reducedMotion, pop]);

  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }] }));
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + flicker.value * 0.12 }, { rotate: `${(flicker.value - 0.5) * 8}deg` }] }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.9 }] }));
  const done = pips.filter(Boolean).length;
  const label = ready ? 'Daily 3: a reward is ready to open'
    : `Daily 3: ${done} of 3 done${streak > 0 ? `, ${streak} day streak` : ''}`;

  return (
    <Animated.View style={buttonStyle}>
      <Pressable onPress={() => { haptic('tapLight'); onPress(); }} accessibilityRole="button" accessibilityLabel={label}
        hitSlop={6} style={({ pressed }) => [styles.button, ready && styles.buttonReady, pressed && styles.pressed]}>
        <Animated.View style={flameStyle}>
          <GameIcon name={ready ? 'chest' : 'streak'} size={ready ? 34 : 30} />
        </Animated.View>
        <View style={styles.pips} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {pips.map((on, i) => (
            <Animated.View key={i} style={[styles.pip, on && styles.pipOn, i === popIndex && popStyle]} />
          ))}
        </View>
      </Pressable>
      {streak > 0 && !ready && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText} allowFontScaling={false}>{streak}</Text>
        </View>
      )}
      {ready && <View style={styles.dot} pointerEvents="none" />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.blueBright, borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  buttonReady: { borderColor: BRAND.gold },
  pressed: { transform: [{ scale: 0.94 }] },
  pips: { position: 'absolute', bottom: -6, flexDirection: 'row', gap: 3 },
  pip: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#9fc9ea', borderWidth: 2, borderColor: BRAND.white },
  pipOn: { backgroundColor: BRAND.gold },
  badge: { position: 'absolute', top: -5, right: -7, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11,
    backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.navy, marginTop: 1 },
  dot: { position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: 8,
    backgroundColor: BRAND.red, borderWidth: 2.5, borderColor: BRAND.white },
});
