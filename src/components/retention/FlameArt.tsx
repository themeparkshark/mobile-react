import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import useAmbientLoop from '../../power/useAmbientLoop';
import { flameLook } from '../../services/retention/loopMotion';
import { GOLD_FX } from '../../ui/motion';

const FLAME = require('../../../assets/icons/game/streak.png');
const SOFT = require('../../../assets/images/reveal/soft-spot.webp');
const SPARK = require('../../../assets/fx/spark.webp');
const CROWN = require('../../assets/games/banana-basket/v2/crown.png');

/**
 * Alex's flame, grown by the streak so a kid can read it from across the room:
 * small (1 to 2 days), medium (3 to 6), big with drifting sparks (7 to 29), a
 * white-gold hot core (30 to 99) and a gold crown (100 and up). 0 days is a
 * warm ember, never a sad grey one.
 *
 * Cheap: one ambient clock (useAmbientLoop: stops when idle, in the
 * background, in Battery Saver idle and with Reduce Motion) drives the
 * flicker and every spark on the UI thread. The box never changes size with
 * the tier (no layout jumps): the art scales inside it.
 *
 * `boost` (0..1) lets a moment swell the flame (a whoosh on +1, a charge on a milestone).
 */
export default function FlameArt({ days, size, reducedMotion, still = false, boost }: {
  readonly days: number;
  /** The box (pt). The art at scale 1 fills about 86 percent of it. */
  readonly size: number;
  readonly reducedMotion: boolean;
  /** No ambient flicker (lists, ghost flames). */
  readonly still?: boolean;
  readonly boost?: SharedValue<number>;
}) {
  const look = flameLook(days);
  const clock = useSharedValue(0);
  useAmbientLoop(
    () => { clock.value = 0; clock.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false); },
    () => { cancelAnimation(clock); clock.value = 0; },
    !still && !reducedMotion && days > 0,
  );
  const art = size * 0.86;
  const flameStyle = useAnimatedStyle(() => {
    // Two flickers per clock turn: scaleY breathes, a small lean.
    const f = Math.sin(clock.value * Math.PI * 4);
    const b = boost ? boost.value : 0;
    return { transform: [{ translateY: art * 0.05 * (1 - look.scale) }, { scale: look.scale * (1 + 0.22 * b) },
      { scaleY: 1 + 0.045 * f }, { rotate: `${2.4 * Math.sin(clock.value * Math.PI * 2)}deg` }] };
  });
  const haloStyle = useAnimatedStyle(() => {
    const b = boost ? boost.value : 0;
    return { opacity: Math.min(1, look.halo + 0.08 * Math.sin(clock.value * Math.PI * 4) + 0.4 * b),
      transform: [{ scale: 0.7 + look.scale * 0.45 + 0.25 * b }] };
  });
  const coreStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + 0.2 * Math.sin(clock.value * Math.PI * 4 + 1),
    transform: [{ scale: look.scale * (0.92 + 0.08 * Math.sin(clock.value * Math.PI * 4)) }],
  }));
  const crownStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -art * 0.5 * look.scale + 2 * Math.sin(clock.value * Math.PI * 2) }, { rotate: '-8deg' }],
  }));
  return (
    <View style={[styles.box, { width: size, height: size }]} pointerEvents="none">
      <Animated.View style={[styles.layer, { width: size * 1.1, height: size * 1.1 }, haloStyle]}>
        <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor={GOLD_FX.glow} transition={0} cachePolicy="memory-disk" />
      </Animated.View>
      {look.sparks > 0 && !still && !reducedMotion && <Sparks clock={clock} count={look.sparks} size={art} />}
      <Animated.View style={[styles.layer, { width: art, height: art }, flameStyle]}>
        <Image source={FLAME} style={[StyleSheet.absoluteFill, days <= 0 && styles.ember]} contentFit="contain" transition={0} cachePolicy="memory-disk" />
        {look.core && (
          <Animated.View style={[styles.core, { width: art * 0.44, height: art * 0.44, bottom: art * 0.1, left: art * 0.28 }, coreStyle]}>
            <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor={GOLD_FX.core} transition={0} />
          </Animated.View>
        )}
      </Animated.View>
      {look.crown && (
        <Animated.View style={[styles.layer, { width: art * 0.62, height: art * 0.62 }, crownStyle]}>
          <Image source={CROWN} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} cachePolicy="memory-disk" />
        </Animated.View>
      )}
    </View>
  );
}

/** Drifting sparks over a big flame: one shared clock, each spark on its own phase (at most 5). */
function Sparks({ clock, count, size }: { readonly clock: SharedValue<number>; readonly count: number; readonly size: number }) {
  const sparks = useMemo(() => Array.from({ length: Math.min(5, count) }, (_, i) => ({
    phase: i / Math.min(5, count), dx: ((i * 37) % 11 - 5) / 5, s: 8 + (i % 3) * 3,
  })), [count]);
  return (
    <>
      {sparks.map((sp, i) => <Spark key={i} clock={clock} phase={sp.phase} dx={sp.dx} s={sp.s} size={size} />)}
    </>
  );
}

function Spark({ clock, phase, dx, s, size }: {
  readonly clock: SharedValue<number>; readonly phase: number; readonly dx: number; readonly s: number; readonly size: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = (clock.value + phase) % 1;
    return {
      opacity: t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85,
      transform: [{ translateX: dx * size * 0.28 + Math.sin(t * Math.PI * 2) * 4 }, { translateY: -size * 0.15 - t * size * 0.55 },
        { scale: 1 - t * 0.5 }],
    };
  });
  return (
    <Animated.View style={[styles.layer, { width: s, height: s }, style]}>
      <Image source={SPARK} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} cachePolicy="memory-disk" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute' },
  core: { position: 'absolute' },
  // A resting ember: the same warm flame, a touch quieter (never grey, never sad).
  ember: { opacity: 0.88 },
});
