/**
 * BonusPartFlight: the queue bonus claim moment (queue-bonus.md 7.2).
 *
 *   Hit     0 ms     local gold flash (18%)
 *   Pop     60-320   Ride Part pops 0 -> 1.25 -> 1, "+1 BONUS PART" rises
 *   Flight  320-840  edge-routed curve into the ring coin (or the mini ring
 *                    while a game is up), 1.25 turns, scale 1 -> 0.6
 *   Absorb  840-960  ring flash at the coin
 *   Settle  960-1400 fade out
 *
 * Encore plays the same grammar at 70% with the XP star and Energy bolt
 * flying to the level badge. Compact mode (walking or a game is up) skips the
 * flash and pop slam. Reduced motion is a 200 ms crossfade onto the target.
 * The layer never takes a touch (pointerEvents none), and it only ever plays
 * server-confirmed claims, each once.
 */

import { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { GameIcon } from '../../../ui';
import type { BonusFxEvent } from '../../../services/lineplay/LinePlaySession';
import type { BonusCue } from '../../../services/lineplay/bonusCues';

export interface FlightPoint {
  readonly x: number;
  readonly y: number;
}

interface Props {
  readonly event: BonusFxEvent | null;
  /** The ring coin center (Parts) or the mini ring while a game is mounted. */
  readonly partTarget: FlightPoint;
  /** The player level badge (Encore XP and Energy). */
  readonly badgeTarget: FlightPoint;
  /** Walking or a game is up: no slams, compact flight only. */
  readonly compact: boolean;
  readonly reducedMotion: boolean;
  readonly onCue: (cue: BonusCue, slot?: number) => void;
  readonly onDone: (id: number) => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const ICON = 48;

/** Start above the bottom-60% input band, and route along the nearest screen edge. */
export function flightPath(start: FlightPoint, end: FlightPoint, width = SCREEN_W): { control: FlightPoint } {
  const edgeX = start.x < width / 2 ? 18 : width - 18;
  return { control: { x: edgeX, y: Math.min(start.y, end.y) + Math.abs(start.y - end.y) * 0.35 } };
}

export default function BonusPartFlight({ event, partTarget, badgeTarget, compact, reducedMotion, onCue, onDone }: Props) {
  const progress = useSharedValue(0);
  const pop = useSharedValue(0);
  const flash = useSharedValue(0);
  const absorb = useSharedValue(0);
  const opacity = useSharedValue(0);

  const isEncore = event?.kind === 'encore';
  const scaleBase = isEncore || compact ? 0.7 : 1;
  const target = isEncore ? badgeTarget : partTarget;
  const start = useMemo<FlightPoint>(() => ({ x: SCREEN_W / 2, y: SCREEN_H * 0.32 }), []);
  const { control } = flightPath(start, target);

  useEffect(() => {
    if (!event) return;
    const id = event.id;
    const slot = event.kind === 'claim' ? event.claim.index : undefined;
    const finish = () => onDone(id);
    progress.value = 0; pop.value = 0; flash.value = 0; absorb.value = 0;
    if (reducedMotion) {
      opacity.value = withSequence(withTiming(1, { duration: 100 }), withTiming(0, { duration: 100 },
        done => { 'worklet'; if (done) runOnJS(finish)(); }));
      progress.value = 1;
      if (event.kind !== 'perk') onCue(isEncore ? 'part_pop' : 'coin_absorb', slot);
      return;
    }
    opacity.value = 1;
    if (!compact) flash.value = withSequence(withTiming(0.18, { duration: 30 }), withTiming(0, { duration: 200 }));
    onCue('part_pop', slot);
    pop.value = withDelay(60, withSequence(
      withTiming(1.25, { duration: 160, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 100 }),
    ));
    const whoosh = setTimeout(() => onCue('part_whoosh', slot), 320);
    // Encore keeps the C/D/E absorb ladder for Parts only.
    const land = setTimeout(() => { if (!isEncore) onCue('coin_absorb', slot); }, 840);
    progress.value = withDelay(320, withTiming(1, { duration: 520, easing: Easing.in(Easing.quad) }));
    absorb.value = withDelay(840, withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 200 })));
    opacity.value = withDelay(960, withTiming(0, { duration: 440 }, done => {
      'worklet';
      if (done) runOnJS(finish)();
    }));
    return () => { clearTimeout(whoosh); clearTimeout(land); };
  }, [event?.id]);

  const iconStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const u = 1 - t;
    // Quadratic bezier start -> control (screen edge) -> target.
    const x = u * u * start.x + 2 * u * t * control.x + t * t * target.x;
    const y = u * u * start.y + 2 * u * t * control.y + t * t * target.y;
    const scale = scaleBase * (t > 0 ? 1 - 0.4 * t : pop.value);
    return {
      opacity: opacity.value,
      transform: [
        { translateX: x - ICON / 2 }, { translateY: y - ICON / 2 },
        { rotate: `${t * 450}deg` }, { scale },
      ],
    };
  });
  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0 ? Math.max(0, 1 - progress.value * 2) : pop.value > 0 ? 1 : 0,
    transform: [{ translateX: start.x - 90 }, { translateY: start.y - ICON - 24 * Math.min(1, pop.value) }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const absorbStyle = useAnimatedStyle(() => ({
    opacity: absorb.value,
    transform: [{ translateX: target.x - 30 }, { translateY: target.y - 30 }, { scale: 0.8 + absorb.value * 0.5 }],
  }));

  if (!event || event.kind === 'perk') return null;
  const label = event.kind === 'encore'
    ? [event.encore.xp > 0 ? `+${event.encore.xp} XP` : '', event.encore.energy > 0 ? `+${event.encore.energy} ENERGY` : '']
      .filter(Boolean).join('  ')
    : `+${event.claim.parts} BONUS PART`;

  return <View pointerEvents="none" style={StyleSheet.absoluteFill}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Animated.View style={[styles.flash, flashStyle]} />
    <Animated.View style={[styles.icon, iconStyle]}>
      {event.kind === 'encore'
        ? <View style={styles.encorePair}><GameIcon name="xp" size={30} />{event.encore.energy > 0 && <GameIcon name="energy" size={30} />}</View>
        : <GameIcon name="parts" size={ICON} />}
    </Animated.View>
    <Animated.View style={[styles.labelWrap, labelStyle]}>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
    <Animated.View style={[styles.absorbRing, absorbStyle]} />
  </View>;
}

const styles = StyleSheet.create({
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fec90e' },
  icon: { position: 'absolute', left: 0, top: 0, width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  encorePair: { flexDirection: 'row', gap: 2 },
  labelWrap: { position: 'absolute', left: 0, top: 0, width: 180, alignItems: 'center' },
  label: { fontFamily: 'Shark', fontSize: 20, color: '#fec90e', textShadowColor: '#08305f',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  absorbRing: { position: 'absolute', left: 0, top: 0, width: 60, height: 60, borderRadius: 30,
    borderWidth: 3, borderColor: '#fff' },
});
