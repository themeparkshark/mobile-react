/**
 * Quick 3-2-1 after a manual pause. Short (about a second) so resuming feels
 * instant, but long enough to get a thumb back on the phone. Each number
 * punches in with a haptic tick on the same frame; reduced motion keeps the
 * numbers and ticks without the scale punch. Tapping anywhere skips it.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    onDone();
  };

  useEffect(() => {
    if (!active) return;
    finished.current = false;
    [3, 2, 1].forEach((value, index) => {
      timers.current.push(setTimeout(() => {
        setCount(value);
        void Haptics.selectionAsync();
        playSfx('countdown', 0.6);
        cancelAnimation(punch);
        punch.value = reducedMotion ? 1 : withSequence(withTiming(1.3, { duration: 90 }),
          withSpring(1, { damping: 10, stiffness: 300 }));
      }, index * STEP_MS));
    });
    timers.current.push(setTimeout(finish, 3 * STEP_MS));
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
    // Starting a countdown depends only on `active`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: punch.value }] }));
  if (!active) return null;
  return <Pressable style={styles.scrim} onPress={finish} accessibilityRole="button"
    accessibilityLabel={`Resuming in ${count}. Tap to resume now.`}>
    <Animated.View style={[styles.bubble, numberStyle]}>
      <Text style={styles.number}>{count}</Text>
    </Animated.View>
    <Text style={styles.hint}>Back in line</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: BRAND.scrim, alignItems: 'center',
    justifyContent: 'center', zIndex: 40 },
  bubble: { width: 132, height: 132, borderRadius: 66, backgroundColor: BRAND.gold, borderWidth: 4,
    borderColor: BRAND.navy, borderBottomWidth: 8, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: 'Shark', fontSize: 74, color: BRAND.navy, marginTop: 6 },
  hint: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, marginTop: 14,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
});
