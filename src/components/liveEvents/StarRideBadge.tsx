import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../ui';
import { useEventAmbient } from '../../services/liveEvents/ambient';

/**
 * A Star Ride: a star with "x2" that sits on the ride coin marker itself
 * (top right), so the coin stays the hero and no extra ring goes on the map.
 * The twinkle is a UI-thread scale that stops when `paused` (marker parked,
 * off-screen) and under reduced motion.
 */
function StarRideBadge({ size = 22, paused = false, times = 2 }: { readonly size?: number; readonly paused?: boolean; readonly times?: number }) {
  const reduced = useReducedGameMotion();
  const t = useSharedValue(0);
  const still = paused || reduced || !useEventAmbient().ambient;
  useEffect(() => {
    if (still) { cancelAnimation(t); t.value = 0; return; }
    t.value = withRepeat(withSequence(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 900 })), -1, false);
    return () => cancelAnimation(t);
  }, [still, t]);
  const starStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.14 * t.value }, { rotate: `${t.value * 12}deg` }] }));
  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={starStyle}><GameIcon name="star" size={size} /></Animated.View>
      <View style={styles.tag}><Text style={styles.tagText}>x{times}</Text></View>
    </View>
  );
}

export default memo(StarRideBadge);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  tag: { marginTop: -5, backgroundColor: BRAND.navy, borderRadius: 7, borderWidth: 1.5, borderColor: BRAND.white, paddingHorizontal: 4, paddingVertical: 0 },
  tagText: { fontFamily: 'Shark', fontSize: 10, color: BRAND.gold },
});
