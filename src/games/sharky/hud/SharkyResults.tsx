/**
 * SharkyResults (design v7.1 7.9): bright, pose-led, Play Again first.
 *
 * Above the fold, nothing else:
 *   0ms     the shark on stage: shark_cheer bouncing on the podium's top step
 *           with a confetti cannon from both stage corners (TIME! or a win),
 *           or shark_dizzy with circling stars on a wipeout (no cannon)
 *   400ms   ONE giant Play Again (full width, 72pt, gold, 3 pulses then rest);
 *           a tap skips everything (the shell then runs a 600ms GO). The
 *           shared button rule: PLAY AGAIN leads unless a win's reward is
 *           still waiting (playAgainFirst false), then the claim leads.
 *           DONE sits right under it as a white button, never a text link
 *   300ms   hero stat 1 (under the stars, like the shared card): the score counts up over 600ms on the UI thread (CountUpText), the last
 *           digit slams 1.3 to 1.0 with impact Medium; NEW BEST adds a burst
 *   950ms   stars slam one at a time, 220ms apart, bass hit +0/+3/+7 st,
 *           Medium, Medium, Heavy
 *           hero stat 2: "Best chain x4 · 9 Close Skims"; the shared
 *           next-star bar (NextStarBar), same as every other game
 * The feeling line sits under the score like the shared card's: gold
 * AHEAD OF YOUR BEST! (only when the run finished ahead), or a light
 * SO CLOSE TO YOUR BEST!. A ride run that missed the gate gets the shared bar
 * with a word (ALMOST AT THE GATE!), never a percent. A saved run gets the
 * shared gold RUN SAVED stamp.
 * Below the fold (its space is kept from the start; it fades in at 2.4s): the green ahead bars, mission slots with a
 * slot-machine reel on completion, Tokens at this ride, the Full Clear medal,
 * the NEW! unlock card. The surface is a sky-to-white gradient; no dark slab.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { FxStage, type FxStageHandle } from '../../../gamekit/fx/FxStage';
import { CountUpText } from '../../../gamekit/fx/CountUpText';
import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { playHaptic } from '../../../gamekit/Haptics';
import GameIcon from '../../../ui/GameIcon';
import { SHARKY_ART } from '../assets';
import { INK, NEUTRAL, REWARD, REWARD_PALE } from '../render/palette';
import type { MissionUpdate } from '../meta/missions';
import { missionTarget, missionText } from '../meta/missions';
import { aheadBars, sharkyBragLine, sharkyGateWord, showSplits } from './resultLines';
import { NextStarBar } from '../../../gamekit/results/NextStarBar';
import { SavedStamp } from '../../../gamekit/results/SavedStamp';
import { nextStarGoal, type StarThresholds } from '../../../gamekit/core/scoring';
import { ResultsRibbon } from '../../../gamekit/results/ResultsRibbon';
import { ResultButtonRow, ResultPrimaryButton, ResultSecondaryButton } from '../../../gamekit/results/ResultButtons';
import { ResultChip } from '../../../gamekit/results/ResultsCard';
import { bestAwareTitle } from '../../../gamekit/results/feelings';
import { missionIcon } from './missionIcons';

/** The shared results card blue (ResultsCard). */
const CARD_BLUE = '#0768b9';

export interface SharkyResultsData {
  score: number;
  stars: number;
  won: boolean;
  wipeout: boolean;
  newBest: boolean;
  bestChainMult: number;
  closeSkims: number;
  nearMiss: string;
  /** A ride run that missed the gate: how far it got (0 to 0.99), for the shared bar. Null otherwise. */
  gateProgress?: number | null;
  /** Ghost split deltas per gate (score at the gate vs your best/ghost). */
  splits: number[];
  /** How many gates the ghost passed (the run must go as far to be "ahead"). */
  ghostGates?: number;
  missions: MissionUpdate | null;
  newCard: string | null;
  tokensAtRide: number | null;
  fullClear: boolean;
  headline: string;
  /** Queue star thresholds for the shared next-star bar (none on a ride challenge). */
  thresholds?: StarThresholds | null;
}

export interface SharkyResultsProps {
  data: SharkyResultsData;
  playAgain?: () => void;
  /** The shared button rule from the shell (PLAY AGAIN leads unless a won reward is waiting). */
  playAgainFirst?: boolean;
  /** A queue event saved this run before its first star (RUN SAVED, no bar). */
  saved?: boolean;
  /** The line ended the run (ride's up): its title wins, and no next-star bar. */
  wrapTitle?: string | null;
  claim: () => void;
  claimLabel: string;
  challenge?: () => void;
  challengeLabel?: string;
  reducedMotion: boolean;
}

/** Hops of the cheering shark, then it stands still. */
export const CHEER_HOPS = 8;
/** When the first star stamps, and the gap between stamps (ms). */
/** A kid in a moving line hears the result word within about 1.3 s of the card (950 ms, then 220 ms per star). */
export const STAR_AT = 950;
export const STAR_GAP = 220;

/** When the ribbon title slams: just after the last star lands (or as the stars would start). */
export function sharkyTitleAt(stars: number): number {
  return stars > 0 ? STAR_AT + (Math.min(3, stars) - 1) * STAR_GAP + 120 : STAR_AT;
}

/** PLAY AGAIN pulses this many times, then rests. */
export const PLAY_PULSES = 3;

/** Height of the full shark-on-podium pose (podium step at 70 pt + a 160 pt shark). */
const STAGE_POSE_PT = 230;


function Star({ on, index, delayMs, reduced, small = false }: { on: boolean; index: number; delayMs: number; reduced: boolean; small?: boolean }) {
  const sc = useSharedValue(on && !reduced ? 0 : 1);
  useEffect(() => {
    if (!on) return undefined;
    if (reduced) return undefined;
    sc.value = withDelay(delayMs, withSequence(
      withTiming(2.2, { duration: 1 }),
      withTiming(0.9, { duration: 140, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 9, stiffness: 320, mass: 0.6 }),
    ));
    const id = setTimeout(() => {
      GameAudio.play(GameAudio.hasCue('sh_star_slam') ? 'sh_star_slam' : 'fx.reveal', { pitch: [0, 3, 7][index] });
      playHaptic([{ at: 0, p: index === 2 ? 'heavy' : 'medium' }]);
    }, delayMs);
    return () => clearTimeout(id);
  }, [on, index, delayMs, reduced, sc]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return (
    <Animated.View style={[styles.star, st]}>
      <GameIcon name="star" size={(index === 1 ? 62 : 52) - (small ? 12 : 0)} mono={on ? undefined : '#9cc9ec'} />
    </Animated.View>
  );
}

export function SharkyResults({ data, playAgain, playAgainFirst = true, saved = false, wrapTitle = null, claim, claimLabel, challenge, challengeLabel, reducedMotion }: SharkyResultsProps) {
  const fx = useRef<FxStageHandle>(null);
  const win = useWindowDimensions();
  const [box, setBox] = useState({ w: 390, h: 700 });
  const [tapReady, setTapReady] = useState(false);
  // The below-the-fold rows keep their space from the start and fade in at
  // 2.4 s, so nothing jumps and the card never grows off a short screen.
  const belowIn = useSharedValue(reducedMotion ? 1 : 0);
  const bounce = useSharedValue(0);
  const pulse = useSharedValue(1);
  const slam = useSharedValue(1);
  const card = useSharedValue(reducedMotion ? 0 : 60);
  // The podium and the cheer are for a real win (a star or a new best). A
  // wipeout is dizzy; any other 0-star run swims calmly, off the podium.
  // A saved run is never written down as a best, so it never claims one.
  const newBest = data.newBest && !saved;
  const cheer = data.stars > 0 || newBest;
  const pose = cheer ? 'cheer' : data.wipeout ? 'dizzy' : 'swim';
  const short = win.height < 740;
  // Room under the card for the home bar (none on an SE).
  const bottomPad = Math.max(10, initialWindowMetrics?.insets.bottom ?? 0) + 4;
  // Shark and podium scale with the stage they get: 1 = the full 230 pt pose.
  const [k, setK] = useState(0);
  const onStageLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setK(Math.max(0.4, Math.min(1, h / STAGE_POSE_PT)));
  };

  useEffect(() => {
    card.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    // The cheer and the PLAY AGAIN pulse play for a few beats, then rest, so a
    // card left open in a pocket costs no frames.
    if (cheer && !reducedMotion) bounce.value = withRepeat(withSequence(withTiming(-14, { duration: 220, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) })), CHEER_HOPS);
    if (!reducedMotion) pulse.value = withDelay(400, withRepeat(withSequence(withTiming(1.04, { duration: 333 }), withTiming(1, { duration: 333 })), PLAY_PULSES));
    const t1 = setTimeout(() => setTapReady(true), 400);
    const t2 = setTimeout(() => {
      slam.value = withSequence(withTiming(1.3, { duration: 1 }), withSpring(1, { damping: 10, stiffness: 300 }));
      playHaptic([{ at: 0, p: 'medium' }]);
      if (newBest) {
        GameAudio.play(GameAudio.hasCue('sting_new_record') ? 'sting_new_record' : 'fx.purchase');
        fx.current?.burst('confetti', box.w / 2, box.h * 0.42, { count: 24 });
      }
    }, 1400);
    if (!reducedMotion) belowIn.value = withDelay(2400, withTiming(1, { duration: 260 }));
    // Confetti cannon from both stage corners (a win or TIME!): 2 bursts of 16, 120ms apart.
    // The only confetti on screen (the shell skips its own: ownCelebration).
    const cannons: ReturnType<typeof setTimeout>[] = [];
    if (cheer) {
      [0, 120].forEach((ms) => cannons.push(setTimeout(() => {
        fx.current?.burst('confetti', box.w * 0.18, box.h * 0.3, { count: 16, angle: -60, spread: 40, speed: 1.4 });
        fx.current?.burst('confetti', box.w * 0.82, box.h * 0.3, { count: 16, angle: -120, spread: 40, speed: 1.4 });
      }, ms)));
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      cannons.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const sharkStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }] }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const scoreStyle = useAnimatedStyle(() => ({ transform: [{ scale: slam.value }] }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: card.value }] }));
  const belowStyle = useAnimatedStyle(() => ({ opacity: belowIn.value }));
  const againFirst = !!playAgain && playAgainFirst;
  const primary = againFirst ? playAgain : claim;
  const primaryLabel = againFirst ? 'PLAY AGAIN' : claimLabel;
  // The same brag chips as the shared card (the words are in sharkyBragLine for a11y).
  const brag = sharkyBragLine(data.bestChainMult, data.closeSkims);
  const chips = useMemo(() => [
    ...(data.bestChainMult >= 3 ? [{ label: 'BEST CHAIN', value: `x${data.bestChainMult}` }] : []),
    ...(data.closeSkims > 0 ? [{ label: data.closeSkims === 1 ? 'CLOSE SKIM' : 'CLOSE SKIMS', value: String(data.closeSkims) }] : []),
  ], [data.bestChainMult, data.closeSkims]);
  const title = bestAwareTitle(wrapTitle ?? data.headline, data.stars, newBest) ?? data.headline;
  // The title waits for the last star stamp (stars at STAR_AT + i x STAR_GAP), so GREAT! never gives the count away.
  const titleAt = sharkyTitleAt(saved ? 0 : data.stars);
  const goal = useMemo(() => (data.thresholds && !saved && !wrapTitle ? nextStarGoal(data.score, data.thresholds) : null), [data.thresholds, data.score, saved, wrapTitle]);
  const bars = useMemo(() => aheadBars(data.splits), [data.splits]);
  // One feeling line under the score, the same slot the shared card uses:
  // gold when the run beat your best ghost, light for "so close to your best".
  const ahead = !newBest && showSplits(data.splits, data.ghostGates ?? 0);
  const feeling = ahead ? 'AHEAD OF YOUR BEST!' : data.nearMiss ? data.nearMiss.toUpperCase() : '';
  const gate = data.gateProgress != null && !saved && !wrapTitle ? data.gateProgress : null;
  const splitMax = useMemo(() => Math.max(1, ...bars), [bars]);
  const showMissions = !!data.missions && !data.newCard;
  const hasBelow = !!data.newCard || (ahead && bars.length > 0) || showMissions || data.tokensAtRide !== null || data.fullClear;
  // Short phones (SE) keep the shark on stage by dropping two repeats: a full
  // ALL 3 STARS! bar under three lit stars, and the brag chips when the
  // picture missions are showing (pictures read without words).

  return (
    <View style={[styles.root, { width: win.width, height: win.height }]} onLayout={onLayout}>
      <LinearGradient colors={['#dff3ff', NEUTRAL]} style={StyleSheet.absoluteFill} />
      <View style={styles.trim} />
      {/* The feeling word slams in as the last star stamps (never before the stars). */}
      <ResultsRibbon title={title} reducedMotion={reducedMotion} delayMs={titleAt} style={[styles.headline, short && styles.headlineShort]} />

      {/* The shark on stage */}
      {/* Tall phones give the title room above the shark. Short phones (SE) get a
          smaller stage under a higher title, so the title never sits on the
          shark's head and more of the card stays on screen. */}
      {/* The stage takes whatever height the card leaves (it flexes), and the
          shark and podium scale to fit it, so on any phone the card sits whole
          above the home bar and the shark never reaches the title. */}
      <View style={[styles.stage, short && styles.stageShort]} onLayout={onStageLayout}>
        {k > 0 ? <>
          <Animated.View style={[styles.sharkWrap, { bottom: (cheer ? 70 : 18) * k }, sharkStyle]}>
            <Image source={SHARKY_ART[pose]} style={pose === 'swim' ? { width: 190 * k, height: 130 * k } : { width: 130 * k, height: 160 * k }} resizeMode="contain" />
            {pose === 'dizzy' ? <Image source={SHARKY_ART.dizzyStar} style={[styles.dizzyStars, { width: 56 * k, height: 36 * k }]} resizeMode="contain" /> : null}
          </Animated.View>
          {cheer ? <Image source={SHARKY_ART.podium} style={{ width: 210 * k, height: 110 * k }} resizeMode="contain" /> : null}
        </> : null}
      </View>

      <Animated.View style={[styles.card, short && styles.cardShort, { marginBottom: bottomPad }, cardStyle]}>
        {/* The shared card's order: stars (or the stamp), then the score, then NEW BEST. */}
        {saved ? <SavedStamp reducedMotion={reducedMotion} delayMs={STAR_AT} /> : (
          <View style={[styles.stars, short && styles.starsShort]}>
            {[0, 1, 2].map((i) => <Star key={i} index={i} on={i < data.stars} delayMs={STAR_AT + i * STAR_GAP} reduced={reducedMotion} small={short} />)}
          </View>
        )}
        {/* The score counts up on the UI thread (no re-render of this card per step). */}
        <Animated.View style={[styles.scoreWrap, scoreStyle]}>
          <CountUpText value={data.score} from={0} delayMs={300} durationMs={600} punch={1} reducedMotion={reducedMotion}
            style={[styles.score, short && styles.scoreShort]} />
        </Animated.View>
        {newBest ? (
          <View style={styles.newBest}>
            <GameIcon name="crown" size={22} />
            <Text style={styles.newBestText}>NEW BEST!</Text>
          </View>
        ) : null}
        {feeling ? (
          <View style={[styles.feeling, ahead && styles.feelingGold]}>
            <Text style={styles.feelingText} numberOfLines={1} adjustsFontSizeToFit>{feeling}</Text>
          </View>
        ) : null}
        {chips.length && !(short && showMissions) ? (
          <View style={styles.chips} accessible accessibilityLabel={brag}>
            {chips.map((c) => <ResultChip key={c.label} label={c.label} value={c.value} />)}
          </View>
        ) : null}
        {goal && !(short && goal.nextStar === 0) ? <NextStarBar goal={goal} delayMs={STAR_AT + 50} reducedMotion={reducedMotion} /> : null}
        {gate !== null ? (
          <NextStarBar goal={{ nextStar: 1, progress: gate, near: gate >= 0.85, remaining: 0 }} word={sharkyGateWord(gate)}
            a11yLabel={`${Math.round(gate * 100)} percent of the way to the Ride Gate`} delayMs={STAR_AT + 50} reducedMotion={reducedMotion} />
        ) : null}

        <Animated.View style={[styles.playWrap, short && styles.playWrapShort, btnStyle]}>
          <ResultPrimaryButton label={primaryLabel} icon={againFirst ? 'retry' : undefined} disabled={!tapReady} onPress={primary} style={styles.playBtn} />
        </Animated.View>
        {againFirst || challenge || playAgain ? (
          <ResultButtonRow>
            {againFirst ? (
              <ResultSecondaryButton label={claimLabel} onPress={claim} />
            ) : playAgain ? (
              <ResultSecondaryButton label="PLAY AGAIN" icon="retry" onPress={playAgain} />
            ) : null}
            {challenge ? <ResultSecondaryButton label={challengeLabel ?? 'RACE GHOSTS'} icon="rush" onPress={challenge} /> : null}
          </ResultButtonRow>
        ) : null}

        {hasBelow ? (
          <Animated.View style={[styles.below, belowStyle]}>
            {data.newCard ? <Text style={[styles.newCard, short && styles.newCardShort]}>{data.newCard.toUpperCase()}</Text> : null}
            {ahead && bars.length ? (
              <View style={styles.splitRow} accessible accessibilityLabel={`Ahead of your best at ${bars.length} gates`}>
                {bars.map((d, i) => (
                  <View key={i} style={styles.splitCell}>
                    <View style={[styles.splitBar, { height: 10 + (18 * d) / splitMax }]} />
                  </View>
                ))}
              </View>
            ) : null}
            {/* Missions as picture plus bar: a kid who cannot read still sees each
                goal and how full it is. The words are spoken only. */}
            {showMissions && data.missions ? (
              <View style={styles.mRow}>
                {data.missions.missions.map((m) => {
                  const icon = missionIcon(m.id);
                  const fill = Math.max(0, Math.min(1, m.progress / missionTarget(m.id)));
                  return (
                    <View key={m.id} style={[styles.mCell, m.done && styles.mCellDone]} accessible
                      accessibilityLabel={`${missionText(m.id)}${m.done ? ', done' : `, ${m.progress} of ${missionTarget(m.id)}`}`}>
                      {icon.art ? <Image source={icon.art} style={styles.mArt} resizeMode="contain" /> : <GameIcon name={icon.name ?? 'star'} size={26} />}
                      {m.done ? <View style={styles.mCheck}><GameIcon name="check" size={16} /></View> : null}
                      <View style={styles.mTrack}><View style={[styles.mFill, { width: `${Math.round(fill * 100)}%` }]} /></View>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {data.tokensAtRide !== null ? (
              <View style={styles.tokens} accessible accessibilityLabel={`${data.tokensAtRide} of 9 Ride Tokens at this ride`}>
                <Image source={SHARKY_ART.tokenGold} style={styles.tokenArt} resizeMode="contain" />
                <Text style={styles.small}>{`${data.tokensAtRide}/9`}</Text>
              </View>
            ) : null}
            {data.fullClear ? <Image source={SHARKY_ART.fullClear} style={[styles.medal, short && styles.medalShort]} resizeMode="contain" /> : null}
          </Animated.View>
        ) : null}
      </Animated.View>
      <FxStage ref={fx} width={box.w} height={box.h} reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', overflow: 'hidden' },
  trim: { position: 'absolute', left: 0, right: 0, top: 0, height: 5, backgroundColor: REWARD },
  headline: { position: 'absolute', top: 50, left: 12, right: 12, zIndex: 2 },
  // The stage starts under the title and flexes into the space the card leaves.
  stage: { width: '100%', flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'flex-end', marginTop: 124 },
  // Short phones (iPhone SE, 667 pt): the title sits higher and the card is tighter.
  stageShort: { marginTop: 88 },
  headlineShort: { top: 16 },
  sharkWrap: { position: 'absolute', alignItems: 'center' },
  dizzyStars: { position: 'absolute', top: -6 },
  // The one results surface every game shares: the blue card with a white border.
  card: { width: '92%', backgroundColor: CARD_BLUE, borderRadius: 26, borderWidth: 4, borderColor: '#ffffff', padding: 14, alignItems: 'center', marginTop: -6,
    shadowColor: '#05346e', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 18 },
  // Full width with a fixed line height: the count-up field never starts
  // narrower than its final number, so the navy shadow always sits right under
  // the gold fill (a narrow field scrolled the glyphs off their shadow at SE size).
  scoreWrap: { alignSelf: 'stretch' },
  score: { width: '100%', fontFamily: 'Shark', fontSize: 54, lineHeight: 62, color: REWARD, textShadowColor: INK, textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  newBest: { flexDirection: 'row', alignItems: 'center', backgroundColor: REWARD, borderRadius: 999, borderWidth: 3, borderColor: INK, paddingHorizontal: 12, paddingVertical: 2, marginTop: 2 },
  newBestText: { fontFamily: 'Shark', fontSize: 18, color: INK, marginLeft: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  stars: { flexDirection: 'row', marginVertical: 6 },
  star: { marginHorizontal: 6 },
  feeling: { borderRadius: 999, borderWidth: 3, borderColor: INK, backgroundColor: '#e4f7ff', paddingHorizontal: 14,
    paddingVertical: 3, marginBottom: 4, maxWidth: '100%' },
  feelingGold: { backgroundColor: REWARD },
  feelingText: { fontFamily: 'Knockout', fontSize: 16, color: INK, letterSpacing: 1 },
  playWrap: { width: '100%', marginTop: 12 },
  playBtn: { marginTop: 0 },
  // One row under the buttons: missions, tokens and the medal side by side.
  below: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 8, marginTop: 8 },
  newCard: { fontFamily: 'Shark', fontSize: 18, color: INK, backgroundColor: REWARD, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 6, marginBottom: 6 },
  splitRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 4 },
  splitCell: { alignItems: 'center', marginHorizontal: 8 },
  splitBar: { width: 22, borderRadius: 6, borderWidth: 2, borderColor: INK, backgroundColor: '#3ccf6b' },
  mRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  mCell: { alignItems: 'center', backgroundColor: '#e4f7ff', borderRadius: 14, borderWidth: 3, borderColor: INK, paddingHorizontal: 6, paddingTop: 2, paddingBottom: 4, minWidth: 56 },
  mCellDone: { backgroundColor: REWARD_PALE },
  mArt: { width: 30, height: 30 },
  mCheck: { position: 'absolute', top: -8, right: -8, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2, borderColor: INK, padding: 1 },
  mTrack: { width: 40, height: 10, marginTop: 4, borderRadius: 5, backgroundColor: '#cfe6fb', borderWidth: 2, borderColor: INK, overflow: 'hidden' },
  mFill: { height: '100%', backgroundColor: REWARD },
  small: { fontFamily: 'Shark', fontSize: 16, color: '#ffffff', marginLeft: 4 },
  tokens: { flexDirection: 'row', alignItems: 'center' },
  tokenArt: { width: 24, height: 24 },
  medal: { width: 46, height: 46 },
  cardShort: { paddingVertical: 10 },
  starsShort: { marginVertical: 2 },
  scoreShort: { fontSize: 44, lineHeight: 52 },
  playWrapShort: { marginTop: 8 },
  newCardShort: { fontSize: 16, paddingVertical: 4, marginBottom: 0 },
  medalShort: { width: 40, height: 40 },
});
