/**
 * A one-shot gold burst: a ring, a star flash and eight sparkles flying out.
 * UI thread only (transforms and opacity), it plays once and then sits still.
 * Shared by Finn's guest taste and the first-win card so the first minute
 * celebrates the same way everywhere.
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { BRAND } from '../ui';

const SPARKLE = require('../../assets/images/map/fx/sparkle.png');
const STARBURST = require('../../assets/images/screens/explore/starburst.png');

export default function SparkleBurst({ size = 140, delay = 0 }: { size?: number; delay?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }));
    return () => cancelAnimation(t);
  }, [t, delay]);
  const ring = useAnimatedStyle(() => ({
    opacity: t.value > 0 ? 1 - t.value : 0,
    transform: [{ scale: 0.3 + t.value * 0.8 }],
  }));
  const flash = useAnimatedStyle(() => ({
    opacity: t.value > 0 ? 0.9 * (1 - t.value) : 0,
    transform: [{ scale: 0.4 + t.value * 0.7 }, { rotate: `${t.value * 45}deg` }],
  }));
  return <View pointerEvents="none" style={[styles.burst, { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }]}>
    <Animated.View style={[styles.burstRing, { borderRadius: size / 2 }, ring]} />
    <Animated.View style={[StyleSheet.absoluteFill, flash]}>
      <Image source={STARBURST} style={StyleSheet.absoluteFill} contentFit="contain" tintColor={BRAND.gold} />
    </Animated.View>
    {[0, 1, 2, 3, 4, 5, 6, 7].map(k => <BurstSparkle key={k} k={k} t={t} reach={size * 0.6} />)}
  </View>;
}

function BurstSparkle({ k, t, reach }: { k: number; t: SharedValue<number>; reach: number }) {
  const angle = (k / 8) * Math.PI * 2 - Math.PI / 2;
  const far = k % 2 ? 0.75 : 1;
  const style = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 1 - t.value * t.value : 0,
    transform: [{ translateX: Math.cos(angle) * reach * far * t.value }, { translateY: Math.sin(angle) * reach * far * t.value },
      { scale: 0.7 + (1 - t.value) * 0.6 }],
  }));
  return <Animated.View style={[styles.sparkle, style]}>
    <Image source={SPARKLE} style={styles.sparkleImg} contentFit="contain" />
  </Animated.View>;
}

const styles = StyleSheet.create({
  burst: { position: 'absolute', left: '50%', top: '50%', alignItems: 'center', justifyContent: 'center' },
  burstRing: { ...StyleSheet.absoluteFillObject, borderWidth: 6, borderColor: BRAND.gold },
  sparkle: { position: 'absolute', width: 44, height: 54 },
  sparkleImg: { width: 44, height: 54 },
});
