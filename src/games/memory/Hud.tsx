/**
 * Hud.tsx: the glanceable top strip (design 6.1, 6.3, 6.6, 6.8).
 *
 *   StopwatchPlate  seconds on a white plate (Alex-pilot stopwatch), pulses in the last 5s
 *   ChainPlate      streak icon, chain count, 6 Showtime pips (a burning fuse during
 *                   Showtime), the QUICK ring that shrinks for 1500ms, Daily strike pips
 *   GhostLane       PB / friend ghost as a progress lane with a delta chip
 *   VerdictChip     SCOUT (blue, magnifier) or SLIP (coral, crack) for 400ms
 *   Callout         SHARP / QUICK / SWEET RUN / SHOWTIME in the Shark font
 */

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { MM } from './theme';

const STOPWATCH = require('../../assets/games/memory/studio/stopwatch.png');
const STREAK = require('../../assets/games/memory/studio/streak.png');
const IDLE_SHARK = require('../../assets/games/memory/studio/shark_idle.png');

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// -----------------------------------------------------------------------------
// Stopwatch
// -----------------------------------------------------------------------------

export function StopwatchPlate({ seconds, urgent, frozen, delta, reducedMotion }: {
  seconds: number | null;
  urgent: boolean;
  frozen: boolean;
  /** +3 / -2 chip on clock changes. */
  delta: { id: number; ms: number } | null;
  reducedMotion: boolean;
}) {
  const pulse = useSharedValue(1);
  const chip = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(pulse);
    if (urgent && seconds != null && seconds <= 5 && !reducedMotion) {
      pulse.value = withSequence(withTiming(1.08, { duration: 120 }), withTiming(1, { duration: 130 }));
    } else pulse.value = 1;
  }, [seconds, urgent, reducedMotion, pulse]);
  useEffect(() => {
    if (!delta) return;
    chip.value = withSequence(withTiming(1, { duration: 120 }), withDelay(700, withTiming(0, { duration: 220 })));
  }, [delta, chip]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const chipSt = useAnimatedStyle(() => ({
    opacity: chip.value,
    transform: [{ translateY: (1 - chip.value) * 6 - 4 }],
  }));
  if (seconds == null) return <View style={styles.plateSlot} />;
  return (
    <Animated.View style={[styles.plate, urgent && styles.plateUrgent, frozen && styles.plateFrozen, st]}
      accessible accessibilityLabel={`${seconds} seconds left`}>
      <Image source={STOPWATCH} style={styles.plateIcon} resizeMode="contain" />
      <Text style={[styles.plateText, urgent && { color: MM.urgent }]}>{seconds}</Text>
      {delta ? (
        <Animated.View style={[styles.deltaChip, { backgroundColor: delta.ms > 0 ? MM.gold : MM.coral }, chipSt]}>
          <Text style={styles.deltaText}>{`${delta.ms > 0 ? '+' : '-'}${Math.round(Math.abs(delta.ms) / 1000)}s`}</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

// -----------------------------------------------------------------------------
// Chain plate + Showtime gauge + QUICK ring
// -----------------------------------------------------------------------------

export interface ChainPlateHandle {
  bounce: () => void;
  shatter: () => void;
  quick: () => void;
  quickHit: () => void;
}

export const ChainPlate = forwardRef<ChainPlateHandle, {
  chain: number;
  gauge: number;
  showtime: boolean;
  showWarn: boolean;
  strikes: number | null;
  strikesMax: number;
  reducedMotion: boolean;
}>(function ChainPlate({ chain, gauge, showtime, showWarn, strikes, strikesMax, reducedMotion }, ref) {
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);
  const ring = useSharedValue(0);
  const ringHit = useSharedValue(0);
  const fuse = useSharedValue(0);
  useImperativeHandle(ref, () => ({
    bounce() {
      if (reducedMotion) return;
      scale.value = withSequence(withTiming(1.06, { duration: 70 }), withTiming(1, { duration: 70 }));
    },
    shatter() {
      if (reducedMotion) return;
      shake.value = withSequence(
        withTiming(5, { duration: 30 }), withTiming(-5, { duration: 30 }), withTiming(3, { duration: 30 }), withTiming(0, { duration: 30 }),
      );
    },
    quick() {
      cancelAnimation(ring);
      ring.value = 1;
      ring.value = withTiming(0, { duration: 1500, easing: Easing.linear });
    },
    quickHit() {
      cancelAnimation(ring);
      ring.value = 0;
      ringHit.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 260 }));
    },
  }), [reducedMotion, scale, shake, ring, ringHit]);
  useEffect(() => {
    cancelAnimation(fuse);
    if (showtime && showWarn && !reducedMotion) {
      fuse.value = withRepeat(withSequence(withTiming(1, { duration: 250 }), withTiming(0, { duration: 250 })), -1);
    } else fuse.value = 0;
  }, [showtime, showWarn, reducedMotion, fuse]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { scale: scale.value * (1 + fuse.value * 0.06) }],
  }));
  const ringProps = useAnimatedProps(() => ({
    r: 16 + ring.value * 22,
    strokeOpacity: ring.value > 0.001 ? 0.35 + (1 - ring.value) * 0.65 : ringHit.value,
    strokeWidth: 2 + ringHit.value * 3,
  }));
  const pips = [];
  for (let i = 0; i < 6; i++) {
    const on = showtime || i < gauge;
    pips.push(<View key={i} style={[styles.pip, on && styles.pipOn, showtime && styles.pipShow]} />);
  }
  return (
    <Animated.View style={[styles.chainPlate, showtime && styles.chainShow, st]}
      accessible accessibilityLabel={`Chain ${chain}${showtime ? ', Showtime' : ''}`}>
      <View style={styles.ringWrap} pointerEvents="none">
        <Svg width={84} height={84} viewBox="-42 -42 84 84">
          <AnimatedCircle cx={0} cy={0} fill="none" stroke={MM.gold} animatedProps={ringProps} />
        </Svg>
      </View>
      <View style={styles.chainRow}>
        <Image source={STREAK} style={styles.streakIcon} resizeMode="contain" />
        <Text style={styles.chainText}>{chain}</Text>
        {strikes != null ? (
          <View style={styles.strikes}>
            {Array.from({ length: strikesMax }, (_, i) => (
              <View key={i} style={[styles.strike, i < strikes && styles.strikeOn]} />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.pips}>{pips}</View>
    </Animated.View>
  );
});

// -----------------------------------------------------------------------------
// Ghost lane
// -----------------------------------------------------------------------------

export function GhostLane({ label, ghostPairs, myPairs, total, delta, ahead, passed }: {
  label: string;
  ghostPairs: number;
  myPairs: number;
  total: number;
  delta: string | null;
  ahead: boolean;
  passed: number;
}) {
  const g = useSharedValue(0);
  const me = useSharedValue(0);
  const spin = useSharedValue(0);
  useEffect(() => { g.value = withSpring(total ? ghostPairs / total : 0, { damping: 16, stiffness: 140 }); }, [ghostPairs, total, g]);
  useEffect(() => { me.value = withSpring(total ? myPairs / total : 0, { damping: 16, stiffness: 140 }); }, [myPairs, total, me]);
  useEffect(() => {
    if (!passed) return;
    spin.value = 0;
    spin.value = withTiming(1, { duration: 360, easing: Easing.out(Easing.back(1.4)) });
  }, [passed, spin]);
  const [w, setW] = useState(0);
  const gs = useAnimatedStyle(() => ({ transform: [{ translateX: g.value * Math.max(0, w - 22) }, { rotateZ: `${spin.value * 360}deg` }] }));
  const ms = useAnimatedStyle(() => ({ width: 8 + me.value * Math.max(0, w - 8) }));
  return (
    <View style={styles.ghostWrap}>
      <View style={styles.ghostTrack} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.ghostFill, ms]} />
        <Animated.View style={[styles.ghostToken, gs]}>
          <Image source={IDLE_SHARK} style={styles.ghostImg} resizeMode="contain" />
        </Animated.View>
      </View>
      <View style={styles.ghostMeta}>
        <Text style={styles.ghostLabel} numberOfLines={1}>{label}</Text>
        {delta ? (
          <View style={[styles.deltaPill, ahead ? styles.deltaAhead : styles.deltaBehind]}>
            <Text style={[styles.deltaPillText, ahead && { color: MM.navyText }]}>{delta}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Verdict chip
// -----------------------------------------------------------------------------

export interface VerdictChipHandle {
  show: (kind: 'scout' | 'slip' | 'taken' | 'strike') => void;
}

export const VerdictChip = forwardRef<VerdictChipHandle, { reducedMotion: boolean }>(function VerdictChip({ reducedMotion }, ref) {
  const [kind, setKind] = useState<'scout' | 'slip' | 'taken' | 'strike'>('scout');
  const v = useSharedValue(0);
  useImperativeHandle(ref, () => ({
    show(k) {
      setKind(k);
      cancelAnimation(v);
      v.value = 0;
      v.value = withSequence(
        withTiming(1, { duration: reducedMotion ? 60 : 140, easing: Easing.out(Easing.back(2)) }),
        withDelay(400, withTiming(0, { duration: 160 })),
      );
    },
  }), [v, reducedMotion]);
  const st = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 1.4), transform: [{ scale: 0.6 + v.value * 0.4 }] }));
  const slip = kind === 'slip' || kind === 'strike';
  return (
    <Animated.View pointerEvents="none" style={[styles.chip, slip ? styles.chipSlip : styles.chipScout, st]}>
      {slip ? <CrackGlyph /> : <MagnifierGlyph />}
      <Text style={styles.chipText}>{kind === 'slip' ? 'SLIP' : kind === 'strike' ? 'STRIKE' : kind === 'taken' ? 'TAKEN' : 'SCOUT'}</Text>
    </Animated.View>
  );
});

function MagnifierGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx={10} cy={10} r={6.5} stroke="#fff" strokeWidth={3} fill="none" />
      <Line x1={15} y1={15} x2={21} y2={21} stroke="#fff" strokeWidth={3.5} strokeLinecap="round" />
    </Svg>
  );
}
function CrackGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 1 L9 9 L14 12 L8 18 L11 20 L9 23" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// -----------------------------------------------------------------------------
// Callouts
// -----------------------------------------------------------------------------

export interface CalloutHandle {
  say: (text: string, color?: string) => void;
}

export const Callout = forwardRef<CalloutHandle, { reducedMotion: boolean; align: 'left' | 'right' }>(function Callout({ reducedMotion, align }, ref) {
  const [text, setText] = useState('');
  const [color, setColor] = useState<string>(MM.gold);
  const v = useSharedValue(0);
  useImperativeHandle(ref, () => ({
    say(t, c = MM.gold) {
      setText(t);
      setColor(c);
      cancelAnimation(v);
      v.value = 0;
      v.value = withSequence(
        withTiming(1, { duration: reducedMotion ? 60 : 160, easing: Easing.out(Easing.back(2)) }),
        withDelay(520, withTiming(0, { duration: 180 })),
      );
    },
  }), [v, reducedMotion]);
  const st = useAnimatedStyle(() => ({
    opacity: Math.min(1, v.value * 1.5),
    transform: [{ scale: 1.6 - 0.6 * Math.min(1, v.value) }, { rotateZ: align === 'left' ? '-6deg' : '6deg' }],
  }));
  return (
    <Animated.Text style={[styles.callout, { color, textAlign: align }, st]}>{text}</Animated.Text>
  );
});

const styles = StyleSheet.create({
  plateSlot: { width: 78 },
  plate: {
    width: 78, height: 44, borderRadius: 14, backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, borderWidth: 3, borderColor: MM.ink,
  },
  plateUrgent: { borderColor: MM.urgent },
  plateFrozen: { opacity: 0.6 },
  plateIcon: { width: 28, height: 32 },
  plateText: { fontFamily: 'Shark', fontSize: 24, color: MM.navyText, marginLeft: 2, minWidth: 30, textAlign: 'center' },
  deltaChip: { position: 'absolute', right: -10, top: -12, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
  deltaText: { fontFamily: 'Shark', fontSize: 14, color: '#fff' },
  chainPlate: {
    width: 92, height: 44, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 3, borderColor: MM.ink,
    paddingHorizontal: 6, justifyContent: 'center',
  },
  chainShow: { backgroundColor: '#fff4c2', borderColor: MM.goldDeep },
  ringWrap: { position: 'absolute', left: 4, top: -20 },
  chainRow: { flexDirection: 'row', alignItems: 'center' },
  streakIcon: { width: 20, height: 22 },
  chainText: { fontFamily: 'Shark', fontSize: 20, color: MM.navyText, marginLeft: 3 },
  strikes: { flexDirection: 'row', marginLeft: 'auto' },
  strike: { width: 10, height: 10, borderRadius: 5, marginLeft: 3, borderWidth: 2, borderColor: MM.ink, backgroundColor: '#fff' },
  strikeOn: { backgroundColor: MM.coral, borderColor: '#fff' },
  pips: { flexDirection: 'row', marginTop: 2 },
  pip: { flex: 1, height: 6, marginHorizontal: 1, borderRadius: 3, backgroundColor: '#dcecf8', borderWidth: 1, borderColor: '#b7d3ea' },
  pipOn: { backgroundColor: MM.gold, borderColor: MM.goldDeep },
  pipShow: { backgroundColor: '#ffb21f' },
  ghostWrap: { flex: 1, marginHorizontal: 8, justifyContent: 'center' },
  ghostTrack: { height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 2, borderColor: '#fff', overflow: 'visible', justifyContent: 'center' },
  ghostFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 9, backgroundColor: MM.gold },
  ghostToken: { position: 'absolute', left: 0, top: -6, width: 22, height: 28, opacity: 0.6 },
  ghostImg: { width: 22, height: 28 },
  ghostMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  ghostLabel: { flex: 1, fontFamily: 'Knockout', fontSize: 12, color: '#ffffff' },
  deltaPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, borderWidth: 1.5 },
  deltaAhead: { backgroundColor: MM.gold, borderColor: '#fff' },
  deltaBehind: { backgroundColor: 'rgba(255,255,255,0.25)', borderColor: '#fff' },
  deltaPillText: { fontFamily: 'Shark', fontSize: 12, color: '#fff' },
  chip: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 14, borderWidth: 2.5, borderColor: '#fff',
  },
  chipScout: { backgroundColor: MM.scout },
  chipSlip: { backgroundColor: MM.coral },
  chipText: { fontFamily: 'Shark', fontSize: 18, color: '#fff', marginLeft: 4 },
  callout: {
    fontFamily: 'Shark', fontSize: 30, textShadowColor: MM.ink, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1,
  },
});
