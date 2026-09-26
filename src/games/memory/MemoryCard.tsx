/**
 * MemoryCard.tsx — a single flippable card.
 *
 * FLIP IMPLEMENTATION (the physical-feeling 3D flip the spec asks for):
 *   - Two absolutely-stacked faces (back + front), each with
 *     `backfaceVisibility: 'hidden'`. The container carries a shared `flip`
 *     SharedValue in [0..1]; the back rotates 0deg→180deg and the front
 *     180deg→360deg, so exactly one face is ever camera-facing. A `perspective`
 *     transform sits FIRST in each face's transform list so the rotation reads
 *     as depth, not a flat squash.
 *   - `flip` is animated with withTiming (a snappy 260ms ease) — the rotation
 *     itself is linear-ish, but a SEPARATE `lift` SharedValue drives a slight
 *     scale-up (1→~1.08) that peaks mid-flip and SETTLES on a spring, so the
 *     card feels like it pops toward you and lands with weight rather than
 *     snapping. Mismatch flip-backs reuse the same path in reverse.
 *   - A shake SharedValue (translateX) gives the mismatch wiggle; a matched
 *     card gets a Skia paired glow (rendered by the parent) plus a spring pop.
 *
 * All animation is Reanimated on the UI thread. No JS-thread animation loop.
 */

import React, { useEffect, useImperativeHandle, forwardRef, useCallback, useState } from 'react';
import { StyleSheet, Image, View, Text, Pressable, type ImageSourcePropType } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { GAME_COLORS, JUICE } from '../../gamekit';

export interface MemoryCardHandle {
  /** Flip face-up (or back down). Returns immediately; animates on UI thread. */
  setFaceUp: (up: boolean) => void;
  /** Mismatch wiggle. */
  shake: () => void;
  /** Matched celebration: spring pop + settle. */
  celebrate: () => void;
}

interface MemoryCardProps {
  size: number;
  faceSource?: ImageSourcePropType;
  faceSheet?: ImageSourcePropType;
  sheetSlot?: number;
  sheetColumns?: number;
  sheetRows?: number;
  frameSource?: ImageSourcePropType;
  backSource?: ImageSourcePropType;
  /** Procedural fallback face (used when faceSource is missing/undecodable). */
  tint: string;
  glyph: string;
  matched: boolean;
  disabled: boolean;
  slot: number;
  symbolName: string;
  onPress: () => void;
  /** Staggered entrance delay (ms). */
  entranceDelay: number;
}

export const MemoryCard = forwardRef<MemoryCardHandle, MemoryCardProps>(
  function MemoryCard(
    { size, faceSource, faceSheet, sheetSlot, sheetColumns = 4, sheetRows = 2, frameSource, backSource, tint, glyph, matched, disabled, slot, symbolName, onPress, entranceDelay },
    ref,
  ) {
    // 0 = face down, 1 = face up.
    const flip = useSharedValue(0);
    const [faceUp, setFaceUpState] = useState(false);
    // Mid-flip lift (scale toward camera) that springs back to rest.
    const lift = useSharedValue(1);
    // Mismatch shake.
    const shakeX = useSharedValue(0);
    // Matched pop.
    const pop = useSharedValue(1);
    // Entrance.
    const enter = useSharedValue(0);

    // Staggered entrance pop-in. A JS timeout defers the start so cards cascade
    // in row-major order; the animation itself runs on the UI thread.
    useEffect(() => {
      enter.value = 0;
      const t = setTimeout(() => {
        enter.value = withTiming(1, {
          duration: 320,
          easing: Easing.out(Easing.back(1.6)),
        });
      }, entranceDelay);
      return () => clearTimeout(t);
    }, [entranceDelay, enter]);

    const setFaceUp = useCallback(
      (up: boolean) => {
        setFaceUpState(up);
        // Rotation: snappy ease.
        flip.value = withTiming(up ? 1 : 0, {
          duration: 260,
          easing: Easing.inOut(Easing.cubic),
        });
        // Lift: pop toward camera mid-flip, settle on a spring for weight.
        lift.value = withSequence(
          withTiming(1.08, { duration: 130, easing: Easing.out(Easing.quad) }),
          withSpring(1, JUICE.settleSpring),
        );
      },
      [flip, lift],
    );

    const shake = useCallback(() => {
      const amp = 9;
      shakeX.value = withSequence(
        withTiming(amp, { duration: 45, easing: Easing.linear }),
        withTiming(-amp, { duration: 45, easing: Easing.linear }),
        withTiming(amp * 0.6, { duration: 45, easing: Easing.linear }),
        withTiming(-amp * 0.6, { duration: 45, easing: Easing.linear }),
        withTiming(0, { duration: 45, easing: Easing.linear }),
      );
    }, [shakeX]);

    const celebrate = useCallback(() => {
      pop.value = withSequence(
        withTiming(1.22, { duration: 140, easing: Easing.out(Easing.back(2)) }),
        withSpring(1, JUICE.popSpring),
      );
    }, [pop]);

    useImperativeHandle(ref, () => ({ setFaceUp, shake, celebrate }), [
      setFaceUp,
      shake,
      celebrate,
    ]);

    // -- Animated styles. ----------------------------------------------------
    const containerStyle = useAnimatedStyle(() => ({
      opacity: enter.value,
      transform: [
        { translateY: interpolate(enter.value, [0, 1], [-24, 0]) },
        { translateX: shakeX.value },
        { scale: lift.value * pop.value * (0.85 + enter.value * 0.15) },
      ],
    }));

    const backStyle = useAnimatedStyle(() => ({
      transform: [
        { perspective: 800 },
        { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` },
      ],
    }));

    const frontStyle = useAnimatedStyle(() => ({
      transform: [
        { perspective: 800 },
        { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` },
      ],
    }));

    const radius = Math.round(size * 0.14);
    const faceStyle = { width: size, height: size * 1.28, borderRadius: radius };

    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || matched}
        style={styles.pressable}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Card ${slot + 1}, ${matched ? `matched ${symbolName}` : faceUp ? symbolName : 'face down'}`}
      >
        <Animated.View style={[faceStyle, containerStyle]}>
          {/* Back face (shown when face down). */}
          <Animated.View style={[styles.face, faceStyle, backStyle]}>
            {backSource ? (
              <Image source={backSource} style={[styles.img, faceStyle]} resizeMode="contain" />
            ) : (
              <View style={[styles.proceduralBack, faceStyle]}>
                <Text style={styles.backGlyph}>🦈</Text>
              </View>
            )}
          </Animated.View>

          {/* Front face (shown when face up). */}
          <Animated.View style={[styles.face, styles.frontAbs, faceStyle, frontStyle]}>
            {faceSheet && sheetSlot != null ? (
              <View style={[faceStyle, { overflow: 'hidden' }]}>
                <Image source={faceSheet} resizeMode="stretch" style={{
                  position: 'absolute',
                  width: size * sheetColumns,
                  height: size * 1.28 * sheetRows,
                  left: -(sheetSlot % sheetColumns) * size,
                  top: -Math.floor(sheetSlot / sheetColumns) * size * 1.28,
                }} />
              </View>
            ) : faceSource ? (
              <Image source={faceSource} style={[styles.img, faceStyle]} resizeMode="contain" />
            ) : frameSource ? (
              <View style={[styles.framedFront, faceStyle]}>
                <Image source={frameSource} style={[styles.img, StyleSheet.absoluteFill]}
                  resizeMode="stretch" />
                <Text style={styles.framedGlyph}>{glyph}</Text>
              </View>
            ) : (
              <View
                style={[
                  styles.proceduralFront,
                  faceStyle,
                  { backgroundColor: tint, borderColor: GAME_COLORS.navy },
                ]}
              >
                <Text style={styles.frontGlyph}>{glyph}</Text>
              </View>
            )}
            {matched ? (
              <View style={styles.matchedBadge}>
                <Text style={styles.matchedCheck}>✓</Text>
              </View>
            ) : null}
          </Animated.View>
        </Animated.View>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  pressable: { margin: 5 },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GAME_COLORS.bgPanel,
  },
  frontAbs: { position: 'absolute', top: 0, left: 0 },
  img: { width: '100%', height: '100%' },
  proceduralBack: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GAME_COLORS.navy,
    borderWidth: 3,
    borderColor: GAME_COLORS.blue,
  },
  proceduralFront: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  framedFront: { alignItems: 'center', justifyContent: 'center' },
  framedGlyph: { fontSize: 38, textAlign: 'center',
    textShadowColor: '#fff', textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2 },
  backGlyph: { fontSize: 34 },
  frontGlyph: { fontSize: 40 },
  matchedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GAME_COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchedCheck: { color: '#fff', fontSize: 13, fontWeight: '900' },
});
