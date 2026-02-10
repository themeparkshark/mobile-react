import { useFocusEffect, useRoute } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import HapticPatterns from '../helpers/hapticPatterns';
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import getFriends from '../api/endpoints/me/friends';
import getParks from '../api/endpoints/me/visited-parks';
import getStores from '../api/endpoints/stores/stores';
import Button from '../components/Button';
import Experience from '../components/Experience';
import FriendPlayer from '../components/FriendPlayer';
import Heading from '../components/Heading';
import Loading from '../components/Loading';
import PlayerButtons from '../components/PlayerButtons';
import Playercard from '../components/Playercard';
import Stats from '../components/Stats';
import Subscribed from '../components/Subscribed';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Verified from '../components/Verified';
import VisitedParks from '../components/VisitedParks';
import Wrapper from '../components/Wrapper';
import YellowButton from '../components/YellowButton';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { NotificationContext } from '../context/NotificationProvider';
import { SoundEffectContext, SoundEffectContextType } from '../context/SoundEffectProvider';

const SHARK_TAP_SOUND = require('../../assets/sounds/button_press.mp3');
import useCrumbs from '../hooks/useCrumbs';
import { ButtonType } from '../models/button-type';
import { ParkType } from '../models/park-type';
import { PermissionEnums } from '../models/permission-enums';
import { PlayerType } from '../models/player-type';
import { StoreType } from '../models/store-type';

export default function ProfileScreen() {
  const [parks, setParks] = useState<ParkType[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [buttons, setButtons] = useState<ButtonType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { player } = useContext(AuthContext);
  const [friends, setFriends] = useState<PlayerType[]>([]);
  const { refreshNotificationCount, notificationCount } =
    useContext(NotificationContext);
  const { warnings, labels } = useCrumbs();
  const [refreshing, setRefreshing] = useState(false);
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  
  // Scroll refs
  const route = useRoute();
  const scrollViewRef = useRef<ScrollView>(null);
  const parksYPosition = useRef<number>(0);

  // Shark tap animation
  const sharkScale = useRef(new Animated.Value(1)).current;
  const sharkRotate = useRef(new Animated.Value(0)).current;

  // Edit button tap animation (independent)
  const editScale = useRef(new Animated.Value(1)).current;
  const editRotate = useRef(new Animated.Value(0)).current;

  const requestFriends = () => {
    getFriends(1, 3).then((response) => setFriends(response));
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (player) {
        const [newParks] = await Promise.all([
          getParks(player.id),
          requestFriends(),
          refreshNotificationCount(),
        ]);
        setParks(newParks);
      }
    } finally {
      setRefreshing(false);
    }
  }, [player]);

  useFocusEffect(
    useCallback(() => {
      if (player && !player.username) {
        RootNavigation.navigate('Welcome');
        return;
      }

      requestFriends();
      refreshNotificationCount();
    }, [])
  );

  useAsyncEffect(async () => {
    if (!player) {
      setLoading(false);
      return;
    }
    setParks(await getParks(player.id));
    setStores(await getStores());
    requestFriends();

    setLoading(false);
  }, [player]);

  // Scroll to parks section if requested
  useEffect(() => {
    const params = route.params as { scrollTo?: string } | undefined;
    if (!loading && params?.scrollTo === 'parks' && parksYPosition.current > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: parksYPosition.current, animated: true });
      }, 300);
    }
  }, [loading, route.params]);

  useEffect(() => {
    if (stores) {
      setButtons([
        {
          image: require('../../assets/images/screens/profile/pin_collections.png'),
          onPress: () => {
            RootNavigation.navigate('PinCollections');
          },
          text: labels.pin_packs,
        },
        ...stores.map((store) => {
          return {
            image: store.icon_url,
            onPress: () => {
              if (!store.is_secret_store) {
                RootNavigation.navigate('Store', {
                  store: store.id,
                });
                return;
              }

              if (player?.is_subscribed) {
                RootNavigation.navigate('Store', {
                  store: store.id,
                });
              } else {
                RootNavigation.navigate('Membership');
              }
            },
            text: store.name,
            permission:
              player && !player.is_subscribed && store.is_secret_store
                ? PermissionEnums.ViewSecretStore
                : undefined,
          };
        }),
        {
          image: require('../../assets/images/screens/explore/stampbook.png'),
          onPress: () => {
            RootNavigation.navigate('StampBook');
          },
          text: 'Stamp Book',
        },
      ]);
    }
  }, [stores]);

  // Redirect guests to login — must be in useEffect, not during render
  useEffect(() => {
    if (!player) {
      RootNavigation.navigate('Login');
    }
  }, [player]);

  if (!player) {
    return <></>;
  }

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <Button
            onPress={() => {
              RootNavigation.navigate('Notifications');
            }}
            showRedCircle={!!notificationCount}
          >
            <Image
              style={{
                width: 35,
                height: 35,
                alignSelf: 'center',
              }}
              contentFit="contain"
              source={require('../../assets/images/screens/profile/notifications.png')}
            />
          </Button>
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>{player.screen_name}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <Button
            onPress={() => {
              RootNavigation.navigate('Settings');
            }}
          >
            <Image
              style={{
                width: 35,
                height: 35,
                alignSelf: 'center',
              }}
              contentFit="contain"
              source={require('../../assets/images/screens/profile/settings.png')}
            />
          </Button>
        </TopbarColumn>
      </Topbar>
      {loading && <Loading />}
      {!loading && player && (
        <ScrollView
          ref={scrollViewRef}
          style={{
            flex: 1,
            marginTop: -8,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={config.primary} />
          }
        >
          <View
            style={{
              paddingBottom: 32,
            }}
          >
            <ImageBackground
              source={player?.inventory?.background_item?.paper_url ? {
                uri: player.inventory.background_item.paper_url,
              } : undefined}
              style={{
                height: 315,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {/* Shark tap zone */}
              <Pressable
                onPressIn={() => {
                  Animated.spring(sharkScale, {
                    toValue: 0.92,
                    useNativeDriver: true,
                    speed: 50,
                    bounciness: 4,
                  }).start();
                }}
                onPressOut={() => {
                  Animated.parallel([
                    Animated.spring(sharkScale, {
                      toValue: 1,
                      useNativeDriver: true,
                      speed: 12,
                      bounciness: 14,
                    }),
                    Animated.sequence([
                      Animated.timing(sharkRotate, { toValue: 1, duration: 80, useNativeDriver: true }),
                      Animated.timing(sharkRotate, { toValue: -1, duration: 80, useNativeDriver: true }),
                      Animated.timing(sharkRotate, { toValue: 0.5, duration: 60, useNativeDriver: true }),
                      Animated.timing(sharkRotate, { toValue: 0, duration: 60, useNativeDriver: true }),
                    ]),
                  ]).start();
                }}
                onPress={() => {
                  HapticPatterns.buttonTap();
                  playSound(SHARK_TAP_SOUND);
                  RootNavigation.navigate('Inventory');
                }}
                style={{ flex: 1 }}
              >
                <Playercard
                  showBackground={false}
                  inventory={player.inventory}
                  sharkTransform={[
                    { scale: sharkScale },
                    { rotate: sharkRotate.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-3deg', '0deg', '3deg'] }) },
                  ]}
                  style={{
                    position: 'absolute',
                    width: Dimensions.get('window').width,
                    height: 455,
                    marginTop: -55,
                  }}
                />
              </Pressable>

              {/* Edit button tap zone — independent */}
              <Pressable
                onPressIn={() => {
                  Animated.spring(editScale, {
                    toValue: 0.88,
                    useNativeDriver: true,
                    speed: 50,
                    bounciness: 4,
                  }).start();
                }}
                onPressOut={() => {
                  Animated.parallel([
                    Animated.spring(editScale, {
                      toValue: 1,
                      useNativeDriver: true,
                      speed: 12,
                      bounciness: 14,
                    }),
                    Animated.sequence([
                      Animated.timing(editRotate, { toValue: 1, duration: 80, useNativeDriver: true }),
                      Animated.timing(editRotate, { toValue: -1, duration: 80, useNativeDriver: true }),
                      Animated.timing(editRotate, { toValue: 0.5, duration: 60, useNativeDriver: true }),
                      Animated.timing(editRotate, { toValue: 0, duration: 60, useNativeDriver: true }),
                    ]),
                  ]).start();
                }}
                onPress={() => {
                  HapticPatterns.buttonTap();
                  playSound(SHARK_TAP_SOUND);
                  RootNavigation.navigate('Inventory');
                }}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                }}
              >
                <View
                  style={{
                    borderTopRightRadius: 6,
                    backgroundColor: 'rgba(0, 0, 0, .5)',
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingTop: 4,
                    paddingBottom: 4,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Animated.View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      transform: [
                        { scale: editScale },
                        { rotate: editRotate.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-3deg', '0deg', '3deg'] }) },
                      ],
                    }}
                  >
                    <Image
                      source={require('../../assets/images/screens/profile/edit.png')}
                      contentFit="contain"
                      style={{
                        width: 25,
                        height: 25,
                        marginRight: 8,
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: 'Shark',
                        textTransform: 'uppercase',
                        color: 'white',
                        fontSize: 24,
                        textShadowColor: 'rgba(0, 0, 0, .5)',
                        textShadowOffset: {
                          width: 1,
                          height: 1,
                        },
                        textShadowRadius: 0,
                        textAlign: 'center',
                      }}
                    >
                      {labels.edit}
                    </Text>
                  </Animated.View>
                </View>
              </Pressable>
            </ImageBackground>
            <View
              style={{
                backgroundColor: '#f0f4f8',
              }}
            >
              {/* Modern divider line */}
              <View
                style={{
                  height: 1.5,
                  backgroundColor: 'rgba(0,0,0,0.08)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 3,
                  elevation: 2,
                }}
              />
              <View style={{ paddingTop: 20 }}>
              <View
                style={{
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                {/* Experience card */}
                <View
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    borderRadius: 18,
                    padding: 20,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                    elevation: 3,
                  }}
                >
                  <Experience player={player} />
                </View>
              </View>
              <View
                style={{
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                <PlayerButtons buttons={buttons} modern />
              {(player.is_subscribed || player.verified_at) && (
                <View style={{ flexDirection: 'row', marginTop: 12, marginHorizontal: 8, gap: 8 }}>
                  {player.is_subscribed && (
                    <View style={{ flex: 1 }}>
                      <Subscribed />
                    </View>
                  )}
                  {player.verified_at && (
                    <View style={{ flex: 1 }}>
                      <Verified />
                    </View>
                  )}
                </View>
              )}
              {/* Ride Tracker Entry Point */}
              <Pressable
                onPress={() => RootNavigation.navigate('RideTracker')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#00a5f5',
                  borderRadius: 16,
                  padding: 16,
                  marginTop: 20,
                  marginBottom: 8,
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 32 }}>🦈</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', fontFamily: 'Shark' }}>Ride Tracker</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Log rides, earn achievements, track stats</Text>
                </View>
                <Text style={{ color: '#fff', fontSize: 20 }}>→</Text>
              </Pressable>
              <Heading text={labels.your_statistics} />
              <Stats player={player} />
              <Heading text={`${labels.your_friends} (${player.friends_count})`} />
              {/* Friends card */}
              <View
                style={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  borderRadius: 18,
                  padding: 16,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                {friends && friends.length > 0 && (
                  <>
                    <View
                      style={{
                        height: friends.length * 80,
                      }}
                    >
                      <FlashList
                        contentContainerStyle={{ paddingBottom: 8 }}
                        data={friends}
                        keyExtractor={(player) => player.id.toString()}
                        renderItem={({ item }) => {
                          return (
                            <FriendPlayer
                              player={item}
                              isFriend
                              onRemove={() => {
                                requestFriends();
                              }}
                            />
                          );
                        }}
                        estimatedItemSize={80}
                      />
                    </View>
                    <View
                      style={{
                        alignItems: 'center',
                        marginTop: 16,
                        width: 190,
                        marginLeft: 'auto',
                        marginRight: 'auto',
                      }}
                    >
                      <YellowButton
                        onPress={() => {
                          RootNavigation.navigate('Friends');
                        }}
                        text={labels.view_all_friends}
                      />
                    </View>
                  </>
                )}
                {friends && friends.length === 0 && (
                  <>
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        fontSize: 20,
                        textAlign: 'center',
                        paddingTop: 8,
                      }}
                    >
                      {warnings.no_friends}
                    </Text>
                    <View
                      style={{
                        alignItems: 'center',
                        marginTop: 16,
                        width: 190,
                        marginLeft: 'auto',
                        marginRight: 'auto',
                      }}
                    >
                      <YellowButton
                        onPress={() => {
                          RootNavigation.navigate('Friends');
                        }}
                        text={labels.find_friends}
                      />
                    </View>
                  </>
                )}
              </View>
              <View 
                onLayout={(event) => {
                  parksYPosition.current = event.nativeEvent.layout.y + 250; // Offset for header
                }}
              >
                <Heading text={labels.your_parks} />
                {/* Parks card */}
                <View
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    borderRadius: 18,
                    padding: 16,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                    elevation: 3,
                  }}
                >
                  <VisitedParks parks={parks} player={player} />
                </View>
              </View>
              </View>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
