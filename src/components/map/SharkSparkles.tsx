import { StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { GameIcon } from '../../ui';

/** Six sparkles fan out around the shark (a tap, a cheer). One shared progress, UI thread; at rest nothing moves. */
const COUNT = 6;
const ANGLES = Array.from({ length: COUNT }, (_, i) => (-90 + (i - (COUNT - 1) / 2) * 32) * Math.PI / 180);

function Sparkle({ burst, angle, i }: { readonly burst: SharedValue<number>; readonly angle: number; readonly i: number }) {
  const style = useAnimatedStyle(() => {
    const p = burst.value;
    if (p <= 0 || p >= 1) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0.4 }] };
    const r = 22 + 38 * p * (i % 2 ? 0.85 : 1);
    return { opacity: p < 0.2 ? p * 5 : 1 - (p - 0.2) / 0.8,
      transform: [{ translateX: Math.cos(angle) * r }, { translateY: Math.sin(angle) * r }, { scale: 0.55 + 0.5 * Math.sin(p * Math.PI) }] };
  });
  return <Reanimated.View style={[styles.spark, style]}><GameIcon name="sparkle" size={18} /></Reanimated.View>;
}

export function SharkSparkles({ burst }: { readonly burst: SharedValue<number> }) {
  return (
    <View pointerEvents="none" style={styles.origin}>
      {ANGLES.map((angle, i) => <Sparkle key={i} burst={burst} angle={angle} i={i} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  // Around the shark's head in its 100 x 110 box.
  origin: { position: 'absolute', left: 50, top: 62, width: 0, height: 0 },
  spark: { position: 'absolute', left: -9, top: -9, width: 18, height: 18 },
});
