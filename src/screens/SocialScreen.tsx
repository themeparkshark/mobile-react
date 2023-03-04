import { useCallback, useState } from 'react';
import { Image, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getThreads from '../api/endpoints/threads/getThreads';
import Button from '../components/Button';
import CreateThreadModal from '../components/CreateThreadModal';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import UserButtons from '../components/UserButtons';
import Wrapper from '../components/Wrapper';
import { ThreadType } from '../models/thread-type';
import {FlashList} from '@shopify/flash-list';
import Thread from '../components/Thread';

export default function SocialScreen({ navigation }) {
  const [threads, setThreads] = useState<ThreadType[]>([]);
  const [pinnedThreads, setPinnedThreads] = useState<ThreadType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

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

  const buttons = [
    {
      image: require('../../assets/images/screens/social/pin_swaps.png'),
      onPress: () => {
        navigation.navigate('PinSwaps');
      },
      text: 'Pin Trading',
      show: true,
    },
    {
      image: require('../../assets/images/screens/explore/base.png'),
      onPress: () => {},
      text: '?',
      show: true,
    },
    {
      image: require('../../assets/images/screens/explore/base.png'),
      onPress: () => {},
      text: '?',
      show: true,
    },
    {
      image: require('../../assets/images/screens/explore/base.png'),
      onPress: () => {},
      text: '?',
      show: true,
    },
    {
      image: require('../../assets/images/screens/explore/base.png'),
      onPress: () => {},
      text: '?',
      show: true,
    },
  ];

  return (
    <Wrapper>
      <Topbar
        text="Social"
        rightButton={
          <CreateThreadModal
            onSubmit={async () => {
              setPage(1);
              await fetchThreads(1);
            }}
          />
        }
      />
      {loading && <Loading />}
      {!loading && (
        <View
          style={{
            marginTop: -8,
            flex: 1,
          }}
        >
          <FlashList
            data={threads}
            ListHeaderComponent={
              <View
                style={{
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                <View>
                  <UserButtons buttons={buttons} />
                </View>
                {pinnedThreads.map((pinnedThread) => (
                  <View
                    key={pinnedThread.id}
                    style={{
                      paddingTop: 32,
                    }}
                  >
                    <Thread thread={pinnedThread} />
                  </View>
                ))}
              </View>
            }
            ListFooterComponentStyle={{
              height: 64,
            }}
            renderItem={({ item }) => (
              <View
                key={item.id}
                style={{
                  paddingTop: 32,
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                <Thread thread={item} />
              </View>
            )}
            estimatedItemSize={100}
            keyExtractor={(item) => item.id.toString()}
            onEndReached={() => {
              setPage((prevState) => prevState + 1);
            }}
          />
        </View>
      )}
    </Wrapper>
  );
}
