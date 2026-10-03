import { useFocusEffect, useIsFocused, useRoute } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { getStamps } from '../api/endpoints/me/stamps';
import { clearStampDotCache, readStampDotCache, stampClaimableCount, writeStampDotCache } from '../components/profile/stampDot';
import Button from '../components/Button';
import Experience from '../components/Experience';
import FeaturedRideCoinCard from '../components/FeaturedRideCoinCard';
import FriendPlayer from '../components/FriendPlayer';
import Heading from '../components/Heading';
import Playercard from '../components/Playercard';
import Stats from '../components/Stats';
import ProfileShortcuts, { type ProfileShortcut } from '../components/profile/ProfileShortcuts';
import { profileStores } from '../components/profile/profileStores';
import StatusBadges from '../components/profile/StatusBadges';
import TitlePill from '../components/profile/TitlePill';
import ProfileEventChip from '../components/profile/ProfileEventChip';
import useCardOnScreen from '../components/profile/useCardOnScreen';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import VisitedParks from '../components/VisitedParks';
import Wrapper from '../components/Wrapper';
import YellowButton from '../components/YellowButton';
import GameIcon from '../ui/GameIcon';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { NotificationContext } from '../context/NotificationProvider';
import { SoundEffectContext, SoundEffectContextType } from '../context/SoundEffectProvider';

const SHARK_TAP_SOUND = require('../../assets/sounds/button_press.mp3');
import useCrumbs from '../hooks/useCrumbs';
import { ParkType } from '../models/park-type';
import { PlayerType } from '../models/player-type';
import { StoreType } from '../models/store-type';

/** The shark stage: 315 pt on tall phones, shorter on 6.1" ones so the shortcut row shows on first view. */
const STAGE_H = Math.round(Math.max(270, Math.min(315, Dimensions.get('window').height * 0.33)));

export default function ProfileScreen() {
  const isProfilePreview = __DEV__ && process.env.EXPO_PUBLIC_PROFILE_PREVIEW === '1';
  const [parks, setParks] = useState<ParkType[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { player, refreshPlayer } = useContext(AuthContext);
  const [friends, setFriends] = useState<PlayerType[]>([]);
  const [friendsUnavailable, setFriendsUnavailable] = useState(false);
  const [parksUnavailable, setParksUnavailable] = useState(false);
  const { refreshNotificationCount, notificationCount } =
    useContext(NotificationContext);
  const { warnings, labels } = useCrumbs();
  const [refreshing, setRefreshing] = useState(false);
  const [extrasUnavailable, setExtrasUnavailable] = useState(false);
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const reducedMotion = useReducedGameMotion();
  const focused = useIsFocused();
  // The XP potion only animates while its card is on screen.
  const levelCard = useCardOnScreen();
  const [stampsToClaim, setStampsToClaim] = useState(0);
  const requestStampDot = useCallback((force = false) => {
    if (isProfilePreview || !player) return;
    const playerId = player.id;
    // The stamp list is a big payload: read it at most every 5 minutes on focus (pull to refresh forces).
    const cached = force ? null : readStampDotCache(playerId);
    if (cached !== null) {
      setStampsToClaim(cached);
      return;
    }
    void getStamps().then((r) => {
      const count = stampClaimableCount(r);
      writeStampDotCache(playerId, count);
      setStampsToClaim(count);
    }).catch(() => setStampsToClaim(0));
  }, [isProfilePreview, player?.id]);

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
        // Pull to refresh also refreshes the player, so level, XP and title catch up.
        const [parkResult, storeResult, friendResult] = await Promise.allSettled([
          getParks(player.id),
          getStores(),
          getFriends(1, 3),
          refreshPlayer(),
        ]);
        if (parkResult.status === 'fulfilled') setParks(parkResult.value);
        if (storeResult.status === 'fulfilled') setStores(storeResult.value);
        if (friendResult.status === 'fulfilled') setFriends(friendResult.value);
        setFriendsUnavailable(friendResult.status === 'rejected');
        setParksUnavailable(parkResult.status === 'rejected');
        setExtrasUnavailable(parkResult.status === 'rejected' ||
          storeResult.status === 'rejected' || friendResult.status === 'rejected');
        await refreshNotificationCount();
        requestStampDot(true);
      }
    } finally {
      setRefreshing(false);
    }
  }, [player, refreshNotificationCount, isProfilePreview, refreshPlayer, requestStampDot]);

  useFocusEffect(
    useCallback(() => {
      if (player && !player.username) {
        RootNavigation.navigate('Welcome');
        return;
      }

      void requestFriends();
      requestStampDot();
      if (!isProfilePreview) void refreshNotificationCount();
    }, [player?.id, player?.username, requestFriends, requestStampDot, refreshNotificationCount, isProfilePreview])
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

  const shortcuts = useMemo<ProfileShortcut[]>(() => {
    const { sharkShop, others } = profileStores(stores);
    const openStore = (store: StoreType) => {
      if (store.is_secret_store && !player?.is_subscribed) {
        RootNavigation.navigate('Membership');
        return;
      }
      RootNavigation.navigate('Store', { store: store.id });
    };
    // An older server without the Shark Shop keeps its legacy Store badge instead (profileStores).
    const showSharkShop = !!sharkShop || stores.length === 0;
    return [
      ...(showSharkShop ? [{
        key: 'shark-shop',
        label: 'Shark Shop',
        image: require('../../assets/images/screens/profile/shortcut_shark_shop.png'),
        hint: 'Opens the shop for new gear',
        onPress: () => {
          if (sharkShop) RootNavigation.navigate('Store', { store: sharkShop.id });
          else RootNavigation.navigate('Store', { store: 'shark-shop' });
        },
      } as ProfileShortcut] : []),
      {
        key: 'stamp-book',
        label: 'Stamp Book',
        image: require('../../assets/images/screens/profile/shortcut_stamp_book.png'),
        hint: stampsToClaim > 0 ? `${stampsToClaim} stamp rewards to claim` : 'Opens your stamps',
        dot: stampsToClaim > 0,
        onPress: () => RootNavigation.navigate('StampBook'),
      },
      {
        key: 'pin-packs',
        label: labels.pin_packs || 'Pin Packs',
        image: require('../../assets/images/screens/profile/pin_collections.png'),
        hint: 'Opens your pin collections',
        onPress: () => RootNavigation.navigate('PinCollections'),
      },
      ...others.map((store): ProfileShortcut => ({
        key: `store-${store.id}`,
        label: store.name,
        image: store.icon_url || require('../../assets/images/screens/profile/pin_collections.png'),
        locked: store.is_secret_store && !player?.is_subscribed,
        hint: store.is_secret_store && !player?.is_subscribed
          ? 'VIP members only. Opens VIP membership'
          : `Opens the ${store.name}`,
        onPress: () => openStore(store),
      })),
    ];
  }, [stores, labels.pin_packs, player?.is_subscribed, stampsToClaim]);

  // Redirect guests to login: must be in useEffect, not during render.
  // Signing out also forgets the Stamp Book dot (it is keyed by player too).
  useEffect(() => {
    if (!player) {
      clearStampDotCache();
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
            accessibilityLabel={notificationCount ? `Notifications, ${notificationCount} new` : 'Notifications'}
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
            accessibilityLabel="Settings"
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
            backgroundColor: '#dff4ff',
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={config.primary} />
          }
          {...levelCard.scrollProps}
        >
          <View
            ref={levelCard.contentRef}
            onLayout={levelCard.remeasure}
            style={{
              // Clear the bottom bar and its raised Explore button.
              paddingBottom: 120,
            }}
          >
            <ImageBackground
              source={player?.inventory?.background_item?.paper_url ? {
                uri: player.inventory.background_item.paper_url,
              } : require('../../assets/images/seaweed_background.png')}
              resizeMode="cover"
              style={{
                height: STAGE_H,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {/* Shark tap zone */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Your shark"
                accessibilityHint="Opens the dressing room"
                onPressIn={() => {
                  if (reducedMotion) return;
                  Animated.spring(sharkScale, {
                    toValue: 0.92,
                    useNativeDriver: true,
                    speed: 50,
                    bounciness: 4,
                  }).start();
                }}
                onPressOut={() => {
                  if (reducedMotion) return;
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
                    // Keep the shark centred when the stage is shorter than 315.
                    marginTop: -55 - (315 - STAGE_H) / 2,
                  }}
                />
              </Pressable>

              {/* Edit button tap zone: independent */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labels.edit || 'Edit'}
                accessibilityHint="Opens the dressing room"
                hitSlop={8}
                onPressIn={() => {
                  if (reducedMotion) return;
                  Animated.spring(editScale, {
                    toValue: 0.88,
                    useNativeDriver: true,
                    speed: 50,
                    bounciness: 4,
                  }).start();
                }}
                onPressOut={() => {
                  if (reducedMotion) return;
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
                    borderTopRightRadius: 14,
                    backgroundColor: 'rgba(5, 52, 110, 0.72)',
                    minHeight: 44,
                    paddingLeft: 12,
                    paddingRight: 14,
                    paddingTop: 6,
                    paddingBottom: 6,
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
              <View style={{ marginTop: 12 }}>
                <TitlePill title={player.title} trophy={<ProfileEventChip />} />
              </View>
              <View style={{ paddingTop: 10 }}>
              <View
                style={{
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                <View ref={levelCard.cardRef} onLayout={levelCard.remeasure} style={{ paddingTop: 0, paddingBottom: 2 }}>
                  <Experience player={player} own paused={!focused || levelCard.offscreen} />
                </View>
              </View>
              <View
                style={{
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                <View style={{ marginTop: 12 }}>
                  <ProfileShortcuts items={shortcuts} loading={loading} />
                </View>
                <StatusBadges isVip={!!player.is_subscribed} isVerified={!!player.verified_at} own />
                {/* The showcase coin sits under the shortcuts so the row is visible on first view. */}
                {!!player.featured_ride_coin && (
                  <FeaturedRideCoinCard coin={player.featured_ride_coin}
                    onPress={() => RootNavigation.navigate('CoinShelf', {
                      focusCoin: { assetId: player.featured_ride_coin!.id },
                    })} />
                )}
              {/* Compact illustrated entry to the ride journal. */}
              <Pressable
                onPress={() => RootNavigation.navigate('RideTracker')}
                accessibilityRole="button"
                accessibilityLabel="Ride Tracker"
                accessibilityHint="Opens your rides and park memories"
                style={({ pressed }) => ({
                  // Nested lip (a lip-coloured card under a white card): no corner spur.
                  backgroundColor: '#c6e3f5',
                  borderRadius: 20,
                  paddingBottom: 5,
                  marginTop: 12,
                  marginBottom: 8,
                  shadowColor: '#05346e',
                  shadowOpacity: 0.14,
                  shadowOffset: { width: 0, height: 3 },
                  shadowRadius: 6,
                  elevation: 3,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ffffff',
                  borderRadius: 20, paddingHorizontal: 17, paddingVertical: 13 }}>
                  <Image source={require('../../assets/images/screens/inventory/shark-colored-v2.png')}
                    style={{ width: 55, height: 55 }} contentFit="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#174D76', fontSize: 19, fontFamily: 'Shark' }}>Ride Tracker</Text>
                    <Text style={{ color: '#366A8C', fontSize: 15, fontFamily: 'Knockout' }}>Your rides and park memories</Text>
                  </View>
                  <GameIcon name="arrow" size={28} />
                </View>
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
                    {/* Three rows at most: a plain map, no nested list. */}
                    {friends.map((friend) => (
                      <FriendPlayer key={friend.id} player={friend} isFriend inset />
                    ))}
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
