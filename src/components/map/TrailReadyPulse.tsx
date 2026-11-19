/**
 * Fix w4 T114: wraps the Rewards button. When a Trail Box finishes walking (pulseKey bumps) the button gives one
 * spring pulse on the UI thread and a short "Box ready!" label sits beside it, then everything rests. Reduce Motion
 * keeps only the label. The label wears the button's own count badge look (gold, white rim, navy Shark type).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import { BRAND, SHADOW } from '../../ui';
import { SPRING } from '../../ui/motion';
import useUiReducedMotion from '../../ui/useUiReducedMotion';

/** How long the "Box ready!" label stays beside the button. */
export const TRAIL_READY_LABEL_MS = 2400;
const SIZE = 54;

export default function TrailReadyPulse({ pulseKey, children }: { readonly pulseKey: number; readonly children: ReactNode }) {
  const reduced = useUiReducedMotion();
  const pulse = useSharedValue(1);
  const [label, setLabel] = useState(false);
  const shown = useRef(pulseKey);
  useEffect(() => {
    if (!pulseKey || pulseKey === shown.current) return undefined;
    shown.current = pulseKey;
    if (!reduced) pulse.value = withSequence(withSpring(1.18, SPRING.pop), withSpring(1, SPRING.settle));
    setLabel(true);
    haptic('tapLight');
    const timer = setTimeout(() => setLabel(false), TRAIL_READY_LABEL_MS);
    return () => clearTimeout(timer);
  }, [pulseKey, reduced, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View style={pulseStyle}>
      {children}
      {label && <View style={styles.label} pointerEvents="none" accessibilityLiveRegion="polite" accessibilityLabel="Trail Box ready">
        <Text style={styles.text} numberOfLines={1}>Box ready!</Text>
      </View>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  label: { position: 'absolute', right: SIZE + 8, top: SIZE / 2 - 14, height: 28, paddingHorizontal: 10, borderRadius: 14,
    backgroundColor: BRAND.gold, borderWidth: 2.5, borderColor: BRAND.white, justifyContent: 'center', ...SHADOW.card },
  text: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 13 },
});
