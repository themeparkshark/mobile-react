/**
 * Sun glints on the water: little stars that wink on and off at fixed spots in
 * the lakes and rivers on screen (see buildWaterGlints). Each spot is a map
 * marker, so it stays on the water as the map moves; the twinkle is a pure
 * function of the shared ambient clock (UI thread, frozen when the map pauses).
 */
import { memo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Marker, PARKED } from '../Marker';
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
  // A fixed pool of slots keyed by index: panning moves glints between slots instead of
  // mounting new markers mid-list (MapLibre insertReactSubview crash). Empty slots draw nothing.
  // Mounted from the map's first render (parked until water is found), so nothing inserts later.
  const parked = useRef<{ latitude: number; longitude: number }>(PARKED);
  if (parked.current === PARKED && spots.length) parked.current = spots[0];
  return <>
    {Array.from({ length: GLINT_SLOTS }, (_, slot) => {
      const spot = slot < count ? spots[slot] : undefined;
      return (
        <Marker key={`glint-${slot}`} hidden={!spot} coordinate={spot ?? parked.current}>
          <View style={styles.box}>{spot ? <Glint key={spot.seed} clock={clock} seed={spot.seed} strength={0.9 * light.glints} /> : null}</View>
        </Marker>
      );
    })}
  </>;
});

/** Water glints on the map at most (ALIVE_CAPS full waterGlints). */
export const GLINT_SLOTS = 6;

const styles = StyleSheet.create({
  box: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  glint: { width: 14, height: 14 },
});
