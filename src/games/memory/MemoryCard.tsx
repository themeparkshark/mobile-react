/**
 * MemoryCard.tsx: one physical card (design 6.2, 6.3, 6.4).
 *
 * Real 3D flip: perspective 800, back hides and face shows at exactly 90deg
 * (backfaceVisibility plus an opacity switch on the UI thread), lift to 1.10
 * that settles on a spring, a thickness strip between 70 and 110deg, a shade
 * that darkens the turning side, a specular band that tracks the angle and a
 * contact shadow that stretches with lift and narrows edge-on.
 *
 * Everything is driven by shared values through an imperative handle, so a
 * match never re-renders the other cards. Position is absolute inside the
 * board; the parent moves cards (deal, Tide Shift, gull swaps, shelf flights).
 */

import React, { forwardRef, memo, useImperativeHandle, useMemo, useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { MM } from './theme';

export interface CardFace {
  sheet?: ImageSourcePropType;
  slot?: number;
  cols?: number;
  rows?: number;
  /** Special card art drawn on a plate (Golden Coin, Seagull). */
  art?: ImageSourcePropType;
  plate?: string;
}

export interface MemoryCardHandle {
  place: (x: number, y: number) => void;
  deal: (fromX: number, fromY: number, delay: number, fast: boolean) => void;
  flipUp: (ms: number) => void;
  flipDown: (ms: number, delay?: number) => void;
  /** Server-revealed tap: rotate to 60deg and wait (network hold pose). */
  hold: () => void;
  press: (nx: number, ny: number) => void;
  release: () => void;
  /** Match pop: 1 -> 1.18 with a pair-only hit-stop hold, then settle. */
  pop: (lean: number, stopMs: number, flash: boolean) => void;
  settle: () => void;
  slip: (shake: boolean) => void;
  ghost: () => void;
  moved: (on: boolean) => void;
  moveTo: (x: number, y: number, ms: number, arc: number, delay?: number) => void;
  lift: (on: boolean) => void;
  flyTo: (x: number, y: number, scale: number, delay: number, onLand?: () => void) => void;
  hide: () => void;
  /** Fade out, jump, fade in (Tide Shift wrap-around). */
  teleport: (x: number, y: number, delay: number) => void;
  peek: (ms: number) => void;
  slowFlip: (ms: number) => void;
  timeoutReveal: (delay: number) => void;
}

interface Props {
  w: number;
  h: number;
  back: ImageSourcePropType;
  face: CardFace;
  goldBack?: boolean;
  reducedMotion: boolean;
  /** Initial slot position (the parent moves the card afterwards). */
  x0?: number;
  y0?: number;
}

const INK = '#0B5CAD';

function useCardValues(x0: number, y0: number) {
  return {
    flip: useSharedValue(0),
    lift: useSharedValue(1),
    press: useSharedValue(1),
    tiltX: useSharedValue(0),
    tiltY: useSharedValue(0),
    x: useSharedValue(x0),
    y: useSharedValue(y0),
    arcY: useSharedValue(0),
    scale: useSharedValue(1),
    rotZ: useSharedValue(0),
    opacity: useSharedValue(0),
    shakeX: useSharedValue(0),
    pop: useSharedValue(1),
    lean: useSharedValue(0),
    slipRim: useSharedValue(0),
    ghost: useSharedValue(0),
    flash: useSharedValue(0),
    movedRim: useSharedValue(0),
    wobble: useSharedValue(0),
    squash: useSharedValue(1),
  };
}

export const MemoryCard = memo(forwardRef<MemoryCardHandle, Props>(function MemoryCard(
  { w, h, back, face, goldBack, reducedMotion, x0 = 0, y0 = 0 },
  ref,
) {
  const v = useCardValues(x0, y0);
  const [failed, setFailed] = useState(false);
  const rm = reducedMotion;

  useImperativeHandle(ref, (): MemoryCardHandle => ({
    place(x, y) {
      cancelAnimation(v.x);
      cancelAnimation(v.y);
      v.x.value = x;
      v.y.value = y;
    },
    deal(fromX, fromY, delay, fast) {
      const toX = v.x.value;
      const toY = v.y.value;
      if (rm || fast) {
        v.opacity.value = withDelay(fast ? 0 : delay, withTiming(1, { duration: 120 }));
        v.scale.value = 1;
        v.rotZ.value = 0;
        return;
      }
      v.x.value = fromX;
      v.y.value = fromY;
      v.scale.value = 0.6;
      v.rotZ.value = -12;
      v.opacity.value = withDelay(delay, withTiming(1, { duration: 60 }));
      const e = { duration: 260, easing: Easing.out(Easing.back(1.2)) };
      v.x.value = withDelay(delay, withTiming(toX, e));
      v.y.value = withDelay(delay, withTiming(toY, e));
      v.scale.value = withDelay(delay, withTiming(1, e));
      v.rotZ.value = withDelay(delay, withTiming(0, e));
    },
    flipUp(ms) {
      cancelAnimation(v.wobble);
      v.wobble.value = 0;
      if (rm) {
        v.flip.value = withTiming(1, { duration: 120 });
        return;
      }
      v.flip.value = withTiming(1, { duration: ms, easing: Easing.inOut(Easing.cubic) });
      v.lift.value = withSequence(
        withTiming(1.1, { duration: ms * 0.5, easing: Easing.out(Easing.quad) }),
        withSpring(1.04, { damping: 14, stiffness: 320, mass: 0.6 }),
      );
      v.squash.value = withDelay(ms, withSequence(withTiming(0.97, { duration: 45 }), withTiming(1, { duration: 45 })));
    },
    flipDown(ms, delay = 0) {
      cancelAnimation(v.wobble);
      v.wobble.value = 0;
      v.slipRim.value = withDelay(delay, withTiming(0, { duration: 120 }));
      if (rm) {
        v.flip.value = withDelay(delay, withTiming(0, { duration: 120 }));
        return;
      }
      v.flip.value = withDelay(delay, withTiming(0, { duration: ms, easing: Easing.inOut(Easing.cubic) }));
      v.lift.value = withDelay(delay, withSequence(
        withTiming(1.06, { duration: ms * 0.5 }),
        withSpring(1, { damping: 14, stiffness: 320, mass: 0.6 }),
      ));
    },
    hold() {
      if (rm) return;
      v.flip.value = withTiming(60 / 180, { duration: 110, easing: Easing.out(Easing.quad) });
      v.lift.value = withTiming(1.1, { duration: 110 });
      v.wobble.value = withDelay(180, withSequence(
        withTiming(1, { duration: 40 }), withTiming(-1, { duration: 80 }), withTiming(1, { duration: 80 }),
        withTiming(-1, { duration: 80 }), withTiming(0, { duration: 40 }),
      ));
    },
    press(nx, ny) {
      if (rm) return;
      v.press.value = withTiming(0.94, { duration: 60, easing: Easing.out(Easing.quad) });
      v.tiltX.value = withTiming(-ny * 6, { duration: 60 });
      v.tiltY.value = withTiming(nx * 6, { duration: 60 });
    },
    release() {
      v.press.value = withSpring(1, { damping: 12, stiffness: 400 });
      v.tiltX.value = withSpring(0, { damping: 12, stiffness: 300 });
      v.tiltY.value = withSpring(0, { damping: 12, stiffness: 300 });
    },
    pop(lean, stopMs, flash) {
      if (rm) return;
      v.pop.value = withSequence(
        withTiming(1.18, { duration: 90, easing: Easing.out(Easing.back(2)) }),
        withDelay(stopMs, withSpring(1, { damping: 9, stiffness: 320, mass: 0.6 })),
      );
      v.lean.value = withSequence(
        withTiming(lean, { duration: 90 }),
        withDelay(stopMs, withSpring(0, { damping: 12, stiffness: 260 })),
      );
      if (flash) {
        v.flash.value = withDelay(90, withSequence(withTiming(0.9, { duration: 16 }), withTiming(0, { duration: 90 })));
      }
    },
    settle() {
      if (rm) return;
      v.squash.value = withSequence(withTiming(0.99, { duration: 60 }), withTiming(1, { duration: 60 }));
    },
    slip(shake) {
      v.slipRim.value = withTiming(1, { duration: 120 });
      if (rm || !shake) return;
      v.shakeX.value = withDelay(240, withSequence(
        withTiming(7, { duration: 40 }), withTiming(-6, { duration: 40 }), withTiming(4, { duration: 40 }),
        withTiming(-2, { duration: 40 }), withTiming(0, { duration: 40 }),
      ));
    },
    ghost() {
      v.ghost.value = withSequence(withTiming(1, { duration: 90 }), withDelay(310, withTiming(0, { duration: 160 })));
    },
    moved(on) {
      v.movedRim.value = withTiming(on ? 1 : 0, { duration: on ? 160 : 260 });
    },
    moveTo(x, y, ms, arc, delay = 0) {
      if (rm) {
        v.x.value = withDelay(delay, withTiming(x, { duration: 160 }));
        v.y.value = withDelay(delay, withTiming(y, { duration: 160 }));
        return;
      }
      const e = { duration: ms, easing: Easing.inOut(Easing.cubic) };
      v.x.value = withDelay(delay, withTiming(x, e));
      v.y.value = withDelay(delay, withTiming(y, e));
      if (arc) {
        v.arcY.value = withDelay(delay, withSequence(
          withTiming(-arc, { duration: ms / 2, easing: Easing.out(Easing.sin) }),
          withTiming(0, { duration: ms / 2, easing: Easing.in(Easing.sin) }),
        ));
      }
    },
    lift(on) {
      v.lift.value = withSpring(on ? 1.08 : 1, { damping: 12, stiffness: 260 });
      v.arcY.value = withTiming(on ? -10 : 0, { duration: 140 });
    },
    flyTo(x, y, scale, delay, onLand) {
      const e = { duration: rm ? 1 : 280, easing: Easing.inOut(Easing.cubic) };
      const arc = rm ? 0 : Math.max(24, w * 0.6);
      v.x.value = withDelay(delay, withTiming(x, e));
      v.y.value = withDelay(delay, withTiming(y, e));
      v.scale.value = withDelay(delay, withTiming(scale, e));
      v.arcY.value = withDelay(delay, withSequence(
        withTiming(-arc, { duration: 140, easing: Easing.out(Easing.sin) }),
        withTiming(0, { duration: 140, easing: Easing.in(Easing.sin) }),
      ));
      v.opacity.value = withDelay(delay + 280, withTiming(0, { duration: rm ? 120 : 90 }, (done) => {
        if (done && onLand) runOnJS(onLand)();
      }));
    },
    hide() {
      v.opacity.value = 0;
    },
    teleport(x, y, delay) {
      v.opacity.value = withDelay(delay, withSequence(
        withTiming(0, { duration: 150 }),
        withTiming(0, { duration: 60 }),
        withTiming(1, { duration: 180 }),
      ));
      v.x.value = withDelay(delay + 180, withTiming(x, { duration: 1 }));
      v.y.value = withDelay(delay + 180, withTiming(y, { duration: 1 }));
    },
    peek(ms) {
      v.flip.value = withSequence(
        withTiming(70 / 180, { duration: 90 }),
        withDelay(ms, withTiming(0, { duration: 120 })),
      );
      v.arcY.value = withSequence(withTiming(-8, { duration: 90 }), withDelay(ms, withTiming(0, { duration: 120 })));
    },
    slowFlip(ms) {
      // Final Pair: 0.35x through the middle 250ms around the 90deg swap.
      if (rm) {
        v.flip.value = withTiming(1, { duration: 120 });
        return;
      }
      v.flip.value = withSequence(
        withTiming(0.36, { duration: ms * 0.3 }),
        withTiming(0.64, { duration: 250 / 0.35 * 0.4 }),
        withTiming(1, { duration: ms * 0.3 }),
      );
      v.lift.value = withSequence(withTiming(1.14, { duration: 300 }), withSpring(1, { damping: 14, stiffness: 320, mass: 0.6 }));
    },
    timeoutReveal(delay) {
      v.flip.value = withDelay(delay, withTiming(1, { duration: rm ? 120 : 220 }));
    },
  }), [v, rm, w]);

  const outer = useAnimatedStyle(() => ({
    opacity: v.opacity.value,
    transform: [
      { translateX: v.x.value + v.shakeX.value },
      { translateY: v.y.value + v.arcY.value },
      { rotateZ: `${v.rotZ.value + v.lean.value + v.wobble.value * 2}deg` },
      { scale: v.scale.value * v.pop.value * v.press.value },
    ],
  }));

  const shadow = useAnimatedStyle(() => {
    const deg = v.flip.value * 180;
    const edge = Math.abs(Math.cos((deg * Math.PI) / 180));
    const liftAmt = Math.max(0, (v.lift.value - 1) * 10);
    return {
      opacity: 0.35 - liftAmt * 0.12,
      transform: [
        { translateY: 2 + liftAmt * 6 },
        { scaleX: 0.15 + 0.85 * edge },
        { scale: 1 + liftAmt * 0.08 },
      ],
    };
  });

  const body = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateX: `${v.tiltX.value}deg` },
      { rotateY: `${v.tiltY.value}deg` },
      { scaleY: v.squash.value },
      { scale: v.lift.value },
    ],
  }));

  const backStyle = useAnimatedStyle(() => {
    const deg = v.flip.value * 180;
    return {
      opacity: deg <= 90 ? 1 : 0,
      transform: [{ perspective: 800 }, { rotateY: `${deg}deg` }],
    };
  });
  const frontStyle = useAnimatedStyle(() => {
    const deg = v.flip.value * 180;
    return {
      opacity: deg > 90 ? 1 : 0,
      transform: [{ perspective: 800 }, { rotateY: `${deg + 180}deg` }],
    };
  });
  // Turning-side shade (multiply stand-in) and the thickness strip.
  const shadeStyle = useAnimatedStyle(() => {
    const deg = v.flip.value * 180;
    return { opacity: Math.abs(Math.sin((deg * Math.PI) / 180)) * 0.35 };
  });
  const edgeStyle = useAnimatedStyle(() => {
    const deg = v.flip.value * 180;
    const on = deg > 70 && deg < 110;
    return {
      opacity: on ? 1 : 0,
      transform: [{ scaleX: on ? 1 : 0 }],
    };
  });
  // Specular band tracks the flip angle, peaking as the face lands.
  const specStyle = useAnimatedStyle(() => {
    const p = v.flip.value;
    const lit = Math.sin(p * Math.PI) * 0.6 + (p > 0.85 ? (1 - Math.abs(p - 1) * 6) * 0.4 : 0);
    return {
      opacity: Math.max(0, Math.min(0.35, lit * 0.35 + 0.02)),
      transform: [{ translateX: interpolate(p, [0, 1], [-w * 0.9, w * 0.9]) }, { rotateZ: '20deg' }],
    };
  });
  const rimStyle = useAnimatedStyle(() => ({ opacity: v.slipRim.value }));
  const ghostStyle = useAnimatedStyle(() => ({ opacity: v.ghost.value * 0.6 }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: v.flash.value }));
  const movedStyle = useAnimatedStyle(() => ({ opacity: v.movedRim.value }));

  const r = Math.round(Math.min(w, h) * 0.12);
  const size = { width: w, height: h, borderRadius: r };

  const faceNode = useMemo(() => {
    if (face.art) {
      return (
        <View style={[styles.plate, size, { backgroundColor: face.plate ?? MM.cream }]}>
          <Image source={face.art} resizeMode="contain" style={{ width: w * 0.8, height: h * 0.72 }} />
        </View>
      );
    }
    if (face.sheet != null && face.slot != null && !failed) {
      const cols = face.cols ?? 4;
      const rows = face.rows ?? 2;
      return (
        <View style={[size, styles.clip]}>
          <Image
            source={face.sheet}
            resizeMode="stretch"
            onError={() => setFailed(true)}
            style={{
              position: 'absolute',
              width: w * cols,
              height: h * rows,
              left: -(face.slot % cols) * w,
              top: -Math.floor(face.slot / cols) * h,
            }}
          />
        </View>
      );
    }
    return <View style={[size, styles.plate, { backgroundColor: MM.cream }]} />;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face, failed, w, h]);

  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { width: w, height: h }, outer]}>
      <Animated.View style={[styles.shadow, size, shadow]} />
      <Animated.View style={[styles.abs, { width: w, height: h }, body]}>
        <Animated.View style={[styles.face, size, backStyle]}>
          <Image source={back} resizeMode="stretch" style={size} />
          {goldBack ? <View style={[StyleSheet.absoluteFill, styles.goldBack, { borderRadius: r }]} /> : null}
          <Animated.View style={[StyleSheet.absoluteFill, ghostStyle]}>
            {faceNode}
            <View style={[StyleSheet.absoluteFill, styles.ghostRim, { borderRadius: r }]} />
          </Animated.View>
        </Animated.View>
        <Animated.View style={[styles.face, size, frontStyle]}>
          {faceNode}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.faceRim, { borderRadius: r }]} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { borderRadius: r }, shadeStyle]} />
        <Animated.View pointerEvents="none" style={[styles.edge, { height: h, left: w / 2 - 1 }, edgeStyle]} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: r }]}>
          <Animated.View style={[styles.spec, { width: w * 0.28, height: h * 1.6, top: -h * 0.3, left: w * 0.36 }, specStyle]} />
        </View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, rimStyle]}>
          <View style={[StyleSheet.absoluteFill, styles.slipRim, { borderRadius: r }]} />
          <View style={[StyleSheet.absoluteFill, styles.slipInner, { borderRadius: r - 3, margin: 4 }]} />
          <Crack size={Math.min(w, h) * 0.42} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, movedStyle]}>
          <View style={[StyleSheet.absoluteFill, styles.movedRim, { borderRadius: r }]} />
          <MovedArrow size={Math.min(w, h) * 0.26} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { borderRadius: r }, flashStyle]} />
      </Animated.View>
    </Animated.View>
  );
}));

/** Hand-inked crack glyph (slip). */
function Crack({ size }: { size: number }) {
  return (
    <View style={styles.center} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Path d="M20 2 L16 14 L23 19 L14 28 L19 31 L15 38" stroke="#ffffff" strokeWidth={7} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Path d="M20 2 L16 14 L23 19 L14 28 L19 31 L15 38" stroke={MM.coral} strokeWidth={3.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function MovedArrow({ size }: { size: number }) {
  return (
    <View style={styles.cornerTR} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={11} fill="#ffffff" stroke={INK} strokeWidth={2} />
        <Line x1={6} y1={12} x2={17} y2={12} stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
        <Path d="M13 7 L18 12 L13 17" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  shadow: { position: 'absolute', left: 0, top: 0, backgroundColor: '#064375' },
  face: { position: 'absolute', left: 0, top: 0, backfaceVisibility: 'hidden', overflow: 'hidden' },
  clip: { overflow: 'hidden' },
  plate: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#ffffff' },
  faceRim: { borderWidth: 3.5, borderColor: '#ffffff' },
  goldBack: { borderWidth: 3, borderColor: MM.gold },
  shade: { backgroundColor: '#05346e' },
  edge: { position: 'absolute', top: 0, width: 3, backgroundColor: '#dfe9f5' },
  spec: { position: 'absolute', backgroundColor: '#ffffff' },
  slipRim: { borderWidth: 4, borderColor: MM.coral },
  slipInner: { borderWidth: 1.5, borderColor: '#ffffff' },
  ghostRim: { borderWidth: 2.5, borderColor: MM.coral, borderStyle: 'dashed' },
  movedRim: { borderWidth: 2, borderColor: '#ffffff', borderStyle: 'dashed' },
  flash: { backgroundColor: '#ffffff' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  cornerTR: { position: 'absolute', top: -6, right: -6 },
});

export type { SharedValue };
