/**
 * ResultsCard: the end-of-run card, built for drama and "one more run".
 *
 *   - Alex's ribbon title slams in (INCREDIBLE! / GREAT! / NICE! / SO CLOSE!)
 *   - Stars stamp one by one (2.2 -> 1.0, 220 ms apart), each with a haptic
 *     and a sound; the 3rd star lands harder. A missed star that was close
 *     wobbles ("so close") instead of sitting there dead.
 *   - Score counts up in the Shark font with coin ticks.
 *   - NEW BEST slams in after the count, or the best is shown quietly.
 *   - Next-star bar: a fill bar ending in a star, with one short word
 *     (KEEP GOING, HALFWAY THERE, ALMOST!), so even a 0-star run has a target
 *     a non-reader can see. The big numbers live in the accessibility label.
 *   - A run a queue event saved before its first star gets a RUN SAVED stamp
 *     in place of the stars (never a fake lit star) and no next-star bar.
 *   - Feelings, not data (feelings.ts): one gold or light line under the
 *     score (beat a ghost, N wins in a row, so close to a star) and at most
 *     two brag chips. Percentages, milliseconds and zero counts never show.
 *   - A Wrap-up note when the ride came up mid-run.
 *
 * Bright world: blue card, white outline, gold accents, navy ink. No emoji,
 * no glyph icons (GameIcon art only). Reduced motion: everything appears in
 * place, no slams or wobbles.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import GameIcon from '../../ui/GameIcon';
import { compareBest, formatScore, nextStarGoal, tallySchedule, tallyTickCount, type StarThresholds } from '../core/scoring';
import { nearMissLine } from '../core/nearMiss';
import { CountUpText } from '../fx/CountUpText';
import { feelingChips, feelingLine, feelingTitle, nearBest, noteRun } from './feelings';
import { NextStarBar } from './NextStarBar';
import { SavedStamp } from './SavedStamp';
import { playHaptic } from '../Haptics';
import { GameAudio } from '../audio/GameAudio';

const RIBBON = require('../../../assets/images/ribbon.png');

export interface ResultStat {
  label: string;
  value: string;
  /** Draw filled dots instead of the value (BURSTS 3 of 4). */
  pips?: readonly [number, number];
}

export interface ResultsCardProps {
  score: number;
  stars: number;
  message?: string;
  thresholds?: StarThresholds;
  personalBest?: number;
  maxCombo?: number;
  stats?: ResultStat[];
  /** Shown when a queue event wrapped the run ("Your ride's up!"). */
  note?: string;
  reducedMotion?: boolean;
  /** Called when the reveal (stars + count-up) has finished. */
  onRevealed?: () => void;
  /** Ghost / rival to compare against: drives the near-miss line. */
  rival?: { name: string; score: number } | null;
  /**
   * Bucket tallies that fill before the score (Whack: HITS, COMBO, BONUS),
   * each with accelerating ticks climbing 0 -> +12 semitones.
   */
  buckets?: ResultStat[];
  /** Numeric bucket values (same order as buckets) for the tally count-up. */
  bucketValues?: number[];
  /**
   * Gap between star slams (ms). Pass the stinger's beat or half-beat
   * (Whack: stars on stinger beats; Rhythm: one per half beat).
   */
  starStepMs?: number;
  /** Game id for the win streak ("3 wins in a row!"). No key, no streak line. */
  streakKey?: string;
  /** One token per finished run, so a re-render never counts a run twice. */
  runToken?: string | number;
  /** A queue event saved this run before its first star: RUN SAVED stamp, no bar. */
  saved?: boolean;
  /** A small chip inside the card under the brags (Whack's SHARE). */
  footer?: React.ReactNode;
}

const STAR_BASE_DELAY = 260;
const STAR_STEP = 220;
const BUCKET_MS = 520;
const BUCKET_GAP = 140;

export function defaultMessage(stars: number, near: boolean): string {
  return feelingTitle(stars, near);
}

export function ResultsCard({
  score, stars, message, thresholds, personalBest, maxCombo, stats, note, reducedMotion = false, onRevealed, rival,
  buckets, bucketValues, starStepMs = STAR_STEP, streakKey, runToken, saved = false, footer,
}: ResultsCardProps) {
  const goal = useMemo(() => (thresholds && !saved ? nextStarGoal(score, thresholds) : null), [score, thresholds, saved]);
  const best = useMemo(() => compareBest(score, personalBest), [score, personalBest]);
  const title = message ?? defaultMessage(stars, !!goal?.near);
  // The one line that sells "one more run" (beat a ghost, so close to a star).
  const near = useMemo(() => nearMissLine({ score, thresholds, best: personalBest, rival }), [score, thresholds, personalBest, rival]);
  // Wins in a row for this game (counted once per run, at mount).
  const [streak] = useState(() => (streakKey ? noteRun(streakKey, runToken ?? `${score}:${stars}`, stars > 0) : 0));
  const feeling = useMemo(() => feelingLine({ streak, near: best.isNewBest ? null : near }), [streak, near, best.isNewBest]);
  const showNear = !!feeling.text;
  // A 0-star run reads in one glance: stars, score, the bar and PLAY AGAIN.
  // The quiet BEST shows only when the run came near it, one brag chip at
  // most, and no share chip (a NEW BEST still gets the full card).
  const plain = stars === 0 && !saved && !best.isNewBest;
  const showBest = !!personalBest && (!plain || nearBest(score, personalBest));
  const chips = useMemo(() => feelingChips(stats, maxCombo, plain ? 1 : undefined), [stats, maxCombo, plain]);
  const nBuckets = buckets?.length ?? 0;
  const bucketStart = STAR_BASE_DELAY + starStepMs * 3;
  const countDelay = reducedMotion ? 0 : bucketStart + nBuckets * (BUCKET_MS + BUCKET_GAP);

  const ribbon = useSharedValue(reducedMotion ? 1 : 0);
  const bestScale = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      ribbon.value = 1;
      bestScale.value = 1;
      return;
    }
    ribbon.value = withSequence(
      withTiming(1.25, { duration: 160, easing: Easing.out(Easing.back(2)) }),
      withSpring(1, { damping: 10, stiffness: 260 }),
    );
    if (best.isNewBest) {
      bestScale.value = withDelay(countDelay + 900, withSequence(
        withTiming(1.4, { duration: 0 }),
        withTiming(0.92, { duration: 130, easing: Easing.in(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 320 }),
      ));
      const t = setTimeout(() => {
        GameAudio.play('fx.purchase');
        playHaptic('winRoll');
      }, countDelay + 900);
      return () => { clearTimeout(t); cancelAnimation(bestScale); };
    }
    bestScale.value = withDelay(countDelay + 900, withTiming(1, { duration: 200 }));
    return () => cancelAnimation(bestScale);
  }, [reducedMotion, best.isNewBest, countDelay, ribbon, bestScale]);

  const ribbonStyle = useAnimatedStyle(() => ({ transform: [{ scale: ribbon.value }], opacity: ribbon.value > 0 ? 1 : 0 }));
  const bestStyle = useAnimatedStyle(() => ({ transform: [{ scale: bestScale.value }], opacity: bestScale.value > 0.05 ? 1 : 0 }));

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.ribbonWrap, ribbonStyle]}>
        <Image source={RIBBON} style={styles.ribbon} contentFit="contain" />
        <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
      </Animated.View>

      {saved ? (
        <SavedStamp reducedMotion={reducedMotion} delayMs={STAR_BASE_DELAY} />
      ) : (
        <View style={styles.starRow}>
          {[1, 2, 3].map((n) => (
            <StarSlot
              key={n}
              index={n}
              earned={n <= stars}
              close={!!goal && goal.near && n === stars + 1}
              reducedMotion={reducedMotion}
              stepMs={starStepMs}
              onLanded={n === Math.max(1, stars) ? onRevealed : undefined}
            />
          ))}
        </View>
      )}

      {nBuckets ? (
        <View style={styles.buckets}>
          {buckets!.map((b, i) => (
            <BucketTally key={b.label} label={b.label} text={b.value} value={bucketValues?.[i]}
              delayMs={reducedMotion ? 0 : bucketStart + i * (BUCKET_MS + BUCKET_GAP)} reducedMotion={reducedMotion} />
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>SCORE</Text>
      <CountUpText value={score} delayMs={countDelay} reducedMotion={reducedMotion} tickEvery={Math.max(1, Math.round(score / 14))}
        onTick={() => GameAudio.play('fx.coin', { volume: 0.35 })} style={styles.score} />

      <Animated.View style={[styles.bestRow, bestStyle]}>
        {best.isNewBest ? (
          <View style={styles.newBest}>
            <GameIcon name="crown" size={22} />
            <Text style={styles.newBestText}>NEW BEST!</Text>
          </View>
        ) : showBest ? (
          <Text style={styles.bestQuiet}>{`BEST ${formatScore(personalBest!)}`}</Text>
        ) : null}
      </Animated.View>

      {showNear ? (
        <Animated.View style={[styles.nearLine, feeling.tone === 'gold' && styles.nearWin, bestStyle]}>
          <Text style={[styles.nearText, feeling.tone === 'gold' && styles.nearWinText]} numberOfLines={1} adjustsFontSizeToFit>
            {feeling.text.toUpperCase()}
          </Text>
        </Animated.View>
      ) : null}

      {goal ? <NextStarBar goal={goal} delayMs={countDelay + 300} reducedMotion={reducedMotion} /> : null}

      {chips.length ? (
        <View style={styles.stats}>
          {chips.map((s) => <Chip key={s.label} label={s.label} value={s.value} pips={s.pips} />)}
        </View>
      ) : null}

      {footer && !plain ? <View style={styles.footer}>{footer}</View> : null}

      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

function Chip({ label, value, pips }: ResultStat) {
  return (
    <View style={styles.chip} accessible accessibilityLabel={pips ? `${pips[0]} of ${pips[1]} ${label}` : `${value} ${label}`}>
      {pips ? (
        <View style={styles.pips}>
          {Array.from({ length: pips[1] }, (_, i) => <View key={i} style={[styles.pip, i < pips[0] && styles.pipOn]} />)}
        </View>
      ) : <Text style={styles.chipValue}>{value}</Text>}
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

/** One bucket: counts up from 0 with accelerating, rising coin ticks, then pops. */
function BucketTally({ label, text, value, delayMs, reducedMotion }: {
  label: string;
  text: string;
  value?: number;
  delayMs: number;
  reducedMotion: boolean;
}) {
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  const [shown, setShown] = useState(reducedMotion || value === undefined ? value ?? 0 : 0);
  useEffect(() => {
    if (reducedMotion) {
      setShown(value ?? 0);
      return undefined;
    }
    pop.value = withDelay(delayMs, withSequence(
      withTiming(1.15, { duration: 90, easing: Easing.out(Easing.back(1.6)) }),
      withSpring(1, { damping: 10, stiffness: 300 }),
    ));
    const n = value !== undefined ? tallyTickCount(value) : 0;
    const plan = tallySchedule(n, BUCKET_MS);
    const timers = plan.at.map((t, k) => setTimeout(() => {
      GameAudio.play('fx.coin', { volume: 0.3, pitch: plan.pitch[k] * 0.5 });
      if (k === n - 1) playHaptic('tick');
    }, delayMs + t));
    timers.push(setTimeout(() => setShown(value ?? 0), delayMs));
    return () => { timers.forEach(clearTimeout); cancelAnimation(pop); };
  }, [delayMs, value, reducedMotion, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: pop.value > 0.02 ? 1 : 0 }));
  return (
    <Animated.View style={style}>
      <View style={styles.bucket}>
        {value !== undefined ? (
          <CountUpText value={shown} durationMs={BUCKET_MS} reducedMotion={reducedMotion} punch={1.05} style={styles.bucketValue} />
        ) : <Text style={styles.bucketValue}>{text}</Text>}
        <Text style={styles.bucketLabel}>{label}</Text>
      </View>
    </Animated.View>
  );
}

function StarSlot({ index, earned, close, reducedMotion, stepMs, onLanded }: {
  index: number;
  earned: boolean;
  close: boolean;
  reducedMotion: boolean;
  stepMs: number;
  onLanded?: () => void;
}) {
  const scale = useSharedValue(reducedMotion ? 1 : earned ? 0 : 1);
  const tilt = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(tilt);
    if (reducedMotion) {
      scale.value = 1;
      return undefined;
    }
    const delay = STAR_BASE_DELAY + (index - 1) * stepMs;
    if (earned) {
      scale.value = withDelay(delay, withSequence(
        withTiming(2.2, { duration: 0 }),
        withTiming(0.9, { duration: 120, easing: Easing.in(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 320 }, (finished) => {
          'worklet';
          if (finished && onLanded) runOnJS(onLanded)();
        }),
      ));
      const t = setTimeout(() => {
        playHaptic(index === 3 ? 'bigStarSlam' : 'starSlam');
        GameAudio.play(GameAudio.hasCue('sh_star_slam') ? 'sh_star_slam' : 'fx.reveal', { pitch: (index - 1) * 2 });
      }, delay + 110);
      return () => clearTimeout(t);
    }
    if (close) {
      tilt.value = withDelay(delay + 200, withRepeat(withSequence(
        withTiming(8, { duration: 90 }),
        withTiming(-8, { duration: 90 }),
        withTiming(0, { duration: 90 }),
        withTiming(0, { duration: 900 }),
      ), 3, false));
    }
    return undefined;
  }, [earned, close, index, reducedMotion, stepMs, onLanded, scale, tilt]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }] }));
  return (
    <Animated.View style={[styles.star, index === 2 && styles.starMiddle, style]}>
      <GameIcon name="star" size={index === 2 ? 64 : 52} mono={earned ? undefined : '#9cc9ec'} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#0768b9',
    borderRadius: 24,
    borderWidth: 4,
    borderColor: '#ffffff',
    paddingTop: 44,
    paddingBottom: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    shadowColor: '#05346e',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  ribbonWrap: { position: 'absolute', top: -34, left: -14, right: -14, height: 74, alignItems: 'center', justifyContent: 'center' },
  ribbon: { position: 'absolute', width: '100%', height: '100%' },
  ribbonText: { fontFamily: 'Shark', fontSize: 28, color: '#ffffff', marginTop: -8, paddingHorizontal: 60,
    textShadowColor: '#7a2a12', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  starRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4, marginBottom: 6 },
  star: { marginHorizontal: 6 },
  starMiddle: { marginBottom: 10 },
  label: { fontFamily: 'Knockout', fontSize: 15, color: '#cdeaff', letterSpacing: 2, marginTop: 4 },
  score: { fontSize: 46, lineHeight: 54, minWidth: 180 },
  bestRow: { height: 34, justifyContent: 'center', alignItems: 'center' },
  newBest: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffcf3b', borderRadius: 999, borderWidth: 3,
    borderColor: '#05346e', paddingHorizontal: 12, paddingVertical: 2 },
  newBestText: { fontFamily: 'Shark', fontSize: 18, color: '#05346e', marginLeft: 6 },
  bestQuiet: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff', letterSpacing: 1 },
  footer: { marginTop: 10, alignItems: 'center' },
  pips: { flexDirection: 'row', height: 24, alignItems: 'center' },
  pip: { width: 14, height: 14, borderRadius: 7, marginHorizontal: 2, borderWidth: 2, borderColor: '#05346e', backgroundColor: '#ffffff' },
  pipOn: { backgroundColor: '#ffcf3b' },
  buckets: { flexDirection: 'row', justifyContent: 'center', marginBottom: 4 },
  bucket: { backgroundColor: '#3d9be6', borderRadius: 14, borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 10,
    paddingVertical: 3, marginHorizontal: 4, alignItems: 'center', minWidth: 78 },
  bucketValue: { fontFamily: 'Shark', fontSize: 22, height: 30, color: '#ffffff', minWidth: 60, textAlign: 'center',
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  bucketLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#ffe07a', letterSpacing: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 },
  chip: { backgroundColor: '#fff8e4', borderRadius: 14, borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 12,
    paddingVertical: 4, margin: 4, alignItems: 'center', minWidth: 86 },
  chipValue: { fontFamily: 'Shark', fontSize: 20, color: '#05346e' },
  chipLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#3d5f8c', letterSpacing: 1 },
  nearLine: { borderRadius: 999, borderWidth: 3, borderColor: '#05346e', backgroundColor: '#e4f7ff', paddingHorizontal: 14,
    paddingVertical: 3, marginBottom: 4, maxWidth: '100%' },
  nearWin: { backgroundColor: '#ffcf3b' },
  nearText: { fontFamily: 'Knockout', fontSize: 16, color: '#05346e', letterSpacing: 1 },
  nearWinText: { color: '#05346e' },
  note: { fontFamily: 'Knockout', fontSize: 15, color: '#ffffff', marginTop: 10, textAlign: 'center' },
});
