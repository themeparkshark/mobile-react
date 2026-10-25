import { View } from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { coinTier } from '../../constants/coinTiers';

/** The dark ink every ray and the disc are outlined in (Alex's style: every shape has an ink edge). */
export const PLATE_INK = '#05346e';
/** How far the ink shows past a ray's sides and its tip (pt). */
const INK_SIDE = 2.5;
const INK_TIP = 4;
/** How far under a long ray's tip its white glint starts (pt), so the blue tip still shows. */
const GLINT_TIP = 7;

/**
 * How each tier's plate looks: a disc only (Silver, Gold), or rays (count, reach in coin radii, two colours). Prismatic's
 * rays alternate long and short (altReach) and the long ones carry a white glint down their middle, so it reads as light
 * shining out, not a spiked collar; its disc is a little smaller so the rays show.
 */
export function tierPlateLook(level: number): {
  readonly rays: number; readonly reach: number; readonly altReach: number; readonly colors: readonly [string, string];
  readonly glint: string | null; readonly disc: number;
} {
  const tier = coinTier(level);
  if (tier.fx === 'starburst') return { rays: 16, reach: 1.5, altReach: 1.5, colors: [tier.ring, '#ffe27a'], glint: null, disc: 1.2 };
  // Prismatic: a shine of 12 light rays, long and short in turn (a hand-drawn badge, never a compass or a gear edge).
  if (tier.fx === 'rays') return { rays: 12, reach: 1.48, altReach: 1.32, colors: [tier.ring, '#ffffff'], glint: '#ffffff', disc: 1.1 };
  if (tier.level >= 6) return { rays: 10, reach: 1.3, altReach: 1.3, colors: [tier.ring, tier.ringDeep], glint: null, disc: 1.2 };
  return { rays: 0, reach: 1.22, altReach: 1.22, colors: [tier.ring, tier.ringDeep], glint: null, disc: 1.2 };
}

/** How much shorter the lowest ray is than the top one (coin radii): the sunburst sits on the card's blue band like a
 * rising sun, so its lower rays never reach the words under the coin. */
export const LOW_RAY_TRIM = 0.15;

/** How far ray i (0 points straight up) reaches, in coin radii: full on the top half, a little shorter towards the bottom. */
export function rayReach(reach: number, rays: number, i: number): number {
  const down = Math.max(0, -Math.cos((2 * Math.PI * i) / rays));
  return reach - LOW_RAY_TRIM * down;
}

/**
 * Extra room under a success coin whose plate throws rays (Prismatic and Legendary, no stand): the blue band and the
 * line under the coin move down this far, so the ray tips stay on the band and clear of "YOUR COIN LEVELED UP".
 */
export function plateRoom(level: number, success: boolean, shortPhone: boolean): number {
  const tier = coinTier(level);
  if (!success || tier.stand !== 'none' || tierPlateLook(level).rays === 0) return 0;
  return shortPhone ? 4 : 8;
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
  const disc = r * look.disc;
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
      {Array.from({ length: look.rays }, (_, i) => {
        // The lower rays are a little shorter: each starts lower in its turned box, so its tip stops nearer the coin.
        const long = i % 2 === 0;
        const tip = reach - r * rayReach(long ? look.reach : look.altReach, look.rays, i);
        const len = rayLen - tip;
        const glint = long ? look.glint : null;
        return (
          <View key={i} style={{ position: 'absolute', width: reach * 2, height: reach * 2, alignItems: 'center',
            transform: [{ rotate: `${(360 / look.rays) * i}deg` }] }}>
            {/* The ink edge: the same ray a little bigger, behind it. */}
            <View style={{ position: 'absolute', top: tip - INK_TIP, width: 0, height: 0, borderLeftWidth: rayHalf + INK_SIDE,
              borderRightWidth: rayHalf + INK_SIDE, borderBottomWidth: len + INK_TIP,
              borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: PLATE_INK }} />
            <View style={{ marginTop: tip, width: 0, height: 0, borderLeftWidth: rayHalf, borderRightWidth: rayHalf, borderBottomWidth: len,
              borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: look.colors[i % 2] }} />
            {/* The light: a thin white ray down the middle of a long ray, from just under its tip. */}
            {glint && (
              <View style={{ position: 'absolute', top: tip + GLINT_TIP, width: 0, height: 0, borderLeftWidth: rayHalf * 0.34,
                borderRightWidth: rayHalf * 0.34, borderBottomWidth: len * 0.62, borderLeftColor: 'transparent',
                borderRightColor: 'transparent', borderBottomColor: glint }} />
            )}
          </View>
        );
      })}
      <View style={{ position: 'absolute', width: disc * 2 + 5, height: disc * 2 + 5, borderRadius: disc + 2.5,
        backgroundColor: PLATE_INK }} />
      <View style={{ position: 'absolute', width: disc * 2, height: disc * 2, borderRadius: disc, backgroundColor: tier.halo,
        borderWidth: 4, borderColor: tier.ring }} />
    </Reanimated.View>
  );
}
