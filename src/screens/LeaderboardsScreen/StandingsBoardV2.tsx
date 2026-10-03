/**
 * One Standings v2 board (PROPOSAL.md, round 2 fixes in grading/r1).
 *
 * Layout, top to bottom: one slim strip (the board's unit, the week's day
 * dots or the park chips), a 236 pt podium that collapses into a sticky top-3
 * ribbon on scroll, a fixed-height virtualized list, and the You card pinned
 * at the bottom, which slides away whenever your own row is on screen.
 *
 * Kid first: one number per board, one icon per meaning (cart = this week,
 * ride coin = forever), short words, big targets. Public rows open a safe
 * shark card, never a profile. Celebrations play only for real changes, and
 * the loudest one is yours: passing players, then "Up 4!".
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Image as ExpoImage } from 'expo-image';
import { outfitLayerUrls } from '../../helpers/wardrobe';
import type { InventoryType } from '../../models/inventory-type';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, AppState, FlatList, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View,
  type ListRenderItem, type ViewToken,
} from 'react-native';
import Animated, {
  Easing, FadeInRight, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withRepeat, withSequence,
  withSpring, withTiming, ZoomIn, Extrapolation, runOnJS, useAnimatedReaction, type SharedValue,
} from 'react-native-reanimated';
import * as RootNavigation from '../../RootNavigation';
import { markLastWeekSeen, type StandingsBoardKey } from '../../api/endpoints/me/standings';
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
import {
  cachedBoard, cachedParks, chooseAllTimePark, chosenAllTimePark, loadBoard, loadParks, podiumChanged, prefetchBoards, readSeenRank, writeSeenRank,
} from './standingsV2Store';
import {
  chaseChip, chaseProgress, DIVIDER_HEIGHT, youLabel, emptyCopy, isMissingEndpoint, isUnknownPark, itemLayouts, listItems, passedPlayers, podiumRows,
  podiumSignature, rankClimb, ROW_HEIGHT, rowLabel, scoreText, weekDots, youLine,
  type ListItem, type StandingsBoardModel, type StandingsMetric, type StandingsRowModel,
} from './standingsV2Model';

const tapSound = require('../../../assets/sounds/tap.mp3');
const rewardSound = require('../../../assets/sounds/reward.mp3');
const BARREL = require('../../../assets/images/screens/leaderboard/barrel.png');

/** Clears the raised compass button in the bottom bar. */
const YOU_CARD_BOTTOM = 52;
const YOU_CARD_HEIGHT = 84;
const RIBBON_HEIGHT = 56;
const HEADER_HEIGHT = MINI_PODIUM_HEIGHT + 18;

type Status = 'loading' | 'ready' | 'error';

let resultsShown = '';

/** The week's seven day dots, today glowing; gold on the last day, red in the last three hours. */
function WeekDots({ endsAt, now }: { readonly endsAt: string | null; readonly now: number }) {
  const reduced = useUiReducedMotion();
  const week = weekDots(endsAt, now);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduced || week.urgency === 'calm') { pulse.value = 1; return; }
    pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [week.urgency, reduced, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const tone = week.urgency === 'last_hours' ? BRAND.red : week.urgency === 'last_day' ? BRAND.gold : BRAND.white;
  const ink = week.urgency === 'calm' ? BRAND.navy : week.urgency === 'last_day' ? BRAND.navy : BRAND.white;
  return (
    <Animated.View accessible accessibilityRole="text" accessibilityLabel={week.spoken} style={[{
      flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: RADIUS.pill,
      backgroundColor: tone, borderWidth: 2, borderColor: week.urgency === 'last_hours' ? BRAND.redLip : week.urgency === 'last_day' ? BRAND.goldLip : 'rgba(5,52,110,0.18)',
    }, style]}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {week.dots.map((dot, i) => (
          <View key={i} style={{
            width: dot.state === 'today' ? 12 : 8, height: dot.state === 'today' ? 12 : 8, borderRadius: 6, alignSelf: 'center',
            backgroundColor: dot.state === 'past' ? 'rgba(5,52,110,0.25)' : dot.state === 'today' ? BRAND.blueBright : week.urgency === 'calm' ? BRAND.sky : 'rgba(255,255,255,0.7)',
            borderWidth: dot.state === 'today' ? 2 : 0, borderColor: BRAND.white,
          }} />
        ))}
      </View>
      <Text style={{ fontFamily: 'Shark', fontSize: 15, color: ink }}>{week.label}</Text>
    </Animated.View>
  );
}

function UnitChip({ metric }: { readonly metric: StandingsMetric }) {
  const label = metric === 'ride_coins' ? 'Ride coins' : 'Rides won';
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={metric === 'ride_coins' ? 'Ranked by ride coins collected' : 'Ranked by rides won this week'}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40, borderRadius: RADIUS.pill,
        backgroundColor: BRAND.white, borderWidth: 2, borderColor: 'rgba(5,52,110,0.18)' }}>
      <ScoreIcon metric={metric} size={24} />
      <Text style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>{label}</Text>
    </View>
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
    <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
      <UnitChip metric="ride_coins" />
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
            {on && loading && <Animated.View style={spinStyle}><ScoreIcon metric="ride_coins" size={16} /></Animated.View>}
            <Text numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A 64 pt row. Muted rows (friends with no rides yet) show the shark greyed and no number. */
const BoardRow = memo(function BoardRow({ row, metric, muted, animate, index, detail, chase, onPress }: {
  readonly row: StandingsRowModel; readonly metric: StandingsMetric; readonly muted: boolean; readonly animate: boolean;
  readonly index: number; readonly detail: string | null;
  /** Your row while the You card is away: the chase bar, "+N" and the rival's face. */
  readonly chase: { readonly progress: number; readonly chip: string; readonly avatar: StandingsRowModel['avatar'] } | null;
  readonly onPress: (row: StandingsRowModel) => void;
}) {
  const tenth = row.rank != null && row.rank % 10 === 0;
  return (
    <Animated.View entering={animate ? FadeInRight.delay(120 + index * 45).springify().damping(16).stiffness(180) : undefined}
      style={{ height: ROW_HEIGHT, backgroundColor: BRAND.cream, paddingHorizontal: 12, justifyContent: 'center' }}>
      {tenth && <View style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 2, borderRadius: 1, backgroundColor: 'rgba(5,52,110,0.12)' }} />}
      <Pressable accessibilityRole="button" accessibilityLabel={rowLabel(row, metric) + (detail ? `. ${detail}` : '')}
        onPress={() => onPress(row)}
        style={({ pressed }) => ({
          height: ROW_HEIGHT - 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: RADIUS.md,
          borderWidth: row.isMe ? 3 : 2, borderColor: row.isMe ? BRAND.gold : 'rgba(7,104,185,0.14)',
          backgroundColor: row.isMe ? '#fff4cc' : BRAND.white, transform: [{ scale: pressed ? 0.98 : 1 }],
        })}>
        <View style={{ width: 40, alignItems: 'center' }}>
          {row.rank ? (
            <View style={{ minWidth: 32, height: 32, paddingHorizontal: 4, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
              backgroundColor: tenth ? BRAND.navy : BRAND.blueBright, borderBottomWidth: 3, borderBottomColor: BRAND.blueLip }}>
              <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: row.rank > 99 ? 12 : 16, color: BRAND.white, fontVariant: ['tabular-nums'] }}>{row.rank}</Text>
            </View>
          ) : <View style={{ opacity: 0.35 }}><ScoreIcon metric={metric} size={22} /></View>}
        </View>
        <View style={{ marginLeft: 6 }}><StandingsShark avatar={row.avatar} size={40} muted={muted} /></View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 18, color: muted ? BRAND.navySoft : BRAND.navy, textTransform: 'uppercase' }}>{row.name}</Text>
          {chase ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(5,52,110,0.14)', overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(chase.progress * 100)}%`, height: 6, borderRadius: 3, backgroundColor: BRAND.blueBright }} />
              </View>
              <View style={{ paddingHorizontal: 4, height: 18, borderRadius: 9, justifyContent: 'center', backgroundColor: BRAND.blueBright }}>
                <Text style={{ fontFamily: 'Shark', fontSize: 11, color: BRAND.white }}>{chase.chip}</Text>
              </View>
              <StandingsShark avatar={chase.avatar} size={22} />
            </View>
          ) : (row.isMe || detail) && (
            <Text numberOfLines={1} style={[textPreset('caption'), { color: row.isMe ? BRAND.goldLip : BRAND.navySoft }]}>{detail ?? 'YOU'}</Text>
          )}
        </View>
        {!muted && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ScoreIcon metric={metric} size={22} />
            <Text style={{ fontFamily: 'Shark', fontSize: 22, color: BRAND.blue, fontVariant: ['tabular-nums'], minWidth: 28, textAlign: 'right' }}>{row.score}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

function Divider({ label }: { readonly label: string }) {
  return (
    <View style={{ height: DIVIDER_HEIGHT, backgroundColor: BRAND.cream, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, gap: 10 }}>
      <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(5,52,110,0.15)' }} />
      <Text accessibilityRole="header" style={[textPreset('label'), { color: BRAND.navySoft }]}>{label}</Text>
      <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(5,52,110,0.15)' }} />
    </View>
  );
}

/** The goal pips (3, 8, 15 rides this week): gold when reached. */
function GoalPips({ model }: { readonly model: StandingsBoardModel }) {
  if (!model.goals.length) return null;
  const reached = model.goals.filter(g => g.reached).length;
  return (
    <View accessible accessibilityLabel={`Weekly goals: ${reached} of ${model.goals.length} reached. Next goal ${model.goals.find(g => !g.reached)?.at ?? 'done'} rides.`}
      style={{ flexDirection: 'row', gap: 4 }}>
      {model.goals.map(goal => (
        <View key={goal.at} style={{ minWidth: 26, height: 22, paddingHorizontal: 5, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
          backgroundColor: goal.reached ? BRAND.gold : BRAND.white, borderWidth: 2, borderColor: goal.reached ? BRAND.goldLip : 'rgba(5,52,110,0.2)' }}>
          {goal.reached ? <GameIcon name="check" size={14} />
            : <Text style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.navySoft }}>{goal.at}</Text>}
        </View>
      ))}
    </View>
  );
}

/**
 * The pinned You card: rank (or NEW), your shark, your number and goal pips,
 * one line, and a bar that ends at the face of the player you are chasing
 * with a "+2" chip, so the goal reads without words.
 */
function YouCard({ model, climb, climbId, passed, hidden, now, onPress, onGoRide, onClimbDone }: {
  readonly model: StandingsBoardModel; readonly climb: number; readonly passed: readonly StandingsRowModel[];
  /** Changes for every climb, so two climbs of the same size both play. */
  readonly climbId: number;
  readonly hidden: boolean; readonly now: number; readonly onPress: () => void;
  /** NEW players: the card's button opens the map. */
  readonly onGoRide: () => void;
  /** The climb finished; the card may slide away again if your row is on screen. */
  readonly onClimbDone: () => void;
}) {
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  const me = model.me;
  const line = youLine(model);
  const chip = chaseChip(model, line.state);
  const progress = line.state === 'join' ? 0.06 : line.state === 'review' ? 0 : chaseProgress(model);
  const fill = useSharedValue(reduced ? progress : 0);
  const shown = useSharedValue(reduced ? 1 : 0);
  const [step, setStep] = useState(-1);
  const urgent = model.board !== 'all_time' && weekDots(model.endsAt, now).urgency !== 'calm' && !!model.chase && model.chase.toPass <= 2;

  useEffect(() => { fill.value = reduced ? progress : withDelay250(progress); }, [progress, reduced, fill]);
  useEffect(() => {
    shown.value = reduced ? (hidden ? 0 : 1) : withSpring(hidden ? 0 : 1, { damping: 16, stiffness: 190 });
  }, [hidden, reduced, shown]);

  // The overtake: each player you passed slides by with a tick, then "Up N!" lands.
  useEffect(() => {
    if (climb <= 0) { setStep(-1); return; }
    setStep(-1);
    const announce = () => AccessibilityInfo.announceForAccessibility(`Up ${climb} ${climb === 1 ? 'place' : 'places'}! You are number ${me?.rank ?? ''} now.`);
    if (reduced || !passed.length) {
      setStep(passed.length);
      playSound(rewardSound);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      announce();
      const done = setTimeout(onClimbDone, 1800);
      return () => clearTimeout(done);
    }
    const timers = passed.map((_, i) => setTimeout(() => {
      setStep(i);
      playSound(tapSound);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }, 500 + i * 380));
    timers.push(setTimeout(() => {
      setStep(passed.length);
      playSound(rewardSound);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      announce();
    }, 500 + passed.length * 380));
    timers.push(setTimeout(onClimbDone, 500 + passed.length * 380 + 1800));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [climbId]);

  const barStyle = useAnimatedStyle(() => ({ width: `${Math.round(fill.value * 100)}%` }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * (YOU_CARD_HEIGHT + YOU_CARD_BOTTOM) }],
  }));
  const joining = line.state === 'join';
  const label = youLabel(model, climb);
  const reviewing = line.state === 'review';
  const shownScore = reviewing ? `${model.review?.rides ?? 0}` : scoreText(model, me?.score ?? 0);
  const passing = step >= 0 && step < passed.length ? passed[step] : null;

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[{ position: 'absolute', left: 12, right: 12, bottom: YOU_CARD_BOTTOM }, cardStyle]}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={joining ? 'Opens the map' : 'Shows your row'}
        onPress={joining ? onGoRide : onPress}
        style={({ pressed }) => ({
          height: YOU_CARD_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: RADIUS.lg,
          backgroundColor: '#fff4cc', borderWidth: 3, borderBottomWidth: 6, borderColor: urgent ? BRAND.goldLip : BRAND.gold, ...SHADOW.lifted,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}>
        <View style={{ width: 54, alignItems: 'center' }}>
          {me?.rank ? (
            <>
              <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 28, color: BRAND.blue, fontVariant: ['tabular-nums'] }}>{`#${me.rank}`}</Text>
              {climb > 0 && step >= passed.length ? (
                <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(9).stiffness(220)} importantForAccessibility="no-hide-descendants"
                  style={{ paddingHorizontal: 6, height: 20, borderRadius: 10, justifyContent: 'center', backgroundColor: BRAND.green,
                    borderWidth: 2, borderColor: BRAND.greenLip }}>
                  <Text style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.white }}>{`Up ${climb}!`}</Text>
                </Animated.View>
              ) : <Text style={[textPreset('label'), { color: BRAND.goldLip, fontSize: 12 }]}>YOU</Text>}
            </>
          ) : line.state === 'review' ? (
            <GameIcon name="timer" size={34} />
          ) : (
            <View style={{ paddingHorizontal: 8, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.goldLip }}>
              <Text style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>NEW</Text>
            </View>
          )}
        </View>
        {me && <StandingsShark avatar={me.avatar} size={48} ring={BRAND.gold} />}
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ScoreIcon metric={model.metric} size={20} />
              <Text style={{ fontFamily: 'Shark', fontSize: 20, color: BRAND.navy, fontVariant: ['tabular-nums'] }}>{shownScore}</Text>
            </View>
            <GoalPips model={model} />
          </View>
          {passing ? (
            // The overtake plays inside your card: never over anyone's row.
            <Animated.View key={passing.key} entering={reduced ? undefined : FadeInRight.springify().damping(14)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 20 }}>
              <GameIcon name="arrow" size={16} style={{ transform: [{ rotate: '-90deg' }] }} />
              <StandingsShark avatar={passing.avatar} size={20} />
              <Text numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.green, flexShrink: 1 }}>{`Passed ${passing.name}!`}</Text>
            </Animated.View>
          ) : (
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
              style={{ fontFamily: 'Knockout', fontSize: 16, color: urgent ? BRAND.goldLip : BRAND.navy }}>{line.text}</Text>
          )}
          {line.state === 'review' ? (
            <Text numberOfLines={1} style={[textPreset('caption'), { color: BRAND.navySoft }]}>{line.sub}</Text>
          ) : joining ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 24, borderRadius: 12,
                backgroundColor: BRAND.gold, borderWidth: 2, borderBottomWidth: 3, borderColor: BRAND.goldLip }}>
                <GameIcon name="ride" size={16} />
                <Text style={{ fontFamily: 'Shark', fontSize: 13, color: BRAND.navy }}>GO RIDE</Text>
              </View>
              <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(5,52,110,0.14)', overflow: 'hidden' }}>
                <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: BRAND.gold }, barStyle]} />
              </View>
              <View style={{ paddingHorizontal: 5, height: 20, borderRadius: 10, justifyContent: 'center', backgroundColor: BRAND.gold }}>
                <Text style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.navy }}>+1</Text>
              </View>
            </View>
          ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(5,52,110,0.14)', overflow: 'hidden' }}>
              <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: line.state === 'leader' ? BRAND.gold : BRAND.blueBright }, barStyle]} />
            </View>
            {model.chase && chip && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <View style={{ paddingHorizontal: 5, height: 20, borderRadius: 10, justifyContent: 'center', backgroundColor: BRAND.blueBright }}>
                  <Text style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.white }}>{chip}</Text>
                </View>
                <StandingsShark avatar={model.chase.avatar} size={22} />
              </View>
            )}
          </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const withDelay250 = (to: number) => withSequence(withTiming(0, { duration: 250 }), withTiming(to, { duration: 650 }));

/** Three mini sharks with their numbers; appears when the podium scrolls away. */
function TopRibbon({ podium, metric, scrollY }: {
  readonly podium: readonly (StandingsRowModel | null)[]; readonly metric: StandingsMetric; readonly scrollY: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [MINI_PODIUM_HEIGHT - 90, MINI_PODIUM_HEIGHT - 30], [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * -RIBBON_HEIGHT }] };
  });
  const order = [podium[1], podium[0], podium[2]];
  return (
    <Animated.View pointerEvents="none" style={[{
      position: 'absolute', top: 0, left: 12, right: 12, height: RIBBON_HEIGHT, borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg,
      backgroundColor: BRAND.navy, borderWidth: 2, borderTopWidth: 0, borderColor: BRAND.gold, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-around', ...SHADOW.card,
    }, style]}>
      {order.map((row, i) => {
        const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
        return (
          <View key={rank} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '33%' }}>
            <GameIcon name={`medal${rank}` as 'medal1'} size={20} />
            {row ? <StandingsShark avatar={row.avatar} size={30} ring={row.isMe ? BRAND.gold : undefined} /> : null}
            <Text numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.white, fontVariant: ['tabular-nums'] }}>{row ? row.score : '-'}</Text>
          </View>
        );
      })}
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

export default function StandingsBoardV2({ board, meId, onMissing }: {
  readonly board: StandingsBoardKey;
  readonly meId: number | null;
  /** The server has no v2 endpoint: show the legacy screen. */
  readonly onMissing: () => void;
}) {
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  const [parks, setParks] = useState<ParkType[]>(cachedParks());
  const [parkId, setParkId] = useState<number | null>(board === 'all_time' ? chosenAllTimePark() : null);
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
  const [celebrate, setCelebrate] = useState(false);
  const [meJoined, setMeJoined] = useState(false);
  const [myRowVisible, setMyRowVisible] = useState(false);
  const [card, setCard] = useState<StandingsRowModel | null>(null);
  const [results, setResults] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const list = useRef<FlatList<ListItem>>(null);
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

  const react = useCallback(async (next: StandingsBoardModel) => {
    const seen = await readSeenRank(meId, next);
    const up = rankClimb(seen, next.me?.rank);
    writeSeenRank(meId, next);
    const changed = await podiumChanged(meId, next);
    const top = podiumRows(next);
    setCelebrate(changed);
    setMeJoined(changed && top.some(row => row?.isMe) && (seen == null || seen > 3));
    const showResults = next.board === 'week' && !!next.lastWeek && !next.lastWeek.seen
      && resultsShown !== `${meId}:${next.lastWeek.weekStart}`;
    if (up > 0) {
      const climbNow = () => { setPassed(passedPlayers(next.rows, seen as number, next.me?.rank as number).slice(0, 4)); setClimbing(true); setClimb(up); setClimbId(id => id + 1); };
      // The overtake waits for the Monday card, so it is never played behind it.
      if (showResults) pendingClimb.current = climbNow; else climbNow();
    }
    // The Monday card shows once: unseen on the server and not already shown this session.
    if (next.board === 'week' && next.lastWeek && !next.lastWeek.seen && resultsShown !== `${meId}:${next.lastWeek.weekStart}`) {
      resultsShown = `${meId}:${next.lastWeek.weekStart}`;
      setResults(true);
    }
  }, [meId]);

  const load = useCallback((force: boolean) => {
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
  useEffect(() => { const t = setTimeout(() => { entered.current = true; }, 900); return () => clearTimeout(t); }, []);

  const items = useMemo(() => (model ? listItems(model) : []), [model]);
  // Outfit art for the podium and your row is fetched before it is drawn.
  useEffect(() => {
    if (!model) return;
    const urls = [...podiumRows(model), model.me].flatMap(row => {
      const inv = row?.avatar.inventory as InventoryType | null | undefined;
      return [...outfitLayerUrls(inv), inv?.skin_item?.no_eye_url].filter((u): u is string => !!u);
    });
    if (urls.length) void ExpoImage.prefetch(urls).catch(() => undefined);
  }, [model]);
  const layouts = useMemo(() => itemLayouts(items), [items]);
  const podium = useMemo(() => (model ? podiumRows(model) : [null, null, null] as const), [model]);
  const myIndex = items.findIndex(item => item.type === 'row' && item.row.isMe);
  const meOnPodium = podium.some(row => row?.isMe);
  const line = useMemo(() => (model ? youLine(model) : null), [model]);

  const onRow = useCallback((row: StandingsRowModel) => {
    playSound(tapSound);
    // Friends may open each other's profile; a public row opens the safe shark card.
    if (board === 'friends' && !row.isMe) RootNavigation.navigate('Player', { player: row.id });
    else setCard(row);
  }, [board, playSound]);

  const scrollToMe = useCallback(() => {
    playSound(tapSound);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (myIndex >= 0) list.current?.scrollToIndex({ index: myIndex, viewPosition: 0.35, animated: !reduced });
    else list.current?.scrollToOffset({ offset: 0, animated: !reduced });
  }, [myIndex, playSound, reduced]);

  const pendingRef = useRef<(() => void) | null>(null);
  pendingRef.current = results ? closeResults : null;
  const cardRef = useRef<StandingsRowModel | null>(null);
  cardRef.current = podium[0] ?? null;
  const scrollRef = useRef(scrollToMe);
  scrollRef.current = scrollToMe;
  useEffect(() => onStandingsDemo(event => {
    if (event.type === 'scrollMe') scrollRef.current();
    if (event.type === 'park' && board === 'all_time') { chooseAllTimePark(event.parkId); setParkId(event.parkId); }
    if (event.type === 'dismiss') { setCard(null); if (pendingRef.current) pendingRef.current(); else setResults(false); }
    if (event.type === 'card') setCard(cardRef.current);
  }), [board]);

  const onScroll = useAnimatedScrollHandler(event => { scrollY.value = event.contentOffset.y; });
  useAnimatedReaction(() => scrollY.value < MINI_PODIUM_HEIGHT - 60, (onScreen, before) => {
    if (onScreen !== before) runOnJS(setPodiumOnScreen)(onScreen);
  });
  const viewability = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setMyRowVisible(viewableItems.some(token => (token.item as ListItem)?.type === 'row' && ((token.item as ListItem & { row: StandingsRowModel }).row.isMe)));
  }).current;

  const renderItem: ListRenderItem<ListItem> = useCallback(({ item, index }) => {
    if (item.type === 'divider') return <Divider label={item.label} />;
    return (
      <BoardRow row={item.row} metric={model?.metric ?? 'ride_wins'} muted={item.muted} index={index}
        animate={!reduced && !entered.current && index < 8 && celebrate}
        detail={item.row.isMe && line ? line.text : null}
        chase={item.row.isMe && model?.chase && line && (line.state === 'chasing' || line.state === 'tied')
          ? { progress: chaseProgress(model), chip: chaseChip(model, line.state) ?? '', avatar: model.chase.avatar } : null}
        onPress={onRow} />
    );
  }, [model, reduced, celebrate, line, onRow]);

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
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 16 }}>
          <UnitChip metric="ride_wins" />
          <WeekDots endsAt={model?.endsAt ?? null} now={now} />
        </View>
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
          <Text accessibilityRole="header" style={[textPreset('title'), { textAlign: 'center', textTransform: 'uppercase', marginTop: 10 }]}>{copy.title}</Text>
          <Text style={[textPreset('body'), { textAlign: 'center', color: BRAND.navySoft, marginTop: 6, marginBottom: 18 }]}>{copy.message}</Text>
          <GameButton label={copy.action} icon={copy.target === 'Friends' ? 'heart' : 'ride'}
            onPress={() => { playSound(tapSound); RootNavigation.navigate(copy.target); }} />
        </Animated.View>
        <LastWeekCard result={results ? model.lastWeek : null} me={model.me}
          onClose={closeResults} />
      </ScrollView>
    );
  }

  const hideYou = !climbing && (myRowVisible || (meOnPodium && podiumOnScreen));

  return (
    <View style={{ flex: 1 }}>
      {strip}
      <View style={{ flex: 1, opacity: switching ? 0.6 : 1 }}>
        <Animated.FlatList
          ref={list as never}
          data={items as ListItem[]}
          keyExtractor={item => item.key}
          renderItem={renderItem}
          ListHeaderComponent={header}
          getItemLayout={(_, index) => ({
            length: layouts[index]?.length ?? ROW_HEIGHT, offset: HEADER_HEIGHT + (layouts[index]?.offset ?? index * ROW_HEIGHT), index,
          })}
          initialNumToRender={10}
          windowSize={9}
          maxToRenderPerBatch={10}
          onScroll={onScroll}
          scrollEventThrottle={16}
          viewabilityConfig={viewability}
          onViewableItemsChanged={onViewable}
          refreshControl={<RefreshControl tintColor={BRAND.white} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
          ListFooterComponent={<View style={{ backgroundColor: BRAND.cream, height: YOU_CARD_HEIGHT + YOU_CARD_BOTTOM + 48 }} />}
        />
        <TopRibbon podium={podium} metric={model.metric} scrollY={scrollY} />
      </View>
      <YouCard model={model} climb={climb} climbId={climbId} passed={passed} hidden={hideYou} now={now} onPress={scrollToMe}
        onGoRide={() => { playSound(tapSound); RootNavigation.navigate('Explore'); }}
        onClimbDone={() => { setClimbing(false); setClimb(0); setPassed([]); }} />
      <SharkCard row={card} metric={model.metric} board={board} onClose={() => setCard(null)} />
      <LastWeekCard result={results ? model.lastWeek : null} me={model.me}
        onClose={closeResults} />
    </View>
  );
}
