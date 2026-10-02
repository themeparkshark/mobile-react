/**
 * How to Play: each card is a short looping demo of the real mechanic, built
 * from layers on the UI thread (Reanimated), never video:
 *   find  - pins drop onto a mini map next to the shark
 *   catch - a finger taps a snack: pop, burst, NEW!
 *   book  - a silhouette tile flips to color in a mini book
 *   park  - a ride prize spins down to the shark
 *   line  - the queue inches forward while a timer fills, then pops into a prize
 * The shark is Alex's real PNG (ART_RULES rule 1). A demo only runs while its
 * card is the active one, and Reduce Motion shows the finished frame still.
 */
import { Image } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { BRAND, GameIcon } from '../../ui';
import type { HowToArtKey } from '../../services/help/howToCards';
import { RarityGems, TilePanel } from '../SetCollection/dexLook';

const SHARK = require('../../../assets/images/howto/shark.webp');
const SHARK_HAPPY = require('../../../assets/images/howto/shark-happy.webp');
const MAP = require('../../../assets/images/howto/map.webp');
const PIN = require('../../../assets/images/howto/pin.webp');
const QUEUE = require('../../../assets/images/howto/queue.webp');
const POINTER = require('../../../assets/images/howto/pointer.webp');
const SCENE = require('../../../assets/images/ride-photo/scene-far.webp');
const COIN = require('../../../assets/images/coingold.png');
const ITEM = {
  pretzel: require('../../../assets/images/howto/item-salted-pretzel.webp'),
  popcorn: require('../../../assets/images/howto/item-popcorn-bucket.webp'),
  cotton: require('../../../assets/images/howto/item-cotton-candy.webp'),
  turkey: require('../../../assets/images/howto/item-turkey-leg.webp'),
  cornDog: require('../../../assets/images/howto/item-corn-dog.webp'),
  apple: require('../../../assets/images/howto/item-candy-apple.webp'),
  plush: require('../../../assets/images/howto/item-shark-plush.webp'),
};

export const DEMO_LOOP_MS: Readonly<Record<HowToArtKey, number>> = { find: 2600, catch: 2400, book: 2400, park: 2400, line: 2800 };

/** 0..1 repeating while active; parked at 1 (the finished frame) otherwise. */
function useLoop(active: boolean, reduced: boolean, ms: number): SharedValue<number> {
  const t = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(t);
    if (!active || reduced) { t.value = 1; return; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [active, reduced, ms, t]);
  return t;
}

export default function HowToDemo({ art, size, active, reduced }: {
  readonly art: HowToArtKey; readonly size: number; readonly active: boolean; readonly reduced: boolean;
}) {
  const t = useLoop(active, reduced, DEMO_LOOP_MS[art]);
  const props = { t, s: size };
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {art === 'find' && <FindDemo {...props} />}
      {art === 'catch' && <CatchDemo {...props} />}
      {art === 'book' && <BookDemo {...props} />}
      {art === 'park' && <ParkDemo {...props} />}
      {art === 'line' && <LineDemo {...props} />}
    </View>
  );
}

type DemoProps = { readonly t: SharedValue<number>; readonly s: number };

function Layer({ x, y, w, h, children, style }: {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly children: ReactNode;
  readonly style?: object;
}) {
  return <Animated.View style={[{ position: 'absolute', left: x, top: y, width: w, height: h }, style]}>{children}</Animated.View>;
}

/** Alex's real shark (two expressions: eyes open, or happy closed eyes), with a contact shadow so it stands on the card. */
function Shark({ size, flip, happy, tilt = 0 }: { readonly size: number; readonly flip?: boolean; readonly happy?: boolean; readonly tilt?: number }) {
  return (
    <View style={{ width: size * 0.9, height: size }}>
      <View style={[styles.shadow, { width: size * 0.6, height: size * 0.09, left: size * 0.15, bottom: -size * 0.02 }]} />
      <Image source={happy ? SHARK_HAPPY : SHARK} contentFit="contain"
        style={{ width: size * 0.9, height: size, transform: [...(flip ? [{ scaleX: -1 }] : []), { rotate: `${tilt}deg` }] }} />
    </View>
  );
}

/** A pin drops in at `at` (0..1 of the loop) with a bounce, and leaves near the end. */
function DropPin({ t, at, x, y, w, item }: { readonly t: SharedValue<number>; readonly at: number; readonly x: number; readonly y: number; readonly w: number; readonly item: number }) {
  const style = useAnimatedStyle(() => {
    const p = t.value;
    const drop = interpolate(p, [at, at + 0.12, at + 0.18, at + 0.22], [-w * 1.2, w * 0.08, -w * 0.06, 0], 'clamp');
    const fade = interpolate(p, [at - 0.01, at, 0.9, 0.98], [0, 1, 1, p >= 0.999 ? 1 : 0], 'clamp');
    return { opacity: fade, transform: [{ translateY: drop }] };
  });
  return (
    <Layer x={x} y={y} w={w} h={w * 1.4} style={style}>
      <Image source={PIN} style={{ width: w, height: w * 1.4 }} contentFit="contain" />
      <Image source={item} style={{ position: 'absolute', left: w * 0.22, top: w * 0.2, width: w * 0.56, height: w * 0.56 }} contentFit="contain" />
    </Layer>
  );
}

function FindDemo({ t, s }: DemoProps) {
  return (
    <>
      <Layer x={s * 0.04} y={s * 0.2} w={s * 0.7} h={s * 0.7}>
        <Image source={MAP} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      </Layer>
      <DropPin t={t} at={0.08} x={s * 0.1} y={s * 0.14} w={s * 0.2} item={ITEM.pretzel} />
      <DropPin t={t} at={0.28} x={s * 0.42} y={s * 0.08} w={s * 0.2} item={ITEM.popcorn} />
      <DropPin t={t} at={0.48} x={s * 0.22} y={s * 0.46} w={s * 0.2} item={ITEM.cotton} />
      <Layer x={s * 0.52} y={s * 0.42} w={s * 0.48} h={s * 0.56}>
        <Shark size={s * 0.56} flip tilt={-4} />
      </Layer>
    </>
  );
}

function CatchDemo({ t, s }: DemoProps) {
  // The snack bobs; the glove points in from below (always 12 pt or more away), taps, the snack squashes and bursts, NEW! pops.
  const snack = useAnimatedStyle(() => {
    const p = t.value;
    const bob = Math.sin(p * Math.PI * 4) * s * 0.02 * (p < 0.42 ? 1 : 0);
    const squash = interpolate(p, [0.42, 0.46, 0.52, 0.62, 1], [1, 0.9, 1.25, 1.1, 1.1], 'clamp');
    return { transform: [{ translateY: bob }, { scale: squash }] };
  });
  const hand = useAnimatedStyle(() => {
    const p = t.value;
    const reach = interpolate(p, [0, 0.3, 0.42, 0.47, 0.62], [s * 0.3, s * 0.06, s * 0.03, s * 0.06, s * 0.34], 'clamp');
    const press = interpolate(p, [0.38, 0.44, 0.5], [1, 0.88, 1], 'clamp');
    const fade = interpolate(p, [0, 0.08, 0.55, 0.65], [0, 1, 1, 0], 'clamp');
    return { opacity: p >= 0.999 ? 0 : fade, transform: [{ translateY: reach }, { scale: press }] };
  });
  const burst = useAnimatedStyle(() => {
    const p = t.value;
    const k = interpolate(p, [0.46, 0.7], [0, 1], 'clamp');
    return { opacity: p >= 0.999 ? 0 : interpolate(k, [0, 0.2, 1], [0, 1, 0]), transform: [{ scale: 0.4 + k * 1.2 }] };
  });
  const badge = useAnimatedStyle(() => {
    const p = t.value;
    const k = interpolate(p, [0.5, 0.6, 0.66], [0, 1.2, 1], 'clamp');
    return { opacity: interpolate(p, [0.5, 0.55, 0.93, 1], [0, 1, 1, p >= 0.999 ? 1 : 0], 'clamp'), transform: [{ scale: k }] };
  });
  const hop = useAnimatedStyle(() => {
    const p = t.value;
    return { transform: [{ translateY: -Math.max(0, Math.sin(interpolate(p, [0.55, 0.85], [0, Math.PI], 'clamp'))) * s * 0.05 }] };
  });
  return (
    <>
      <Layer x={s * 0.5} y={s * 0.06} w={s * 0.42} h={s * 0.42} style={burst}>
        <View style={styles.burst}>{Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={[styles.ray, { transform: [{ rotate: `${i * 45}deg` }, { translateY: -s * 0.16 }] }]} />
        ))}</View>
      </Layer>
      <Layer x={s * 0.52} y={s * 0.08} w={s * 0.38} h={s * 0.38} style={snack}>
        <Image source={ITEM.turkey} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      </Layer>
      <Layer x={s * 0.7} y={0} w={s * 0.26} h={s * 0.16} style={badge}>
        <GameIcon name="new" size={s * 0.2} />
      </Layer>
      {/* The glove's fingertip stops below the snack: it points at it, never holds it. */}
      <Layer x={s * 0.62} y={s * 0.5} w={s * 0.2} h={s * 0.32} style={hand}>
        <Image source={POINTER} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      </Layer>
      <Layer x={s * 0.02} y={s * 0.4} w={s * 0.5} h={s * 0.58} style={hop}>
        <Shark size={s * 0.56} happy />
      </Layer>
    </>
  );
}

function MiniTile({ item, rarity, x, y, w, flip, t }: {
  readonly item: number; readonly rarity: number; readonly x: number; readonly y: number; readonly w: number;
  readonly flip?: boolean; readonly t: SharedValue<number>;
}) {
  // A coin-flip of the art inside the tile: silhouette squeezes to 0, then the color art opens to 1. The tile stays put.
  const art = useAnimatedStyle(() => {
    if (!flip) return {};
    const p = t.value;
    const k = p < 0.3 ? 1 : p < 0.4 ? interpolate(p, [0.3, 0.4], [1, 0]) : p < 0.52 ? interpolate(p, [0.4, 0.52], [0, 1]) : 1;
    return { transform: [{ scaleX: Math.max(0.02, k) }] };
  });
  const color = useAnimatedStyle(() => ({ opacity: !flip || t.value >= 0.4 ? 1 : 0 }));
  const shadow = useAnimatedStyle(() => ({ opacity: flip && t.value < 0.4 ? 1 : 0 }));
  return (
    <Layer x={x} y={y} w={w} h={w}>
      <TilePanel rarity={rarity} found style={{ width: w, height: w, justifyContent: 'center' }}>
        <RarityGems rarity={rarity} size={6} style={{ position: 'absolute', top: 6, left: 5 }} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, art]}>
          <Animated.View style={color}>
            <Image source={item} style={{ width: w * 0.66, height: w * 0.66 }} contentFit="contain" />
          </Animated.View>
          {flip && (
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, shadow]}>
              <Image source={item} tintColor="#1b3a5c" style={{ width: w * 0.66, height: w * 0.66 }} contentFit="contain" />
            </Animated.View>
          )}
        </Animated.View>
      </TilePanel>
    </Layer>
  );
}

function BookDemo({ t, s }: DemoProps) {
  const sparkle = useAnimatedStyle(() => {
    const p = t.value;
    const k = interpolate(p, [0.5, 0.75], [0, 1], 'clamp');
    return { opacity: p >= 0.999 ? 0 : interpolate(k, [0, 0.3, 1], [0, 1, 0]), transform: [{ scale: 0.6 + k }] };
  });
  const w = s * 0.36;
  return (
    <>
      <View style={[styles.book, { left: s * 0.07, top: s * 0.07, width: s * 0.86, height: s * 0.86 }]} />
      <MiniTile t={t} item={ITEM.cornDog} rarity={1} x={s * 0.12} y={s * 0.12} w={w} />
      <MiniTile t={t} item={ITEM.apple} rarity={2} x={s * 0.52} y={s * 0.12} w={w} />
      <MiniTile t={t} item={ITEM.turkey} rarity={3} x={s * 0.12} y={s * 0.52} w={w} />
      <MiniTile t={t} item={ITEM.plush} rarity={4} x={s * 0.52} y={s * 0.52} w={w} flip />
      <Layer x={s * 0.5} y={s * 0.5} w={w * 1.1} h={w * 1.1} style={sparkle}>
        <GameIcon name="sparkle" size={w * 1.1} />
      </Layer>
    </>
  );
}

function ParkDemo({ t, s }: DemoProps) {
  const coin = useAnimatedStyle(() => {
    const p = t.value;
    const y = interpolate(p, [0, 0.45, 0.52, 0.58], [-s * 0.3, s * 0.02, -s * 0.03, 0], 'clamp');
    const spin = Math.cos(p * Math.PI * 6);
    return { opacity: interpolate(p, [0, 0.06, 0.92, 1], [0, 1, 1, p >= 0.999 ? 1 : 0], 'clamp'), transform: [{ translateY: y }, { scaleX: p < 0.5 ? spin : 1 }] };
  });
  const hop = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, Math.sin(interpolate(t.value, [0.5, 0.8], [0, Math.PI], 'clamp'))) * s * 0.05 }],
  }));
  return (
    <>
      <View style={[styles.scene, { left: s * 0.04, top: s * 0.04, width: s * 0.92, height: s * 0.92 }]}>
        <Image source={SCENE} style={StyleSheet.absoluteFill} contentFit="cover" />
      </View>
      <Layer x={s * 0.36} y={s * 0.14} w={s * 0.28} h={s * 0.28} style={coin}>
        <Image source={COIN} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      </Layer>
      <Layer x={s * 0.25} y={s * 0.36} w={s * 0.5} h={s * 0.6} style={hop}>
        <Shark size={s * 0.6} happy />
      </Layer>
    </>
  );
}

function LineDemo({ t, s }: DemoProps) {
  // The line steps forward while a timer badge fills; when full it pops open into a gift: time in line pays.
  const step = useAnimatedStyle(() => {
    const p = t.value;
    const x = interpolate(p, [0, 0.2, 0.3, 0.6, 0.7, 1], [0, 0, s * 0.05, s * 0.05, s * 0.1, s * 0.1]);
    return { transform: [{ translateX: x - s * 0.05 }] };
  });
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleY: Math.max(0.02, interpolate(t.value, [0, 0.7], [0, 1], 'clamp')) }] }));
  const timer = useAnimatedStyle(() => ({ opacity: t.value < 0.72 ? 1 : interpolate(t.value, [0.72, 0.78], [1, 0], 'clamp') }));
  const gift = useAnimatedStyle(() => {
    const k = interpolate(t.value, [0.72, 0.82, 0.88], [0, 1.25, 1], 'clamp');
    return { opacity: t.value >= 0.72 || t.value >= 0.999 ? 1 : 0, transform: [{ scale: t.value >= 0.999 ? 1 : k }] };
  });
  return (
    <>
      <Layer x={s * 0.04} y={s * 0.62} w={s * 0.92} h={s * 0.36} style={step}>
        <Image source={QUEUE} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      </Layer>
      <Layer x={s * 0.22} y={s * 0.22} w={s * 0.42} h={s * 0.52} style={step}>
        <Shark size={s * 0.5} flip tilt={6} />
      </Layer>
      <Layer x={s * 0.64} y={s * 0.1} w={s * 0.26} h={s * 0.26} style={timer}>
        <View style={styles.timerBadge}>
          <Animated.View style={[styles.timerFill, fill]} />
          <GameIcon name="timer" size={s * 0.15} />
        </View>
      </Layer>
      <Layer x={s * 0.64} y={s * 0.1} w={s * 0.26} h={s * 0.26} style={gift}>
        <GameIcon name="gift" size={s * 0.26} />
      </Layer>
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  burst: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 10, height: 30, borderRadius: 5, backgroundColor: BRAND.goldLight, borderWidth: 2, borderColor: BRAND.white },
  book: {
    position: 'absolute', borderRadius: 22, backgroundColor: '#0b5aa0', borderWidth: 4, borderColor: BRAND.white,
    borderBottomWidth: 8, borderBottomColor: '#073f73',
  },
  scene: { position: 'absolute', borderRadius: 22, overflow: 'hidden', borderWidth: 4, borderColor: BRAND.white },
  shadow: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(5,52,110,0.28)' },
  timerBadge: {
    flex: 1, borderRadius: 999, backgroundColor: BRAND.white, borderWidth: 4, borderColor: BRAND.navy, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  timerFill: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '100%', backgroundColor: BRAND.goldLight, transformOrigin: 'bottom' },
});
