import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, ScrollView, Text, View } from 'react-native';

const coinIcon = require('../../../assets/images/coingold.png');
const tapSound = require('../../../assets/sounds/tap.mp3');
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../../RootNavigation';
import getPlayers from '../../api/endpoints/leaderboards/players';
import allParks from '../../api/endpoints/parks/allParks';
import getLeaderboards from '../../api/endpoints/parks/leaderboards/get';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import FloatingParticles from '../../components/FloatingParticles';
import LeaderboardPlayer from '../../components/LeaderboardPlayer';
import Loading from '../../components/Loading';
import StandingsPicker from '../../components/StandingsPicker';
import config from '../../config';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { LeaderboardType } from '../../models/leaderboard-type';
import { ParkType } from '../../models/park-type';
import { PlayerType } from '../../models/player-type';

// Podium entrance: rise from below with spring bounce
// Order: 3rd (left) → 2nd (right) → 1st (center, biggest delay for dramatic reveal)
const PODIUM_DELAYS = [200, 0, 400]; // index 0=#1, 1=#2, 2=#3 → reorder for drama

// Module-level cache — survives unmount so tab switches skip loading spinner
let cache: {
  parks: ParkType[];
  selectedPark?: number;
  selectedLeaderboard?: number;
  players: PlayerType[];
  leaderboards: LeaderboardType[];
} = { parks: [], players: [], leaderboards: [] };

export default function ParkCoins() {
  const hasCached = cache.players.length > 0;
  const [loading, setLoading] = useState<boolean>(!hasCached);
  const { player } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const [parks, setParks] = useState<ParkType[]>(cache.parks);
  const [selectedPark, setSelectedPark] = useState<number | undefined>(cache.selectedPark);
  const [selectedLeaderboard, setSelectedLeaderboard] = useState<number | undefined>(cache.selectedLeaderboard);
  const [players, setPlayers] = useState<PlayerType[]>(cache.players);
  const [leaderboards, setLeaderboards] = useState<LeaderboardType[]>(cache.leaderboards);

  // Animation refs — podium (3 slots) + list items (up to 50)
  const podiumAnims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const listAnims = useRef(Array.from({ length: 50 }, () => new Animated.Value(0))).current;

  // Trigger entrance animations when players change
  useEffect(() => {
    if (!players.length) return;

    // Reset all
    podiumAnims.forEach(a => a.setValue(0));
    listAnims.forEach(a => a.setValue(0));

    // Podium: 3rd rises first, then 2nd, then 1st (dramatic)
    const podiumOrder = [1, 2, 0]; // #2 first, #3 second, #1 last
    const podiumAnimations = podiumOrder.map((idx, i) =>
      Animated.spring(podiumAnims[idx], {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
        delay: i * 200,
      })
    );

    // List items: cascade from right with staggered delays
    const listCount = Math.min(players.length - 3, 50);
    const listAnimations = Array.from({ length: Math.max(0, listCount) }, (_, i) =>
      Animated.timing(listAnims[i], {
        toValue: 1,
        duration: 300,
        delay: 600 + i * 60, // Start after podium, 60ms apart
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      })
    );

    Animated.parallel([...podiumAnimations, ...listAnimations]).start();
  }, [players]);

  useAsyncEffect(async () => {
    if (cache.parks.length > 0) return; // Already cached
    const fetchedParks = await allParks();
    cache.parks = fetchedParks;
    setParks(fetchedParks);
  }, []);

  // Set initial park only once — don't override user's manual selection
  useEffect(() => {
    if (selectedPark) return; // Already selected, don't override
    if (player?.current_park_id) {
      setSelectedPark(player.current_park_id);
      cache.selectedPark = player.current_park_id;
    } else if (parks.length) {
      setSelectedPark(parks[0].id);
      cache.selectedPark = parks[0].id;
    }
  }, [parks]);

  useEffect(() => {
    if (leaderboards.length) {
      const allTime = leaderboards.find(lb =>
        lb.duration_text?.toLowerCase().includes('all time') ||
        lb.duration_text?.toLowerCase().includes('all-time')
      );
      const lbId = allTime?.id ?? leaderboards[leaderboards.length - 1]?.id ?? leaderboards[0]?.id;
      setSelectedLeaderboard(lbId);
      cache.selectedLeaderboard = lbId;
    }
  }, [leaderboards]);

  useAsyncEffect(async () => {
    if (selectedLeaderboard) {
      const fetched = await getPlayers(selectedLeaderboard);
      cache.players = fetched;
      setPlayers(fetched);
      setLoading(false);
    }
  }, [selectedLeaderboard]);

  useAsyncEffect(async () => {
    if (!selectedPark) return;
    // If returning to same park with cached data, skip refetch
    if (hasCached && selectedPark === cache.selectedPark) return;
    // Reset selection so the leaderboard effect always re-fires for the new park
    setSelectedLeaderboard(undefined);
    setPlayers([]);
    setLoading(true);
    const fetchedLb = await getLeaderboards(selectedPark);
    cache.leaderboards = fetchedLb;
    cache.selectedPark = selectedPark;
    setLeaderboards(fetchedLb);
  }, [selectedPark]);

  return (
    <>
      {loading && <Loading />}
      {!loading && (
        <ScrollView>
          <View
            style={{
              height: 540,
              position: 'relative',
            }}
          >
            {/* Gradient glow behind podium */}
            <LinearGradient
              colors={['transparent', 'rgba(255, 215, 0, 0.08)', 'rgba(0, 165, 245, 0.12)', 'transparent']}
              style={{
                position: 'absolute',
                top: 60,
                left: 0,
                right: 0,
                height: 350,
              }}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />

            {/* Floating particles */}
            <FloatingParticles count={14} />

            {/* Podium players */}
            {players.length > 0 && (
              <View
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  zIndex: 10,
                  top: 70,
                  width: '100%',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'flex-end',
                  paddingHorizontal: 8,
                }}
              >
                {/* #2 - Left (rises second) */}
                <Animated.View style={{
                  flex: 1, alignItems: 'center', marginBottom: 20,
                  opacity: podiumAnims[1],
                  transform: [{
                    translateY: podiumAnims[1].interpolate({
                      inputRange: [0, 1],
                      outputRange: [80, 0],
                    }),
                  }, {
                    scale: podiumAnims[1].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1],
                    }),
                  }],
                }}>
                  {players[1] && <LeaderboardPlayer player={players[1]} rank={2} />}
                </Animated.View>

                {/* #1 - Center (rises last — dramatic reveal) */}
                <Animated.View style={{
                  flex: 1.2, alignItems: 'center', marginBottom: 50,
                  opacity: podiumAnims[0],
                  transform: [{
                    translateY: podiumAnims[0].interpolate({
                      inputRange: [0, 1],
                      outputRange: [120, 0],
                    }),
                  }, {
                    scale: podiumAnims[0].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 1],
                    }),
                  }],
                }}>
                  {players[0] && <LeaderboardPlayer player={players[0]} rank={1} />}
                </Animated.View>

                {/* #3 - Right (rises first) */}
                <Animated.View style={{
                  flex: 1, alignItems: 'center', marginBottom: 0,
                  opacity: podiumAnims[2],
                  transform: [{
                    translateY: podiumAnims[2].interpolate({
                      inputRange: [0, 1],
                      outputRange: [60, 0],
                    }),
                  }, {
                    scale: podiumAnims[2].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1],
                    }),
                  }],
                }}>
                  {players[2] && <LeaderboardPlayer player={players[2]} rank={3} />}
                </Animated.View>
              </View>
            )}

            {/* Pickers */}
            <View
              style={{
                paddingTop: 16,
                paddingLeft: 16,
                paddingRight: 16,
                flexDirection: 'row',
                zIndex: 20,
              }}
            >
              <View style={{ flex: 1 }}>
                {!!parks && (
                  <StandingsPicker
                    title="Select Park"
                    value={selectedPark}
                    onValueChange={(value) => setSelectedPark(value)}
                    items={parks.map((park) => ({
                      label: park.display_name ?? park.name,
                      value: park.id,
                    }))}
                  />
                )}
              </View>
              <View style={{ flex: 1, paddingLeft: 16 }}>
                {leaderboards && (
                  <StandingsPicker
                    title="Time Period"
                    value={selectedLeaderboard}
                    onValueChange={(value) => setSelectedLeaderboard(value)}
                    items={leaderboards.map((item) => ({
                      label: item.duration_text,
                      value: item.id,
                    }))}
                  />
                )}
              </View>
            </View>

            {/* Barrel */}
            <Image
              style={{
                width: Dimensions.get('window').width,
                height: 270,
                position: 'absolute',
                bottom: 0,
              }}
              contentFit="cover"
              source={require('../../../assets/images/screens/leaderboard/barrel.png')}
            />
          </View>

          {/* List section */}
          <View
            style={{
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              marginTop: -12,
              overflow: 'hidden',
              backgroundColor: 'white',
            }}
          >
            <View
              style={{
                paddingBottom: 32,
                paddingTop: 8,
              }}
            >
              {/* Decorative top edge */}
              <View
                style={{
                  height: 4,
                  marginHorizontal: 40,
                  marginBottom: 8,
                  borderRadius: 2,
                  backgroundColor: 'rgba(0, 165, 245, 0.2)',
                }}
              />

              {players.slice(3).length > 0 &&
                players.slice(3).map((p, index) => {
                  const anim = listAnims[index] || new Animated.Value(1);
                  return (
                    <Animated.View
                      key={p.id}
                      style={{
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        marginHorizontal: 12,
                        marginVertical: 3,
                        borderRadius: 14,
                        backgroundColor: index % 2 === 0 ? 'rgba(0, 165, 245, 0.06)' : 'transparent',
                        borderWidth: index % 2 === 0 ? 1 : 0,
                        borderColor: 'rgba(0, 165, 245, 0.1)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        opacity: anim,
                        transform: [{
                          translateX: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [60, 0],
                          }),
                        }],
                      }}
                    >
                      {/* Rank number */}
                      <LinearGradient
                        colors={[config.secondary, '#0080cc']}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginRight: 12,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 16,
                            fontFamily: 'Shark',
                            color: 'white',
                          }}
                        >
                          {index + 4}
                        </Text>
                      </LinearGradient>

                      {/* Avatar */}
                      <Button
                        onPress={() => {
                          playSound(tapSound);
                          RootNavigation.navigate('Player', {
                            player: p.id,
                          });
                        }}
                      >
                        <Avatar player={p} size="sm" />
                      </Button>

                      {/* Name */}
                      <Text
                        style={{
                          fontSize: 20,
                          fontFamily: 'Shark',
                          color: '#1a1a2e',
                          textTransform: 'uppercase',
                          paddingLeft: 14,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {p.screen_name}
                      </Text>

                      {/* Coin icon + score */}
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Image source={coinIcon} style={{ width: 20, height: 20, marginRight: 4 }} contentFit="contain" />
                        <Text
                          style={{
                            fontSize: 22,
                            fontFamily: 'Shark',
                            color: config.primary,
                            fontWeight: 'bold',
                          }}
                        >
                          {p.park_coins}
                        </Text>
                      </View>
                    </Animated.View>
                  );
                })}
            </View>
          </View>
        </ScrollView>
      )}
    </>
  );
}
