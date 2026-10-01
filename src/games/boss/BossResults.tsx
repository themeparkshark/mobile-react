/**
 * Boss Brawl results (design v7.1 11.8 4-5, 9.3, 9.4): the card's portrait is
 * the broken boss in this round's damage state, and the results play on the
 * beat. The score counts up over 2 beats, then each earned star slams in on
 * its own beat pitched up the G minor pentatonic (G, Bb, D) with a light /
 * medium / heavy haptic, the Crown slams on a 4th beat, then the rating word
 * (NICE / GREAT / SUPERB, drawn K10 wordmarks), then the chips: best chain
 * within a bout, timing, NEXT STAR, ghost split, Daily First Brawl and the
 * part-break sticker book. Tap anywhere on the card to skip to the end state.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { playHaptic } from '../../gamekit/Haptics';
import type { GameResult } from '../../gamekit/GameShellV2';
import type { RoundSummary } from './sim/round';
import { STAR_POINTS } from './sim/constants';
import { WORDMARK_SRC } from './CalloutLayer';
import { STICKERS, type StickerId } from './localMeta';
import { BossPortrait } from './BossPortrait';

const STAR = require('../../assets/games/boss/fx_small_dizzy_star.png');
const RIBBON = require('../../../assets/images/ribbon.png');
const STICKER_ART: Record<StickerId, number> = {
  hat: require('../../assets/games/boss/mat_feather.png'),
  tentacle: require('../../assets/games/boss/mat_barnacle.png'),
  shell: require('../../assets/games/boss/mat_pearl.png'),
  scale: require('../../assets/games/boss/mat_scale.png'),
};
const STICKER_NAME: Record<StickerId, string> = { hat: 'Hat off', tentacle: 'Tentacle sling', shell: 'Cracked shell', scale: 'Kraken Scale' };
/** G minor pentatonic: G, Bb, D as semitones over the cue's root, then the Crown an octave up from G. */
const STAR_PITCH = [0, 3, 7, 12];

export interface BossResultsExtras {
  summary: RoundSummary;
  ko: boolean;
  /** This round's local Daily First Brawl (the bonus itself is server-paid, WS6). */
  daily: boolean;
  /** Server confirmed the Daily First Brawl bonus (WS6); display-only stamp until then. */
  dailyPaid: boolean;
  stickers: StickerId[];
  freshStickers: StickerId[];
  ghost: { name: string; delta: number } | null;
  beatMs: number;
}

interface Props {
  result: GameResult;
  extras: BossResultsExtras;
  reducedMotion: boolean;
  claim: () => void;
  rematch?: () => void;
}

export function BossResults({ result, extras, reducedMotion, claim, rematch }: Props) {
  const s = extras.summary;
  const beat = extras.beatMs;
  const stars = result.stars;
  const crown = s.crown;
  const [done, setDone] = useState(reducedMotion);
  const [shown, setShown] = useState(reducedMotion ? result.score : 0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Beats: 0-1 count-up; 2.. stars on their own beats; crown; rating; chips.
  const starBeat = (i: number) => 2 + i;
  const crownBeat = 2 + stars;
  const rateBeat = crownBeat + (crown ? 1 : 0);
  const chipsBeat = rateBeat + 1;
  const slam = [useSharedValue(reducedMotion ? 1 : 0), useSharedValue(reducedMotion ? 1 : 0), useSharedValue(reducedMotion ? 1 : 0)];
  const crownS = useSharedValue(reducedMotion ? 1 : 0);
  const rate = useSharedValue(reducedMotion ? 1 : 0);
  const chips = useSharedValue(reducedMotion ? 1 : 0);
  const card = useSharedValue(reducedMotion ? 1 : 0);

  const finish = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShown(result.score);
    slam.forEach((v, i) => { v.value = i < stars ? 1 : 0.999; });
    crownS.value = 1;
    rate.value = 1;
    chips.value = 1;
    card.value = 1;
    setDone(true);
  };

  useEffect(() => {
    if (reducedMotion) return undefined;
    const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
    card.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.back(1.4)) });
    // Score: 2 beats, a tick per 100.
    const steps = Math.max(1, Math.ceil(result.score / 100));
    const stepMs = (2 * beat) / steps;
    for (let k = 1; k <= steps; k++) {
      at(k * stepMs, () => {
        setShown(Math.min(result.score, k * 100));
        GameAudio.play('ui.select', { volume: 0.35, pitch: Math.min(12, k * 0.5) });
      });
    }
    for (let i = 0; i < 3; i++) {
      if (i >= stars) {
        slam[i].value = withDelay(starBeat(i) * beat, withTiming(0.999, { duration: 120 }));
        continue;
      }
      slam[i].value = withDelay(starBeat(i) * beat, withSequence(
        withTiming(1.6, { duration: 0 }),
        withTiming(1, { duration: 140, easing: Easing.out(Easing.back(2)) }),
      ));
      at(starBeat(i) * beat + 20, () => {
        GameAudio.play(GameAudio.hasCue('sh_star_slam') ? 'sh_star_slam' : 'fx.reveal', { pitch: STAR_PITCH[i] });
        playHaptic(i === 0 ? 'tap' : i === 1 ? 'goodHit' : 'bigStarSlam');
      });
    }
    if (crown) {
      crownS.value = withDelay(crownBeat * beat, withSequence(withTiming(1.8, { duration: 0 }), withSpring(1, { damping: 9, stiffness: 300 })));
      at(crownBeat * beat + 20, () => {
        GameAudio.play('fx.reward', { pitch: STAR_PITCH[3] });
        playHaptic('win');
      });
    }
    rate.value = withDelay(rateBeat * beat, withSequence(withTiming(1.3, { duration: 0 }), withSpring(1, { damping: 10, stiffness: 280 })));
    chips.value = withDelay(chipsBeat * beat, withTiming(1, { duration: 260 }));
    at(chipsBeat * beat + 300, () => setDone(true));
    if (extras.freshStickers.length > 0) at(chipsBeat * beat + 420, () => GameAudio.play('fx.coin', { pitch: 7 }));
    return () => timers.current.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cardStyle = useAnimatedStyle(() => ({ opacity: card.value, transform: [{ scale: 0.92 + 0.08 * card.value }] }));
  const starStyle = (i: number) => useAnimatedStyle(() => ({ // eslint-disable-line react-hooks/rules-of-hooks
    transform: [{ scale: slam[i].value <= 0 ? 0.001 : slam[i].value }], opacity: slam[i].value <= 0 ? 0 : 1,
  }));
  const st = [starStyle(0), starStyle(1), starStyle(2)];
  const crownStyle = useAnimatedStyle(() => ({ transform: [{ scale: crownS.value <= 0 ? 0.001 : crownS.value }], opacity: crownS.value > 0 ? 1 : 0 }));
  const rateStyle = useAnimatedStyle(() => ({ transform: [{ scale: rate.value <= 0 ? 0.001 : rate.value }, { rotate: '-4deg' }], opacity: rate.value > 0 ? 1 : 0 }));
  const chipStyle = useAnimatedStyle(() => ({ opacity: chips.value, transform: [{ translateY: 10 * (1 - chips.value) }] }));

  const ratingWm = stars >= 3 ? 'superb' : stars === 2 ? 'great' : stars === 1 ? 'nice' : null;
  const headline = result.message ?? '';
  const goal = useMemo(() => {
    if (stars >= 3) return crown ? null : `${(STAR_POINTS.crown - s.damage).toLocaleString()} to the Crown`;
    return s.nextStar;
  }, [stars, crown, s]);
  const chipsList: { label: string; value: string }[] = [
    { label: 'PERFECTS', value: `${s.perfect}` },
    { label: 'POPS', value: `${s.popPerfect + s.pops}` },
    { label: 'BREAKS', value: `${s.breaks}` },
    { label: 'BEST CHAIN', value: `x${s.maxChain}` },
    ...(s.slams > 0 ? [{ label: 'EASY SLAMS', value: `${s.slams}` }] : []),
    ...(s.skillStar ? [{ label: 'SKILL STAR', value: "Captain's Call" }] : []),
    ...(s.getups > 0 ? [{ label: 'GOT BACK UP', value: `${s.getups}` }] : []),
  ];
  const timing = (result.stats ?? []).find((x) => x.label === 'TIMING');

  return (
    <Animated.View style={[styles.wrap, cardStyle]}>
      <Pressable onPress={done ? undefined : finish} style={styles.card} accessibilityRole="summary">
        <View style={styles.ribbonWrap}>
          <Image source={RIBBON} style={styles.ribbon} resizeMode="contain" />
          <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit>{headline}</Text>
        </View>
        <View style={styles.top}>
          <View style={styles.portrait}>
            <BossPortrait size={118} breaks={s.breaks} ko={extras.ko} />
          </View>
          <View style={styles.scoreCol}>
            <Text style={styles.scoreLabel}>DAMAGE</Text>
            <Text style={styles.score}>{shown.toLocaleString()}</Text>
            <View style={styles.starRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.starSlot}>
                  <Image source={STAR} style={[styles.starEmpty]} />
                  <Animated.Image source={STAR} style={[styles.star, i < stars ? null : styles.starHidden, st[i]]} />
                </View>
              ))}
              <View style={styles.crownSlot}>
                <Text style={[styles.crownEmpty, crown && styles.crownGone]}>CROWN</Text>
                {crown ? <Animated.View style={[styles.crown, crownStyle]}><Text style={styles.crownText}>CROWN</Text></Animated.View> : null}
              </View>
            </View>
            {ratingWm ? (
              <Animated.Image source={WORDMARK_SRC[ratingWm][0]} style={[styles.rating, rateStyle]} resizeMode="contain" />
            ) : <Animated.Text style={[styles.ratingText, rateStyle]}>KEEP SWINGING</Animated.Text>}
          </View>
        </View>

        <Animated.View style={chipStyle}>
          <View style={styles.chips}>
            {chipsList.map((c) => (
              <View key={c.label} style={styles.chip}>
                <Text style={styles.chipLabel}>{c.label}</Text>
                <Text style={styles.chipValue}>{c.value}</Text>
              </View>
            ))}
          </View>
          {timing ? <Text style={styles.timing}>{timing.value}</Text> : null}
          {goal ? <Text style={styles.goal}>{`NEXT: ${goal}`}</Text> : null}
          {extras.ghost ? (
            <Text style={styles.ghost}>
              {extras.ghost.delta >= 0 ? `Beat ${extras.ghost.name} by ${extras.ghost.delta.toLocaleString()}` : `${(-extras.ghost.delta).toLocaleString()} short of ${extras.ghost.name}`}
            </Text>
          ) : null}
          {extras.daily ? (
            <View style={styles.daily}>
              <Text style={styles.dailyTitle}>DAILY FIRST BRAWL</Text>
              <Text style={styles.dailyBody}>{extras.dailyPaid ? 'Bonus coins and a material added' : 'First brawl of the day'}</Text>
            </View>
          ) : null}
          <View style={styles.book}>
            <Text style={styles.bookTitle}>STICKER BOOK</Text>
            <View style={styles.bookRow}>
              {STICKERS.map((id) => {
                const has = extras.stickers.indexOf(id) >= 0;
                const fresh = extras.freshStickers.indexOf(id) >= 0;
                return (
                  <View key={id} style={[styles.sticker, has && styles.stickerHas, fresh && styles.stickerNew]}>
                    <Image source={STICKER_ART[id]} style={[styles.stickerArt, !has && styles.stickerDim]} />
                    <Text style={styles.stickerName} numberOfLines={1}>{fresh ? 'NEW!' : STICKER_NAME[id]}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </Pressable>
      <View style={styles.actions}>
        {rematch ? (
          <Pressable accessibilityRole="button" onPress={rematch} style={[styles.btn, styles.fightBtn]}>
            <Text style={styles.fightText}>FIGHT AGAIN</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={claim} style={[styles.btn, styles.contBtn]}>
          <Text style={styles.contText}>{rematch ? 'Done' : 'Continue'}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const NAVY = '#1B2A4A';
const SHADOW = { textShadowColor: NAVY, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 };

const styles = StyleSheet.create({
  wrap: { width: '90%', maxWidth: 380, alignItems: 'center' },
  card: { width: '100%', backgroundColor: '#FFF8E4', borderRadius: 24, borderWidth: 4, borderColor: NAVY, paddingTop: 36, paddingBottom: 12, paddingHorizontal: 12 },
  ribbonWrap: { position: 'absolute', top: -34, left: 0, right: 0, alignItems: 'center', height: 70, justifyContent: 'center' },
  ribbon: { position: 'absolute', width: 300, height: 70 },
  ribbonText: { fontFamily: 'Shark', fontSize: 26, color: '#FFFFFF', marginTop: -8, maxWidth: 230, ...SHADOW },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  portrait: { width: 124, height: 124, borderRadius: 18, backgroundColor: '#9FE7F2', borderWidth: 3, borderColor: NAVY, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  scoreCol: { flex: 1, alignItems: 'center' },
  scoreLabel: { fontFamily: 'Knockout', fontSize: 13, color: '#0768B9', letterSpacing: 1 },
  score: { fontFamily: 'Shark', fontSize: 38, color: NAVY },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  starSlot: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  starEmpty: { position: 'absolute', width: 32, height: 32, opacity: 0.2, resizeMode: 'contain' },
  star: { width: 36, height: 36, resizeMode: 'contain' },
  starHidden: { opacity: 0 },
  crownSlot: { marginLeft: 4, minWidth: 64, height: 30, alignItems: 'center', justifyContent: 'center' },
  crownEmpty: { position: 'absolute', fontFamily: 'Shark', fontSize: 13, color: '#B8C4D6', borderWidth: 2, borderColor: '#B8C4D6', borderRadius: 10, paddingHorizontal: 6, borderStyle: 'dashed' },
  crownGone: { opacity: 0 },
  crown: { backgroundColor: '#7BD94A', borderRadius: 10, borderWidth: 3, borderColor: NAVY, paddingHorizontal: 6 },
  crownText: { fontFamily: 'Shark', fontSize: 14, color: '#FFFFFF', ...SHADOW },
  rating: { width: 170, height: 50, marginTop: 2 },
  ratingText: { fontFamily: 'Shark', fontSize: 20, color: NAVY, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
  chip: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 2, borderColor: NAVY, paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center', minWidth: 70 },
  chipLabel: { fontFamily: 'Knockout', fontSize: 10, color: '#0768B9', letterSpacing: 0.5 },
  chipValue: { fontFamily: 'Shark', fontSize: 15, color: NAVY },
  timing: { marginTop: 6, textAlign: 'center', fontFamily: 'Shark', fontSize: 14, color: NAVY },
  goal: { marginTop: 4, textAlign: 'center', fontFamily: 'Shark', fontSize: 15, color: '#FF6B5C' },
  ghost: { marginTop: 4, textAlign: 'center', fontFamily: 'Shark', fontSize: 14, color: '#0768B9' },
  daily: { marginTop: 8, alignSelf: 'center', backgroundColor: '#E8FBD9', borderRadius: 12, borderWidth: 2, borderColor: NAVY, paddingHorizontal: 10, paddingVertical: 3, alignItems: 'center' },
  dailyTitle: { fontFamily: 'Shark', fontSize: 15, color: NAVY },
  dailyBody: { fontFamily: 'Knockout', fontSize: 12, color: '#0768B9' },
  book: { marginTop: 8, alignItems: 'center' },
  bookTitle: { fontFamily: 'Knockout', fontSize: 11, color: '#0768B9', letterSpacing: 1 },
  bookRow: { flexDirection: 'row', gap: 6, marginTop: 3 },
  sticker: { width: 72, alignItems: 'center', borderRadius: 10, borderWidth: 2, borderColor: '#B8C4D6', borderStyle: 'dashed', paddingVertical: 3 },
  stickerHas: { borderStyle: 'solid', borderColor: NAVY, backgroundColor: '#FFFFFF' },
  stickerNew: { borderColor: '#7BD94A', borderWidth: 3 },
  stickerArt: { width: 30, height: 30, resizeMode: 'contain' },
  stickerDim: { opacity: 0.2 },
  stickerName: { fontFamily: 'Knockout', fontSize: 10, color: NAVY },
  actions: { width: '100%', marginTop: 10, gap: 8 },
  btn: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  fightBtn: { backgroundColor: '#EF4444' },
  fightText: { fontFamily: 'Shark', fontSize: 26, color: '#FFFFFF', textShadowColor: '#7A1010', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  contBtn: { backgroundColor: '#0768B9', height: 46 },
  contText: { fontFamily: 'Shark', fontSize: 20, color: '#FFFFFF' },
});
