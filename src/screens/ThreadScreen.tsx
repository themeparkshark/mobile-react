import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getThread from '../api/endpoints/threads/getThread';
import Avatar from '../components/Avatar';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import dayjs from '../helpers/dayjs';
import { ThreadType } from '../models/thread-type';

export default function StoreScreen({ route }) {
  const { thread } = route.params;
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [currentThread, setCurrentThread] = useState<ThreadType>();

  useAsyncEffect(async () => {
    setCurrentThread(await getThread(thread));
    setLoading(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    (async () => {
      setCurrentThread(await getThread(thread));
    })();
    setRefreshing(false);
  }, []);

  return (
    <Wrapper>
      <Topbar showBackButton />
      {loading && <Loading />}
      {!loading && currentThread && (
        <ScrollView
          contentContainerStyle={{
            flex: 1,
          }}
          style={{
            marginTop: -8,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View
            style={{
              padding: 16,
              flex: 1,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View>
                <Avatar size={50} user={currentThread.user} />
              </View>
              <View style={{ paddingLeft: 16 }}>
                <Text>
                  {currentThread.user.screen_name} -{' '}
                  {dayjs(currentThread.created_at).startOf('second').fromNow()}
                </Text>
              </View>
            </View>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 28,
                paddingTop: 16,
                paddingBottom: 16,
              }}
            >
              {currentThread.title}
            </Text>
            <Text
              style={{
                fontSize: 16,
              }}
            >
              {currentThread.content}
            </Text>
            <Text>
              Comment - {currentThread.comments_count}, Reactions, Share, Report
            </Text>
            <Text>
              Sort by: Oldest, Newest, Most Reactions
            </Text>
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
