import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { truncate } from 'lodash';
import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import recordActivity from '../api/endpoints/activities/create';
import getThreads from '../api/endpoints/threads/getThreads';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import dayjs from '../helpers/dayjs';
import { ThreadType } from '../models/thread-type';

export default function SocialScreen({ navigation }) {
  const [threads, setThreads] = useState<ThreadType[]>([]);
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
              padding: 16,
              flex: 1,
            }}
          >
            <FlashList
              data={threads}
              renderItem={({ item }) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => {
                    navigation.navigate('Thread', {
                      thread: item.id,
                    });
                  }}
                  style={{
                    flexDirection: 'row',
                    paddingTop: 32,
                  }}
                >
                  <View>
                    <Avatar size={60} user={item.user} />
                  </View>
                  <View
                    style={{
                      paddingLeft: 16,
                      flex: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        fontSize: 22,
                        paddingBottom: 8,
                      }}
                    >
                      {item.title}
                    </Text>
                    {item.latest_comment && (
                      <>
                        <Text
                          style={{
                            paddingBottom: 8,
                          }}
                        >
                          {item.latest_comment.user.screen_name} replied{' '}
                          {dayjs(item.latest_comment.updated_at)
                            .startOf('second')
                            .fromNow()}{' '}
                          ago
                        </Text>
                        <Text
                          style={{
                            opacity: 0.5,
                          }}
                        >
                          {truncate(item.latest_comment.content, {
                            length: 100,
                          })}
                        </Text>
                      </>
                    )}
                  </View>
                  <View
                    style={{
                      paddingLeft: 16,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        backgroundColor: 'rgba(0, 0, 0, .05)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 16,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 18,
                        }}
                      >
                        {item.comments_count}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
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
