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
 * As you pull, the shark dives in from the top and grows with the pull until it fills the gap the
 * pull opens (up to artPt). At the threshold it flips (a quick turn and a bubble) with a selection
 * tick: let go now and it refreshes, with a big splash (two rings and five droplets that fly up and
 * fall) as it drops into the gap. It always stays in that gap, above the first row (never on top of
 * a list's art).
 * While the list reloads it swims a small loop. When the new rows are in, a splash ring and a gold
 * check pop (SPRING.pop) and it swims off to the side, quickly, with a flick of its tail. The native spinner stays (tinted transparent) so the
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
import GoldCheck from './GoldCheck';
import { DURATION, SPRING } from './motionEasing';
import { BRAND } from './tokens';
import useUiReducedMotion from './useUiReducedMotion';

export const SHARK_ART = require('../../assets/images/screens/pin-collections/shark.png');

/** The pull show's numbers (pure data, unit tested). */
export const PULL_SHOW = {
  /** Pull this far (pt) and the shark flips: let go to refresh. */
  thresholdPt: 70,
  /** The shark's size at full pull (pt): it grows to fill the gap, up to this. */
  artPt: 104,
  /** Smallest size as it dives in (share of artPt). */
  fromScale: 0.42,
  /** Where the shark rests while the list reloads (the native refresh gap is about 60 pt). */
  restY: 30,
  /** Its size while it rests in that gap (about the gap's height), so it never sits on the first row's art. */
  restScale: 0.56,
  /** Droplets thrown up by the release splash. */
  droplets: 5,
  /** How far it swims off to the side when it is done (pt). */
  leavePt: 260,
  /** The shark always stays this far above the top of the pulled-down content (pt). */
  clearPt: 4,
  /** The splash ring when you let go (ms). */
  splashMs: 460,
  /** One small swim loop while refreshing (ms). */
  swimMs: 900,
  /** The done beat: splash ring and check (ms), then the swim away. */
  doneMs: 640,
  leaveMs: DURATION.base,
} as const;

/** The anchored overlay's box: it sits just above the list's content (ListHeaderComponent), this tall (pt). */
export const ANCHOR_BOX = 140;

/**
 * Anchored to the content (rendered in the list header, above the first row), the shark rides the
 * pull natively: wherever the content is, the shark's drawn bottom edge is PULL_SHOW.clearPt above it,
 * even on a frame where the UI thread has not caught up with the scroll. Its top offset inside the
 * ANCHOR_BOX for a drawn scale. Pure worklet (unit tested).
 */
export function anchoredSharkTop(scale: number): number {
  'worklet';
  const A = PULL_SHOW.artPt;
  return ANCHOR_BOX - PULL_SHOW.clearPt - A / 2 - (scale * A) / 2;
}

/** How the shark looks at a pull distance (pt). Pure: size grows with the pull, never past full. */
export function pullLook(pull: number): { scale: number; opacity: number; y: number } {
  'worklet';
  const t = Math.min(1, Math.max(0, pull / PULL_SHOW.thresholdPt));
  const A = PULL_SHOW.artPt;
  // Grows with the pull: as big as the gap allows (less the clear margins), from fromScale to full.
  const fill = Math.max(0, pull - 2 * PULL_SHOW.clearPt - 6) / A;
  const scale = Math.min(1, Math.max(PULL_SHOW.fromScale + (0.62 - PULL_SHOW.fromScale) * t, fill));
  // Dives in from above the top edge toward the middle of the gap the pull opens, and its drawn
  // bottom edge (the box scales about its center) never reaches below the content's top.
  const dive = -A + (pull / 2 + A / 2) * Math.min(1, t * 1.1);
  const clear = pull - PULL_SHOW.clearPt - (A * (1 + scale)) / 2;
  return { scale, opacity: Math.min(1, Math.max(0, pull / 24)), y: Math.min(dive, clear) };
}

export interface SharkRefresh {
  readonly onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  readonly pull: SharedValue<number>;
  readonly flip: SharedValue<number>;
  readonly swim: SharedValue<number>;
  readonly done: SharedValue<number>;
  readonly busy: SharedValue<number>;
  readonly splash: SharedValue<number>;
  readonly reduced: boolean;
}

export function useSharkRefresh(refreshing: boolean): SharkRefresh {
  const reduced = useUiReducedMotion();
  const pull = useSharedValue(0);
  const flip = useSharedValue(0);
  const swim = useSharedValue(0);
  const done = useSharedValue(0);
  const busy = useSharedValue(0);
  const splash = useSharedValue(0);
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
        // Let go: a splash ring off the shark as it drops into the gap.
        splash.value = 0;
        splash.value = withTiming(1, { duration: PULL_SHOW.splashMs, easing: Easing.out(Easing.quad) });
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
  }, [refreshing, reduced, swim, done, busy, armed, flip, splash]);

  return { onScroll, pull, flip, swim, done, busy, splash, reduced };
}

/**
 * Draw the shark over the top of the list (pointer events pass through). Put it after the list, or,
 * better, pass `anchored` and render it as the first thing in the list's ListHeaderComponent: then it
 * rides the content natively and its bottom edge always clears the first row (no lag under load).
 */
export function SharkRefreshOverlay({ shark, top = 0, anchored = false }: { readonly shark: SharkRefresh; readonly top?: number;
  readonly anchored?: boolean }) {
  const { pull, flip, swim, done, busy, splash, reduced } = shark;
  const A = PULL_SHOW.artPt;
  const doneShare = PULL_SHOW.doneMs / (PULL_SHOW.doneMs + PULL_SHOW.leaveMs);
  // Anchored: the splash, ring and check sit around the resting shark's centre inside ANCHOR_BOX.
  const restTop = anchored ? anchoredSharkTop(PULL_SHOW.restScale) : PULL_SHOW.restY - A / 2;
  const base = anchored ? restTop + A / 2 - PULL_SHOW.restY : 0;
  const sharkStyle = useAnimatedStyle(() => {
    const look = pullLook(pull.value);
    const d = done.value;
    const leaving = d > doneShare ? (d - doneShare) / (1 - doneShare) : 0;
    const resting = busy.value === 1;
    const y = resting ? restTop : anchored ? anchoredSharkTop(look.scale) : look.y;
    if (reduced) return { opacity: resting || pull.value >= PULL_SHOW.thresholdPt ? 1 - leaving : 0, transform: [{ translateY: restTop }] };
    const a = swim.value * Math.PI * 2;
    const f = flip.value;
    // Done: it swims off to the side, quick and accelerating (EASE.in feel), nose first.
    const off = leaving * leaving;
    return {
      opacity: (resting ? 1 : look.opacity) * (1 - Math.max(0, leaving - 0.6) / 0.4),
      transform: [
        { translateX: Math.sin(a) * 10 + off * PULL_SHOW.leavePt },
        { translateY: y + Math.sin(a * 2) * 3 - off * 26 + Math.sin(leaving * Math.PI * 3) * 4 },
        // The flip: a quick half turn on its side and back, like a happy roll in the water.
        { rotate: `${Math.sin(f * Math.PI) * -24 + Math.cos(a) * 6 * (resting ? 1 : 0)}deg` },
        { scale: resting ? PULL_SHOW.restScale : look.scale },
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
  const splashStyle = useAnimatedStyle(() => {
    const k = splash.value;
    if (k <= 0 || k >= 1 || reduced) return { opacity: 0 };
    return { opacity: 0.95 * (1 - k), transform: [{ scaleX: 0.6 + k * 2.4 }, { scaleY: 0.35 + k * 0.7 }] };
  });
  // A second, later ring inside the first (a splash reads as two rings).
  const splash2Style = useAnimatedStyle(() => {
    const k = (splash.value - 0.18) / 0.82;
    if (k <= 0 || k >= 1 || reduced) return { opacity: 0 };
    return { opacity: 0.9 * (1 - k), transform: [{ scaleX: 0.4 + k * 1.6 }, { scaleY: 0.3 + k * 0.5 }] };
  });
  const checkStyle = useAnimatedStyle(() => {
    const d = done.value;
    if (d <= 0) return { opacity: 0 };
    const pop = Math.min(1, d / (doneShare * 0.45));
    const s = pop < 1 ? 0.4 + pop * 0.9 : 1.3 - Math.min(0.3, (d - doneShare * 0.45) * 2);
    return { opacity: d > doneShare ? 1 - (d - doneShare) / (1 - doneShare) : 1, transform: [{ scale: reduced ? 1 : s }] };
  });
  return (
    <View pointerEvents="none" style={anchored ? styles.anchor : [styles.wrap, { top }]}>
      <Animated.View style={[styles.ring, ringStyle, { top: base + PULL_SHOW.restY - 30 }]} />
      <Animated.View style={[styles.splash, splashStyle, { top: base + PULL_SHOW.restY + 10 }]} />
      <Animated.View style={[styles.splash, splash2Style, { top: base + PULL_SHOW.restY + 10 }]} />
      {!reduced && Array.from({ length: PULL_SHOW.droplets }, (_, i) => <Droplet key={i} i={i} splash={splash} base={base} />)}
      <Animated.View style={[{ width: A, height: A }, sharkStyle]}>
        <Image source={SHARK_ART} style={{ width: A, height: A }} contentFit="contain" cachePolicy="memory-disk" />
        <Animated.View style={[styles.bubble, bubbleStyle]} />
      </Animated.View>
      <Animated.View style={[styles.check, checkStyle, { top: base + PULL_SHOW.restY - 14 }]}>
        <GoldCheck size={30} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, height: 120, alignItems: 'center' },
  // Just above the content's top edge, inside the scroll content (it moves with the pull natively).
  anchor: { position: 'absolute', left: 0, right: 0, bottom: '100%', height: ANCHOR_BOX, alignItems: 'center' },
  ring: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: BRAND.white,
    backgroundColor: 'rgba(191, 229, 255, 0.35)' },
  splash: { position: 'absolute', width: 70, height: 26, borderRadius: 35, borderWidth: 3, borderColor: BRAND.white,
    backgroundColor: 'rgba(191, 229, 255, 0.3)' },
  bubble: { position: 'absolute', right: 2, top: 6, width: 12, height: 12, borderRadius: 6, borderWidth: 1.5,
    borderColor: BRAND.white, backgroundColor: 'rgba(191, 229, 255, 0.5)' },
  check: { position: 'absolute', marginLeft: 50, width: 30, height: 30 },
  droplet: { position: 'absolute', width: 9, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: BRAND.white,
    backgroundColor: 'rgba(191, 229, 255, 0.75)' },
});

/** Droplet i of the release splash: up and out on its own angle, then down with gravity. Pure (unit tested). */
export function dropletAt(i: number, k: number): { x: number; y: number; opacity: number } {
  'worklet';
  const n = PULL_SHOW.droplets;
  const angle = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42;
  const speed = 46 + (i % 2) * 12;
  const x = Math.cos(angle) * speed * k * 1.4;
  const y = Math.sin(angle) * speed * k + 70 * k * k;
  return { x, y, opacity: k <= 0 || k >= 1 ? 0 : k < 0.15 ? k / 0.15 : 1 - Math.max(0, k - 0.55) / 0.45 };
}

function Droplet({ i, splash, base = 0 }: { readonly i: number; readonly splash: SharedValue<number>; readonly base?: number }) {
  const style = useAnimatedStyle(() => {
    const d = dropletAt(i, splash.value);
    return { opacity: d.opacity, transform: [{ translateX: d.x }, { translateY: d.y }] };
  });
  return <Animated.View style={[styles.droplet, style, { top: base + PULL_SHOW.restY + 12 }]} />;
}
