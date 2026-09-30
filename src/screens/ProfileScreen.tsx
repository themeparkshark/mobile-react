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
import * as RootNavigation from '../RootNavigation';
import getFriends from '../api/endpoints/me/friends';
import getParks from '../api/endpoints/me/visited-parks';
import getStores from '../api/endpoints/stores/stores';
import Button from '../components/Button';
import Experience from '../components/Experience';
import FeaturedRideCoinCard from '../components/FeaturedRideCoinCard';
import FriendPlayer from '../components/FriendPlayer';
import Heading from '../components/Heading';
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
import GameIcon from '../ui/GameIcon';
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
  const isProfilePreview = __DEV__ && process.env.EXPO_PUBLIC_PROFILE_PREVIEW === '1';
  const [parks, setParks] = useState<ParkType[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [buttons, setButtons] = useState<ButtonType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { player } = useContext(AuthContext);
  const [friends, setFriends] = useState<PlayerType[]>([]);
  const [friendsUnavailable, setFriendsUnavailable] = useState(false);
  const [parksUnavailable, setParksUnavailable] = useState(false);
  const { refreshNotificationCount, notificationCount } =
    useContext(NotificationContext);
  const { warnings, labels } = useCrumbs();
  const [refreshing, setRefreshing] = useState(false);
  const [extrasUnavailable, setExtrasUnavailable] = useState(false);
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

  const requestFriends = useCallback(async () => {
    if (isProfilePreview) return;
    try {
      setFriends(await getFriends(1, 3));
      setFriendsUnavailable(false);
    } catch {
      setFriendsUnavailable(true);
    }
  }, [isProfilePreview]);

  const onRefresh = useCallback(async () => {
    if (isProfilePreview) return;
    setRefreshing(true);
    try {
      if (player) {
        const [parkResult, storeResult, friendResult] = await Promise.allSettled([
          getParks(player.id),
          getStores(),
          getFriends(1, 3),
        ]);
        if (parkResult.status === 'fulfilled') setParks(parkResult.value);
        if (storeResult.status === 'fulfilled') setStores(storeResult.value);
        if (friendResult.status === 'fulfilled') setFriends(friendResult.value);
        setFriendsUnavailable(friendResult.status === 'rejected');
        setParksUnavailable(parkResult.status === 'rejected');
        setExtrasUnavailable(parkResult.status === 'rejected' ||
          storeResult.status === 'rejected' || friendResult.status === 'rejected');
        await refreshNotificationCount();
      }
    } finally {
      setRefreshing(false);
    }
  }, [player, refreshNotificationCount, isProfilePreview]);

  useFocusEffect(
    useCallback(() => {
      if (player && !player.username) {
        RootNavigation.navigate('Welcome');
        return;
      }

      void requestFriends();
      if (!isProfilePreview) void refreshNotificationCount();
    }, [player?.id, player?.username, requestFriends, refreshNotificationCount, isProfilePreview])
  );

  useEffect(() => {
    let active = true;
    if (!player) {
      setLoading(false);
      return;
    }
    if (isProfilePreview) {
      setExtrasUnavailable(true);
      setFriendsUnavailable(true);
      setParksUnavailable(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.allSettled([getParks(player.id), getStores(), getFriends(1, 3)])
      .then(([parkResult, storeResult, friendResult]) => {
        if (!active) return;
        if (parkResult.status === 'fulfilled') setParks(parkResult.value);
        if (storeResult.status === 'fulfilled') setStores(storeResult.value);
        if (friendResult.status === 'fulfilled') setFriends(friendResult.value);
        setFriendsUnavailable(friendResult.status === 'rejected');
        setParksUnavailable(parkResult.status === 'rejected');
        setExtrasUnavailable(parkResult.status === 'rejected' ||
          storeResult.status === 'rejected' || friendResult.status === 'rejected');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [player?.id, isProfilePreview]);

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
          text: labels.pin_packs || 'Pin Packs',
        },
        ...stores.map((store) => {
          return {
            image: store.icon_url ?? (store.name === 'Shark Shop'
              ? require('../../assets/images/screens/profile/shark_shop.png') : undefined),
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
  }, [stores, labels.pin_packs, player?.is_subscribed]);

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
      {player && (
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
              } : require('../../assets/images/seaweed_background.png')}
              resizeMode="cover"
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
                    backgroundColor: 'rgba(5, 52, 110, 0.6)',
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
                      {labels.edit || 'Edit'}
                    </Text>
                  </Animated.View>
                </View>
              </Pressable>
            </ImageBackground>
            <View
              style={{
                backgroundColor: '#dff4ff',
              }}
            >
              {!!player.title && (
                <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: '#ffcf3b', borderRadius: 16, borderWidth: 2, borderColor: '#ffffff',
                  borderBottomWidth: 4, borderBottomColor: '#d99a00',
                  paddingHorizontal: 14, paddingVertical: 6, marginTop: 12 }}>
                  <GameIcon name="crown" size={20} />
                  <Text style={{ color: '#05346e', fontFamily: 'Shark', fontSize: 17,
                    textAlign: 'center' }} numberOfLines={1}>{player.title}</Text>
                </View>
              )}
              {!!player.featured_ride_coin && (
                <View style={{ marginHorizontal: 16 }}>
                  <FeaturedRideCoinCard coin={player.featured_ride_coin}
                    onPress={() => RootNavigation.navigate('CoinShelf', {
                      focusCoin: { assetId: player.featured_ride_coin!.id },
                    })} />
                </View>
              )}
              <View style={{ paddingTop: 20 }}>
              <View
                style={{
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                <View style={{ paddingTop: 4, paddingBottom: 6 }}>
                  <Experience player={player} />
                </View>
              </View>
              <View
                style={{
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                <PlayerButtons buttons={buttons} />
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
              {/* Compact illustrated entry to the ride journal. */}
              <Pressable
                onPress={() => RootNavigation.navigate('RideTracker')}
                accessibilityRole="button"
                accessibilityLabel="Open Ride Tracker"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#DFF4FF',
                  borderColor: '#58B6E8',
                  borderWidth: 2,
                  borderRadius: 15,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  marginTop: 16,
                  marginBottom: 8,
                  gap: 10,
                }}
              >
                <Image source={require('../../assets/images/screens/inventory/shark-colored-v2.png')}
                  style={{ width: 55, height: 55 }} contentFit="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#174D76', fontSize: 19, fontFamily: 'Shark' }}>Ride Tracker</Text>
                  <Text style={{ color: '#366A8C', fontSize: 15, fontFamily: 'Knockout' }}>Your rides and park memories</Text>
                </View>
                <GameIcon name="arrow" size={28} />
              </Pressable>
              {extrasUnavailable && (
                <Text style={{ color: '#526477', fontFamily: 'Knockout', fontSize: 14,
                  textAlign: 'center', marginTop: 6 }}>
                  Some details are unavailable. Pull down to retry.
                </Text>
              )}
              <Heading text={labels.your_statistics || 'Your statistics'} />
              <Stats player={player} />
              <Heading text={`${labels.your_friends || 'Your friends'} (${player.friends_count})`} />
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
                {friends.length > 0 && (
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
                        text={labels.view_all_friends || 'View all friends'}
                      />
                    </View>
                  </>
                )}
                {friendsUnavailable && friends.length === 0 && (
                  <Text style={{ fontFamily: 'Knockout', fontSize: 18, textAlign: 'center', paddingTop: 8,
                    color: '#46617A' }}>
                    Friends will appear when you reconnect.
                  </Text>
                )}
                {!friendsUnavailable && friends.length === 0 && (
                  <>
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        fontSize: 20,
                        textAlign: 'center',
                        paddingTop: 8,
                        color: '#05346e',
                      }}
                    >
                      {warnings.no_friends || 'You have no friends yet.'}
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
                        text={labels.find_friends || 'Find friends'}
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
                <Heading text={labels.your_parks || 'Your parks'} />
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
                  {parksUnavailable && parks.length === 0 ? (
                    <Text style={{ fontFamily: 'Knockout', fontSize: 18, textAlign: 'center',
                      color: '#46617A', paddingTop: 8, paddingBottom: 12 }}>
                      Your parks will appear when you reconnect.
                    </Text>
                  ) : <VisitedParks parks={parks} player={player} />}
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
