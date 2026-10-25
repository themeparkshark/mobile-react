/**
 * Quick 3-2-1 after a manual pause. Short (about a second) so resuming feels
 * instant, but long enough to get a thumb back on the phone. Each number
 * punches in with a haptic tick; reduced motion keeps the numbers and ticks
 * without the scale punch. Tapping anywhere skips it.
 *
 * The numbers run on the UI thread from a frame clock whose step is capped
 * (one frame never moves it more than MAX_STEP_MS), so neither a busy JS
 * thread nor one long UI frame (the board mounting as Details closes) can skip
 * 2 or 1: on a loaded iPhone SE, JS timers jumped from 3 straight back to the
 * game. The clock is back at 0 whenever the countdown hides, so it always opens on 3.
 *
 * The game comes back under the 1 (HANDOVER_AT, part way into its step), so the JS thread has time to
 * lay it out while the 1 is still up. The 1 always gets its full step, like the 3 and the 2, and then the
 * scrim fades on the UI thread. When the tap asked for the arcade or a page, the parent keeps `released`
 * false until that result is on screen, so the 1 holds and no frame shows the game board live in between.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useFrameCallback, useSharedValue, withDelay, withTiming,
  type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { playSfx } from '../../../gamekit/SFX';
import { BRAND } from '../../../ui';

const STEP_MS = 340;
/** The most one frame can move the clock, so a hitch never skips a number. */
const MAX_STEP_MS = 34;
/** How long after hiding the clock goes back to 0 (the hidden frame is long painted by then). */
const RESET_DELAY_MS = 250;
/** How long each number's punch (1.3 down to 1) lasts, as a share of its step. */
const PUNCH_SHARE = 0.4;
/** The scrim's fade as it hands over to the game, the arcade or the page (UI thread, after the 1's full step). */
const EXIT_FADE_MS = 140;
/** Where the game comes back: 40% into the 1, about 200 ms before the 1 ends, so the 3, 2 and 1 each get one even beat. */
const HANDOVER_AT = 2.4;
/** The clock's end: the 1's step (to 3), then the fade (reduced motion: no fade, one frame). */
const FADE_UNITS = EXIT_FADE_MS / STEP_MS;
const END = 3 + FADE_UNITS;

/** The haptic tick and sound for each number, on the JS thread. */
function tick() {
  void Haptics.selectionAsync();
  playSfx('countdown', 0.6);
}

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

export default function ResumeCountdown({ active, released, onDone, onHidden }: {
  active: boolean;
  /** The parent's result (the game, the arcade sheet, the page) is on screen: after the 1's step, fade. */
  released: boolean;
  /** The game comes back (under the 1). */
  onDone: () => void;
  /** The fade has finished: the parent unmounts it. */
  onHidden: () => void;
}) {
  const reducedMotion = useReducedGameMotion();
  /** 0 to END: the 3 shows in [0, 1), the 2 in [1, 2), the 1 from 2 to 3 and on through the fade. */
  const clock = useSharedValue(0);
  /** Set from JS when the parent lets go; until then the clock holds at 3 (still on the 1). */
  const releasedSv = useSharedValue(false);
  const sleeping = useSharedValue(false);
  const releasedRef = useRef(false);
  const finished = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const hiddenRef = useRef(onHidden);
  hiddenRef.current = onHidden;

  const frameRef = useRef<{ setActive: (on: boolean) => void } | null>(null);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    doneRef.current();
  }, []);
  /** A tap skips to the end of the 1; the fade still waits for the parent's result. */
  const skip = useCallback(() => {
    clock.value = Math.max(clock.value, 3);
    finish();
  }, [clock, finish]);
  // Holding on the 1 for a hand-off: the frame clock stops, so a hold costs no frame work.
  const sleep = useCallback(() => {
    if (!releasedRef.current) frameRef.current?.setActive(false);
  }, []);
  const hidden = useCallback(() => hiddenRef.current(), []);

  const frame = useFrameCallback(info => {
    'worklet';
    const before = clock.value;
    const cap = releasedSv.value ? END : 3;
    if (before >= cap) {
      if (!releasedSv.value && !sleeping.value) { sleeping.value = true; runOnJS(sleep)(); }
      return;
    }
    // Reduced motion: no fade, the scrim leaves in one frame after the 1.
    const after = before >= 3 && reducedMotion ? cap
      : Math.min(cap, before + Math.min(info.timeSincePreviousFrame ?? 16, MAX_STEP_MS) / STEP_MS);
    clock.value = after;
    // The 2 and the 1 tick on the frame they appear.
    if (Math.floor(after) > Math.floor(before) && after < 3) runOnJS(tick)();
    if (before < HANDOVER_AT && after >= HANDOVER_AT) runOnJS(finish)();
    if (before < END && after >= END) runOnJS(hidden)();
  }, false);
  frameRef.current = frame;

  useEffect(() => {
    if (!active) return undefined;
    finished.current = false;
    clock.value = 0;
    releasedRef.current = false;
    releasedSv.value = false;
    sleeping.value = false;
    tick();
    frame.setActive(true);
    return () => {
      frame.setActive(false);
      // Back to 0 once it has hidden (on the UI thread, a moment later, so the closing frame keeps the 1
      // instead of flashing a 3), so the next countdown never opens on the last run's 1.
      clock.value = withDelay(RESET_DELAY_MS, withTiming(0, { duration: 0 }));
    };
    // Starting a countdown depends only on `active`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active || !released || releasedRef.current) return;
    releasedRef.current = true;
    releasedSv.value = true;
    sleeping.value = false;
    frame.setActive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, released]);

  // The scrim fades on the UI thread over the last part of the clock (after the 1's full step).
  const hostStyle = useAnimatedStyle(() => ({
    opacity: clock.value <= 3 ? 1 : Math.max(0, 1 - (clock.value - 3) / FADE_UNITS),
  }));

  if (!active) return null;
  return <Animated.View style={[styles.scrimHost, hostStyle]}>
    <Pressable style={styles.scrim} onPress={skip} accessibilityRole="button"
      accessibilityLabel="Resuming in 3 2 1. Tap to resume now.">
      <View style={styles.bubble}>
        {[3, 2, 1].map((value, index) => <CountNumber key={value} value={value} index={index} clock={clock}
          reducedMotion={reducedMotion} />)}
      </View>
      {/* On a navy pill, so the words read over any page behind the scrim (board tiles, stars). */}
      <View style={styles.hintPill}>
        <Text style={styles.hint}>Back in line</Text>
      </View>
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  scrimHost: { ...StyleSheet.absoluteFillObject, zIndex: 40 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: BRAND.scrim, alignItems: 'center',
    justifyContent: 'center' },
  bubble: { width: 132, height: 132, borderRadius: 66, backgroundColor: BRAND.gold, borderWidth: 4,
    borderColor: BRAND.navy, borderBottomWidth: 8, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: 'Shark', fontSize: 74, color: BRAND.navy, marginTop: 6 },
  // The 2 and the 1 sit exactly over the 3 (one bubble, three stacked numbers).
  numberStacked: { position: 'absolute' },
  hintPill: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 6, borderRadius: 999,
    backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white },
  hint: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, marginTop: 2 },
});
