import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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

export default function NotificationsScreen() {
  const { refreshNotificationCount } = useContext(NotificationContext);
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [markingRead, setMarkingRead] = useState(false);
  const [page, setPage] = useState<number>(1);
  const { warnings } = useCrumbs();

  const fetchNotifications = async (page: number) => {
    const response = await getNotifications(page);
    setNotifications((prevState) => {
      return [...prevState, ...response];
    });
  };

  useEffect(() => {
    fetchNotifications(page).then(() => setLoading(false));
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchNotifications(page);
    }
  }, [page]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const fresh = await getNotifications(1);
    setNotifications(fresh);
    setPage(1);
    setRefreshing(false);
  }, []);

  const handleMarkAllRead = async () => {
    setMarkingRead(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await markAllAsRead();
    const fresh = await getNotifications(1);
    setNotifications(fresh);
    setPage(1);
    await refreshNotificationCount();
    setMarkingRead(false);
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
          <Button
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
          </Button>
        </TopbarColumn>
      </Topbar>
      {loading && <Loading />}
      {!loading && (
        <View
          style={{
            flex: 1,
            backgroundColor: '#f0f4f8',
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
          {!notifications.length && !refreshing && (
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
                paddingBottom: 80,
              }}
            >
              <Image
                source={require('../../assets/images/screens/profile/notifications.png')}
                style={{ width: 80, height: 80, marginBottom: 16, opacity: 0.4 }}
                contentFit="contain"
              />
              <Text
                style={{
                  fontSize: 20,
                  fontFamily: 'Shark',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  marginBottom: 6,
                }}
              >
                All Caught Up!
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: 'Knockout',
                  color: '#94a3b8',
                  textAlign: 'center',
                }}
              >
                No new notifications right now
              </Text>
            </View>
          )}
        </View>
      )}
    </>
  );
}
