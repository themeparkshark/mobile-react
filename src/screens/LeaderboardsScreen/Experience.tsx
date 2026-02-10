import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, ScrollView, Text, View } from 'react-native';

const xpIcon = require('../../../assets/images/screens/explore/xp.png');
const tapSound = require('../../../assets/sounds/tap.mp3');
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../../RootNavigation';
import all from '../../api/endpoints/players/all';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import FloatingParticles from '../../components/FloatingParticles';
import LeaderboardPlayer from '../../components/LeaderboardPlayer';
import Loading from '../../components/Loading';
import config from '../../config';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { PlayerType } from '../../models/player-type';

// Module-level cache — survives unmount so tab switches skip loading spinner
let cachedPlayers: PlayerType[] = [];

export default function Experience() {
  const [loading, setLoading] = useState<boolean>(cachedPlayers.length === 0);
  const [players, setPlayers] = useState<PlayerType[]>(cachedPlayers);
  const { playSound } = useContext(SoundEffectContext);
  const [page, setPage] = useState<number>(1);

  // Podium animations (top 3)
  const podiumAnims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  // List item animations (items 4+)
  const listAnims = useRef(Array.from({ length: 50 }, () => new Animated.Value(0))).current;
  const hasAnimated = useRef(false);

  // Trigger entrance animations on initial load
  useEffect(() => {
    if (!players.length || hasAnimated.current) return;
    hasAnimated.current = true;

    podiumAnims.forEach(a => a.setValue(0));
    listAnims.forEach(a => a.setValue(0));

    // Podium: 3rd → 2nd → 1st (dramatic)
    const podiumOrder = [1, 2, 0];
    const podiumAnimations = podiumOrder.map((idx, i) =>
      Animated.spring(podiumAnims[idx], {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
        delay: i * 200,
      })
    );

    // List cascade
    const listCount = Math.min(players.length - 3, 50);
    const listAnimations = Array.from({ length: Math.max(0, listCount) }, (_, i) =>
      Animated.timing(listAnims[i], {
        toValue: 1,
        duration: 300,
        delay: 600 + i * 60,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      })
    );

    Animated.parallel([...podiumAnimations, ...listAnimations]).start();
  }, [players]);

  const fetchPlayers = async (pageNum: number) => {
    const response = await all(pageNum);
    setPlayers((prevState) => {
      const updated = [...prevState, ...response];
      cachedPlayers = updated;
      return updated;
    });
  };

  useEffect(() => {
    if (cachedPlayers.length > 0) {
      // Already have data — skip fetch, just play animations
      setLoading(false);
      return;
    }
    fetchPlayers(page).then(() => setLoading(false));
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchPlayers(page);
    }
  }, [page]);

  return (
    <View style={{ flex: 1 }}>
      {loading && <Loading />}
      {!loading && (
        <ScrollView>
          <View
            style={{
              height: 480,
              position: 'relative',
            }}
          >
            {/* Gradient glow behind podium */}
            <LinearGradient
              colors={['transparent', 'rgba(255, 215, 0, 0.08)', 'rgba(0, 165, 245, 0.12)', 'transparent']}
              style={{
                position: 'absolute',
                top: 20,
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
            {players.length >= 3 && (
              <View
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  zIndex: 10,
                  top: 30,
                  width: '100%',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'flex-end',
                  paddingHorizontal: 8,
                }}
              >
                {/* #2 - Left */}
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
                  <LeaderboardPlayer player={players[1]} rank={2} scoreKey="total_experience" />
                </Animated.View>

                {/* #1 - Center */}
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
                  <LeaderboardPlayer player={players[0]} rank={1} scoreKey="total_experience" />
                </Animated.View>

                {/* #3 - Right */}
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
                  <LeaderboardPlayer player={players[2]} rank={3} scoreKey="total_experience" />
                </Animated.View>
              </View>
            )}

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

          {/* List section — identical to ParkCoins */}
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

                      {/* XP icon + score */}
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Image source={xpIcon} style={{ width: 20, height: 20, marginRight: 4 }} contentFit="contain" />
                        <Text
                          style={{
                            fontSize: 22,
                            fontFamily: 'Shark',
                            color: config.primary,
                            fontWeight: 'bold',
                          }}
                        >
                          {p.total_experience}
                        </Text>
                      </View>
                    </Animated.View>
                  );
                })}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
