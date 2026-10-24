import { View } from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { coinTier } from '../../constants/coinTiers';

/** How each tier's plate looks: a disc only (Silver, Gold), or rays (count, reach in coin radii, two colours). */
export function tierPlateLook(level: number): { readonly rays: number; readonly reach: number; readonly colors: readonly [string, string] } {
  const tier = coinTier(level);
  if (tier.fx === 'starburst') return { rays: 16, reach: 1.42, colors: [tier.ring, '#ffe27a'] };
  if (tier.fx === 'rays') return { rays: 12, reach: 1.32, colors: [tier.ring, '#ffffff'] };
  if (tier.level >= 6) return { rays: 10, reach: 1.3, colors: [tier.ring, tier.ringDeep] };
  return { rays: 0, reach: 1.22, colors: [tier.ring, tier.ringDeep] };
}

/**
 * The new tier's plate behind the coin: plain Views (no shadow), still once it lands. A disc in the tier's metal,
 * and from Prismatic up a ring of pointed rays, so Gold, Prismatic and Legendary are told apart without text.
 */
export default function TierPlate({ level, size, progress }: {
  readonly level: number; readonly size: number; readonly progress: SharedValue<number>;
}) {
  const tier = coinTier(level);
  const look = tierPlateLook(level);
  const r = size / 2;
  const reach = r * look.reach;
  const disc = r * 1.2;
  const style = useAnimatedStyle(() => ({
    opacity: progress.value <= 0 ? 0 : Math.min(1, progress.value * 2),
    transform: [{ scale: 0.55 + 0.45 * progress.value }, { rotate: `${(1 - Math.min(1, progress.value)) * -40}deg` }],
  }));
  if (tier.level < 2) return null;
  const rayLen = reach - r * 0.8;
  const rayHalf = Math.max(6, (Math.PI * reach) / look.rays / 2.2);
  return (
    <Reanimated.View pointerEvents="none" style={[{ position: 'absolute', width: reach * 2, height: reach * 2,
      alignItems: 'center', justifyContent: 'center' }, style]}>
      {Array.from({ length: look.rays }, (_, i) => (
        <View key={i} style={{ position: 'absolute', width: reach * 2, height: reach * 2, alignItems: 'center',
          transform: [{ rotate: `${(360 / look.rays) * i}deg` }] }}>
          <View style={{ width: 0, height: 0, borderLeftWidth: rayHalf, borderRightWidth: rayHalf, borderBottomWidth: rayLen,
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: look.colors[i % 2] }} />
        </View>
      ))}
      <View style={{ position: 'absolute', width: disc * 2, height: disc * 2, borderRadius: disc, backgroundColor: tier.halo,
        borderWidth: 4, borderColor: tier.ring }} />
    </Reanimated.View>
  );
}
