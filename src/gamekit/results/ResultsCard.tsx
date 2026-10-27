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
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { SPRING } from '../../ui/motion';
import GameIcon, { type GameIconName } from '../../ui/GameIcon';
import { compareBest, countUpMs, formatScore, nextStarGoal, type StarThresholds } from '../core/scoring';
import { nearMissLine } from '../core/nearMiss';
import { CountUpText } from '../fx/CountUpText';
import { bestAwareTitle, feelingChips, feelingLine, feelingTitle, nearBest, noteRun } from './feelings';
import { NextStarBar } from './NextStarBar';
import { SavedStamp } from './SavedStamp';
import { ResultsRibbon } from './ResultsRibbon';
import { playHaptic } from '../Haptics';
import { GameAudio } from '../audio/GameAudio';


export interface ResultStat {
  label: string;
  value: string;
  /** Draw filled dots instead of the value (BURSTS 3 of 4). */
  pips?: readonly [number, number];
  /** A picture under the value in place of the label word (the label is still read aloud). */
  icon?: GameIconName;
  /**
   * The picture is the headline: `on` lit icons out of `of` (1 to 3 bolts for
   * NICE, GREAT, LIGHTNING), with the value word small under it. A kid who
   * cannot read still sees "three bolts beats one".
   */
  iconRow?: { name: GameIconName; on: number; of: number };
}

/** A next-star bar a game works out itself (stars that are not points). */
export interface ResultStarGoal {
  /** 0..1 toward the next star. */
  progress: number;
  /** The star the bar points at (1-3), or 0 when all three are lit. */
  nextStar: number;
  near: boolean;
  /** Spoken label with the exact goal ("12 more PERFECTS for a star"). */
  a11y?: string;
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
  /** The game's own next-star bar (Rhythm); wins over thresholds. */
  starGoal?: ResultStarGoal;
  /** The line ended the run (ride's up, left the line): no more play, so no next-star bar. */
  wrapUp?: boolean;
  /** Why the line ended the run: a 0-point ending gets a happy send-off stamp instead of an empty scoreboard. */
  wrapReason?: 'boarding' | 'left-queue' | 'session-ended' | null;
  /** Fired once when the NEW BEST badge slams in (the shell bursts confetti). */
  onNewBestLanded?: () => void;
  /**
   * A game's own extra row (Rhythm's TRY TWO THUMBS? offer, Banana Basket's
   * ribbons), drawn inside the card on a cream panel just above the buttons,
   * so the decision buttons are always the card's bottom row.
   */
  extras?: React.ReactNode;
  /**
   * The extras get their own beat: the cream panel stays hidden (never an
   * empty box) and pops in once the stars, the tally and the total have all
   * landed, so a reward inside it (Whack's new Finn) never lands on top of
   * the score. Children read the moment from ResultsSettleContext.
   */
  extrasBeat?: boolean;
  /**
   * The cheering shark peeks up from behind the ribbon's right end at this
   * scale (0 = no peek): the shell passes it when a tall card leaves no room
   * for the podium scene above, so a big win never loses its moment.
   */
  peek?: number;
  /**
   * The decision buttons (PLAY AGAIN, DONE), drawn inside the card at the
   * bottom like Sharky, the Duel and the Boss, so every game's card is one
   * piece. Passed as children.
   */
  children?: React.ReactNode;
}

/** Below this window height (points) the card goes compact (iPhone SE is 667). */
export const SHORT_PHONE_PT = 740;
/** A score is points, not coins: its count-up ticks with a soft tap. The coin sound stays for real coin rewards. */
export const SCORE_TICK_CUE = 'ui.tap';
const STAR_BASE_DELAY = 260;
const STAR_STEP = 220;
const BUCKET_MS = 520;
const BUCKET_GAP = 140;

export function defaultMessage(stars: number, near: boolean, newBest = false): string {
  return feelingTitle(stars, near, newBest);
}

/**
 * When the title slams in: just after the last earned star stamps, so a star
 * word (GREAT!) never gives the stars away before they land (the same rule as
 * Sharky, Boss, the Duel and Memory). No stars, no wait.
 */
/**
 * When everything on the card has landed (ms after it mounts): the last star,
 * the tally buckets, the total's count-up and the NEW BEST slam. A reward
 * that waits for this gets its own beat instead of landing on the tally.
 */
export function settleMs(args: { stars: number; stepMs: number; nBuckets: number; score: number; newBest: boolean; reducedMotion: boolean }): number {
  if (args.reducedMotion) return 0;
  const countDelay = STAR_BASE_DELAY + args.stepMs * 3 + args.nBuckets * (BUCKET_MS + BUCKET_GAP);
  return countDelay + Math.max(900, countUpMs(0, Math.max(0, args.score))) + (args.newBest ? 520 : 160);
}

/** The settle moment for children of a card's extras panel (0 = no wait). */
export const ResultsSettleContext = React.createContext<number>(0);

export function titleDelayMs(stars: number, stepMs: number, reducedMotion: boolean): number {
  if (reducedMotion || stars <= 0) return 0;
  return STAR_BASE_DELAY + (Math.min(3, stars) - 1) * stepMs + 140;
}

export function ResultsCard({
  score, stars, message, thresholds, personalBest, maxCombo, stats, note, reducedMotion = false, onRevealed, rival,
  buckets, bucketValues, starStepMs = STAR_STEP, streakKey, runToken, saved = false, footer, onNewBestLanded, wrapUp = false, starGoal, wrapReason = null, extras, extrasBeat = false, peek = 0, children: actions,
}: ResultsCardProps) {
  // The ride came up (or the kid left the line) before any points: a happy
  // send-off (HAVE FUN! stamp), never three empty stars and a big 0.
  const sendOff = wrapUp && stars === 0 && !saved && !(score > 0);
  // A finished wait has nothing left to keep going on: no bar after the line ends the run.
  const goal = useMemo(() => {
    if (saved || wrapUp) return null;
    if (starGoal) {
      const progress = Math.max(0, Math.min(1, Number.isFinite(starGoal.progress) ? starGoal.progress : 0));
      return { nextStar: starGoal.nextStar, progress: starGoal.nextStar ? progress : 1, near: starGoal.near, remaining: 0 };
    }
    return thresholds ? nextStarGoal(score, thresholds) : null;
  }, [score, thresholds, saved, wrapUp, starGoal]);
  // A saved run is never written down as a best, so it never shows NEW BEST.
  const best = useMemo(() => (saved ? compareBest(0, personalBest) : compareBest(score, personalBest)), [score, personalBest, saved]);
  // A personal best is a win, even with 0 stars: never GOOD TRY! next to NEW BEST!.
  const title = bestAwareTitle(message, stars, best.isNewBest) ?? defaultMessage(stars, !!goal?.near, best.isNewBest);
  // The one line that sells "one more run" (beat a ghost, so close to a star).
  const near = useMemo(() => nearMissLine({ score, thresholds, best: personalBest, rival }), [score, thresholds, personalBest, rival]);
  // Wins in a row for this game (counted once per run, at mount).
  const [streak] = useState(() => (streakKey ? noteRun(streakKey, runToken ?? `${score}:${stars}`, stars > 0) : 0));
  // Say each idea once: when the next-star bar shows, the bar (its word and
  // its star) already says "close to the next star", so the pill never
  // repeats it with a number to read ("JUST 2,105 FROM STAR 3").
  const nearForPill = best.isNewBest || (goal && near.kind === 'nearStar') ? null : near;
  const feeling = useMemo(() => feelingLine({ streak, near: nearForPill }), [streak, nearForPill]);
  const showNear = !!feeling.text;
  // A 0-star run (or a saved one) reads in one glance: stars or the stamp,
  // the score, the bar and the big button. The quiet BEST shows only when the
  // run came near it, one brag chip at most, and no share chip (a NEW BEST
  // still gets the full card).
  const plain = stars === 0 && !best.isNewBest;
  // The quiet BEST shows only when no feeling pill does (one line under the score, never two).
  const showBest = !!personalBest && !showNear && (!plain || nearBest(score, personalBest));
  const chips = useMemo(() => feelingChips(stats, maxCombo, plain ? 1 : undefined), [stats, maxCombo, plain]);
  // Short phones (iPhone SE) get a tighter card so the ribbon and the buttons
  // both stay on screen: no tally buckets (the score already says it all) and
  // slightly smaller stars.
  const short = useWindowDimensions().height < SHORT_PHONE_PT;
  // The score tally buckets are for runs worth replaying in detail (a star or a new best).
  const nBuckets = plain || short ? 0 : buckets?.length ?? 0;
  const bucketStart = STAR_BASE_DELAY + starStepMs * 3;
  const countDelay = reducedMotion ? 0 : bucketStart + nBuckets * (BUCKET_MS + BUCKET_GAP);

  const onBestRef = React.useRef(onNewBestLanded);
  onBestRef.current = onNewBestLanded;

  const bestScale = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      bestScale.value = 1;
      return;
    }
    if (best.isNewBest) {
      bestScale.value = withDelay(countDelay + 900, withSequence(
        withTiming(1.4, { duration: 0 }),
        withTiming(0.92, { duration: 130, easing: Easing.in(Easing.quad) }),
        withSpring(1, SPRING.stamp),
      ));
      const t = setTimeout(() => {
        GameAudio.play('fx.purchase');
        playHaptic('winRoll');
        onBestRef.current?.();
      }, countDelay + 900);
      return () => { clearTimeout(t); cancelAnimation(bestScale); };
    }
    bestScale.value = withDelay(countDelay + 900, withTiming(1, { duration: 200 }));
    return () => cancelAnimation(bestScale);
  }, [reducedMotion, best.isNewBest, countDelay, bestScale]);

  const bestStyle = useAnimatedStyle(() => ({ transform: [{ scale: bestScale.value }], opacity: bestScale.value > 0.05 ? 1 : 0 }));

  // The extras beat: one UI-thread pop after everything else landed.
  const settle = extrasBeat ? settleMs({ stars, stepMs: starStepMs, nBuckets, score, newBest: best.isNewBest, reducedMotion }) : 0;
  const extrasIn = useSharedValue(extrasBeat && !reducedMotion ? 0 : 1);
  useEffect(() => {
    if (!extrasBeat || reducedMotion) {
      extrasIn.value = 1;
      return undefined;
    }
    extrasIn.value = withDelay(settle, withSequence(
      withTiming(1.06, { duration: 150, easing: Easing.out(Easing.back(2)) }),
      withSpring(1, { damping: 11, stiffness: 300 }),
    ));
    return () => cancelAnimation(extrasIn);
  }, [extrasBeat, reducedMotion, settle, extrasIn]);
  // The panel never sits at scale 0: on iOS a view held at scale 0 came back with its
  // cream fill missing (only the border drew) for seconds after it popped in. It grows
  // from 0.6 while hidden, so the pop still reads, and its fill is drawn from the first frame.
  const extrasStyle = useAnimatedStyle(() => ({ opacity: extrasIn.value > 0.02 ? 1 : 0, transform: [{ scale: 0.6 + 0.4 * extrasIn.value }] }));

  return (
    <View style={[styles.card, short && styles.cardShort]}>
      {/* Drawn before the ribbon, so the ribbon covers the shark's feet. */}
      {peek > 0 && !sendOff ? <PodiumPeek scale={peek} reducedMotion={reducedMotion} /> : null}
      <ResultsRibbon title={title} reducedMotion={reducedMotion} style={styles.ribbonWrap}
        delayMs={saved || sendOff ? 0 : titleDelayMs(stars, starStepMs, reducedMotion)} />

      {saved || sendOff ? (
        <SavedStamp reducedMotion={reducedMotion} delayMs={STAR_BASE_DELAY}
          label={sendOff ? (wrapReason === 'boarding' ? 'HAVE FUN!' : 'SEE YOU SOON!') : undefined} />
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
              small={short}
              onLanded={n === Math.max(1, stars) ? onRevealed : undefined}
            />
          ))}
        </View>
      )}

      {/* The score is the gold hero number every card uses (Sharky, Boss): no SCORE word over it.
          A star run's tally (POINTS, COMBO, BONUS) pops in on the score's own
          spot, then folds into it as the total counts up: the drama of the
          add-up, and a settled card that shows one number, not four. */}
      {sendOff ? null : <View accessible accessibilityLabel={nBuckets
        ? `Score ${formatScore(score)}. ${buckets!.map((b) => `${b.label} ${b.value}`).join(', ')}` : `Score ${formatScore(score)}`} style={styles.scoreWrap}>
        {nBuckets ? (
          <TallyFold foldAt={countDelay} reducedMotion={reducedMotion}>
            <CountUpText value={score} from={0} delayMs={countDelay} reducedMotion={reducedMotion} tickEvery={Math.max(1, Math.round(score / 14))}
              onTick={() => GameAudio.play(SCORE_TICK_CUE, { volume: 0.3 })} style={[styles.score, short && styles.scoreShort]} />
          </TallyFold>
        ) : (
          <CountUpText value={score} from={0} delayMs={countDelay} reducedMotion={reducedMotion} tickEvery={Math.max(1, Math.round(score / 14))}
            onTick={() => GameAudio.play(SCORE_TICK_CUE, { volume: 0.3 })} style={[styles.score, short && styles.scoreShort]} />
        )}
        {nBuckets && !reducedMotion ? (
          <View style={styles.buckets} pointerEvents="none" importantForAccessibility="no-hide-descendants">
            {buckets!.map((b, i) => (
              <BucketTally key={b.label} index={i} label={b.label} text={b.value} value={bucketValues?.[i]}
                delayMs={bucketStart + i * (BUCKET_MS + BUCKET_GAP)} foldAt={countDelay} reducedMotion={reducedMotion} />
            ))}
          </View>
        ) : null}
      </View>}

      {/* The row keeps its height only when something will land in it (no empty gap on a plain card). */}
      {sendOff ? null : best.isNewBest || showBest ? <Animated.View style={[styles.bestRow, bestStyle]}>
        {best.isNewBest ? (
          <View style={styles.newBest}>
            <GameIcon name="crown" size={22} />
            <Text style={styles.newBestText}>NEW BEST!</Text>
          </View>
        ) : (
          <Text style={styles.bestQuiet}>{`BEST ${formatScore(personalBest!)}`}</Text>
        )}
      </Animated.View> : <View style={styles.bestGap} />}

      {showNear ? (
        // The pop rides a wrapper and the fill sits on a plain view inside it:
        // scaled with its own background, the pill drew hollow (navy outline,
        // no fill) on the current bundle, like the Duel banners did.
        <Animated.View style={[styles.nearPop, bestStyle]}>
          <View style={[styles.nearLine, feeling.tone === 'gold' && styles.nearWin]}>
            <Text style={[styles.nearText, feeling.tone === 'gold' && styles.nearWinText]} numberOfLines={1} adjustsFontSizeToFit>
              {feeling.text.toUpperCase()}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {goal ? <NextStarBar goal={goal} delayMs={countDelay + 300} reducedMotion={reducedMotion}
        a11yLabel={starGoal ? starGoal.a11y ?? (goal.nextStar ? `Star ${goal.nextStar} is next` : 'All three stars') : undefined} /> : null}

      {chips.length && !sendOff ? (
        <View style={styles.stats}>
          {chips.map((s) => <ResultChip key={s.label} label={s.label} value={s.value} pips={s.pips} />)}
        </View>
      ) : null}

      {footer && !plain ? <View style={styles.footer}>{footer}</View> : null}

      {note && !sendOff ? <Text style={styles.note}>{note}</Text> : null}

      {extras ? (
        extrasBeat ? (
          // The pop rides a wrapper; the cream fill lives on a plain view inside it, so
          // iOS always draws the fill (on the animated view itself it came back
          // missing, only the border, while the Finn inside it was still springing).
          <Animated.View style={[styles.extrasPop, extrasStyle]}>
            <View style={[styles.extras, styles.extrasInPop]}>
              <ResultsSettleContext.Provider value={settle}>{extras}</ResultsSettleContext.Provider>
            </View>
          </Animated.View>
        ) : <View style={styles.extras}>{extras}</View>
      ) : null}

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

/** One brag chip (cream, navy ink), shared by every results card. */
/** What a chip reads aloud: one of a thing is never plural ("1 RIGHT ANSWER", not "1 RIGHT ANSWERS"). */
export function chipA11y(count: string | number, label: string): string {
  const one = String(count).trim() === '1';
  const word = one && /[^S]S$/.test(label) ? label.slice(0, -1) : label;
  return `${count} ${word}`;
}

export function ResultChip({ label, value, pips, icon, iconRow }: ResultStat) {
  if (iconRow) {
    return (
      <View style={styles.chip} accessible accessibilityLabel={chipA11y(value, label)}>
        <View style={styles.iconRow}>
          {Array.from({ length: Math.max(1, iconRow.of) }, (_, i) => (
            <GameIcon key={i} name={iconRow.name} size={i < iconRow.on ? 26 : 20} mono={i < iconRow.on ? undefined : '#9cc9ec'} />
          ))}
        </View>
        <Text style={styles.chipLabel} numberOfLines={1}>{value}</Text>
      </View>
    );
  }
  return (
    <View style={styles.chip} accessible accessibilityLabel={chipA11y(pips ? pips[0] : value, label)}>
      {pips ? (
        <View style={styles.pips}>
          {Array.from({ length: pips[1] }, (_, i) => <View key={i} style={[styles.pip, i < pips[0] && styles.pipOn]} />)}
        </View>
      ) : <Text style={styles.chipValue}>{value}</Text>}
      {icon ? <GameIcon name={icon} size={20} style={styles.chipIcon} /> : <Text style={styles.chipLabel}>{label}</Text>}
    </View>
  );
}

/** One bucket: counts up from 0 with accelerating, rising coin ticks, then pops. */
/** How long the tally takes to fold into the score (ms). */
export const TALLY_FOLD_MS = 220;

/** The score waits, hidden, while the tally sits on its spot, then grows in as the tally folds into it. */
function TallyFold({ foldAt, reducedMotion, children }: { foldAt: number; reducedMotion: boolean; children: React.ReactNode }) {
  const t = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) { t.value = 1; return undefined; }
    t.value = withDelay(Math.max(0, foldAt - 40), withSequence(
      withTiming(1.12, { duration: TALLY_FOLD_MS, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 10, stiffness: 300 }),
    ));
    return () => cancelAnimation(t);
  }, [foldAt, reducedMotion, t]);
  const st = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value * 1.5), transform: [{ scale: 0.6 + Math.min(1.12, t.value) * 0.4 }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

/** Pitch step between bucket ticks: POINTS, COMBO, BONUS climb one soft tick each. */
export const BUCKET_TICK_STEP = 3;

function BucketTally({ index, label, text, value, delayMs, foldAt, reducedMotion }: {
  index: number;
  label: string;
  text: string;
  value?: number;
  delayMs: number;
  /** When the bucket folds into the total (shrinks to the score's middle and fades). */
  foldAt: number;
  reducedMotion: boolean;
}) {
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  const fold = useSharedValue(0);
  const [shown, setShown] = useState(reducedMotion || value === undefined ? value ?? 0 : 0);
  useEffect(() => {
    if (reducedMotion) {
      setShown(value ?? 0);
      return undefined;
    }
    pop.value = withDelay(delayMs, withSequence(
      withTiming(1.15, { duration: 90, easing: Easing.out(Easing.back(1.6)) }),
      withSpring(1, SPRING.stamp),
    ));
    fold.value = withDelay(foldAt, withTiming(1, { duration: TALLY_FOLD_MS, easing: Easing.in(Easing.quad) }));
    // One soft tick per bucket as it pops, each a step higher (never a full
    // ramp per bucket: the one rising ramp belongs to the total's count-up).
    const timers = [setTimeout(() => {
      setShown(value ?? 0);
      GameAudio.play(SCORE_TICK_CUE, { volume: 0.32, pitch: index * BUCKET_TICK_STEP });
      playHaptic('tick');
    }, delayMs)];
    return () => { timers.forEach(clearTimeout); cancelAnimation(pop); cancelAnimation(fold); };
  }, [delayMs, foldAt, value, reducedMotion, pop, fold, index]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value * (1 - fold.value * 0.7) }],
    opacity: pop.value > 0.02 ? 1 - fold.value : 0,
  }));
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

function StarSlot({ index, earned, close, reducedMotion, stepMs, small = false, onLanded }: {
  index: number;
  small?: boolean;
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
        withSpring(1, SPRING.stamp, (finished) => {
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
      <GameIcon name="star" size={small ? (index === 2 ? 54 : 44) : index === 2 ? 64 : 52} mono={earned ? undefined : '#9cc9ec'} />
    </Animated.View>
  );
}

const PEEK_ART = require('../../assets/games/sharky/tide/shark_cheer.png');

/**
 * The cheering shark peeking from behind the ribbon's right end. It lives in
 * the card, so it is always anchored to the card's real top edge (never
 * floating over the dimmed HUD), and a clip just under the ribbon's middle
 * hides its feet, so it truly rises from behind the ribbon. It hops a few
 * times, then rests. UI thread only; Reduce Motion shows it still.
 */
function PodiumPeek({ scale, reducedMotion }: { scale: number; reducedMotion: boolean }) {
  const w = 130 * scale;
  const h = 160 * scale;
  const rise = useSharedValue(reducedMotion ? 0 : h);
  const hop = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return undefined;
    rise.value = withDelay(PEEK_DELAY_MS, withSpring(0, { damping: 12, stiffness: 190 }));
    hop.value = withDelay(PEEK_DELAY_MS + 420, withRepeat(withSequence(
      withTiming(-12, { duration: 220, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }),
    ), PEEK_HOPS));
    return () => { cancelAnimation(rise); cancelAnimation(hop); };
  }, [reducedMotion, rise, hop]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: rise.value + hop.value }] }));
  return (
    <View style={styles.peekClip} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Animated.Image source={PEEK_ART} style={[{ width: w, height: h }, st]} resizeMode="contain" />
    </View>
  );
}

/**
 * Where the peeking shark's feet stand, in points below the card's top edge.
 * The ribbon band runs from about 22 pt above the card's top to about 28 pt
 * below it, so feet at +5 hide the shark's lower third behind the band.
 */
export const PEEK_FOOT_PT = 5;
/** The peek rises once the ribbon has slammed. */
const PEEK_DELAY_MS = 360;
/** It hops this many times, then rests. */
const PEEK_HOPS = 3;

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
  cardShort: { paddingTop: 38, paddingBottom: 12 },
  scoreShort: { fontSize: 42, lineHeight: 48 },
  actions: { width: '100%', marginTop: 4 },
  ribbonWrap: { position: 'absolute', top: -34, left: -14, right: -14 },
  starRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4, marginBottom: 6 },
  star: { marginHorizontal: 6 },
  starMiddle: { marginBottom: 10 },
  scoreWrap: { marginTop: 2, alignItems: 'center', justifyContent: 'center', minHeight: 58 },
  score: { fontFamily: 'Shark', fontSize: 50, lineHeight: 58, minWidth: 180, color: '#ffcf3b',
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  bestRow: { height: 34, justifyContent: 'center', alignItems: 'center' },
  bestGap: { height: 6 },
  newBest: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffcf3b', borderRadius: 999, borderWidth: 3,
    borderColor: '#05346e', paddingHorizontal: 12, paddingVertical: 2 },
  newBestText: { fontFamily: 'Shark', fontSize: 18, color: '#05346e', marginLeft: 6 },
  bestQuiet: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff', letterSpacing: 1 },
  footer: { marginTop: 10, alignItems: 'center' },
  pips: { flexDirection: 'row', height: 24, alignItems: 'center' },
  pip: { width: 14, height: 14, borderRadius: 7, marginHorizontal: 2, borderWidth: 2, borderColor: '#05346e', backgroundColor: '#ffffff' },
  pipOn: { backgroundColor: '#ffcf3b' },
  // The tally sits on the score's spot (no row of its own), then folds into it.
  buckets: { position: 'absolute', left: -60, right: -60, top: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  extrasPop: { width: '100%', marginTop: 10 },
  extrasInPop: { marginTop: 0 },
  extras: { width: '100%', marginTop: 10, backgroundColor: '#fff8e4', borderRadius: 16, borderWidth: 3, borderColor: '#05346e',
    paddingVertical: 6, paddingHorizontal: 8, alignItems: 'center' },
  // The clip's bottom edge sits a few points under the card's top edge, about a
  // third of the way down the ribbon band: the shark stands behind the band's
  // right end with its lower third hidden, and rises from there.
  peekClip: { position: 'absolute', top: -220, right: 20, width: 140, height: 220 + PEEK_FOOT_PT, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' },
  bucket: { backgroundColor: '#3d9be6', borderRadius: 14, borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 10,
    paddingVertical: 3, marginHorizontal: 4, alignItems: 'center', minWidth: 78 },
  bucketValue: { fontFamily: 'Shark', fontSize: 22, height: 30, color: '#ffffff', minWidth: 60, textAlign: 'center',
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  bucketLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#ffe07a', letterSpacing: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 },
  chip: { backgroundColor: '#fff8e4', borderRadius: 14, borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 12,
    paddingVertical: 4, margin: 4, alignItems: 'center', minWidth: 86 },
  chipValue: { fontFamily: 'Shark', fontSize: 20, color: '#05346e' },
  chipIcon: { marginTop: 1 },
  iconRow: { flexDirection: 'row', alignItems: 'center', height: 28, gap: 1 },
  chipLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#3d5f8c', letterSpacing: 1 },
  nearPop: { maxWidth: '100%', marginBottom: 4 },
  nearLine: { borderRadius: 999, borderWidth: 3, borderColor: '#05346e', backgroundColor: '#e4f7ff', paddingHorizontal: 14,
    paddingVertical: 3 },
  nearWin: { backgroundColor: '#ffcf3b' },
  nearText: { fontFamily: 'Knockout', fontSize: 16, color: '#05346e', letterSpacing: 1 },
  nearWinText: { color: '#05346e' },
  note: { fontFamily: 'Knockout', fontSize: 15, color: '#ffffff', marginTop: 10, textAlign: 'center' },
});
