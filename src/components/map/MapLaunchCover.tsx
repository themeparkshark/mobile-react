import { memo, useLayoutEffect, useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing, cancelAnimation, runOnJS, runOnUI, useAnimatedStyle, useFrameCallback, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import MapCoverSky, { MAP_COVER_SKY } from './MapCoverSky';
import { armMapCover, coverLifted, useCoverPlan, type CoverPlan } from './mapCover';
import {
  COVER_FADE_MS, COVER_FINISH_MS, COVER_SMOOTH_FRAMES, COVER_SMOOTH_WAIT_MS, LAUNCH_HANDOFF_SHARE,
} from '../../constants/launchHandoff';
import LaunchScene, { LAUNCH_BLUE, launchFill } from '../launch/LaunchScene';

/**
 * The map's loading cover. Each plan from mapCover becomes UI-thread animations here (the fade is a
 * withDelay scheduled the moment the plan commits, the bar creeps to the plan's honest ceiling on
 * the same clock and fills the rest as the cover lifts), so it lifts on time even while the
 * screen's JS is busy. Its own opacity starts at 1, so the first frame is always covered.
 *
 * Two looks:
 * - "launch": the app's first cover is the launch scene (Alex's splash art, bubbles, the fun fact
 *   and the one launch bar, exactly where the Loading screen had them) over the whole screen, so
 *   the native splash, the Splash route, the Loading screen and this cover read as one splash with
 *   one bar, then the game arrives in one fade.
 * - "sky": a later cover (walking into a park) is the light sky with Alex's clouds and the shark,
 *   under the header and footer.
 * "any" (preview screens, where the map draws its own cover) shows the sky for both.
 */
function MapLaunchCover({ style, blockTouches = false, armOnMount = false, variant = 'any' }: {
  readonly style?: StyleProp<ViewStyle>;
  /** Swallow taps while the cover is up, so a hidden button under the sky is never pressed. */
  readonly blockTouches?: boolean;
  /** The map screen: raise the cover on the screen's first frame, before any map mounts. */
  readonly armOnMount?: boolean;
  readonly variant?: 'launch' | 'sky' | 'any';
}) {
  // Before useCoverPlan reads it, so the very first frame is already covered.
  useState(() => { if (armOnMount) armMapCover(); return 0; });
  const plan = useCoverPlan();
  if (!plan.up) return null;
  if (variant === 'launch' && !plan.launch) return null;
  if (variant === 'sky' && plan.launch) return null;
  return <CoverSky plan={plan} style={style} blockTouches={blockTouches} launch={variant === 'launch'} />;
}

function CoverSky({ plan, style, blockTouches, launch }: {
  readonly plan: CoverPlan;
  readonly style?: StyleProp<ViewStyle>;
  readonly blockTouches: boolean;
  readonly launch: boolean;
}) {
  const opacity = useSharedValue(1);
  const ownFill = useSharedValue(plan.share ?? LAUNCH_HANDOFF_SHARE);
  // The launch cover fills the one launch bar the Splash route and Loading screen were filling.
  const fill = launch ? launchFill : ownFill;
  // The lift, once the map has drawn: it starts on the first run of smooth frames (the map's first
  // tiles and pins can hold the UI thread for a moment), so the 0.24 s fade never stutters into a
  // half-faded double picture. -1: no lift asked for. Runs only while a lift is waiting.
  const liftAskedAt = useSharedValue(-1);
  const smoothFrames = useSharedValue(0);
  // The token the cover reports when its fade ends: always the newest plan's, so a fade that began
  // under an older plan still lifts the cover the moment it finishes.
  const liftToken = useSharedValue(plan.token);
  // 1 once the lift has begun (the gate started it, or the deadline fade is under way). From then on
  // no newer plan touches the fade: the cover only ever goes down, never back up to full (a second
  // map mounting mid-fade used to snap it back and fade it again, a long half-faded double picture).
  const liftStarted = useSharedValue(0);
  const liftGate = useFrameCallback((info) => {
    'worklet';
    if (liftAskedAt.value < 0) return;
    if (liftAskedAt.value === 0) liftAskedAt.value = info.timestamp;
    const gap = info.timeSincePreviousFrame ?? 0;
    smoothFrames.value = gap > 0 && gap < 34 ? smoothFrames.value + 1 : 0;
    if (smoothFrames.value < COVER_SMOOTH_FRAMES && info.timestamp - liftAskedAt.value < COVER_SMOOTH_WAIT_MS) return;
    liftAskedAt.value = -1;
    liftStarted.value = 1;
    cancelAnimation(fill);
    // The last stretch of the bar fills only now, as the map arrives, then the cover fades.
    fill.value = withTiming(1, { duration: COVER_FINISH_MS, easing: Easing.out(Easing.quad) });
    opacity.value = withDelay(COVER_FINISH_MS, withTiming(0, { duration: COVER_FADE_MS, easing: Easing.out(Easing.quad) },
      (finished) => { 'worklet'; if (finished) runOnJS(coverLifted)(liftToken.value); }));
  }, false);
  // A layout effect: the plan reaches the UI thread in the same commit that mounts the cover. The
  // UI thread works out the time left itself (from the plan's wall-clock deadline), so a busy UI
  // thread (the map screen's first mount) that runs this late never pushes the lift past its deadline.
  useLayoutEffect(() => {
    const tok = plan.token;
    if (plan.lifting) liftGate.setActive(true);
    runOnUI((deadline: number, share: number | null, ceiling: number, lifting: boolean) => {
      'worklet';
      liftToken.value = tok;
      // The lift has begun (or the deadline fade is already drawing): let it finish, never restart it.
      if (liftStarted.value === 1 || opacity.value < 1) { liftStarted.value = 1; liftAskedAt.value = -1; return; }
      cancelAnimation(opacity);
      if (lifting) {
        // The bar keeps creeping; the frame gate above finishes it and fades the cover.
        smoothFrames.value = 0;
        liftAskedAt.value = 0;
        return;
      }
      cancelAnimation(fill);
      liftAskedAt.value = -1;
      // Honest progress: the bar creeps at a steady pace toward this plan's ceiling (the next real
      // step, in the 70s) right up to the deadline, so it is always moving and never parks near
      // full. It fills the rest only as the cover lifts. It never moves back.
      const remaining = Math.max(0, deadline - Date.now());
      if (share !== null) fill.value = share;
      const creep = Math.max(0, remaining - COVER_FINISH_MS);
      fill.value = withSequence(
        withTiming(Math.max(fill.value, ceiling), { duration: Math.max(250, creep), easing: Easing.linear }),
        withTiming(1, { duration: COVER_FINISH_MS, easing: Easing.out(Easing.quad) }));
      opacity.value = withDelay(remaining, withTiming(0, { duration: COVER_FADE_MS, easing: Easing.out(Easing.quad) },
        (finished) => { 'worklet'; if (finished) runOnJS(coverLifted)(liftToken.value); }));
    })(plan.deadline, plan.share, plan.ceiling, plan.lifting);
  // One set of animations per plan.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.version]);
  const lift = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: 1.06 - 0.06 * opacity.value }],
  }));
  return (
    <Animated.View testID="map-launch-cover" pointerEvents={blockTouches ? 'auto' : 'none'}
      accessibilityLabel="Loading the map" accessibilityRole="progressbar"
      style={[StyleSheet.absoluteFill, launch ? styles.launch : styles.sky, style, lift]}>
      {launch ? <LaunchScene /> : <MapCoverSky fill={fill} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sky: { backgroundColor: MAP_COVER_SKY },
  launch: { backgroundColor: LAUNCH_BLUE },
});

export default memo(MapLaunchCover);
