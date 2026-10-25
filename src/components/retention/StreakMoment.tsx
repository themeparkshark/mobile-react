import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { isDimFlashingLightsEnabled } from '../../../modules/flash-safety';
import { playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { usePowerBudget } from '../../power';
import {
  LOOP_CUES, PRESS, STAGGER, milestoneBadge, milestoneFlames, milestoneHaptic, type FlameMoment,
} from '../../services/retention/loopMotion';
import { BRAND, GameIcon } from '../../ui';
import { GoldBurst, RadialFlash, SparkleBurst } from '../../ui/GoldBurst';
import { DURATION, PARTICLES, SLAM_SQUASH, SPRING, flashPeak, momentBeats, momentParticles } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import RewardBurst from '../RewardBurst';
import CardSurface from './CardSurface';
import FlameArt, { TomorrowGoal } from './FlameArt';
import { useMarkTimers, withDelayAfter, withDelayUntil } from './delayUntil';

const FINN_WAVE = require('../../assets/games/banana-basket/v2/shark_cheer.png');

/**
 * The flame grows. Two sizes of the same moment:
 * - +1 (any day): the ember glows, the flame whooshes up past full size and
 *   settles, the number rolls N-1 to N, three sparks fly.
 * - Milestones (3, 7, 30, 100): the levelUp beats. The flame charges in the
 *   middle for a second, a held frame, then gold rays, a capped flash, sparkles
 *   and confetti, the number slams down from oversize with a squash, a badge
 *   stamps in with that many flames (zero reading), and Finn waves.
 * Reduce Motion: the end state with a short fade; the haptic and sound stay.
 */
export default function StreakMoment({ moment, reducedMotion, onDone, prize = 'chest', startAt, entered }: {
  /** The card enters at this time (epoch ms): every beat waits for it on the UI thread (mounted while prizes fly). */
  readonly startAt?: number;
  /**
   * The card was mounted early and hidden (behind the chest card): every beat waits for this UI-thread mark (set the
   * frame the card starts to enter), sounds and haptics too.
   */
  readonly entered?: SharedValue<number>;
  readonly moment: Exclude<FlameMoment, { kind: 'none' }>;
  /** Tomorrow's prize (the close goal under the flame). */
  readonly prize?: 'chest' | 'gear' | 'flame';
  readonly reducedMotion: boolean;
  readonly onDone: () => void;
}) {
  const big = moment.kind === 'milestone';
  const to = moment.kind === 'milestone' ? moment.day : moment.to;
  const from = moment.kind === 'milestone' ? Math.max(0, moment.day - 1) : moment.from;
  const beats = momentBeats(big ? 'levelUp' : 'coinRepeat', { reduced: reducedMotion });
  const budget = usePowerBudget();
  const boost = useSharedValue(reducedMotion ? 0 : big ? 0 : -0.35);
  const whoosh = useSharedValue(reducedMotion ? 1 : big ? 0.7 : 0.6);
  // Frame 1 is never empty: a milestone opens on a charged flame (0.7) with its gold already glowing.
  const gold = useSharedValue(big && !reducedMotion ? 0.45 : 0);
  // The charge: sparks pull in toward the flame and a ring tightens around it (never a still, empty card).
  const gatherP = useSharedValue(big && !reducedMotion ? 0.98 : 0);
  const ring = useSharedValue(0);
  const plusText = useSharedValue(reducedMotion || big ? 1 : 0);
  const bloom = useSharedValue(0);
  const flash = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const confetti = useSharedValue(0);
  const roll = useSharedValue(reducedMotion ? 1 : 0);
  const slam = useSharedValue(reducedMotion ? 1 : 0);
  const squash = useSharedValue(1);
  const numPop = useSharedValue(1);
  const badge = useSharedValue(reducedMotion ? 1 : 0);
  const finn = useSharedValue(reducedMotion ? 1 : 0);
  const wave = useSharedValue(0);
  const [ready, setReady] = useState(reducedMotion);
  const [sparks, setSparks] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const afterMark = useMarkTimers(entered);
  const later = (fn: () => void, ms: number) => {
    if (entered) { afterMark(ms, fn); return; }
    timers.current.push(setTimeout(fn, ms + Math.max(0, (startAt ?? 0) - Date.now())));
  };
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  /** Starts a beat on the card's entrance mark (UI thread), never while the card is still hidden. */
  const W = <T,>(a: T): T => (entered ? (withDelayAfter(entered, 0, a as never) as T) : startAt ? (withDelayUntil(startAt, a as never) as T) : a);

  useEffect(() => {
    const cue = big ? LOOP_CUES.milestone : LOOP_CUES.flameUp;
    if (reducedMotion) {
      if (big) playHaptic(milestoneHaptic(to)); else playHaptic('tierUp');
      playSfx(cue.fallback);
      gold.value = withTiming(big ? 0.5 : 0, { duration: DURATION.quick });
      return;
    }
    // Every visual beat is scheduled on the UI thread from the first frame (withDelay), so a busy JS thread
    // never stretches the moment; JS timers only fire the haptics and sounds on the same marks.
    setSparks(momentParticles(big ? PARTICLES.sparkles : 3, budget, false));
    if (!big) {
      // +1: the ember glows (300 ms), then the flame whooshes up on the pop spring and the number rolls.
      const at = 300;
      boost.value = W(withSequence(withTiming(0.25, { duration: at, easing: EASE.charge }), withSpring(0, SPRING.pop)));
      whoosh.value = W(withDelay(at, withSequence(withTiming(1.2, { duration: 140, easing: EASE.out }), withSpring(1, SPRING.pop))));
      roll.value = W(withDelay(at, withTiming(1, { duration: DURATION.base, easing: EASE.out })));
      // "N days in a row!" waits for the roll to land (it never says 12 while the number still reads 11).
      plusText.value = W(withDelay(at + DURATION.base, withSpring(1, SPRING.stamp)));
      // The new number lands with a squash (wide and short) and stamps back to round.
      numPop.value = W(withDelay(at + DURATION.base - 40, withSequence(withTiming(1.28, { duration: 70, easing: EASE.out }), withSpring(1, SPRING.stamp))));
      sparkle.value = W(withDelay(at, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out })));
      gold.value = W(withDelay(at, withSequence(withTiming(0.55, { duration: 160 }), withTiming(0.3, { duration: 600 }))));
      later(() => { playHaptic('tierUp'); playSfx(cue.fallback); }, at);
      later(() => setReady(true), at + 420);
      return;
    }
    // Milestone: charge (the flame grows in the centre), hit-stop, burst, slam, badge, Finn.
    const burst = beats.burstAt;
    whoosh.value = W(withTiming(1, { duration: beats.anticipation, easing: EASE.charge }));
    gatherP.value = W(withSequence(withTiming(0.04, { duration: beats.anticipation, easing: EASE.charge }), withTiming(0, { duration: 0 })));
    ring.value = W(withTiming(1, { duration: beats.anticipation, easing: EASE.charge }));
    boost.value = W(withSequence(withTiming(0.55, { duration: beats.anticipation, easing: EASE.charge }),
      withDelay(DURATION.hitStop, withSequence(withTiming(0.8, { duration: 90 }), withSpring(0, SPRING.pop)))));
    gold.value = W(withSequence(withTiming(0.62, { duration: beats.anticipation, easing: EASE.charge }),
      withDelay(DURATION.hitStop, withTiming(1, { duration: 160, easing: EASE.out }))));
    flash.value = W(withDelay(burst, withSequence(withTiming(flashPeak(isDimFlashingLightsEnabled(), false), { duration: 40 }),
      withTiming(0, { duration: DURATION.flash - 40 }))));
    bloom.value = W(withDelay(burst, withSequence(withTiming(1, { duration: DURATION.bloom * 0.35 }), withTiming(0, { duration: DURATION.bloom * 0.65 }))));
    sparkle.value = W(withDelay(burst, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out })));
    confetti.value = W(withDelay(burst, withTiming(1, { duration: 1100, easing: EASE.out })));
    slam.value = W(withDelay(burst, withTiming(1, { duration: DURATION.slam, easing: EASE.in })));
    squash.value = W(withDelay(burst + DURATION.slam, withSequence(withTiming(1 - SLAM_SQUASH, { duration: 50, easing: EASE.out }),
      withSpring(1, SPRING.stamp))));
    badge.value = W(withDelay(beats.labelAt, withSpring(1, SPRING.stamp)));
    finn.value = W(withDelay(beats.labelAt + 260, withSpring(1, SPRING.land)));
    wave.value = W(withDelay(beats.labelAt + 460, withRepeat(withSequence(withTiming(1, { duration: 220 }), withTiming(-1, { duration: 220 })), 3, true)));
    [0, 400, 800].forEach(ms => later(() => queueHaptic('tickSelection'), ms));
    later(() => { playHaptic(milestoneHaptic(to)); playSfx(cue.fallback); }, burst);
    later(() => playSfx('ui.confirm', 0.6), beats.labelAt);
    later(() => setReady(true), beats.settledAt);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: whoosh.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value <= 0 || ring.value >= 1 ? 0 : 0.7 * ring.value,
    transform: [{ scale: 1.7 - 0.8 * ring.value }] }));
  const gatherCount = big && !reducedMotion ? sparks : 0;
  // The slam: from 1.8 down to 1 (accelerating), a squash on impact, then the stamp spring to rest.
  const numberStyle = useAnimatedStyle(() => {
    const s = slam.value;
    return { opacity: Math.min(1, s * 3), transform: [{ scale: 1.8 - 0.8 * s }, { scaleY: squash.value }, { scaleX: 2 - squash.value }] };
  });
  const rollOld = useAnimatedStyle(() => ({ opacity: 1 - roll.value, transform: [{ translateY: -28 * roll.value }] }));
  const rollNew = useAnimatedStyle(() => ({ opacity: roll.value, transform: [{ translateY: 28 * (1 - roll.value) }, { scaleX: numPop.value }, { scaleY: 2 - numPop.value }] }));
  const plusTextStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, plusText.value * 1.5), transform: [{ scale: 1.3 - 0.3 * plusText.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, badge.value * 2), transform: [{ scale: 1.7 - 0.7 * badge.value }] }));
  const finnStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, finn.value * 2),
    transform: [{ translateX: -60 * (1 - finn.value) }, { rotate: `${wave.value * 8}deg` }],
  }));
  const rows = milestoneFlames(to);

  return (
    <Pressable onPress={ready ? onDone : undefined} style={styles.card} accessibilityLabel={`${to} day flame`}>
      <CardSurface />
      <View style={[styles.stage, big && styles.stageBig]}>
        <GoldBurst size={big ? 330 : 220} amount={gold} bloom={bloom} reduced={reducedMotion} spin={budget.level === 'full'} style={styles.abs} />
        <RadialFlash flash={flash} size={260} />
        <Animated.View style={flameStyle}>
          <FlameArt days={to} size={big ? 168 : 156} reducedMotion={reducedMotion} boost={boost} />
        </Animated.View>
        <View style={styles.center}><SparkleBurst progress={sparkle} count={sparks} radius={big ? 140 : 90} /></View>
        {gatherCount > 0 && <View style={styles.center} pointerEvents="none"><SparkleBurst progress={gatherP} count={Math.min(8, gatherCount)} radius={150} /></View>}
        {big && !reducedMotion && <Animated.View pointerEvents="none" style={[styles.chargeRing, ringStyle]} />}
        {big && !reducedMotion && budget.animate && budget.particleScale >= 1 && (
          <View style={styles.center} pointerEvents="none"><RewardBurst progress={confetti} x={0} y={-20} /></View>
        )}
        {big ? (
          <Animated.View style={[styles.bigNumWrap, numberStyle]}>
            {/* The face is a plain View inside the scaled one (iOS smears a scaled bordered background). */}
            <View style={styles.bigNum}><Text style={styles.bigNumText} allowFontScaling={false}>{to}</Text></View>
          </Animated.View>
        ) : (
          <View style={styles.rollBox}>
            <Animated.Text style={[styles.rollText, rollOld]} allowFontScaling={false}>{from}</Animated.Text>
            <Animated.Text style={[styles.rollText, styles.rollAbs, rollNew]} allowFontScaling={false}>{to}</Animated.Text>
          </View>
        )}
      </View>
      {big ? (
        <Animated.View style={badgeStyle}>
          <View style={styles.badge}>
          <Text style={styles.badgeText}>{milestoneBadge(to)}</Text>
          <View style={styles.flames}>
            {rows.crown && <GameIcon name="crown" size={26} />}
            {Array.from({ length: rows.rows }, (_, r) => (
              <View key={r} style={styles.flameRow}>
                {Array.from({ length: rows.perRow }, (_, k) => (
                  <FlameDot key={k} index={r * rows.perRow + k} show={badge} small={rows.rows > 1 || rows.perRow > 7} />
                ))}
              </View>
            ))}
          </View>
          </View>
        </Animated.View>
      ) : (
        <Animated.Text style={[styles.plusText, plusTextStyle]}>{to === 1 ? 'Your flame is lit!' : `${to} days in a row!`}</Animated.Text>
      )}
      {/* Tomorrow as one big picture: the next day's flame and the prize waiting. */}
      <View style={styles.next}><TomorrowGoal days={to} prize={prize} size={44} reducedMotion={reducedMotion} /></View>
      {/* Finn stands beside the button, never over the words. */}
      <View style={styles.bottom}>
        {big && (
          <Animated.View style={[styles.finn, finnStyle]} pointerEvents="none">
            <Image cachePolicy="memory-disk" source={FINN_WAVE} style={{ width: 72, height: 72 }} contentFit="contain" />
          </Animated.View>
        )}
        <View style={{ flex: 1 }}>
          <DoneButton label={big ? 'YAY!' : 'NICE!'} onPress={ready ? onDone : undefined} reducedMotion={reducedMotion}
            delay={big ? beats.settledAt : 300 + 420} startAt={startAt} entered={entered} />
        </View>
      </View>
    </Pressable>
  );
}

/** One flame in the badge row: pops in on the stagger once the badge stamps (35 ms apart, 400 ms cap). */
function FlameDot({ index, show, small }: { readonly index: number; readonly show: { value: number }; readonly small: boolean }) {
  const delay = Math.min(STAGGER.capMs, index * STAGGER.stepMs) / 1000;
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (show.value - delay) / 0.5));
    return { opacity: t, transform: [{ scale: 0.4 + 0.6 * t }] };
  });
  const s = small ? 15 : 22;
  return <Animated.View style={style}><GameIcon name="streak" size={s} /></Animated.View>;
}

/**
 * The button fades and rises in when the moment settles (never a dead hold). The fade is scheduled on the
 * UI thread from the first frame, so a busy JS thread never makes it late; taps count once it is in.
 */
function DoneButton({ label, onPress, reducedMotion, delay, startAt, entered }: {
  readonly label: string; readonly onPress?: () => void; readonly reducedMotion: boolean; readonly delay: number; readonly startAt?: number;
  readonly entered?: SharedValue<number>;
}) {
  const a = useSharedValue(reducedMotion ? 1 : 0);
  const press = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) return;
    const anim = withDelay(delay, withTiming(1, { duration: DURATION.base, easing: EASE.out }));
    a.value = entered ? withDelayAfter(entered, 0, anim) : startAt ? withDelayUntil(startAt, anim) : anim;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: a.value, transform: [{ translateY: (1 - a.value) * 10 }, { scale: press.value }] }));
  return (
    <Animated.View style={[styles.buttonWrap, style]}>
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" style={styles.button}
        onPressIn={() => { press.value = withTiming(PRESS.scale, { duration: PRESS.inMs }); }}
        onPressOut={() => { press.value = withSpring(1, PRESS.spring); }}>
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 16, paddingBottom: 14, paddingHorizontal: 14, alignItems: 'center', overflow: 'hidden' },
  stage: { width: '100%', height: 230, alignItems: 'center', justifyContent: 'center' },
  stageBig: { height: 270 },
  chargeRing: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 5, borderColor: '#FFE07A' },
  abs: { position: 'absolute' },
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  bigNumWrap: { position: 'absolute', bottom: 2 },
  bigNum: { minWidth: 92, height: 72, borderRadius: 36, paddingHorizontal: 16, backgroundColor: BRAND.white,
    borderWidth: 4, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  bigNumText: { fontFamily: 'Shark', fontSize: 50, color: BRAND.navy, marginTop: 4 },
  rollBox: { position: 'absolute', bottom: 8, minWidth: 64, height: 54, borderRadius: 27, backgroundColor: BRAND.white, borderWidth: 3.5,
    borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 12 },
  rollText: { fontFamily: 'Shark', fontSize: 36, color: BRAND.navy, marginTop: 3 },
  rollAbs: { position: 'absolute' },
  badge: { alignItems: 'center', gap: 6, backgroundColor: BRAND.white, borderRadius: 18, borderWidth: 3, borderColor: BRAND.gold,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 },
  badgeText: { fontFamily: 'Shark', fontSize: 26, color: BRAND.navy, textAlign: 'center' },
  flames: { alignItems: 'center', gap: 2 },
  flameRow: { flexDirection: 'row', gap: 2 },
  plusText: { fontFamily: 'Shark', fontSize: 26, color: BRAND.gold, textAlign: 'center', marginTop: 2 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: BRAND.navy, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 6 },
  nextText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.gold, marginTop: 1 },
  bottom: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 60, marginTop: 10 },
  finn: { width: 72, height: 72 },
  buttonWrap: { alignSelf: 'stretch' },
  button: { alignSelf: 'stretch', backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  buttonText: { fontFamily: 'Shark', fontSize: 22, color: '#075083' },
});
