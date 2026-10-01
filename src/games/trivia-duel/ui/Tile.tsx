/**
 * Console answer tile (design 5.1, 8, 11.4; rev 7).
 *
 * Code-drawn game-show button: cream face, 3pt charcoal outline, 6pt bevel,
 * a bottom lip in the badge colour, a rim of 6 small bulbs that light on
 * touch-down and on the reveal, and the shape + colour badge (A blue circle,
 * B coral triangle, C gold star, D green diamond). Face-down: the same button
 * with stripes and the badge only; no answer text exists in the view tree
 * until unlock.
 *
 * Lock on release (Hearthstone anticipation): touch-down lifts the tile 3pt
 * and lights its rim; releasing on the tile locks; sliding off cancels. The
 * scored time is the release. Final answers use hold-to-lock (Millionaire):
 * hold 300ms while a fill ring closes; releasing early cancels; the scored
 * time is the moment the ring closes. Both stop a bump in a moving line from
 * becoming an answer.
 *
 * Reveal: correct = 2-frame white silhouette then gold; wrong = coral with
 * Alex's X. Avatar heads drop onto picked tiles (Quiplash) and a thermometer
 * fills with the pick share (Kahoot) once the stamp has gone.
 */
import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { ART, BADGES, C, SHARKS, type SharkLook } from '../art';
import { FINAL_HOLD_MS } from '../engine/config';

export type TileState = 'down' | 'up' | 'dim' | 'locked' | 'amber' | 'correct' | 'wrong' | 'removed' | 'reveal-dim';

interface Props {
  index: number;
  label: string;
  state: TileState;
  width: number;
  height: number;
  /** UI-thread lock gate: called on release (or when the hold ring closes). */
  onTapUI: (index: number) => void;
  /** JS: touch-down (lift + rim) and cancel, for the haptic tick and the tile note. */
  onTouch?: (index: number, down: boolean) => void;
  /** Final: press and hold 300ms to lock. */
  holdToLock?: boolean;
  flipDelay: number;
  /** Heads that dropped on this tile at the reveal. */
  heads: SharkLook[];
  /** Pick share 0..1 (thermometer), -1 hides. */
  share: number;
  wiggleKey: number;
  reducedMotion: boolean;
  fontSize: number;
  /** Chomped: bitten in half and gone. */
  chomped: boolean;
  /** Read-only (spectating, someone else's pick): no touch. */
  disabled?: boolean;
}

/** Labels longer than this use the compact face: smaller corner badge, wider text. */
export const TILE_COMPACT_CHARS = 26;

const LIP = 6;

export const Tile = React.memo(function Tile({
  index, label, state, width, height, onTapUI, onTouch, holdToLock, flipDelay, heads, share, wiggleKey, reducedMotion, fontSize, chomped, disabled,
}: Props) {
  const flip = useSharedValue(1);
  const press = useSharedValue(0);
  const lift = useSharedValue(0);
  const wig = useSharedValue(0);
  const pop = useSharedValue(1);
  const white = useSharedValue(0);
  const bite = useSharedValue(0);
  const shareFill = useSharedValue(0);
  const ring = useSharedValue(0);
  const rimOn = useSharedValue(0);
  const faceUp = state !== 'down';
  const compact = label.length > TILE_COMPACT_CHARS && width < 260;
  const [showFace, setShowFace] = React.useState(faceUp);

  // Face-down -> face-up flip on unlock (scaleX 0 to 1, outBack, 30ms stagger).
  useEffect(() => {
    if (!faceUp) {
      setShowFace(false);
      flip.value = 1;
      return;
    }
    if (showFace) return;
    if (reducedMotion) {
      setShowFace(true);
      return;
    }
    flip.value = withDelay(flipDelay, withTiming(0, { duration: 80, easing: Easing.in(Easing.quad) }, (done) => {
      'worklet';
      if (done) {
        runOnJS(setShowFace)(true);
        flip.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.back(2)) });
      }
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceUp]);

  useEffect(() => {
    if (!wiggleKey || reducedMotion) return;
    wig.value = withSequence(withTiming(-5, { duration: 30 }), withTiming(5, { duration: 30 }), withTiming(-3, { duration: 30 }), withTiming(0, { duration: 30 }));
  }, [wiggleKey, wig, reducedMotion]);

  useEffect(() => {
    if (state === 'locked' || state === 'amber') {
      lift.value = 0;
      press.value = reducedMotion ? 1 : withSpring(1, { damping: 12, stiffness: 520 });
      rimOn.value = 1;
    } else if (state === 'correct') {
      press.value = withTiming(0, { duration: 80 });
      white.value = withSequence(withTiming(1, { duration: 16 }), withDelay(33, withTiming(0, { duration: 140 })));
      pop.value = reducedMotion ? 1 : withSequence(withTiming(1.06, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 300 }));
      rimOn.value = 1;
    } else if (state === 'wrong') {
      press.value = withTiming(0, { duration: 60 });
      pop.value = reducedMotion ? 1 : withSequence(withTiming(0.92, { duration: 70 }), withSpring(0.98, { damping: 10, stiffness: 300 }));
      rimOn.value = 0;
    } else if (state === 'up' || state === 'down') {
      press.value = 0;
      lift.value = 0;
      rimOn.value = 0;
      ring.value = 0;
      pop.value = 1;
    } else {
      rimOn.value = 0;
      ring.value = 0;
    }
  }, [state, press, lift, white, pop, rimOn, ring, reducedMotion]);

  useEffect(() => {
    if (chomped) bite.value = reducedMotion ? 1 : withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
    else bite.value = 0;
  }, [chomped, bite, reducedMotion]);

  useEffect(() => {
    shareFill.value = share < 0 ? 0 : reducedMotion ? share : withTiming(share, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [share, shareFill, reducedMotion]);

  const touch = (down: boolean) => onTouch?.(index, down);
  const live = state === 'up' && !disabled;
  const slop = Math.max(18, Math.min(width, height) * 0.45);

  const tap = Gesture.Tap()
    .enabled(live && !holdToLock)
    .maxDuration(6000)
    .maxDistance(slop)
    .onBegin(() => {
      'worklet';
      lift.value = withTiming(1, { duration: 60 });
      rimOn.value = 1;
      runOnJS(touch)(true);
    })
    .onEnd((_e, success) => {
      'worklet';
      if (success) onTapUI(index);
    })
    .onFinalize((_e, success) => {
      'worklet';
      if (!success) {
        lift.value = withTiming(0, { duration: 90 });
        rimOn.value = 0;
        runOnJS(touch)(false);
      }
    });

  const hold = Gesture.LongPress()
    .enabled(live && !!holdToLock)
    .minDuration(FINAL_HOLD_MS)
    .maxDistance(slop)
    .onBegin(() => {
      'worklet';
      lift.value = withTiming(1, { duration: 60 });
      rimOn.value = 1;
      ring.value = 0;
      ring.value = withTiming(1, { duration: FINAL_HOLD_MS, easing: Easing.linear });
      runOnJS(touch)(true);
    })
    .onStart(() => {
      'worklet';
      // The ring closed: this is the scored moment.
      onTapUI(index);
    })
    .onFinalize((_e, success) => {
      'worklet';
      if (!success) {
        ring.value = withTiming(0, { duration: 90 });
        lift.value = withTiming(0, { duration: 90 });
        rimOn.value = 0;
        runOnJS(touch)(false);
      }
    });

  const gesture = Gesture.Exclusive(hold, tap);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: wig.value },
      { translateY: -3 * lift.value + 5 * press.value },
      { scaleX: flip.value * pop.value },
      { scaleY: pop.value },
    ],
    opacity: 1 - bite.value,
  }));
  const lipStyle = useAnimatedStyle(() => ({ top: LIP - 5 * press.value + 3 * lift.value }));
  const whiteStyle = useAnimatedStyle(() => ({ opacity: white.value }));
  const shareStyle = useAnimatedStyle(() => ({ width: `${shareFill.value * 100}%` }));
  const leftHalf = useAnimatedStyle(() => ({ transform: [{ translateX: -bite.value * 30 }, { rotate: `${-bite.value * 25}deg` }], opacity: 1 - bite.value }));
  const rimStyle = useAnimatedStyle(() => ({ opacity: rimOn.value }));

  const ringPath = React.useMemo(() => {
    const p = Skia.Path.Make();
    p.addRRect(Skia.RRectXY(Skia.XYWHRect(3, 3, width - 6, height - 6), 16, 16));
    return p;
  }, [width, height]);
  const ringEnd = useDerivedValue(() => ring.value);
  const ringOpacity = useDerivedValue(() => (ring.value > 0 ? 1 : 0));

  const badge = BADGES[index % 4];
  const dim = state === 'dim' || state === 'reveal-dim' || state === 'removed';
  const bg = state === 'correct' ? C.gold : state === 'wrong' ? C.coral : state === 'amber' ? '#ffb347' : state === 'locked' ? '#fff3c4' : C.cream;
  const border = state === 'locked' || state === 'amber' ? C.goldDeep : C.ink;
  if (state === 'removed' && !chomped) return <View style={{ width, height: height + LIP }} />;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[{ width, height: height + LIP }, style, dim && { opacity: 0.55 }]}
        accessibilityRole="button"
        accessibilityLabel={showFace ? `Answer ${String.fromCharCode(65 + index)}: ${label}` : `Answer ${String.fromCharCode(65 + index)}, face down`}
      >
        <Animated.View style={[styles.lip, { backgroundColor: badge.lip, height }, lipStyle]} />
        <Animated.View style={[styles.tile, { height, backgroundColor: bg, borderColor: border, borderWidth: state === 'locked' || state === 'amber' ? 4 : 3 }, chomped && leftHalf]}>
          {showFace ? null : <CardBack />}
          <View style={styles.bevel} pointerEvents="none" />
          {share >= 0 ? <Animated.View style={[styles.share, shareStyle]} /> : null}
          <View style={[styles.row, compact && styles.rowCompact]}>
            <Badge shape={badge.shape} color={badge.color} size={compact ? 22 : Math.min(28, height * 0.34)} />
            {showFace ? (
              <Text
                style={[styles.label, compact && styles.labelCompact, { fontSize, lineHeight: Math.round(fontSize * 1.12), color: state === 'wrong' ? '#fff' : C.navy }]}
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.92}
              >
                {label}
              </Text>
            ) : null}
          </View>
          {state === 'wrong' ? <Image source={ART.xBadge} style={styles.x} /> : null}
          <Animated.View style={[StyleSheet.absoluteFill, rimStyle]} pointerEvents="none">
            {RIM.map(([x, y], i) => (
              <View key={i} style={[styles.rimBulb, { left: x * (width - 14) + 1, top: y * (height - 14) + 1 }]} />
            ))}
          </Animated.View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.white, whiteStyle]} />
        </Animated.View>
        {holdToLock ? (
          <Animated.View style={[StyleSheet.absoluteFill, { height }]} pointerEvents="none">
            <Canvas style={{ width, height }}>
              <Path path={ringPath} color={C.goldDeep} style="stroke" strokeWidth={6} strokeCap="round" start={0} end={ringEnd} opacity={ringOpacity} />
            </Canvas>
          </Animated.View>
        ) : null}
        {heads.length ? (
          <View style={styles.heads} pointerEvents="none">
            {heads.map((h, i) => (
              <DropHead key={`${h}${i}`} look={h} i={i} reducedMotion={reducedMotion} />
            ))}
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
});

/** Rim bulb positions as fractions of the face (6 bulbs: 3 top, 3 bottom). */
const RIM: [number, number][] = [[0.04, 0.02], [0.5, 0.02], [0.96, 0.02], [0.04, 0.98], [0.5, 0.98], [0.96, 0.98]];

function DropHead({ look, i, reducedMotion }: { look: SharkLook; i: number; reducedMotion: boolean }) {
  const y = useSharedValue(reducedMotion ? 0 : -60);
  useEffect(() => {
    if (!reducedMotion) y.value = withDelay(i * 60, withSpring(0, { damping: 8, stiffness: 320, mass: 0.6 }));
  }, [y, i, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: y.value < -50 ? 0 : 1 }));
  return (
    <Animated.View style={[{ marginLeft: i ? -8 : 0 }, st]}>
      <Image source={SHARKS[look]} style={styles.head} />
    </Animated.View>
  );
}

function CardBack() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.back]} pointerEvents="none">
      {Array.from({ length: 9 }, (_, i) => (
        <View key={i} style={[styles.stripe, { left: -40 + i * 26 }]} />
      ))}
    </View>
  );
}

export function Badge({ shape, color, size }: { shape: string; color: string; size: number }) {
  const s = size;
  const d = shape === 'circle' ? `M ${s / 2} 2 A ${s / 2 - 2} ${s / 2 - 2} 0 1 1 ${s / 2 - 0.01} 2 Z`
    : shape === 'diamond' ? `M ${s / 2} 2 L ${s - 2} ${s / 2} L ${s / 2} ${s - 2} L 2 ${s / 2} Z`
    : shape === 'triangle' ? `M ${s / 2} 2.5 L ${s - 2} ${s - 3} L 2 ${s - 3} Z`
    : starPath(s);
  return (
    <Svg width={s} height={s}>
      <SvgPath d={d} fill={color} stroke={C.ink} strokeWidth={2.5} strokeLinejoin="round" />
    </Svg>
  );
}

function starPath(s: number): string {
  const cx = s / 2;
  const cy = s / 2 + 1;
  const R = s / 2 - 1.5;
  const r = R * 0.48;
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'} ${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)} `;
  }
  return `${d}Z`;
}

const styles = StyleSheet.create({
  lip: { position: 'absolute', left: 0, right: 0, borderRadius: 18, borderWidth: 3, borderColor: C.ink },
  tile: { borderRadius: 18, overflow: 'hidden', justifyContent: 'center' },
  bevel: { position: 'absolute', left: 6, right: 6, top: 4, height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.7)' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  label: { flex: 1, marginLeft: 10, fontWeight: '800' },
  rowCompact: { paddingHorizontal: 8 },
  labelCompact: { marginLeft: 6 },
  back: { backgroundColor: '#fff1cc', overflow: 'hidden' },
  stripe: { position: 'absolute', top: -20, bottom: -20, width: 10, backgroundColor: 'rgba(0,165,245,0.16)', transform: [{ rotate: '24deg' }] },
  x: { position: 'absolute', right: 8, top: 8, width: 26, height: 26 },
  heads: { position: 'absolute', right: 4, top: -18, flexDirection: 'row' },
  head: { width: 36, height: 36 },
  share: { position: 'absolute', left: 0, bottom: 0, height: 8, backgroundColor: 'rgba(0,165,245,0.45)' },
  white: { backgroundColor: '#ffffff', borderRadius: 16 },
  rimBulb: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff3b0', borderWidth: 2, borderColor: C.ink },
});
