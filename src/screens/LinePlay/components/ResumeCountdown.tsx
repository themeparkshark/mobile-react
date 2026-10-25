/**
 * Quick 3-2-1 after a manual pause. Short (about a second) so resuming feels
 * instant, but long enough to get a thumb back on the phone. Each number
 * punches in with a haptic tick; reduced motion keeps the numbers and ticks
 * without the scale punch. Tapping anywhere skips it.
 *
 * The numbers run on the UI thread (one shared clock, three stacked numbers),
 * so a busy JS thread can never skip 2 and 1: on a loaded iPhone SE the old
 * JS timers fired late in one batch and jumped from 3 straight back to the game.
 */
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue,
  withTiming, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { playSfx } from '../../../gamekit/SFX';
import { BRAND } from '../../../ui';

const STEP_MS = 340;
/** How long each number's punch (1.3 down to 1) lasts, as a share of its step. */
const PUNCH_SHARE = 0.4;

/** One of the three stacked numbers: shown only during its own step of the shared clock. */
function CountNumber({ value, index, clock, reducedMotion }: {
  value: number; index: number; clock: SharedValue<number>; reducedMotion: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const t = clock.value - index;
    const shown = t >= 0 && (t < 1 || index === 2);
    const punch = reducedMotion || !shown ? 1 : 1 + 0.3 * Math.max(0, 1 - t / PUNCH_SHARE);
    return { opacity: shown ? 1 : 0, transform: [{ scale: punch }] };
  });
  return <Animated.Text style={[styles.number, index > 0 && styles.numberStacked, style]}>{value}</Animated.Text>;
}

export default function ResumeCountdown({ active, onDone }: { active: boolean; onDone: () => void }) {
  const reducedMotion = useReducedGameMotion();
  const clock = useSharedValue(0);
  const finished = useRef(false);
  const ticks = useRef<ReturnType<typeof setTimeout>[]>([]);

  const tick = () => {
    void Haptics.selectionAsync();
    playSfx('countdown', 0.6);
  };
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    ticks.current.forEach(clearTimeout);
    ticks.current = [];
    cancelAnimation(clock);
    onDone();
  };

  useEffect(() => {
    if (!active) return undefined;
    finished.current = false;
    // Always opens on 3: the clock restarts from 0 every time, so a second pause never flashes the last run's 1.
    clock.value = 0;
    clock.value = withTiming(3, { duration: 3 * STEP_MS, easing: Easing.linear }, done => {
      if (done) runOnJS(finish)();
    });
    // Ticks are only feel (haptic and sound); the numbers never wait for them.
    tick();
    ticks.current = [1, 2].map(step => setTimeout(tick, step * STEP_MS));
    return () => { ticks.current.forEach(clearTimeout); ticks.current = []; cancelAnimation(clock); };
    // Starting a countdown depends only on `active`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;
  return <Pressable style={styles.scrim} onPress={finish} accessibilityRole="button"
    accessibilityLabel="Resuming in 3 2 1. Tap to resume now.">
    <View style={styles.bubble}>
      {[3, 2, 1].map((value, index) => <CountNumber key={value} value={value} index={index} clock={clock}
        reducedMotion={reducedMotion} />)}
    </View>
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
  // The 2 and the 1 sit exactly over the 3 (one bubble, three stacked numbers).
  numberStacked: { position: 'absolute' },
  hintPill: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 6, borderRadius: 999,
    backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white },
  hint: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, marginTop: 2 },
});
