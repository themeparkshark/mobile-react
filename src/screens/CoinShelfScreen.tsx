/**
 * All Parks index of the player's Ride Coins. Every park is one card with its
 * count and its coins on a mini shelf; tapping a coin or the card opens that
 * park's real shelf (Profile -> park -> shelf stays the one place coins live).
 *
 * Links that still point here with `focusCoin` (map, LinePlay recap, trip
 * goal) are forwarded to the coin's own park shelf, which scrolls to it and
 * opens its detail.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StackActions, useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Wrapper from '../components/Wrapper';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import ShelfCoin from '../components/collection/ShelfCoin';
import ParkShelfArtwork from '../components/ParkShelfArtwork';
import { AuthContext } from '../context/AuthProvider';
import { groupCoinsByPark, isUpgradeReady, loadCoinCollection, useCoinCollection, type CollectedRideCoin } from '../context/CoinCollection';
import { getTripGoal, setTripGoal, type TripGoalData, type TripGoalRide } from '../api/endpoints/me/trip-goal';
import * as RootNavigation from '../RootNavigation';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import GameIcon from '../ui/GameIcon';
import SharkLoader from '../ui/SharkLoader';

const PREVIEW_COINS: CollectedRideCoin[] = [
  { id: 1, ride_id: 1, ride_name: 'Space Coaster', coin_url: '', current_level: 1, max_level: 5, times_collected: 1,
    available_parts: 2, energy_to_next_level: 10, parts_to_next_level: 2, required_parts: [], player_level_required: 1,
    is_unlocked: true, current_perks: [], next_level_perks: [], park_id: 1, park_name: 'Sample Park' },
  { id: 2, ride_id: 2, ride_name: 'River Boats', coin_url: '', current_level: 3, max_level: 5, times_collected: 4,
    available_parts: 1, energy_to_next_level: 50, parts_to_next_level: 12, required_parts: [], player_level_required: 1,
    is_unlocked: true, current_perks: [], next_level_perks: [], park_id: 1, park_name: 'Sample Park' },
];

/** Where a focusCoin link should go: the coin's park shelf, when we know the park. */
export function focusCoinDestination(coins: readonly CollectedRideCoin[], assetId: number | undefined, playerId: number | undefined) {
  if (!assetId || !playerId) return null;
  const coin = coins.find(item => item.id === assetId && item.times_collected > 0);
  return coin && typeof coin.park_id === 'number'
    ? { park: coin.park_id, player: playerId, focusCoin: { assetId } } : null;
}

export default function CoinShelfScreen({ route }: {
  readonly route?: { readonly params?: { readonly focusCoin?: { readonly assetId: number } } };
}) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const reduced = useReducedGameMotion();
  const { player } = useContext(AuthContext);
  // Dev preview: fixture coins only when nobody is signed in; a QA session shows real data.
  const preview = __DEV__ && process.env.EXPO_PUBLIC_COIN_SHELF_PREVIEW === '1' && !player?.id;
  const collection = useCoinCollection(preview ? null : player?.id, { autoload: false });
  const coins = preview ? PREVIEW_COINS : collection.coins;
  const [refreshing, setRefreshing] = useState(false);
  const [catalog, setCatalog] = useState<TripGoalData | null>(null);
  const [catalogStale, setCatalogStale] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const focusAssetId = route?.params?.focusCoin?.assetId;
  const forwarded = useRef<number | null>(null);

  const loadCatalog = useCallback(async () => {
    if (preview || !player?.id) return;
    try {
      setCatalog(await getTripGoal());
      setCatalogStale(false);
    } catch {
      setCatalogStale(true);
    }
  }, [player?.id, preview]);

  useFocusEffect(useCallback(() => {
    if (preview) return;
    void collection.reload(true);
    void loadCatalog();
  }, [collection.reload, loadCatalog, preview]));

  // A coin link opens that coin on its own park shelf.
  useEffect(() => {
    if (!isFocused || !focusAssetId || forwarded.current === focusAssetId || !player?.id) return;
    const destination = focusCoinDestination(coins, focusAssetId, player.id);
    if (destination) {
      forwarded.current = focusAssetId;
      navigation.dispatch(StackActions.replace('Park', destination));
    } else if (collection.loaded) {
      forwarded.current = focusAssetId;
    }
  }, [isFocused, focusAssetId, coins, collection.loaded, player?.id, navigation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([player?.id ? loadCoinCollection(player.id, { force: true }).catch(() => null) : null, loadCatalog()]);
    setRefreshing(false);
  }, [player?.id, loadCatalog]);

  const catalogRides = useMemo(() => Array.from(new Map((catalog?.rides ?? []).map(ride => [ride.asset_id, ride])).values()), [catalog]);
  const totals = useMemo(() => {
    const byPark = new Map<number, { name: string; owned: number; total: number }>();
    for (const ride of catalogRides) {
      const entry = byPark.get(ride.park_id) ?? { name: ride.park_name, owned: 0, total: 0 };
      entry.total += 1; if (ride.coin_owned) entry.owned += 1;
      byPark.set(ride.park_id, entry);
    }
    return byPark;
  }, [catalogRides]);
  const groups = useMemo(() => {
    const owned = groupCoinsByPark(coins);
    const seen = new Set(owned.map(group => group.parkId));
    // Parks with coins to find but none collected yet still get a card.
    const empty = [...totals.entries()].filter(([parkId]) => !seen.has(parkId))
      .map(([parkId, entry]) => ({ parkId, parkName: entry.name, coins: [] as CollectedRideCoin[] }));
    return [...owned, ...empty];
  }, [coins, totals]);
  const energy = preview ? 18 : player?.energy ?? 0;
  const ready = coins.filter(coin => isUpgradeReady(coin, energy));
  const ownedCount = catalogRides.filter(ride => ride.coin_owned).length;
  const missing = catalogRides.filter(ride => !ride.coin_owned);
  const nextCoin = catalog?.goal && !catalog.goal.coin_owned
    ? missing.find(ride => ride.asset_id === catalog.goal?.asset_id) ?? missing[0] : missing[0];

  const chooseNextCoin = async (ride: TripGoalRide) => {
    if (goalSaving || preview) return;
    setGoalSaving(true);
    try { setCatalog(await setTripGoal(ride.task_id)); setCatalogStale(false); }
    catch { setCatalogStale(true); }
    finally { setGoalSaving(false); }
  };
  const openPark = (parkId: number | null, assetId?: number) => {
    if (!parkId || !player?.id) return;
    RootNavigation.navigate('Park', { park: parkId, player: player.id, ...(assetId ? { focusCoin: { assetId } } : {}) });
  };

  const loading = !preview && !collection.loaded && !collection.error;
  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Ride Coins</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false}><View style={{ width: 40 }} /></TopbarColumn>
      </Topbar>
      <ImageBackground source={require('../../assets/images/water_background.png')} resizeMode="cover" style={{ flex: 1 }}>
        {loading ? <SharkLoader onRetry={() => void collection.reload(true)} />
          : collection.error && coins.length === 0 ? <SharkLoader state="error" onRetry={() => void collection.reload(true)} />
          : <ScrollView contentContainerStyle={styles.content}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}>
          <View style={styles.summary}>
            <GameIcon name="coins" size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryEyebrow}>{catalogStale ? 'LAST KNOWN COLLECTION' : 'ACROSS ALL PARKS'}</Text>
              <Text style={styles.summaryCount}>{catalog ? `${ownedCount}/${catalogRides.length}` : coins.length} RIDE COINS</Text>
              {catalog && catalogRides.length > 0 && <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(ownedCount / catalogRides.length * 100)}%` }]} />
              </View>}
            </View>
          </View>

          {nextCoin && <Pressable accessibilityRole="button" disabled={goalSaving} onPress={() => void chooseNextCoin(nextCoin)}
            style={styles.next}>
            <View style={styles.nextIcon}><GameIcon name="star" size={28} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nextEyebrow}>{catalog?.goal?.asset_id === nextCoin.asset_id ? 'YOUR NEXT COIN' : 'PICK YOUR NEXT COIN'}</Text>
              <Text style={styles.nextName} numberOfLines={1}>{nextCoin.ride_name}</Text>
              <Text style={styles.nextPark} numberOfLines={1}>{nextCoin.park_name}</Text>
            </View>
            {catalog?.goal?.asset_id !== nextCoin.asset_id && <Text style={styles.nextAction}>SET GOAL</Text>}
          </Pressable>}

          {ready.length > 0 && <View style={styles.readyCard}>
            <Text style={styles.readyTitle}>READY TO POWER UP</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 6 }}>
              {ready.map((coin, index) => <Pressable key={coin.id} accessibilityRole="button"
                accessibilityLabel={`${coin.ride_name} is ready to power up. Open it on its park shelf.`}
                onPress={() => openPark(coin.park_id ?? null, coin.id)} style={{ alignItems: 'center', width: 70 }}>
                <ShelfCoin coinUrl={coin.coin_url} level={coin.current_level} size={56} phase={index} />
                <Text style={styles.readyName} numberOfLines={1}>{coin.ride_name}</Text>
              </Pressable>)}
            </ScrollView>
          </View>}

          {groups.length === 0 && <SharkLoader state="empty" title="Your shelf is waiting"
            message="Win a ride challenge at the park to catch your first Ride Coin." />}
          {groups.map((group, groupIndex) => {
            const total = group.parkId !== null ? totals.get(group.parkId) : undefined;
            return <Animated.View key={group.parkId ?? 'none'} entering={reduced ? undefined : FadeInDown.delay(60 * groupIndex).duration(260)}
              style={styles.park}>
              <Pressable accessibilityRole="button" disabled={group.parkId === null}
                accessibilityLabel={`${group.parkName}, ${total ? `${total.owned} of ${total.total}` : group.coins.length} Ride Coins. Open park shelf.`}
                onPress={() => openPark(group.parkId)} style={styles.parkHeader}>
                <Text style={styles.parkName} numberOfLines={1}>{group.parkName}</Text>
                <Text style={styles.parkCount}>{total ? `${total.owned}/${total.total}` : group.coins.length}</Text>
                {group.parkId !== null && <GameIcon name="arrow" size={26} />}
              </Pressable>
              <View style={styles.shelf}>
                {group.coins.length === 0
                  ? <Text style={styles.emptyShelf}>No coins yet. Your first one is out in the park.</Text>
                  : <View style={styles.coinRow}>
                    {group.coins.map((coin, index) => <Pressable key={coin.id} accessibilityRole="button"
                      accessibilityLabel={`${coin.ride_name}, level ${coin.current_level}. Open on its park shelf.`}
                      onPress={() => openPark(group.parkId, coin.id)} style={{ margin: 5 }}>
                      <ShelfCoin coinUrl={coin.coin_url} level={coin.current_level} size={50} phase={index} />
                    </Pressable>)}
                  </View>}
                <View style={{ height: 30 }}><ParkShelfArtwork variant="normal" height={30} /></View>
              </View>
            </Animated.View>;
          })}
        </ScrollView>}
      </ImageBackground>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff8e4', borderRadius: 18,
    borderWidth: 3, borderColor: '#ffffff', padding: 12, shadowColor: '#05346e', shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 },
  summaryEyebrow: { fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1, color: '#3d5f8c' },
  summaryCount: { fontFamily: 'Shark', fontSize: 24, color: '#05346e' },
  track: { height: 10, borderRadius: 6, backgroundColor: '#bfe5ff', overflow: 'hidden', marginTop: 5 },
  fill: { height: '100%', borderRadius: 6, backgroundColor: '#ffcf3b' },
  next: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff4cc', borderRadius: 16,
    borderWidth: 3, borderColor: '#ffcf3b', paddingVertical: 10, paddingHorizontal: 12 },
  nextIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  nextEyebrow: { fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8, color: '#8a5a00' },
  nextName: { fontFamily: 'Shark', fontSize: 18, color: '#05346e' },
  nextPark: { fontFamily: 'Knockout', fontSize: 14, color: '#3d5f8c' },
  nextAction: { fontFamily: 'Shark', fontSize: 14, color: '#05346e', backgroundColor: '#ffcf3b', borderRadius: 10,
    overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6 },
  readyCard: { backgroundColor: '#0879ca', borderRadius: 18, borderWidth: 3, borderColor: '#ffffff', padding: 12 },
  readyTitle: { fontFamily: 'Shark', fontSize: 18, color: '#ffffff', textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  readyName: { fontFamily: 'Knockout', fontSize: 13, color: '#ffffff', marginTop: 6, maxWidth: 70 },
  park: { backgroundColor: '#0768b9', borderRadius: 20, borderWidth: 3, borderColor: '#ffffff', overflow: 'hidden',
    shadowColor: '#05346e', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 },
  parkHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  parkName: { flex: 1, fontFamily: 'Shark', fontSize: 20, color: '#ffffff', textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  parkCount: { fontFamily: 'Shark', fontSize: 20, color: '#ffcf3b', textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  shelf: { paddingHorizontal: 8, paddingBottom: 6 },
  coinRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: -12, zIndex: 1 },
  emptyShelf: { fontFamily: 'Knockout', fontSize: 16, color: '#dff4ff', textAlign: 'center', paddingVertical: 14 },
});
