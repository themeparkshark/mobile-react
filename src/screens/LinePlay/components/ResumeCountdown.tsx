/**
 * Quick 3-2-1 after a manual pause. Short (about a second) so resuming feels
 * instant, but long enough to get a thumb back on the phone. Each number
 * punches in with a haptic tick on the same frame; reduced motion keeps the
 * numbers and ticks without the scale punch. Tapping anywhere skips it.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring,
  withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { playSfx } from '../../../gamekit/SFX';
import { BRAND } from '../../../ui';

const STEP_MS = 340;

export default function ResumeCountdown({ active, onDone }: { active: boolean; onDone: () => void }) {
  const reducedMotion = useReducedGameMotion();
  const [count, setCount] = useState(3);
  const punch = useSharedValue(1);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  // Back to 3 as soon as it hides, so the next countdown never opens on the last run's 1.
  useEffect(() => {
    if (!active) setCount(3);
    else finished.current = false;
  }, [active]);

  // One number at a time: each step is timed from the render that shows it, so a busy JS thread can
  // only make a number stay a little longer, never skip 2 and 1 (timers that all fire late in one
  // batch used to jump from 3 straight to the game on an iPhone SE).
  useEffect(() => {
    if (!active || finished.current) return undefined;
    void Haptics.selectionAsync();
    playSfx('countdown', 0.6);
    cancelAnimation(punch);
    punch.value = reducedMotion ? 1 : withSequence(withTiming(1.3, { duration: 90 }),
      withSpring(1, { damping: 10, stiffness: 300 }));
    const timer = setTimeout(() => (count > 1 ? setCount(count - 1) : finish()), STEP_MS);
    return () => clearTimeout(timer);
    // A step depends only on whether it runs and which number shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, count]);

  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: punch.value }] }));
  if (!active) return null;
  return <Pressable style={styles.scrim} onPress={finish} accessibilityRole="button"
    accessibilityLabel={`Resuming in ${count}. Tap to resume now.`}>
    <Animated.View style={[styles.bubble, numberStyle]}>
      <Text style={styles.number}>{count}</Text>
    </Animated.View>
    {/* On a navy pill, so the words read over any page behind the scrim (board tiles, stars). */}
    <View style={styles.hintPill}>
      <Text style={styles.hint}>Back in line</Text>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: BRAND.scrim, alignItems: 'center',
    justifyContent: 'center', zIndex: 40 },
  bubble: { width: 132, height: 132, borderRadius: 66, backgroundColor: BRAND.gold, borderWidth: 4,
    borderColor: BRAND.navy, borderBottomWidth: 8, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: 'Shark', fontSize: 74, color: BRAND.navy, marginTop: 6 },
  hintPill: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 6, borderRadius: 999,
    backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white },
  hint: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, marginTop: 2 },
});
