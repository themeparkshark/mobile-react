/**
 * The walking shark leaves a trail of gold sparkles on the ground: one every
 * few metres of real walking, each popping in, twinkling, then fading after
 * about 40 s, so the path you walked peeks out behind the shark (see
 * pushTrail). They are map markers, so they stay where the shark was while
 * the map glides under it. Calm (Reduce Motion) and a
 * paused map leave no trail.
 */
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { Marker } from '../Marker';
import { hash01 } from './ambientBudget';
import { useMapAlive } from './MapAliveContext';
import { pushTrail, TRAIL_LIFE_MS, type TrailPoint } from './presence';

const SPARKLE = require('../../../../assets/images/map/fx/sparkle.png');

function TrailSparkle({ seed }: { readonly seed: number }) {
  const { clock } = useMapAlive();
  // Life: pop in, twinkle on the shared clock, fade over the last third.
  const life = useSharedValue(0);
  useEffect(() => {
    life.value = withTiming(1, { duration: TRAIL_LIFE_MS - 200, easing: Easing.linear });
  }, [life]);
  const phase = hash01(seed);
  const big = useAnimatedStyle(() => {
    const pop = Math.min(1, life.value / 0.004);
    const fade = life.value > 0.66 ? Math.max(0, (1 - life.value) / 0.34) : 1;
    const twinkle = 0.65 + 0.35 * Math.sin((clock.value / 1.7 + phase) * Math.PI * 2);
    return { opacity: fade * twinkle, transform: [{ scale: (0.4 + pop * 0.6) * (0.8 + 0.25 * twinkle) }, { rotate: `${(clock.value * 20 + phase * 90) % 360}deg` }] };
  });
  const dot = useAnimatedStyle(() => ({ opacity: life.value > 0.66 ? Math.max(0, (1 - life.value) / 0.34) * 0.9 : 0.9 }));
  return (
    <View style={styles.box}>
      <Animated.View style={[styles.dot, dot]} />
      <Animated.Image source={SPARKLE} resizeMode="contain" style={[styles.sparkle, big]} />
    </View>
  );
}

export const SharkTrail = memo(function SharkTrail({ latitude, longitude }: {
  readonly latitude: number | null;
  readonly longitude: number | null;
}) {
  const { caps, running } = useMapAlive();
  const [points, setPoints] = useState<readonly TrailPoint[]>([]);
  useEffect(() => {
    if (latitude === null || longitude === null || !running || caps.trail <= 0) {
      setPoints(current => (current.length ? [] : current));
      return;
    }
    setPoints(current => pushTrail(current, { latitude, longitude }, Date.now(), { cap: caps.trail, minMeters: 7 }));
  }, [latitude, longitude, running, caps.trail]);
  // Drop each sparkle once it has faded.
  useEffect(() => {
    if (!points.length) return;
    const oldest = points[0].at;
    const timer = setTimeout(() => setPoints(current => current.filter(point => Date.now() - point.at < TRAIL_LIFE_MS)),
      Math.max(500, oldest + TRAIL_LIFE_MS - Date.now() + 50));
    return () => clearTimeout(timer);
  }, [points]);
  return <>
    {points.map(point => (
      <Marker key={point.id} coordinate={point}><TrailSparkle seed={point.id} /></Marker>
    ))}
  </>;
});

const styles = StyleSheet.create({
  box: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  sparkle: { position: 'absolute', width: 16, height: 16 },
  dot: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff6cf' },
  wake: { position: 'absolute', bottom: 10, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  wakeSparkle: { position: 'absolute', width: 17, height: 17, marginLeft: -8.5, marginTop: -8.5 },
});

/**
 * The shark's wake while it walks: gold sparkles spill from under its feet and
 * drift away behind it, fading. Screen space (it rides with the shark), so it
 * reads at any zoom, where the ground trail above can sit under the shark.
 * `moving` eases to 1 on each real step and back to 0 when the shark stops, so
 * a shark standing still has no wake. `trail` (radians, from the map) turns the
 * wake to stream opposite the direction of travel; 0 streams down the screen.
 */
export const SharkWake = memo(function SharkWake({ moving, trail }: {
  readonly moving: SharedValue<number>;
  readonly trail?: SharedValue<number>;
}) {
  const { clock, caps, running } = useMapAlive();
  // Hooks before the early return (rules of hooks).
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${trail ? trail.value : 0}rad` }] }), [trail]);
  if (!running || caps.trail <= 0) return null;
  return <Animated.View pointerEvents="none" style={[styles.wake, turn]}>
    {Array.from({ length: Math.min(6, caps.trail) }, (_, k) => <WakeSparkle key={k} k={k} n={Math.min(6, caps.trail)} clock={clock} moving={moving} />)}
  </Animated.View>;
});

function WakeSparkle({ k, n, clock, moving }: { k: number; n: number; clock: SharedValue<number>; moving: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const cycle = clock.value / 1.3 + k / n;
    const p = cycle - Math.floor(cycle);
    const lane = hash01(Math.floor(cycle) * 7 + k) - 0.5;
    return {
      opacity: moving.value * (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85),
      transform: [{ translateX: lane * 34 }, { translateY: p * 34 }, { scale: 0.9 - p * 0.5 }, { rotate: `${p * 140}deg` }],
    };
  });
  return <Animated.Image source={SPARKLE} resizeMode="contain" style={[styles.wakeSparkle, style]} />;
}
