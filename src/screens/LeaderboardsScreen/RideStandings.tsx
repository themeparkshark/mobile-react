import * as Haptics from 'expo-haptics';
import { useContext, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as RootNavigation from '../../RootNavigation';
import allParks from '../../api/endpoints/parks/allParks';
import rideStandings from '../../api/endpoints/leaderboards/rideStandings';
import StandingsPicker from '../../components/StandingsPicker';
import { AuthContext } from '../../context/AuthProvider';
import { LocationStatusContext } from '../../context/LocationProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { ParkType } from '../../models/park-type';
import { PlayerType } from '../../models/player-type';
import { BRAND, GameIcon, SharkLoader, textPreset, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { useProgressionFlags } from '../../services/progression/progressionFlags';
import { StandingsInvite, StandingsListCard, StandingsRow } from './StandingsRow';
import { defaultStandingsPark, rideMetricCopy, standingsStatus, type RideMetric, type StandingsStatus } from './standingsModel';

const tapSound = require('../../../assets/sounds/tap.mp3');

const BASE_METRICS: readonly { key: RideMetric; label: string; icon: GameIconName }[] = [
  { key: 'today', label: 'TODAY', icon: 'timer' },
  { key: 'collection', label: 'COLLECT', icon: 'coin' },
  { key: 'mastery', label: 'MASTER', icon: 'star' },
];
/** Ride Masters (progression v2) is a segment here, never a new top-level tab (economy review K6). */
const MASTERS_METRIC = { key: 'masters' as RideMetric, label: 'CROWNS', icon: 'crown' as GameIconName };

/** A segmented pill row with a gold slider that springs to the chosen metric. */
function MetricPills({ value, onChange, metrics }: { readonly value: RideMetric; readonly onChange: (metric: RideMetric) => void;
  readonly metrics: readonly { key: RideMetric; label: string; icon: GameIconName }[] }) {
  const METRICS = metrics;
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  const [width, setWidth] = useState(0);
  const index = METRICS.findIndex(metric => metric.key === value);
  const segment = width / METRICS.length;
  const slider = useAnimatedStyle(() => ({
    width: segment - 8,
    transform: [{ translateX: reduced ? index * segment : withSpring(index * segment, { damping: 16, stiffness: 220 }) }],
  }), [index, segment, reduced]);
  return (
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{
      flexDirection: 'row', backgroundColor: BRAND.blue, borderRadius: 18, padding: 4, marginBottom: 10,
      borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)',
    }}>
      {width > 0 && <Animated.View style={[{
        position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 14, backgroundColor: BRAND.gold,
        borderBottomWidth: 3, borderBottomColor: BRAND.goldLip,
      }, slider]} />}
      {METRICS.map(metric => {
        const active = metric.key === value;
        return (
          <Pressable key={metric.key} accessibilityRole="tab" accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              playSound(tapSound);
              void Haptics.selectionAsync().catch(() => undefined);
              onChange(metric.key);
            }}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}>
            <GameIcon name={metric.icon} size={20} />
            <Text style={{ fontFamily: 'Shark', fontSize: 16, color: active ? BRAND.navy : BRAND.white }}>{metric.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function RideStandings() {
  const { player } = useContext(AuthContext);
  const { park: currentPark } = useContext(LocationStatusContext);
  const [parks, setParks] = useState<ParkType[]>([]);
  const [chosenParkId, setChosenParkId] = useState<number | undefined>();
  const [metric, setMetric] = useState<RideMetric>('today');
  const [players, setPlayers] = useState<PlayerType[]>([]);
  const [available, setAvailable] = useState(0);
  const [status, setStatus] = useState<StandingsStatus>('loading');
  const [parkDay, setParkDay] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [parksReload, setParksReload] = useState(0);
  const scopeRef = useRef('');
  const { progressionV2 } = useProgressionFlags();
  const metrics = progressionV2 ? [...BASE_METRICS, MASTERS_METRIC] : BASE_METRICS;

  const parkId = defaultStandingsPark({
    chosenParkId, locationParkId: currentPark?.id, playerParkId: player?.current_park_id, parkIds: parks.map(p => p.id),
  });

  useEffect(() => {
    let active = true;
    allParks().then(items => { if (active) setParks(items ?? []); }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [parksReload]);

  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') setRefreshKey(current => current + 1); }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!parkId || !parks.length) return;
    let active = true;
    const scope = `${parkId}:${metric}`;
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      setPlayers([]);
      setStatus('loading');
    }
    rideStandings(parkId, metric).then(result => {
      if (!active) return;
      const list = Array.isArray(result?.data) ? result.data : [];
      setPlayers(list);
      setAvailable(result?.available ?? 0);
      setParkDay(result?.park_day ?? '');
      setStatus(standingsStatus({ players: list }));
      setRefreshing(false);
    }).catch(() => {
      if (!active) return;
      // A background refresh that fails keeps the board on screen.
      setStatus(current => (current === 'ready' ? current : 'error'));
      setRefreshing(false);
    });
    return () => { active = false; };
  }, [parkId, metric, refreshKey, parks.length]);

  const copy = rideMetricCopy(metric, parkDay, available);
  const detailFor = (entry: PlayerType) => metric === 'today' ? copy.detail
    : metric === 'masters' ? `${entry.ride_masters?.boss_clears ?? 0} boss clears · ${entry.ride_masters?.polish_stars ?? 0} polish`
      : metric === 'mastery' ? `${entry.ride_coins_collected ?? 0} ride coins`
        : `${entry.coin_upgrades ?? 0} upgrade levels`;

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 16, paddingBottom: 36 }}
      refreshControl={<RefreshControl tintColor={BRAND.white} refreshing={refreshing} onRefresh={() => {
        setRefreshing(true);
        setRefreshKey(current => current + 1);
      }} />}
    >
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ marginBottom: 12 }}>
          <StandingsPicker
            title="Select Park"
            value={parkId}
            onValueChange={setChosenParkId}
            items={parks.map(park => ({ label: park.display_name ?? park.name, value: park.id }))}
          />
        </View>
        <MetricPills value={metric} onChange={setMetric} metrics={metrics} />
        <Text style={[textPreset('bodySmall', 'onBlue'), { textAlign: 'center', marginBottom: 14,
          textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]}>
          {copy.caption}
        </Text>
      </View>
      {status === 'loading' && <SharkLoader tone="onBlue" compact onRetry={() => setRefreshKey(current => current + 1)} />}
      {status === 'error' && (
        <SharkLoader state="error" tone="onBlue" compact title="Standings didn't load"
          onRetry={() => {
            setStatus('loading');
            if (!parks.length) setParksReload(current => current + 1);
            else setRefreshKey(current => current + 1);
          }} />
      )}
      {(status === 'ready' || status === 'empty') && (
        <StandingsListCard>
          {status === 'empty' ? (
            <StandingsInvite title={copy.emptyTitle} message={copy.emptyMessage} actionLabel="Find a ride"
              onAction={() => RootNavigation.navigate('Explore')} icon="ride" />
          ) : players.map((entry, index) => (
            <StandingsRow key={entry.id} player={entry} rank={index + 1} index={index} highlight enterDelayBase={80}
              score={Number(entry.park_coins) || 0} scoreIcon={metric === 'today' ? 'ride' : metric === 'collection' ? 'coin' : metric === 'masters' ? 'crown' : 'star'}
              detail={detailFor(entry)} isMe={entry.id === player?.id} />
          ))}
        </StandingsListCard>
      )}
    </ScrollView>
  );
}
