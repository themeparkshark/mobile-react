/**
 * SharkyResults (design v7.1 7.9): bright, pose-led, Play Again first.
 *
 * Above the fold, nothing else:
 *   0ms     the shark on stage: shark_cheer bouncing on the podium's top step
 *           with a confetti cannon from both stage corners (TIME! or a win),
 *           or shark_dizzy with circling stars on a wipeout (no cannon)
 *   400ms   ONE giant Play Again (full width, 72pt, gold, pulsing 1.5Hz);
 *           a tap skips everything (the shell then runs a 600ms GO). The
 *           shared button rule: PLAY AGAIN leads unless a win's reward is
 *           still waiting (playAgainFirst false), then the claim leads.
 *           DONE sits right under it as a white button, never a text link
 *   300ms   hero stat 1: the score counts up over 1100ms (outQuart), the last
 *           digit slams 1.3 to 1.0 with impact Medium; NEW BEST adds a burst
 *   1450ms  stars slam one at a time, 220ms apart, bass hit +0/+3/+7 st,
 *           Medium, Medium, Heavy
 *           hero stat 2: "Best chain x4 · 9 Close Skims"; the shared
 *           next-star bar (NextStarBar), same as every other game
 * Below the fold (rises at 2.4s): AHEAD OF YOUR BEST (only when the run
 * finished ahead, green bars only), mission slots with a
 * slot-machine reel on completion, Tokens at this ride, the Full Clear medal,
 * the NEW! unlock card. The surface is a sky-to-white gradient; no dark slab.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { FxStage, type FxStageHandle } from '../../../gamekit/fx/FxStage';
import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { playHaptic } from '../../../gamekit/Haptics';
import GameIcon from '../../../ui/GameIcon';
import { SHARKY_ART } from '../assets';
import { INK, NEUTRAL, REWARD, REWARD_PALE } from '../render/palette';
import type { MissionUpdate } from '../meta/missions';
import { missionTarget, missionText } from '../meta/missions';
import { aheadBars, sharkyBragLine, showSplits } from './resultLines';
import { NextStarBar } from '../../../gamekit/results/NextStarBar';
import { nextStarGoal, type StarThresholds } from '../../../gamekit/core/scoring';

export interface SharkyResultsData {
  score: number;
  stars: number;
  won: boolean;
  wipeout: boolean;
  newBest: boolean;
  bestChainMult: number;
  closeSkims: number;
  nearMiss: string;
  /** Ghost split deltas per gate (score at the gate vs your best/ghost). */
  splits: number[];
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
  claim: () => void;
  claimLabel: string;
  challenge?: () => void;
  challengeLabel?: string;
  reducedMotion: boolean;
}

function useCountUp(target: number, delayMs: number, durMs: number): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = Date.now() + delayMs;
    const loop = () => {
      const t = Date.now() - t0;
      if (t < 0) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const k = Math.min(1, t / durMs);
      const e = 1 - Math.pow(1 - k, 4);
      setV(Math.round(target * e));
      if (k < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [target, delayMs, durMs]);
  return v;
}

function Star({ on, index, delayMs, reduced }: { on: boolean; index: number; delayMs: number; reduced: boolean }) {
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
      <GameIcon name="star" size={index === 1 ? 62 : 52} mono={on ? undefined : '#9cc9ec'} />
    </Animated.View>
  );
}

export function SharkyResults({ data, playAgain, playAgainFirst = true, saved = false, claim, claimLabel, challenge, challengeLabel, reducedMotion }: SharkyResultsProps) {
  const fx = useRef<FxStageHandle>(null);
  const win = useWindowDimensions();
  const [box, setBox] = useState({ w: 390, h: 700 });
  const shown = useCountUp(data.score, 300, 1100);
  const [tapReady, setTapReady] = useState(false);
  const [below, setBelow] = useState(false);
  const bounce = useSharedValue(0);
  const pulse = useSharedValue(1);
  const slam = useSharedValue(1);
  const card = useSharedValue(reducedMotion ? 0 : 60);
  const cheer = !data.wipeout;

  useEffect(() => {
    card.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    if (cheer && !reducedMotion) bounce.value = withRepeat(withSequence(withTiming(-14, { duration: 220, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) })), -1);
    pulse.value = withDelay(400, withRepeat(withSequence(withTiming(1.04, { duration: 333 }), withTiming(1, { duration: 333 })), -1));
    const t1 = setTimeout(() => setTapReady(true), 400);
    const t2 = setTimeout(() => {
      slam.value = withSequence(withTiming(1.3, { duration: 1 }), withSpring(1, { damping: 10, stiffness: 300 }));
      playHaptic([{ at: 0, p: 'medium' }]);
      if (data.newBest) {
        GameAudio.play(GameAudio.hasCue('sting_new_record') ? 'sting_new_record' : 'fx.reward');
        fx.current?.burst('confetti', box.w / 2, box.h * 0.42, { count: 24 });
      }
    }, 1400);
    const t3 = setTimeout(() => setBelow(true), 2400);
    // Confetti cannon from both stage corners (a win or TIME!): 2 bursts of 24, 120ms apart.
    const cannons: ReturnType<typeof setTimeout>[] = [];
    if (cheer) {
      [0, 120].forEach((ms) => cannons.push(setTimeout(() => {
        fx.current?.burst('confetti', box.w * 0.18, box.h * 0.3, { count: 24, angle: -60, spread: 40, speed: 1.4 });
        fx.current?.burst('confetti', box.w * 0.82, box.h * 0.3, { count: 24, angle: -120, spread: 40, speed: 1.4 });
      }, ms)));
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      cannons.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const sharkStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }] }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const scoreStyle = useAnimatedStyle(() => ({ transform: [{ scale: slam.value }] }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: card.value }] }));
  const againFirst = !!playAgain && playAgainFirst;
  const primary = againFirst ? playAgain : claim;
  const primaryLabel = againFirst ? 'PLAY AGAIN' : claimLabel;
  const brag = sharkyBragLine(data.bestChainMult, data.closeSkims);
  const goal = useMemo(() => (data.thresholds && !saved ? nextStarGoal(data.score, data.thresholds) : null), [data.thresholds, data.score, saved]);
  const bars = useMemo(() => aheadBars(data.splits), [data.splits]);
  const splitMax = useMemo(() => Math.max(1, ...bars), [bars]);

  return (
    <View style={[styles.root, { height: win.height }]} onLayout={onLayout}>
      <LinearGradient colors={['#dff3ff', NEUTRAL]} style={StyleSheet.absoluteFill} />
      <View style={styles.trim} />
      <Text style={styles.headline}>{data.headline}</Text>

      {/* The shark on stage */}
      <View style={styles.stage}>
        <Animated.View style={[styles.sharkWrap, sharkStyle]}>
          <Image source={cheer ? SHARKY_ART.cheer : SHARKY_ART.dizzy} style={styles.shark} resizeMode="contain" />
          {!cheer ? <Image source={SHARKY_ART.dizzyStar} style={styles.dizzyStars} resizeMode="contain" /> : null}
        </Animated.View>
        <Image source={SHARKY_ART.podium} style={styles.podium} resizeMode="contain" />
      </View>

      <Animated.View style={[styles.card, cardStyle]}>
        <Animated.Text style={[styles.score, scoreStyle]}>{shown.toLocaleString()}</Animated.Text>
        {data.newBest ? <Text style={styles.newBest}>NEW BEST</Text> : null}
        {saved ? <Text style={styles.saved}>RUN SAVED</Text> : (
          <View style={styles.stars}>
            {[0, 1, 2].map((i) => <Star key={i} index={i} on={i < data.stars} delayMs={1450 + i * 220} reduced={reducedMotion} />)}
          </View>
        )}
        {brag ? <Text style={styles.hero2}>{brag}</Text> : null}
        {data.nearMiss ? <Text style={styles.nearMiss}>{data.nearMiss}</Text> : null}
        {goal ? <NextStarBar goal={goal} delayMs={1500} reducedMotion={reducedMotion} tone="onWhite" /> : null}

        <Animated.View style={[styles.playWrap, btnStyle]}>
          <TouchableOpacity accessibilityRole="button" style={styles.play} disabled={!tapReady} onPress={primary}>
            {againFirst ? <GameIcon name="retry" size={30} /> : null}
            <Text style={[styles.playText, againFirst && styles.playGap]}>{primaryLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
        {againFirst || challenge || playAgain ? (
          <View style={styles.secondary}>
            {againFirst ? (
              <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={claim}>
                <Text style={styles.secondaryText}>{claimLabel}</Text>
              </TouchableOpacity>
            ) : playAgain ? (
              <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={playAgain}>
                <GameIcon name="retry" size={20} />
                <Text style={[styles.secondaryText, styles.playGap]}>PLAY AGAIN</Text>
              </TouchableOpacity>
            ) : null}
            {challenge ? (
              <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={challenge}>
                <GameIcon name="swords" size={20} />
                <Text style={[styles.secondaryText, styles.playGap]} numberOfLines={1} adjustsFontSizeToFit>{(challengeLabel ?? 'RACE MY GHOST').toUpperCase()}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {below ? (
          <View style={styles.below}>
            {data.newCard ? <Text style={styles.newCard}>{data.newCard}</Text> : null}
            {showSplits(data.splits) ? (
              <>
                <Text style={styles.splitText}>AHEAD OF YOUR BEST!</Text>
                {bars.length ? (
                  <View style={styles.splitRow}>
                    {bars.map((d, i) => (
                      <View key={i} style={styles.splitCell}>
                        <View style={[styles.splitBar, { height: 10 + (18 * d) / splitMax }]} />
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
            {data.missions && !data.newCard ? data.missions.missions.map((m) => (
              <View key={m.id} style={styles.mRow}>
                <Text style={[styles.mText, m.done && styles.mDone]} numberOfLines={1}>{missionText(m.id)}</Text>
                <View style={styles.mTrack}><View style={[styles.mFill, { width: `${Math.round((100 * m.progress) / missionTarget(m.id))}%` }]} /></View>
              </View>
            )) : null}
            {data.tokensAtRide !== null ? <Text style={styles.small}>{`Tokens ${data.tokensAtRide}/9 at this ride`}</Text> : null}
            {data.fullClear ? <Image source={SHARKY_ART.fullClear} style={styles.medal} resizeMode="contain" /> : null}
          </View>
        ) : null}
      </Animated.View>
      <FxStage ref={fx} width={box.w} height={box.h} reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', alignItems: 'center', overflow: 'hidden' },
  trim: { position: 'absolute', left: 0, right: 0, top: 0, height: 5, backgroundColor: REWARD },
  headline: { fontFamily: 'Shark', fontSize: 30, color: INK, position: 'absolute', top: 58, zIndex: 2, textShadowColor: NEUTRAL, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  stage: { width: '100%', height: 210, alignItems: 'center', justifyContent: 'flex-end', marginTop: 96 },
  sharkWrap: { position: 'absolute', bottom: 70, alignItems: 'center' },
  shark: { width: 130, height: 160 },
  dizzyStars: { position: 'absolute', top: -6, width: 56, height: 36 },
  podium: { width: 210, height: 110 },
  card: { width: '92%', backgroundColor: NEUTRAL, borderRadius: 26, borderWidth: 4, borderColor: INK, padding: 14, alignItems: 'center', marginTop: -6 },
  score: { fontFamily: 'Shark', fontSize: 54, color: REWARD, textShadowColor: INK, textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  newBest: { fontFamily: 'Shark', fontSize: 18, color: INK, backgroundColor: REWARD_PALE, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 10, marginTop: 2 },
  stars: { flexDirection: 'row', marginVertical: 6 },
  star: { marginHorizontal: 6 },
  hero2: { fontFamily: 'Shark', fontSize: 19, color: INK, textAlign: 'center' },
  nearMiss: { fontFamily: 'Knockout', fontSize: 15, color: INK, marginTop: 4, textAlign: 'center' },
  playWrap: { width: '100%', marginTop: 12 },
  play: { height: 72, borderRadius: 36, backgroundColor: REWARD, borderWidth: 5, borderColor: INK, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  playText: { fontFamily: 'Shark', fontSize: 34, color: INK },
  playGap: { marginLeft: 8 },
  saved: { fontFamily: 'Shark', fontSize: 22, color: INK, backgroundColor: REWARD, borderRadius: 12, borderWidth: 3, borderColor: INK,
    overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 4, marginBottom: 4, transform: [{ rotate: '-4deg' }] },
  below: { width: '100%', alignItems: 'center', marginTop: 10 },
  newCard: { fontFamily: 'Shark', fontSize: 18, color: INK, backgroundColor: REWARD, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 6, marginBottom: 6 },
  splitRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 4 },
  splitCell: { alignItems: 'center', marginHorizontal: 8 },
  splitBar: { width: 22, borderRadius: 6, borderWidth: 2, borderColor: INK, backgroundColor: '#3ccf6b' },
  splitText: { fontFamily: 'Shark', fontSize: 16, color: '#11823b', marginTop: 2 },
  mRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 2 },
  mText: { flex: 1, fontFamily: 'Knockout', fontSize: 13, color: INK },
  mDone: { color: '#1b8f3a' },
  mTrack: { width: 70, height: 8, borderRadius: 4, backgroundColor: '#cfe6fb', borderWidth: 2, borderColor: INK, overflow: 'hidden' },
  mFill: { height: '100%', backgroundColor: REWARD },
  small: { fontFamily: 'Knockout', fontSize: 13, color: INK, marginTop: 4 },
  medal: { width: 54, height: 54, marginTop: 4 },
  secondary: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 10 },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#ffffff', borderWidth: 3, borderColor: INK, borderBottomWidth: 5 },
  secondaryText: { fontFamily: 'Shark', fontSize: 18, color: INK },
});
