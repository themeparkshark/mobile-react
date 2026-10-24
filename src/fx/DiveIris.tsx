/**
 * The game dive: entering a game is a special trip underwater, so you always know where you are.
 *
 *   diveNavigate('LinePlay', { ride });         // from any tap that starts a game
 *   <DiveIrisHost />                            // mounted once in Root, after the navigator
 *   const settled = useDiveSettled();           // a game screen mounts its heavy parts after the dive
 *
 * Beat 1 (gather): a water circle grows out of the spot you tapped and fills the screen
 * (closeMs, EASE.in) with a white rim, while bubbles start rising from the bottom edge.
 * Beat 2 (hold): one held breath of sunlit water: soft light rays sway down from the surface, a
 * bright ripple band moves along the top, and the big TPS shark dives in head first with a squash
 * and a white bubble stream off its tail. The haptic (hitMedium) lands on the cover. The water opens
 * only onto the game screen (its landing frame laid out), never onto the screen you left: on a phone
 * that is holdMs after the cover; a slow first render holds longer with everything still moving
 * (the shark lingers and bobs). A tap skips the held breath.
 * Beat 3 (burst): the iris opens from the middle to the corners (openMs, EASE.inOut) with a gold
 * rim flash on its edge and a soft haptic, and the game is inside it.
 * Beat 4 (settle): the water is gone; nothing stays on screen. The game screen's heavy parts mount
 * only now (useDiveSettled), so the open never stalls on a big first mount.
 *
 * The first dive of a session gets the full show (about 0.8 to 1 s); every dive after it is the
 * short repeat (about 0.45 s), so the tenth game never waits on the trip.
 * Reduce Motion: a 160 ms water fade instead of the iris (the haptic stays).
 * Skia on the UI thread, mounted only while a dive runs (no idle cost).
 */
import { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SHARK_ART } from '../ui/SharkRefresh';
import { Canvas, Circle, Group, LinearGradient, Path, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { cancelAnimation, Easing, runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { queueHaptic } from '../gamekit/Haptics';
import * as RootNavigation from '../RootNavigation';
import { DURATION, EASE, GOLD_FX } from '../ui/motionEasing';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { Z } from '../ui/tokens';

export interface DiveTiming {
  /** The water grows from the tap until it covers the screen. */
  readonly closeMs: number;
  /** The held breath after the cover when the game screen is already there. */
  readonly holdMs: number;
  /** The iris opens from the middle. */
  readonly openMs: number;
  /** How long the shark's swim takes (it runs on its own clock through the whole dive). */
  readonly swimMs: number;
}

/** The dive's timing and look (pure data, unit tested). */
export const DIVE = {
  closeMs: 260,
  holdMs: 160,
  /** Where the shark lingers (share of its swim) while the water waits for the game screen. */
  lingerAt: 0.5,
  /** The hold's own clock: rays sway, ripples run and the tail bubbles rise on it (ms per loop). */
  clockMs: 2400,
  /** A lost landing signal never leaves the water up longer than this after the cover (ms). */
  safetyMs: 2500,
  openMs: 400,
  swimMs: 900,
  /** Every dive after the first in a session: the same trip, quick. */
  repeat: { closeMs: 150, holdMs: 40, openMs: 260, swimMs: 520 } as DiveTiming,
  /** The stack fade the game screens use, in and out. */
  screenFadeMs: DURATION.exit,
  bubbles: 6,
  trail: 8,
  rays: 5,
  rimPt: 6,
  sharkPt: 240,
  /** A tap older than this does not count as the dive's origin; the dive grows from the middle. */
  originFreshMs: 1500,
  waterTop: '#5cc8f8',
  waterMid: '#2a96e2',
  waterBottom: '#0a62b3',
} as const;

/** The first dive of a session is the full show; every dive after it is the quick repeat. */
export function diveTiming(divesSoFar: number): DiveTiming {
  if (divesSoFar <= 0) {
    return { closeMs: DIVE.closeMs, holdMs: DIVE.holdMs, openMs: DIVE.openMs, swimMs: DIVE.swimMs };
  }
  return DIVE.repeat;
}

/** Dev only: globalThis.__diveSlow = 4 plays the dive four times slower, to check every beat on a capture. */
function devSlowed(t: DiveTiming): DiveTiming {
  const k = typeof __DEV__ !== 'undefined' && __DEV__ ? Number((globalThis as { __diveSlow?: number }).__diveSlow) || 1 : 1;
  if (k === 1) return t;
  return { closeMs: t.closeMs * k, holdMs: t.holdMs * k, openMs: t.openMs * k, swimMs: t.swimMs * k };
}

/** Where the last touch landed (window points), recorded by the root view. */
let lastTouch: { x: number; y: number; at: number } | null = null;
export function recordTouch(x: number, y: number): void {
  lastTouch = { x, y, at: Date.now() };
}

type Dive = { id: number; x: number; y: number; go: () => void; timing: DiveTiming; landing: boolean };
let current: Dive | null = null;
let nextId = 1;
let divesThisSession = 0;
const listeners = new Set<(dive: Dive | null) => void>();
const settleListeners = new Set<(settled: boolean) => void>();
const prewarm = new Map<string, { load: () => unknown; landing: boolean }>();
const landedListeners = new Set<() => void>();

/**
 * Root registers how to load a game screen's module, so it loads on the JS thread while the water
 * closes on the UI thread (the cover is never waiting on a first require). `landing` says the screen
 * shows a light landing frame during a dive and calls notifyDiveLanded() once it is laid out.
 */
export function registerDivePrewarm(name: string, load: () => unknown, options: { landing?: boolean } = {}): void {
  prewarm.set(name, { load, landing: options.landing === true });
}

/** A game screen's dive landing frame is laid out natively: the water can open onto it now. */
export function notifyDiveLanded(): void {
  landedListeners.forEach(l => l());
}

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
  const screen = prewarm.get(name);
  current = { id: nextId++, x: o.x, y: o.y, go, timing: devSlowed(diveTiming(divesThisSession)), landing: screen?.landing === true };
  divesThisSession += 1;
  mark('start');
  listeners.forEach(l => l(current));
  settleListeners.forEach(l => l(false));
  if (screen) setTimeout(() => { try { screen.load(); } catch { /* the navigate loads it anyway */ } }, 0);
}

// Dev only: the lane captures can start a dive over the debugger (the tap origin still comes from the last real touch).
if (typeof __DEV__ !== 'undefined' && __DEV__) (globalThis as { __diveNavigate?: typeof diveNavigate }).__diveNavigate = diveNavigate;

const markUi = (what: string, at: number) => mark(what, at);
const onOpenStart = () => { mark('open-start'); queueHaptic('tapLight'); };

function finishDive(): void {
  if (!current) return;
  mark('finish');
  current = null;
  listeners.forEach(l => l(null));
  settleListeners.forEach(l => l(true));
}

/**
 * False only while a screen that mounted during a dive waits for the water to go. A latch: once a
 * screen is settled it stays settled, so a later dive from or over it never unmounts what it shows.
 */
export function useDiveSettled(): boolean {
  const [settled, setSettled] = useState(current == null);
  useEffect(() => {
    if (settled) return undefined;
    const listener = (next: boolean) => { if (next) setSettled(true); };
    settleListeners.add(listener);
    if (current == null) setSettled(true);
    return () => { settleListeners.delete(listener); };
  }, [settled]);
  return settled;
}

/** Dev only: when each beat of the last dives happened (ms since the dive started), for the lane captures. */
const devLog: { at: number; what: string }[] = [];
let devT0 = 0;
function mark(what: string, at: number = Date.now()): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (what === 'start') devT0 = at;
  devLog.push({ at: at - devT0, what });
  if (devLog.length > 60) devLog.splice(0, devLog.length - 60);
}
if (typeof __DEV__ !== 'undefined' && __DEV__) (globalThis as { __diveLog?: typeof devLog }).__diveLog = devLog;

/** Bubble i of n: where it starts on the bottom edge, its size and how far behind the others it rises. */
export function diveBubble(i: number, n: number, w: number): { x: number; r: number; lag: number } {
  return { x: (w * (i + 0.5)) / n + (i % 2 ? 12 : -12), r: 7 + ((i * 5) % 7), lag: (i % 3) * 0.12 };
}

/** The shark's path at swim time t (0 to 1): in from the tap's side, a dip, then down and away. */
export function sharkAt(t: number, fromLeft: boolean, w: number, h: number): { x: number; y: number; rot: number } {
  'worklet';
  // Across the whole screen: in at the side, big and in view through the held breath (t 0.25 to
  // 0.55), then down and out the far side as the water opens.
  const x0 = (fromLeft ? -0.2 : 1.2) * w;
  const x1 = (fromLeft ? 1.15 : -0.15) * w;
  const x = x0 + (x1 - x0) * t;
  const y = h * 0.56 - h * 0.12 * Math.sin(t * Math.PI) + h * 0.28 * t * t * t;
  return { x, y, rot: (fromLeft ? 1 : -1) * (8 + 34 * t * t) };
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
  const T = dive.timing;
  const diag = Math.hypot(w, h);
  // close: 0 to 1 (water grows from the tap), open: 0 to 1 (the hole grows from the middle).
  const close = useSharedValue(0);
  const open = useSharedValue(0);
  const fade = useSharedValue(reduced ? 0 : 1);
  const swim = useSharedValue(0);
  const clock = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  /** A tap while the water is up skips the rest of the held breath (never the wait for the game screen). */
  const skipRef = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cleanups: (() => void)[] = [];
    if (reduced) {
      queueHaptic('hitMedium');
      fade.value = withSequence(withTiming(1, { duration: DURATION.quick }, done => { if (done) runOnJS(dive.go)(); }),
        withDelay(DIVE.holdMs, withTiming(0, { duration: DURATION.quick }, done => { if (done) runOnJS(finishDive)(); })));
      close.value = 1;
      return undefined;
    }
    // The shark swims in to the middle and lingers there (a bob on the clock) until the water opens;
    // then it swims on and out (useAnimatedReaction below). The clock keeps the rays, ripples and
    // bubble stream moving for as long as the hold lasts, so the held breath is never still.
    swim.value = withTiming(DIVE.lingerAt, { duration: T.swimMs * DIVE.lingerAt, easing: EASE.out });
    clock.value = withRepeat(withTiming(1, { duration: DIVE.clockMs, easing: Easing.linear }), -1, false);
    let coveredAt = 0;
    let landed = false;
    const openNow = (delay: number) => {
      'worklet';
      open.value = withDelay(delay, withTiming(1, { duration: T.openMs, easing: EASE.inOut }, done => {
        if (done) { runOnJS(markUi)('opened(ui)', Date.now()); runOnJS(finishDive)(); }
      }));
    };
    // The game screen is really there (its light landing frame laid out natively, or for a screen
    // without one, its navigation landed and two frames drew): open after the short held breath.
    // The water never opens onto the screen you left, so a slow first render holds longer instead
    // (with everything still moving), never shows the old screen.
    let skipHold = false;
    const openWhenReady = (why: string) => {
      if (!alive || landed) return;
      landed = true;
      setHolding(false);
      mark(`startOpen(${why})`);
      openNow(skipHold ? 0 : Math.max(0, T.holdMs - (Date.now() - coveredAt)));
    };
    skipRef.current = () => {
      skipHold = true;
      if (landed && open.value === 0) openNow(0);
    };
    const onLanded = () => requestAnimationFrame(() => openWhenReady('landing'));
    let unsubscribe = () => {};
    const onCovered = (uiAt: number) => {
      if (!alive) return;
      mark('covered(ui)', uiAt);
      coveredAt = Date.now();
      queueHaptic('hitMedium');
      setHolding(true);
      if (dive.landing) landedListeners.add(onLanded);
      unsubscribe = RootNavigation.navigationRef.addListener('state', () => {
        unsubscribe();
        mark('state');
        // A screen with a landing frame says when it is laid out; any other opens two frames after its
        // navigation lands, and the landing one also gets this as a late fallback.
        const frames = dive.landing ? 12 : 2;
        let n = 0;
        const tick = () => { n += 1; if (n >= frames) openWhenReady('state'); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      dive.go();
      mark('go');
      // A lost signal never leaves the water up.
      timers.push(setTimeout(() => openWhenReady('safety'), DIVE.safetyMs));
    };
    timers.push(setTimeout(finishDive, T.closeMs + DIVE.safetyMs + T.openMs + 2000));
    close.value = withTiming(1, { duration: T.closeMs, easing: EASE.in }, done => {
      if (done) runOnJS(onCovered)(Date.now());
    });
    cleanups.push(() => { unsubscribe(); landedListeners.delete(onLanded); });
    cleanups.push(() => cancelAnimation(clock));
    return () => { alive = false; timers.forEach(clearTimeout); cleanups.forEach(c => c()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The softer answer in the hand the moment the water starts to open (whoever started it).
  useAnimatedReaction(() => open.value > 0, (now, before) => {
    if (now && !before) {
      swim.value = withTiming(1, { duration: T.openMs * 1.2, easing: EASE.in });
      runOnJS(onOpenStart)();
    }
  });

  /** A tap while the water is up skips the rest of the hold. */
  const skip = () => { skipRef.current(); return true; };

  const reach = Math.max(Math.hypot(dive.x, dive.y), Math.hypot(w - dive.x, dive.y), Math.hypot(dive.x, h - dive.y),
    Math.hypot(w - dive.x, h - dive.y));
  const holeR = diag / 2 + DIVE.rimPt * 2;
  // The water: a circle growing from the tap while it closes, then the whole screen. The open is a
  // hole cut by an inverted clip (no fill-rule tricks), so it draws the same on every renderer.
  const water = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    if (open.value > 0) p.addRect(Skia.XYWHRect(0, 0, w, h));
    else p.addCircle(dive.x, dive.y, Math.max(0.1, reach * close.value));
    return p;
  });
  const hole = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    if (open.value > 0) p.addCircle(w / 2, h / 2, Math.max(0.1, holeR * open.value));
    else p.addCircle(-50, -50, 0.1);
    return p;
  });
  const rim = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    if (open.value > 0) p.addCircle(w / 2, h / 2, Math.max(0.1, holeR * open.value));
    else p.addCircle(dive.x, dive.y, Math.max(0.1, reach * close.value));
    return p;
  });
  const rimOpacity = useDerivedValue(() => (open.value > 0 ? 0.95 * (1 - open.value * 0.5) : close.value < 1 ? 0.9 : 0));
  // The gold flash on the iris edge: up fast as it opens, gone by halfway.
  const goldOpacity = useDerivedValue(() => {
    const o = open.value;
    if (o <= 0) return 0;
    return o < 0.08 ? (o / 0.08) * 0.95 : Math.max(0, 0.95 * (1 - (o - 0.08) / 0.5));
  });
  const goldSoft = useDerivedValue(() => goldOpacity.value * 0.45);
  const opacity = useDerivedValue(() => fade.value);
  const fromLeft = dive.x < w / 2;

  // Light rays from the surface, swaying with the swim clock.
  const rays = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    const sway = Math.sin(clock.value * Math.PI * 2) * 22;
    for (let i = 0; i < DIVE.rays; i++) {
      const cx = w * (0.08 + i * 0.22) + sway * (i % 2 ? 1 : -0.6);
      const top = 26 + (i % 3) * 12;
      const bottom = 96 + (i % 2) * 40;
      const lean = 70 + i * 10;
      p.moveTo(cx - top / 2, -10);
      p.lineTo(cx + top / 2, -10);
      p.lineTo(cx + lean + bottom / 2, h * 0.82);
      p.lineTo(cx + lean - bottom / 2, h * 0.82);
      p.close();
    }
    return p;
  });
  // The bright ripple band just under the surface.
  const ripple = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    const phase = clock.value * Math.PI * 2;
    for (let band = 0; band < 2; band++) {
      const y0 = h * (0.075 + band * 0.07);
      const amp = 7 - band * 2;
      for (let s = 0; s <= 24; s++) {
        const x = (w * s) / 24;
        const y = y0 + Math.sin(s * 0.9 + phase + band * 1.7) * amp;
        if (s === 0) p.moveTo(x, y); else p.lineTo(x, y);
      }
    }
    return p;
  });
  // A white bubble trail behind the shark's tail (its own past positions).
  const trail = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    if (close.value < 0.2) return p;
    const at = sharkAt(swim.value, fromLeft, w, h);
    const dir = fromLeft ? 1 : -1;
    const bob = Math.sin(clock.value * Math.PI * 4) * 8;
    // A stream of bubbles rising off the tail: each one drifts up and back, then starts again.
    const tailX = at.x - dir * DIVE.sharkPt * 0.36;
    const tailY = at.y + bob + DIVE.sharkPt * 0.12;
    for (let k = 0; k < DIVE.trail; k++) {
      const life = (clock.value * 2.2 + k / DIVE.trail) % 1;
      const r = 3 + ((k * 7) % 5) + life * 3;
      p.addCircle(tailX - dir * life * 46 + Math.sin(k * 2.1 + life * 9) * 6, tailY - life * 120, r);
    }
    return p;
  });
  const sceneOpacity = useDerivedValue(() => (open.value > 0 ? Math.max(0, 1 - open.value * 1.4) : close.value));

  const bubbles = Array.from({ length: DIVE.bubbles }, (_, i) => diveBubble(i, DIVE.bubbles, w));
  const sharkStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: 0 };
    const t = swim.value;
    const at = sharkAt(t, fromLeft, w, h);
    const bob = Math.sin(clock.value * Math.PI * 4) * 8;
    // Entry squash: long along the swim, then springs round by a quarter of the way.
    const k = Math.min(1, t / 0.28);
    const stretch = (1 - k) * (1 - k);
    const sx = 1 + 0.26 * stretch - 0.05 * Math.sin(k * Math.PI);
    const sy = 1 - 0.2 * stretch + 0.05 * Math.sin(k * Math.PI);
    return {
      opacity: close.value < 0.2 ? 0 : open.value > 0.3 ? Math.max(0, 1 - (open.value - 0.3) / 0.3) : 1,
      transform: [{ translateX: at.x - DIVE.sharkPt / 2 }, { translateY: at.y - DIVE.sharkPt / 2 + bob },
        { rotate: `${at.rot + Math.cos(clock.value * Math.PI * 4) * 4}deg` },
        // The art faces right: flip it when it swims left, so it always swims head first.
        { scaleX: (fromLeft ? 1 : -1) * sx }, { scaleY: sy }],
    };
  });

  return (
    // Above the offline banner (Z.dialog - 1): the water covers everything on the way in.
    <View pointerEvents={holding ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: Z.dialog, elevation: Z.dialog }]}
      onStartShouldSetResponder={skip}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group opacity={opacity}>
          {reduced
            ? <Path path={Skia.Path.Make().addRect(Skia.XYWHRect(0, 0, w, h))}>
              <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[DIVE.waterTop, DIVE.waterMid, DIVE.waterBottom]} />
            </Path>
            : <>
              <Group clip={hole} invertClip>
              <Path path={water}>
                <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[DIVE.waterTop, DIVE.waterMid, DIVE.waterBottom]} />
              </Path>
              <Group clip={water} opacity={sceneOpacity}>
                <Path path={rays} opacity={0.75}>
                  <LinearGradient start={vec(0, 0)} end={vec(0, h * 0.82)} colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} />
                </Path>
                <Path path={ripple} style="stroke" strokeWidth={12} strokeCap="round" color="rgba(255,255,255,0.14)" />
                <Path path={ripple} style="stroke" strokeWidth={5} strokeCap="round" color="rgba(255,255,255,0.3)" />
                <Path path={trail} color="rgba(255,255,255,0.78)" />
                <Path path={trail} style="stroke" strokeWidth={1.5} color="#ffffff" />
              </Group>
              </Group>
              {/* The gold flash on the iris edge: a soft wide band under a bright core (no blur pass). */}
              <Path path={rim} style="stroke" strokeWidth={DIVE.rimPt * 4} color={GOLD_FX.raysSoft} opacity={goldSoft} />
              <Path path={rim} style="stroke" strokeWidth={DIVE.rimPt * 2} color={GOLD_FX.rays} opacity={goldOpacity} />
              <Path path={rim} style="stroke" strokeWidth={DIVE.rimPt} color="#ffffff" opacity={rimOpacity} />
              {bubbles.map((b, i) => <Bubble key={i} b={b} h={h} close={close} open={open} />)}
            </>}
        </Group>
      </Canvas>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: DIVE.sharkPt, height: DIVE.sharkPt }, sharkStyle]}>
        <Image source={SHARK_ART} style={{ width: DIVE.sharkPt, height: DIVE.sharkPt }} contentFit="contain" cachePolicy="memory-disk" />
      </Animated.View>
    </View>
  );
}

function Bubble({ b, h, close, open }: {
  readonly b: { x: number; r: number; lag: number }; readonly h: number;
  readonly close: SharedValue<number>; readonly open: SharedValue<number>;
}) {
  // One rise across the whole dive (close plus open), each bubble a little behind the last.
  const t = useDerivedValue(() => Math.min(1, Math.max(0, (close.value * 0.4 + open.value * 0.6 - b.lag) / (1 - b.lag))));
  const cy = useDerivedValue(() => h + b.r - t.value * (h * 0.75));
  const cx = useDerivedValue(() => b.x + Math.sin(t.value * 9) * 6);
  const hx = useDerivedValue(() => cx.value - b.r * 0.35);
  const hy = useDerivedValue(() => cy.value - b.r * 0.35);
  const op = useDerivedValue(() => (t.value <= 0 || t.value >= 1 ? 0 : t.value < 0.1 ? t.value * 10 : 1 - Math.max(0, t.value - 0.7) / 0.3));
  return (
    <Group opacity={op}>
      <Circle cx={cx} cy={cy} r={b.r} color="rgba(191, 229, 255, 0.55)" />
      <Circle cx={cx} cy={cy} r={b.r} color="#ffffff" style="stroke" strokeWidth={2} />
      <Circle cx={hx} cy={hy} r={b.r * 0.22} color="#ffffff" />
    </Group>
  );
}
