/**
 * Duel results on stage (design 11.9, rev 7). The crown lands on your avatar
 * up on the stage; this half-height cream card slides up over the bottom 45%
 * while the stage keeps acting above it. Big result line, the score drums,
 * FIN BEATEN / RANK UP / NEW BEST banners or the near-miss line with the gap
 * bar, four 18pt stat rows, the Fin rank bar, the Best Moment polaroid that
 * drops in for 1.5s then tucks into the corner, one Fact Card row with Read
 * on TPS, and REMATCH (pulses on the beat) / PASS TO CREW / CONTINUE.
 */
import { openExternal } from '../../../services/external';
import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { ART, C } from '../art';
import type { FactCard } from '../store';
import { ResultsRibbon } from '../../../gamekit/results/ResultsRibbon';
import { ResultChip } from '../../../gamekit/results/ResultsCard';
import { feelingChips, type FeelingStat } from '../../../gamekit/results/feelings';
import GameIcon from '../../../ui/GameIcon';

/**
 * The duel's stat rows as the shared brag chips: right answers as gold dots
 * (only the ones earned), the best answer speed as a word, a real streak.
 * Seconds ("Fastest 1.4s") stay off the card: a kid reads dots, not timings.
 */
export function duelChips(rows: { label: string; value: string }[]): FeelingStat[] {
  const stats: FeelingStat[] = [];
  // A streak carried in from earlier duels is not this game's brag: "x6 IN A
  // ROW" next to 2 right answers reads as a mistake, so only a streak this
  // game could have made shows.
  const correct = parseInt(rows.find((r) => r.label.trim().toUpperCase() === 'CORRECT')?.value ?? '', 10) || 0;
  for (const r of rows) {
    const label = r.label.trim().toUpperCase();
    if (label === 'CORRECT') {
      const n = parseInt(r.value, 10) || 0;
      if (n > 0) stats.push({ label: 'RIGHT ANSWERS', value: String(n), pips: [n, n] });
    } else if (label === 'FASTEST ANSWER') {
      if (r.value && r.value !== 'NONE') stats.push({ label: 'BEST ANSWER', value: r.value.toUpperCase() });
    } else if (label === 'STREAK') {
      const n = parseInt(r.value, 10) || 0;
      if (n >= 3 && n <= correct) stats.push({ label: 'IN A ROW', value: `x${n}` });
    }
  }
  return feelingChips(stats);
}

/** The loss gap pulse plays this many beats, then rests. */
export const GAP_BEATS = 4;

export interface ResultsModel {
  won: boolean;
  tie: boolean;
  myScore: number;
  oppScore: number;
  oppName: string;
  banners: string[];
  nearMiss: string;
  rows: { label: string; value: string }[];
  facts: (FactCard & { isNew: boolean })[];
  stars: number;
  practice: boolean;
  /** Fin rank bar: label and progress toward the next rank (0..1), or null vs a ghost. */
  rank?: { label: string; progress: number; next: string | null; stripes?: number; nextStripes?: number | null } | null;
  /** Points a wrong Final bet took away (shown so right answers and a low score agree). */
  lostBet?: number;
  /** Best Moment: the fastest correct lock. */
  best?: { label: string } | null;
  /** Ride challenge: the coin line instead of the duel title. */
  ride?: { won: boolean; right?: number; need?: number } | null;
}

interface Props {
  model: ResultsModel;
  beatMs: number;
  onRematch?: () => void;
  onGhost?: () => void;
  onContinue: () => void;
  reducedMotion: boolean;
  /** Height of the card (the bottom 45% of the screen). */
  height: number;
}

export function DuelResults({ model, beatMs, onRematch, onGhost, onContinue, reducedMotion, height }: Props) {
  const cardY = useSharedValue(reducedMotion ? 0 : height + 40);
  const cardO = useSharedValue(reducedMotion ? 0 : 1);
  const pulse = useSharedValue(1);
  const gap = useSharedValue(0);
  const polY = useSharedValue(-300);
  const polS = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) cardO.value = withTiming(1, { duration: 300 });
    else cardY.value = withDelay(beatMs, withSpring(0, { damping: 14, stiffness: 180 }));
    if (!model.won && !reducedMotion) {
      // A few beats, then rest: a card left open costs no frames.
      gap.value = withRepeat(withSequence(withTiming(1, { duration: beatMs }), withTiming(0, { duration: beatMs })), GAP_BEATS);
    }
    if (!reducedMotion && onRematch) pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: beatMs * 0.25 }), withTiming(1, { duration: beatMs * 0.75 })), 3);
    if (model.best && !reducedMotion) {
      polY.value = withDelay(beatMs * 2, withSequence(
        withSpring(0, { damping: 10, stiffness: 220 }),
      ));
      // Then it pops away instead of tucking over the card's words.
      polS.value = withDelay(beatMs * 2 + 1500, withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }));
    } else {
      polS.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({ opacity: cardO.value, transform: [{ translateY: cardY.value }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const gapStyle = useAnimatedStyle(() => ({ backgroundColor: gap.value > 0.5 ? C.gold : C.coral }));
  // Drops in centre for 1.5s, then pops away (never parked over the card's words).
  const polStyle = useAnimatedStyle(() => ({ opacity: polS.value > 0.02 ? 1 : 0, transform: [{ translateY: polY.value }, { scale: polS.value }, { rotate: '-6deg' }] }));
  // A lost ride challenge shows its right answers on the coin goal row instead.
  const rideGoal = model.ride && !model.ride.won && model.ride.need ? { right: Math.min(model.ride.right ?? 0, model.ride.need), need: model.ride.need } : null;
  const chips = duelChips(model.rows).filter((c) => !(rideGoal && c.label === 'RIGHT ANSWERS'));
  const lostBet = model.lostBet && model.lostBet > 0 ? model.lostBet : 0;

  const total = Math.max(1, model.myScore + model.oppScore);
  const fact = model.facts[0];
  const title = model.ride ? (model.ride.won ? 'RIDE COIN!' : 'GOOD TRY!')
    : model.practice ? (model.won ? 'PRACTICE WIN!' : 'GOOD PRACTICE!') : model.won ? 'YOU WIN!' : model.tie ? 'DEAD EVEN!' : 'GOOD GAME!';
  return (
    <View style={[styles.root, { height }]} pointerEvents="box-none">
      <Animated.View style={[styles.card, { minHeight: model.ride ? undefined : height - 8 }, cardStyle]}>
        {/* The one results title every game shares: Alex's ribbon over the card's top edge. */}
        <ResultsRibbon title={title} reducedMotion={reducedMotion} style={styles.ribbonWrap} />
        <View style={styles.head}>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreMe}>{model.myScore}</Text>
            <Text style={styles.scoreVs}>vs</Text>
            <Text style={styles.scoreOpp}>{model.oppScore}</Text>
          </View>
        </View>
        {/* Right answers and a low score agree: the Final bet that missed is right there. */}
        {lostBet ? (
          <View style={styles.betLost} accessible accessibilityLabel={`Your Final bet missed, so ${lostBet} points went away`}>
            <GameIcon name="dice" size={20} />
            <Text style={styles.betLostText}>{`FINAL BET  -${lostBet.toLocaleString()}`}</Text>
          </View>
        ) : null}
        {model.ride ? (
          <View style={styles.starRow}>
            {[1, 2, 3].map((k) => <StarPip key={k} on={k <= model.stars} i={k} reducedMotion={reducedMotion} />)}
          </View>
        ) : null}
        {!model.ride && !model.won && model.oppScore > model.myScore ? (
          <View style={styles.gapTrack}>
            <View style={[styles.gapMe, { flex: model.myScore / total }]} />
            <Animated.View style={[styles.gapSeg, { flex: (model.oppScore - model.myScore) / total }, gapStyle]} />
            <View style={{ flex: model.myScore / total }} />
          </View>
        ) : null}
        {model.banners.length ? (
          <View style={styles.banners}>
            {model.banners.map((b, i) => <Banner key={b} text={b} i={i} reducedMotion={reducedMotion} />)}
          </View>
        ) : null}
        {rideGoal ? <CoinGoal right={rideGoal.right} need={rideGoal.need} reducedMotion={reducedMotion} />
          : (model.ride ? !model.ride.won : !model.won) && model.nearMiss ? (
            <Text style={styles.near} numberOfLines={1} adjustsFontSizeToFit>{model.nearMiss}</Text>
          ) : null}
        {chips.length ? (
          <View style={styles.rows}>
            {chips.map((c) => <ResultChip key={c.label} label={c.label} value={c.value} pips={c.pips} />)}
          </View>
        ) : null}
        {model.rank ? (
          // Fin's hat at each end (more gold stripes = a tougher Fin), so the bar reads without the words.
          <View style={styles.rankRow} accessible
            accessibilityLabel={model.rank.next ? `${model.rank.label} now. Win more to face ${model.rank.next}` : `${model.rank.label}, the top rank`}>
            <RankHat stripes={model.rank.stripes ?? 0} />
            <View style={styles.rankTrack}><View style={[styles.rankFill, { width: `${Math.round(model.rank.progress * 100)}%` }]} /></View>
            {model.rank.next ? <RankHat stripes={model.rank.nextStripes ?? (model.rank.stripes ?? 0) + 1} /> : <GameIcon name="crown" size={30} />}
          </View>
        ) : null}
        {fact ? <FactRow card={fact} /> : null}
        <View style={styles.buttons}>
          {onRematch ? (
            <Animated.View style={pulseStyle}>
              <Pressable style={[styles.btn, styles.primary]} onPress={onRematch} accessibilityRole="button">
                <Text style={styles.primaryText}>REMATCH</Text>
              </Pressable>
            </Animated.View>
          ) : null}
          <View style={styles.btnRow}>
            {onGhost ? (
              <Pressable style={[styles.btn, styles.secondary, styles.half]} onPress={onGhost} accessibilityRole="button">
                <Text style={styles.secondaryText}>PASS TO CREW</Text>
              </Pressable>
            ) : null}
            {/* The only way on (a ride challenge) is the big gold button, like every card. */}
            <Pressable style={[styles.btn, onRematch ? styles.secondary : styles.primary, onGhost ? styles.half : styles.full]} onPress={onContinue} accessibilityRole="button">
              <Text style={onRematch ? styles.secondaryText : styles.primaryText}>CONTINUE</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
      {model.best ? (
        <Animated.View style={[styles.polaroid, polStyle]} pointerEvents="none">
          <Image source={ART.polaroid} style={styles.polImg} resizeMode="contain" />
          <View style={styles.polCaption}>
            <Text style={styles.polTitle}>BEST MOMENT</Text>
            <Text style={styles.polText}>{model.best.label}</Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function StarPip({ on, i, reducedMotion }: { on: boolean; i: number; reducedMotion: boolean }) {
  const s = useSharedValue(reducedMotion || !on ? 1 : 0);
  useEffect(() => {
    if (!on || reducedMotion) return;
    s.value = withDelay(500 + i * 220, withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 300 })));
  }, [on, i, s, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  // The same star every results card draws: pale blue until it is earned.
  return (
    <Animated.View style={[styles.starPip, st]}>
      <GameIcon name="star" size={i === 2 ? 46 : 38} mono={on ? undefined : '#9cc9ec'} />
    </Animated.View>
  );
}

/**
 * Two right answers win the coin, as pictures: one dot per answer needed
 * (gold for each right one) and the coin at the end, then TRY AGAIN!. The
 * dots pop in one by one, a small beat when the card lands.
 */
function CoinGoal({ right, need, reducedMotion }: { right: number; need: number; reducedMotion: boolean }) {
  return (
    <View style={styles.goal} accessible accessibilityLabel={`${right} of ${need} right answers. ${need} right answers win the coin. Try again!`}>
      <View style={styles.goalRow}>
        {Array.from({ length: need }, (_, k) => <GoalDot key={k} on={k < right} k={k} reducedMotion={reducedMotion} />)}
        <Text style={styles.goalEq}>=</Text>
        <Image source={ART.coin} style={styles.goalCoin} resizeMode="contain" />
      </View>
      <Text style={styles.goalText}>TRY AGAIN!</Text>
    </View>
  );
}

function GoalDot({ on, k, reducedMotion }: { on: boolean; k: number; reducedMotion: boolean }) {
  const s = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    s.value = withDelay(450 + k * 180, withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 300 })));
  }, [s, k, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[styles.goalDot, on && styles.goalDotOn, st]} />;
}

/** Fin's captain hat with his rank's gold stripes under it. */
function RankHat({ stripes }: { stripes: number }) {
  return (
    <View style={styles.rankHat}>
      <Image source={ART.hat} style={styles.rankHatImg} resizeMode="contain" />
      <View style={styles.rankStripes}>
        {Array.from({ length: Math.max(0, Math.min(3, stripes)) }, (_, k) => <View key={k} style={styles.rankStripe} />)}
      </View>
    </View>
  );
}

function Banner({ text, i, reducedMotion }: { text: string; i: number; reducedMotion: boolean }) {
  const sx = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    sx.value = withDelay(700 + i * 180, withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 300 })));
  }, [sx, i, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleX: sx.value }, { scaleY: 2 - Math.max(0.6, Math.min(1.25, sx.value)) }] }));
  return (
    <Animated.View style={[styles.banner, st]}>
      <Text style={styles.bannerText}>{text}</Text>
    </Animated.View>
  );
}

/** One Fact Card row (15pt) with Read on TPS (in-app browser, UTM tagged). */
function FactRow({ card }: { card: FactCard & { isNew: boolean } }) {
  return (
    <View style={styles.fact}>
      {/* Wraps to as many lines as it needs (shrinking a little first): a fact is never cut mid-word. */}
      <Text style={[styles.factText, card.fact.length > 90 && styles.factLong]} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.8}>{card.fact}</Text>
      {card.tpsArticleUrl ? (
        <Pressable
          onPress={() => { void openExternal(`${card.tpsArticleUrl}${card.tpsArticleUrl!.includes('?') ? '&' : '?'}utm_source=app&utm_medium=trivia`); }}
          style={styles.readBtn}
          accessibilityRole="link"
          hitSlop={8}
        >
          <Text style={styles.readText}>Read on TPS</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', paddingHorizontal: 10, paddingBottom: 10 },
  card: { backgroundColor: C.cream, borderRadius: 24, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 7, paddingHorizontal: 14, paddingTop: 42, paddingBottom: 10, marginTop: 34 },
  ribbonWrap: { position: 'absolute', top: -36, left: -14, right: -14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  scoreMe: { fontFamily: 'Shark', fontSize: 30, color: C.navy },
  scoreVs: { fontFamily: 'Knockout', fontSize: 15, color: C.navy, opacity: 0.6, marginHorizontal: 8 },
  scoreOpp: { fontFamily: 'Shark', fontSize: 24, color: C.navy, opacity: 0.6 },
  gapTrack: { flexDirection: 'row', height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: C.ink, overflow: 'hidden', backgroundColor: '#ffffff', marginTop: 6 },
  gapMe: { backgroundColor: C.gold },
  gapSeg: { backgroundColor: C.coral },
  banners: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  banner: { backgroundColor: C.gold, borderWidth: 2.5, borderColor: C.ink, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, margin: 3 },
  bannerText: { fontFamily: 'Shark', fontSize: 18, color: C.navy },
  near: { fontFamily: 'Knockout', fontSize: 18, color: C.navy, textAlign: 'center', marginTop: 6 },
  rows: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 },
  starRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginTop: 4 },
  rankRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  rankTrack: { flex: 1, marginHorizontal: 6, height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: C.ink, backgroundColor: '#ffffff', overflow: 'hidden' },
  rankFill: { height: '100%', backgroundColor: C.blue },
  fact: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2.5, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 6 },
  factText: { flex: 1, fontSize: 15, fontWeight: '700', color: C.navy },
  factLong: { fontSize: 14 },
  starPip: { marginHorizontal: 3, justifyContent: 'flex-end' },
  betLost: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, marginTop: 4, backgroundColor: '#ffffff', borderRadius: 12,
    borderWidth: 2.5, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 2 },
  betLostText: { fontFamily: 'Shark', fontSize: 16, color: C.navy },
  goal: { alignItems: 'center', marginTop: 6 },
  goalRow: { flexDirection: 'row', alignItems: 'center' },
  goalDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 3, borderColor: C.ink, backgroundColor: '#ffffff', marginHorizontal: 4 },
  goalDotOn: { backgroundColor: C.gold },
  goalEq: { fontFamily: 'Shark', fontSize: 24, color: C.navy, marginHorizontal: 6 },
  goalCoin: { width: 36, height: 36 },
  goalText: { fontFamily: 'Shark', fontSize: 20, color: C.navy, marginTop: 2 },
  rankHat: { width: 44, alignItems: 'center' },
  rankHatImg: { width: 40, height: 28 },
  rankStripes: { flexDirection: 'row', gap: 2, height: 5, marginTop: 1 },
  rankStripe: { width: 8, height: 4, borderRadius: 2, backgroundColor: C.gold, borderWidth: 1, borderColor: C.ink },
  readBtn: { marginLeft: 8, backgroundColor: C.blue, borderRadius: 8, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 8, paddingVertical: 3 },
  readText: { fontFamily: 'Knockout', fontSize: 13, color: '#ffffff' },
  buttons: { marginTop: 4 },
  btn: { height: 56, borderRadius: 16, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 6, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primary: { backgroundColor: C.gold },
  primaryText: { fontFamily: 'Shark', fontSize: 24, color: C.navy },
  secondary: { backgroundColor: '#ffffff' },
  secondaryText: { fontFamily: 'Shark', fontSize: 17, color: C.navy },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48.5%' },
  full: { width: '100%' },
  polaroid: { position: 'absolute', alignSelf: 'center', top: 0, alignItems: 'center' },
  polImg: { width: 200, height: 152 },
  polCaption: { position: 'absolute', bottom: 18, alignItems: 'center' },
  polTitle: { fontFamily: 'Shark', fontSize: 14, color: C.navy },
  polText: { fontFamily: 'Knockout', fontSize: 16, color: C.navy },
});
