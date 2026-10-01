/**
 * The walking shark leaves a short trail of gold sparkles on the ground: one
 * every few metres of real walking, each popping in and fading out over a
 * couple of seconds (see pushTrail). They are map markers, so they stay where
 * the shark was while the map glides under it. Calm (Reduce Motion) and a
 * paused map leave no trail.
 */
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Marker } from '../Marker';
import { hash01 } from './ambientBudget';
import { useMapAlive } from './MapAliveContext';
import { pushTrail, TRAIL_LIFE_MS, type TrailPoint } from './presence';

const SPARKLE = require('../../../../assets/images/map/fx/sparkle.png');

function TrailSparkle({ seed }: { readonly seed: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: TRAIL_LIFE_MS - 100, easing: Easing.linear });
  }, [p]);
  const drift = (hash01(seed) - 0.5) * 10;
  const spin = 40 + hash01(seed + 1) * 80;
  const big = useAnimatedStyle(() => {
    const pop = Math.min(1, p.value / 0.08);
    const fade = p.value > 0.45 ? Math.max(0, (1 - p.value) / 0.55) : 1;
    return { opacity: fade, transform: [{ translateX: drift * p.value }, { translateY: -8 * p.value },
      { scale: (0.3 + pop * 0.7) * (0.75 + 0.25 * fade) }, { rotate: `${p.value * spin}deg` }] };
  });
  const dot = useAnimatedStyle(() => ({ opacity: p.value < 0.6 ? 1 - p.value / 0.6 : 0, transform: [{ translateY: 4 + p.value * 6 }] }));
  return (
    <View style={styles.box}>
      <Animated.View style={[styles.dot, dot]} />
      <Animated.Image source={SPARKLE} tintColor="#ffe27a" resizeMode="contain" style={[styles.sparkle, big]} />
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
    setPoints(current => pushTrail(current, { latitude, longitude }, Date.now(), { cap: caps.trail }));
  }, [latitude, longitude, running, caps.trail]);
  // Clear the trail once the newest sparkle has faded.
  useEffect(() => {
    if (!points.length) return;
    const timer = setTimeout(() => setPoints(current => current.filter(point => Date.now() - point.at < TRAIL_LIFE_MS)), TRAIL_LIFE_MS + 50);
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
  sparkle: { position: 'absolute', width: 18, height: 18 },
  dot: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff6cf' },
});
