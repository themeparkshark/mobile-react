import { FlashList } from '@shopify/flash-list';
import { useContext, useEffect, useLayoutEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getNotifications from '../api/endpoints/me/notifications';
import updateLastReadNotificationsAt from '../api/endpoints/me/update-last-read-notifications-at';
import Loading from '../components/Loading';
import Notification from '../components/Notification';
import Topbar from '../components/Topbar';
import { NotificationContext } from '../context/NotificationProvider';
import useCrumbs from '../hooks/useCrumbs';
import { NotificationType } from '../models/notification-type';
import Button from "../components/Button";
import markAllAsRead from "../api/endpoints/me/notifications/markAllAsRead";

export default function NewsScreen() {
  const { refreshNotificationCount } = useContext(NotificationContext);
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const { warnings } = useCrumbs();

  useLayoutEffect(() => {
    updateLastReadNotificationsAt().then(() => refreshNotificationCount());
  }, []);

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

  return (
    <>
      <Topbar text="Notifications" showBackButton rightButton={
        <Button onPress={async () => {
          await markAllAsRead();
          setLoading(true);
          setNotifications([]);
          setPage(1);
          await fetchNotifications(1);
          setLoading(false);
        }}>
          <Image
            style={{
              width: 35,
              height: 35,
              alignSelf: 'center',
            }}
            resizeMode="contain"
            source={require('../../assets/images/screens/notifications/mark_all_as_read.png')}
          />
        </Button>
      } />
      {loading && <Loading />}
      {!loading && (
        <View
          style={{
            marginTop: -8,
            flex: 1,
          }}
        >
          {!!notifications.length && (
            <FlashList
              contentContainerStyle={{
                paddingTop: 32,
                paddingBottom: 32,
              }}
              onRefresh={() => {
                setRefreshing(true);
                setNotifications([]);
                fetchNotifications(1).then(() => setRefreshing(false));
                setPage(1);
              }}
              refreshing={refreshing}
              data={notifications}
              renderItem={({ item }) => <Notification notification={item} />}
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
                paddingTop: 32,
              }}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontFamily: 'Knockout',
                  textAlign: 'center',
                }}
              >
                {warnings.no_notifications}
              </Text>
            </View>
          )}
        </View>
      )}
    </>
  );
}
