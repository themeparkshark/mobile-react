import { View } from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { coinTier } from '../../constants/coinTiers';

/** The dark ink every ray and the disc are outlined in (Alex's style: every shape has an ink edge). */
export const PLATE_INK = '#05346e';
/** How far the ink shows past a ray's sides and its tip (pt). */
const INK_SIDE = 2.5;
const INK_TIP = 4;

/** How each tier's plate looks: a disc only (Silver, Gold), or rays (count, reach in coin radii, two colours). */
export function tierPlateLook(level: number): { readonly rays: number; readonly reach: number; readonly colors: readonly [string, string] } {
  const tier = coinTier(level);
  if (tier.fx === 'starburst') return { rays: 16, reach: 1.5, colors: [tier.ring, '#ffe27a'] };
  // Prismatic: a few long, chunky rays (a hand-drawn badge), never a fine gear edge.
  if (tier.fx === 'rays') return { rays: 8, reach: 1.4, colors: [tier.ring, '#ffffff'] };
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
          {/* The ink edge: the same ray a little bigger, behind it. */}
          <View style={{ position: 'absolute', top: -INK_TIP, width: 0, height: 0, borderLeftWidth: rayHalf + INK_SIDE,
            borderRightWidth: rayHalf + INK_SIDE, borderBottomWidth: rayLen + INK_TIP,
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: PLATE_INK }} />
          <View style={{ width: 0, height: 0, borderLeftWidth: rayHalf, borderRightWidth: rayHalf, borderBottomWidth: rayLen,
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: look.colors[i % 2] }} />
        </View>
      ))}
      <View style={{ position: 'absolute', width: disc * 2 + 5, height: disc * 2 + 5, borderRadius: disc + 2.5,
        backgroundColor: PLATE_INK }} />
      <View style={{ position: 'absolute', width: disc * 2, height: disc * 2, borderRadius: disc, backgroundColor: tier.halo,
        borderWidth: 4, borderColor: tier.ring }} />
    </Reanimated.View>
  );
}
