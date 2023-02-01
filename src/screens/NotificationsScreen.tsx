import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import recordActivity from '../api/endpoints/activities/create';
import getNotifications from '../api/endpoints/me/notifications';
import Loading from '../components/Loading';
import Notification from '../components/Notification';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { NotificationType } from '../models/notification-type';

export default function NewsScreen() {
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Notifications screen.');
    }, [])
  );

  const fetchNotifications = async (page: number) => {
    const response = await getNotifications(page);
    setNotifications((prevState) => {
      return [...prevState, ...response];
    });
  };

  useEffect(() => {
    fetchNotifications(page).then(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotifications(1).then(() => setRefreshing(false));
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchNotifications(page);
    }
  }, [page]);

  return (
    <Wrapper>
      <Topbar text="Notifications" showBackButton />
      {loading && <Loading />}
      {!loading && (
        <ScrollView
          style={{
            marginTop: -8,
            flex: 1,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View
            style={{
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 32,
              paddingBottom: 32,
              flex: 1,
            }}
          >
            {notifications.length ? (
              <FlashList
                data={notifications}
                renderItem={({ item }) => <Notification notification={item} />}
                estimatedItemSize={15}
                keyExtractor={(item) => item.id}
                onEndReached={() => {
                  setPage((prevState) => prevState + 1);
                }}
              />
            ) : (
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: 'Knockout',
                  textAlign: 'center',
                }}
              >
                You have no new notifications.
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
