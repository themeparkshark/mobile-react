/**
 * Pull to refresh with the shark: refreshing is a tiny show.
 *
 *   const shark = useSharkRefresh(refreshing);
 *   <View style={{ flex: 1 }}>
 *     <AnimatedFlashList onScroll={shark.onScroll} scrollEventThrottle={16}
 *       refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor="transparent" />} ... />
 *     <SharkRefreshOverlay shark={shark} />
 *   </View>
 *
 * As you pull, the shark dives in from the top and grows from 0.6 to full size with the pull. At the
 * threshold it flips (a quick turn and a bubble) with a selection tick: let go now and it refreshes.
 * While the list reloads it swims a small loop. When the new rows are in, a splash ring and a gold
 * check pop (SPRING.pop) and it swims away up. The native spinner stays (tinted transparent) so the
 * refresh itself is the system's own, with the same feel and the same accessibility.
 * Everything runs on the UI thread (useAnimatedScrollHandler); the one haptic hops to JS once.
 * Reduce Motion: no dive or swim; the shark fades in at the threshold and the check shows at once.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
  withRepeat, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { queueHaptic } from '../gamekit/Haptics';
import GameIcon from './GameIcon';
import { DURATION, GOLD_FX, SPRING } from './motionEasing';
import { BRAND } from './tokens';
import useUiReducedMotion from './useUiReducedMotion';

export const SHARK_ART = require('../../assets/images/screens/pin-collections/shark.png');

/** The pull show's numbers (pure data, unit tested). */
export const PULL_SHOW = {
  /** Pull this far (pt) and the shark flips: let go to refresh. */
  thresholdPt: 70,
  /** The shark's size at full pull (pt). */
  artPt: 72,
  /** Smallest size as it dives in (share of artPt). */
  fromScale: 0.6,
  /** Where the shark rests while the list reloads (the native refresh gap is about 60 pt). */
  restY: 30,
  /** One small swim loop while refreshing (ms). */
  swimMs: 900,
  /** The done beat: splash ring and check (ms), then the swim away. */
  doneMs: 640,
  leaveMs: DURATION.enter,
} as const;

/** How the shark looks at a pull distance (pt). Pure: size grows with the pull, never past full. */
export function pullLook(pull: number): { scale: number; opacity: number; y: number } {
  'worklet';
  const t = Math.min(1, Math.max(0, pull / PULL_SHOW.thresholdPt));
  return {
    scale: PULL_SHOW.fromScale + (1 - PULL_SHOW.fromScale) * t,
    opacity: Math.min(1, Math.max(0, pull / 24)),
    // Dives in from above the top edge and settles in the middle of the gap.
    y: -PULL_SHOW.artPt + (pull / 2 + PULL_SHOW.artPt) * Math.min(1, t * 1.1),
  };
}

export interface SharkRefresh {
  readonly onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  readonly pull: SharedValue<number>;
  readonly flip: SharedValue<number>;
  readonly swim: SharedValue<number>;
  readonly done: SharedValue<number>;
  readonly busy: SharedValue<number>;
  readonly reduced: boolean;
}

export function useSharkRefresh(refreshing: boolean): SharkRefresh {
  const reduced = useUiReducedMotion();
  const pull = useSharedValue(0);
  const flip = useSharedValue(0);
  const swim = useSharedValue(0);
  const done = useSharedValue(0);
  const busy = useSharedValue(0);
  const armed = useSharedValue(0);
  const was = useRef(refreshing);
  const tick = () => queueHaptic('tickSelection');

  const onScroll = useAnimatedScrollHandler({
    onScroll: e => {
      const p = Math.max(0, -e.contentOffset.y);
      pull.value = p;
      if (p >= PULL_SHOW.thresholdPt && armed.value === 0 && busy.value === 0) {
        armed.value = 1;
        flip.value = withSpring(1, SPRING.pop);
        runOnJS(tick)();
      } else if (p < PULL_SHOW.thresholdPt * 0.6 && armed.value === 1 && busy.value === 0) {
        armed.value = 0;
        flip.value = withSpring(0, SPRING.settle);
      }
    },
  });

  useEffect(() => {
    if (refreshing && !was.current) {
      busy.value = 1;
      done.value = 0;
      if (!reduced) {
        swim.value = 0;
        swim.value = withRepeat(withTiming(1, { duration: PULL_SHOW.swimMs, easing: Easing.linear }), -1, false);
      }
    } else if (!refreshing && was.current) {
      cancelAnimation(swim);
      swim.value = withTiming(0, { duration: DURATION.quick });
      done.value = reduced ? 1 : withTiming(1, { duration: PULL_SHOW.doneMs + PULL_SHOW.leaveMs, easing: Easing.linear }, fin => {
        if (fin) { busy.value = 0; armed.value = 0; flip.value = 0; done.value = 0; }
      });
      if (reduced) { busy.value = 0; armed.value = 0; flip.value = 0; done.value = 0; }
    }
    was.current = refreshing;
  }, [refreshing, reduced, swim, done, busy, armed, flip]);

  return { onScroll, pull, flip, swim, done, busy, reduced };
}

/** Draw the shark over the top of the list (pointer events pass through). Put it after the list. */
export function SharkRefreshOverlay({ shark, top = 0 }: { readonly shark: SharkRefresh; readonly top?: number }) {
  const { pull, flip, swim, done, busy, reduced } = shark;
  const A = PULL_SHOW.artPt;
  const doneShare = PULL_SHOW.doneMs / (PULL_SHOW.doneMs + PULL_SHOW.leaveMs);
  const sharkStyle = useAnimatedStyle(() => {
    const look = pullLook(pull.value);
    const d = done.value;
    const leaving = d > doneShare ? (d - doneShare) / (1 - doneShare) : 0;
    const resting = busy.value === 1;
    const y = resting ? Math.max(look.y, PULL_SHOW.restY - A / 2) : look.y;
    if (reduced) return { opacity: resting || pull.value >= PULL_SHOW.thresholdPt ? 1 - leaving : 0, transform: [{ translateY: PULL_SHOW.restY - A / 2 }] };
    const a = swim.value * Math.PI * 2;
    const f = flip.value;
    return {
      opacity: (resting ? 1 : look.opacity) * (1 - leaving),
      transform: [
        { translateX: Math.sin(a) * 10 },
        { translateY: y + Math.sin(a * 2) * 3 - leaving * 46 },
        // The flip: a quick half turn on its side and back, like a happy roll in the water.
        { rotate: `${Math.sin(f * Math.PI) * -24 + Math.cos(a) * 6 * (resting ? 1 : 0)}deg` },
        { scale: resting ? 1 : look.scale },
      ],
    };
  });
  // The threshold bubble: one rises off the snout when it flips.
  const bubbleStyle = useAnimatedStyle(() => {
    const f = flip.value;
    if (reduced || f <= 0.05 || busy.value === 1) return { opacity: 0 };
    return { opacity: Math.min(0.9, f) * (1 - Math.max(0, f - 0.7) / 0.3 * 0.4),
      transform: [{ translateY: -10 - f * 14 }, { scale: 0.5 + f * 0.6 }] };
  });
  const ringStyle = useAnimatedStyle(() => {
    const d = done.value / doneShare;
    if (d <= 0 || d >= 1 || reduced) return { opacity: 0 };
    return { opacity: 1 - d, transform: [{ scale: 0.5 + d * 1.3 }] };
  });
  const checkStyle = useAnimatedStyle(() => {
    const d = done.value;
    if (d <= 0) return { opacity: 0 };
    const pop = Math.min(1, d / (doneShare * 0.45));
    const s = pop < 1 ? 0.4 + pop * 0.9 : 1.3 - Math.min(0.3, (d - doneShare * 0.45) * 2);
    return { opacity: d > doneShare ? 1 - (d - doneShare) / (1 - doneShare) : 1, transform: [{ scale: reduced ? 1 : s }] };
  });
  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]}>
      <Animated.View style={[styles.ring, ringStyle, { top: PULL_SHOW.restY - 30 }]} />
      <Animated.View style={[{ width: A, height: A }, sharkStyle]}>
        <Image source={SHARK_ART} style={{ width: A, height: A }} contentFit="contain" cachePolicy="memory-disk" />
        <Animated.View style={[styles.bubble, bubbleStyle]} />
      </Animated.View>
      <Animated.View style={[styles.check, checkStyle, { top: PULL_SHOW.restY - 14 }]}>
        <GameIcon name="check" size={28} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, height: 120, alignItems: 'center' },
  ring: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: BRAND.white,
    backgroundColor: 'rgba(191, 229, 255, 0.35)' },
  bubble: { position: 'absolute', right: 2, top: 6, width: 12, height: 12, borderRadius: 6, borderWidth: 1.5,
    borderColor: BRAND.white, backgroundColor: 'rgba(191, 229, 255, 0.5)' },
  check: { position: 'absolute', marginLeft: 44, width: 28, height: 28, borderRadius: 14, backgroundColor: GOLD_FX.core },
});
