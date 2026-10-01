/**
 * Hud.tsx: the glanceable readouts (design v8 4.0, 5.2, 6.6).
 *
 *   ChainPlate      streak icon, chain count, 6 Showtime gauge pips (Time Attack,
 *                   Race), 5 Showtime turn bulbs during a burst, the QUICK ring,
 *                   Daily strike pips
 *   VerdictChip     SCOUT (blue, magnifier) or SLIP (coral, crack) for 400ms
 *   RopeNumeral     seconds (or Signal Mode turns) at the rim rope's top centre
 *   ScorePlate      Time Attack score with the Balatro tally and the PB ink flame
 *
 * Ride Sprint shows exactly two readouts: the rim timer and the chain plate.
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

const STREAK = require('../../assets/games/memory/studio/streak.png');

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
  /** Showtime turns left (5 bulbs that go out one per turn). */
  showLeft?: number;
  /** Hide the gauge pips (modes without Showtime). */
  gaugeOn?: boolean;
  strikes: number | null;
  strikesMax: number;
  reducedMotion: boolean;
}>(function ChainPlate({ chain, gauge, showtime, showWarn, showLeft = 0, gaugeOn = true, strikes, strikesMax, reducedMotion }, ref) {
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
  if (showtime) {
    for (let i = 0; i < 5; i++) pips.push(<View key={i} style={[styles.bulbPip, i < showLeft && styles.bulbPipOn]} />);
  } else if (gaugeOn) {
    for (let i = 0; i < 6; i++) pips.push(<View key={i} style={[styles.pip, i < gauge && styles.pipOn]} />);
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
      {pips.length ? <View style={styles.pips}>{pips}</View> : null}
    </Animated.View>
  );
});

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
// Rope numeral (seconds at the rim rope's top centre) and the score plate
// -----------------------------------------------------------------------------

/** Seconds numeral on the rope's top centre; pulses 1 -> 1.08 at 2Hz in the last 5s. Signal Mode shows turns. */
export function RopeNumeral({ x, y, seconds, turnsLeft, urgent, reducedMotion }: {
  x: number; y: number; seconds: number | null; turnsLeft: number | null; urgent: boolean; reducedMotion: boolean;
}) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(pulse);
    if (urgent && seconds != null && seconds <= 5 && seconds > 0 && !reducedMotion) {
      pulse.value = withSequence(withTiming(1.08, { duration: 120 }), withTiming(1, { duration: 130 }), withTiming(1.08, { duration: 120 }), withTiming(1, { duration: 130 }));
    } else pulse.value = 1;
  }, [seconds, urgent, reducedMotion, pulse]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  if (seconds == null && turnsLeft == null) return null;
  const label = turnsLeft != null ? `${turnsLeft}` : `${seconds}`;
  return (
    <Animated.View pointerEvents="none" style={[styles.numeral, urgent && styles.numeralUrgent, { left: x - 23, top: y - 15 }, st]}
      accessible accessibilityLabel={turnsLeft != null ? `${turnsLeft} turns left` : `${seconds} seconds left`}>
      <Text style={[styles.numeralText, urgent && { color: MM.urgent }]}>{label}</Text>
    </Animated.View>
  );
}

const FLAME = [
  require('../../assets/games/memory/v8/fx/flame_1.png'),
  require('../../assets/games/memory/v8/fx/flame_2.png'),
  require('../../assets/games/memory/v8/fx/flame_3.png'),
];

export interface ScorePlateHandle {
  /** Balatro tally: `160 x2 x1.5` for 200ms, operands jiggling on 16ths, then the slam. */
  tally: (parts: string) => void;
}

/** Time Attack score plate: digit squash on change, the ink flame once you pass your PB. */
export const ScorePlate = forwardRef<ScorePlateHandle, { score: number; pb: number; reducedMotion: boolean }>(function ScorePlate({ score, pb, reducedMotion }, ref) {
  const [tallyText, setTallyText] = useState('');
  const [flame, setFlame] = useState(0);
  const sq = useSharedValue(1);
  const jig = useSharedValue(0);
  const tallyV = useSharedValue(0);
  const onFire = pb > 0 && score > pb;
  useEffect(() => {
    if (reducedMotion) return;
    sq.value = withSequence(withTiming(1.15, { duration: 60 }), withTiming(0.97, { duration: 60 }), withTiming(1, { duration: 60 }));
  }, [score, reducedMotion, sq]);
  useEffect(() => {
    if (!onFire || reducedMotion) return undefined;
    const iv = setInterval(() => setFlame((f) => (f + 1) % 3), 83);
    return () => clearInterval(iv);
  }, [onFire, reducedMotion]);
  useImperativeHandle(ref, () => ({
    tally(parts) {
      setTallyText(parts);
      tallyV.value = withSequence(withTiming(1, { duration: 40 }), withDelay(200, withTiming(0, { duration: 80 })));
      if (!reducedMotion) jig.value = withSequence(...Array.from({ length: 3 }, (_, i) => withTiming(i % 2 ? -1 : 1, { duration: 58 })), withTiming(0, { duration: 40 }));
    },
  }), [tallyV, jig, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleY: sq.value }, { scaleX: 2 - sq.value }] }));
  const tallySt = useAnimatedStyle(() => ({ opacity: tallyV.value, transform: [{ translateX: jig.value * 1.5 }, { rotateZ: `${jig.value * 3}deg` }] }));
  return (
    <View style={styles.scorePlate}>
      {onFire ? <Image source={FLAME[flame]} style={styles.flame} resizeMode="contain" /> : null}
      <Animated.Text style={[styles.scoreText, st]}>{score.toLocaleString('en-US')}</Animated.Text>
      <Animated.Text style={[styles.tallyText, tallySt]} numberOfLines={1}>{tallyText}</Animated.Text>
    </View>
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
  bulbPip: { flex: 1, height: 7, marginHorizontal: 1.5, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderColor: MM.goldDeep },
  bulbPipOn: { backgroundColor: '#fff3b0', borderColor: MM.goldDeep },
  numeral: { position: 'absolute', minWidth: 46, height: 30, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: MM.ink, alignItems: 'center', justifyContent: 'center' },
  numeralUrgent: { borderColor: MM.urgent },
  numeralText: { fontFamily: 'Shark', fontSize: 20, color: MM.navyText },
  scorePlate: { height: 44, minWidth: 96, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 3, borderColor: MM.ink, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  scoreText: { fontFamily: 'Shark', fontSize: 22, color: MM.navyText },
  tallyText: { position: 'absolute', top: -18, fontFamily: 'Shark', fontSize: 15, color: MM.goldDeep, textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  flame: { position: 'absolute', top: -26, width: 30, height: 34 },
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
