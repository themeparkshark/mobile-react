/**
 * Sun glints on the water: little stars that wink on and off at fixed spots in
 * the lakes and rivers on screen (see buildWaterGlints). Each spot is a map
 * marker, so it stays on the water as the map moves; the twinkle is a pure
 * function of the shared ambient clock (UI thread, frozen when the map pauses).
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Marker } from '../Marker';
import { hash01 } from './ambientBudget';
import { useMapAlive } from './MapAliveContext';

const SPARKLE = require('../../../../assets/images/map/fx/sparkle.png');

function Glint({ clock, seed, strength }: { clock: SharedValue<number>; seed: number; strength: number }) {
  const period = 2.4 + hash01(seed) * 2.2;
  const phase = hash01(seed + 0.5);
  const style = useAnimatedStyle(() => {
    const p = (clock.value / period + phase) % 1;
    // Mostly dark, then a quick wink: sharp in, soft out.
    const k = p < 0.28 ? Math.sin((p / 0.28) * Math.PI) : 0;
    return { opacity: k * strength, transform: [{ scale: 0.35 + k * 0.75 }, { rotate: `${p * 60}deg` }] };
  });
  return <Animated.Image source={SPARKLE} tintColor="#ffffff" resizeMode="contain" style={[styles.glint, style]} />;
}

export const WaterGlints = memo(function WaterGlints({ spots }: {
  readonly spots: readonly { latitude: number; longitude: number; seed: number }[];
}) {
  const { clock, caps, light, running } = useMapAlive();
  const count = light.glints > 0.02 && running ? Math.min(caps.waterGlints, spots.length) : 0;
  return <>
    {spots.slice(0, count).map(spot => (
      <Marker key={`${spot.latitude.toFixed(6)},${spot.longitude.toFixed(6)}`} coordinate={spot}>
        <View style={styles.box}><Glint clock={clock} seed={spot.seed} strength={0.9 * light.glints} /></View>
      </Marker>
    ))}
  </>;
});

const styles = StyleSheet.create({
  box: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  glint: { width: 14, height: 14 },
});
