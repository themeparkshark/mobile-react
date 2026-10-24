/**
 * The gold of every big moment, drawn from the house reveal art (no new art):
 * a warm glow, two tinted ray fans turning against each other, a white-hot core,
 * a sparkle burst and a shine sweep. Used by the ride-coin reveal, the coin
 * level-up, Set Complete and the chest and box openings, so they all glow the
 * same way.
 *
 * Cheap: images only (no SVG, no layout callbacks), every frame on the UI
 * thread from shared values the moment already owns. The slow ray turn runs
 * only while the power budget allows ambient loops (not idle, not Battery
 * Saver idle, not in the background) and never with Reduce Motion.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { usePowerBudget } from '../power';
import { DURATION, GOLD_FX, raysMayTurn } from './motion';

const SOFT = require('../../assets/images/reveal/soft-spot.webp');
const RAYS = require('../../assets/images/reveal/rays-tint.webp');
const RAYS_18 = require('../../assets/images/reveal/rays-tint-18.webp');
const SPARK = require('../../assets/fx/spark.webp');
const TWINKLE = require('../../assets/fx/star-twinkle.webp');

export function GoldBurst({ size, amount, bloom, spin = true, reduced = false, style }: {
  /** Diameter of the ray fan. The glow fills about the same circle. */
  readonly size: number;
  /** 0 hidden, about 0.35 while gathering, 1 at full glow. */
  readonly amount: SharedValue<number>;
  /** A swell on the burst frame: 0, up to 1, back to 0. */
  readonly bloom?: SharedValue<number>;
  /** Let the rays turn slowly while the moment is on screen. */
  readonly spin?: boolean;
  readonly reduced?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const budget = usePowerBudget();
  const turn = useSharedValue(0);
  const turning = spin && raysMayTurn(budget, reduced);
  useEffect(() => {
    if (!turning) { cancelAnimation(turn); return undefined; }
    turn.value = withRepeat(withTiming(turn.value + 360, { duration: DURATION.raySpin, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [turning, turn]);

  const glowStyle = useAnimatedStyle(() => {
    const a = amount.value;
    const b = bloom ? bloom.value : 0;
    return { opacity: Math.min(1, 0.85 * a + 0.15 * b), transform: [{ scale: 0.55 + 0.45 * a + 0.3 * b }] };
  });
  const raysStyle = useAnimatedStyle(() => {
    const a = amount.value;
    const b = bloom ? bloom.value : 0;
    return { opacity: 0.95 * a, transform: [{ rotate: `${turn.value}deg` }, { scale: 0.55 + 0.45 * a + 0.12 * b }] };
  });
  const softRaysStyle = useAnimatedStyle(() => {
    const a = amount.value;
    return { opacity: 0.7 * a, transform: [{ rotate: `${9 - turn.value * 0.6}deg` }, { scale: 0.45 + 0.35 * a }] };
  });
  const coreStyle = useAnimatedStyle(() => {
    const a = amount.value;
    const b = bloom ? bloom.value : 0;
    return { opacity: Math.min(1, 0.55 * a + 0.6 * b), transform: [{ scale: 0.8 + 0.5 * b }] };
  });

  const box = { width: size, height: size };
  const core = size * 0.42;
  return (
    <View pointerEvents="none" style={[styles.center, box, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor={GOLD_FX.glow} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, softRaysStyle]}>
        <Image source={RAYS} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor={GOLD_FX.raysSoft} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, raysStyle]}>
        <Image source={RAYS_18} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor={GOLD_FX.rays} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', width: core, height: core }, coreStyle]}>
        <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor={GOLD_FX.core} />
      </Animated.View>
    </View>
  );
}

interface Piece { readonly dx: number; readonly dy: number; readonly size: number; readonly spin: number; readonly twinkle: boolean; readonly delay: number }

function burstPieces(count: number, radius: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 2 ? 0.26 : 0);
    const reach = radius * (0.72 + ((i * 37) % 30) / 100);
    return {
      dx: Math.cos(angle) * reach,
      dy: Math.sin(angle) * reach,
      size: 16 + ((i * 53) % 14),
      spin: (i % 2 ? 1 : -1) * (60 + ((i * 29) % 60)),
      twinkle: i % 3 === 0,
      delay: (i % 4) * 0.04,
    };
  });
}

/** Gold sparkles flying out from the centre on one shared progress (0 to 1, one pass). */
export function SparkleBurst({ progress, count, radius }: {
  readonly progress: SharedValue<number>;
  /** Already budgeted (momentParticles). 0 draws nothing. */
  readonly count: number;
  readonly radius: number;
}) {
  const pieces = useMemo(() => burstPieces(count, radius), [count, radius]);
  if (count <= 0) return null;
  return (
    <View pointerEvents="none" style={styles.origin}>
      {pieces.map((piece, i) => <Sparkle key={i} piece={piece} progress={progress} />)}
    </View>
  );
}

function Sparkle({ piece, progress }: { readonly piece: Piece; readonly progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const raw = (progress.value - piece.delay) / (1 - piece.delay);
    const t = Math.max(0, Math.min(1, raw));
    if (t <= 0 || t >= 1) return { opacity: 0, transform: [{ scale: 0 }] };
    const out = 1 - Math.pow(1 - t, 3);
    const pop = t < 0.22 ? t / 0.22 : 1 - (t - 0.22) * 0.75;
    return {
      opacity: t < 0.65 ? 1 : (1 - t) / 0.35,
      transform: [
        { translateX: piece.dx * out },
        { translateY: piece.dy * out + 30 * t * t },
        { rotate: `${piece.spin * t}deg` },
        { scale: Math.max(0, pop) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: -piece.size / 2, top: -piece.size / 2, width: piece.size, height: piece.size }, style]}>
      <Image source={piece.twinkle ? TWINKLE : SPARK} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    </Animated.View>
  );
}

/**
 * One bright band sweeping across a round face (a coin, a medal), driven by `progress`
 * 0 to 1 (one pass). Clipped to a circle of `size`.
 */
export function ShineSweep({ progress, size }: { readonly progress: SharedValue<number>; readonly size: number }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: t <= 0 || t >= 1 ? 0 : 1,
      transform: [{ translateX: -size * 0.9 + size * 1.8 * t }, { rotate: '22deg' }],
    };
  });
  return (
    <View pointerEvents="none" style={[styles.shineClip, { width: size, height: size, borderRadius: size / 2 }]}>
      <Animated.View style={[{ width: size * 0.34, height: size * 1.6, top: -size * 0.3 }, style]}>
        <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  origin: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  shineClip: { position: 'absolute', overflow: 'hidden', alignItems: 'center' },
});
