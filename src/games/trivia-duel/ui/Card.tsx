/**
 * The question board (design 3, 8, 11.3, 11.4; rev 7).
 *
 * Hangs from the marquee header strip on two rope hangers. Gold 6pt frame,
 * 3pt charcoal outline, the 24-bulb speed ticker around the edge (BulbBorder)
 * and the drum plaque on the top edge: a 34pt odometer showing exactly
 * (100 + speed) x streak multiplier, the biggest thing on screen while you
 * answer, with an "x1.5" chip when the multiplier is above 1. The full
 * question appears at once (19pt / 800 / navy, max 3 lines, floor 17pt); a
 * gold progress line fills under it over the read-lock. The rev 4 timer ring
 * is gone: the bulbs and the fuse are the only clock.
 *
 * The board never moves during a question. It drops on GO (translateY -24 to
 * 0, popSpring, 180ms), retracts up into the marquee strip for a stage
 * takeover, and flips face-down in 160ms during a HOLD.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Canvas, Line, RoundedRect, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing, useAnimatedProps, useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { C } from '../art';
import { BulbBorder } from './BulbBorder';

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

export const BOARD_H = 160;
export const ROPE_H = 26;

interface Props {
  roundLabel: string;
  question: string;
  /** Drum value (already multiplied); 0 hides the number. */
  drum: SharedValue<number>;
  drumOn: boolean;
  /** "x1.5" when the multiplier is above 1 (null hides it). */
  multChip: string | null;
  /** Ring speed 0-100, -1 off. */
  speed: SharedValue<number>;
  beat: SharedValue<number>;
  fxMs: SharedValue<number>;
  hot: SharedValue<number>;
  lockFlashAt: SharedValue<number>;
  fuse: SharedValue<number>;
  urgent: SharedValue<number>;
  readProgress: SharedValue<number>;
  /** Countdown preview: board and face-down tiles at 60% opacity. */
  preview: boolean;
  dropKey: number;
  flip3d: boolean;
  faceDown: boolean;
  /** Stage takeover: 0 hanging, 1 retracted into the marquee strip. */
  retract: SharedValue<number>;
  reducedMotion: boolean;
  width: number;
  onTierEdge?: () => void;
  children?: React.ReactNode;
}

export const QuestionCard = React.memo(function QuestionCard({
  roundLabel, question, drum, drumOn, multChip, speed, beat, fxMs, hot, lockFlashAt, fuse, urgent, readProgress, preview, dropKey, flip3d,
  faceDown, retract, reducedMotion, width, onTierEdge, children,
}: Props) {
  const y = useSharedValue(0);
  const fy = useSharedValue(1);
  const o = useSharedValue(1);
  const down = useSharedValue(0);
  // Only a new card (dropKey) animates: phase changes never re-run the drop or the Final flip.
  const flipRef = React.useRef(flip3d);
  flipRef.current = flip3d;
  useEffect(() => {
    if (!dropKey) return;
    if (reducedMotion) {
      o.value = 0;
      o.value = withTiming(1, { duration: 200 });
      return;
    }
    if (flipRef.current) {
      // The Final card flips in (2D scaleY on twos-friendly timing; no 3D layers over the board set).
      fy.value = 0.02;
      fy.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.4)) });
    } else {
      y.value = -24;
      y.value = withSpring(0, { damping: 11, stiffness: 320, mass: 0.6 });
    }
  }, [dropKey, reducedMotion, y, fy, o]);
  useEffect(() => {
    down.value = reducedMotion ? (faceDown ? 1 : 0) : withTiming(faceDown ? 1 : 0, { duration: 160 });
  }, [faceDown, down, reducedMotion]);

  const st = useAnimatedStyle(() => ({
    opacity: o.value * (preview ? 0.6 : 1),
    transform: [
      { translateY: y.value - retract.value * (BOARD_H + ROPE_H + 20) },
      { scaleY: fy.value },
    ],
  }));
  // HOLD flip: the face squashes to an edge and comes back as the board back.
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: Math.abs(1 - 2 * Math.min(1, down.value)) || 0.02 }] }));

  const drumText = useAnimatedProps(() => ({ text: `+${Math.round(drum.value)}` } as never));
  const drumPop = useSharedValue(1);
  const lastDrumTier = useSharedValue(-1);
  useDerivedValue(() => {
    const s = speed.value;
    const tier = s >= 95 ? 3 : s >= 70 ? 2 : s >= 35 ? 1 : 0;
    if (tier !== lastDrumTier.value) {
      const crossed = lastDrumTier.value >= 0 && s >= 0;
      lastDrumTier.value = tier;
      if (crossed && !reducedMotion) drumPop.value = withSequence(withTiming(1.08, { duration: 30 }), withTiming(1, { duration: 30 }));
    }
  });
  const drumColor = useDerivedValue(() => (speed.value >= 70 ? C.navy : speed.value >= 35 ? '#0a5fa0' : '#4b6c8c'));
  const drumStyle = useAnimatedStyle(() => ({ color: drumColor.value }));
  const plateStyle = useAnimatedStyle(() => ({ transform: [{ scale: drumPop.value }] }));
  const readStyle = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, readProgress.value)) * 100}%`, opacity: readProgress.value >= 1 ? 0 : 1 }));

  const bw = width;
  return (
    <Animated.View style={[{ width: bw, height: BOARD_H + ROPE_H, alignSelf: 'center' }, st]}>
      {/* Rope hangers up into the marquee strip. */}
      <Canvas style={{ position: 'absolute', left: 0, top: 0, width: bw, height: ROPE_H + 8 }} pointerEvents="none">
        {[bw * 0.18, bw * 0.82].map((x) => (
          <React.Fragment key={x}>
            <Line p1={vec(x, 0)} p2={vec(x, ROPE_H + 6)} color={C.ink} strokeWidth={6} strokeCap="round" />
            <Line p1={vec(x, 0)} p2={vec(x, ROPE_H + 6)} color="#e8d3a2" strokeWidth={3} strokeCap="round" />
          </React.Fragment>
        ))}
      </Canvas>
      <Animated.View style={[styles.board, { top: ROPE_H, width: bw, height: BOARD_H }, faceStyle]}>
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <RoundedRect x={1.5} y={1.5} width={bw - 3} height={BOARD_H - 3} r={20} color={C.gold} />
          <RoundedRect x={1.5} y={1.5} width={bw - 3} height={BOARD_H - 3} r={20} color={C.ink} style="stroke" strokeWidth={3} />
          <RoundedRect x={18} y={18} width={bw - 36} height={BOARD_H - 36} r={10} color="#ffffff" />
          <RoundedRect x={18} y={18} width={bw - 36} height={BOARD_H - 36} r={10} color={C.ink} style="stroke" strokeWidth={2.5} />
        </Canvas>
        <BulbBorder
          width={bw}
          height={BOARD_H}
          speed={speed}
          beat={beat}
          fxMs={fxMs}
          hot={hot}
          lockFlashAt={lockFlashAt}
          fuse={fuse}
          urgent={urgent}
          reducedMotion={reducedMotion}
          onTierEdge={onTierEdge}
        />
        <View style={styles.inner}>
          <Text style={styles.round} numberOfLines={1}>{roundLabel}</Text>
          {faceDown ? (
            <Text style={[styles.q, styles.paused]}>Back in a sec</Text>
          ) : (
            <Text style={styles.q} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.9} accessibilityRole="header">
              {question}
            </Text>
          )}
          <View style={styles.readTrack}>
            <Animated.View style={[styles.readFill, readStyle]} />
          </View>
        </View>
      </Animated.View>
      {drumOn && !faceDown ? (
        <Animated.View style={[styles.plate, plateStyle]} pointerEvents="none">
          <AnimatedInput editable={false} underlineColorAndroid="transparent" style={[styles.drum, drumStyle]} animatedProps={drumText} defaultValue="+200" />
          {multChip ? <View style={styles.mult}><Text style={styles.multText}>{multChip}</Text></View> : null}
        </Animated.View>
      ) : null}
      {children}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  board: { position: 'absolute', left: 0 },
  inner: { position: 'absolute', left: 26, right: 26, top: 22, bottom: 20, justifyContent: 'center' },
  round: { fontFamily: 'Knockout', fontSize: 13, color: C.navy, opacity: 0.6, letterSpacing: 0.6, textAlign: 'center', marginTop: 8 },
  q: { fontSize: 19, lineHeight: 23, fontWeight: '800', color: C.navy, textAlign: 'center', marginTop: 2 },
  paused: { opacity: 0.5 },
  readTrack: { height: 4, borderRadius: 2, backgroundColor: '#f1ead6', marginTop: 6, overflow: 'hidden', marginHorizontal: 18 },
  readFill: { height: 4, backgroundColor: C.gold },
  plate: {
    position: 'absolute', alignSelf: 'center', top: ROPE_H - 22, height: 44, minWidth: 116, paddingHorizontal: 12, borderRadius: 14,
    backgroundColor: C.gold, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 5, alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
  },
  drum: { fontFamily: 'Knockout', fontSize: 34, padding: 0, margin: 0, minWidth: 84, textAlign: 'center', includeFontPadding: false },
  mult: { marginLeft: 4, backgroundColor: C.coral, borderRadius: 9, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 5, paddingVertical: 1 },
  multText: { fontFamily: 'Shark', fontSize: 15, color: '#ffffff' },
});
