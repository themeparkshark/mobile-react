/**
 * The game dive: entering a game is a special trip underwater, so you always know where you are.
 *
 *   diveNavigate('LinePlay', { ride });         // from any tap that starts a game
 *   <DiveIrisHost />                            // mounted once in Root, after the navigator
 *
 * Beat 1 (gather): a water circle grows out of the spot you tapped and fills the screen
 * (DIVE.closeMs, EASE.in) with a white rim, while six bubbles start rising from the bottom edge.
 * Beat 2 (hold): the screen is all water for a held breath while the game screen mounts under it,
 * and the TPS shark dives through it head first (so a kid reads "we are going in"); the haptic
 * (tap) lands on the cover.
 * Beat 3 (burst): the iris opens from the middle of the screen to its corners (DIVE.openMs,
 * EASE.inOut) and the game appears inside it, bubbles still rising.
 * Beat 4 (settle): the water is gone; nothing stays on screen.
 * The game screens use a short fade (DIVE.screenFadeMs) so the way back out is soft too.
 * Reduce Motion: a 160 ms water fade instead of the iris (the haptic stays).
 * Skia on the UI thread, mounted only while a dive runs (no idle cost), pointer events off.
 */
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SHARK_ART } from '../ui/SharkRefresh';
import { Canvas, Circle, FillType, Group, LinearGradient, Path, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { runOnJS, useDerivedValue, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { queueHaptic } from '../gamekit/Haptics';
import * as RootNavigation from '../RootNavigation';
import { DURATION, EASE } from '../ui/motionEasing';
import useUiReducedMotion from '../ui/useUiReducedMotion';

/** The dive's timing and look (pure data, unit tested). */
export const DIVE = {
  closeMs: 260,
  holdMs: 140,
  openMs: 420,
  /** The stack fade the game screens use, in and out. */
  screenFadeMs: DURATION.exit,
  bubbles: 6,
  rimPt: 6,
  /** A tap older than this does not count as the dive's origin; the dive grows from the middle. */
  originFreshMs: 1500,
  waterTop: '#43b4f4',
  waterBottom: '#0768b9',
} as const;

/** Where the last touch landed (window points), recorded by the root view. */
let lastTouch: { x: number; y: number; at: number } | null = null;
export function recordTouch(x: number, y: number): void {
  lastTouch = { x, y, at: Date.now() };
}

type Dive = { id: number; x: number; y: number; go: () => void };
let current: Dive | null = null;
let nextId = 1;
const listeners = new Set<(dive: Dive | null) => void>();

/** The dive origin: the fresh tap, or the middle of the screen. Pure (unit tested). */
export function diveOrigin(touch: { x: number; y: number; at: number } | null, now: number, w: number, h: number): { x: number; y: number } {
  if (touch && now - touch.at <= DIVE.originFreshMs) return { x: touch.x, y: touch.y };
  return { x: w / 2, y: h / 2 };
}

/** Dive into a game screen. Falls back to a plain navigate when no host is mounted. */
export function diveNavigate(name: string, params?: object): void {
  const go = () => RootNavigation.navigate(name, params);
  if (!listeners.size || current) { go(); return; }
  const { width, height } = Dimensions.get('window');
  const o = diveOrigin(lastTouch, Date.now(), width, height);
  current = { id: nextId++, x: o.x, y: o.y, go };
  listeners.forEach(l => l(current));
}

function finishDive(): void {
  current = null;
  listeners.forEach(l => l(null));
}

/** Bubble i of n: where it starts on the bottom edge, its size and how far behind the others it rises. */
export function diveBubble(i: number, n: number, w: number): { x: number; r: number; lag: number } {
  return { x: (w * (i + 0.5)) / n + (i % 2 ? 12 : -12), r: 7 + ((i * 5) % 7), lag: (i % 3) * 0.12 };
}

export function DiveIrisHost() {
  const [dive, setDive] = useState<Dive | null>(null);
  useEffect(() => {
    listeners.add(setDive);
    return () => { listeners.delete(setDive); };
  }, []);
  if (!dive) return null;
  return <DiveRun key={dive.id} dive={dive} />;
}

function DiveRun({ dive }: { readonly dive: Dive }) {
  const { width: w, height: h } = useWindowDimensions();
  const reduced = useUiReducedMotion();
  const diag = Math.hypot(w, h);
  // close: 0 to 1 (water grows from the tap), open: 0 to 1 (the hole grows from the middle).
  const close = useSharedValue(0);
  const open = useSharedValue(0);
  const fade = useSharedValue(reduced ? 0 : 1);

  useEffect(() => {
    queueHaptic('tapLight');
    if (reduced) {
      fade.value = withSequence(withTiming(1, { duration: DURATION.quick }, done => { if (done) runOnJS(dive.go)(); }),
        withDelay(DIVE.holdMs, withTiming(0, { duration: DURATION.quick }, done => { if (done) runOnJS(finishDive)(); })));
      close.value = 1;
      return;
    }
    close.value = withTiming(1, { duration: DIVE.closeMs, easing: EASE.in }, done => { if (done) runOnJS(dive.go)(); });
    open.value = withDelay(DIVE.closeMs + DIVE.holdMs, withTiming(1, { duration: DIVE.openMs, easing: EASE.inOut }, done => {
      if (done) runOnJS(finishDive)();
    }));
    // A safety net: never leave water over the app if a frame callback is lost.
    const t = setTimeout(finishDive, DIVE.closeMs + DIVE.holdMs + DIVE.openMs + 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const water = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    if (open.value > 0) {
      // The open: the whole screen minus a growing hole in the middle.
      p.addRect(Skia.XYWHRect(0, 0, w, h));
      p.addCircle(w / 2, h / 2, Math.max(0.1, (diag / 2 + DIVE.rimPt) * open.value));
      p.setFillType(FillType.EvenOdd);
      return p;
    }
    // The close: a circle growing from the tap until it covers every corner.
    const reach = Math.max(Math.hypot(dive.x, dive.y), Math.hypot(w - dive.x, dive.y), Math.hypot(dive.x, h - dive.y),
      Math.hypot(w - dive.x, h - dive.y));
    p.addCircle(dive.x, dive.y, Math.max(0.1, reach * close.value));
    return p;
  });
  const rim = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    if (open.value > 0) p.addCircle(w / 2, h / 2, Math.max(0.1, (diag / 2 + DIVE.rimPt) * open.value));
    else {
      const reach = Math.max(Math.hypot(dive.x, dive.y), Math.hypot(w - dive.x, h - dive.y), Math.hypot(w - dive.x, dive.y),
        Math.hypot(dive.x, h - dive.y));
      p.addCircle(dive.x, dive.y, Math.max(0.1, reach * close.value));
    }
    return p;
  });
  const rimOpacity = useDerivedValue(() => (reduced ? 0 : open.value > 0 ? 0.9 * (1 - open.value * 0.6) : close.value < 1 ? 0.9 : 0));
  const opacity = useDerivedValue(() => fade.value);
  const bubbles = Array.from({ length: DIVE.bubbles }, (_, i) => diveBubble(i, DIVE.bubbles, w));
  // The shark dives in from the tap's side, down through the middle, and is gone as the iris opens.
  const sharkStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: 0 };
    const t = Math.min(1, close.value * 0.55 + open.value * 0.45);
    const fromLeft = dive.x < w / 2;
    const x0 = (fromLeft ? -0.25 : 1.25) * w;
    const x1 = w / 2 + (fromLeft ? 0.15 : -0.15) * w;
    const x = x0 + (x1 - x0) * t;
    const y = h * 0.62 - h * 0.16 * Math.sin(t * Math.PI) + h * 0.3 * t * t;
    return {
      opacity: close.value < 0.35 ? 0 : open.value > 0.35 ? Math.max(0, 1 - (open.value - 0.35) / 0.3) : 1,
      transform: [{ translateX: x - SHARK_PT / 2 }, { translateY: y - SHARK_PT / 2 }, { rotate: `${(fromLeft ? 1 : -1) * (20 + 40 * t)}deg` },
        { scaleX: fromLeft ? -1 : 1 }],
    };
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group opacity={opacity}>
          {reduced
            ? <Path path={Skia.Path.Make().addRect(Skia.XYWHRect(0, 0, w, h))}>
              <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[DIVE.waterTop, DIVE.waterBottom]} />
            </Path>
            : <Path path={water}>
              <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[DIVE.waterTop, DIVE.waterBottom]} />
            </Path>}
          <Path path={rim} style="stroke" strokeWidth={DIVE.rimPt} color="#ffffff" opacity={rimOpacity} />
          {!reduced && bubbles.map((b, i) => <Bubble key={i} b={b} h={h} close={close} open={open} />)}
        </Group>
      </Canvas>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: SHARK_PT, height: SHARK_PT }, sharkStyle]}>
        <Image source={SHARK_ART} style={{ width: SHARK_PT, height: SHARK_PT }} contentFit="contain" cachePolicy="memory-disk" />
      </Animated.View>
    </View>
  );
}

const SHARK_PT = 150;

function Bubble({ b, h, close, open }: {
  readonly b: { x: number; r: number; lag: number }; readonly h: number;
  readonly close: SharedValue<number>; readonly open: SharedValue<number>;
}) {
  // One rise across the whole dive (close plus open), each bubble a little behind the last.
  const t = useDerivedValue(() => Math.min(1, Math.max(0, (close.value * 0.4 + open.value * 0.6 - b.lag) / (1 - b.lag))));
  const cy = useDerivedValue(() => h + b.r - t.value * (h * 0.75));
  const cx = useDerivedValue(() => b.x + Math.sin(t.value * 9) * 6);
  const op = useDerivedValue(() => (t.value <= 0 || t.value >= 1 ? 0 : t.value < 0.1 ? t.value * 10 : 1 - Math.max(0, t.value - 0.7) / 0.3));
  return (
    <Group opacity={op}>
      <Circle cx={cx} cy={cy} r={b.r} color="rgba(191, 229, 255, 0.55)" />
      <Circle cx={cx} cy={cy} r={b.r} color="#ffffff" style="stroke" strokeWidth={2} />
    </Group>
  );
}
