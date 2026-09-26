import { useContext, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as RootNavigation from '../../RootNavigation';
import allParks from '../../api/endpoints/parks/allParks';
import rideStandings, { RideStandingsMetric } from '../../api/endpoints/leaderboards/rideStandings';
import Avatar from '../../components/Avatar';
import Loading from '../../components/Loading';
import StandingsPicker from '../../components/StandingsPicker';
import config from '../../config';
import { AuthContext } from '../../context/AuthProvider';
import { ParkType } from '../../models/park-type';
import { PlayerType } from '../../models/player-type';

export default function RideStandings() {
  const { player } = useContext(AuthContext);
  const [parks, setParks] = useState<ParkType[]>([]);
  const [parkId, setParkId] = useState<number | undefined>(player?.current_park_id);
  const [metric, setMetric] = useState<RideStandingsMetric>('today');
  const [players, setPlayers] = useState<PlayerType[]>([]);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [parkDay, setParkDay] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scopeRef = useRef('');

  useEffect(() => {
    allParks().then((items) => {
      setParks(items);
      setParkId((current) => current ?? items[0]?.id);
    }).catch(() => setError(true));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setRefreshKey((current) => current + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!parkId) return;
    let active = true;
    const scope = `${parkId}:${metric}`;
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      setPlayers([]);
      setLoading(true);
    }
    setError(false);
    rideStandings(parkId, metric).then((result) => {
      if (!active) return;
      setPlayers(result.data);
      setAvailable(result.available);
      setParkDay(result.park_day);
      setLoading(false);
      setRefreshing(false);
    }).catch(() => {
      if (active) { setError(true); setLoading(false); setRefreshing(false); }
    });
    return () => { active = false; };
  }, [parkId, metric, refreshKey]);

  const scoreLabel = metric === 'today' ? 'rides today' : metric === 'collection' ? 'ride coins' : 'upgrade levels';

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 36 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        setRefreshing(true);
        setRefreshKey((current) => current + 1);
      }} />}
    >
      <View style={{ marginBottom: 12 }}>
        <StandingsPicker
          title="Select Park"
          value={parkId}
          onValueChange={setParkId}
          items={parks.map((park) => ({ label: park.display_name ?? park.name, value: park.id }))}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {(['today', 'collection', 'mastery'] as const).map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => setMetric(option)}
            style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: metric === option ? config.secondary : '#173b72', alignItems: 'center' }}
          >
            <Text style={{ color: 'white', fontFamily: 'Shark', fontSize: 16 }}>
              {option === 'today' ? 'TODAY' : option === 'collection' ? 'COLLECT' : 'MASTER'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ color: 'white', fontFamily: 'Knockout', fontSize: 17, marginBottom: 16, textAlign: 'center' }}>
        {metric === 'today'
          ? `Distinct ride wins today · ${parkDay || 'park local time'} · updates every 30 seconds`
          : metric === 'collection'
            ? `Unique ride coins from this park · ${available} available`
            : 'Total levels upgraded across this park’s ride coins'}
      </Text>
      {loading && <Loading />}
      {error && <Text style={{ color: 'white', textAlign: 'center' }}>Standings could not load. Try opening this tab again.</Text>}
      {!loading && !error && players.length === 0 && (
        <Text style={{ color: 'white', textAlign: 'center', fontSize: 16, marginTop: 32 }}>
          {metric === 'today' ? 'No ride wins here today. Be the first!' : metric === 'collection' ? 'No ride coins collected here yet. Be the first!' : 'No ride coins upgraded here yet. Be the first!'}
        </Text>
      )}
      {!loading && !error && players.map((entry, index) => (
        <TouchableOpacity
          key={entry.id}
          onPress={() => RootNavigation.navigate('Player', { player: entry.id })}
          style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: index < 3 ? '#fff5cf' : 'white',
            borderRadius: 14, padding: 12, marginBottom: 8,
          }}
        >
          <Text style={{ width: 42, color: index < 3 ? '#a56b00' : '#173b72', fontFamily: 'Shark', fontSize: 22 }}>
            {index + 1}
          </Text>
          <Avatar player={entry} size="sm" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text numberOfLines={1} style={{ color: '#173b72', fontFamily: 'Shark', fontSize: 17 }}>
              {entry.screen_name}
            </Text>
            <Text style={{ color: '#667', fontSize: 12 }}>
              {metric === 'today' ? 'Verified ride challenge wins' : metric === 'mastery' ? `${entry.ride_coins_collected ?? 0} rides collected` : `${entry.coin_upgrades ?? 0} upgrade levels`}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: config.secondary, fontFamily: 'Shark', fontSize: 23 }}>{entry.park_coins}</Text>
            <Text style={{ color: '#667', fontSize: 11 }}>{scoreLabel}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
