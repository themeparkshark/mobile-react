/**
 * Answer tile (design 3 / 11.3 / 11.4): cream card, 3pt charcoal outline,
 * 6pt lip, shape + colour badge. Face-down during the read-lock: badge and a
 * striped card back only, NO answer text in the view tree until unlock.
 * Flips face-up (scaleX 0 -> 1, outBack), squashes on press, locks gold,
 * reveals correct (white silhouette frame, then gold) or wrong (coral + X).
 */
import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { ART, BADGES, C, SHARKS, type SharkLook } from '../art';

export type TileState = 'down' | 'up' | 'dim' | 'locked' | 'correct' | 'wrong' | 'removed' | 'reveal-dim';

interface Props {
  index: number;
  label: string;
  state: TileState;
  width: number;
  height: number;
  /** UI-thread tap gate: returns true when this tap should lock. */
  onTapUI: (index: number) => void;
  flipDelay: number;
  /** Heads that dropped on this tile at the reveal. */
  heads: SharkLook[];
  /** Park distribution bar 0..1 (multiplayer / Peek), -1 hides. */
  bar: number;
  wiggleKey: number;
  reducedMotion: boolean;
  fontSize: number;
  /** Chomped: bitten in half and gone. */
  chomped: boolean;
  frost: boolean;
  rim: number;
}

export const Tile = React.memo(function Tile({
  index, label, state, width, height, onTapUI, flipDelay, heads, bar, wiggleKey, reducedMotion, fontSize, chomped, frost, rim,
}: Props) {
  const flip = useSharedValue(state === 'down' ? 1 : 1);
  const press = useSharedValue(1);
  const wig = useSharedValue(0);
  const pop = useSharedValue(1);
  const white = useSharedValue(0);
  const bite = useSharedValue(0);
  const barFill = useSharedValue(0);
  const faceUp = state !== 'down';
  const [showFace, setShowFace] = React.useState(faceUp);

  // Face-down -> face-up flip on unlock.
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
    flip.value = withDelay(flipDelay, withTiming(0, { duration: 90, easing: Easing.in(Easing.quad) }, (done) => {
      'worklet';
      if (done) {
        runOnJS(setShowFace)(true);
        flip.value = withSpring(1, { damping: 11, stiffness: 420, mass: 0.5 });
      }
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceUp]);

  useEffect(() => {
    if (!wiggleKey || reducedMotion) return;
    wig.value = withSequence(withTiming(-5, { duration: 30 }), withTiming(5, { duration: 30 }), withTiming(-3, { duration: 30 }), withTiming(0, { duration: 30 }));
  }, [wiggleKey, wig, reducedMotion]);

  useEffect(() => {
    if (state === 'locked') {
      press.value = withSequence(withTiming(0.92, { duration: 60 }), withSpring(1, { damping: 9, stiffness: 380 }));
    } else if (state === 'correct') {
      white.value = withSequence(withTiming(1, { duration: 16 }), withDelay(33, withTiming(0, { duration: 180 })));
      pop.value = reducedMotion ? 1 : withSequence(withTiming(1.08, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 300 }));
    } else if (state === 'wrong') {
      press.value = withSequence(withTiming(0.9, { duration: 70 }), withSpring(0.97, { damping: 10, stiffness: 300 }));
    }
  }, [state, press, white, pop, reducedMotion]);

  useEffect(() => {
    if (chomped) bite.value = reducedMotion ? 1 : withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    else bite.value = 0;
  }, [chomped, bite, reducedMotion]);

  useEffect(() => {
    barFill.value = bar < 0 ? 0 : reducedMotion ? bar : withDelay(80, withTiming(bar, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [bar, barFill, reducedMotion]);

  const gesture = Gesture.Tap()
    .maxDuration(600)
    .onBegin(() => {
      'worklet';
      press.value = withTiming(0.95, { duration: 50 });
    })
    .onFinalize(() => {
      'worklet';
      press.value = withSpring(1, { damping: 10, stiffness: 400 });
    })
    .onEnd(() => {
      'worklet';
      onTapUI(index);
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: wig.value },
      { scaleX: flip.value * press.value * pop.value },
      { scaleY: press.value * pop.value },
    ],
    opacity: 1 - bite.value,
  }));
  const whiteStyle = useAnimatedStyle(() => ({ opacity: white.value }));
  const barStyle = useAnimatedStyle(() => ({ width: `${barFill.value * 100}%` }));
  const leftHalf = useAnimatedStyle(() => ({ transform: [{ translateX: -bite.value * 30 }, { rotate: `${-bite.value * 25}deg` }], opacity: 1 - bite.value }));

  const badge = BADGES[index % 4];
  const dim = state === 'dim' || state === 'reveal-dim' || state === 'removed';
  const bg = state === 'correct' ? C.gold : state === 'wrong' ? C.coral : state === 'locked' ? '#fff3c4' : frost ? C.frost : C.cream;
  const border = state === 'locked' ? C.goldDeep : C.ink;
  if (state === 'removed' && !chomped) return <View style={{ width, height }} />;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[{ width, height }, style, dim && { opacity: 0.55 }]}
        accessibilityRole="button"
        accessibilityLabel={showFace ? `Answer ${String.fromCharCode(65 + index)}: ${label}` : `Answer ${String.fromCharCode(65 + index)}, hidden`}
      >
        <View style={[styles.lip, { borderRadius: 18 }]} />
        <Animated.View style={[styles.tile, { backgroundColor: bg, borderColor: border, borderWidth: state === 'locked' ? 4 : 3 }, rim > 0 && { shadowColor: C.gold, shadowOpacity: 1, shadowRadius: rim * 2, shadowOffset: { width: 0, height: 0 } }, chomped && leftHalf]}>
          {showFace ? null : <CardBack />}
          {bar >= 0 ? <Animated.View style={[styles.bar, barStyle]} /> : null}
          <View style={styles.row}>
            <Badge shape={badge.shape} color={badge.color} size={Math.min(28, height * 0.34)} />
            {showFace ? (
              <Text
                style={[styles.label, { fontSize, color: state === 'wrong' ? '#fff' : C.navy }]}
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {label}
              </Text>
            ) : null}
          </View>
          {state === 'wrong' ? <Image source={ART.xBadge} style={styles.x} /> : null}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.white, whiteStyle]} />
        </Animated.View>
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

function DropHead({ look, i, reducedMotion }: { look: SharkLook; i: number; reducedMotion: boolean }) {
  const y = useSharedValue(reducedMotion ? 0 : -40);
  useEffect(() => {
    if (!reducedMotion) y.value = withDelay(i * 60, withSpring(0, { damping: 8, stiffness: 320, mass: 0.6 }));
  }, [y, i, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: y.value < -30 ? 0 : 1 }));
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
  lip: { position: 'absolute', left: 0, right: 0, top: 6, bottom: -6, backgroundColor: '#c9b98f', borderWidth: 3, borderColor: C.ink },
  tile: { flex: 1, borderRadius: 18, overflow: 'hidden', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  label: { flex: 1, marginLeft: 10, fontWeight: '800' },
  back: { backgroundColor: '#fff1cc', overflow: 'hidden' },
  stripe: { position: 'absolute', top: -20, bottom: -20, width: 10, backgroundColor: 'rgba(0,165,245,0.16)', transform: [{ rotate: '24deg' }] },
  x: { position: 'absolute', right: 8, top: 8, width: 26, height: 26 },
  heads: { position: 'absolute', right: 4, top: -16, flexDirection: 'row' },
  head: { width: 34, height: 34 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,165,245,0.18)' },
  white: { backgroundColor: '#ffffff', borderRadius: 16 },
});

export type TapGate = SharedValue<number>;
