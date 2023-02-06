import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import recordActivity from '../api/endpoints/activities/create';
import getThreads from '../api/endpoints/threads/getThreads';
import Button from '../components/Button';
import Loading from '../components/Loading';
import Thread from '../components/Thread';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { ThreadType } from '../models/thread-type';

export default function SocialScreen() {
  const [threads, setThreads] = useState<ThreadType[]>([]);
  const [pinnedThreads, setPinnedThreads] = useState<ThreadType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Social screen.');
    }, [])
  );

  const fetchThreads = async (page: number) => {
    const response = await getThreads(page);
    setThreads((prevState) => {
      return [...prevState, ...response];
    });

    setPinnedThreads(await getThreads(1, true));
  };

  useAsyncEffect(async () => {
    await fetchThreads(page);
    setLoading(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setThreads([]);
    fetchThreads(1).then(() => setRefreshing(false));
    setPage(1);
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchThreads(page);
    }
  }, [page]);

  return (
    <Wrapper>
      <Topbar
        text="Social"
        rightButton={
          <Button onPress={() => {}}>
            <Image
              style={{
                width: 50,
                height: 50,
                alignSelf: 'center',
              }}
              contentFit="contain"
              source={require('../../assets/images/screens/profile/settings.png')}
            />
          </Button>
        }
      />
      {loading && <Loading />}
      {!loading && (
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
              paddingLeft: 16,
              paddingRight: 16,
              paddingBottom: 16,
              flex: 1,
            }}
          >
            {pinnedThreads.map((pinnedThread) => (
              <View
                style={{
                  paddingTop: 32,
                }}
              >
                <Thread thread={pinnedThread} />
              </View>
            ))}
            <FlashList
              data={threads}
              renderItem={({ item }) => (
                <View
                  style={{
                    paddingTop: 32,
                  }}
                >
                  <Thread thread={item} />
                </View>
              )}
              estimatedItemSize={15}
              keyExtractor={(item) => item.id.toString()}
              onEndReached={() => {
                setPage((prevState) => prevState + 1);
              }}
            />
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
