import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { coinTier } from '../../constants/coinTiers';
import { FLASH_CAP, HIT_STOP_MS, type LevelUpFx } from './progressionModel';

/**
 * Act 2 of a level-up (progression.md 9.3): the burst over the coin.
 *  - Lv2-5: a rim glow. The ring blooms to 1.3x at 60% opacity over 240 ms.
 *    No flash, no shatter.
 *  - Lv6+: a white flash capped at 40% for 80 ms, the old rim shatters into 16
 *    shards and a starburst ring opens in the tier colours.
 *  - Reduce Motion (or Dim Flashing Lights): nothing here; the sheet crossfades.
 * `playKey` changes to fire it once.
 */
export default function LevelUpBurst({ fx, size, playKey }: { fx: LevelUpFx | null; size: number; playKey: number }) {
  // UI thread (Reanimated), one engine with the rest of the level-up: starting it costs one write per
  // value, not a native-driver graph per shard on the burst frame.
  const glow = useSharedValue(0);
  const flash = useSharedValue(0);
  const shards = useSharedValue(0);
  const tier = coinTier(fx?.target ?? 2);

  useEffect(() => {
    if (!fx || playKey === 0 || fx.burst === 'crossfade') return;
    glow.value = 0; flash.value = 0; shards.value = 0;
    glow.value = withDelay(HIT_STOP_MS, withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }));
    if (fx.flash) {
      flash.value = withSequence(withTiming(fx.flash.opacity, { duration: fx.flash.ms / 2 }), withTiming(0, { duration: fx.flash.ms / 2 }));
      shards.value = withDelay(HIT_STOP_MS, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    }
    return () => { cancelAnimation(glow); cancelAnimation(flash); cancelAnimation(shards); };
  }, [playKey, fx?.burst, fx?.target]); // eslint-disable-line react-hooks/exhaustive-deps

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 0.3, 1], [0, 0.6, 0]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [1, 1.3]) }],
  }));
  // The flash value itself never exceeds FLASH_CAP.opacity.
  const flashStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, flash.value)) }));

  if (!fx || fx.burst === 'crossfade') return null;
  const ring = size * 1.0;
  const colors = [tier.ring, tier.ringDeep, '#ffffff', '#ffcf3b'];
  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size * 3, height: size * 3, marginLeft: -size, marginTop: -size }]}>
      <Animated.View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2, borderColor: tier.ring }, ringStyle]} />
      {fx.burst === 'shatter' && Array.from({ length: fx.shards }).map((_, i) => (
        <Shard key={i} i={i} count={fx.shards} size={size} color={colors[i % colors.length]} t={shards} />
      ))}
      {fx.flash && <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />}
    </View>
  );
}

function Shard({ i, count, size, color, t }: { i: number; count: number; size: number; color: string; t: SharedValue<number> }) {
  const angle = (i / count) * Math.PI * 2;
  const distance = size * (0.9 + (i % 3) * 0.18);
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const spin = (i % 2 ? 1 : -1) * 220;
  const style = useAnimatedStyle(() => ({
    // Hidden until the burst plays (they used to sit stacked on the coin while it charged).
    opacity: t.value <= 0 ? 0 : interpolate(t.value, [0, 0.7, 1], [1, 1, 0]),
    transform: [{ translateX: dx * t.value }, { translateY: dy * t.value }, { rotate: `${spin * t.value}deg` }],
  }));
  return <Animated.View style={[styles.shard, { backgroundColor: color, width: size * 0.09, height: size * 0.2 }, style]} />;
}

/** Exposed for tests: the flash never passes this cap. */
export const LEVEL_UP_FLASH_CAP = FLASH_CAP;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 6 },
  shard: { position: 'absolute', borderRadius: 2, borderWidth: 1, borderColor: '#ffffff' },
  flash: { backgroundColor: '#ffffff', borderRadius: 999 },
});
