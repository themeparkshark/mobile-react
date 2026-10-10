import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../ui';

/**
 * Star Ride win: a big gold star with "x2" slams onto the win card like a
 * stamp (falls from 2.4x, hits with a thud, a tiny shake), then rests.
 * Mount it on the win/reward card when the won ride was a Star Ride; `at`
 * changes each win so it replays. Calls onDone after it lands.
 */
function StarRideStamp({ at, times = 2, onDone }: { readonly at: number; readonly times?: number; readonly onDone?: () => void }) {
  const reduced = useReducedGameMotion();
  const s = useSharedValue(reduced ? 1 : 2.4);
  const o = useSharedValue(reduced ? 1 : 0);
  const shake = useSharedValue(0);
  useEffect(() => {
    if (reduced) { onDone?.(); return; }
    s.value = 2.4; o.value = 0;
    o.value = withTiming(1, { duration: 120 });
    s.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) }, fin => {
      if (!fin) return;
      runOnJS(playSfx)('hit');
      runOnJS(haptic)('hitRigid');
      shake.value = withSequence(withTiming(1, { duration: 40 }), withTiming(-1, { duration: 60 }), withTiming(0, { duration: 40 }));
      s.value = withSequence(withSpring(1.12, { damping: 6, stiffness: 400 }), withSpring(1));
      if (onDone) runOnJS(onDone)();
    });
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }, { rotate: `${-12 + shake.value * 4}deg` }] }));
  return (
    <Animated.View style={[styles.wrap, style]} pointerEvents="none" accessibilityLabel={`Star Ride! Times ${times}`}>
      <GameIcon name="star" size={84} />
      <View style={styles.center}><Text style={styles.x}>x{times}</Text></View>
      <View style={styles.ribbon}><Text style={styles.ribbonText}>STAR RIDE!</Text></View>
    </Animated.View>
  );
}

export default memo(StarRideStamp);

const styles = StyleSheet.create({
  wrap: { width: 110, alignItems: 'center' },
  center: { position: 'absolute', top: 26, width: 84, alignItems: 'center' },
  x: { fontFamily: 'Shark', fontSize: 26, color: BRAND.navy },
  ribbon: { marginTop: -10, backgroundColor: BRAND.red, borderRadius: 8, borderWidth: 2.5, borderColor: BRAND.white, paddingHorizontal: 8, paddingVertical: 1 },
  ribbonText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
});
