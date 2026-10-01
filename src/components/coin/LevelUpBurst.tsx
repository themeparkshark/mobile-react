import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
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
  const glow = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const shards = useRef(new Animated.Value(0)).current;
  const tier = coinTier(fx?.target ?? 2);

  useEffect(() => {
    if (!fx || playKey === 0 || fx.burst === 'crossfade') return;
    glow.setValue(0); flash.setValue(0); shards.setValue(0);
    const parts: Animated.CompositeAnimation[] = [
      Animated.sequence([Animated.delay(HIT_STOP_MS),
        Animated.timing(glow, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true })]),
    ];
    if (fx.flash) {
      parts.push(Animated.sequence([
        Animated.timing(flash, { toValue: fx.flash.opacity, duration: fx.flash.ms / 2, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: fx.flash.ms / 2, useNativeDriver: true }),
      ]));
      parts.push(Animated.sequence([Animated.delay(HIT_STOP_MS),
        Animated.timing(shards, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true })]));
    }
    const animation = Animated.parallel(parts);
    animation.start();
    return () => animation.stop();
  }, [playKey, fx?.burst, fx?.target]);

  if (!fx || fx.burst === 'crossfade') return null;
  const ring = size * 1.0;
  const colors = [tier.ring, tier.ringDeep, '#ffffff', '#ffcf3b'];
  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size * 3, height: size * 3, marginLeft: -size, marginTop: -size }]}>
      <Animated.View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2, borderColor: tier.ring,
        opacity: glow.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.6, 0] }),
        transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }] }]} />
      {fx.burst === 'shatter' && Array.from({ length: fx.shards }).map((_, i) => {
        const angle = (i / fx.shards) * Math.PI * 2;
        const distance = size * (0.9 + (i % 3) * 0.18);
        return (
          <Animated.View key={i} style={[styles.shard, {
            backgroundColor: colors[i % colors.length], width: size * 0.09, height: size * 0.2,
            opacity: shards.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: shards.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] }) },
              { translateY: shards.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] }) },
              { rotate: shards.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 220}deg`] }) },
            ],
          }]} />
        );
      })}
      {fx.flash && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.flash, {
          opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          // The flash value itself never exceeds FLASH_CAP.opacity.
        }]} />
      )}
    </View>
  );
}

/** Exposed for tests: the flash never passes this cap. */
export const LEVEL_UP_FLASH_CAP = FLASH_CAP;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 6 },
  shard: { position: 'absolute', borderRadius: 2, borderWidth: 1, borderColor: '#ffffff' },
  flash: { backgroundColor: '#ffffff', borderRadius: 999 },
});
