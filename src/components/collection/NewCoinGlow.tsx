/**
 * The newest coin's slot glow (hold-fix 3, T128): the house gold glow (the reveal's soft spot, tinted like
 * GoldBurst) behind the coin. It swells in, breathes twice, then rests at a calm glow: a finite animation
 * on the UI thread, nothing looping while the shelf sits still. Reduce Motion: the resting glow at once.
 */
import { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { BEZIER, GOLD_FX } from '../../ui/motion';

const SOFT = require('../../../assets/images/reveal/soft-spot.webp');
const OUT = Easing.bezier(...BEZIER.out);
const BREATHE = Easing.bezier(...BEZIER.inOut);
/** Where the glow rests after its two breaths. */
export const GLOW_REST = 0.75;

export default memo(function NewCoinGlow({ size, reduced }: { readonly size: number; readonly reduced: boolean }) {
  const glow = useSharedValue(reduced ? GLOW_REST : 0);
  useEffect(() => {
    if (reduced) { glow.value = GLOW_REST; return undefined; }
    glow.value = withDelay(260, withSequence(
      withTiming(1, { duration: 420, easing: OUT }),
      withRepeat(withSequence(withTiming(0.5, { duration: 650, easing: BREATHE }), withTiming(1, { duration: 650, easing: BREATHE })), 2, false),
      withTiming(GLOW_REST, { duration: 500, easing: BREATHE }),
    ));
    return () => cancelAnimation(glow);
  }, [glow, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.85 + glow.value * 0.15 }] }));
  const box = size * 1.75;
  return (
    <Animated.View pointerEvents="none" accessible={false}
      style={[styles.wrap, { width: box, height: box, left: (size - box) / 2, top: (size - box) / 2 }, style]}>
      <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor={GOLD_FX.glow} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
});
