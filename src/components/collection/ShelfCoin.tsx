/**
 * An earned ride coin as it sits on a shelf: Alex's coin art inside a tier ring
 * (blue, white and gold tokens from constants/coinTiers), a soft navy contact
 * shadow so it rests on the plank, and an idle shimmer for upgraded tiers.
 *
 * Every shimmer on screen reads ONE shared Reanimated clock (started once, on
 * the UI thread), so a full shelf costs one animation, not one per coin.
 * `igniteKey` plays the "just upgraded / just landed" ignite: ring pulse,
 * squash and settle, sparkles. Reduced motion shows the finished state only.
 */
import CoinStand from '../coin/CoinStand';
import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  makeMutable,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { coinTier } from '../../constants/coinTiers';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND } from '../../ui/tokens';
import GameIcon from '../../ui/GameIcon';

/** One clock for every shelf shimmer. 0 -> 1 every SHIMMER_MS. */
const SHIMMER_MS = 3600;
const shelfClock = makeMutable(0);
let clockUsers = 0;

function useShelfClock(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    clockUsers += 1;
    if (clockUsers === 1) {
      shelfClock.value = 0;
      shelfClock.value = withRepeat(withTiming(1, { duration: SHIMMER_MS, easing: Easing.linear }), -1, false);
    }
    return () => {
      clockUsers -= 1;
      if (clockUsers === 0) cancelAnimation(shelfClock);
    };
  }, [active]);
}

export interface ShelfCoinProps {
  readonly coinUrl?: string | null;
  readonly level?: number | null;
  readonly size: number;
  /** Spreads shimmer timing across a shelf row (use the slot index). */
  readonly phase?: number;
  /** Change it to play the ignite once (after an upgrade or a landing). */
  readonly igniteKey?: number | string;
  readonly dimmed?: boolean;
}

function ShelfCoin({ coinUrl, level, size, phase = 0, igniteKey, dimmed = false }: ShelfCoinProps) {
  const reduced = useReducedGameMotion();
  const tier = coinTier(level);
  const border = Math.max(2, Math.round(tier.ringWidth * size / 60));
  const keyline = Math.max(1.5, Math.round(size / 36));
  const shimmers = tier.shimmer && !reduced && !dimmed;
  useShelfClock(shimmers);

  const pulse = useSharedValue(0);
  const squash = useSharedValue(1);
  const sparkle = useSharedValue(0);
  useEffect(() => {
    if (igniteKey === undefined || igniteKey === null || igniteKey === 0) return undefined;
    if (reduced) { pulse.value = 0; squash.value = 1; sparkle.value = 0; return undefined; }
    pulse.value = 0;
    pulse.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
    squash.value = withSequence(
      withTiming(0.86, { duration: 90, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 6, stiffness: 260, mass: 0.7 }),
    );
    sparkle.value = 0;
    sparkle.value = withDelay(60, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }));
    return () => { cancelAnimation(pulse); cancelAnimation(squash); cancelAnimation(sparkle); };
  }, [igniteKey, reduced, pulse, squash, sparkle]);

  const offset = ((phase * 0.137) % 1 + 1) % 1;
  const shimmerStyle = useAnimatedStyle(() => {
    if (!shimmers) return { opacity: 0 };
    const t = (shelfClock.value + offset) % 1;
    // The band crosses the coin during the first 35% of each cycle, then rests.
    const k = Math.min(1, t / 0.35);
    return {
      opacity: t < 0.35 ? 0.55 * Math.sin(k * Math.PI) : 0,
      transform: [{ translateX: -size + k * size * 2 }, { rotate: '22deg' }],
    };
  });
  const coinStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: squash.value }, { scaleX: 2 - squash.value }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value === 0 ? 0 : 1 - pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.55 }],
  }));

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {/* Progression v2: Lv6+ stand under the coin (stand, shadow, rim, art, crown). */}
      <CoinStand level={tier.level} size={size} layer="stand" />
      <View style={[styles.contact, { width: size * 0.74, height: size * 0.16, left: size * 0.13, bottom: -size * 0.07,
        borderRadius: size }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size }, pulseStyle,
        { borderWidth: Math.max(3, border), borderColor: tier.ring }]} />
      <Animated.View style={[{ width: size, height: size }, coinStyle]}>
        {/* A navy keyline outside every earned ring so even a Classic coin reads as earned against the faded sockets. */}
        <View style={[styles.keyline, { left: -keyline, top: -keyline, width: size + keyline * 2, height: size + keyline * 2,
          borderRadius: size, borderWidth: keyline, opacity: dimmed ? 0.4 : 1 }]} />
        <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: border,
          borderColor: tier.ring, borderBottomColor: tier.ringDeep, backgroundColor: tier.halo,
          overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: dimmed ? 0.55 : 1 }}>
          {!!coinUrl && <Image source={coinUrl} contentFit="contain" transition={120}
            style={{ width: size - border * 2, height: size - border * 2 }} />}
          <Animated.View style={[styles.shimmer, { width: size * 0.22, height: size * 1.6, top: -size * 0.3 }, shimmerStyle]} />
        </View>
      </Animated.View>
      <CoinStand level={tier.level} size={size} layer="crown" />
      {SPARKLE_PATHS.map(([dx, dy], index) => (
        <SparkleBit key={index} progress={sparkle} dx={dx * size} dy={dy * size} size={size * 0.32}
          left={size / 2 - size * 0.16} top={size / 2 - size * 0.16} />
      ))}
    </View>
  );
}

const SPARKLE_PATHS: ReadonlyArray<readonly [number, number]> = [[-0.62, -0.5], [0.66, -0.36], [0.1, -0.74]];

function SparkleBit({ progress, dx, dy, size, left, top }: {
  readonly progress: SharedValue<number>; readonly dx: number; readonly dy: number;
  readonly size: number; readonly left: number; readonly top: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value === 0 ? 0 : Math.sin(progress.value * Math.PI),
    transform: [{ translateX: dx * progress.value }, { translateY: dy * progress.value }, { scale: 0.4 + progress.value * 0.8 }],
  }));
  return <Animated.View style={[styles.sparkle, { left, top }, style]}><GameIcon name="sparkle" size={size} /></Animated.View>;
}

const styles = StyleSheet.create({
  contact: { position: 'absolute', backgroundColor: BRAND.navy, opacity: 0.32 },
  keyline: { position: 'absolute', borderColor: BRAND.navy },
  shimmer: { position: 'absolute', left: 0, backgroundColor: '#ffffff' },
  sparkle: { position: 'absolute' },
});

export default memo(ShelfCoin);
