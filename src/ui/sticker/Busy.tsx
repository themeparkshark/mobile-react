/** Busy (internal): three dots hop, one after the other, on the UI thread. Reduce Motion: they breathe instead. Never a stock spinner. */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { INK } from './tokens';

function Dot({ index, reduced }: { index: number; reduced: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const step = reduced ? 150 : 220;
    t.value = withDelay(index * 120, withRepeat(withSequence(
      withTiming(1, { duration: step, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: step, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: step }),
    ), -1));
    return () => cancelAnimation(t);
  }, [index, reduced, t]);
  const style = useAnimatedStyle(() => (reduced ? { opacity: 0.55 + 0.45 * t.value } : { transform: [{ translateY: -6 * t.value }] }));
  return <Animated.View style={[styles.dot, style]} />;
}

export default function Busy({ reduced }: { reduced: boolean }) {
  return <View style={styles.dots}>{[0, 1, 2].map(i => <Dot key={i} index={i} reduced={reduced} />)}</View>;
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', alignItems: 'flex-end', height: 16, gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: INK.white, borderWidth: 1.5, borderColor: INK.navy },
});
