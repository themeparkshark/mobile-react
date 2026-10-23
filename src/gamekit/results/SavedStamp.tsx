/**
 * SavedStamp: the gold RUN SAVED stamp every results card shares.
 *
 * A queue event (the ride came up) saved this run before its first star. The
 * stamp thumps in where the stars would be, with one haptic, so the run never
 * shows a fake lit star. Reduced motion: it simply appears.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import { playHaptic } from '../Haptics';

export function SavedStamp({ reducedMotion, delayMs = 260 }: { reducedMotion: boolean; delayMs?: number }) {
  const scale = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return undefined;
    scale.value = withDelay(delayMs, withSequence(
      withTiming(1.8, { duration: 0 }),
      withTiming(0.92, { duration: 130, easing: Easing.in(Easing.quad) }),
      withSpring(1, { damping: 9, stiffness: 320 }),
    ));
    const t = setTimeout(() => playHaptic('starSlam'), delayMs + 120);
    return () => { clearTimeout(t); cancelAnimation(scale); };
  }, [reducedMotion, delayMs, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: '-4deg' }], opacity: scale.value > 0.02 ? 1 : 0 }));
  return (
    <Animated.View style={[styles.wrap, style]} accessible accessibilityLabel="Run saved">
      <View style={styles.stamp}>
        <GameIcon name="ride" size={30} />
        <Text style={styles.text}>RUN SAVED</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, marginBottom: 10 },
  stamp: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffcf3b', borderRadius: 16, borderWidth: 4,
    borderColor: '#05346e', paddingHorizontal: 16, paddingVertical: 6 },
  text: { fontFamily: 'Shark', fontSize: 26, color: '#05346e', marginLeft: 8 },
});
