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
 * The game comes back under the 1 (HANDOVER_AT, once the 1's punch has settled, so no number or scale is
 * changing when that big render lands: a React commit while the UI thread is still writing a number's props
 * can briefly show a stale number). A plain resume then lets go when the 1's step ends, with the parent's
 * timer set from the clock, so the 3, 2 and 1 each get one even beat. When the tap asked for the arcade or a
 * page, the parent keeps it mounted (still on the 1) until that result is on screen, so no frame shows the
 * game board live in between. It always leaves by unmounting with a UI-thread FadeOut.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, runOnJS, useAnimatedStyle, useFrameCallback, useSharedValue, withDelay, withTiming,
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
/** Where the game comes back: once the 1's punch has settled (PUNCH_SHARE into its step), about 200 ms before the 1 ends. */
const HANDOVER_AT = 2 + PUNCH_SHARE;

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

function ResumeCountdown({ active, onDone, onHidden }: {
  active: boolean;
  /**
   * The game comes back (under the 1). Return true for a plain resume (nothing to hand over to): the countdown
   * then hides itself the moment the 1's step ends, with a render of only this small component.
   */
  onDone: () => boolean;
  /** It has hidden itself (a plain resume): the parent can let go of it whenever it is free. */
  onHidden: () => void;
}) {
  const reducedMotion = useReducedGameMotion();
  /** 0 to 3: the 3 shows in [0, 1), the 2 in [1, 2), the 1 from 2 until it hides. */
  const clock = useSharedValue(0);
  /** A plain resume: hide at the end of the 1 (read on the UI thread). */
  const plain = useSharedValue(false);
  const [hiddenSelf, setHiddenSelf] = useState(false);
  const finished = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const hiddenRef = useRef(onHidden);
  hiddenRef.current = onHidden;

  const frameRef = useRef<{ setActive: (on: boolean) => void } | null>(null);

  // Its own small render (not the whole screen's), so the beat after the 1 does not wait on a busy JS thread.
  const hideSelf = useCallback(() => setHiddenSelf(true), []);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    if (doneRef.current() !== true) return;
    plain.value = true;
    // The JS thread was late and the 1's step is already over: hide now.
    if (clock.value >= 3) hideSelf();
  }, [clock, plain, hideSelf]);
  /** A tap skips to the end of the 1. */
  const skip = useCallback(() => {
    clock.value = 3;
    finish();
  }, [clock, finish]);
  // Done counting: the frame clock stops, so holding on the 1 for a hand-off costs no frame work.
  const sleep = useCallback(() => frameRef.current?.setActive(false), []);

  const frame = useFrameCallback(info => {
    'worklet';
    const before = clock.value;
    if (before >= 3) return;
    const after = Math.min(3, before + Math.min(info.timeSincePreviousFrame ?? 16, MAX_STEP_MS) / STEP_MS);
    clock.value = after;
    // The 2 and the 1 tick on the frame they appear.
    if (Math.floor(after) > Math.floor(before) && after < 3) runOnJS(tick)();
    if (before < HANDOVER_AT && after >= HANDOVER_AT) runOnJS(finish)();
    if (after >= 3) {
      runOnJS(sleep)();
      if (plain.value) runOnJS(hideSelf)();
    }
  }, false);
  frameRef.current = frame;

  useEffect(() => {
    if (!active) return undefined;
    finished.current = false;
    clock.value = 0;
    plain.value = false;
    tick();
    frame.setActive(true);
    return () => {
      frame.setActive(false);
      setHiddenSelf(false);
      // Back to 0 once it has hidden (on the UI thread, a moment later, so the closing frame keeps the 1
      // instead of flashing a 3), so the next countdown never opens on the last run's 1.
      clock.value = withDelay(RESET_DELAY_MS, withTiming(0, { duration: 0 }));
    };
    // Starting a countdown depends only on `active`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Tell the parent a frame after it has hidden, so the screen's big render never delays the fade.
  useEffect(() => {
    if (!hiddenSelf) return undefined;
    const id = requestAnimationFrame(() => hiddenRef.current());
    return () => cancelAnimationFrame(id);
  }, [hiddenSelf]);

  if (!active || hiddenSelf) return null;
  return <Animated.View style={styles.scrimHost} exiting={reducedMotion ? undefined : FadeOut.duration(EXIT_FADE_MS)}>
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

/**
 * Renders only when it starts or hides. A render mid-count would hand the numbers the JS thread's copy of
 * the clock (useAnimatedStyle's render-time value) and could show a stale number for a frame.
 */
export default memo(ResumeCountdown, (a, b) => a.active === b.active);

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
