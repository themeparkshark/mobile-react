/**
 * Black cover while the phone is face down or in a pocket, Battery Saver only.
 * Reads the accelerometer twice a second (the sensor is not used at all when
 * Saver is off or the app is in the background). Touches pass through.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { POCKET_START, nextPocketState, type PocketState } from './pocketPolicy';

const SAMPLE_MS = 500;

export default function PocketDim({ enabled }: { readonly enabled: boolean }) {
  const [dim, setDim] = useState(false);
  useEffect(() => {
    if (!enabled) { setDim(false); return undefined; }
    let state: PocketState = POCKET_START;
    let sub: { remove(): void } | null = null;
    try {
      Accelerometer.setUpdateInterval(SAMPLE_MS);
      sub = Accelerometer.addListener(sample => {
        const next = nextPocketState(state, sample, Date.now());
        if (next.dim !== state.dim) setDim(next.dim);
        state = next;
      });
    } catch {
      // No sensor (simulator): no dim, nothing else changes.
    }
    return () => { sub?.remove(); setDim(false); };
  }, [enabled]);
  if (!dim) return null;
  return <View pointerEvents="none" style={styles.cover} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 9999, elevation: 9999 },
});
