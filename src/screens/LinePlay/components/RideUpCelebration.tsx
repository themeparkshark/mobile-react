/**
 * "Your ride's up!": the line ends and the recap's own header card cheers you onto the ride.
 * No veil and no second banner: the real header card is the stage.
 *
 * Four beats (src/ui/motion.ts), every piece mounted in the same render so they share one
 * beat sheet. Frame 1 is already the whole card: the shark, the ride name and the title
 * (oversize) are on screen the moment the recap appears.
 *   gather   0 ms     the header card pops (SPRING.pop, one overshoot), a gold glow builds
 *                     behind its shark, and YOUR RIDE'S UP! slams from 1.5x to size by 120 ms
 *                     (SLAM_SQUASH, the winRoll buzz and the reveal cue on the impact frame);
 *            60 ms    a liquid gold bar fills along the card's bottom edge over 270 ms
 *                     (EASE.out) with the coin tick ladder climbing as it fills;
 *   hold     330 ms   one held 70 ms frame on the full bar: the card squashes and kicks 3 pt,
 *                     a white flash at or under 0.4 (none with Dim Flashing Lights), the win buzz;
 *   burst    400 ms   the gold ray fan blooms inside the card, a gold ring and 12 stars burst
 *                     from the shark, one shower of 28 blue, white and gold confetti falls, and
 *                     the earned row rolls out of the burst one number after another (the last
 *                     lands by about 1.2 s, SessionRecap);
 *   settle   1600 ms the rays and the bar fade, the card is back to how it looks at rest.
 * Payoff at 0.4 s, settled by about 1.9 s, nothing loops. Every visual runs on the UI thread
 * (Reanimated and Skia); the haptics and sounds fire from the same UI timeline (runOnJS in
 * the animation callbacks and one reaction for the ticks). Reduce Motion: the glow and the
 * full bar fade in and out, the buzz and the sound stay. Plain ride names only, no logos.
 */
import { Canvas, PaintStyle, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing, ReduceMotion, cancelAnimation, runOnJS, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { isDimFlashingLightsEnabled } from '../../../../modules/flash-safety';
import { playHaptic, queueHaptic } from '../../../gamekit/Haptics';
import { playMoment } from '../../../gamekit/audio/playMoment';
import { useReduceMotionPreference } from '../../../hooks/useReducedGameMotion';
import { usePowerBudget } from '../../../power';
import { GoldBurst } from '../../../ui/GoldBurst';
import { SLAM_SQUASH } from '../../../ui/motion';
import { DURATION, EASE, GOLD_FX, SPRING, flashPeak, momentParticles } from '../../../ui/motionEasing';
import { RAIN_COLORS, rainPalette } from '../../../components/park/ArrivalFxCanvas';
import BurstCanvas from '../../../components/park/BurstCanvas';
import { withDelay, withSequence, withSpring, withTiming } from '../../../components/park/momentTime';
import { perfMark } from '../../../components/park/momentPerf';
import { StepGate, useMountSteps, type StepStore } from '../../../components/park/mountSteps';

/** The beat sheet (ms), pure numbers so tests can read them. */
export const RIDE_UP = {
  /** The title is on screen from frame 1 (oversize) and slams to size by DURATION.slam. */
  stampAt: 0,
  ringAt: 60,
  ringMs: 270,
  hitAt: 330,
  burstAt: 400,
  confettiAt: 420,
  confettiMs: 1500,
  leaveAt: 1600,
  leaveMs: 260,
  /** The coin tick ladder while the bar fills. */
  ticks: 6,
  /**
   * The earned row rolls out of the burst: stat i starts at burstAt + i x statStepMs and rolls
   * for statMs, so the last of five numbers lands by about 1.2 s.
   */
  statStepMs: 90,
  statMs: 420,
  sparkles: 12,
  confetti: 28,
} as const;

export type RideUpPlan = { readonly [K in keyof typeof RIDE_UP]: number };

/**
 * A second ride the same day (rideUpRepeat.ts): the card still slams, fills and bursts, but faster, with no confetti,
 * and the earned numbers roll out in about 0.8 s (the last of five lands by 780 ms). Settled by about 1.4 s.
 */
export const RIDE_UP_REPEAT: RideUpPlan = {
  ...RIDE_UP,
  ringMs: 200,
  hitAt: 260,
  burstAt: 320,
  confettiAt: 99_999,
  confetti: 0,
  leaveAt: 1150,
  leaveMs: 220,
  ticks: 4,
  statStepMs: 50,
  statMs: 260,
};

/**
 * Wave 5 round 3: "go" for the whole ride-up. The recap mounts drawn at an invisible 1% until the header's shark has
 * decoded (or RIDE_UP_ART_WAIT_MS), and every ride-up beat (the hero, the title slam, the rolling numbers, the cannon)
 * starts on that same frame, so the first visible frame is the whole card with its shark (a real boarded recap showed
 * its first frames with a blank shark). A store, not state: going never re-renders the recap, only the few beats that
 * read it. Outside a ride-up recap there is no store and everything starts at once.
 */
export const RideUpGo = createContext<StepStore | null>(null);
/** The longest the ride-up waits for the shark to decode before it starts anyway (ms). */
export const RIDE_UP_ART_WAIT_MS = 260;
/**
 * Runs `start` once the ride-up's go frame arrives (at once outside a ride-up recap), WITHOUT a React render: the go
 * store calls it straight from its rAF, so every beat starts in the same JS tick and the go frame only has to draw.
 * The cleanup it returns runs on unmount or when `deps` change.
 */
export function useWhenRideUpGo(start: () => void | (() => void), deps: readonly unknown[]): void {
  const store = useContext(RideUpGo);
  useEffect(() => {
    let ran = false;
    let cleanup: void | (() => void);
    const run = () => { if (ran) return; ran = true; cleanup = start(); };
    if (!store || store.get() >= 1) { run(); return () => { if (cleanup) cleanup(); }; }
    const off = store.subscribe(() => { if (store.get() >= 1) run(); });
    return () => { off(); if (cleanup) cleanup(); };
    // The caller lists what restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Where the burst comes from inside the header card: its shark (the card's right side). */
const SHARK = { fromRight: 84, fromBottom: 78 };
const BAR = 9;
/** The header card's border (its inside starts this far in). */
const CARD_BORDER = 3;
const BRAND_NAVY = '#05346e';

/**
 * Wraps the recap's header card. While `active`, the card pops in, squashes on the hit,
 * glows gold behind its shark, fills a gold bar along its bottom edge and bursts stars.
 * `backdrop` is drawn inside the card, under its words (pass it as the card's first child).
 */
export function RideUpHero({ active, plan = RIDE_UP, burstPoint, children }: {
  readonly active: boolean;
  /** RIDE_UP the first ride of the day, RIDE_UP_REPEAT after that. */
  readonly plan?: RideUpPlan;
  /** Where the card's shark is (in the card's parent's points): the confetti cannon fires from there. */
  readonly burstPoint?: SharedValue<{ x: number; y: number } | null>;
  readonly children: (backdrop: ReactNode) => ReactNode;
}) {
  const preference = useReduceMotionPreference();
  if (!active || preference === null) return <>{children(null)}</>;
  return <HeroStage reduced={preference} plan={plan} burstPoint={burstPoint}>{children}</HeroStage>;
}

/**
 * Wave 5 round 3: frame 1 is the card itself (title, shark, ride name, the bar); its burst layers mount in
 * HERO_BUILD small steps over the next frames (the glow inside the card, the rays outside it, the stars), all before
 * the burst at 0.4 s, so the recap's first frames never carry them (a 110 ms freeze at 67 ms in release JS).
 */
export const HERO_BUILD = 3;
/** The card's ray fan (the same size and centre inside and outside the card, so the rays run on across its edge). */
export function heroRaysSize(cardHeight: number): number {
  return Math.max(340, cardHeight * 2.4);
}

function HeroStage({ reduced, plan: P, burstPoint, children }: {
  readonly reduced: boolean; readonly plan: RideUpPlan;
  readonly burstPoint?: SharedValue<{ x: number; y: number } | null>;
  readonly children: (backdrop: ReactNode) => ReactNode;
}) {
  const steps = useMountSteps(reduced ? 0 : HERO_BUILD, step => perfMark(`rideUp.step${step}`));
  const budget = usePowerBudget();
  const sparkles = momentParticles(P.sparkles, budget, reduced);
  const peak = flashPeak(isDimFlashingLightsEnabled(), reduced);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const pop = useSharedValue(0);
  const glow = useSharedValue(0);
  const ring = useSharedValue(0);
  const punch = useSharedValue(0);
  const flash = useSharedValue(0);
  const burst = useSharedValue(0);
  const leave = useSharedValue(0);
  const alive = useRef(true);

  const win = () => { if (alive.current) { playHaptic('win'); playMoment('game.win'); } };
  const tick = (step: number) => { if (alive.current) playMoment('ui.counterTick', { step }); };
  // The tick ladder rides the bar's own fill: one rung each sixth of the bar, on the frame it is reached.
  useAnimatedReaction(() => Math.floor(ring.value * P.ticks + 0.0001), (now, before) => {
    if (reduced || before === null || before === undefined || now <= before || now <= 0) return;
    runOnJS(tick)(now);
  }, [reduced]);

  useWhenRideUpGo(() => {
    alive.current = true;
    perfMark('rideUp.start');
    if (reduced) {
      const fade = { duration: DURATION.quick, reduceMotion: ReduceMotion.Never };
      pop.value = 1;
      ring.value = 1;
      glow.value = withSequence(ReduceMotion.Never, withTiming(0.6, fade),
        withDelay(P.leaveAt, withTiming(0, fade, ok => { if (ok) runOnJS(win)(); }), ReduceMotion.Never));
      leave.value = withDelay(P.leaveAt, withTiming(1, fade), ReduceMotion.Never);
      return () => { alive.current = false; [glow, leave].forEach(v => cancelAnimation(v)); };
    }
    // 1. gather: the card pops in with one overshoot, the glow builds, the bar fills.
    pop.value = withSpring(1, SPRING.pop);
    glow.value = withSequence(withTiming(0.35, { duration: DURATION.base, easing: EASE.charge }),
      withDelay(P.burstAt - DURATION.base, withTiming(1, { duration: DURATION.quick, easing: EASE.out })),
      withDelay(P.leaveAt - P.burstAt - DURATION.quick, withTiming(0, { duration: P.leaveMs * 2, easing: EASE.in })));
    ring.value = withDelay(P.ringAt, withTiming(1, { duration: P.ringMs, easing: EASE.out }));
    // 2. hold: one held frame on the full bar: squash, kick, a capped flash and the win buzz.
    punch.value = withDelay(P.hitAt, withSequence(withTiming(1, { duration: 1 }),
      withDelay(DURATION.hitStop - 1, withSpring(0, SPRING.pop))));
    flash.value = withDelay(P.hitAt, withSequence(withTiming(peak, { duration: 30 }),
      withTiming(peak, { duration: DURATION.hitStop - 30 }, ok => { if (ok) runOnJS(win)(); }),
      withTiming(0, { duration: DURATION.flash })));
    // 3. burst: the ring and stars from the shark.
    burst.value = withDelay(P.burstAt, withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear }));
    // 4. settle: the bar fades with the rays (exits faster than entrances).
    leave.value = withDelay(P.leaveAt, withTiming(1, { duration: P.leaveMs, easing: EASE.in }, ok => {
      if (ok) runOnJS(perfMark)('rideUp.done');
    }));
    return () => { alive.current = false; [pop, glow, ring, punch, flash, burst, leave].forEach(v => cancelAnimation(v)); };
    // One-shot per mount, from the go frame.
  }, []);

  const heroStyle = useAnimatedStyle(() => (reduced ? {} : {
    transform: [
      { translateY: -14 * (1 - pop.value) + 3 * punch.value },
      { scale: 0.9 + 0.1 * pop.value },
      { scaleX: 1 + SLAM_SQUASH * 0.5 * punch.value }, { scaleY: 1 - SLAM_SQUASH * 0.7 * punch.value },
    ],
  }));
  const barStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ scaleX: Math.max(0.001, ring.value) }] }));
  const glintStyle = useAnimatedStyle(() => ({
    opacity: ring.value > 0 && ring.value < 1 ? 1 - leave.value : 0,
    transform: [{ translateX: (box?.width ?? 0) * ring.value - 10 }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const onLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    if (burstPoint) burstPoint.value = { x: x + width - SHARK.fromRight, y: y + height - SHARK.fromBottom };
    if (!box || Math.abs(box.width - width) > 1 || Math.abs(box.height - height) > 1) setBox({ width, height });
  };
  const sharkAt = box ? { x: box.width - SHARK.fromRight, y: box.height - SHARK.fromBottom } : null;
  const rays = heroRaysSize(box?.height ?? 176);
  const backdrop = <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {/* The gold ray fan behind the card's shark, under its words. */}
    <StepGate steps={steps} at={1}>
      {sharkAt && <GoldBurst size={rays} amount={glow} reduced={reduced}
        style={{ position: 'absolute', left: sharkAt.x - rays / 2, top: sharkAt.y - rays / 2 }} />}
    </StepGate>
    {/* The liquid gold bar along the bottom edge, with a bright glint riding its tip. */}
    <Animated.View style={[styles.bar, barStyle]} />
    <Animated.View style={[styles.glint, glintStyle]} />
    <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />
  </View>;

  return <Animated.View style={heroStyle} onLayout={onLayout}>
    {/* The same fan behind the whole card, so on the burst its rays break out past the card's edges onto the sheet
        (the card's border sits over the seam; inside it, the card's own fan carries them on). */}
    <StepGate steps={steps} at={2}>
      {!reduced && sharkAt && <GoldBurst size={rays} amount={glow} reduced={reduced}
        style={{ position: 'absolute', left: CARD_BORDER + sharkAt.x - rays / 2, top: CARD_BORDER + sharkAt.y - rays / 2 }} />}
    </StepGate>
    {children(backdrop)}
    <StepGate steps={steps} at={3}>
      {!reduced && sharkAt && <BurstCanvas progress={burst} count={sparkles} radius={168} ring={52} starSize={15}
        x={CARD_BORDER + sharkAt.x} y={CARD_BORDER + sharkAt.y} />}
    </StepGate>
  </Animated.View>;
}

/**
 * The header card's own title. On "Your ride's up!" it stamps down from 1.8x and slams on
 * its impact frame (the winRoll buzz and the reveal cue); at rest it is the same line.
 */
export function RideUpKicker({ active, style, children }: { readonly active: boolean; readonly style: StyleProp<TextStyle>; readonly children: string }) {
  const preference = useReduceMotionPreference();
  const stamp = useSharedValue(active && preference === false ? 0 : 1);
  const punch = useSharedValue(0);
  const alive = useRef(true);
  const cheer = () => { if (alive.current) { playHaptic('winRoll'); playMoment('reward.reveal'); } };
  useWhenRideUpGo(() => {
    alive.current = true;
    if (!active || preference === null) return () => { alive.current = false; };
    if (preference) { cheer(); return () => { alive.current = false; }; }
    stamp.value = 0;
    stamp.value = withDelay(RIDE_UP.stampAt, withTiming(1, { duration: DURATION.slam, easing: EASE.in }, ok => { if (ok) runOnJS(cheer)(); }));
    punch.value = withDelay(RIDE_UP.stampAt + DURATION.slam, withSequence(withTiming(1, { duration: 1 }),
      withDelay(DURATION.hitStop, withSpring(0, SPRING.stamp))));
    return () => { alive.current = false; cancelAnimation(stamp); cancelAnimation(punch); };
  }, [active, preference]);
  // On screen from frame 1: the title starts oversize (never invisible) and slams down to size.
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1.5 - 0.5 * stamp.value }, { scaleX: 1 + SLAM_SQUASH * punch.value }, { scaleY: 1 - SLAM_SQUASH * punch.value }],
  }));
  if (!active) return <Text style={style}>{children}</Text>;
  return <Animated.Text style={[style, styles.kickerGlow, styles.kickerOrigin, animated]}>{children}</Animated.Text>;
}

Animated.addWhitelistedNativeProps({ text: true });
const RollingInput = Animated.createAnimatedComponent(TextInput);

/** When stat `index` of the earned row starts rolling on "Your ride's up!" (ms from the card's first frame). */
export function rideUpStatStartsAt(index: number, plan: RideUpPlan = RIDE_UP): number {
  return plan.burstAt + index * plan.statStepMs;
}

/** When stat `index` of the earned row lands on "Your ride's up!" (ms from the card's first frame). */
export function rideUpStatLandsAt(index: number, plan: RideUpPlan = RIDE_UP): number {
  return rideUpStatStartsAt(index, plan) + plan.statMs;
}

/**
 * A number that rolls up from 0 on the UI thread (no React render per digit), then pops
 * 1.12x and settles on the frame it lands. On "Your ride's up!" the earned row and the
 * minutes roll with the gold bar so every final number is on screen by about 1.4 s, even
 * when the JS thread is busy. Reduce Motion shows the number at once.
 */
export function RollingValue({ value, prefix = '', suffix = '', delayMs, durationMs, reduced, tick = false, style }: {
  readonly value: number; readonly prefix?: string; readonly suffix?: string; readonly delayMs: number;
  readonly durationMs: number; readonly reduced: boolean;
  /** A selection tick in the hand on the landing frame. */
  readonly tick?: boolean;
  readonly style?: StyleProp<TextStyle>;
}) {
  const start = reduced || value <= 0 ? value : 0;
  const shown = useSharedValue(start);
  const pop = useSharedValue(1);
  const alive = useRef(true);
  const landed = () => { if (alive.current && tick) queueHaptic('tickSelection'); };
  useWhenRideUpGo(() => {
    alive.current = true;
    if (reduced || value <= 0) { shown.value = value; return () => { alive.current = false; }; }
    shown.value = 0;
    shown.value = withDelay(delayMs, withTiming(value, { duration: durationMs, easing: EASE.out }, ok => {
      if (ok) runOnJS(landed)();
    }));
    pop.value = withDelay(delayMs + durationMs, withSequence(withTiming(1.12, { duration: DURATION.tap }), withSpring(1, SPRING.stamp)));
    return () => { alive.current = false; cancelAnimation(shown); cancelAnimation(pop); };
  }, [value, reduced]);
  const animatedProps = useAnimatedProps(() => {
    const text = prefix + String(Math.round(shown.value)) + suffix;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { text, defaultValue: text } as any;
  });
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return <RollingInput editable={false} caretHidden pointerEvents="none" underlineColorAndroid="transparent"
    accessible={false} defaultValue={prefix + String(start) + suffix} animatedProps={animatedProps}
    style={[styles.rolling, style, popStyle]} />;
}

/**
 * Wave 5 round 3: a confetti cannon fires out of the header card's shark on the burst (not a shower from the top of
 * the screen): blue, white and gold pieces shoot up and out past the card's edges, then fall and flutter across the
 * sheet. The canvas reaches CANNON_UP above the recap, so pieces fly out over the screen above it too. A second ride
 * the same day (`short`) has no confetti: only the announcement stays. Reduce Motion: none.
 */
export default function RideUpCelebration({ rideName, short = false, origin }: {
  readonly rideName: string; readonly short?: boolean;
  /** Where the header card's shark is, in this layer's points (RideUpHero writes it on layout). */
  readonly origin?: Readonly<SharedValue<{ x: number; y: number } | null>>;
}) {
  const preference = useReduceMotionPreference();
  if (preference === null || preference || short || !origin) return <Announce rideName={rideName} />;
  return <Cannon rideName={rideName} origin={origin} />;
}

function Announce({ rideName }: { readonly rideName: string }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite"
    accessible accessibilityLabel={`Your ride's up! ${rideName}. Have fun!`} />;
}

/** The cannon's canvas mounts on this step of its own build (about 0.2 s in, well before it fires at 0.42 s). */
const CANNON_STEP = 4;
/** How far above the recap the cannon's pieces can fly (pt). */
export const CANNON_UP = 140;
/** One cannon piece: launch angle (radians, up is negative), speed (pt/s), spin, size and colour. */
export interface CannonPiece { readonly a: number; readonly v: number; readonly spin: number; readonly w: number; readonly color: number; readonly delay: number; readonly drift: number }
/** The cannon's pieces: a fan from up-left to up-right, a few fast ones that clear the card, deterministic (no random). */
export function cannonPieces(count: number): CannonPiece[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const u = ((i * 37) % 100) / 100;
    return {
      // Up and a little toward the middle of the sheet (the shark sits on the card's right side), so no piece leaves
      // the screen sideways: about 150 pt of spread each way, 100 to 170 pt up, then down across the sheet.
      a: (-150 + u * 80) * (Math.PI / 180),
      v: 600 + ((i * 53) % 9) * 30,
      spin: (i % 2 ? 1 : -1) * (300 + ((i * 41) % 320)),
      w: 12 + (i % 3) * 4,
      color: [0, 1, 2, 0, 3][i % 5] ?? 0,
      delay: ((i * 29) % 8) / 100,
      drift: (i % 2 ? 1 : -1) * (8 + ((i * 13) % 12)),
    };
  });
}
/** Gravity of the cannon's pieces (pt/s per s) and their air drag (per s). */
const CANNON_G = 700;
const CANNON_DRAG = 2.2;
/** Sideways reach is narrower than the climb (the pieces fountain up, then spread as they fall). */
const CANNON_SPREAD = 0.55;

/** Where cannon piece `p` is `tau` seconds after it fires (relative to the shark); pure, for tests. */
export function cannonAt(p: CannonPiece, tau: number): { x: number; y: number } {
  'worklet';
  // Air drag eases the launch speed so the pieces float down instead of dropping like stones.
  const travel = (1 - Math.exp(-CANNON_DRAG * tau)) / CANNON_DRAG;
  return {
    x: CANNON_SPREAD * Math.cos(p.a) * p.v * travel + p.drift * Math.sin(tau * 9),
    y: Math.sin(p.a) * p.v * travel + 0.5 * CANNON_G * tau * tau,
  };
}

function Cannon({ rideName, origin }: { readonly rideName: string; readonly origin: Readonly<SharedValue<{ x: number; y: number } | null>> }) {
  const { width, height } = useWindowDimensions();
  const budget = usePowerBudget();
  const count = momentParticles(RIDE_UP.confetti, budget, false);
  const rain = useSharedValue(0);
  // The canvas mounts a few frames after the recap's first frame (never in its first commit, one small step of its
  // own); the cannon fires at confettiAt.
  const steps = useMountSteps(CANNON_STEP);
  useWhenRideUpGo(() => {
    rain.value = withDelay(RIDE_UP.confettiAt, withTiming(1, { duration: RIDE_UP.confettiMs, easing: Easing.linear }));
    return () => cancelAnimation(rain);
  }, [rain]);
  const pieces = useMemo(() => cannonPieces(count), [count]);
  const art = useMemo(() => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const ink = Skia.Paint();
    ink.setAntiAlias(true);
    ink.setStyle(PaintStyle.Stroke);
    ink.setStrokeWidth(1);
    return { paint, ink };
  }, []);
  const seconds = RIDE_UP.confettiMs / 1000;
  const top = CANNON_UP;
  const picture = useDerivedValue(() => createPicture(canvas => {
    const t = rain.value;
    const at = origin.value;
    if (t <= 0 || t >= 1 || !at) return;
    const pal = rainPalette();
    art.ink.setColor(pal[RAIN_COLORS.length - 1]);
    for (let i = 0; i < pieces.length; i += 1) {
      const p = pieces[i];
      const local = Math.max(0, (t - p.delay) / (1 - p.delay));
      if (local <= 0 || local >= 1) continue;
      const tau = local * seconds;
      const pos = cannonAt(p, tau);
      const alpha = local < 0.78 ? 1 : (1 - local) / 0.22;
      const h = p.w * 0.6;
      canvas.save();
      canvas.translate(at.x + pos.x, top + at.y + pos.y);
      canvas.rotate(p.spin * tau, 0, 0);
      // The flutter: the piece turns over as it flies.
      canvas.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(tau * 11 + i)));
      art.paint.setColor(pal[p.color]);
      art.paint.setAlphaf(alpha);
      const rect = Skia.RRectXY(Skia.XYWHRect(-p.w / 2, -h / 2, p.w, h), 2, 2);
      canvas.drawRRect(rect, art.paint);
      art.ink.setAlphaf(0.5 * alpha);
      canvas.drawRRect(rect, art.ink);
      canvas.restore();
    }
  }, { width, height: height + top }));
  if (count <= 0) return <Announce rideName={rideName} />;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite"
    accessible accessibilityLabel={`Your ride's up! ${rideName}. Have fun!`}>
    <StepGate steps={steps} at={CANNON_STEP}>
      <Canvas style={[styles.cannon, { top: -top, width, height: height + top }]}><Picture picture={picture} /></Canvas>
    </StepGate>
  </View>;
}

const styles = StyleSheet.create({
  rolling: { padding: 0, textAlign: 'center' },
  cannon: { position: 'absolute', left: 0 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: BAR, backgroundColor: GOLD_FX.rays,
    borderTopWidth: 2, borderTopColor: '#fff2b0', transformOrigin: 'left' },
  glint: { position: 'absolute', left: 0, bottom: -3, width: 20, height: BAR + 6, borderRadius: 10, backgroundColor: '#fff6cf' },
  flash: { backgroundColor: '#fffbe8' },
  kickerGlow: { textShadowColor: BRAND_NAVY, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  kickerOrigin: { alignSelf: 'flex-start', transformOrigin: 'left' },
});
