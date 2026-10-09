/**
 * MemoryCard.tsx: one physical card (design v8 6.2, 6.3, 6.4).
 *
 *   Material   always-on 2px thickness strip under the bottom and right edges,
 *              a 6% paper-grain tile, a 1px bevel; Alex's card back is never
 *              restyled (gold, Showtime and cleared treatments are code tints)
 *   Flip       perspective 800, rotateY 220ms inOut(cubic) (165ms in Showtime),
 *              face swap at exactly 90deg, lift peaks at 1.10 on a spring,
 *              the edge strip widens to 3px from 70 to 110deg, a 2-step cel
 *              shade switching at 45deg, a hard specular band tracking the
 *              angle and a 0.97 landing squash
 *   Recall     the face swap holds 40ms longer while a glint crosses the back
 *   Press      0.94 plus a 3deg lean toward the touch, around its own centre
 *   Stamp      1.0 -> 1.12 (60ms), pair-only hit-stop, drop to 0.96 (80ms)
 *              with a 1-frame overexposed face, settle 1.0 (60ms)
 *   Slip       coral outline + crack, an in-place wobble +4/-3/+2/-1/0deg;
 *              the forgotten card lifts 6px, pops to 1.1 face-up and holds to
 *              640ms (type a); a known wrong tap gets a SEEN tag (type b)
 *   Idle       one shared shimmer band; a gold Showtime tint; a gold eye pip
 *              on glimpsed cards; a moved rim with an arrow
 *
 * No RN shadow props anywhere: the cel drop shadow is one Skia Atlas draw in
 * BoardFxUnder, driven by this card's `flip` and `lift` mutables. A match
 * re-renders 0 cards: everything runs on shared values through the handle.
 */

import React, { forwardRef, memo, useImperativeHandle, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  makeMutable,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';
import { MM } from './theme';

const GRAIN = require('../../assets/games/memory/v8/grain.png');

export interface CardFace {
  sheet?: ImageSourcePropType;
  slot?: number;
  cols?: number;
  rows?: number;
  /** Special card art drawn on a plate (Golden Coin, Seagull). */
  art?: ImageSourcePropType;
  plate?: string;
}

/** Per-card shared values, owned by the board (so the shadow atlas can read them). */
export interface CardValues {
  x: SharedValue<number>;
  y: SharedValue<number>;
  flip: SharedValue<number>;
  lift: SharedValue<number>;
  opacity: SharedValue<number>;
  scale: SharedValue<number>;
  rotZ: SharedValue<number>;
  arcY: SharedValue<number>;
}

export function makeCardValues(x0: number, y0: number): CardValues {
  return {
    x: makeMutable(x0),
    y: makeMutable(y0),
    flip: makeMutable(0),
    lift: makeMutable(1),
    opacity: makeMutable(0),
    scale: makeMutable(1),
    rotZ: makeMutable(0),
    arcY: makeMutable(0),
  };
}

/** The board's single idle-shimmer driver: which card id, and the band's progress. */
export interface ShimmerState {
  id: number;
  p: number;
}

export interface MemoryCardHandle {
  place: (x: number, y: number) => void;
  deal: (fromX: number, fromY: number, delay: number, fast: boolean) => void;
  flipUp: (ms: number, anticipate?: boolean) => void;
  flipDown: (ms: number, delay?: number) => void;
  /** Server-revealed tap: rotate to 60deg and wait (network hold pose). */
  hold: () => void;
  press: (nx: number, ny: number) => void;
  release: () => void;
  /** Match stamp with a pair-only hit-stop. `rim` = 1-frame white rim (chain 3+). */
  stamp: (stopMs: number, rim: boolean, scale?: number) => void;
  settle: () => void;
  /** Slip outline, crack and the in-place wobble. */
  slip: (wobble: boolean) => void;
  /** Slip type (a): the forgotten card lifts, pops to 1.1 face-up, holds to 640ms, flips back. */
  forgot: () => void;
  /** Slip type (b): lift and pop with a SEEN tag for 640ms. */
  seenTag: () => void;
  moved: (on: boolean, glow?: boolean) => void;
  moveTo: (x: number, y: number, ms: number, arc: number, delay?: number) => void;
  lift: (on: boolean) => void;
  hide: (ms?: number) => void;
  show: () => void;
  /** Fade out, jump, fade in (Tide Shift wrap-around). */
  teleport: (x: number, y: number, delay: number) => void;
  peek: (ms: number) => void;
  /** Final Pair: 0.35x through the face swap (~630ms). */
  slowFlip: () => void;
  timeoutReveal: (delay: number) => void;
  gold: (on: boolean, delay: number) => void;
  eye: (on: boolean) => void;
  /** Golden Coin legendary reveal: a gold glow leaks around the back's edges. */
  goldLeak: () => void;
  /** Steal Duel: rival-colour rim while face-up. */
  rim: (color: string | null) => void;
  /** Crew/duel refusal wobble. */
  taken: () => void;
}

interface Props {
  w: number;
  h: number;
  back: ImageSourcePropType;
  face: CardFace;
  /**
   * The deck's face sheet, mounted (hidden) from the deal on. The face is
   * then already decoded when the card flips: no blank cream frame while a
   * fresh sprite-sheet Image loads mid-flip.
   */
  preloadSheet?: ImageSourcePropType;
  goldBack?: boolean;
  reducedMotion: boolean;
  sv: CardValues;
  shimmer: SharedValue<ShimmerState>;
  id: number;
}

const INK = '#0B5CAD';

export const MemoryCard = memo(forwardRef<MemoryCardHandle, Props>(function MemoryCard(
  { w, h, back, face, preloadSheet, goldBack, reducedMotion, sv, shimmer, id },
  ref,
) {
  const v = useMemo(() => ({
    press: makeMutable(1),
    tiltX: makeMutable(0),
    tiltY: makeMutable(0),
    pop: makeMutable(1),
    slipRim: makeMutable(0),
    forgot: makeMutable(0),
    seen: makeMutable(0),
    flash: makeMutable(0),
    whiteRim: makeMutable(0),
    movedRim: makeMutable(0),
    movedGlow: makeMutable(0),
    wobble: makeMutable(0),
    squash: makeMutable(1),
    gold: makeMutable(0),
    eye: makeMutable(0),
    glint: makeMutable(0),
    leak: makeMutable(0),
    rimOn: makeMutable(0),
  }), []);
  const [failed, setFailed] = useState(false);
  const [rimColor, setRimColor] = useState<string>(MM.blue);
  const rm = reducedMotion;
  const s = sv;

  useImperativeHandle(ref, (): MemoryCardHandle => ({
    place(x, y) {
      cancelAnimation(s.x);
      cancelAnimation(s.y);
      s.x.value = x;
      s.y.value = y;
    },
    deal(fromX, fromY, delay, fast) {
      const toX = s.x.value;
      const toY = s.y.value;
      if (rm || fast) {
        s.opacity.value = withDelay(fast ? 0 : delay, withTiming(1, { duration: 120 }));
        s.scale.value = 1;
        s.rotZ.value = 0;
        return;
      }
      s.x.value = fromX;
      s.y.value = fromY;
      s.scale.value = 0.6;
      s.rotZ.value = -12;
      s.opacity.value = withDelay(delay, withTiming(1, { duration: 60 }));
      const e = { duration: 260, easing: Easing.out(Easing.back(1.2)) };
      s.x.value = withDelay(delay, withTiming(toX, e));
      s.y.value = withDelay(delay, withTiming(toY, e));
      s.scale.value = withDelay(delay, withTiming(1, e));
      s.rotZ.value = withDelay(delay, withTiming(0, e));
    },
    flipUp(ms, anticipate) {
      cancelAnimation(v.wobble);
      v.wobble.value = 0;
      v.eye.value = withTiming(0, { duration: 80 });
      if (rm) {
        s.flip.value = withTiming(1, { duration: 120 });
        return;
      }
      if (anticipate) {
        // Recall anticipation: hold the swap 40ms longer while a glint crosses the back.
        v.glint.value = 0;
        v.glint.value = withTiming(1, { duration: ms * 0.5 + 40, easing: Easing.out(Easing.quad) });
        s.flip.value = withSequence(
          withTiming(0.48, { duration: ms * 0.5, easing: Easing.in(Easing.cubic) }),
          withTiming(0.5, { duration: 40 }),
          withTiming(1, { duration: ms * 0.5, easing: Easing.out(Easing.cubic) }),
        );
      } else {
        s.flip.value = withTiming(1, { duration: ms, easing: Easing.inOut(Easing.cubic) });
      }
      s.lift.value = withSequence(
        withTiming(1.1, { duration: ms * 0.5, easing: Easing.out(Easing.quad) }),
        withSpring(1.03, { damping: 14, stiffness: 320, mass: 0.6 }),
      );
      v.squash.value = withDelay(ms + (anticipate ? 40 : 0), withSequence(withTiming(0.97, { duration: 45 }), withTiming(1, { duration: 45 })));
    },
    flipDown(ms, delay = 0) {
      cancelAnimation(v.wobble);
      v.wobble.value = 0;
      v.slipRim.value = withDelay(delay, withTiming(0, { duration: 120 }));
      v.rimOn.value = withDelay(delay, withTiming(0, { duration: 120 }));
      if (rm) {
        s.flip.value = withDelay(delay, withTiming(0, { duration: 120 }));
        return;
      }
      s.flip.value = withDelay(delay, withTiming(0, { duration: ms, easing: Easing.inOut(Easing.cubic) }));
      s.lift.value = withDelay(delay, withSequence(
        withTiming(1.05, { duration: ms * 0.5 }),
        withSpring(1, { damping: 14, stiffness: 320, mass: 0.6 }),
      ));
    },
    hold() {
      if (rm) return;
      s.flip.value = withTiming(60 / 180, { duration: 110, easing: Easing.out(Easing.quad) });
      s.lift.value = withTiming(1.1, { duration: 110 });
      v.glint.value = 0;
      v.glint.value = withTiming(1, { duration: 300 });
      // 2deg in-place wobble at 6Hz, only after 180ms without a reveal.
      v.wobble.value = withDelay(180, withRepeat(withSequence(withTiming(1, { duration: 42 }), withTiming(-1, { duration: 83 }), withTiming(0, { duration: 42 })), 6));
    },
    press(nx, ny) {
      if (rm) return;
      v.press.value = withTiming(0.94, { duration: 60, easing: Easing.out(Easing.quad) });
      v.tiltX.value = withTiming(-ny * 3, { duration: 60 });
      v.tiltY.value = withTiming(nx * 3, { duration: 60 });
    },
    release() {
      v.press.value = withSpring(1, { damping: 12, stiffness: 400 });
      v.tiltX.value = withSpring(0, { damping: 12, stiffness: 300 });
      v.tiltY.value = withSpring(0, { damping: 12, stiffness: 300 });
    },
    stamp(stopMs, rim, scale = 1) {
      if (rm) return;
      const top = 1 + 0.12 * scale;
      v.pop.value = withSequence(
        withTiming(top, { duration: 60, easing: Easing.out(Easing.quad) }),
        withDelay(stopMs, withTiming(0.96, { duration: 80, easing: Easing.in(Easing.quad) })),
        withTiming(1, { duration: 60, easing: Easing.out(Easing.quad) }),
      );
      // 1-frame overexposed face on the drop frame.
      v.flash.value = withDelay(60 + stopMs + 80, withSequence(withTiming(0.6, { duration: 1 }), withTiming(0.6, { duration: 16 }), withTiming(0, { duration: 40 })));
      if (rim) v.whiteRim.value = withDelay(60, withSequence(withTiming(1, { duration: 1 }), withTiming(1, { duration: 16 }), withTiming(0, { duration: 30 })));
    },
    settle() {
      if (rm) return;
      v.squash.value = withSequence(withTiming(0.99, { duration: 60 }), withTiming(1, { duration: 60 }));
    },
    slip(wobble) {
      v.slipRim.value = withTiming(1, { duration: 120 });
      if (rm || !wobble) return;
      v.wobble.value = withDelay(240, withSequence(
        withTiming(4 / 2, { duration: 40 }), withTiming(-3 / 2, { duration: 40 }), withTiming(2 / 2, { duration: 40 }),
        withTiming(-1 / 2, { duration: 40 }), withTiming(0, { duration: 40 }),
      ));
    },
    forgot() {
      v.forgot.value = withSequence(withTiming(1, { duration: 120 }), withDelay(400, withTiming(0, { duration: 120 })));
      s.flip.value = withSequence(withTiming(1, { duration: rm ? 1 : 120 }), withDelay(400, withTiming(0, { duration: rm ? 1 : 160 })));
      if (!rm) v.pop.value = withSequence(withTiming(1.1, { duration: 120, easing: Easing.out(Easing.back(2)) }), withDelay(400, withTiming(1, { duration: 120 })));
      s.arcY.value = withSequence(withTiming(-6, { duration: 120 }), withDelay(400, withTiming(0, { duration: 120 })));
    },
    seenTag() {
      v.seen.value = withSequence(withTiming(1, { duration: 120 }), withDelay(400, withTiming(0, { duration: 120 })));
      if (!rm) v.pop.value = withSequence(withTiming(1.1, { duration: 120 }), withDelay(400, withTiming(1, { duration: 120 })));
      s.arcY.value = withSequence(withTiming(-6, { duration: 120 }), withDelay(400, withTiming(0, { duration: 120 })));
    },
    moved(on, glow) {
      v.movedRim.value = withTiming(on ? 1 : 0, { duration: on ? 160 : 260 });
      if (on && glow) v.movedGlow.value = withSequence(withTiming(1, { duration: 120 }), withDelay(880, withTiming(0, { duration: 200 })));
    },
    moveTo(x, y, ms, arc, delay = 0) {
      if (rm) {
        s.x.value = withDelay(delay, withTiming(x, { duration: 160 }));
        s.y.value = withDelay(delay, withTiming(y, { duration: 160 }));
        return;
      }
      const e = { duration: ms, easing: Easing.inOut(Easing.cubic) };
      s.x.value = withDelay(delay, withTiming(x, e));
      s.y.value = withDelay(delay, withTiming(y, e));
      if (arc) {
        s.arcY.value = withDelay(delay, withSequence(
          withTiming(-arc, { duration: ms / 2, easing: Easing.out(Easing.sin) }),
          withTiming(0, { duration: ms / 2, easing: Easing.in(Easing.sin) }),
        ));
      }
    },
    lift(on) {
      s.lift.value = withSpring(on ? 1.08 : 1, { damping: 12, stiffness: 260 });
      s.arcY.value = withTiming(on ? -6 : 0, { duration: 140 });
    },
    hide(ms = 0) {
      s.opacity.value = ms ? withTiming(0, { duration: ms }) : 0;
    },
    show() {
      s.opacity.value = withTiming(1, { duration: 120 });
    },
    teleport(x, y, delay) {
      s.opacity.value = withDelay(delay, withSequence(withTiming(0, { duration: 150 }), withTiming(0, { duration: 60 }), withTiming(1, { duration: 180 })));
      s.x.value = withDelay(delay + 180, withTiming(x, { duration: 1 }));
      s.y.value = withDelay(delay + 180, withTiming(y, { duration: 1 }));
    },
    peek(ms) {
      v.eye.value = withDelay(ms + 200, withTiming(1, { duration: 160 }));
      s.flip.value = withSequence(withTiming(70 / 180, { duration: rm ? 1 : 90 }), withDelay(ms, withTiming(0, { duration: rm ? 1 : 120 })));
      s.lift.value = withSequence(withTiming(1.06, { duration: 90 }), withDelay(ms, withTiming(1, { duration: 120 })));
    },
    slowFlip() {
      if (rm) {
        s.flip.value = withTiming(1, { duration: 120 });
        return;
      }
      // 0.35x through the face swap: ~630ms total, the swap lands at ~400ms.
      s.flip.value = withSequence(
        withTiming(0.3, { duration: 110, easing: Easing.in(Easing.quad) }),
        withTiming(0.7, { duration: 400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
      );
      s.lift.value = withSequence(withTiming(1.14, { duration: 300 }), withSpring(1, { damping: 14, stiffness: 320, mass: 0.6 }));
    },
    timeoutReveal(delay) {
      s.flip.value = withDelay(delay, withTiming(1, { duration: rm ? 120 : 220 }));
    },
    gold(on, delay) {
      v.gold.value = withDelay(delay, withTiming(on ? 1 : 0, { duration: rm ? 1 : 200 }));
    },
    eye(on) {
      v.eye.value = withTiming(on ? 1 : 0, { duration: 160 });
    },
    goldLeak() {
      v.leak.value = withSequence(withTiming(1, { duration: 150 }), withDelay(120, withTiming(0, { duration: 260 })));
    },
    rim(color) {
      if (color) setRimColor(color);
      v.rimOn.value = withTiming(color ? 1 : 0, { duration: 120 });
    },
    taken() {
      if (rm) return;
      v.wobble.value = withRepeat(withSequence(withTiming(1, { duration: 42 }), withTiming(-1, { duration: 83 }), withTiming(0, { duration: 42 })), 2);
    },
  }), [v, s, rm]);

  const outer = useAnimatedStyle(() => ({
    opacity: s.opacity.value,
    transform: [
      { translateX: s.x.value },
      { translateY: s.y.value + s.arcY.value },
      { rotateZ: `${s.rotZ.value + v.wobble.value * 2}deg` },
      { scale: s.scale.value * v.pop.value * v.press.value },
    ],
  }));

  const body = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateX: `${v.tiltX.value}deg` },
      { rotateY: `${v.tiltY.value}deg` },
      { scaleY: v.squash.value },
      { scale: s.lift.value },
    ],
  }));

  const backStyle = useAnimatedStyle(() => {
    const deg = s.flip.value * 180;
    return {
      opacity: deg <= 90 ? 1 : 0,
      transform: [{ perspective: 800 }, { rotateY: `${deg}deg` }],
    };
  });
  const frontStyle = useAnimatedStyle(() => {
    const deg = s.flip.value * 180;
    return {
      opacity: deg > 90 ? 1 : 0,
      transform: [{ perspective: 800 }, { rotateY: `${deg + 180}deg` }],
    };
  });
  // 2-step cel shade on the turning side (0% / 25%), switching at 45deg.
  const shadeStyle = useAnimatedStyle(() => {
    const deg = s.flip.value * 180;
    const off = Math.min(deg, 180 - deg);
    return { opacity: off > 45 ? 0.25 : 0 };
  });
  // Thickness strip widens to 3px between 70 and 110deg.
  const edgeStyle = useAnimatedStyle(() => {
    const deg = s.flip.value * 180;
    const on = deg > 70 && deg < 110;
    return { opacity: on ? 1 : 0, transform: [{ scaleX: on ? 1 : 0 }] };
  });
  // Hard specular band tracking the flip angle.
  const specStyle = useAnimatedStyle(() => {
    const p = s.flip.value;
    const lit = p > 0.02 && p < 0.98 ? 0.3 : 0;
    return {
      opacity: lit,
      transform: [{ translateX: interpolate(p, [0, 1], [-w * 0.9, w * 0.9]) }, { rotateZ: '18deg' }],
    };
  });
  // The board's one idle shimmer band, Showtime-gold tint, glint, eye pip.
  const shimmerStyle = useAnimatedStyle(() => {
    const sh = shimmer.value;
    const on = sh.id === id && sh.p > 0 && sh.p < 1 && s.flip.value < 0.01;
    return { opacity: on ? 0.3 : 0, transform: [{ translateX: -w * 0.5 + sh.p * w * 1.6 }, { rotateZ: '18deg' }] };
  });
  const goldStyle = useAnimatedStyle(() => ({ opacity: v.gold.value * 0.55 }));
  const glintStyle = useAnimatedStyle(() => ({
    opacity: v.glint.value > 0 && v.glint.value < 1 ? 0.75 : 0,
    transform: [{ translateY: h * (0.8 - v.glint.value * 1.4) }],
  }));
  const eyeStyle = useAnimatedStyle(() => ({ opacity: v.eye.value * 0.7 * (s.flip.value < 0.5 ? 1 : 0) }));
  const leakStyle = useAnimatedStyle(() => ({ opacity: v.leak.value }));
  const rimStyle = useAnimatedStyle(() => ({ opacity: v.slipRim.value }));
  const forgotStyle = useAnimatedStyle(() => ({ opacity: v.forgot.value }));
  const seenStyle = useAnimatedStyle(() => ({ opacity: v.seen.value, transform: [{ scale: 0.8 + v.seen.value * 0.2 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: v.flash.value }));
  const whiteRimStyle = useAnimatedStyle(() => ({ opacity: v.whiteRim.value }));
  const movedStyle = useAnimatedStyle(() => ({ opacity: v.movedRim.value }));
  const movedGlowStyle = useAnimatedStyle(() => ({ opacity: v.movedGlow.value }));
  const rivalRimStyle = useAnimatedStyle(() => ({ opacity: v.rimOn.value }));

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
    // One stable sheet Image per card: mounted at the deal with the deck's
    // sheet (hidden), then only moved to its slot when the face is known.
    const sheet = face.sheet ?? preloadSheet;
    if (sheet != null && !failed) {
      const known = face.sheet != null && face.slot != null;
      const slot = known ? face.slot! : 0;
      const cols = known ? face.cols ?? 4 : 4;
      const rows = known ? face.rows ?? 2 : 2;
      return (
        <View style={[size, styles.clip, { backgroundColor: MM.cream }]}>
          <Image
            source={sheet}
            resizeMode="stretch"
            onError={() => setFailed(true)}
            style={{
              position: 'absolute',
              width: w * cols,
              height: h * rows,
              left: -(slot % cols) * w,
              top: -Math.floor(slot / cols) * h,
              opacity: known ? 1 : 0,
            }}
          />
        </View>
      );
    }
    return <View style={[size, styles.plate, { backgroundColor: MM.cream }]} />;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face, preloadSheet, failed, w, h]);

  const pip = Math.max(8, Math.round(w * 0.12));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { width: w, height: h }, outer]}>
      <Animated.View style={[styles.abs, { width: w, height: h }, body]}>
        {/* Always-on thickness strip under the bottom and right edges. */}
        <View style={[styles.thick, { left: 2, top: 2, width: w, height: h, borderRadius: r }]} />
        <Animated.View style={[styles.face, size, backStyle]}>
          <Image source={back} resizeMode="stretch" style={size} />
          <Image source={GRAIN} resizeMode="repeat" style={[StyleSheet.absoluteFill, styles.grain]} />
          <Animated.View style={[StyleSheet.absoluteFill, styles.goldTint, goldStyle]} />
          {goldBack ? <View style={[StyleSheet.absoluteFill, styles.goldBack, { borderRadius: r }]} /> : null}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: r }]}>
            <Animated.View style={[styles.band, { width: w * 0.28, height: h * 1.6, top: -h * 0.3, left: w * 0.36 }, shimmerStyle]} />
            <Animated.View style={[styles.glint, { width: w, height: h * 0.18 }, glintStyle]} />
          </View>
          <Animated.View style={[styles.eye, { width: pip * 1.6, height: pip, right: 4, top: 4 }, eyeStyle]}>
            <EyePip w={pip * 1.6} h={pip} />
          </Animated.View>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.bevel, { borderRadius: r }]} />
        </Animated.View>
        <Animated.View style={[styles.face, size, frontStyle]}>
          {faceNode}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.faceRim, { borderRadius: r }]} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { borderRadius: r }, flashStyle]} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { borderRadius: r }, shadeStyle]} />
        <Animated.View pointerEvents="none" style={[styles.edge, { height: h, left: w / 2 - 1.5 }, edgeStyle]} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: r }]}>
          <Animated.View style={[styles.band, { width: w * 0.28, height: h * 1.6, top: -h * 0.3, left: w * 0.36 }, specStyle]} />
        </View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, leakStyle]}>
          <View style={[StyleSheet.absoluteFill, styles.leak, { borderRadius: r + 2, margin: -3 }]} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, rimStyle]}>
          <View style={[StyleSheet.absoluteFill, styles.slipRim, { borderRadius: r }]} />
          <View style={[StyleSheet.absoluteFill, styles.slipInner, { borderRadius: r - 3, margin: 4 }]} />
          <Crack size={Math.min(w, h) * 0.42} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, forgotStyle]}>
          <View style={[StyleSheet.absoluteFill, styles.slipRim, { borderRadius: r }]} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, rivalRimStyle]}>
          <View style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 4, borderColor: rimColor }]} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, movedGlowStyle]}>
          <View style={[StyleSheet.absoluteFill, styles.movedGlow, { borderRadius: r + 2, margin: -2 }]} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, movedStyle]}>
          <View style={[StyleSheet.absoluteFill, styles.movedRim, { borderRadius: r }]} />
          <MovedArrow size={Math.min(w, h) * 0.26} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.whiteRim, { borderRadius: r }, whiteRimStyle]} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.seenTag, { top: -10, left: w / 2 - 26 }, seenStyle]}>
        <Text style={styles.seenText}>SEEN</Text>
      </Animated.View>
    </Animated.View>
  );
}));

/** Gold eye pip: "you were shown this card" (glimpse, Peek, Photo Flash). */
function EyePip({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} viewBox="0 0 24 15">
      <Ellipse cx={12} cy={7.5} rx={11} ry={6.5} fill={MM.gold} stroke={INK} strokeWidth={1.6} />
      <Circle cx={12} cy={7.5} r={3.4} fill={INK} />
      <Circle cx={10.8} cy={6.3} r={1.1} fill="#ffffff" />
    </Svg>
  );
}

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
  thick: { position: 'absolute', backgroundColor: '#c9d8ea', borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#0b3f7a' },
  face: { position: 'absolute', left: 0, top: 0, backfaceVisibility: 'hidden', overflow: 'hidden' },
  clip: { overflow: 'hidden' },
  plate: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#ffffff' },
  faceRim: { borderWidth: 3, borderColor: '#ffffff' },
  grain: { opacity: 0.12 },
  bevel: {
    borderTopWidth: 1, borderLeftWidth: 1, borderBottomWidth: 1, borderRightWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)', borderLeftColor: 'rgba(255,255,255,0.25)',
    borderBottomColor: 'rgba(11,92,173,0.15)', borderRightColor: 'rgba(11,92,173,0.15)',
  },
  goldTint: { backgroundColor: '#ffc21a' },
  goldBack: { borderWidth: 3, borderColor: MM.gold },
  shade: { backgroundColor: '#05346e' },
  edge: { position: 'absolute', top: 0, width: 3, backgroundColor: '#c9d8ea', borderLeftWidth: 0.5, borderRightWidth: 0.5, borderColor: '#0b3f7a' },
  band: { position: 'absolute', backgroundColor: '#FFF4D6' },
  glint: { position: 'absolute', left: 0, top: 0, backgroundColor: 'rgba(255,240,170,0.8)' },
  eye: { position: 'absolute' },
  leak: { borderWidth: 4, borderColor: '#ffd84a' },
  slipRim: { borderWidth: 4, borderColor: MM.coral },
  slipInner: { borderWidth: 1.5, borderColor: '#ffffff' },
  movedRim: { borderWidth: 2, borderColor: '#ffffff', borderStyle: 'dashed' },
  movedGlow: { borderWidth: 3, borderColor: MM.gold },
  whiteRim: { borderWidth: 3, borderColor: '#ffffff' },
  flash: { backgroundColor: '#ffffff' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  cornerTR: { position: 'absolute', top: -6, right: -6 },
  seenTag: {
    position: 'absolute', width: 52, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 2, borderColor: MM.coral,
  },
  seenText: { fontFamily: 'Shark', fontSize: 13, color: MM.coral },
});

export type { SharedValue };
