/**
 * The Collections page, rethought (Dustin, Oct 8: "I don't understand everything I'm looking at").
 * One hierarchy, top to bottom, each fact said once:
 *   1. Shelf: every set as a cover card with its count, a gift when a prize is ready, gold when finished.
 *   2. This set: its name, "9 of 40 found" with one bar, the next goal in words, when its finds are on the
 *      map, and a labeled "Hunt this set" switch.
 *   3. Prizes: one row per prize ("Find 8", "Find all 40") with the prizes in icons plus words, the title
 *      shown up front, and the state in words (Claim!, Got it, 5 to go).
 *   4. Your finds: a three-item key (found, still to find, extras), then the finds grouped by rarity under
 *      a heading that names the rarity, so the colors explain themselves.
 * The page sits on the Standings underwater art with a cream sheet under the shelf (the same calm look as
 * Standings). Every move runs on the UI thread; Reduce Motion swaps moves for fades or stills.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { playSfx } from '../../gamekit/SFX';
import * as Haptics from '../../helpers/haptics';
import { BRAND, GameButton, GameIcon, SHADOW, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { GIFT, setBadge, SpringPress } from './DexParts';
import { RarityGems, rarityLook } from './dexLook';
import {
  hasClaimable, openNow, prizeChips, prizeList, prizeState, progressFraction, rarityHint, whenLine,
  type DexItem, type DexReward, type DexSet,
} from './dexModel';
import type { EventCard } from './eventCards';

export const BOOK_BG = require('../../../assets/images/screens/leaderboard/standings-bg.png');
/** The sheet under the shelf: Standings cream. */
export const SHEET = BRAND.cream;
/** An empty sticker slot printed in the album. */
const SLOT = '#f1e4c0';
const SLOT_EDGE = '#dcc78f';
const SLOT_INK = '#cdb47a';

export const SHELF_CARD_W = 104;
export const SHELF_CARD_H = 142;
export const SHELF_GAP = 12;

const STATE_WORDS = { claim: 'Prize ready!', done: 'Finished!' } as const;

/** One set on the shelf: the cover, the name, and its count. A gift when a prize is ready, gold when finished. */
export const ShelfCard = memo(function ShelfCard({ set, selected, onPress }: {
  readonly set: DexSet; readonly selected: boolean; readonly onPress: (slug: string) => void;
}) {
  const reduced = useUiReducedMotion();
  const claim = hasClaimable(set);
  const finished = set.reward.status === 'claimed' || set.reward.status === 'pending';
  const [badgeFailed, setBadgeFailed] = useState(false);
  const lift = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    lift.value = reduced ? withTiming(selected ? 1 : 0, { duration: 150 }) : withSpring(selected ? 1 : 0, { damping: 11, stiffness: 220 });
  }, [selected, reduced, lift]);
  const liftStyle = useAnimatedStyle(() => (reduced ? { opacity: 0.88 + 0.12 * lift.value } : {
    opacity: 0.88 + 0.12 * lift.value,
    transform: [{ translateY: -5 * lift.value }, { scale: 0.95 + 0.05 * lift.value }],
  }));
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!claim || reduced) { bob.value = 0; return; }
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0, { duration: 420 })), -1, false);
  }, [claim, reduced, bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * bob.value }, { rotate: `${-8 + 8 * bob.value}deg` }] }));
  const fraction = progressFraction(set);
  return (
    <SpringPress onPress={() => onPress(set.slug)} accessibilityState={{ selected }}
      accessibilityLabel={`${set.name}, ${set.found} of ${set.total} found${claim ? ', prize ready' : ''}${finished ? ', finished' : ''}${set.focused ? ', you are hunting this set' : ''}`}
      style={{ marginRight: SHELF_GAP }}>
      <Animated.View style={liftStyle}>
        <View style={[styles.cardRing, selected && styles.cardRingOn]}>
          <View style={[styles.cardFace, { backgroundColor: set.color }, finished && styles.cardFaceGold]}>
            <View style={styles.cardLower} />
            <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
            <View style={styles.cardWell}>
              <Image source={badgeFailed ? GIFT : setBadge(set)} style={styles.cardBadge} contentFit="contain" onError={() => setBadgeFailed(true)} />
            </View>
            <Text numberOfLines={2} style={styles.cardName} maxFontSizeMultiplier={1.15}>{set.name}</Text>
            <View style={styles.cardCount}>
              <View style={styles.cardTrack}>
                <View style={[styles.cardFill, { width: `${Math.max(fraction > 0 ? 6 : 0, fraction * 100)}%` }, finished && { backgroundColor: BRAND.gold }]} />
              </View>
              <Text style={styles.cardCountText} maxFontSizeMultiplier={1.15}>{set.found}/{set.total}</Text>
            </View>
          </View>
        </View>
        {set.focused && <View style={styles.cardHunt}><GameIcon name="search" size={18} /></View>}
        {claim && <Animated.View style={[styles.cardPrize, bobStyle]}><GameIcon name="gift" size={26} /></Animated.View>}
        {finished && !claim && <View style={styles.cardPrize}><GameIcon name="star" size={24} /></View>}
      </Animated.View>
    </SpringPress>
  );
});

/** An Events card on the same shelf (after the sets): night colors, the event art, done of total haunts. */
export const ShelfEventCard = memo(function ShelfEventCard({ card, onPress }: {
  readonly card: EventCard; readonly onPress: (card: EventCard) => void;
}) {
  const [artFailed, setArtFailed] = useState(false);
  const fraction = card.total > 0 ? card.done / card.total : 0;
  return (
    <SpringPress onPress={() => onPress(card)} style={{ marginRight: SHELF_GAP }}
      accessibilityLabel={`${card.cardTitle}, ${card.done} of ${card.total} haunts`}>
      <View style={styles.cardRing}>
        <View style={[styles.cardFace, styles.eventFace, card.tenInOne && styles.cardFaceGold]}>
          <LinearGradient colors={['#2b1f5c', '#0f1636']} style={StyleSheet.absoluteFill} />
          <View style={[styles.cardWell, styles.eventWell]}>
            {card.art && !artFailed
              ? <Image source={{ uri: card.art }} style={styles.cardBadge} contentFit="contain" onError={() => setArtFailed(true)} />
              : <GameIcon name="moon" size={36} />}
          </View>
          <Text numberOfLines={2} style={styles.cardName} maxFontSizeMultiplier={1.15}>{card.cardTitle}</Text>
          <View style={styles.cardCount}>
            <View style={styles.cardTrack}><View style={[styles.cardFill, { width: `${fraction * 100}%`, backgroundColor: '#9df0c2' }]} /></View>
            <Text style={styles.cardCountText} maxFontSizeMultiplier={1.15}>{card.done}/{card.total}</Text>
          </View>
        </View>
      </View>
    </SpringPress>
  );
});

/** Today's rare find, only while it is worth a trip. */
export function RareBanner({ onPress }: { readonly onPress: () => void }) {
  return (
    <SpringPress onPress={onPress} accessibilityLabel="A rare find is out today. Open the map." style={styles.rare}>
      <GameIcon name="sparkle" size={28} />
      <Text style={styles.rareText} numberOfLines={1} maxFontSizeMultiplier={1.2}>A rare find is out today!</Text>
      <View style={styles.rareGo}><Text style={styles.rareGoText} maxFontSizeMultiplier={1.2}>Find it</Text></View>
    </SpringPress>
  );
}

/** The next goal in words, under the count. */
export function nextGoal(set: DexSet): string {
  if (hasClaimable(set)) return 'A prize is ready! Claim it below.';
  const finished = set.reward.status === 'claimed' || set.reward.status === 'pending';
  if (finished || set.isComplete) return 'You found them all!';
  const next = prizeList(set).map(entry => entry.reward).find(reward => reward.status === 'locked');
  if (!next) return `${Math.max(0, set.total - set.found)} more to find`;
  const toGo = Math.max(1, next.target - set.found);
  return `Find ${toGo} more for your next prize`;
}

/** The open set: name, count with one bar, next goal, when it is on the map, and the hunt switch. */
export function BookHeader({ set, onFocus, focusBusy, stamp }: {
  readonly set: DexSet; readonly onFocus: (() => void) | null; readonly focusBusy: boolean;
  /** A title just won: stamps onto the header after the reveal closes. */
  readonly stamp?: string | null;
}) {
  const reduced = useUiReducedMotion();
  const enter = useSharedValue(0);
  const fill = useSharedValue(0);
  const fraction = progressFraction(set);
  useEffect(() => {
    enter.value = 0;
    enter.value = reduced ? withTiming(1, { duration: 150 }) : withSpring(1, { damping: 14, stiffness: 200 });
  }, [set.slug, reduced, enter]);
  useEffect(() => {
    fill.value = reduced ? fraction : withTiming(fraction, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [fraction, reduced, fill]);
  const enterStyle = useAnimatedStyle(() => (reduced ? { opacity: enter.value }
    : { opacity: enter.value, transform: [{ translateY: (1 - enter.value) * 10 }] }));
  // scaleX on a full-width bar: no layout work per frame.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, fill.value) }] }));
  const finished = set.reward.status === 'claimed' || set.reward.status === 'pending';
  const open = openNow(set);
  const when = whenLine(set);
  const goal = nextGoal(set);
  const [badgeFailed, setBadgeFailed] = useState(false);
  return (
    <Animated.View style={[styles.header, enterStyle]}>
      <View style={styles.headerTop}>
        <View style={[styles.headerBadge, { borderColor: finished ? BRAND.gold : set.color }]}>
          <Image source={badgeFailed ? GIFT : setBadge(set)} style={styles.headerBadgeArt} contentFit="contain" onError={() => setBadgeFailed(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} accessibilityRole="header"
            maxFontSizeMultiplier={1.2}>{set.name}</Text>
          <View accessible accessibilityLabel={`${set.found} of ${set.total} found. ${goal}`}>
            <Text style={styles.headerCount} maxFontSizeMultiplier={1.3}>
              <Text style={styles.headerCountBig}>{set.found}</Text> of {set.total} found
            </Text>
            <View style={styles.headerTrack}>
              <Animated.View style={[styles.headerFill, { backgroundColor: finished ? BRAND.gold : set.color }, fillStyle]} />
            </View>
          </View>
        </View>
      </View>
      <View style={[styles.goal, hasClaimable(set) && styles.goalReady, finished && styles.goalDone]}>
        <GameIcon name={hasClaimable(set) ? 'gift' : finished ? 'trophy' : 'star'} size={24} />
        <Text style={styles.goalText} maxFontSizeMultiplier={1.3}>{goal}</Text>
      </View>
      <View style={styles.headerRow}>
        <View style={styles.when} accessible accessibilityLabel={`${when}${open === false ? '. Not right now' : open ? '. On now' : ''}`}>
          <GameIcon name={whenIcon(set)} size={24} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.whenText} numberOfLines={2} maxFontSizeMultiplier={1.25}>{when}</Text>
            {open != null && (
              <View style={styles.whenNow}>
                <View style={[styles.dot, { backgroundColor: open ? BRAND.green : '#9fb0c4' }]} />
                <Text style={styles.whenNowText} maxFontSizeMultiplier={1.25}>{open ? 'On now' : 'Not right now'}</Text>
              </View>
            )}
          </View>
        </View>
        {onFocus && (
          <SpringPress onPress={onFocus} disabled={focusBusy} accessibilityState={{ selected: set.focused }}
            accessibilityLabel={set.focused ? 'Hunting this set. Its finds show up more on your map. Tap to stop.' : 'Hunt this set. Its finds will show up more on your map.'}
            style={[styles.hunt, set.focused && styles.huntOn, focusBusy && { opacity: 0.6 }]}>
            <GameIcon name={set.focused ? 'check' : 'search'} size={22} />
            <Text style={styles.huntText} maxFontSizeMultiplier={1.2}>{set.focused ? 'Hunting' : 'Hunt this set'}</Text>
          </SpringPress>
        )}
      </View>
      {!!stamp && <TitleStamp key={stamp} text={stamp} reduced={reduced} />}
    </Animated.View>
  );
}

function whenIcon(set: Pick<DexSet, 'spawnHint' | 'status'>): GameIconName {
  if (set.status === 'upcoming') return 'timer';
  if (set.status === 'retired') return 'star';
  const text = (set.spawnHint ?? '').toLowerCase();
  if (/sunset|night|evening|dark|moon/.test(text)) return 'moon';
  if (/rain|hot|cold|snow|wind|weather|sunny|cloud/.test(text)) return 'sparkle';
  if (/\d|weekend|day|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep/.test(text) && !/^anytime/.test(text)) return 'timer';
  return 'map';
}

function TitleStamp({ text, reduced }: { readonly text: string; readonly reduced: boolean }) {
  const t = useSharedValue(reduced ? 1 : 1.6);
  useEffect(() => {
    // Slams from 1.6 to 1 with a thud and a heavy haptic.
    const timer = setTimeout(() => {
      playSfx('fx.hit', 0.8);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    }, reduced ? 0 : 170);
    if (!reduced) t.value = withSequence(withTiming(1, { duration: 170, easing: Easing.in(Easing.quad) }), withSequence(withTiming(1.06, { duration: 70 }), withSpring(1, { damping: 8, stiffness: 300 })));
    return () => clearTimeout(timer);
  }, [reduced, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: t.value }, { rotate: '-6deg' }] }));
  return (
    // The transform lives on a bare wrapper: iOS left a stale scaled copy of the bordered plate when both shared one view.
    <Animated.View style={[styles.titleStampWrap, style]} accessible accessibilityLabel={`New title: ${text}`}>
      <View style={styles.titleStamp}>
        <GameIcon name="crown" size={22} />
        <Text style={styles.titleStampText} numberOfLines={1}>{text}</Text>
      </View>
    </Animated.View>
  );
}

/** Prize chips with words: "+15 Energy", "+1 Ticket", "+30 XP", the title in its own gold chip. */
export function PrizeChips({ reward }: { readonly reward: DexReward }) {
  const chips = prizeChips(reward);
  if (chips.length === 0) return <Text style={styles.chipText}>A surprise</Text>;
  return (
    <View style={styles.chips}>
      {chips.map(chip => {
        const title = chip.icon === 'crown';
        const words = chip.icon === 'energy' ? `${chip.value} Energy` : chip.icon === 'ticket' ? `${chip.value} ${chip.label.endsWith('Ticket') ? 'Ticket' : 'Tickets'}`
          : chip.icon === 'xp' ? `${chip.value} XP` : chip.icon === 'coins' ? `${chip.value} Coins` : chip.value;
        return (
          <View key={chip.icon} style={[styles.chip, title && styles.chipTitle]}>
            <GameIcon name={chip.icon} size={20} />
            <Text style={[styles.chipText, title && styles.chipTitleText]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {title ? `Title: ${chip.value}` : words}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Every prize for the set, one row each, in target order. */
export function PrizeRows({ set, busyId, onClaim, titleWorn, titleBusy, onTitle, popKey }: {
  readonly set: DexSet; readonly busyId: string | null; readonly onClaim: (reward: DexReward) => void;
  readonly titleWorn: boolean; readonly titleBusy: boolean; readonly onTitle: (() => void) | null; readonly popKey: number;
}) {
  const reduced = useUiReducedMotion();
  const pop = useSharedValue(1);
  useEffect(() => {
    if (popKey === 0 || reduced) return;
    pop.value = withSequence(withTiming(1.04, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 220 }));
  }, [popKey, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Animated.View style={[styles.prizes, popStyle]}>
      <SectionTitle icon="gift" text="Prizes" />
      {prizeList(set).map(({ reward, final }) => (
        <PrizeRow key={reward.id} set={set} reward={reward} final={final} busy={busyId === reward.id} onClaim={onClaim}
          titleWorn={titleWorn} titleBusy={titleBusy} onTitle={final ? onTitle : null} reduced={reduced} />
      ))}
    </Animated.View>
  );
}

function PrizeRow({ set, reward, final, busy, onClaim, titleWorn, titleBusy, onTitle, reduced }: {
  readonly set: DexSet; readonly reward: DexReward; readonly final: boolean; readonly busy: boolean;
  readonly onClaim: (reward: DexReward) => void; readonly titleWorn: boolean; readonly titleBusy: boolean;
  readonly onTitle: (() => void) | null; readonly reduced: boolean;
}) {
  const state = prizeState(reward, set.found);
  const glow = useSharedValue(0);
  useEffect(() => {
    if (state.kind !== 'claim' || reduced) { glow.value = 0; return; }
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1, false);
  }, [state.kind, reduced, glow]);
  const medalStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.08 * glow.value }, { rotate: `${-6 * glow.value}deg` }] }));
  const heading = final ? `Find all ${set.total}` : `Find ${reward.target}`;
  const status = state.kind === 'claim' ? STATE_WORDS.claim : state.kind === 'done' ? 'Got it!' : state.kind === 'pending' ? 'On the way' : `${state.toGo} to go`;
  return (
    <View style={[styles.prize, state.kind === 'claim' && styles.prizeReady, state.kind === 'done' && styles.prizeDone]}
      accessible={state.kind !== 'claim' && !(state.kind === 'done' && onTitle)}
      accessibilityLabel={`${heading}: ${reward.prize}. ${status}`}>
      <View style={styles.prizeTop}>
        <Animated.View style={[styles.medal, state.kind === 'claim' && styles.medalReady, state.kind === 'done' && styles.medalDone, medalStyle]}>
          <GameIcon name={final ? 'trophy' : 'gift'} size={34} />
          {state.kind === 'done' && <View style={styles.medalCheck}><GameIcon name="check" size={20} /></View>}
          {state.kind === 'locked' && <View style={styles.medalCheck}><GameIcon name="lock" size={18} /></View>}
        </Animated.View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.prizeHeadRow}>
            <Text style={styles.prizeHead} maxFontSizeMultiplier={1.25}>{heading}</Text>
            <View style={[styles.state, state.kind === 'claim' && styles.stateReady, state.kind === 'done' && styles.stateDone]}>
              <Text style={[styles.stateText, state.kind === 'done' && { color: '#1d6b33' }]} maxFontSizeMultiplier={1.2}>{status}</Text>
            </View>
          </View>
          <PrizeChips reward={reward} />
        </View>
      </View>
      {state.kind === 'claim' && (
        <GameButton label={reward.needsPick ? 'Pick and claim' : 'Claim!'} icon="gift" loading={busy}
          onPress={() => onClaim(reward)} style={{ marginTop: 10 }} accessibilityLabel={`Claim ${reward.label}`} />
      )}
      {state.kind === 'pending' && <Text style={styles.prizeNote}>Your shark item is on the way.</Text>}
      {state.kind === 'done' && onTitle && reward.title && (
        <SpringPress onPress={onTitle} disabled={titleBusy} accessibilityLabel={titleWorn ? `Take off the ${reward.title} title` : `Wear the ${reward.title} title`}
          style={[styles.wear, titleWorn && styles.wearOn, titleBusy && { opacity: 0.6 }]}>
          <GameIcon name="crown" size={24} />
          <Text style={styles.wearText} maxFontSizeMultiplier={1.2}>{titleWorn ? 'Wearing this title' : 'Wear this title'}</Text>
        </SpringPress>
      )}
    </View>
  );
}

export function SectionTitle({ icon, text, right }: { readonly icon: GameIconName; readonly text: string; readonly right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <GameIcon name={icon} size={26} />
      <Text style={styles.sectionText} accessibilityRole="header" maxFontSizeMultiplier={1.2}>{text}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

/** "Your finds", a share-extras button when there are extras to give, and the one-line key. */
export function FindsHeader({ extras, onExtras }: { readonly extras: number; readonly onExtras: (() => void) | null }) {
  return (
    <View style={styles.finds}>
      <SectionTitle icon="chest" text="Your finds" right={extras > 0 && onExtras ? (
        <SpringPress onPress={onExtras} accessibilityLabel={`${extras} extra ${extras === 1 ? 'copy' : 'copies'}. Tap to share with a friend.`} style={styles.extras}>
          <GameIcon name="heart" size={20} />
          <Text style={styles.extrasText} maxFontSizeMultiplier={1.2}>{extras} {extras === 1 ? 'extra' : 'extras'} to share</Text>
        </SpringPress>
      ) : null} />
      <View style={styles.key} accessible accessibilityLabel="Key: bright sticker means found. Faded shape means still to find. Plus number means extra copies.">
        <View style={styles.keyItem}>
          <View style={[styles.keySwatch, styles.keyFound]}><GameIcon name="check" size={14} /></View>
          <Text style={styles.keyText} maxFontSizeMultiplier={1.2}>Found</Text>
        </View>
        <View style={styles.keyItem}>
          <View style={[styles.keySwatch, styles.keyMissing]} />
          <Text style={styles.keyText} maxFontSizeMultiplier={1.2}>Still to find</Text>
        </View>
        <View style={styles.keyItem}>
          <View style={styles.plus}><Text style={styles.plusText}>+2</Text></View>
          <Text style={styles.keyText} maxFontSizeMultiplier={1.2}>Extras</Text>
        </View>
      </View>
    </View>
  );
}

/** A rarity group heading: the gems, the rarity's name, how rare it is, and the group's count. */
export const RarityHeading = memo(function RarityHeading({ rarity, label, found, total }: {
  readonly rarity: 1 | 2 | 3 | 4 | 5; readonly label: string; readonly found: number; readonly total: number;
}) {
  const look = rarityLook(rarity);
  const odds = rarityHint('Anytime, anywhere', rarity);
  const hint = odds === 'Anytime, anywhere' ? null : odds.replace(/^[A-Za-z ]+: /, '').replace(/^Super rare! /, '');
  const done = total > 0 && found >= total;
  return (
    <View style={styles.rarityRow} accessible accessibilityRole="header"
      accessibilityLabel={`${label}${hint ? `, ${hint}` : ''}. ${found} of ${total} found`}>
      <View style={[styles.rarityChip, { backgroundColor: look.chip, borderColor: look.frame }]}>
        <RarityGems rarity={rarity} size={8} />
        <Text style={[styles.rarityLabel, { color: look.ink }]} maxFontSizeMultiplier={1.2}>{label}</Text>
      </View>
      {hint && <Text style={styles.rarityHint} numberOfLines={1} maxFontSizeMultiplier={1.2}>{hint}</Text>}
      <View style={{ flex: 1 }} />
      <Text style={[styles.rarityCount, done && { color: '#1d6b33' }]} maxFontSizeMultiplier={1.2}>{found}/{total}</Text>
      {done && <GameIcon name="check" size={18} />}
    </View>
  );
});

/** Item art helper re-exported for the screen's sheets. */
export type { DexItem };

const styles = StyleSheet.create({
  cardRing: { borderRadius: 24, padding: 3 },
  cardRingOn: { backgroundColor: BRAND.white, ...SHADOW.card, shadowColor: BRAND.white, shadowOpacity: 0.95, shadowRadius: 10 },
  cardFace: {
    width: SHELF_CARD_W, height: SHELF_CARD_H, borderRadius: 20, alignItems: 'center', paddingTop: 10, overflow: 'hidden',
    borderWidth: 3, borderColor: 'rgba(5,52,110,0.55)', borderBottomWidth: 6,
  },
  cardFaceGold: { borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip, borderWidth: 4, borderBottomWidth: 7 },
  cardLower: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '32%', backgroundColor: 'rgba(5,52,110,0.2)' },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '46%' },
  cardWell: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(5,52,110,0.25)',
  },
  cardBadge: { width: 50, height: 50 },
  cardName: {
    fontFamily: 'Shark', fontSize: 14, lineHeight: 16, color: BRAND.white, marginTop: 5, paddingHorizontal: 6, textAlign: 'center',
    textShadowColor: 'rgba(5,52,110,0.65)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0, minHeight: 32,
  },
  cardCount: { position: 'absolute', bottom: 6, left: 7, right: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' },
  cardFill: { height: '100%', borderRadius: 4, backgroundColor: BRAND.white },
  cardCountText: {
    fontFamily: 'Shark', fontSize: 14, color: BRAND.white,
    textShadowColor: 'rgba(5,52,110,0.7)', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0,
  },
  cardHunt: {
    position: 'absolute', top: -2, left: -2, width: 32, height: 32, borderRadius: 16, backgroundColor: BRAND.gold,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.white,
  },
  cardPrize: {
    position: 'absolute', top: -6, right: -2, width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: BRAND.gold, ...SHADOW.card,
  },
  eventFace: { backgroundColor: '#1b1747', borderColor: '#8f7cff' },
  eventWell: { backgroundColor: 'rgba(15,22,54,0.85)' },
  rare: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, minHeight: 50, paddingLeft: 10, paddingRight: 6,
    borderRadius: 18, backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 6, borderBottomColor: BRAND.goldLip,
  },
  rareText: { flex: 1, fontFamily: 'Shark', fontSize: 17, color: '#7a3d00' },
  rareGo: { paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: BRAND.white, justifyContent: 'center', borderWidth: 2, borderColor: '#7a3d00' },
  rareGoText: { fontFamily: 'Shark', fontSize: 16, color: '#7a3d00' },
  header: { paddingHorizontal: 16, paddingTop: 18 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBadge: {
    width: 74, height: 74, borderRadius: 37, borderWidth: 4, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', ...SHADOW.card,
  },
  headerBadgeArt: { width: 58, height: 58 },
  headerName: { fontFamily: 'Shark', fontSize: 26, color: BRAND.navy },
  headerCount: { fontFamily: 'Knockout', fontSize: 19, color: BRAND.navySoft, marginTop: 1 },
  headerCountBig: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy },
  headerTrack: { height: 14, borderRadius: 7, backgroundColor: '#e9dcb6', overflow: 'hidden', marginTop: 5, borderWidth: 2, borderColor: BRAND.white },
  headerFill: { height: '100%', width: '100%', transformOrigin: 'left', borderRadius: 7 },
  goal: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, minHeight: 44, borderRadius: 14,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#efe1b8',
  },
  goalReady: { backgroundColor: '#fff4c7', borderColor: BRAND.gold },
  goalDone: { backgroundColor: '#fff4c7', borderColor: BRAND.gold },
  goalText: { flex: 1, fontFamily: 'Shark', fontSize: 17, color: BRAND.navy, paddingVertical: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 8 },
  when: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, minHeight: 50, borderRadius: 14,
    backgroundColor: 'rgba(5,52,110,0.06)',
  },
  whenText: { fontFamily: 'Knockout', fontSize: 17, lineHeight: 19, color: BRAND.navy },
  whenNow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: BRAND.white },
  whenNowText: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft },
  hunt: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 50, borderRadius: 14, backgroundColor: BRAND.white,
    borderWidth: 2, borderColor: BRAND.skyDeep, borderBottomWidth: 4,
  },
  huntOn: { backgroundColor: BRAND.gold, borderColor: BRAND.goldLip },
  huntText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  titleStampWrap: { position: 'absolute', right: 14, top: 4 },
  titleStamp: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 9, backgroundColor: BRAND.gold,
    borderWidth: 3, borderColor: '#7a3d00', borderBottomWidth: 5, maxWidth: 210,
  },
  titleStampText: { fontFamily: 'Shark', fontSize: 16, color: '#7a3d00', flexShrink: 1 },
  prizes: { paddingHorizontal: 16, marginTop: 18 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, minHeight: 34 },
  sectionText: { fontFamily: 'Shark', fontSize: 21, color: BRAND.navy },
  prize: {
    backgroundColor: BRAND.white, borderRadius: 18, padding: 10, marginBottom: 10, borderWidth: 2, borderColor: '#efe1b8', borderBottomWidth: 5,
  },
  prizeReady: { borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip, backgroundColor: '#fffaf0' },
  prizeDone: { backgroundColor: '#f3fbf4', borderColor: '#bfe6c8', borderBottomColor: '#9fd4ab' },
  prizeTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prizeHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prizeHead: { flex: 1, fontFamily: 'Shark', fontSize: 19, color: BRAND.navy },
  prizeNote: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft, marginTop: 8, textAlign: 'center' },
  medal: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#eef4fb', borderWidth: 3, borderColor: '#cfe0f1',
    alignItems: 'center', justifyContent: 'center',
  },
  medalReady: { backgroundColor: '#fff3c4', borderColor: BRAND.gold },
  medalDone: { backgroundColor: '#eafbef', borderColor: BRAND.green },
  medalCheck: {
    position: 'absolute', right: -6, bottom: -6, width: 28, height: 28, borderRadius: 14, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#cfe0f1',
  },
  state: { paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: 'center', backgroundColor: '#eef4fb' },
  stateReady: { backgroundColor: BRAND.gold },
  stateDone: { backgroundColor: '#d8f3df' },
  stateText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 8, borderRadius: 10,
    backgroundColor: '#e8f3fd', borderWidth: 1.5, borderColor: '#c9e0f5', maxWidth: '100%',
  },
  chipTitle: { backgroundColor: '#fff3c4', borderColor: BRAND.gold },
  chipText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navy, flexShrink: 1 },
  chipTitleText: { fontFamily: 'Shark', fontSize: 14, color: '#7a3d00' },
  wear: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', marginTop: 10,
    minHeight: 48, borderRadius: 24, backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 6, borderBottomColor: BRAND.goldLip,
  },
  wearOn: { backgroundColor: BRAND.white, borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip },
  wearText: { fontFamily: 'Shark', fontSize: 17, color: '#7a3d00' },
  finds: { paddingHorizontal: 16, marginTop: 10 },
  extras: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, minHeight: 40, borderRadius: 20,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#f3b7c4', borderBottomWidth: 4,
  },
  extrasText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
  key: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 4 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  keySwatch: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  keyFound: { backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.blueBright, borderBottomWidth: 3 },
  keyMissing: { backgroundColor: SLOT, borderWidth: 2, borderColor: SLOT_EDGE, borderStyle: 'dashed' },
  keyText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft },
  plus: {
    minWidth: 30, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center',
  },
  plusText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  rarityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  rarityChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 30, borderRadius: 15, borderWidth: 2 },
  rarityLabel: { fontFamily: 'Shark', fontSize: 15 },
  rarityHint: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft, flexShrink: 1 },
  rarityCount: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
});

export const SLOT_COLORS = { fill: SLOT, edge: SLOT_EDGE, ink: SLOT_INK } as const;
