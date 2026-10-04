/**
 * The trade-complete moment, staged over the dimmed board.
 *
 *   0 ms    lift    both pins pop up out of their sheet slots (riser starts)
 *   180 ms  travel  the board pin arcs over, yours swings under
 *   520 ms  cross   they meet: soft white-gold flash, sparks, gold ring, pop + medium haptic
 *   880 ms  land    the new pin dives into the spotlight at full speed: squash, shake,
 *                   rays and NEW! snap in, confetti bursts from the pin, clack + jingle + success
 *   1000 ms title   "Pin traded!" and the lines rise in; Alex's shark pops up
 *   1400 ms button  Awesome!
 *
 * Tap anywhere before the land to skip straight to it (the 10th trade is quick).
 * Everything moves on the UI thread from a few shared values; nothing mounts
 * mid-moment (confetti is mounted hidden at the start). The rays spin slowly
 * and ease to a stop; the pin shines a few times, then the card rests.
 *
 * Reduce Motion: the lit end card fades in still (static rays, spotlight,
 * NEW!), with the jingle and the success haptic.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence,
  withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, Polygon, RadialGradient, Stop } from 'react-native-svg';
import type { ItemType } from '../../models/item-type';
import { BRAND, FONT, GameButton, SPACE } from '../../ui';
import { textPreset } from '../../ui/TextPresets';
import { rng } from '../stampbook/SlamFx';
import EnamelPin from './EnamelPin';
import type { SlotRect } from './PinTradeParts';
import { PIN_TRADE_COPY as COPY, pinName, SWAP_TIMELINE as T } from './pinTradeModel';
import { beat } from './tradeAudio';

const SHARK = require('../../../assets/images/howto/shark-happy.webp');
const never = { reduceMotion: ReduceMotion.Never } as const;

export default function SwapCelebration({ got, gave, from, still, onDone }: {
  got: ItemType; gave: ItemType; still: boolean; onDone: () => void;
  /** Where the two pins sat on the trade sheet (window space), so the moment starts right there. */
  from?: { get?: SlotRect; give?: SlotRect };
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const lift = useSharedValue(still ? 1 : 0);
  const travel = useSharedValue(still ? 1 : 0);
  const hit = useSharedValue(0);
  const land = useSharedValue(still ? 1 : 0);
  const squash = useSharedValue(0);
  const shake = useSharedValue(0);
  const burst = useSharedValue(0);
  const shine = useSharedValue(0);
  const spin = useSharedValue(0);
  const bg = useSharedValue(still ? 1 : 0);
  const textIn = useSharedValue(still ? 1 : 0);
  const landed = useRef(still);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const bigSize = Math.min(190, width * 0.47);
  const cx = width / 2;
  const cy = Math.max(height * 0.4, insets.top + 150 + bigSize / 2);
  const startSize = Math.min(120, width * 0.3);

  const g0 = from?.get ?? { x: cx - 100, y: cy + 80, size: startSize };
  const v0 = from?.give ?? { x: cx + 100, y: cy + 80, size: startSize };
  const mx = (g0.x + v0.x) / 2;
  const my = (g0.y + v0.y) / 2 - 16;
  const arc = Math.min(110, Math.abs(v0.x - g0.x) * 0.45);
  const crossAt = (T.cross - T.travel) / (T.land - T.travel);

  const runLand = () => {
    if (landed.current) return;
    landed.current = true;
    timers.current.forEach(clearTimeout);
    travel.value = 1;
    land.value = withTiming(1, { duration: 1, ...never });
    squash.value = withSequence(withTiming(1, { duration: 60 }), withSpring(0, { damping: 6, stiffness: 300, mass: 0.5 }));
    shake.value = 0;
    shake.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) });
    burst.value = withTiming(1, { duration: 1300, easing: Easing.linear });
    spin.value = withTiming(1, { duration: 3200, easing: Easing.out(Easing.cubic) });
    shine.value = withDelay(260, withRepeat(withSequence(withTiming(1, { duration: 850 }), withDelay(2400, withTiming(0, { duration: 0 }))), 3, false));
    textIn.value = withDelay(T.title - T.land, withSpring(1, { damping: 14, stiffness: 220 }));
    beat('fx.hit', { volume: 0.9 });
    beat('ui.complete', { volume: 1 }, 'success', 3);
  };

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${COPY.doneTitle} ${COPY.doneMessage(pinName(got))}`);
    const t = timers.current;
    if (still) {
      beat('ui.complete', {}, 'success', 3);
      return () => t.forEach(clearTimeout);
    }
    bg.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad), ...never });
    lift.value = withTiming(1, { duration: T.travel, easing: Easing.out(Easing.back(2.2)) });
    // Linear clock; the worklets shape it (steady to the cross, accelerating into the land).
    travel.value = withDelay(T.travel, withTiming(1, { duration: T.land - T.travel, easing: Easing.linear }));
    hit.value = withDelay(T.cross, withTiming(1, { duration: 420, easing: Easing.out(Easing.exp) }));
    t.push(setTimeout(() => beat('fx.whooshRev', { volume: 0.9 }, 'tapLight', 1), 0));
    t.push(setTimeout(() => beat('fx.firework', { volume: 0.8 }, 'hitMedium', 2), T.cross));
    t.push(setTimeout(runLand, T.land));
    return () => {
      t.forEach(clearTimeout);
      [lift, travel, hit, land, squash, shake, burst, shine, spin, bg, textIn].forEach(v => cancelAnimation(v));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Tap anywhere before the land: skip to it. */
  const skip = () => {
    if (landed.current || still) return;
    cancelAnimation(travel);
    cancelAnimation(lift);
    lift.value = 1;
    runLand();
  };

  // The board pin: pops up, arcs over to the meeting point, then dives into the spotlight, fastest on the land frame.
  const gotStyle = useAnimatedStyle(() => {
    const t = travel.value;
    let x: number; let y: number;
    if (t < crossAt) {
      const u = t / crossAt;
      x = g0.x + (mx - g0.x) * u;
      y = g0.y + (my - g0.y) * u - Math.sin(u * Math.PI) * arc;
    } else {
      const u = (t - crossAt) / (1 - crossAt);
      const e = u * u;
      x = mx + (cx - mx) * e;
      y = my + (cy - my) * e;
    }
    const popUp = lift.value;
    const grow = g0.size * (1 + 0.15 * popUp) + (bigSize - g0.size * 1.15) * t * t;
    const sq = squash.value;
    return {
      transform: [
        { translateX: x - bigSize / 2 }, { translateY: y - bigSize / 2 - popUp * 10 * (1 - t) },
        { scaleX: (grow / bigSize) * (1 + 0.18 * sq) }, { scaleY: (grow / bigSize) * (1 - 0.12 * sq) },
        { rotate: `${Math.sin(Math.min(1, t) * Math.PI) * -14 + popUp * (1 - t) * 6}deg` },
      ],
    };
  });
  // Your pin: pops up, swings under to the meeting point, then flies up to the board and fades.
  const gaveStyle = useAnimatedStyle(() => {
    const t = travel.value;
    let x: number; let y: number;
    if (t < crossAt) {
      const u = t / crossAt;
      x = v0.x + (mx - v0.x) * u;
      y = v0.y + (my - v0.y) * u + Math.sin(u * Math.PI) * arc * 0.6;
    } else {
      const u = (t - crossAt) / (1 - crossAt);
      x = mx + (g0.x - mx) * u * 0.5;
      y = my - u * u * (my + v0.size);
    }
    const popUp = lift.value;
    const s = (v0.size / startSize) * (1 + 0.15 * popUp) * (t < crossAt ? 1 : 1 - (t - crossAt) * 1.1);
    return {
      opacity: t >= 1 ? 0 : t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2,
      transform: [{ translateX: x - startSize / 2 }, { translateY: y - startSize / 2 - popUp * 10 * (1 - t) }, { scale: s }, { rotate: `${t * 50}deg` }],
    };
  });
  const flashStyle = useAnimatedStyle(() => {
    const h = hit.value;
    return { opacity: h === 0 ? 0 : h < 0.12 ? 1 : Math.max(0, 1 - (h - 0.12) * 2.4), transform: [{ scale: 0.4 + h * 1.1 }] };
  });
  const ringStyle = useAnimatedStyle(() => ({
    opacity: hit.value === 0 ? 0 : Math.max(0, 1 - hit.value * 1.15),
    transform: [{ scale: 0.3 + hit.value * 1.3 }],
  }));
  const shakeStyle = useAnimatedStyle(() => {
    const s = shake.value;
    const amp = s === 0 || s >= 1 ? 0 : (1 - s) * 5;
    return { transform: [{ translateX: Math.sin(s * Math.PI * 7) * amp }, { translateY: Math.cos(s * Math.PI * 5) * amp * 0.6 }] };
  });
  const stageStyle = useAnimatedStyle(() => ({ opacity: land.value, transform: [{ scale: 0.7 + land.value * 0.3 }] }));
  const raysStyle = useAnimatedStyle(() => ({ opacity: land.value, transform: [{ scale: 0.6 + land.value * 0.4 }, { rotate: `${spin.value * 40}deg` }] }));
  const stampStyle = useAnimatedStyle(() => ({ opacity: land.value, transform: [{ scale: 0.3 + land.value * 0.7 + squash.value * 0.25 }, { rotate: '12deg' }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, textIn.value), transform: [{ translateY: (1 - textIn.value) * 18 }] }));
  const sharkStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, textIn.value * 1.5), transform: [{ translateY: (1 - textIn.value) * 60 }, { rotate: `${-8 + (1 - textIn.value) * -10}deg` }] }));
  const bgStyle = useAnimatedStyle(() => ({ opacity: bg.value }));

  const name = pinName(got);
  const seed = useMemo(() => got.id * 31 + gave.id, [got.id, gave.id]);
  const glow = bigSize * 1.35;

  return (
    <Animated.View entering={still ? FadeIn.duration(180).reduceMotion(ReduceMotion.Never) : undefined}
      exiting={FadeOut.duration(220).reduceMotion(ReduceMotion.Never)} style={[StyleSheet.absoluteFill, { zIndex: 50 }]} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessible={false} importantForAccessibility="no">
        {/* The board stays in the world, dimmed under a night-sky wash. */}
        <Animated.View style={[StyleSheet.absoluteFill, bgStyle]} pointerEvents="none">
          <LinearGradient colors={['rgba(14,52,112,0.9)', 'rgba(6,24,58,0.94)']} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]} pointerEvents="none">
          {/* Spotlight and floor: the pin lands on a lit stage. */}
          <Animated.View style={[styles.abs, { left: cx - glow, top: cy - glow, width: glow * 2, height: glow * 2 }, stageStyle]}>
            <Spotlight size={glow * 2} />
          </Animated.View>
          <Animated.View style={[styles.abs, { left: cx - glow, top: cy - glow, width: glow * 2, height: glow * 2 }, raysStyle]}>
            <GlowRays size={glow * 2} seed={seed} />
          </Animated.View>
          <Animated.View style={[styles.abs, { left: cx - bigSize * 0.55, top: cy + bigSize * 0.42, width: bigSize * 1.1, height: bigSize * 0.22 }, stageStyle]}>
            <FloorShadow width={bigSize * 1.1} height={bigSize * 0.22} />
          </Animated.View>

          {!still && <Animated.View style={[styles.abs, { left: mx - 110, top: my - 110, width: 220, height: 220 }, flashStyle]}><Flash size={220} /></Animated.View>}
          {!still && <Sparks x={mx} y={my} hit={hit} seed={seed} />}
          {!still && (
            <Animated.View style={[styles.ring, { left: mx - 90, top: my - 90, width: 180, height: 180, borderRadius: 90 }, ringStyle]} />
          )}

          {!still && (
            <Animated.View style={[styles.pin, { width: startSize, height: startSize }, gaveStyle]}>
              <EnamelPin uri={gave.icon_url} size={startSize} surface="panel" transition={0} recyclingKey={`slot-${gave.id}`} />
            </Animated.View>
          )}
          <Animated.View
            style={[styles.pin, { width: bigSize, height: bigSize }, still ? { transform: [{ translateX: cx - bigSize / 2 }, { translateY: cy - bigSize / 2 }] } : gotStyle]}>
            <EnamelPin uri={got.icon_url} size={bigSize} tilt={-4} shine={still ? undefined : shine} surface="panel" transition={0}
              recyclingKey={`slot-${got.id}`} />
          </Animated.View>
          <Animated.View style={[styles.abs, { left: cx + bigSize * 0.18, top: cy - bigSize * 0.62 }, stampStyle]}>
            <View style={styles.newStamp}><Text maxFontSizeMultiplier={1} style={styles.newStampText}>{COPY.newStamp}</Text></View>
          </Animated.View>

          {!still && <BurstConfetti x={cx} y={cy} burst={burst} seed={seed} />}
        </Animated.View>

        <Animated.View style={[styles.copy, { top: cy + bigSize * 0.72 }, textStyle]} pointerEvents="none">
          <Text maxFontSizeMultiplier={1.15} style={[textPreset('hero', 'onBlue'), styles.title]}>{COPY.doneTitle}</Text>
          <View style={styles.subPill}>
            <Text maxFontSizeMultiplier={1.25} style={styles.sub}>{COPY.doneMessage(name)}</Text>
          </View>
          <Text maxFontSizeMultiplier={1.25} style={styles.gaveLine}>{COPY.doneGave(pinName(gave))}</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.shark, { left: SPACE.md, top: cy + bigSize * 0.2 }, sharkStyle]}>
          <Image source={SHARK} style={{ width: 92, height: 102 }} contentFit="contain" />
        </Animated.View>
      </Pressable>
      <Animated.View entering={still ? FadeIn.duration(180).reduceMotion(ReduceMotion.Never) : FadeIn.delay(T.button).duration(220).reduceMotion(ReduceMotion.Never)}
        style={[styles.cta, { bottom: Math.max(insets.bottom, SPACE.lg) + SPACE.xl }]}>
        <GameButton label={COPY.doneAction} icon="check" onPress={onDone} />
      </Animated.View>
    </Animated.View>
  );
}

/** A warm radial spotlight (white-gold core fading to nothing). */
const Spotlight = memo(function Spotlight({ size }: { size: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="pinSpot" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#fff6d6" stopOpacity="0.85" />
          <Stop offset="0.35" stopColor="#ffd75e" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#ffd75e" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#pinSpot)" />
    </Svg>
  );
});

/** Tapered light rays that fade out toward their tips (a soft glow, not clip-art spokes). */
const GlowRays = memo(function GlowRays({ size, seed }: { size: number; seed: number }) {
  const rays = useMemo(() => {
    const c = size / 2;
    const rand = rng(seed);
    return Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.08;
      const len = c * (i % 2 ? 0.78 : 0.98);
      const half = (i % 2 ? 0.05 : 0.075) + rand() * 0.02;
      const inner = c * 0.12;
      const p = (ang: number, r: number) => `${(c + Math.cos(ang) * r).toFixed(1)},${(c + Math.sin(ang) * r).toFixed(1)}`;
      return `${p(a - 0.02, inner)} ${p(a - half, len)} ${p(a + half, len)} ${p(a + 0.02, inner)}`;
    });
  }, [size, seed]);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="pinRay" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#fff3c2" stopOpacity="0.95" />
          <Stop offset="0.45" stopColor="#ffd34d" stopOpacity="0.7" />
          <Stop offset="1" stopColor="#ffd34d" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {rays.map(points => <Polygon key={points} points={points} fill="url(#pinRay)" />)}
    </Svg>
  );
});

/** Soft elliptical floor shadow under the landed pin. */
const FloorShadow = memo(function FloorShadow({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id="pinFloor" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#010f2a" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#010f2a" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill="url(#pinFloor)" />
    </Svg>
  );
});

/** The cross flash: a soft white-hot core into gold, never a hard disc. */
const Flash = memo(function Flash({ size }: { size: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="pinFlash" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="0.3" stopColor="#fff2b8" stopOpacity="0.85" />
          <Stop offset="0.65" stopColor="#ffcf3b" stopOpacity="0.3" />
          <Stop offset="1" stopColor="#ffcf3b" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#pinFlash)" />
    </Svg>
  );
});

/** 10 gold sparks thrown out from the meeting point, driven by the cross value. */
function Sparks({ x, y, hit, seed }: { x: number; y: number; hit: SharedValue<number>; seed: number }) {
  const sparks = useMemo(() => {
    const rand = rng(seed + 5);
    return Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 + rand() * 0.4;
      const d = 70 + rand() * 50;
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: 3 + rand() * 3 };
    });
  }, [seed]);
  return <>{sparks.map((s, i) => <Spark key={i} x={x} y={y} {...s} hit={hit} />)}</>;
}

function Spark({ x, y, dx, dy, r, hit }: { x: number; y: number; dx: number; dy: number; r: number; hit: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const h = hit.value;
    return { opacity: h === 0 || h >= 1 ? 0 : 1 - h, transform: [{ translateX: dx * h }, { translateY: dy * h + 20 * h * h }, { scale: 1 - h * 0.6 }] };
  });
  return <Animated.View style={[styles.spark, { left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r }, style]} />;
}

const CONFETTI = ['#FFCF3B', '#FF6B4A', '#2F6BFF', '#16B39A', '#FFFFFF', '#29B6F6'];

/** A radial confetti burst from the pin with gravity. Mounted hidden at the start; one shared value drives it. */
function BurstConfetti({ x, y, burst, seed }: { x: number; y: number; burst: SharedValue<number>; seed: number }) {
  const bits = useMemo(() => {
    const rand = rng(seed + 11);
    return Array.from({ length: 36 }, (_, i) => {
      const a = rand() * Math.PI * 2;
      const v = 160 + rand() * 220;
      return {
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, spin: 360 + rand() * 720,
        w: 6 + rand() * 5, h: 9 + rand() * 7, color: CONFETTI[i % CONFETTI.length], delay: i < 12 ? 0 : rand() * 0.12,
      };
    });
  }, [seed]);
  return <>{bits.map((b, i) => <Bit key={i} x={x} y={y} {...b} burst={burst} />)}</>;
}

function Bit({ x, y, vx, vy, spin, w, h, color, delay, burst }: {
  x: number; y: number; vx: number; vy: number; spin: number; w: number; h: number; color: string; delay: number; burst: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, burst.value - delay) * 1.3;
    if (burst.value === 0 || t <= 0 || burst.value >= 1) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }] };
    return {
      opacity: t > 1 ? Math.max(0, 1 - (t - 1) * 3) : 1,
      transform: [{ translateX: vx * t }, { translateY: vy * t + 520 * t * t }, { rotate: `${spin * t}deg` }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: 2, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  pin: { position: 'absolute', left: 0, top: 0 },
  ring: { position: 'absolute', borderWidth: 7, borderColor: '#ffe07a' },
  spark: { position: 'absolute', backgroundColor: '#fff2b8' },
  newStamp: {
    backgroundColor: BRAND.red, borderRadius: 10, borderWidth: 3, borderColor: BRAND.white, paddingHorizontal: 10, paddingVertical: 4,
    shadowColor: '#021c40', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  newStampText: { fontFamily: FONT.display, fontSize: 20, color: BRAND.white, letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: 2 },
  copy: { position: 'absolute', left: SPACE.xl, right: SPACE.xl, alignItems: 'center', gap: SPACE.sm },
  title: { textAlign: 'center', color: BRAND.white, fontSize: 46, lineHeight: 52 },
  subPill: { backgroundColor: 'rgba(5,52,110,0.9)', borderRadius: 999, paddingHorizontal: SPACE.lg, paddingVertical: 6, borderWidth: 2, borderColor: 'rgba(255,224,122,0.6)' },
  sub: { fontFamily: FONT.display, fontSize: 20, lineHeight: 25, color: '#ffe07a', textAlign: 'center', paddingTop: 2 },
  gaveLine: { fontFamily: FONT.body, fontSize: 16, lineHeight: 20, color: '#e2f6ff', textAlign: 'center' },
  shark: { position: 'absolute' },
  cta: { position: 'absolute', left: SPACE.xl, right: SPACE.xl, alignItems: 'center' },
});
