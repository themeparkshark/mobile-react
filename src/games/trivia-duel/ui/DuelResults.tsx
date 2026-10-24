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
import React, { useEffect, useState } from 'react';
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

/** The shared results card blue (ResultsCard): one surface on every results card. */
const CARD_BLUE = '#0768b9';
/** Fin's lead on the loss gap bar (navy, never red). */
const GAP_NAVY = '#05346e';

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
  rank?: { label: string; progress: number; next: string | null; stripes?: number; nextStripes?: number | null; wins?: number; need?: number } | null;
  /** Points a missed Big Final took away (shown so right answers and a low score agree). */
  finalLost?: number;
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
  // The Best Moment polaroid leaves the tree once it has popped away. Left
  // mounted at scale 0 over the card, it drew the banners under it hollow
  // (FIN BEATEN and RANK UP lost their gold; NEW BEST, outside its box, kept it).
  const [polGone, setPolGone] = useState(!model.best || reducedMotion);

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
      const gone = setTimeout(() => setPolGone(true), beatMs * 2 + 1500 + 320);
      return () => clearTimeout(gone);
    } else {
      polS.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({ opacity: cardO.value, transform: [{ translateY: cardY.value }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  // Fin's lead is navy on a sky track (never a red "you lost" bar); it blinks
  // gold a few beats: that much more and you catch him.
  const gapStyle = useAnimatedStyle(() => ({ backgroundColor: gap.value > 0.5 ? C.gold : GAP_NAVY }));
  // Drops in centre for 1.5s, then pops away (never parked over the card's words).
  const polStyle = useAnimatedStyle(() => ({ opacity: polS.value > 0.02 ? 1 : 0, transform: [{ translateY: polY.value }, { scale: polS.value }, { rotate: '-6deg' }] }));
  // A lost ride challenge shows its right answers on the coin goal row instead.
  const rideGoal = model.ride && !model.ride.won && model.ride.need ? { right: Math.min(model.ride.right ?? 0, model.ride.need), need: model.ride.need } : null;
  const chips = duelChips(model.rows).filter((c) => !(rideGoal && c.label === 'RIGHT ANSWERS'));
  const finalLost = model.finalLost && model.finalLost > 0 ? model.finalLost : 0;
  const rankUp = model.banners.includes('RANK UP');

  const total = Math.max(1, model.myScore + model.oppScore);
  const fact = model.facts[0];
  const title = model.ride ? (model.ride.won ? 'RIDE COIN!' : 'GOOD TRY!')
    : model.practice ? (model.won ? 'PRACTICE WIN!' : 'GOOD PRACTICE!') : model.won ? 'YOU WIN!' : model.tie ? 'DEAD EVEN!' : 'GOOD GAME!';
  return (
    <View style={[styles.root, { height }]} pointerEvents="box-none">
      {/* The card hugs what it shows, anchored at the bottom like Sharky and
          Boss, so the stage acts above it (a fixed full height left an empty
          blue band under DONE on a loss). */}
      <Animated.View style={[styles.card, cardStyle]}>
        {/* The one results title every game shares: Alex's ribbon over the card's top edge. */}
        <ResultsRibbon title={title} reducedMotion={reducedMotion} style={styles.ribbonWrap} />
        <View style={styles.head}>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreMe}>{model.myScore}</Text>
            <Text style={styles.scoreVs}>vs</Text>
            <Text style={styles.scoreOpp}>{model.oppScore}</Text>
          </View>
        </View>
        {/* Right answers and a low score agree: the Big Final that missed is
            right there, as a picture (lightning, then a red arrow down to the
            points it took). No dice and no betting words on a kids' card. */}
        {finalLost ? <BigFinalLost points={finalLost} reducedMotion={reducedMotion} /> : null}
        {model.ride ? (
          <View style={styles.starRow}>
            {[1, 2, 3].map((k) => <StarPip key={k} on={k <= model.stars} i={k} reducedMotion={reducedMotion} />)}
          </View>
        ) : null}
        {/* The gap bar only when you scored: at 0 it would be all Fin, a bar
            that only says "you lost". The score and REMATCH say enough. */}
        {!model.ride && !model.won && model.myScore > 0 && model.oppScore > model.myScore ? (
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
        {/* Fin's rank, only after a win (a loss makes no rank progress, so it
            would be a bar that means nothing): today's hat, one fin per win
            needed (gold for each one won) and the bigger, gold-trimmed hat
            those wins unlock. */}
        {model.rank && rankUp ? <RankUpRow from={Math.max(0, (model.rank.stripes ?? 1) - 1)} to={model.rank.stripes ?? 1} label={model.rank.label} reducedMotion={reducedMotion} />
          : model.rank && model.won ? (
          <View style={styles.rankRow} accessible
            accessibilityLabel={model.rank.next ? `${model.rank.label} now. ${Math.max(0, (model.rank.need ?? 0) - (model.rank.wins ?? 0))} more wins to face ${model.rank.next}` : `${model.rank.label}, the top rank`}>
            <RankHat stripes={model.rank.stripes ?? 0} />
            <RankPips wins={model.rank.wins ?? Math.round(model.rank.progress * 3)} need={model.rank.next ? model.rank.need ?? 3 : 0} reducedMotion={reducedMotion} />
            {model.rank.next ? <RankHat stripes={model.rank.nextStripes ?? (model.rank.stripes ?? 0) + 1} big /> : <GameIcon name="crown" size={34} />}
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
            {/* The only way on (a ride challenge) is the big gold button, like every card.
                One exit word on every results card: DONE, and CONTINUE only
                when a reward is still to collect (a won ride coin). */}
            <Pressable style={[styles.btn, onRematch ? styles.secondary : styles.primary, onGhost ? styles.half : styles.full]} onPress={onContinue} accessibilityRole="button">
              <Text style={onRematch ? styles.secondaryText : styles.primaryText}>{model.ride?.won ? 'CONTINUE' : 'DONE'}</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
      {model.best && !polGone ? (
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
 * (gold for each right one) and the coin at the end, then NEXT TIME!. This
 * card cannot know whether a retry is on offer (the server decides after the
 * miss), so it never promises TRY AGAIN!: when a retry exists the ride try
 * card offers it next, otherwise DONE goes straight back to the map. The
 * dots pop in one by one, a small beat when the card lands.
 */
function CoinGoal({ right, need, reducedMotion }: { right: number; need: number; reducedMotion: boolean }) {
  return (
    <View style={styles.goal} accessible accessibilityLabel={`${right} of ${need} right answers. ${need} right answers win the coin. Next time!`}>
      <View style={styles.goalRow}>
        {Array.from({ length: need }, (_, k) => <GoalDot key={k} on={k < right} k={k} reducedMotion={reducedMotion} />)}
        <Text style={styles.goalEq}>=</Text>
        <Image source={ART.coin} style={styles.goalCoin} resizeMode="contain" />
      </View>
      <Text style={styles.goalText}>NEXT TIME!</Text>
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
  // The pop is on a wrapper, the colour on a plain view: a right answer is
  // always a solid gold dot, an empty one a darker blue (never white, which
  // reads as "filled" on the blue card).
  return <Animated.View style={st}><View style={[styles.goalDot, on ? styles.goalDotOn : styles.goalDotOff]} /></Animated.View>;
}

/**
 * Fin's captain hat with his rank's gold chevrons under it. The hat you are
 * winning toward is bigger and sits on a gold badge, so "that one is better"
 * reads with zero words.
 */
function RankHat({ stripes, big = false }: { stripes: number; big?: boolean }) {
  return (
    <View style={[styles.rankHat, big && styles.rankHatBig]}>
      <Image source={ART.hat} style={big ? styles.rankHatImgBig : styles.rankHatImg} resizeMode="contain" />
      <View style={styles.rankStripes}>
        {Array.from({ length: Math.max(0, Math.min(3, stripes)) }, (_, k) => <View key={k} style={[styles.rankStripe, big && styles.rankStripeBig]} />)}
      </View>
    </View>
  );
}

/** One fin per win the next hat needs: gold for each win so far. */
function RankPips({ wins, need, reducedMotion }: { wins: number; need: number; reducedMotion: boolean }) {
  if (need <= 0) return <View style={styles.rankPips} />;
  return (
    <View style={styles.rankPips}>
      {Array.from({ length: Math.min(need, 6) }, (_, k) => (
        <GoalPop key={k} k={k} reducedMotion={reducedMotion}>
          <View style={[styles.rankPip, k < wins && styles.rankPipOn]}>
            <GameIcon name="fin" size={need > 4 ? 16 : 20} mono={k < wins ? undefined : '#9cc9ec'} />
          </View>
        </GoalPop>
      ))}
    </View>
  );
}

function GoalPop({ k, reducedMotion, children }: { k: number; reducedMotion: boolean; children: React.ReactNode }) {
  const s = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    s.value = withDelay(650 + k * 140, withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 300 })));
  }, [s, k, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

/**
 * RANK UP, as a picture: the old hat, an arrow, and the new hat big on its
 * gold badge. The new hat pops in (gold) with a sparkle once the banners have
 * landed, so the biggest moment on the card is the one that moves. The fins
 * toward the next hat start again on the next win's card.
 */
function RankUpRow({ from, to, label, reducedMotion }: { from: number; to: number; label: string; reducedMotion: boolean }) {
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  const spark = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    pop.value = withDelay(1100, withSequence(withTiming(1.35, { duration: 140, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 7, stiffness: 280 })));
    spark.value = withDelay(1180, withSequence(withTiming(1, { duration: 160 }), withDelay(500, withTiming(0.7, { duration: 300 }))));
  }, [pop, spark, reducedMotion]);
  const popSt = useAnimatedStyle(() => ({ opacity: pop.value > 0.02 ? 1 : 0, transform: [{ scale: pop.value }] }));
  const sparkSt = useAnimatedStyle(() => ({ opacity: spark.value, transform: [{ scale: 0.6 + spark.value * 0.4 }] }));
  return (
    <View style={styles.rankRow} accessible accessibilityLabel={`Rank up! Fin is now ${label}`}>
      <View style={styles.rankUpOld}><RankHat stripes={from} /></View>
      <View style={styles.rankPips}>
        <GameIcon name="arrow" size={30} />
      </View>
      <Animated.View style={popSt}>
        <RankHat stripes={to} big />
        <Animated.View style={[styles.rankSparkL, sparkSt]} pointerEvents="none"><GameIcon name="sparkle" size={24} /></Animated.View>
        <Animated.View style={[styles.rankSparkR, sparkSt]} pointerEvents="none"><GameIcon name="sparkle" size={18} /></Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * The Big Final that missed: lightning, BIG FINAL, then a red pill with an
 * arrow pointing down at the points it took (no minus sign to work out, no
 * dice, no betting words). The full sentence is spoken.
 */
function BigFinalLost({ points, reducedMotion }: { points: number; reducedMotion: boolean }) {
  const drop = useSharedValue(reducedMotion ? 0 : -10);
  const o = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    o.value = withDelay(500, withTiming(1, { duration: 160 }));
    drop.value = withDelay(500, withSpring(0, { damping: 9, stiffness: 260 }));
  }, [o, drop, reducedMotion]);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: drop.value }] }));
  return (
    <View style={styles.finalLostPill} accessible accessibilityLabel={`The Big Final missed, so ${points.toLocaleString()} points went away`}>
      <GameIcon name="rush" size={22} />
      <Text style={styles.finalLostText}>BIG FINAL</Text>
      <Animated.View style={st}>
        <View style={styles.finalDrop}>
          <GameIcon name="arrow" size={20} style={styles.arrowDown} />
          <Text style={styles.finalDropText}>{points.toLocaleString()}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function Banner({ text, i, reducedMotion }: { text: string; i: number; reducedMotion: boolean }) {
  const sx = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    sx.value = withDelay(700 + i * 180, withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 300 })));
  }, [sx, i, reducedMotion]);
  // One even scale, like the rank fins and coin dots. The old squash and
  // stretch (scaleX against scaleY) drew FIN BEATEN and RANK UP hollow, with
  // no gold fill, on the current bundle. The pop rides a wrapper and the gold
  // sits on a plain view inside it.
  const st = useAnimatedStyle(() => ({ transform: [{ scale: sx.value }] }));
  return (
    <Animated.View style={[styles.bannerPop, st]}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{text}</Text>
      </View>
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
  // The one results surface every game shares: the blue card with a white border (ResultsCard, try card).
  card: { backgroundColor: CARD_BLUE, borderRadius: 24, borderWidth: 4, borderColor: '#ffffff', paddingHorizontal: 14, paddingTop: 42, paddingBottom: 10, marginTop: 34,
    shadowColor: '#05346e', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 18 },
  ribbonWrap: { position: 'absolute', top: -36, left: -14, right: -14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  scoreMe: { fontFamily: 'Shark', fontSize: 30, color: '#ffffff' },
  scoreVs: { fontFamily: 'Knockout', fontSize: 15, color: '#cdeaff', marginHorizontal: 8 },
  scoreOpp: { fontFamily: 'Shark', fontSize: 24, color: '#cdeaff' },
  gapTrack: { flexDirection: 'row', height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: C.ink, overflow: 'hidden', backgroundColor: '#bfe8ff', marginTop: 6 },
  gapMe: { backgroundColor: C.gold },
  gapSeg: { backgroundColor: GAP_NAVY },
  banners: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  bannerPop: { margin: 3 },
  banner: { backgroundColor: C.gold, borderWidth: 2.5, borderColor: C.ink, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  bannerText: { fontFamily: 'Shark', fontSize: 18, color: C.navy },
  near: { fontFamily: 'Knockout', fontSize: 18, color: '#ffffff', textAlign: 'center', marginTop: 6 },
  rows: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 },
  starRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginTop: 4 },
  rankRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  rankPips: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, marginHorizontal: 4 },
  rankPip: { width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, borderColor: '#05346e', backgroundColor: '#3d9be6', alignItems: 'center', justifyContent: 'center' },
  rankPipOn: { backgroundColor: '#ffffff' },
  rankUpOld: { opacity: 0.6 },
  rankSparkL: { position: 'absolute', left: -14, top: -10 },
  rankSparkR: { position: 'absolute', right: -10, bottom: -6 },
  fact: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2.5, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 6 },
  factText: { flex: 1, fontSize: 15, fontWeight: '700', color: C.navy },
  factLong: { fontSize: 14 },
  starPip: { marginHorizontal: 3, justifyContent: 'flex-end' },
  finalLostPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, marginTop: 4, backgroundColor: '#ffffff', borderRadius: 12,
    borderWidth: 2.5, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 2 },
  finalLostText: { fontFamily: 'Shark', fontSize: 16, color: C.navy },
  finalDrop: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: C.coral, borderRadius: 10, borderWidth: 2, borderColor: C.ink, paddingLeft: 2, paddingRight: 8, marginVertical: 2 },
  finalDropText: { fontFamily: 'Shark', fontSize: 16, color: '#ffffff' },
  arrowDown: { transform: [{ rotate: '90deg' }] },
  goal: { alignItems: 'center', marginTop: 6 },
  goalRow: { flexDirection: 'row', alignItems: 'center' },
  goalDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: '#05346e', marginHorizontal: 4 },
  goalDotOn: { backgroundColor: C.gold },
  goalDotOff: { backgroundColor: '#3d9be6' },
  goalEq: { fontFamily: 'Shark', fontSize: 24, color: '#ffffff', marginHorizontal: 6 },
  goalCoin: { width: 36, height: 36 },
  goalText: { fontFamily: 'Shark', fontSize: 20, color: '#ffffff', marginTop: 2 },
  rankHat: { width: 44, alignItems: 'center' },
  rankHatBig: { width: 64, paddingVertical: 3, borderRadius: 16, borderWidth: 3, borderColor: C.gold, backgroundColor: '#ffffff' },
  rankHatImg: { width: 38, height: 26 },
  rankHatImgBig: { width: 52, height: 34 },
  rankStripes: { flexDirection: 'row', gap: 3, height: 8, marginTop: 2 },
  rankStripe: { width: 9, height: 6, borderRadius: 2, backgroundColor: C.gold, borderWidth: 1.5, borderColor: C.ink },
  rankStripeBig: { width: 12, height: 8 },
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
