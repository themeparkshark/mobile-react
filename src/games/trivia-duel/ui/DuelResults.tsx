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
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { ART, C } from '../art';
import type { FactCard } from '../store';
import { ResultsRibbon } from '../../../gamekit/results/ResultsRibbon';
import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { playHaptic } from '../../../gamekit/Haptics';
import { ResultChip } from '../../../gamekit/results/ResultsCard';
import { feelingChips, type FeelingStat } from '../../../gamekit/results/feelings';
import GameIcon, { type GameIconName } from '../../../ui/GameIcon';
import countText from '../../../helpers/countText';
import { STAR_SLOT } from '../../../gamekit/results/starSlot';

/**
 * The polaroid sits this far above the card's top edge (root paddingBottom +
 * a gap clear of the ribbon). The ribbon rises 36 pt over the card's top and
 * slams to 1.25x, so the gap keeps the polaroid (tilted -6 deg) in clear sky.
 */
const POL_BOTTOM_PAD = 10;
const POL_GAP = 48;
/** The polaroid art's full size (pt). */
const POL_W = 200;
const POL_H = 152;
/** The score plate and the close button live this far under the safe top: the polaroid stays below them. */
const POL_TOP_RESERVE = 136;
/** How far the polaroid falls as it fades in (pt). */
const POL_DROP_PT = 36;

/**
 * How big the polaroid draws so it fits the sky between the score plate and
 * the ribbon (1 = full size, never under 0.6). `cardTopY` is the card's top
 * edge in window points (or null before layout: full size).
 */
export function polaroidScale(cardTopY: number | null, safeTop: number): number {
  if (cardTopY == null) return 1;
  const room = cardTopY - POL_GAP - (safeTop + POL_TOP_RESERVE);
  return Math.max(0.6, Math.min(1, room / POL_H));
}

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

/** Pictures for the duel's chips (the dots and the word already say it; the label is read aloud). */
const CHIP_ICONS: Record<string, GameIconName> = { 'RIGHT ANSWERS': 'check', 'BEST ANSWER': 'rush', 'IN A ROW': 'streak' };
export function duelChipIcon(label: string): GameIconName | undefined {
  return CHIP_ICONS[label];
}

/** The best answer speed as bolts: NICE 1, GREAT 2, LIGHTNING 3 (0 for anything else). */
export function speedBolts(word: string): number {
  const w = word.replace(/!/g, '').trim().toUpperCase();
  return w === 'LIGHTNING' ? 3 : w === 'GREAT' ? 2 : w === 'NICE' ? 1 : 0;
}

/** The speed chip leads with the picture: lit bolts out of 3, the word small under them. */
export function duelChipIconRow(label: string, value: string): { name: GameIconName; on: number; of: number } | undefined {
  if (label !== 'BEST ANSWER') return undefined;
  const on = speedBolts(value);
  return on > 0 ? { name: 'rush', on, of: 3 } : undefined;
}

/** Ride card star stamps: star k (1..3) pops at STAR_AT + k x STAR_GAP. */
export const RIDE_STAR_AT = 500;
export const RIDE_STAR_GAP = 220;
/**
 * When the ride card's title lands: right after its last earned star (the
 * same rule as Sharky and Boss), so GOOD TRY! or RIDE COIN! never gives the
 * star count away before the stars do. No stars, no wait.
 */
export function rideRibbonDelay(stars: number, reducedMotion: boolean): number {
  if (reducedMotion || stars <= 0) return 0;
  return RIDE_STAR_AT + Math.min(3, stars) * RIDE_STAR_GAP + 120;
}

/** The loss gap pulse plays this many beats, then rests. */
export const GAP_BEATS = 4;

/** Banner k pops at BANNER_AT + k x BANNER_GAP; the RANK UP badge at RANK_UP_AT. */
export const BANNER_AT = 700;
export const BANNER_GAP = 180;
export const RANK_UP_AT = 1100;
/** The ribbon's slam (1.25x, then the settle spring) takes about this long after it starts. */
export const RIBBON_SLAM_MS = 360;
/**
 * When the Best Moment polaroid drops: after the last star, the title
 * (YOU WIN! lands right after the last star), FIN BEATEN, NEW BEST and the
 * RANK UP badge have popped (it never lands while they do), and never before
 * two beats. It drops above the card, over the stage, so it covers no badge.
 */
export function polaroidAt(beatMs: number, banners: number, rankUp: boolean, stars = 0): number {
  const lastBanner = banners > 0 ? BANNER_AT + (banners - 1) * BANNER_GAP + 260 : 0;
  const lastRank = rankUp ? RANK_UP_AT + 420 : 0;
  const titleLanded = rideRibbonDelay(stars, false) + RIBBON_SLAM_MS;
  return Math.max(beatMs * 2, lastBanner, lastRank, titleLanded);
}

/** The Best Moment caption as a picture: the time alone ("0.4s"), read big beside a bolt. */
export function bestMomentTime(label: string): string | null {
  const m = /^(\d+(?:\.\d+)?)s\b/.exec(label.trim());
  return m ? `${m[1]}s` : null;
}

/** The polaroid's picture caption: the fastest answer's speed as 1 to 3 bolts (never a number to read). */
export function polaroidBolts(rows: readonly { label: string; value: string }[]): number {
  const word = rows.find((r) => r.label === 'Fastest answer')?.value ?? '';
  return Math.max(1, speedBolts(word));
}

/** What VoiceOver says for the Best Moment ("0.4s on Q2" -> "Best moment: 0.4 seconds on question 2"). */
export function bestMomentSpoken(label: string): string {
  return `Best moment: ${label.replace(/(\d+(?:\.\d+)?)s\b/, '$1 seconds').replace(/\bQ(\d+)/, 'question $1')}`;
}

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
  /** The card's real height once laid out (it hugs its content): the stage drops to stand on it. */
  onCardLayout?: (cardH: number) => void;
}

export function DuelResults({ model, beatMs, onRematch, onGhost, onContinue, reducedMotion, height, onCardLayout }: Props) {
  const cardY = useSharedValue(reducedMotion ? 0 : height + 40);
  const cardO = useSharedValue(reducedMotion ? 0 : 1);
  const pulse = useSharedValue(1);
  const gap = useSharedValue(0);
  // It drops a short way and fades in as it falls, so it never sweeps across the score plate.
  const polY = useSharedValue(-POL_DROP_PT);
  const polS = useSharedValue(1);
  // The Best Moment polaroid leaves the tree once it has popped away. Left
  // mounted at scale 0 over the card, it drew the banners under it hollow
  // (FIN BEATEN and RANK UP lost their gold; NEW BEST, outside its box, kept it).
  const [polGone, setPolGone] = useState(!model.best || reducedMotion);
  // The polaroid drops above the card (over the stage), never over its badges.
  const [cardH, setCardH] = useState(0);
  // Where the card's bottom sits in the window (the root has no transform), so
  // the polaroid can size itself to the sky between the score plate and the ribbon.
  const rootRef = useRef<View>(null);
  const [rootBottomY, setRootBottomY] = useState<number | null>(null);
  const polK = polaroidScale(rootBottomY == null || cardH <= 0 ? null : rootBottomY - POL_BOTTOM_PAD - cardH, initialWindowMetrics?.insets.top ?? 47);
  // A won duel always lights at least one star: a YOU WIN! over three empty
  // stars would read like a loss (duelStars gives every win 1 to 3).
  const stars = model.won && !model.ride ? Math.max(1, model.stars) : model.stars;
  // The polaroid waits for the stars and the title too, so the win's first look is YOU WIN!.
  const polAt = polaroidAt(beatMs, model.banners.length, model.banners.includes('RANK UP'), stars);

  useEffect(() => {
    if (reducedMotion) cardO.value = withTiming(1, { duration: 300 });
    else cardY.value = withDelay(beatMs, withSpring(0, { damping: 14, stiffness: 180 }));
    if (!model.won && !reducedMotion) {
      // A few beats, then rest: a card left open costs no frames.
      gap.value = withRepeat(withSequence(withTiming(1, { duration: beatMs }), withTiming(0, { duration: beatMs })), GAP_BEATS);
    }
    if (!reducedMotion && onRematch) pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: beatMs * 0.25 }), withTiming(1, { duration: beatMs * 0.75 })), 3);
    if (model.best && !reducedMotion) {
      // It eases down and stops dead: no bounce that could dip into the ribbon or the card.
      polY.value = withDelay(polAt, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }));
      // Then it pops away instead of tucking over the card's words.
      polS.value = withDelay(polAt + 1500, withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }));
      const gone = setTimeout(() => setPolGone(true), polAt + 1500 + 320);
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
  const polStyle = useAnimatedStyle(() => ({
    opacity: polS.value > 0.02 ? Math.min(1, Math.max(0, 1 + polY.value / POL_DROP_PT)) : 0,
    transform: [{ translateY: polY.value }, { scale: polS.value }, { rotate: '-6deg' }],
  }));
  // A lost ride challenge shows its right answers on the coin goal row instead.
  const rideGoal = model.ride && !model.ride.won && model.ride.need ? { right: Math.min(model.ride.right ?? 0, model.ride.need), need: model.ride.need } : null;
  const chips = duelChips(model.rows).filter((c) => !(rideGoal && c.label === 'RIGHT ANSWERS'));
  const rankUp = model.banners.includes('RANK UP');

  const total = Math.max(1, model.myScore + model.oppScore);
  const fact = model.facts[0];
  const title = model.ride ? (model.ride.won ? 'RIDE COIN!' : 'GOOD TRY!')
    : model.practice ? (model.won ? 'PRACTICE WIN!' : 'GOOD PRACTICE!') : model.won ? 'YOU WIN!' : model.tie ? 'DEAD EVEN!' : 'GOOD GAME!';
  return (
    <View ref={rootRef} style={[styles.root, { height }]} pointerEvents="box-none" onLayout={() => {
      rootRef.current?.measureInWindow((_x, y, _w, h) => { if (h > 0) setRootBottomY(Math.round(y + h)); });
    }}>
      {/* The card hugs what it shows, anchored at the bottom like Sharky and
          Boss, so the stage acts above it (a fixed full height left an empty
          blue band under DONE on a loss). */}
      <Animated.View style={[styles.card, cardStyle]} onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        setCardH(h);
        onCardLayout?.(h);
      }}>
        {/* The one results title every game shares: Alex's ribbon over the card's top edge.
            It waits for the last star, like Sharky, Whack and Boss. */}
        <ResultsRibbon title={title} reducedMotion={reducedMotion} style={styles.ribbonWrap} delayMs={rideRibbonDelay(stars, reducedMotion)} />
        <View style={styles.head}>
          {/* Same number style as the score plate above and every other card (countText: digits only). */}
          <View style={styles.scoreRow}>
            <Text style={styles.scoreMe}>{countText(model.myScore)}</Text>
            <Text style={styles.scoreVs}>vs</Text>
            <Text style={styles.scoreOpp}>{countText(model.oppScore)}</Text>
          </View>
        </View>
        {/* Every Duel card (Line Trivia, a duel, a ride challenge) stamps the same
            star row the other games do, so a win and a miss read as one family. */}
        <View style={styles.starRow} accessible accessibilityLabel={`${stars} of 3 stars`}>
          {[1, 2, 3].map((k) => <StarPip key={k} on={k <= stars} i={k} reducedMotion={reducedMotion} />)}
        </View>
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
            {chips.map((c) => <ResultChip key={c.label} label={c.label} value={c.value} pips={c.pips} icon={duelChipIcon(c.label)} iconRow={duelChipIconRow(c.label, c.value)} />)}
          </View>
        ) : null}
        {/* Fin's rank, only after a win (a loss makes no rank progress, so it
            would be a bar that means nothing): today's hat, one fin per win
            needed (gold for each one won) and the bigger, gold-trimmed hat
            those wins unlock. */}
        {model.rank && rankUp ? <RankUpRow from={Math.max(0, (model.rank.stripes ?? 1) - 1)} to={model.rank.stripes ?? 1} label={model.rank.label} reducedMotion={reducedMotion} />
          : model.rank && model.won && !model.rank.next ? <TopRankRow stripes={model.rank.stripes ?? 0} label={model.rank.label} reducedMotion={reducedMotion} />
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
      {/* It waits for the card's real height, so it never drops onto the card. */}
      {model.best && !polGone && cardH > 0 ? (
        <Animated.View style={[styles.polaroid, { bottom: POL_BOTTOM_PAD + cardH + POL_GAP }, polStyle]} pointerEvents="none"
          accessible accessibilityLabel={bestMomentSpoken(model.best.label)}>
          <Image source={ART.polaroid} style={{ width: POL_W * polK, height: POL_H * polK }} resizeMode="contain" />
          {/* A picture, not a number: the fastest answer as bolts (1 to 3, like the speed chip). The time is spoken. */}
          <View style={[styles.polCaption, { bottom: -6 * polK }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {Array.from({ length: polaroidBolts(model.rows) }, (_, i) => <GameIcon key={i} name="rush" size={Math.round(30 * polK)} />)}
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
    s.value = withDelay(RIDE_STAR_AT + i * RIDE_STAR_GAP, withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 300 })));
    // The same stamp every results card makes: one star sound per earned
    // star, each a step higher, with the star slam feel (the big one on 3).
    const t = setTimeout(() => {
      playHaptic(i === 3 ? 'bigStarSlam' : 'starSlam');
      GameAudio.play(GameAudio.hasCue('sh_star_slam') ? 'sh_star_slam' : 'fx.reveal', { pitch: (i - 1) * 2 });
    }, RIDE_STAR_AT + i * RIDE_STAR_GAP + 60);
    return () => clearTimeout(t);
  }, [on, i, s, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  // The same star every results card draws: pale blue until it is earned.
  return (
    <Animated.View style={[styles.starPip, st]}>
      <GameIcon name="star" size={i === 2 ? 46 : 38} mono={on ? undefined : STAR_SLOT} />
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
function RankHat({ stripes, big = false, dim = false, star = false, crown = false }: { stripes: number; big?: boolean; dim?: boolean; star?: boolean; crown?: boolean }) {
  return (
    <View style={[styles.rankHat, big && styles.rankHatBig, dim && styles.rankHatDim]}>
      {star ? <View style={styles.rankHatStar} pointerEvents="none"><GameIcon name="star" size={22} /></View> : null}
      {crown ? <View style={styles.rankHatCrown} pointerEvents="none"><GameIcon name="crown" size={30} /></View> : null}
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
 * Fin at his top rank: one centered gold badge (his hat with every stripe and
 * a gold crown on its corner), never a hat, an empty gap and a crown at the
 * far edges. It pops in with a sparkle like the RANK UP badge.
 */
function TopRankRow({ stripes, label, reducedMotion }: { stripes: number; label: string; reducedMotion: boolean }) {
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    pop.value = withDelay(RANK_UP_AT, withSequence(withTiming(1.25, { duration: 130, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 8, stiffness: 300 })));
  }, [pop, reducedMotion]);
  const st = useAnimatedStyle(() => ({ opacity: pop.value > 0.02 ? 1 : 0, transform: [{ scale: pop.value }] }));
  return (
    <View style={[styles.rankRow, styles.rankUpRow]} accessible accessibilityLabel={`${label}, the top rank`}>
      <Animated.View style={st}>
        <RankHat stripes={stripes} big crown />
        <View style={styles.rankSparkL} pointerEvents="none"><GameIcon name="sparkle" size={20} /></View>
      </Animated.View>
    </View>
  );
}

/**
 * RANK UP, as a picture a 7-year-old can point at: two badges the same size,
 * side by side in the middle of the card. The old one is pale (grey border,
 * fewer gold stripes); the new one is bright on a gold border with more gold
 * stripes and a gold star on its corner. The new badge pops in with sparkles
 * once the banners have landed, so the change itself is what moves.
 */
function RankUpRow({ from, to, label, reducedMotion }: { from: number; to: number; label: string; reducedMotion: boolean }) {
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  const spark = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    pop.value = withDelay(RANK_UP_AT, withSequence(withTiming(1.35, { duration: 140, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 7, stiffness: 280 })));
    spark.value = withDelay(RANK_UP_AT + 80, withSequence(withTiming(1, { duration: 160 }), withDelay(500, withTiming(0.7, { duration: 300 }))));
  }, [pop, spark, reducedMotion]);
  const popSt = useAnimatedStyle(() => ({ opacity: pop.value > 0.02 ? 1 : 0, transform: [{ scale: pop.value }] }));
  const sparkSt = useAnimatedStyle(() => ({ opacity: spark.value, transform: [{ scale: 0.6 + spark.value * 0.4 }] }));
  return (
    <View style={[styles.rankRow, styles.rankUpRow]} accessible accessibilityLabel={`Rank up! Fin is now ${label}`}>
      <RankHat stripes={from} big dim />
      <View style={styles.rankUpArrow}>
        <GameIcon name="arrow" size={30} />
      </View>
      <Animated.View style={popSt}>
        <RankHat stripes={to} big star />
        <Animated.View style={[styles.rankSparkL, sparkSt]} pointerEvents="none"><GameIcon name="sparkle" size={24} /></Animated.View>
        <Animated.View style={[styles.rankSparkR, sparkSt]} pointerEvents="none"><GameIcon name="sparkle" size={18} /></Animated.View>
      </Animated.View>
    </View>
  );
}

function Banner({ text, i, reducedMotion }: { text: string; i: number; reducedMotion: boolean }) {
  const sx = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    sx.value = withDelay(BANNER_AT + i * BANNER_GAP, withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 300 })));
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

/**
 * The Fact Card, folded: an info picture and FACT (NEW FACT the first time)
 * that opens the full sentence on a tap, so the card a kid reads is the
 * result, not a paragraph. The fact is read aloud either way, and Read on TPS
 * shows once it is open (in-app browser, UTM tagged).
 */
function FactRow({ card }: { card: FactCard & { isNew: boolean } }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Pressable style={[styles.fact, styles.factFolded]} onPress={() => setOpen(true)} accessibilityRole="button"
        accessibilityLabel={`${card.isNew ? 'New fact' : 'Fact'}: ${card.fact}`} hitSlop={6}>
        <GameIcon name="info" size={22} />
        <Text style={styles.factTag}>{card.isNew ? 'NEW FACT' : 'FACT'}</Text>
      </Pressable>
    );
  }
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
  rankUpRow: { justifyContent: 'center' },
  rankUpArrow: { marginHorizontal: 12 },
  rankHatDim: { borderColor: '#9cc9ec', backgroundColor: '#cfe3f5', opacity: 0.6 },
  rankHatStar: { position: 'absolute', right: -11, top: -11, zIndex: 2 },
  rankHatCrown: { position: 'absolute', right: -16, top: -16, zIndex: 2, transform: [{ rotate: '14deg' }] },
  rankSparkL: { position: 'absolute', left: -14, top: -10 },
  rankSparkR: { position: 'absolute', right: -10, bottom: -6 },
  fact: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2.5, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 6 },
  factFolded: { alignSelf: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 12 },
  factTag: { fontFamily: 'Shark', fontSize: 16, color: C.navy },
  factText: { flex: 1, fontSize: 15, fontWeight: '700', color: C.navy },
  factLong: { fontSize: 14 },
  starPip: { marginHorizontal: 3, justifyContent: 'flex-end' },
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
  polaroid: { position: 'absolute', alignSelf: 'center', alignItems: 'center' },
  // The time sits on its own white tag under the photos, so it reads on any art.
  polCaption: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#ffffff', borderRadius: 12,
    borderWidth: 2.5, borderColor: C.navy, paddingLeft: 4, paddingRight: 8 },
  polTime: { fontFamily: 'Shark', fontSize: 26, color: C.navy },
});
