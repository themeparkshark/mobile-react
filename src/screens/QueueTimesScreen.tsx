import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import { Chevron } from 'react-native-shapes';
import { useAsyncEffect } from 'rooks';
import recordActivity from '../api/endpoints/activities/create';
import allParks from '../api/endpoints/parks/allParks';
import get from '../api/endpoints/parks/queue-times/get';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import dayjs from '../helpers/dayjs';
import { ParkType } from '../models/park-type';
import { QueueTimeType } from '../models/queue-time-type';

export default function QueueTimesScreen({ route }) {
  const [queueTimes, setQueueTimes] = useState<QueueTimeType[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const [parks, setParks] = useState<ParkType[]>();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedPark, setSelectedPark] = useState<number>(route.params.park);

  const requestQueueTimes = async () => {
    setQueueTimes(await get(selectedPark));
  };

  useAsyncEffect(async () => {
    setParks(await allParks());
    await requestQueueTimes();
    setLoading(false);
  }, []);

  const onRefresh = useCallback(() => {
    (async () => {
      setRefreshing(true);
      await requestQueueTimes();
      setRefreshing(false);
    })();
  }, []);

  useEffect(() => {
    requestQueueTimes();
  }, [selectedPark]);

  return (
    <>
      <Topbar text="Queue Times" showBackButton />
      {loading && <Loading />}
      {!loading && queueTimes && (
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
                <ScrollView
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                    />
                  }
                >
                  <View
                    style={{
                      padding: 16,
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
                            paddingBottom: 32,
                          }}
                        >
                          Last updated:{' '}
                          {queueTimes &&
                            dayjs(queueTimes[0].last_check_at)
                              .startOf('second')
                              .fromNow()}{' '}
                          ago
                        </Text>
                        {queueTimes?.map((queueTime) => {
                          return (
                            <View
                              key={queueTime.id}
                              style={{
                                padding: 16,
                                borderLeftColor: queueTime.is_open
                                  ? queueTime.wait_time <= 20
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
                                  {queueTime.ride}
                                </Text>
                              </View>
                              <View>
                                {queueTime.is_open && (
                                  <Text
                                    style={{
                                      fontFamily: 'Knockout',
                                      fontSize: 18,
                                    }}
                                  >
                                    {queueTime.wait_time}m
                                  </Text>
                                )}
                                {!queueTime.is_open && (
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
                          );
                        })}
                      </>
                    )}
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
                </ScrollView>
              </View>
            </ImageBackground>
          </View>
        </>
      )}
    </>
  );
}
