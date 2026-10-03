/**
 * One Standings v2 board (PROPOSAL.md): a slim info strip, the barrel podium,
 * a virtualized list, and the pinned You card with the next target.
 *
 * Kid first: one number per board, short words, big tap targets. Motion runs
 * on the UI thread and every animation has a reduced-motion path.
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, RefreshControl, ScrollView, Text, View, type ListRenderItem } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import * as RootNavigation from '../../RootNavigation';
import allParks from '../../api/endpoints/parks/allParks';
import type { StandingsBoardKey } from '../../api/endpoints/me/standings';
import Avatar from '../../components/Avatar';
import FloatingParticles from '../../components/FloatingParticles';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import type { ParkType } from '../../models/park-type';
import type { PlayerType } from '../../models/player-type';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW, SharkLoader, textPreset } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { useCountUp } from './PodiumSpot';
import StandingsPodium from './StandingsPodium';
import { StandingsRow } from './StandingsRow';
import { onStandingsDemo } from './standingsDemo';
import { cachedBoard, loadBoard, readSeenRank, writeSeenRank } from './standingsV2Store';
import {
  chaseProgress, emptyCopy, isMissingEndpoint, rankClimb, resetCountdown, rowLabel, scoreSummary, splitPodium, unitWord, youLine,
  type StandingsBoardModel, type StandingsRowModel,
} from './standingsV2Model';

const tapSound = require('../../../assets/sounds/tap.mp3');
const rewardSound = require('../../../assets/sounds/reward.mp3');

/** Clears the raised compass button in the bottom bar. */
const YOU_CARD_BOTTOM = 54;
const YOU_CARD_HEIGHT = 92;

// Parks list and the chosen All-Time park survive tab switches.
const parksCache: { parks: ParkType[]; parkId: number | null } = { parks: [], parkId: null };

type Status = 'loading' | 'ready' | 'error';

const asPlayer = (row: StandingsRowModel) => row.avatar as unknown as PlayerType;

/** Small rounded pill on the blue strip: an icon and a few words. */
function InfoPill({ icon, text, gold }: { readonly icon: 'ride' | 'timer' | 'heart'; readonly text: string; readonly gold?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: RADIUS.pill,
      backgroundColor: gold ? BRAND.gold : BRAND.white, borderWidth: 2, borderColor: gold ? BRAND.goldLip : 'rgba(5,52,110,0.18)',
    }}>
      <GameIcon name={icon} size={22} />
      <Text style={{ fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}

/** All Parks plus one chip per park. The chosen chip is gold and springs in. */
function ParkChips({ parks, value, onChange }: { readonly parks: readonly ParkType[]; readonly value: number | null; readonly onChange: (id: number | null) => void }) {
  const { playSound } = useContext(SoundEffectContext);
  const items = [{ id: null as number | null, label: 'All Parks' }, ...parks.map(p => ({ id: p.id as number | null, label: p.display_name ?? p.name }))];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      {items.map(item => {
        const on = item.id === value;
        return (
          <Pressable key={item.id ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: on }}
            accessibilityLabel={`Show ${item.label}`}
            onPress={() => {
              if (on) return;
              playSound(tapSound);
              void Haptics.selectionAsync().catch(() => undefined);
              onChange(item.id);
            }}
            hitSlop={6}
            style={({ pressed }) => ({
              height: 40, paddingHorizontal: 14, borderRadius: RADIUS.pill, justifyContent: 'center',
              backgroundColor: on ? BRAND.gold : BRAND.white, borderWidth: 2, borderBottomWidth: 4,
              borderColor: on ? BRAND.goldLip : 'rgba(5,52,110,0.2)', transform: [{ scale: pressed ? 0.95 : 1 }],
            })}>
            <Text numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 16, color: BRAND.navy }}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * The pinned You card: your shark, rank and number, and one target line with
 * a bar that fills as you close in. A climb since your last look pops a gold
 * "Up 3!" badge with the reward sound and a success haptic.
 */
function YouCard({ model, climb, onPress }: { readonly model: StandingsBoardModel; readonly climb: number; readonly onPress: () => void }) {
  const reduced = useUiReducedMotion();
  const me = model.me;
  const line = youLine(model);
  const progress = chaseProgress(model);
  const score = useCountUp(me?.score ?? 0, true, reduced, 700);
  const fill = useSharedValue(reduced ? progress : 0);
  const lift = useSharedValue(reduced ? 0 : 40);
  useEffect(() => {
    fill.value = reduced ? progress : withDelay(250, withTiming(progress, { duration: 650 }));
  }, [progress, reduced, fill]);
  useEffect(() => {
    lift.value = reduced ? 0 : withSpring(0, { damping: 15, stiffness: 180 });
  }, [lift, reduced]);
  const barStyle = useAnimatedStyle(() => ({ width: `${Math.round(fill.value * 100)}%` }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  const rankText = me?.rank ? `#${me.rank}` : '--';
  const label = `You are ${me?.rank ? `rank ${me.rank}` : 'not ranked yet'} with ${me?.score ?? 0} ${unitWord(model.metric, me?.score ?? 0)}. ${line.text}.`;

  return (
    <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 12, right: 12, bottom: YOU_CARD_BOTTOM }, cardStyle]}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Shows your row" onPress={onPress}
        style={({ pressed }) => ({
          height: YOU_CARD_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderRadius: RADIUS.lg,
          backgroundColor: '#fff4cc', borderWidth: 3, borderBottomWidth: 6, borderColor: BRAND.gold, ...SHADOW.lifted,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}>
        <View style={{ width: 62, alignItems: 'center' }}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 30, color: BRAND.blue, fontVariant: ['tabular-nums'] }}>{rankText}</Text>
          <Text style={[textPreset('label'), { color: BRAND.goldLip, fontSize: 12 }]}>YOU</Text>
        </View>
        <View style={{ width: 54, height: 54, borderRadius: 27, overflow: 'hidden', backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.white }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <GameIcon name="shark" size={42} />
          </View>
          {me && <Avatar player={asPlayer(me)} size="sm" />}
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <GameIcon name="ride" size={22} />
            <Text style={{ fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, fontVariant: ['tabular-nums'] }}>
              {model.metric === 'ride_coins' && model.available ? `${score} of ${model.available}` : score}
            </Text>
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: 'Knockout', fontSize: 17, color: BRAND.navy }}>{line.text}</Text>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(5,52,110,0.14)', marginTop: 4, overflow: 'hidden' }}>
            <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: line.state === 'chasing' ? BRAND.blueBright : BRAND.gold }, barStyle]} />
          </View>
        </View>
        {climb > 0 && (
          <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(9).stiffness(220)}
            accessibilityLabel={`Up ${climb} places`}
            style={{ position: 'absolute', top: -16, right: 14, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10,
              height: 30, borderRadius: RADIUS.pill, backgroundColor: BRAND.green, borderWidth: 2, borderBottomWidth: 4, borderColor: BRAND.greenLip }}>
            <Text style={{ fontFamily: 'Shark', fontSize: 16, color: BRAND.white }}>{`Up ${climb}!`}</Text>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function StandingsBoardV2({ board, meId, onMissing }: {
  readonly board: StandingsBoardKey;
  readonly meId: number | null;
  /** The server has no v2 endpoint (or the viewer is signed out): show the legacy screen. */
  readonly onMissing: () => void;
}) {
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  const [parks, setParks] = useState<ParkType[]>(parksCache.parks);
  const [parkId, setParkId] = useState<number | null>(board === 'all_time' ? parksCache.parkId : null);
  const first = cachedBoard(board, parkId);
  const [model, setModel] = useState<StandingsBoardModel | null>(first?.model ?? null);
  const [status, setStatus] = useState<Status>(first ? 'ready' : 'loading');
  const [refreshing, setRefreshing] = useState(false);
  const [climb, setClimb] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const list = useRef<FlatList<StandingsRowModel>>(null);
  const request = useRef(0);

  useEffect(() => {
    if (board !== 'all_time' || parksCache.parks.length) return;
    let live = true;
    allParks().then(items => {
      if (!live) return;
      parksCache.parks = items ?? [];
      setParks(parksCache.parks);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [board]);

  // The weekly countdown ticks once a minute while the app is open.
  useEffect(() => {
    if (board === 'all_time') return;
    const timer = setInterval(() => { if (AppState.currentState === 'active') setNow(Date.now()); }, 60_000);
    return () => clearInterval(timer);
  }, [board]);

  const celebrate = useCallback(async (next: StandingsBoardModel) => {
    const seen = await readSeenRank(next);
    const up = rankClimb(seen, next.me?.rank);
    writeSeenRank(next);
    if (up > 0) {
      setClimb(up);
      playSound(rewardSound);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
  }, [playSound]);

  const load = useCallback((force: boolean) => {
    const hit = cachedBoard(board, parkId);
    if (hit) {
      setModel(hit.model);
      setStatus('ready');
      if (hit.fresh && !force) { void celebrate(hit.model); return; }
    } else {
      setModel(null);
      setStatus('loading');
    }
    const id = ++request.current;
    loadBoard(board, parkId, meId).then(next => {
      if (id !== request.current) return;
      setModel(next);
      setStatus('ready');
      setRefreshing(false);
      void celebrate(next);
    }).catch(error => {
      if (id !== request.current) return;
      setRefreshing(false);
      if (isMissingEndpoint(error)) { onMissing(); return; }
      // A background refresh that fails keeps the board on screen.
      setStatus(current => (hit || current === 'ready' ? 'ready' : 'error'));
    });
  }, [board, parkId, meId, celebrate, onMissing]);

  useEffect(() => { load(false); }, [load]);

  const rows = model?.rows ?? [];
  const { podium, rest } = useMemo(() => splitPodium(rows), [rows]);
  const scoreById = useMemo(() => new Map(rows.map(row => [row.id, row.score])), [rows]);
  const podiumPlayers = podium.map(row => (row ? asPlayer(row) : null)) as [PlayerType | null, PlayerType | null, PlayerType | null];
  const playKey = `${board}:${parkId ?? 'all'}:${podium.map(row => row?.id ?? 0).join(',')}`;

  const scrollToMe = () => {
    playSound(tapSound);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    const index = rest.findIndex(row => row.isMe);
    if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.4, animated: !reduced });
    else list.current?.scrollToOffset({ offset: 0, animated: !reduced });
  };

  const scrollRef = useRef(scrollToMe);
  scrollRef.current = scrollToMe;
  useEffect(() => onStandingsDemo(event => {
    if (event.type === 'scrollMe') scrollRef.current();
    if (event.type === 'park' && board === 'all_time') { parksCache.parkId = event.parkId; setParkId(event.parkId); }
  }), [board]);

  const strip = (
    <View style={{ paddingTop: 14, gap: 10 }}>
      {board === 'all_time' && <ParkChips parks={parks} value={parkId} onChange={id => { parksCache.parkId = id; setParkId(id); }} />}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 16 }}>
        <InfoPill icon="ride" text={model ? (model.metric === 'ride_coins' ? 'Ride coins' : 'Rides won') : board === 'all_time' ? 'Ride coins' : 'Rides won'} />
        {board !== 'all_time' && model?.endsAt && <InfoPill icon="timer" text={`New week in ${resetCountdown(model.endsAt, now)}`} />}
        {board === 'all_time' && model && <InfoPill icon="ride" gold text={`You ${scoreSummary(model)}`} />}
      </View>
    </View>
  );

  if (status === 'error') {
    return <SharkLoader state="error" tone="onBlue" title="Standings didn't load" onRetry={() => load(true)} />;
  }
  if (status === 'loading' || !model) {
    return (
      <View style={{ flex: 1 }}>
        {strip}
        <SharkLoader tone="onBlue" onRetry={() => load(true)} style={{ minHeight: 420 }} />
      </View>
    );
  }

  const empty = rows.length === 0 || (board === 'friends' && !model.friendsCount);
  const copy = emptyCopy(board, model.friendsCount);
  const renderItem: ListRenderItem<StandingsRowModel> = ({ item, index }) => (
    <View style={{ backgroundColor: BRAND.cream }}>
      <StandingsRow player={asPlayer(item)} rank={item.rank ?? index + 4} index={index} score={item.score} scoreIcon="ride"
        isMe={item.isMe} enterDelayBase={reduced ? 0 : 650} label={rowLabel(item, model.metric)} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        data={rest as StandingsRowModel[]}
        keyExtractor={row => row.key}
        renderItem={renderItem}
        initialNumToRender={10}
        windowSize={7}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        onScrollToIndexFailed={info => {
          list.current?.scrollToOffset({ offset: info.averageItemLength * info.index + 400, animated: !reduced });
          setTimeout(() => list.current?.scrollToIndex({ index: info.index, viewPosition: 0.4, animated: !reduced }), 250);
        }}
        refreshControl={<RefreshControl tintColor={BRAND.white} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        ListHeaderComponent={(
          <View>
            {!reduced && <FloatingParticles count={8} />}
            <StandingsPodium podium={podiumPlayers} scoreOf={player => scoreById.get(player.id) ?? 0} scoreIcon="ride"
              meId={meId ?? undefined} playKey={playKey} header={strip} compact />
            <View style={{
              marginTop: -14, height: 26, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg,
              backgroundColor: BRAND.cream, borderTopWidth: 3, borderColor: BRAND.white,
            }} />
          </View>
        )}
        ListEmptyComponent={(
          <View style={{ backgroundColor: BRAND.cream, alignItems: 'center', paddingHorizontal: 24, paddingBottom: 12 }}>
            {empty ? (
              <>
                <GameIcon name={board === 'friends' ? 'heart' : 'trophy'} size={56} />
                <Text accessibilityRole="header" style={[textPreset('title'), { textAlign: 'center', textTransform: 'uppercase', marginTop: 6 }]}>{copy.title}</Text>
                <Text style={[textPreset('body'), { textAlign: 'center', color: BRAND.navySoft, marginTop: 4, marginBottom: 14 }]}>{copy.message}</Text>
                <GameButton label={copy.action} icon={copy.target === 'Friends' ? 'heart' : 'ride'} size="compact"
                  onPress={() => RootNavigation.navigate(copy.target)} />
              </>
            ) : (
              <Text style={[textPreset('bodySmall'), { color: BRAND.navySoft, textAlign: 'center', paddingVertical: 12 }]}>
                Open spots on the podium. Win a ride to claim one.
              </Text>
            )}
          </View>
        )}
        ListFooterComponent={<View style={{ backgroundColor: BRAND.cream, height: YOU_CARD_HEIGHT + YOU_CARD_BOTTOM + 40 }} />}
      />
      {!empty && <YouCard model={model} climb={climb} onPress={scrollToMe} />}
    </View>
  );
}

