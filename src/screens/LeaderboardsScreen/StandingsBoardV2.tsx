/**
 * One Standings board (v3: next-wave/standings-v3/DESIGN.md; v2 PROPOSAL.md).
 *
 * Layout, top to bottom: one pill (the board's number and the week's clock,
 * or the park chips on All-Time), a 236 pt podium, an infinite list, and your
 * own row pinned at the bottom, which slides away whenever your real row is on
 * screen.
 *
 * Kid first, one number per row: rank, shark, name, number. Nothing else on
 * a row. Your pinned row adds one line ("2 more rides to pass gr8scott").
 * Goals and anything else live on the card you get by tapping your row.
 *
 * Smooth: FlashList recycles rows, faces stay decoded in memory, and the next
 * page is fetched about two and a half screens before the end. Grey rows hold
 * its place, and a page never lands above what the kid is looking at (down in
 * the Your spot block it waits), so nothing on screen ever jumps.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { FlashList, type ListRenderItem as FlashRenderItem } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, AppState, InteractionManager, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View,
  type ViewToken,
} from 'react-native';
import Animated, {
  Easing, FadeInRight, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withRepeat, withSequence,
  withSpring, withTiming, ZoomIn, Extrapolation, runOnJS, useAnimatedReaction,
} from 'react-native-reanimated';
import * as RootNavigation from '../../RootNavigation';
import type { InventoryType } from '../../models/inventory-type';
import { markLastWeekSeen, type StandingsBoardKey } from '../../api/endpoints/me/standings';
import { LocationStatusContext } from '../../context/LocationProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import type { ParkType } from '../../models/park-type';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW, SharkLoader, textPreset } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import LastWeekCard from './LastWeekCard';
import MiniPodium, { MINI_PODIUM_HEIGHT, ScoreIcon } from './MiniPodium';
import { CROWN_ART } from './PodiumSpot';
import SharkCard from './SharkCard';
import StandingsShark from './StandingsShark';
import { onStandingsDemo } from './standingsDemo';
import { perfMark, StandingsPerfLog, startPerfScroll, STANDINGS_PERF_ON } from './standingsPerf';
import {
  cachedBoard, cachedParks, chooseAllTimePark, chosenAllTimePark, commitBoard, loadBoard, loadMore, loadParks, podiumChanged, prefetchBoards, readSeenRank, writeSeenRank,
} from './standingsV2Store';
import { prefetchLayers } from './faceLayers';
import { faceLayerSources, facePoints, wearsOwnLook } from './StandingsShark';
import {
  boardMatches, DIVIDER_HEIGHT, firstSkeletonIndex, nextStep, onlyFirstPage, safeToInsert, SKELETON_ROWS, rowOnScreen, youLabel, emptyCopy, isMissingEndpoint, isUnknownPark, itemLayouts, listItems, passedPlayers, podiumRows,
  podiumSignature, rankClimb, ROW_HEIGHT, rowLabel, scoreText, shouldPrefetch, weekLeft, youLine,
  type ListItem, type StandingsBoardModel, type StandingsMetric, type StandingsRowModel,
} from './standingsV2Model';

const tapSound = require('../../../assets/sounds/tap.mp3');
const rewardSound = require('../../../assets/sounds/reward.mp3');
const BARREL = require('../../../assets/images/screens/leaderboard/barrel.png');

/** Clears the raised compass button in the bottom bar. */
const YOU_CARD_BOTTOM = 52;
const YOU_CARD_HEIGHT = 72;
const HEADER_HEIGHT = MINI_PODIUM_HEIGHT + 18;

type Status = 'loading' | 'ready' | 'error';

let resultsShown = '';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<ListItem>) as unknown as React.ComponentType<Record<string, unknown>>;

// Stable list props (r2 perf: nothing new on every render).
const keyOfItem = (item: ListItem) => item.key;
const typeOfItem = (item: ListItem) => item.type;
const sizeOfItem = (layout: { size?: number }, item: ListItem) => {
  layout.size = item.type === 'divider' ? DIVIDER_HEIGHT : item.type === 'retry' ? ROW_HEIGHT * SKELETON_ROWS : ROW_HEIGHT;
};
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

/**
 * The board's one pill: what the number is and how long the week has left.
 * Gold on the last day, red (with a slow pulse) in the last three hours.
 */
function WeekPill({ endsAt, now }: { readonly endsAt: string | null; readonly now: number }) {
  const reduced = useUiReducedMotion();
  const week = weekLeft(endsAt, now);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduced || week.urgency !== 'last_hours') { pulse.value = 1; return; }
    pulse.value = withRepeat(withSequence(withTiming(1.05, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [week.urgency, reduced, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const tone = week.urgency === 'last_hours' ? BRAND.red : week.urgency === 'last_day' ? BRAND.gold : BRAND.white;
  const ink = week.urgency === 'last_hours' ? BRAND.white : BRAND.navy;
  return (
    <Animated.View accessible accessibilityRole="text" accessibilityLabel={`Ranked by rides won this week. ${week.spoken}`} style={[{
      flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: RADIUS.pill, alignSelf: 'center',
      backgroundColor: tone, borderWidth: 2, borderColor: week.urgency === 'last_hours' ? BRAND.redLip : week.urgency === 'last_day' ? BRAND.goldLip : 'rgba(5,52,110,0.18)',
    }, style]}>
      <ScoreIcon metric="ride_wins" size={24} />
      <Text maxFontSizeMultiplier={1.25} style={{ fontFamily: 'Shark', fontSize: 15, color: ink }}>Rides won</Text>
      {!!week.label && <View style={{ width: 2, height: 18, borderRadius: 1, backgroundColor: week.urgency === 'last_hours' ? 'rgba(255,255,255,0.5)' : 'rgba(5,52,110,0.2)' }} />}
      {!!week.label && <Text maxFontSizeMultiplier={1.25} style={{ fontFamily: 'Shark', fontSize: 15, color: ink }}>{week.label}</Text>}
    </Animated.View>
  );
}

/** All Parks plus one chip per park. The chosen chip is gold; it spins its coin while that park loads. */
function ParkChips({ parks, value, loading, onChange }: {
  readonly parks: readonly ParkType[]; readonly value: number | null; readonly loading: boolean; readonly onChange: (id: number | null) => void;
}) {
  const { playSound } = useContext(SoundEffectContext);
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = loading ? withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1) : withTiming(0, { duration: 120 });
  }, [loading, spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const items = [{ id: null as number | null, label: 'All Parks' }, ...parks.map(p => ({ id: p.id as number | null, label: p.display_name ?? p.name }))];
  // The chosen chip always scrolls fully into view (never clipped at the edge).
  const scroller = useRef<ScrollView>(null);
  const spots = useRef(new Map<string, { x: number; w: number }>());
  const { width: screenW } = useWindowDimensions();
  const reveal = useCallback((id: number | null) => {
    const spot = spots.current.get(String(id ?? 'all'));
    if (spot) scroller.current?.scrollTo({ x: Math.max(0, spot.x - (screenW - spot.w) / 2), animated: true });
  }, [screenW]);
  useEffect(() => { reveal(value); }, [value, reveal]);
  return (
    <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
      accessibilityLabel="Ranked by ride coins collected">
      {items.map(item => {
        const on = item.id === value;
        return (
          <Pressable key={item.id ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: on, busy: on && loading }}
            onLayout={event => {
              spots.current.set(String(item.id ?? 'all'), { x: event.nativeEvent.layout.x, w: event.nativeEvent.layout.width });
              if (on) reveal(item.id);
            }}
            accessibilityLabel={`Show ${item.label}`} hitSlop={4}
            onPress={() => {
              if (on) return;
              playSound(tapSound);
              void Haptics.selectionAsync().catch(() => undefined);
              onChange(item.id);
            }}
            style={({ pressed }) => ({
              height: 40, paddingHorizontal: 14, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: on ? BRAND.gold : BRAND.white, borderWidth: 2, borderBottomWidth: 4,
              borderColor: on ? BRAND.goldLip : 'rgba(5,52,110,0.2)', transform: [{ scale: pressed ? 0.95 : 1 }],
            })}>
            {on && loading ? <Animated.View style={spinStyle}><ScoreIcon metric="ride_coins" size={18} /></Animated.View>
              : item.id === null ? <ScoreIcon metric="ride_coins" size={18} /> : null}
            <Text maxFontSizeMultiplier={1.25} numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Text on the board grows with Dynamic Type, up to what its fixed-height row can hold. */
const FONT_CAP = 1.25;

/** The rank badge: a pill that widens with the digits, never below 13 pt (r2: 3 and 4 digit ranks stayed readable). */
export function RankBadge({ rank, me = false }: { readonly rank: number; readonly me?: boolean }) {
  const digits = String(rank).length;
  return (
    <View style={{ minWidth: 32, height: 32, paddingHorizontal: digits > 2 ? 7 : 4, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: me ? BRAND.navy : BRAND.blueBright, borderBottomWidth: 3, borderBottomColor: me ? '#021c3d' : BRAND.blueLip }}>
      <Text maxFontSizeMultiplier={1.1} numberOfLines={1}
        style={{ fontFamily: 'Shark', fontSize: digits <= 2 ? 16 : digits === 3 ? 14 : 13, color: BRAND.white, fontVariant: ['tabular-nums'] }}>{rank}</Text>
    </View>
  );
}

/** A 64 pt row: rank, shark, name, number. Muted rows (friends with no rides yet) show the shark greyed and no number. */
const BoardRow = memo(function BoardRow({ row, metric, muted, enter, step, onPress }: {
  readonly row: StandingsRowModel; readonly metric: StandingsMetric; readonly muted: boolean;
  /** Your own row only: the next step as its one secondary chip (r3: Friends shows it too). */
  readonly step: ReturnType<typeof nextStep> | null;
  /** First paint only: the slide-in delay for this row, or null (recycled rows never animate). */
  readonly enter: number | null;
  readonly onPress: (row: StandingsRowModel) => void;
}) {
  return (
    <Animated.View entering={enter != null ? FadeInRight.delay(enter).springify().damping(16).stiffness(180) : undefined}
      style={{ height: ROW_HEIGHT, backgroundColor: BRAND.cream, paddingHorizontal: 12, justifyContent: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={rowLabel(row, metric) + (row.isMe && step && 'plus' in step ? `. ${step.text}` : '')}
        onPress={() => onPress(row)}
        style={({ pressed }) => ({
          height: ROW_HEIGHT - 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: RADIUS.md,
          borderWidth: row.isMe ? 3 : 2, borderColor: row.isMe ? BRAND.gold : 'rgba(7,104,185,0.14)',
          backgroundColor: row.isMe ? '#fff4cc' : BRAND.white, transform: [{ scale: pressed ? 0.98 : 1 }],
        })}>
        <View style={{ minWidth: 40, alignItems: 'center' }}>
          {row.rank ? <RankBadge rank={row.rank} me={row.isMe} />
            : <View style={{ opacity: 0.35 }}><ScoreIcon metric={metric} size={22} /></View>}
        </View>
        <View style={{ marginLeft: 8 }}><StandingsShark avatar={row.avatar} size={40} muted={muted} /></View>
        <View style={{ flex: 1, marginLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text maxFontSizeMultiplier={FONT_CAP} numberOfLines={1} style={{ flexShrink: 1, fontFamily: 'Shark', fontSize: 18, color: muted ? BRAND.navySoft : BRAND.navy, textTransform: 'uppercase' }}>{row.name}</Text>
          {row.isMe && step && (step.kind === 'jump' || step.kind === 'top10' || step.kind === 'goal') ? (
            <StepGlyphs compact plus={step.plus} target={step.target} metric={metric} kind={step.kind} icon={step.icon} />
          ) : row.isMe && (
            <View style={{ paddingHorizontal: 7, height: 20, borderRadius: 10, justifyContent: 'center', backgroundColor: BRAND.navy }}>
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.white }}>YOU</Text>
            </View>
          )}
        </View>
        {!muted && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ScoreIcon metric={metric} size={22} />
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontFamily: 'Shark', fontSize: 22, color: BRAND.blue, fontVariant: ['tabular-nums'], minWidth: 28, textAlign: 'right' }}>{row.score}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

/** Where the next page will land: a grey row the same size as a real one, so the list never jumps. The first one tells VoiceOver. */
const SkeletonRow = memo(function SkeletonRow({ first }: { readonly first: boolean }) {
  return (
    <View accessible={first} accessibilityLabel={first ? 'Loading more players' : undefined}
      importantForAccessibility={first ? 'yes' : 'no-hide-descendants'}
      style={{ height: ROW_HEIGHT, backgroundColor: BRAND.cream, paddingHorizontal: 12, justifyContent: 'center' }}>
      <View style={{ height: ROW_HEIGHT - 8, borderRadius: RADIUS.md, backgroundColor: 'rgba(5,52,110,0.06)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(5,52,110,0.08)' }} />
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(5,52,110,0.08)' }} />
        <View style={{ width: 110, height: 14, borderRadius: 7, backgroundColor: 'rgba(5,52,110,0.08)' }} />
      </View>
    </View>
  );
});

/** Three failed loads in a row: one big button in place of the grey rows (same height, nothing moves). */
function RetryRow({ onPress }: { readonly onPress: () => void }) {
  return (
    <View style={{ height: ROW_HEIGHT * SKELETON_ROWS, backgroundColor: BRAND.cream, alignItems: 'center', justifyContent: 'center' }}>
      <GameButton label="Tap to load more" icon="retry" size="compact" onPress={onPress} />
    </View>
  );
}

/** The end of the list: how many are racing (r2: never a blank cream void under Your spot). */
function FooterRow({ label, metric }: { readonly label: string; readonly metric: StandingsMetric }) {
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={label}
      style={{ height: ROW_HEIGHT, backgroundColor: BRAND.cream, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <ScoreIcon metric={metric} size={18} />
      <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.navySoft }}>{label}</Text>
    </View>
  );
}

function Divider({ label }: { readonly label: string }) {
  return (
    <View style={{ height: DIVIDER_HEIGHT, backgroundColor: BRAND.cream, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, gap: 10 }}>
      <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(5,52,110,0.15)' }} />
      <Text maxFontSizeMultiplier={FONT_CAP} accessibilityRole="header" style={[textPreset('label'), { color: BRAND.navySoft }]}>{label}</Text>
      <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(5,52,110,0.15)' }} />
    </View>
  );
}

/**
 * The next step as glyphs a 6 year old reads without words: "+1 [cart] -> #107",
 * "+3 [cart] -> TOP 10", "+2 [cart] -> +25 XP". The sentence is the spoken label.
 */
function StepGlyphs({ plus, target, metric, kind, icon, compact = false }: {
  readonly plus: number; readonly target: string; readonly metric: StandingsMetric; readonly kind: 'jump' | 'top10' | 'goal';
  readonly icon: 'crown' | 'trophy' | 'star' | 'up' | null;
  /** On your own row in the list: a smaller chip that fits beside your name. */
  readonly compact?: boolean;
}) {
  const h = compact ? 22 : 24;
  const f = compact ? 13 : 15;
  const gold = kind !== 'jump' || icon === 'crown';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 4 : 6, height: h + 2 }} importantForAccessibility="no-hide-descendants">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: compact ? 6 : 8, height: h, borderRadius: h / 2, backgroundColor: BRAND.blueBright }}>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: 'Shark', fontSize: f, color: BRAND.white, fontVariant: ['tabular-nums'] }}>{`+${plus}`}</Text>
        <ScoreIcon metric={metric} size={compact ? 15 : 18} />
      </View>
      <GameIcon name="arrow" size={compact ? 13 : 16} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: compact ? 6 : 8, height: h, borderRadius: h / 2,
        backgroundColor: gold ? BRAND.gold : BRAND.navy, borderWidth: gold ? 2 : 0, borderColor: BRAND.goldLip }}>
        {icon === 'crown' && <GameIcon name="crown" size={compact ? 13 : 16} />}
        {icon === 'trophy' && <GameIcon name="trophy" size={compact ? 13 : 16} />}
        {icon === 'star' && <GameIcon name="star" size={compact ? 13 : 16} />}
        {icon === 'up' && <GameIcon name="arrow" size={compact ? 12 : 14} style={{ transform: [{ rotate: '-90deg' }] }} />}
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: 'Shark', fontSize: f, color: gold ? BRAND.navy : BRAND.white, fontVariant: ['tabular-nums'] }}>{target}</Text>
      </View>
    </View>
  );
}

/**
 * Your row, pinned at the bottom (v3): your rank badge, your shark, your number,
 * and one next step in glyphs. Docked on its own cream strip with a fade above,
 * so rows slide under it the way they slide under the tab bar. The overtake
 * plays in the step slot: each player you passed slides by with a tick, then
 * "Up N!" lands on your rank.
 */
function YouRow({ model, climb, climbFrom, climbId, passed, hidden, snapId, now, inPark, onPress, onOpenCard, onGoRide, onClimbDone }: {
  readonly model: StandingsBoardModel; readonly climb: number; readonly passed: readonly StandingsRowModel[];
  /** The rank you climbed from: shown until the last "Passed X" tick, so the reveal is never spoiled. */
  readonly climbFrom: number | null;
  /** Changes for every climb, so two climbs of the same size both play. */
  readonly climbId: number;
  /** Changes when the board becomes the active tab: the row jumps to its state, no slide. */
  readonly snapId: number;
  readonly hidden: boolean; readonly now: number;
  /** At a park: a new player gets a GO RIDE button; at home, no dead-end button. */
  readonly inPark: boolean;
  /** Ranked: shows your row in the list. */
  readonly onPress: () => void;
  /** Not ranked yet: your card (with your goals). */
  readonly onOpenCard: () => void;
  readonly onGoRide: () => void;
  /** The climb finished; the row may slide away again if your real row is on screen. */
  readonly onClimbDone: () => void;
}) {
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  const me = model.me;
  const step = nextStep(model, inPark);
  const shown = useSharedValue(reduced ? 1 : 0);
  const [step2, setStep2] = useState(-1);
  const urgent = model.board !== 'all_time' && weekLeft(model.endsAt, now).urgency !== 'calm' && step.kind !== 'join' && step.kind !== 'leader' && step.kind !== 'review';

  const lastSnap = useRef(snapId);
  useLayoutEffect(() => {
    const snap = lastSnap.current !== snapId;
    lastSnap.current = snapId;
    shown.value = reduced || snap ? (hidden ? 0 : 1) : withSpring(hidden ? 0 : 1, { damping: 16, stiffness: 190 });
  }, [hidden, reduced, shown, snapId]);

  // The overtake: each player you passed slides by with a tick, then "Up N!" lands.
  useEffect(() => {
    if (climb <= 0) { setStep2(-1); return; }
    setStep2(-1);
    const announce = () => AccessibilityInfo.announceForAccessibility(`Up ${climb} ${climb === 1 ? 'place' : 'places'}! You are number ${me?.rank ?? ''} now.`);
    if (reduced || !passed.length) {
      setStep2(passed.length);
      playSound(rewardSound);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      announce();
      const done = setTimeout(onClimbDone, 1800);
      return () => clearTimeout(done);
    }
    const timers = passed.map((_, i) => setTimeout(() => {
      setStep2(i);
      playSound(tapSound);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }, 500 + i * 380));
    timers.push(setTimeout(() => {
      setStep2(passed.length);
      playSound(rewardSound);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      announce();
    }, 500 + passed.length * 380));
    timers.push(setTimeout(onClimbDone, 500 + passed.length * 380 + 1800));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [climbId]);

  // Clamped: the spring may overshoot, but the dock never rises above its rest spot.
  // It slides fully opaque and fades only in the last quarter of its travel, so its
  // text never ghosts over a row (r2).
  const dockStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, shown.value) * 4),
    transform: [{ translateY: Math.max(0, 1 - shown.value) * (YOU_CARD_HEIGHT + YOU_CARD_BOTTOM + 30) }],
  }));
  const joining = step.kind === 'join';
  const reviewing = step.kind === 'review';
  const label = youLabel(model, climb, inPark);
  const score = me?.score ?? 0;
  // "0 of 211" is a scary denominator for a new player: just 0 until the first coin.
  const shownScore = reviewing ? `${model.review?.rides ?? 0}` : score > 0 ? scoreText(model, score) : '0';
  const passing = step2 >= 0 && step2 < passed.length ? passed[step2] : null;
  const climbed = climb > 0 && step2 >= passed.length;
  // Until the last tick: the old rank and no new line (r2: "You're #1" showed before the ticks).
  const revealing = climb > 0 && passed.length > 0 && step2 < passed.length;
  const shownRank = revealing && climbFrom ? climbFrom : me?.rank;

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[{ position: 'absolute', left: 0, right: 0, bottom: YOU_CARD_BOTTOM - 8 }, dockStyle]}>
      {/* The dock: rows fade out above it. It stops above the nav's raised icons
          (r2: a strip down to the screen edge erased them). */}
      <LinearGradient pointerEvents="none" colors={['rgba(255,248,228,0)', BRAND.cream]} style={{ height: 22 }} />
      <View style={{ backgroundColor: BRAND.cream, paddingHorizontal: 12, paddingBottom: 8, borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg }}>
        <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={joining ? 'Opens your card' : 'Shows your row'}
          // GO RIDE sits inside this row, so VoiceOver reaches it as an action (r2 kids UX).
          accessibilityActions={joining && step.kind === 'join' && step.canRide ? [{ name: 'activate' }, { name: 'goRide', label: 'Go ride' }] : undefined}
          onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'goRide') onGoRide(); else (joining ? onOpenCard : onPress)(); }}
          onPress={joining ? onOpenCard : onPress}
          style={({ pressed }) => ({
            height: YOU_CARD_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: RADIUS.lg,
            backgroundColor: '#fff4cc', borderWidth: 3, borderBottomWidth: 6, borderColor: urgent ? BRAND.goldLip : BRAND.gold, ...SHADOW.lifted,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}>
          <View style={{ minWidth: 44, alignItems: 'center' }}>
            {shownRank ? (
              <>
                <RankBadge rank={shownRank} me />
                {climbed && (
                  // Wider than the rank column (r2 capture: "Up 129!" was clipped to "Up 1").
                  <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(9).stiffness(220)} importantForAccessibility="no-hide-descendants"
                    style={{ position: 'absolute', top: -27, left: -18, width: 80, alignItems: 'center' }}>
                    <View style={{ paddingHorizontal: 8, height: 24, borderRadius: 12, justifyContent: 'center', backgroundColor: BRAND.green,
                      borderWidth: 2, borderColor: BRAND.greenLip }}>
                      <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.white }}>{`Up ${climb}!`}</Text>
                    </View>
                  </Animated.View>
                )}
              </>
            ) : reviewing ? <GameIcon name="timer" size={30} /> : <ScoreIcon metric={model.metric} size={30} />}
          </View>
          <View style={{ marginLeft: 12 }}>{me && <StandingsShark avatar={me.avatar} size={44} ring={BRAND.gold} />}</View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ScoreIcon metric={model.metric} size={20} />
              <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: 'Shark', fontSize: 20, color: BRAND.navy, fontVariant: ['tabular-nums'] }}>{shownScore}</Text>
            </View>
            {passing ? (
              <Animated.View key={passing.key} entering={reduced ? undefined : FadeInRight.springify().damping(14)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 26 }}>
                <GameIcon name="arrow" size={16} style={{ transform: [{ rotate: '-90deg' }] }} />
                <StandingsShark avatar={passing.avatar} size={20} />
                <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.greenLip, flexShrink: 1, textTransform: 'uppercase' }}>{`Passed ${passing.name}!`}</Text>
              </Animated.View>
            ) : revealing ? (
              <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.greenLip }}>CLIMBING!</Text>
            ) : step.kind === 'jump' || step.kind === 'top10' || step.kind === 'goal' ? (
              <StepGlyphs plus={step.plus} target={step.target} metric={model.metric} kind={step.kind} icon={step.icon} />
            ) : (
              <Text maxFontSizeMultiplier={1.15} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
                style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.navy }}>{step.text}</Text>
            )}
          </View>
          {joining && step.canRide && (
            <Pressable accessibilityRole="button" accessibilityLabel="Go ride: opens the map" hitSlop={8} onPress={onGoRide}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 44, borderRadius: 14,
                backgroundColor: BRAND.gold, borderWidth: 2, borderBottomWidth: 4, borderColor: BRAND.goldLip, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
              <GameIcon name="map" size={18} />
              <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.navy }}>GO RIDE</Text>
            </Pressable>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** First paint with no cache: the podium's open spots and grey rows, never a full-screen loader. */
function Skeleton() {
  return (
    <View>
      <MiniPodium podium={[null, null, null]} metric="ride_wins" celebrate={false} meJoined={false} playKey="skeleton" onPress={() => undefined} />
      <View style={{ marginTop: -18, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, backgroundColor: BRAND.cream, paddingTop: 14 }}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} accessible={false} style={{ height: ROW_HEIGHT - 8, marginHorizontal: 12, marginVertical: 4, borderRadius: RADIUS.md, backgroundColor: 'rgba(5,52,110,0.06)' }} />
        ))}
      </View>
    </View>
  );
}

export default function StandingsBoardV2({ board, meId, onMissing, active = true }: {
  readonly board: StandingsBoardKey;
  readonly meId: number | null;
  /** The chosen tab. Hidden boards stay mounted but stay quiet (no climb, no cards). */
  readonly active?: boolean;
  /** The server has no v2 endpoint: show the legacy screen. */
  readonly onMissing: () => void;
}) {
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  // At a park, a new player gets GO RIDE; at home there is no dead-end button.
  const inPark = !!useContext(LocationStatusContext).park;
  const [parks, setParks] = useState<ParkType[]>(cachedParks());
  const [parkId, setParkId] = useState<number | null>(board === 'all_time' ? chosenAllTimePark() : null);
  const parkIdRef = useRef(parkId);
  parkIdRef.current = parkId;
  const first = cachedBoard(meId, board, parkId);
  const [model, setModel] = useState<StandingsBoardModel | null>(first?.model ?? null);
  const [status, setStatus] = useState<Status>(first ? 'ready' : 'loading');
  const [switching, setSwitching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [climb, setClimb] = useState(0);
  // While your climb plays, the You card stays up even if your row is on screen.
  const [climbing, setClimbing] = useState(false);
  const [climbId, setClimbId] = useState(0);
  const [passed, setPassed] = useState<readonly StandingsRowModel[]>([]);
  const [climbFrom, setClimbFrom] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [meJoined, setMeJoined] = useState(false);
  const [myRowVisible, setMyRowVisible] = useState(false);
  const [card, setCard] = useState<StandingsRowModel | null>(null);
  const [results, setResults] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Three page loads failed in a row: the grey rows become "Tap to load more".
  const [pageFailed, setPageFailed] = useState(false);
  const list = useRef<FlashList<ListItem>>(null);
  const request = useRef(0);
  const entered = useRef(false);
  const scrollY = useSharedValue(0);
  const [podiumOnScreen, setPodiumOnScreen] = useState(true);
  const pendingClimb = useRef<(() => void) | null>(null);
  const closeResults = useCallback(() => {
    setResults(false);
    void markLastWeekSeen().catch(() => undefined);
    const climbNow = pendingClimb.current;
    pendingClimb.current = null;
    if (climbNow) setTimeout(climbNow, 350);
  }, []);

  useEffect(() => {
    if (board !== 'all_time') return;
    let live = true;
    loadParks().then(list => {
      if (!live) return;
      setParks(list);
      // First All-Time open: warm every park so chip taps are instant.
      prefetchBoards(meId, list.map(park => ({ board: 'all_time' as const, parkId: park.id })));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [board, meId]);

  // Day dots tick once a minute while the app is open; a return to the app refreshes.
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') setNow(Date.now()); }, 60_000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') { setNow(Date.now()); loadRef.current(false); } });
    return () => { clearInterval(timer); sub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeRef = useRef(active);
  activeRef.current = active;
  const react = useCallback(async (next: StandingsBoardModel) => {
    // A hidden board saves its moments for when the kid opens it.
    if (!activeRef.current) return;
    const seen = await readSeenRank(meId, next);
    const up = rankClimb(seen, next.me?.rank);
    writeSeenRank(meId, next);
    const changed = await podiumChanged(meId, next);
    const top = podiumRows(next);
    const joined = changed && top.some(row => row?.isMe) && (seen == null || seen > 3);
    const showResults = next.board === 'week' && !!next.lastWeek && !next.lastWeek.seen
      && resultsShown !== `${meId}:${next.lastWeek.weekStart}`;
    const climbNow = up > 0
      ? () => { setPassed(passedPlayers(next.rows, seen as number, next.me?.rank as number).slice(0, 4)); setClimbFrom(seen); setClimbing(true); setClimb(up); setClimbId(id => id + 1); }
      : null;
    // The podium rise, its confetti and the overtake all wait for the Monday card,
    // so the best moment is never played behind it (r2 game feel).
    const celebrateNow = () => { setCelebrate(changed); setMeJoined(joined); climbNow?.(); };
    if (showResults) { setCelebrate(false); setMeJoined(false); pendingClimb.current = celebrateNow; } else celebrateNow();
    // The Monday card shows once: unseen on the server and not already shown this session.
    if (next.board === 'week' && next.lastWeek && !next.lastWeek.seen && resultsShown !== `${meId}:${next.lastWeek.weekStart}`) {
      resultsShown = `${meId}:${next.lastWeek.weekStart}`;
      setResults(true);
    }
  }, [meId]);

  const load = useCallback((force: boolean) => {
    // A new board, park or refresh: any page in flight or held for the old one must
    // never land on it (r2 perf: a warm-cache park switch returned before this bump).
    request.current += 1;
    heldPage.current = null;
    failures.current = 0;
    retryAt.current = 0;
    setPageFailed(false);
    const hit = cachedBoard(meId, board, parkId);
    if (hit) {
      setModel(hit.model);
      setStatus('ready');
      setSwitching(false);
      if (hit.fresh && !force) { void react(hit.model); return; }
    } else if (model) {
      // Keep the last board on screen (dimmed) while the next one loads.
      setSwitching(true);
    } else {
      setStatus('loading');
    }
    const id = ++request.current;
    loadBoard(meId, board, parkId).then(next => {
      if (id !== request.current) return;
      setModel(next);
      setStatus('ready');
      setSwitching(false);
      setRefreshing(false);
      void react(next);
    }).catch(error => {
      if (id !== request.current) return;
      setRefreshing(false);
      setSwitching(false);
      if (isMissingEndpoint(error)) { onMissing(); return; }
      if (isUnknownPark(error)) { chooseAllTimePark(null); setParkId(null); return; }
      // A background refresh that fails keeps the board on screen.
      setStatus(current => (hit || current === 'ready' ? 'ready' : 'error'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, parkId, meId, react, onMissing]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => { load(false); }, [load]);
  // Returning to this tab: refresh if stale and play any moment saved while hidden.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) loadRef.current(false);
    wasActive.current = active;
  }, [active]);
  useEffect(() => { const t = setTimeout(() => { entered.current = true; }, 900); return () => clearTimeout(t); }, []);

  const items = useMemo(() => (model ? listItems(model, { failed: pageFailed }) : []), [model, pageFailed]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Infinite scroll: one page at a time, merged into the cached board.
  const fetchingMore = useRef(false);
  const lastVisible = useRef(0);
  const firstVisible = useRef(0);
  // A page that lands while the kid is down in the Your spot block would push
  // it down: it waits here until they scroll back up to the grey rows.
  const heldPage = useRef<StandingsBoardModel | null>(null);
  // Failed pages back off (1 s, 2 s, 4 s, 8 s); after 3 the kid gets a button.
  const failures = useRef(0);
  const retryAt = useRef(0);
  // While "show my row" is animating, nothing lands and nothing is fetched:
  // the jump's target is a pixel offset, and a page landing mid-flight would move it.
  const jumpingUntil = useRef(0);
  const canInsert = useCallback(() => Date.now() >= jumpingUntil.current && safeToInsert(firstVisible.current, itemsRef.current), []);
  const apply = useCallback((next: StandingsBoardModel) => {
    // (r3: React startTransition throws inside this RN build's renderer, so a page lands as a normal update.)
    setModel(next);
    // Only a page the kid can see becomes the cached board.
    commitBoard(meId, board, parkId, next);
  }, [meId, board, parkId]);
  const more = useCallback((why: 'idle' | 'scroll' | 'end' | 'tap') => {
    // A held page is the next page: never fetch past it.
    if (fetchingMore.current || heldPage.current || !model || model.nextOffset == null) return;
    if (why === 'tap') { failures.current = 0; retryAt.current = 0; setPageFailed(false); }
    if (Date.now() < retryAt.current || failures.current >= 3) return;
    fetchingMore.current = true;
    const id = request.current;
    const started = Date.now();
    const at = firstSkeletonIndex(itemsRef.current);
    const before = model.rows.length;
    if (STANDINGS_PERF_ON) perfMark(`page-request ${board} offset=${model.nextOffset} why=${why} rowsToEnd=${at - lastVisible.current}`);
    loadMore(meId, board, parkId, model).then(next => {
      if (STANDINGS_PERF_ON) perfMark(`page-arrived ${board} ${Date.now() - started}ms rows=${typeof next === "object" && next ? next.rows.length : String(next)} rowsToEndAtArrival=${firstSkeletonIndex(itemsRef.current) - lastVisible.current}`);
      failures.current = 0;
      retryAt.current = 0;
      if (!next || id !== request.current) return;
      // The board was rebuilt between pages: refresh (the store refetches the pages) rather than append.
      if (next === 'rebuilt') { loadRef.current(true); return; }
      if (!boardMatches(next, board, parkIdRef.current)) return;
      if (canInsert()) {
        apply(next);
        // VoiceOver near the end hears that more players arrived.
        if (lastVisible.current >= at - 3) AccessibilityInfo.announceForAccessibility(`${Math.max(0, next.rows.length - before)} more players`);
      } else {
        heldPage.current = next;
        if (STANDINGS_PERF_ON) perfMark(`page-held ${board}`);
      }
    }).catch(error => {
      if (STANDINGS_PERF_ON) perfMark(`page-error ${String((error as Error)?.message ?? error).slice(0, 160)}`);
      failures.current += 1;
      retryAt.current = Date.now() + Math.min(8000, 1000 * 2 ** (failures.current - 1));
      if (failures.current >= 3) setPageFailed(true);
      if (STANDINGS_PERF_ON) perfMark(`page-failed ${board} ${Date.now() - started}ms failures=${failures.current}`);
    }).finally(() => { fetchingMore.current = false; });
  }, [model, meId, board, parkId, apply, canInsert]);
  const moreRef = useRef(more);
  moreRef.current = more;
  const setModelRef = useRef(apply);
  setModelRef.current = apply;
  const canInsertRef = useRef(canInsert);
  // Page 2 is fetched while the kid looks at the podium (from the network or
  // the warm cache alike), so the first fling never waits on the network.
  const firstPageOnly = !!model && onlyFirstPage(model);
  useEffect(() => {
    if (!active || !firstPageOnly) return undefined;
    const task = InteractionManager.runAfterInteractions(() => moreRef.current('idle'));
    return () => task.cancel();
  }, [active, firstPageOnly]);
  // The podium faces and yours are decoded at their drawn size before they show.
  useEffect(() => {
    if (!model) return;
    podiumRows(model).forEach((row, i) => {
      const inv = row?.avatar.inventory as InventoryType | null | undefined;
      if (row && wearsOwnLook(inv ?? null)) prefetchLayers(faceLayerSources(inv), facePoints(i === 0 ? 72 : 60));
    });
    const mine = model.me?.avatar.inventory as InventoryType | null | undefined;
    if (wearsOwnLook(mine ?? null)) prefetchLayers(faceLayerSources(mine), facePoints(44));
  }, [model]);
  const layouts = useMemo(() => itemLayouts(items), [items]);
  const podium = useMemo(() => (model ? podiumRows(model) : [null, null, null] as const), [model]);
  const myIndex = items.findIndex(item => item.type === 'row' && item.row.isMe);
  const meOnPodium = podium.some(row => row?.isMe);

  const onRow = useCallback((row: StandingsRowModel) => {
    playSound(tapSound);
    // Friends may open each other's profile; a public row opens the safe shark card.
    if (board === 'friends' && !row.isMe) RootNavigation.navigate('Player', { player: row.id });
    else setCard(row);
  }, [board, playSound]);

  const scrollToMe = useCallback(() => {
    playSound(tapSound);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    jumpingUntil.current = Date.now() + 1200;
    if (myIndex >= 0) list.current?.scrollToIndex({ index: myIndex, viewPosition: 0.35, animated: !reduced });
    else toTopRef.current();
  }, [myIndex, playSound, reduced]);

  const pendingRef = useRef<(() => void) | null>(null);
  pendingRef.current = results ? closeResults : null;
  const cardRef = useRef<StandingsRowModel | null>(null);
  cardRef.current = podium[0] ?? null;
  const meRef = useRef<StandingsRowModel | null>(null);
  meRef.current = model?.me ?? null;
  const scrollRef = useRef(scrollToMe);
  scrollRef.current = scrollToMe;
  useEffect(() => onStandingsDemo(event => {
    if (!activeRef.current) return;
    if (event.type === 'scrollMe') scrollRef.current();
    if (event.type === 'park' && board === 'all_time') { chooseAllTimePark(event.parkId); setParkId(event.parkId); }
    if (event.type === 'dismiss') { setCard(null); if (pendingRef.current) pendingRef.current(); else setResults(false); }
    if (event.type === 'card') setCard(cardRef.current);
    if (event.type === 'myCard') setCard(meRef.current);
    if (event.type === 'scrollBy') list.current?.scrollToOffset({ offset: Math.max(0, scrollY.value + event.dy), animated: true });
    if (event.type === 'refresh' && board === 'week') loadRef.current(true);
  }), [board]);

  const onScroll = useAnimatedScrollHandler(event => { scrollY.value = event.contentOffset.y; });
  // A long way back to the top: snap to two screens from it, then animate the rest,
  // so the list never lays out every row in between (r2 perf: a 300 ms JS stall).
  const toTop = useCallback(() => {
    if (scrollY.value > ROW_HEIGHT * 40) list.current?.scrollToOffset({ offset: ROW_HEIGHT * 14, animated: false });
    list.current?.scrollToOffset({ offset: 0, animated: !reduced });
  }, [scrollY, reduced]);
  const toTopRef = useRef(toTop);
  toTopRef.current = toTop;
  // Perf captures only (both perf flags set at bundle time): a scripted fling and drag on the active board.
  useEffect(() => {
    if (!active) return undefined;
    return startPerfScroll(
      (dy, animated) => list.current?.scrollToOffset({ offset: scrollY.value + dy, animated }),
      () => toTopRef.current(),
    );
  }, [active, scrollY]);
  useAnimatedReaction(() => scrollY.value < MINI_PODIUM_HEIGHT - 60, (onScreen, before) => {
    if (onScreen !== before) runOnJS(setPodiumOnScreen)(onScreen);
  });
  const viewability = VIEWABILITY;
  // Your row's visibility is tracked even while this tab is hidden, and applied when it shows.
  const myRowSeen = useRef(false);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    myRowSeen.current = viewableItems.some(token => (token.item as ListItem)?.type === 'row' && ((token.item as ListItem & { row: StandingsRowModel }).row.isMe));
    if (activeRef.current) setMyRowVisible(myRowSeen.current);
    // A fast programmatic scroll can report an empty window for a frame: keep the last known one.
    if (viewableItems.length) {
      lastVisible.current = viewableItems.reduce((max, token) => Math.max(max, token.index ?? 0), 0);
      firstVisible.current = viewableItems.reduce((min, token) => Math.min(min, token.index ?? min), Number.MAX_SAFE_INTEGER);
    }
    // Back up at the grey rows: a held page lands now.
    if (heldPage.current && canInsertRef.current()) {
      const held = heldPage.current;
      heldPage.current = null;
      if (boardMatches(held, board, parkIdRef.current)) setModelRef.current(held);
    }
    // About two and a half screens before the grey rows: fetch, so the page lands before the kid gets there.
    if (activeRef.current && Date.now() >= jumpingUntil.current && shouldPrefetch(lastVisible.current, itemsRef.current, firstVisible.current)) moreRef.current('scroll');
  }).current;
  // Becoming the active tab: wake the list and work out from geometry whether your
  // row is on screen, so the You card never duplicates a visible row.
  const viewport = useRef(0);
  const [snapId, setSnapId] = useState(0);
  const prevActive = useRef(active);
  useLayoutEffect(() => {
    const becameActive = active && !prevActive.current;
    prevActive.current = active;
    if (!active) return;
    // Snap only on the hidden-to-active edge; a data refresh while active springs.
    if (becameActive) setSnapId(id => id + 1);
    list.current?.recordInteraction();
    const index = items.findIndex(item => item.type === 'row' && item.row.isMe);
    const onScreen = index >= 0 && rowOnScreen(HEADER_HEIGHT + (layouts[index]?.offset ?? 0), ROW_HEIGHT, scrollY.value, viewport.current);
    myRowSeen.current = onScreen;
    setMyRowVisible(onScreen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, items]);

  const metric = model?.metric ?? 'ride_wins';
  // Your own row in the list carries the next step too (Friends shows your row, not the dock).
  const myStep = useMemo(() => (model ? nextStep(model, inPark) : null), [model, inPark]);
  const renderItem: FlashRenderItem<ListItem> = useCallback(({ item, index }) => {
    if (item.type === 'divider') return <Divider label={item.label} />;
    if (item.type === 'skeleton') return <SkeletonRow first={item.key === 'skeleton-0'} />;
    if (item.type === 'retry') return <RetryRow onPress={() => moreRef.current('tap')} />;
    if (item.type === 'footer') return <FooterRow label={item.label} metric={metric} />;
    return (
      <BoardRow row={item.row} metric={metric} muted={item.muted} step={item.row.isMe ? myStep : null}
        enter={!reduced && !entered.current && index < 8 && celebrate ? 120 + index * 45 : null}
        onPress={onRow} />
    );
  }, [metric, reduced, celebrate, onRow, myStep]);
  const onEndReached = useCallback(() => { if (activeRef.current && canInsert()) moreRef.current('end'); }, [canInsert]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadRef.current(true); }, []);
  const refreshControl = useMemo(() => <RefreshControl tintColor={BRAND.white} refreshing={refreshing} onRefresh={onRefresh} />, [refreshing, onRefresh]);
  // Rows slide under the strip with a soft shadow, never a hard cut (r2 art).
  const topShade = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [HEADER_HEIGHT - 40, HEADER_HEIGHT], [0, 1], Extrapolation.CLAMP) }));

  const podiumFade = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [40, MINI_PODIUM_HEIGHT - 80], [1, 0], Extrapolation.CLAMP),
  }));
  const header = useMemo(() => (
    <View style={{ height: HEADER_HEIGHT }}>
      {/* The podium fades as it scrolls under the ribbon, so no score pill floats alone. */}
      <Animated.View style={podiumFade}>
        <MiniPodium podium={podium} metric={model?.metric ?? 'ride_wins'} celebrate={celebrate} meJoined={meJoined}
          playKey={`${board}:${parkId ?? 'all'}:${podiumSignature(podium)}:${celebrate}`} onPress={onRow} />
      </Animated.View>
      <View style={{ marginTop: -2, height: 20, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg,
        backgroundColor: BRAND.cream, borderTopWidth: 3, borderColor: BRAND.white }} />
    </View>
  ), [podium, model?.metric, celebrate, meJoined, board, parkId, onRow, podiumFade]);

  const strip = (
    <View style={{ paddingTop: 10, paddingBottom: 6, minHeight: 56 }}>
      {board === 'all_time' ? (
        <ParkChips parks={parks} value={parkId} loading={switching} onChange={id => { chooseAllTimePark(id); setParkId(id); }} />
      ) : (
        <WeekPill endsAt={model?.endsAt ?? null} now={now} />
      )}
    </View>
  );

  if (status === 'error') {
    return (
      <View style={{ flex: 1 }}>
        {strip}
        <SharkLoader state="error" tone="onBlue" compact title="Standings didn't load" onRetry={() => load(true)} />
      </View>
    );
  }
  if (status === 'loading' || !model) {
    return <View style={{ flex: 1 }}>{strip}<Skeleton /></View>;
  }

  const scored = model.rows.some(row => row.score > 0);
  const noFriends = board === 'friends' && !model.friendsCount;
  // Nobody to race yet: one big friendly card, no empty podium.
  if (noFriends || (!scored && board !== 'friends')) {
    const copy = emptyCopy(board, model.friendsCount);
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl tintColor={BRAND.white} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}>
        {strip}
        <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(14).stiffness(160)} style={{
          marginHorizontal: 20, marginTop: 16, padding: 22, alignItems: 'center', borderRadius: RADIUS.xl, overflow: 'hidden',
          backgroundColor: BRAND.cream, borderWidth: 3, borderBottomWidth: 6, borderColor: BRAND.white, ...SHADOW.lifted,
        }}>
          {board === 'friends' ? <GameIcon name="heart" size={84} /> : (
            <View style={{ alignItems: 'center' }}>
              <Image source={CROWN_ART[1]} style={{ width: 64, height: 64, marginBottom: -14, zIndex: 2 }} contentFit="contain" />
              <View style={{ width: 200, height: 86, overflow: 'hidden', borderRadius: RADIUS.md }}>
                <Image source={BARREL} style={{ width: 200, height: 200 * 683 / 1079, marginLeft: 0 }} contentFit="cover" />
              </View>
            </View>
          )}
          <Text maxFontSizeMultiplier={1.25} accessibilityRole="header" style={[textPreset('title'), { textAlign: 'center', textTransform: 'uppercase', marginTop: 10 }]}>{copy.title}</Text>
          <Text maxFontSizeMultiplier={1.25} style={[textPreset('body'), { textAlign: 'center', color: BRAND.navySoft, marginTop: 6, marginBottom: 18 }]}>{copy.message}</Text>
          <GameButton label={copy.action} icon={copy.target === 'Friends' ? 'heart' : 'ride'}
            onPress={() => { playSound(tapSound); RootNavigation.navigate(copy.target); }} />
        </Animated.View>
        <LastWeekCard result={results ? model.lastWeek : null} me={model.me}
          onClose={closeResults} />
      </ScrollView>
    );
  }

  // A hidden tab keeps its card down, so activating it can never flash a duplicate of your row.
  const hideYou = !active || (!climbing && (myRowVisible || (meOnPodium && podiumOnScreen)));

  return (
    <View style={{ flex: 1 }}>
      {strip}
      <View style={{ flex: 1, opacity: switching ? 0.6 : 1 }} onLayout={event => { viewport.current = event.nativeEvent.layout.height; }}>
        <AnimatedFlashList
          ref={list as never}
          data={items as ListItem[]}
          keyExtractor={keyOfItem}
          renderItem={renderItem as never}
          extraData={renderItem}
          getItemType={typeOfItem}
          estimatedItemSize={ROW_HEIGHT}
          estimatedFirstItemOffset={HEADER_HEIGHT}
          overrideItemLayout={sizeOfItem}
          ListHeaderComponent={header}
          // A hidden tab keeps only what is near its viewport.
          drawDistance={active ? ROW_HEIGHT * 12 : ROW_HEIGHT * 3}
          onScroll={onScroll}
          scrollEventThrottle={16}
          viewabilityConfig={viewability}
          onViewableItemsChanged={onViewable}
          // Backstop for a fling past the prefetch point.
          onEndReached={onEndReached}
          onEndReachedThreshold={2}
          refreshControl={refreshControl}
          // Room for the docked row only while it shows (r2: no cream void under Your spot).
          ListFooterComponent={<View style={{ backgroundColor: BRAND.cream, height: hideYou ? YOU_CARD_BOTTOM + 12 : YOU_CARD_HEIGHT + YOU_CARD_BOTTOM + 34 }} />}
        />
        {/* Rows soften into the strip instead of a hard cut (r2 art): a cream fade and a hairline shadow. */}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: 20 }, topShade]}>
          <View style={{ height: 2, backgroundColor: 'rgba(5,52,110,0.18)' }} />
          <LinearGradient colors={[BRAND.cream, 'rgba(255,248,228,0)']} style={{ flex: 1 }} />
        </Animated.View>
      </View>
      <YouRow model={model} climb={climb} climbFrom={climbFrom} climbId={climbId} passed={passed} hidden={hideYou} snapId={snapId} now={now} inPark={inPark} onPress={scrollToMe}
        onOpenCard={() => { playSound(tapSound); setCard(model.me); }}
        onGoRide={() => { playSound(tapSound); RootNavigation.navigate('Explore'); }}
        onClimbDone={() => { setClimbing(false); setClimb(0); setPassed([]); setClimbFrom(null); }} />
      <SharkCard row={card} metric={model.metric} board={board} goals={card?.isMe ? model.goals : null} onClose={() => setCard(null)} />
      <LastWeekCard result={results ? model.lastWeek : null} me={model.me}
        onClose={closeResults} />
      {STANDINGS_PERF_ON && active && <StandingsPerfLog board={board} />}
    </View>
  );
}
