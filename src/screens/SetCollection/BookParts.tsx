/**
 * The Collections page, rethought (Dustin, Oct 8: "I don't understand everything I'm looking at").
 * One hierarchy, top to bottom, each fact said once:
 *   1. Shelf: every set as a cover card with its count, a gift when a prize is ready, gold when finished,
 *      a "Hunting" tag on the set you hunt.
 *   2. This set (one white card): name, "9 of 40 found", one bar with a gift notch at each prize and a
 *      trophy at the end, a pill with the next goal ("5 to go"), when its finds are on the map (On now /
 *      Not right now), and the Hunt switch that says what it does ("More on your map").
 *   3. Prizes: a slim "Got it!" row for a claimed step, a row with the prizes in icons plus words and a big
 *      Claim button when ready, and the finish prize as the hero row (gold frame, title ribbon).
 *   4. Your finds: the extras button, a key drawn with real mini tiles, then the finds grouped by rarity
 *      under headings that name the rarity and how hard it is to find.
 * The page sits on the Standings underwater art with a cream sheet under the shelf. Every move runs on
 * the UI thread, loops pause when the screen is covered, and Reduce Motion swaps moves for stills.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomOut,
} from 'react-native-reanimated';
import { playSfx } from '../../gamekit/SFX';
import * as Haptics from '../../helpers/haptics';
import { BRAND, GameButton, GameIcon, SHADOW, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { GIFT, RIBBON, setBadge, SpringPress } from './DexParts';
import { RarityGems, rarityLook } from './dexLook';
import {
  goalLine, hasClaimable, openNow, prizeChips, prizeList, prizeMarks, prizeState, progressFraction, RARITY_WORDS, whenLine,
  type DexReward, type DexSet,
} from './dexModel';
import { BEAT } from './bookClock';
import type { EventCard } from './eventCards';

export const BOOK_BG = require('../../../assets/images/screens/leaderboard/standings-bg.png');
/** The sheet under the shelf: Standings cream. */
export const SHEET = BRAND.cream;
/** An empty sticker slot printed in the album. */
const SLOT = '#f1e4c0';
const SLOT_EDGE = '#d6bf85';
/** The missing shape: one solid ink blended into the slot (never a low-opacity navy, which reads grey). */
export const SLOT_COLORS = { fill: SLOT, edge: SLOT_EDGE, ink: '#bfb08a', inkOpacity: 1, label: '#c9b78a' } as const;
const BROWN = '#7a3d00';
/** Dynamic Type room for body copy (cards grow in height instead of clipping). */
const BODY_SCALE = 1.45;

export const SHELF_CARD_W = 102;
export const SHELF_CARD_H = 116;
export const SHELF_GAP = 12;

const finishedOf = (set: Pick<DexSet, 'reward'>) => set.reward.status === 'claimed' || set.reward.status === 'pending';

/** One set on the shelf: the cover, the name, and its count. A gift when a prize is ready, gold when finished. */
export const ShelfCard = memo(function ShelfCard({ set, selected, onPress, active }: {
  readonly set: DexSet; readonly selected: boolean; readonly onPress: (slug: string) => void;
  /** False while the screen is covered: idle loops stop. */
  readonly active: boolean;
}) {
  const reduced = useUiReducedMotion();
  const claim = hasClaimable(set);
  const finished = finishedOf(set);
  const [badgeFailed, setBadgeFailed] = useState(false);
  const lift = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    lift.value = reduced ? withTiming(selected ? 1 : 0, { duration: 150 }) : withSpring(selected ? 1 : 0, { damping: 11, stiffness: 220 });
  }, [selected, reduced, lift]);
  const liftStyle = useAnimatedStyle(() => (reduced ? { opacity: 0.8 + 0.2 * lift.value } : {
    opacity: 0.8 + 0.2 * lift.value,
    transform: [{ translateY: -4 * lift.value }, { scale: 0.93 + 0.07 * lift.value }],
  }));
  // The page's one shared beat (bookClock): in step with the prize medal, resting between pulses.
  const moving = claim && !reduced && active;
  const bobStyle = useAnimatedStyle(() => {
    const b = moving ? BEAT.value : 0;
    return { transform: [{ translateY: -4 * b }, { rotate: `${-8 + 8 * b}deg` }] };
  }, [moving]);
  const fraction = progressFraction(set);
  return (
    <SpringPress onPress={() => onPress(set.slug)} accessibilityState={{ selected }}
      accessibilityLabel={`${set.name}, ${set.found} of ${set.total} found${claim ? ', prize ready' : ''}${finished ? ', finished' : ''}${set.focused ? ', you are hunting this set' : ''}`}
      style={{ marginRight: SHELF_GAP }}>
      <Animated.View style={liftStyle}>
        <View style={[styles.cardRing, selected && styles.cardRingOn]}>
          <View style={[styles.cardFace, { backgroundColor: set.color }, finished && styles.cardFaceGold]}>
            <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
            <View style={styles.cardWell}>
              <Image source={badgeFailed ? GIFT : setBadge(set)} style={styles.cardBadge} contentFit="contain" onError={() => setBadgeFailed(true)} />
            </View>
            <Text numberOfLines={2} style={styles.cardName} maxFontSizeMultiplier={1.15}>{set.name}</Text>
            <View style={styles.cardBand}>
              <View style={styles.cardTrack}>
                <View style={[styles.cardFill, { width: `${Math.max(fraction > 0 ? 6 : 0, fraction * 100)}%` }, finished && { backgroundColor: BRAND.gold }]} />
              </View>
              <Text style={styles.cardCountText} maxFontSizeMultiplier={1.15}>{set.found}/{set.total}</Text>
            </View>
          </View>
        </View>
        {set.focused && (
          <View style={styles.cardHunt}>
            <GameIcon name="search" size={16} />
            <Text style={styles.cardHuntText} maxFontSizeMultiplier={1.1}>Hunting</Text>
          </View>
        )}
        {claim && (
          // The exit pop lives on a bare wrapper, so it never fights the bob's transform.
          <Animated.View pointerEvents="none" style={styles.cardPrizeSlot} exiting={reduced ? undefined : ZoomOut.duration(260)}>
            <Animated.View style={[styles.cardPrize, styles.cardPrizeInner, bobStyle]}>
              <GameIcon name="gift" size={26} />
            </Animated.View>
          </Animated.View>
        )}
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
          <View style={styles.cardBand}>
            <View style={styles.cardTrack}><View style={[styles.cardFill, { width: `${fraction * 100}%`, backgroundColor: '#9df0c2' }]} /></View>
            <Text style={styles.cardCountText} maxFontSizeMultiplier={1.15}>{card.done}/{card.total}</Text>
          </View>
        </View>
      </View>
    </SpringPress>
  );
});

/** Today's rare find as the first card on the shelf (only while it is worth a trip): one tap opens the map. */
export function RareShelfCard({ onPress }: { readonly onPress: () => void }) {
  return (
    <SpringPress onPress={onPress} accessibilityLabel="A rare find is out today. Open the map to find it." style={{ marginRight: SHELF_GAP }}>
      <View style={styles.cardRing}>
        <View style={[styles.cardFace, styles.rareFace]}>
          <LinearGradient colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
          <View style={[styles.cardWell, { borderColor: BRAND.goldLip }]}><GameIcon name="star" size={30} /></View>
          <Text numberOfLines={2} style={[styles.cardName, styles.rareName]} maxFontSizeMultiplier={1.15}>Rare find!</Text>
          <View style={[styles.cardBand, styles.rareBand]}>
            <GameIcon name="map" size={18} />
            <Text style={styles.rareGo} maxFontSizeMultiplier={1.15}>Find it</Text>
          </View>
        </View>
      </View>
    </SpringPress>
  );
}

/** The count bar with a gift notch at each prize and a trophy at the end (gold when ready, checked when won). */
function PrizeBar({ set, reduced }: { readonly set: DexSet; readonly reduced: boolean }) {
  const fill = useSharedValue(0);
  const fraction = progressFraction(set);
  const finished = finishedOf(set);
  useEffect(() => {
    fill.value = reduced ? fraction : withTiming(fraction, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [fraction, reduced, fill]);
  // scaleX on a full-width bar: no layout work per frame.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, fill.value) }] }));
  return (
    <View style={styles.barWrap} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.bar}>
        <Animated.View style={[styles.barFill, { backgroundColor: finished || set.isComplete ? BRAND.gold : set.color }, fillStyle]} />
      </View>
      {prizeMarks(set).map(mark => {
        const done = mark.status === 'claimed' || mark.status === 'pending';
        const ready = mark.status === 'claimable';
        return (
          <View key={`${mark.target}-${mark.final}`} style={[styles.notch, { left: `${mark.at * 100}%` }, ready && styles.notchReady, done && (mark.final ? styles.notchTrophy : styles.notchDone)]}>
            <GameIcon name={mark.final ? 'trophy' : done ? 'check' : 'gift'} size={18} />
          </View>
        );
      })}
    </View>
  );
}

/** The open set in one white card: name and count, the prize bar, the next goal, when, and the Hunt switch. */
export function BookHeader({ set, onFocus, focusBusy, stamp, onClaim, busyId, titleWorn = false, onTitle = null }: {
  readonly set: DexSet; readonly onFocus: (() => void) | null; readonly focusBusy: boolean;
  /** The ready prize's Claim lives here, so it is always on the first screen. */
  readonly onClaim: (reward: DexReward) => void; readonly busyId: string | null;
  /** A title just won: stamps onto the header after the reveal closes. */
  readonly stamp?: string | null;
  /** The set's title is worn: the header says so in words, and a tap takes it off. */
  readonly titleWorn?: boolean; readonly onTitle?: (() => void) | null;
}) {
  const reduced = useUiReducedMotion();
  const enter = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    // A short settle on a set switch: never fades out (no flicker), just slides 8 px into place.
    enter.value = 0;
    enter.value = reduced ? 1 : withSpring(1, { damping: 16, stiffness: 260 });
  }, [set.slug, reduced, enter]);
  const enterStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - enter.value) * 8 }] }));
  const finished = finishedOf(set);
  const ready = hasClaimable(set);
  const goal = goalLine(set);
  const open = openNow(set);
  const when = whenLine(set);
  const [badgeFailed, setBadgeFailed] = useState(false);
  useEffect(() => { setBadgeFailed(false); }, [set.slug]);
  // The header says only what no row says: a prize is waiting, or the set is done. "N to go" lives on its prize row.
  // CLAIM PRIZE sits right under the count, so no extra "ready" pill is needed.
  const pill: string | null = null;
  const complete = finished || set.isComplete;
  const readyEntry = prizeList(set).find(entry => entry.reward.status === 'claimable') ?? null;
  return (
    <Animated.View style={[styles.header, complete && styles.headerDone, enterStyle]}>
      <View style={styles.headerTop}>
        <View style={[styles.headerBadge, { borderColor: finished ? BRAND.gold : set.color }]}>
          <Image source={badgeFailed ? GIFT : setBadge(set)} style={styles.headerBadgeArt} contentFit="contain" onError={() => setBadgeFailed(true)} />
        </View>
        <View style={{ flex: 1 }} accessible accessibilityRole="header"
          accessibilityLabel={`${set.name}. ${set.found} of ${set.total} found.${ready ? ' A prize is ready.' : goal ? ` ${goal}.` : ''}`}>
          <Text style={styles.headerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.25}>{set.name}</Text>
          <View style={styles.countRow}>
            <Text style={styles.headerCount} maxFontSizeMultiplier={BODY_SCALE}>
              <Text style={styles.headerCountBig}>{set.found}</Text> of {set.total} found
            </Text>
            {pill && (
              <View style={[styles.goalPill, (ready || finished) && styles.goalPillGold]}>
                <GameIcon name={ready ? 'gift' : 'crown'} size={18} />
                <Text style={styles.goalPillText} maxFontSizeMultiplier={1.3}>{pill}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <PrizeBar set={set} reduced={reduced} />
      {readyEntry && (
        <GameButton label={readyEntry.reward.needsPick ? 'Pick and claim' : 'Claim prize!'} icon="gift" loading={busyId === readyEntry.reward.id}
          onPress={() => onClaim(readyEntry.reward)} style={{ marginTop: 6 }}
          accessibilityLabel={`Claim the ${readyEntry.final ? `Find all ${set.total}` : `Find ${readyEntry.reward.target}`} prize: ${readyEntry.reward.prize}`} />
      )}
      {complete ? null : (
      <View style={styles.headerRow}>
        <View style={styles.when} accessible accessibilityLabel={`${when}${open === false ? '. Not right now' : open ? '. On now' : ''}`}>
          <GameIcon name={whenIcon(set)} size={26} />
          <View style={{ flexShrink: 1, gap: 3 }}>
            <Text style={styles.whenText} numberOfLines={2} maxFontSizeMultiplier={BODY_SCALE}>{when}</Text>
            {open != null && (
              <View style={[styles.nowPill, open ? styles.nowOn : styles.nowOff]}>
                <View style={[styles.dot, { backgroundColor: open ? BRAND.green : '#8fa3ba' }]} />
                <Text style={styles.nowText} maxFontSizeMultiplier={1.3}>{open ? 'On now' : 'Not right now'}</Text>
              </View>
            )}
          </View>
        </View>
        {onFocus && <HuntSwitch on={set.focused} busy={focusBusy} onPress={onFocus} reduced={reduced} />}
      </View>
      )}
      {complete && titleWorn && !!set.reward.title && onTitle && (
        <SpringPress onPress={onTitle} accessibilityLabel={`Wearing the ${set.reward.title} title. Tap to take it off.`} style={styles.wearingChip}>
          <GameIcon name="crown" size={22} />
          <Text style={styles.wearingChipText} numberOfLines={1} maxFontSizeMultiplier={1.3}>Wearing: {set.reward.title}</Text>
          <Text style={styles.wearingOff} maxFontSizeMultiplier={1.3}>Take off</Text>
        </SpringPress>
      )}
      {complete && !stamp && (
        <View style={styles.completeStamp} accessible accessibilityLabel="Complete">
          <Text style={styles.completeText} maxFontSizeMultiplier={1.1}>COMPLETE</Text>
        </View>
      )}
      {!!stamp && <TitleStamp key={stamp} text={stamp} reduced={reduced} />}
    </Animated.View>
  );
}

/** A real on/off switch that says what it does: "Hunt this set / More on your map". */
export function HuntSwitch({ on, busy, onPress, reduced }: { readonly on: boolean; readonly busy: boolean; readonly onPress: () => void; readonly reduced: boolean }) {
  const knob = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    knob.value = reduced ? (on ? 1 : 0) : withSpring(on ? 1 : 0, { damping: 15, stiffness: 320 });
  }, [on, reduced, knob]);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.value * 22 }] }));
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on, busy }} disabled={busy} onPress={onPress} hitSlop={6}
      accessibilityLabel={`Hunt this set, ${on ? 'on' : 'off'}. Its finds show up more on your map. You can hunt one set at a time.`}
      style={({ pressed }) => [styles.hunt, on && styles.huntOn, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={{ flexShrink: 1 }}>
        <View style={styles.huntTitleRow}>
          <Text style={styles.huntText} maxFontSizeMultiplier={1.3}>{on ? 'Hunting!' : 'Hunt this set'}</Text>
        </View>
        <Text style={styles.huntSub} maxFontSizeMultiplier={1.3}>More on your map</Text>
      </View>
      <View style={[styles.track, on && styles.trackOn]}>
        <Animated.View style={[styles.knob, on && styles.knobOn, knobStyle]}>{on && <GameIcon name="search" size={16} />}</Animated.View>
      </View>
    </Pressable>
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

/** Prize chips with words: "+15 Energy", "+1 Ticket", "+30 XP". The title gets its own gold ribbon (TitleRibbon). */
export function PrizeChips({ reward, titleChip = false }: { readonly reward: DexReward; readonly titleChip?: boolean }) {
  const chips = prizeChips(reward).filter(chip => chip.icon !== 'crown');
  if (chips.length === 0 && !reward.title) return <Text style={styles.chipText}>A surprise</Text>;
  return (
    <View style={styles.chips}>
      {chips.map(chip => {
        const words = chip.icon === 'energy' ? `${chip.value} Energy` : chip.icon === 'ticket' ? `${chip.value} ${chip.label.endsWith('Ticket') ? 'Ticket' : 'Tickets'}`
          : chip.icon === 'xp' ? `${chip.value} XP` : chip.icon === 'coins' ? `${chip.value} Coins` : chip.value;
        return (
          <View key={chip.icon} style={styles.chip}>
            <GameIcon name={chip.icon} size={24} />
            <Text style={styles.chipText} numberOfLines={1} maxFontSizeMultiplier={1.3}>{words}</Text>
          </View>
        );
      })}
      {titleChip && !!reward.title && (
        <View style={[styles.chip, styles.chipTitle, { alignSelf: 'flex-start' }]}>
          <GameIcon name="crown" size={24} />
          <Text style={[styles.chipText, styles.chipTitleText]} numberOfLines={1} maxFontSizeMultiplier={1.3}>Title: {reward.title}</Text>
        </View>
      )}
    </View>
  );
}

/** The title you win, as a gold ribbon banner. */
function TitleRibbon({ title }: { readonly title: string }) {
  return (
    <View accessible accessibilityLabel={`Title: ${title}. It shows by your name.`}>
      <View style={styles.ribbon}>
        <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="fill" />
        <GameIcon name="crown" size={22} />
        <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.2}>Title: {title}</Text>
      </View>
      <Text style={styles.ribbonSub} maxFontSizeMultiplier={BODY_SCALE}>A title shows by your name</Text>
    </View>
  );
}

/** Every prize for the set, in target order. A won step folds to one slim line; the finish prize is the hero row. */
export function PrizeRows({ set, titleWorn, titleBusy, onTitle, popKey, active }: {
  readonly set: DexSet;
  readonly titleWorn: boolean; readonly titleBusy: boolean; readonly onTitle: (() => void) | null; readonly popKey: number;
  readonly active: boolean;
}) {
  const reduced = useUiReducedMotion();
  const pop = useSharedValue(1);
  useEffect(() => {
    if (popKey === 0 || reduced) return;
    pop.value = withSequence(withTiming(1.03, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 240 }));
  }, [popKey, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Animated.View style={[styles.prizes, popStyle]}>
      {prizeList(set).map(({ reward, final }) => (
        <PrizeRow key={reward.id} set={set} reward={reward} final={final}
          titleWorn={titleWorn} titleBusy={titleBusy} onTitle={final ? onTitle : null} reduced={reduced} active={active} />
      ))}
    </Animated.View>
  );
}

function PrizeRow({ set, reward, final, titleWorn, titleBusy, onTitle, reduced, active }: {
  readonly set: DexSet; readonly reward: DexReward; readonly final: boolean;
  readonly titleWorn: boolean; readonly titleBusy: boolean;
  readonly onTitle: (() => void) | null; readonly reduced: boolean; readonly active: boolean;
}) {
  const state = prizeState(reward, set.found);
  const wiggle = useSharedValue(0);
  const stampIn = useSharedValue(1);
  const lastKind = useRef(state.kind);
  const pulsing = state.kind === 'claim' && !reduced && active;
  // Won just now (the reveal closed): the check stamps onto the medal with a thud.
  useEffect(() => {
    const was = lastKind.current;
    lastKind.current = state.kind;
    if (state.kind !== 'done' || was === 'done') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    playSfx('fx.hit', 0.45);
    if (reduced) return;
    stampIn.value = 2.2;
    stampIn.value = withSequence(withTiming(1, { duration: 180, easing: Easing.in(Easing.quad) }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [state.kind, reduced, stampIn]);
  const medalStyle = useAnimatedStyle(() => {
    const g = pulsing ? BEAT.value : 0;
    return { transform: [{ scale: 1 + 0.08 * g }, { rotate: `${-6 * g + wiggle.value}deg` }] };
  }, [pulsing]);
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: stampIn.value }] }));
  const heading = final ? `Find all ${set.total}` : `Find ${reward.target}`;
  const status = state.kind === 'done' ? 'Got it!' : state.kind === 'pending' ? 'On the way' : state.kind === 'locked' ? `${state.toGo} to go` : 'Ready!';
  // Not yet: a tap still answers (a wiggle, a tick and the count left in the pill).
  const nudge = () => {
    if (state.kind !== 'locked') return;
    void Haptics.selectionAsync().catch(() => undefined);
    playSfx('ui.tap', 0.4);
    if (!reduced) wiggle.value = withSequence(withTiming(-10, { duration: 60 }), withTiming(10, { duration: 80 }), withTiming(-6, { duration: 70 }), withSpring(0, { damping: 8 }));
  };

  // A won step folds to one slim line: nothing to do there any more. So does the won finish prize once its
  // title is worn (the page then opens on the trophy case).
  if (state.kind === 'done' && (!final || !reward.title || titleWorn)) {
    return (
      <View style={styles.slim} accessible accessibilityLabel={`${heading}: you got ${reward.prize}`}>
        <View style={styles.slimLine}>
          <Animated.View style={[styles.slimMedal, checkStyle]}><GameIcon name="check" size={20} /></Animated.View>
          <Text style={styles.slimText} maxFontSizeMultiplier={BODY_SCALE}>{heading}</Text>
          <PrizeMini reward={reward} />
          <View style={[styles.state, styles.stateDone, styles.stateRow]}><GameIcon name="check" size={16} /><Text style={styles.stateText} maxFontSizeMultiplier={1.3}>Got it!</Text></View>
        </View>
      </View>
    );
  }
  const hero = final;
  return (
    <Pressable onPress={nudge} disabled={state.kind !== 'locked'}
      style={[styles.prize, hero && styles.prizeHero, state.kind === 'claim' && styles.prizeReady, hero && state.kind === 'done' && styles.prizeHeroDone]}
      accessible={state.kind !== 'claim' && !(state.kind === 'done' && onTitle)}
      accessibilityLabel={`${heading}: ${reward.prize}.${status ? ` ${status}` : ''}`}>
      <View style={styles.prizeTop}>
        <Animated.View style={[styles.medal, hero && styles.medalHero, state.kind === 'claim' && styles.medalReady, state.kind === 'claim' && !hero && styles.medalQuiet, state.kind === 'done' && styles.medalDone, medalStyle]}>
          <GameIcon name={final ? 'trophy' : 'gift'} size={hero ? 50 : state.kind === 'claim' ? 28 : 34} />
          {state.kind === 'done' && <Animated.View style={[styles.medalCheck, checkStyle]}><GameIcon name="check" size={20} /></Animated.View>}
          {state.kind === 'locked' && <View style={styles.medalCheck}><GameIcon name="lock" size={18} /></View>}
        </Animated.View>
        <View style={{ flex: 1, gap: 7 }}>
          <View style={styles.prizeHeadRow}>
            <Text style={[styles.prizeHead, hero && styles.prizeHeadHero]} maxFontSizeMultiplier={1.3}>{heading}</Text>
            {status && (
              <View style={[styles.state, state.kind === 'done' && [styles.stateDone, styles.stateRow], state.kind === 'claim' && styles.stateReady]}>
                {state.kind === 'done' && <GameIcon name="check" size={16} />}
                <Text style={[styles.stateText, state.kind === 'done' && styles.stateDoneText]} maxFontSizeMultiplier={1.3}>{status}</Text>
              </View>
            )}
          </View>
          {hero ? (
            <View style={{ gap: 6 }}>
              {state.kind === 'locked' ? <PrizeChips reward={reward} /> : <PrizeMini reward={reward} />}
              {!!reward.title && state.kind === 'locked' && (
                <View style={[styles.chip, styles.chipTitle, { alignSelf: 'flex-start' }]}>
                  <GameIcon name="crown" size={22} />
                  <Text style={[styles.chipText, styles.chipTitleText]} numberOfLines={1} maxFontSizeMultiplier={1.3}>Title: {reward.title}</Text>
                </View>
              )}
            </View>
          ) : <PrizeChips reward={reward} />}
        </View>
      </View>
      {!!reward.title && state.kind !== 'locked' && <TitleRibbon title={reward.title} />}
      {state.kind === 'pending' && <Text style={styles.prizeNote} maxFontSizeMultiplier={BODY_SCALE}>Your shark item is on the way.</Text>}
      {state.kind === 'done' && onTitle && reward.title && (
        titleWorn ? (
          <SpringPress onPress={onTitle} disabled={titleBusy} accessibilityLabel={`Wearing the ${reward.title} title. Tap to take it off.`}
            style={[styles.wear, titleBusy && { opacity: 0.6 }]}>
            <GameIcon name="check" size={24} />
            <Text style={styles.wearText} maxFontSizeMultiplier={1.3}>Wearing this title</Text>
          </SpringPress>
        ) : (
          <GameButton label="Wear this title" icon="crown" loading={titleBusy} onPress={onTitle} style={{ marginTop: 10 }}
            accessibilityLabel={`Wear the ${reward.title} title`} />
        )
      )}
    </Pressable>
  );
}

/** The prize icons alone, for a won step's slim line. */
function PrizeMini({ reward }: { readonly reward: DexReward }) {
  return (
    <View style={styles.mini} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {prizeChips(reward).filter(chip => chip.icon !== 'crown').map(chip => (
        <View key={chip.icon} style={styles.miniChip}>
          <GameIcon name={chip.icon} size={22} />
          <Text style={styles.miniText} maxFontSizeMultiplier={1.3}>{chip.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function SectionTitle({ icon, text, right }: { readonly icon: GameIconName; readonly text: string; readonly right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <GameIcon name={icon} size={28} />
      <Text style={styles.sectionText} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{text}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

/** "Your finds", the give-extras button, and a key drawn with real mini tiles. */
export function FindsHeader({ set, extras, onExtras }: {
  readonly set: DexSet | null; readonly extras: number; readonly onExtras: (() => void) | null;
}) {
  const badge = set ? setBadge(set) : GIFT;
  const showKey = useKeyLesson();
  return (
    <View style={styles.finds}>
      <SectionTitle icon="chest" text="Your finds" right={extras > 0 && onExtras ? (
        <SpringPress onPress={onExtras} accessibilityLabel={`${extras} ${extras === 1 ? 'extra' : 'extras'}. Give one to a friend.`} style={styles.extras}>
          <GameIcon name="heart" size={22} />
          <Text style={styles.extrasText} maxFontSizeMultiplier={1.3}>{extras} {extras === 1 ? 'extra' : 'extras'} to give</Text>
        </SpringPress>
      ) : null} />
      {showKey && <View style={styles.key} accessible accessibilityLabel="Key: a bright sticker is found. A faded shape is still to find. A plus number means extras you can give away.">
        <View style={styles.keyItem}>
          <View style={[styles.keySticker, { borderColor: rarityLook(1).frame }]}><Image source={badge} style={styles.keyArt} contentFit="contain" /></View>
          <Text style={styles.keyText} maxFontSizeMultiplier={1.3}>Found</Text>
        </View>
        <View style={styles.keyItem}>
          <View style={styles.keySlot}>
            <Image source={badge} style={[styles.keyArt, { opacity: SLOT_COLORS.inkOpacity }]} tintColor={SLOT_COLORS.ink} contentFit="contain" />
          </View>
          <Text style={styles.keyText} maxFontSizeMultiplier={1.3}>Still to find</Text>
        </View>
        <View style={styles.keyItem}>
          <View style={styles.plus}><Text style={styles.plusText}>+2</Text></View>
          <Text style={styles.keyText} maxFontSizeMultiplier={1.3}>Extras to give</Text>
        </View>
      </View>}
    </View>
  );
}

/**
 * The key teaches the album once: it shows on the first few visits to Collections (counted per app session
 * start), then folds away so the finds sit higher. Storage failures just keep showing it.
 */
const KEY_SEEN = 'collections_key_seen_v1';
const KEY_LESSONS = 3;
let keyCount: number | null = null;
let keyCounted = false;
function useKeyLesson(): boolean {
  const [show, setShow] = useState(() => keyCount == null || keyCount < KEY_LESSONS);
  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(KEY_SEEN).then(raw => {
      const seen = Number(raw) || 0;
      if (keyCount == null) keyCount = seen;
      if (!keyCounted) { keyCounted = true; void AsyncStorage.setItem(KEY_SEEN, String(seen + 1)).catch(() => undefined); }
      if (live) setShow(seen < KEY_LESSONS);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return show;
}

/** A rarity group heading: the gems, the rarity's name, how hard it is to find (in words), and the group's count. */
export const RarityHeading = memo(function RarityHeading({ rarity, label, found, total }: {
  readonly rarity: 1 | 2 | 3 | 4 | 5; readonly label: string; readonly found: number; readonly total: number;
}) {
  const look = rarityLook(rarity);
  const hint = RARITY_WORDS[rarity];
  const done = total > 0 && found >= total;
  return (
    <View style={styles.rarityRow} accessible accessibilityRole="header"
      accessibilityLabel={`${label}, ${hint}. ${found} of ${total} found`}>
      <View style={[styles.rarityChip, { backgroundColor: look.chip, borderColor: look.frame }]}>
        <RarityGems rarity={rarity} size={9} />
        <Text style={[styles.rarityLabel, { color: look.ink }]} maxFontSizeMultiplier={1.3}>{label}</Text>
      </View>
      <Text style={styles.rarityHint} numberOfLines={1} maxFontSizeMultiplier={1.3}>{hint}</Text>
      <View style={{ flex: 1 }} />
      <Text style={[styles.rarityCount, done && { color: '#1d6b33' }]} maxFontSizeMultiplier={1.3}>{found}/{total}</Text>
      {done && <GameIcon name="check" size={20} />}
    </View>
  );
});

const styles = StyleSheet.create({
  cardRing: { borderRadius: 24, padding: 3 },
  cardRingOn: { backgroundColor: BRAND.gold, ...SHADOW.card, shadowColor: BRAND.white, shadowOpacity: 0.95, shadowRadius: 10 },
  cardFace: {
    width: SHELF_CARD_W, height: SHELF_CARD_H, borderRadius: 20, alignItems: 'center', paddingTop: 6, overflow: 'hidden',
    borderWidth: 3, borderColor: 'rgba(5,52,110,0.55)', borderBottomWidth: 6,
  },
  cardFaceGold: { borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip, borderWidth: 4, borderBottomWidth: 7 },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '46%' },
  cardWell: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(5,52,110,0.25)',
  },
  cardBadge: { width: 36, height: 36 },
  cardName: {
    fontFamily: 'Shark', fontSize: 14, lineHeight: 16, color: BRAND.white, marginTop: 2, paddingHorizontal: 6, textAlign: 'center',
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1, minHeight: 32,
  },
  // A darker band at the foot of the cover carries the count, so it reads on every set color.
  cardBand: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 7, backgroundColor: 'rgba(5,52,110,0.45)',
  },
  cardTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  cardFill: { height: '100%', borderRadius: 4, backgroundColor: BRAND.white },
  cardCountText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
  cardHunt: {
    position: 'absolute', top: -4, left: -2, flexDirection: 'row', alignItems: 'center', gap: 2, height: 26, paddingHorizontal: 7,
    borderRadius: 13, backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.white,
  },
  cardHuntText: { fontFamily: 'Knockout', fontSize: 15, color: BROWN },
  cardPrizeSlot: { position: 'absolute', top: -6, right: -2, width: 38, height: 38 },
  cardPrizeInner: { position: 'relative', top: 0, right: 0 },
  cardPrize: {
    position: 'absolute', top: -6, right: -2, width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: BRAND.gold, ...SHADOW.card,
  },
  eventFace: { backgroundColor: '#1b1747', borderColor: '#8f7cff' },
  eventWell: { backgroundColor: 'rgba(15,22,54,0.85)' },
  rareFace: { backgroundColor: BRAND.gold, borderColor: BRAND.goldLip },
  rareName: { color: BROWN, textShadowColor: 'rgba(255,255,255,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  rareBand: { backgroundColor: BRAND.white, justifyContent: 'center' },
  rareGo: { fontFamily: 'Shark', fontSize: 15, color: BROWN },
  header: {
    marginHorizontal: 12, marginTop: 12, padding: 12, borderRadius: 22, backgroundColor: BRAND.white,
    borderWidth: 2, borderColor: '#efe1b8', borderBottomWidth: 5,
  },
  headerDone: { backgroundColor: '#fffaea', borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip, borderWidth: 3 },
  completeStamp: {
    position: 'absolute', right: 10, top: -12, paddingHorizontal: 10, height: 34, justifyContent: 'center', borderRadius: 8,
    borderWidth: 3, borderColor: BRAND.goldLip, backgroundColor: '#fff3c4', transform: [{ rotate: '6deg' }],
  },
  completeText: { fontFamily: 'Shark', fontSize: 18, color: BROWN, letterSpacing: 1 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBadge: {
    width: 68, height: 68, borderRadius: 34, borderWidth: 4, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', ...SHADOW.card,
  },
  headerBadgeArt: { width: 54, height: 54 },
  headerName: { fontFamily: 'Shark', fontSize: 26, color: BRAND.navy },
  countRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  headerCount: { fontFamily: 'Knockout', fontSize: 19, color: BRAND.navySoft },
  headerCountBig: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy },
  goalPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 9, borderRadius: 15,
    backgroundColor: '#eef4fb', borderWidth: 2, borderColor: '#cfe0f1',
  },
  goalPillGold: { backgroundColor: '#fff3c4', borderColor: BRAND.gold },
  goalPillText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navy },
  barWrap: { height: 32, justifyContent: 'center', marginTop: 4, marginHorizontal: 14 },
  bar: { height: 14, borderRadius: 7, backgroundColor: '#ece0bd', overflow: 'hidden', borderWidth: 2, borderColor: '#e2d2a3' },
  barFill: { height: '100%', width: '100%', transformOrigin: 'left', borderRadius: 7 },
  notch: {
    position: 'absolute', top: 2, marginLeft: -15, width: 30, height: 30, borderRadius: 15, backgroundColor: BRAND.white,
    borderWidth: 2, borderColor: '#cfe0f1', alignItems: 'center', justifyContent: 'center',
  },
  notchReady: { borderColor: BRAND.gold, backgroundColor: '#fff3c4' },
  notchDone: { borderColor: BRAND.gold, backgroundColor: '#fff3c4' },
  notchTrophy: { borderColor: BRAND.goldLip, backgroundColor: BRAND.gold, ...SHADOW.card, shadowColor: BRAND.gold, shadowOpacity: 0.9, shadowRadius: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, paddingTop: 8, borderTopWidth: 2, borderTopColor: '#f4ead0' },
  when: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  whenText: { fontFamily: 'Knockout', fontSize: 17, lineHeight: 19, color: BRAND.navy },
  nowPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, height: 24, paddingHorizontal: 8, borderRadius: 12 },
  nowOn: { backgroundColor: '#dcf5e2' },
  nowOff: { backgroundColor: '#e8eef5' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: BRAND.white },
  nowText: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy },
  hunt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 10, paddingRight: 8, minHeight: 56, borderRadius: 16,
    backgroundColor: '#f2f7fc', borderWidth: 2, borderColor: '#cfe0f1',
  },
  huntOn: { backgroundColor: '#eaf6ff', borderColor: BRAND.blueBright },

  huntTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  huntText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  huntSub: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft },
  // House toggle: a chunky navy-outlined track (white off, blue on) and a gold knob carrying the magnifier.
  // Off: a pale grey track and a grey knob. On: a bright blue track and a gold knob. Clear even in greyscale.
  track: { width: 60, height: 34, borderRadius: 17, backgroundColor: '#dfe6ee', padding: 2, borderWidth: 2, borderColor: '#c3cfdb' },
  trackOn: { backgroundColor: BRAND.blueBright, borderColor: BRAND.navy, borderWidth: 3 },
  knob: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#b9c6d3', borderWidth: 2, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center',
  },
  knobOn: { backgroundColor: BRAND.gold, borderColor: BRAND.goldLip },
  titleStampWrap: { position: 'absolute', right: 12, top: -14 },
  titleStamp: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 9, backgroundColor: BRAND.gold,
    borderWidth: 3, borderColor: BROWN, borderBottomWidth: 5, maxWidth: 210,
  },
  titleStampText: { fontFamily: 'Shark', fontSize: 16, color: BROWN, flexShrink: 1 },
  prizes: { paddingHorizontal: 12, marginTop: 10 },
  prize: {
    backgroundColor: BRAND.white, borderRadius: 18, padding: 10, marginBottom: 10, borderWidth: 2, borderColor: '#efe1b8', borderBottomWidth: 5,
  },
  prizeHero: { borderWidth: 3, borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip, borderBottomWidth: 6, backgroundColor: '#fffaea' },
  prizeHeroDone: { backgroundColor: '#fff3c4' },
  prizeReady: { borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip, backgroundColor: '#fffaea' },
  prizeTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prizeHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prizeHead: { flex: 1, fontFamily: 'Shark', fontSize: 19, color: BRAND.navy },
  prizeHeadHero: { fontSize: 21 },
  prizeNote: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft, marginTop: 8, textAlign: 'center' },
  medal: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff6d8', borderWidth: 3, borderColor: '#f1dca0',
    alignItems: 'center', justifyContent: 'center',
  },
  medalHero: { width: 64, height: 64, borderRadius: 32, borderColor: BRAND.goldLip, backgroundColor: BRAND.white, borderWidth: 3 },
  medalReady: { backgroundColor: '#fff3c4', borderColor: BRAND.gold },
  medalDone: { backgroundColor: '#fff3c4', borderColor: BRAND.gold },
  medalCheck: {
    position: 'absolute', right: -6, bottom: -6, width: 30, height: 30, borderRadius: 15, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#e7d7a8',
  },
  state: { paddingHorizontal: 10, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: '#eef4fb' },
  // Settled, not a button: cream with a gold edge.
  stateDone: { backgroundColor: '#fff8e4', borderWidth: 2, borderColor: '#f1dca0' },
  stateText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navy },
  wearingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, minHeight: 44, paddingHorizontal: 10, borderRadius: 14,
    backgroundColor: '#fff3c4', borderWidth: 2, borderColor: BRAND.gold,
  },
  wearingChipText: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: BROWN },
  wearingOff: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft, textDecorationLine: 'underline' },
  stateReady: { backgroundColor: '#fff3c4', borderWidth: 2, borderColor: BRAND.gold },
  medalQuiet: { width: 50, height: 50, borderRadius: 25 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stateDoneText: { color: BROWN },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipTitle: { backgroundColor: '#fff3c4', borderColor: BRAND.gold },
  chipTitleText: { fontFamily: 'Knockout', color: BROWN },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34, paddingHorizontal: 8, borderRadius: 11,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#efe1b8', maxWidth: '100%',
  },
  chipText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navy, flexShrink: 1 },
  ribbon: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10,
    width: '92%', height: 48, paddingHorizontal: 34, paddingBottom: 6,
  },
  ribbonText: { fontFamily: 'Shark', fontSize: 17, color: BROWN, flexShrink: 1 },
  ribbonSub: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft, textAlign: 'center', marginTop: 2 },
  wear: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', marginTop: 10,
    minHeight: 50, borderRadius: 25, backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 6, borderBottomColor: BRAND.goldLip,
  },
  wearOn: { backgroundColor: BRAND.white, borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip },
  wearText: { fontFamily: 'Shark', fontSize: 17, color: BROWN },
  slim: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 10, marginBottom: 10, borderRadius: 16,
    backgroundColor: '#fffaea', borderWidth: 2, borderColor: '#f1dca0',
  },
  slimMedal: { width: 32, height: 32, borderRadius: 16, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.gold },
  slimText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  slimLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  mini: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniChip: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  miniText: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy },
  finds: { paddingHorizontal: 16, marginTop: 0 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, minHeight: 46 },
  sectionText: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy },
  // Extras are for sharing, never a prize: Alex's heart (not the gift, which means "prize ready" on this page)
  // on a white button with a navy outline, so it never reads as a gold CLAIM.
  extras: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 46, borderRadius: 23,
    backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.navy, borderBottomWidth: 5,
  },
  extrasText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
  key: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 2 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keySticker: {
    width: 30, height: 30, borderRadius: 8, borderWidth: 2.5, borderBottomWidth: 4, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center',
  },
  keySlot: {
    width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: SLOT_EDGE, backgroundColor: SLOT,
    alignItems: 'center', justifyContent: 'center',
  },
  keyArt: { width: 22, height: 22 },
  keyText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft },
  plus: {
    minWidth: 32, height: 26, paddingHorizontal: 5, borderRadius: 13, backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center',
  },
  plusText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
  rarityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  rarityChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 32, borderRadius: 16, borderWidth: 2 },
  rarityLabel: { fontFamily: 'Shark', fontSize: 16 },
  rarityHint: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft, flexShrink: 1 },
  rarityCount: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
});
