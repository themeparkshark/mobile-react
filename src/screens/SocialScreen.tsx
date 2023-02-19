import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { Image, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getThreads from '../api/endpoints/threads/getThreads';
import Button from '../components/Button';
import CreateThreadModal from '../components/CreateThreadModal';
import Loading from '../components/Loading';
import Thread from '../components/Thread';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { ThreadType } from '../models/thread-type';

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
        <>
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
                paddingTop: 32,
                paddingLeft: 16,
                paddingRight: 16,
                paddingBottom: 16,
              }}
            >
              <ScrollView horizontal>
                {buttons.map((button, index) => {
                  return (
                    <View
                      key={index}
                      style={{ marginLeft: index === 0 ? 0 : 16 }}
                    >
                      <Button onPress={button.onPress}>
                        <Image
                          source={button.image}
                          style={{
                            width: 56,
                            height: 60,
                            marginLeft: 'auto',
                            marginRight: 'auto',
                          }}
                          resizeMode="contain"
                        />
                      </Button>
                    </View>
                  );
                })}
                {[...Array(5)].map((element) => {
                  return (
                    <View
                      key={element}
                      style={{
                        marginLeft: 16,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: 'rgba(0, 0, 0, .8)',
                          borderRadius: 99999,
                          width: 56,
                          height: 56,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            textTransform: 'uppercase',
                            fontSize: 32,
                            color: 'white',
                          }}
                        >
                          ?
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
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
                  key={pinnedThread.id}
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
                    key={item.id}
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
        </>
      )}
    </Wrapper>
  );
}
