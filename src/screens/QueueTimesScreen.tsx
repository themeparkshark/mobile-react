import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { ImageBackground, Text, View } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import { Chevron } from 'react-native-shapes';
import { useAsyncEffect } from 'rooks';
import allParks from '../api/endpoints/parks/allParks';
import get from '../api/endpoints/parks/queue-times/get';
import Loading from '../components/Loading';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import dayjs from '../helpers/dayjs';
import { ParkType } from '../models/park-type';
import { QueueTimeType } from '../models/queue-time-type';

export default function QueueTimesScreen({ route }) {
  const [queueTimes, setQueueTimes] = useState<QueueTimeType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [parks, setParks] = useState<ParkType[]>();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedPark, setSelectedPark] = useState<number>(route.params.park);
  const [page, setPage] = useState<number>(1);

  const fetchQueueTimes = async (page: number) => {
    const response = await get(selectedPark, page);
    setQueueTimes((prevState) => {
      return [...prevState, ...response];
    });
  };

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchQueueTimes(page);
    }
  }, [page]);

  useAsyncEffect(async () => {
    setParks(await allParks());
  }, []);

  useAsyncEffect(async () => {
    setPage(1);
    setQueueTimes([]);
    await fetchQueueTimes(1);
    setLoading(false);
  }, [selectedPark]);

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Queue Times</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      {loading && <Loading />}
      {!loading && (
        <>
          <View
            style={{
              flex: 1,
              marginTop: -8,
            }}
          >
            <ImageBackground
              style={{
                flex: 1,
              }}
              source={require('../../assets/images/seaweed_background.png')}
            >
              <View
                style={{
                  padding: 16,
                }}
              >
                {parks && (
                  <RNPickerSelect
                    placeholder={{}}
                    onValueChange={(value) => setSelectedPark(value)}
                    value={selectedPark}
                    items={parks.map((item) => {
                      return {
                        label: item.name,
                        value: item.id,
                      };
                    })}
                    style={{
                      inputIOS: {
                        paddingVertical: 12,
                        paddingHorizontal: 10,
                        borderWidth: 3,
                        borderRadius: 10,
                        paddingRight: 30,
                        backgroundColor: 'rgba(255, 255, 255, .4)',
                        borderColor: 'white',
                        color: 'white',
                        fontSize: 20,
                        textAlign: 'center',
                        fontFamily: 'Knockout',
                        textShadowColor: 'rgba(0, 0, 0, .4)',
                        textShadowRadius: 5,
                      },
                      iconContainer: {
                        top: 22,
                        right: 22,
                      },
                    }}
                    Icon={() => <Chevron size={1.5} color="white" />}
                  />
                )}
              </View>
              <View
                style={{
                  backgroundColor: 'rgba(255, 255, 255, .6)',
                  borderTopWidth: 5,
                  borderTopColor: '#fff',
                  flex: 1,
                }}
              >
                {queueTimes.length > 0 && (
                  <>
                    <Text
                      style={{
                        fontWeight: 'bold',
                        fontFamily: 'Knockout',
                        textAlign: 'center',
                        fontSize: 16,
                        paddingTop: 16,
                        paddingBottom: 16,
                      }}
                    >
                      Last updated:{' '}
                      {queueTimes &&
                        dayjs(queueTimes[0].last_check_at)
                          .startOf('second')
                          .fromNow()}
                    </Text>
                    <FlashList
                      contentContainerStyle={{
                        paddingLeft: 16,
                        paddingRight: 16,
                      }}
                      ListFooterComponent={
                        <View
                          style={{
                            padding: 16,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              textAlign: 'center',
                              opacity: 0.4,
                              paddingTop: 32,
                            }}
                          >
                            Powered by Queue-Times.com
                          </Text>
                        </View>
                      }
                      onRefresh={() => {
                        setRefreshing(true);
                        setQueueTimes([]);
                        fetchQueueTimes(1).then(() => setRefreshing(false));
                        setPage(1);
                      }}
                      refreshing={refreshing}
                      data={queueTimes}
                      renderItem={({ item }) => (
                        <View
                          style={{
                            padding: 16,
                            borderLeftColor: item.is_open
                              ? item.wait_time <= 20
                                ? 'green'
                                : 'orange'
                              : 'red',
                            borderLeftWidth: 3,
                            marginBottom: 8,
                            flexDirection: 'row',
                          }}
                        >
                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 18,
                                paddingRight: 16,
                              }}
                            >
                              {item.ride}
                            </Text>
                          </View>
                          <View>
                            {item.is_open && (
                              <Text
                                style={{
                                  fontFamily: 'Knockout',
                                  fontSize: 18,
                                }}
                              >
                                {item.wait_time}m
                              </Text>
                            )}
                            {!item.is_open && (
                              <Text
                                style={{
                                  textTransform: 'uppercase',
                                  fontFamily: 'Knockout',
                                  fontSize: 18,
                                }}
                              >
                                {' '}
                                closed
                              </Text>
                            )}
                          </View>
                        </View>
                      )}
                      estimatedItemSize={300}
                      keyExtractor={(item) => item.id}
                      onEndReached={() => {
                        setPage((prevState) => prevState + 1);
                      }}
                    />
                  </>
                )}
              </View>
            </ImageBackground>
          </View>
        </>
      )}
    </>
  );
}
