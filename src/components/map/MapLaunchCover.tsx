import { memo, useLayoutEffect, useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import MapCoverSky, { MAP_COVER_SKY } from './MapCoverSky';
import { armMapCover, coverLifted, useCoverPlan, type CoverPlan } from './mapCover';
import { COVER_FADE_MS, COVER_FINISH_MS, LAUNCH_HANDOFF_SHARE } from '../../constants/launchHandoff';

/**
 * The map's loading cover: light sky, Alex's clouds, the bobbing shark and the launch bar.
 * Each plan from mapCover becomes UI-thread animations here (the fade is a withDelay scheduled the
 * moment the plan commits, the bar reaches full on the same clock), so it lifts on time even while
 * the screen's JS is busy. Its own opacity starts at 1, so the first frame is always the sky. The
 * map screen draws it above its whole HUD (under the header and footer), so no button, card or tip
 * shows half-loaded on the sky.
 */
function MapLaunchCover({ style, blockTouches = false, armOnMount = false }: {
  readonly style?: StyleProp<ViewStyle>;
  /** Swallow taps while the cover is up, so a hidden button under the sky is never pressed. */
  readonly blockTouches?: boolean;
  /** The map screen: raise the cover on the screen's first frame, before any map mounts. */
  readonly armOnMount?: boolean;
}) {
  // Before useCoverPlan reads it, so the very first frame is already the sky.
  useState(() => { if (armOnMount) armMapCover(); return 0; });
  const plan = useCoverPlan();
  if (!plan.up) return null;
  return <CoverSky plan={plan} style={style} blockTouches={blockTouches} />;
}

/** How full the bar gets while the sky still waits; the rest fills as it lifts. */
export const BAR_WAIT_SHARE = 0.95;

function CoverSky({ plan, style, blockTouches }: {
  readonly plan: CoverPlan;
  readonly style?: StyleProp<ViewStyle>;
  readonly blockTouches: boolean;
}) {
  const opacity = useSharedValue(1);
  const fill = useSharedValue(plan.share ?? LAUNCH_HANDOFF_SHARE);
  // A layout effect: the animations reach the UI thread in the same commit that mounts the cover,
  // before the screen's own (slower) effects run.
  useLayoutEffect(() => {
    const tok = plan.token;
    const done = (finished?: boolean) => { 'worklet'; if (finished) runOnJS(coverLifted)(tok); };
    cancelAnimation(opacity);
    cancelAnimation(fill);
    if (plan.lifting) {
      fill.value = withTiming(1, { duration: COVER_FINISH_MS, easing: Easing.out(Easing.quad) });
      opacity.value = withDelay(COVER_FINISH_MS, withTiming(0, { duration: COVER_FADE_MS, easing: Easing.out(Easing.quad) }, done));
      return;
    }
    // One clock: the bar eases to BAR_WAIT_SHARE by the deadline and its last bit fills as the fade
    // starts, so it never sits full on a sky that is still waiting (a later plan just keeps it moving).
    const remaining = Math.max(0, plan.deadline - Date.now());
    if (plan.share !== null) fill.value = plan.share;
    opacity.value = 1;
    fill.value = withSequence(
      withTiming(BAR_WAIT_SHARE, { duration: remaining, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: COVER_FINISH_MS, easing: Easing.out(Easing.quad) }));
    opacity.value = withDelay(remaining, withTiming(0, { duration: COVER_FADE_MS, easing: Easing.out(Easing.quad) }, done));
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
      style={[StyleSheet.absoluteFill, styles.sky, style, lift]}>
      <MapCoverSky fill={fill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sky: { backgroundColor: MAP_COVER_SKY },
});

export default memo(MapLaunchCover);
