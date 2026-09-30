import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAsyncEffect } from 'rooks';
import getNotifications from '../api/endpoints/me/notifications';
import markAllAsRead from '../api/endpoints/me/notifications/markAllAsRead';
import Button from '../components/Button';
import Loading from '../components/Loading';
import Notification from '../components/Notification';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import config from '../config';
import { NotificationContext } from '../context/NotificationProvider';
import useCrumbs from '../hooks/useCrumbs';
import { NotificationType } from '../models/notification-type';
import Reanimated, {
  cancelAnimation, Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { BRAND, GameIcon, gameAlert, SharkLoader, textPreset } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';

/** Mark-all-read only makes sense when something is unread. */
export function showMarkAllRead(notifications: readonly { read_at?: string | null }[]): boolean {
  return notifications.some(n => !n.read_at);
}

/** "All caught up": his bell rings twice every few seconds; reduced motion keeps it still. */
function CaughtUp() {
  const reduced = useUiReducedMotion();
  const ring = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    ring.value = withDelay(500, withRepeat(withSequence(
      withTiming(1, { duration: 90 }), withTiming(-1, { duration: 120 }), withTiming(0.7, { duration: 110 }),
      withTiming(-0.5, { duration: 110 }), withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 2600 }),
    ), -1, false));
    return () => cancelAnimation(ring);
  }, [reduced, ring]);
  const bellStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${ring.value * 14}deg` }] }));
  return (
    <Reanimated.View entering={reduced ? undefined : FadeInDown.springify().damping(14)}
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80, paddingHorizontal: 32 }}>
      <Reanimated.View style={bellStyle}>
        <GameIcon name="bell" size={96} />
      </Reanimated.View>
      <Text style={{ fontSize: 24, fontFamily: 'Shark', color: BRAND.navy, textTransform: 'uppercase', textAlign: 'center', marginTop: 14 }}>
        All caught up!
      </Text>
      <Text style={[textPreset('body'), { color: BRAND.navySoft, textAlign: 'center', marginTop: 6 }]}>
        Boss alerts, friend requests and rewards show up here.
      </Text>
    </Reanimated.View>
  );
}

export default function NotificationsScreen() {
  const { refreshNotificationCount } = useContext(NotificationContext);
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [failed, setFailed] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [page, setPage] = useState<number>(1);
  const { warnings } = useCrumbs();

  const fetchNotifications = async (page: number) => {
    const response = await getNotifications(page);
    setNotifications((prevState) => {
      return [...prevState, ...response];
    });
  };

  const loadFirstPage = () => {
    setLoading(true);
    setFailed(false);
    getNotifications(1)
      .then(fresh => { setNotifications(fresh); setPage(1); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFirstPage();
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchNotifications(page).catch(() => undefined);
    }
  }, [page]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await getNotifications(1);
      setNotifications(fresh);
      setPage(1);
    } catch {
      // Keep what is on screen.
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleMarkAllRead = async () => {
    if (markingRead) return;
    setMarkingRead(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      await markAllAsRead();
      const fresh = await getNotifications(1);
      setNotifications(fresh);
      setPage(1);
      await refreshNotificationCount();
    } catch {
      gameAlert("Couldn't mark them read", 'Check your connection and try again.');
    } finally {
      setMarkingRead(false);
    }
  };

  const handleDeleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Notifications</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          {showMarkAllRead(notifications) && <Button
            onPress={handleMarkAllRead}
          >
            <Image
              style={{
                width: 35,
                height: 35,
                alignSelf: 'center',
                opacity: markingRead ? 0.4 : 1,
              }}
              contentFit="contain"
              source={require('../../assets/images/screens/notifications/mark_all_as_read.png')}
            />
          </Button>}
        </TopbarColumn>
      </Topbar>
      {loading && <Loading />}
      {!loading && failed && (
        <SharkLoader state="error" title="Notifications didn't load" onRetry={loadFirstPage} style={{ backgroundColor: '#e3f3ff', marginTop: -8 }} />
      )}
      {!loading && !failed && (
        <View
          style={{
            flex: 1,
            backgroundColor: '#e3f3ff',
            marginTop: -8,
          }}
        >
          {!!notifications.length && (
            <FlashList
              contentContainerStyle={{
                paddingTop: 16,
                paddingBottom: 80,
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={config.secondary}
                  colors={[config.secondary]}
                />
              }
              data={notifications}
              ListHeaderComponent={
                <>
                  {/* Unread count banner */}
                  {unreadCount > 0 && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 20,
                        paddingVertical: 8,
                        marginBottom: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View
                          style={{
                            backgroundColor: config.secondary,
                            borderRadius: 10,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: 'Shark',
                              fontSize: 11,
                              color: 'white',
                            }}
                          >
                            {unreadCount}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 13,
                            color: '#64748b',
                            textTransform: 'uppercase',
                          }}
                        >
                          Unread
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={handleMarkAllRead}
                        disabled={markingRead}
                        style={{ opacity: markingRead ? 0.5 : 1 }}
                      >
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 13,
                            color: config.secondary,
                            textTransform: 'uppercase',
                          }}
                        >
                          Mark all read
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              }
              renderItem={({ item }) => (
                <Notification
                  notification={item}
                  onDelete={handleDeleteNotification}
                />
              )}
              estimatedItemSize={80}
              keyExtractor={(item) => item.id}
              onEndReached={() => {
                setPage((prevState) => prevState + 1);
              }}
            />
          )}
          {!notifications.length && !refreshing && <CaughtUp />}
        </View>
      )}
    </>
  );
}
