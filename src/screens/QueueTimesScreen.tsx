import Topbar from '../components/Topbar';
import {
  ActivityIndicator,
  ScrollView,
  View,
  Text,
  RefreshControl, SafeAreaView,
} from 'react-native';
import { Chevron } from 'react-native-shapes';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import get from '../api/endpoints/parks/queue-times/get';
import { QueueTimeType } from '../models/queue-time-type';
import dayjs from '../helpers/dayjs';
import RNPickerSelect from 'react-native-picker-select';
import {ParkType} from '../models/park-type';
import allParks from '../api/endpoints/parks/allParks';

export default function QueueTimesScreen({ route }) {
  const [queueTimes, setQueueTimes] = useState<QueueTimeType[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const [time, setTime] = useState<number>();
  const [parks, setParks] = useState<ParkType[]>();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedPark, setSelectedPark] = useState<number>(route.params.park);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Queue Times screen.');
    }, [])
  );

  const requestQueueTimes = async () => {
    setQueueTimes(await get(selectedPark));
  };

  useEffect(() => {
    (async () => {
      setParks(await allParks());
      await requestQueueTimes();
      setLoading(false);
    })();
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
  }, [time, selectedPark]);

  return (
    <>
      <Topbar text="Queue Times" showBackButton />
      {loading && (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="large" />
        </View>
      )}
      {!loading && queueTimes && (
        <>
          {queueTimes.length === 0 && (
            <View
              style={{
                marginTop: -8,
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 32,
                paddingBottom: 32,
                backgroundColor: 'red',
                flex: 1,
              }}
            >
              <Text style={{ textAlign: 'center'}}>Something went wrong. Please try again later.</Text>
            </View>
          )}
          {queueTimes.length > 0 && parks && (
            <SafeAreaView style={{
              flex: 1,
              marginTop: -8,
            }}>
              <ScrollView
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
              >
                <View style={{
                  paddingLeft: 16,
                  paddingRight: 16,
                  paddingTop: 32,
                }}>
                  <Text>Select a park:</Text>
                  <RNPickerSelect
                    placeholder={{}}
                    onValueChange={(value) => setSelectedPark(value)}
                    onClose={() => setTime(Date.now())}
                    value={selectedPark}
                    items={parks.map((item) => {
                      return {
                        label: item.name,
                        value: item.id,
                      };
                    })}
                    style={{
                      inputIOS: {
                        fontSize: 16,
                        paddingVertical: 12,
                        paddingHorizontal: 10,
                        borderWidth: 1,
                        borderColor: 'gray',
                        borderRadius: 4,
                        color: 'black',
                        paddingRight: 30,
                      },
                      iconContainer: {
                        top: 18,
                        right: 15,
                      },
                    }}
                    Icon={() => <Chevron size={1.5} color="gray" />}
                  />
                  <Text style={{fontWeight: 'bold', textAlign: 'center', paddingTop: 32}}>
                    Last updated: {queueTimes && dayjs(queueTimes[0].updated_at).startOf('second').fromNow()} ago
                  </Text>
                  {queueTimes?.map((queueTime, index) => {
                    return (
                      <View key={queueTime.id} style={{paddingTop: 16}}>
                        <Text>{queueTime.ride} - {queueTime.wait_time} minute{queueTime.wait_time !== 1 ? 's' : ''}</Text>
                      </View>
                    );
                  })}
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
            </SafeAreaView>
          )}
        </>
      )}
    </>
  );
}
