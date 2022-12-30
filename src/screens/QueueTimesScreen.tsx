import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import {ActivityIndicator, ScrollView, View, Text, RefreshControl} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import get from '../api/endpoints/parks/queue-times/get';
import {QueueTimeType} from '../models/queue-time-type';
import dayjs from '../helpers/dayjs';

export default function QueueTimesScreen({ route }) {
  const [queueTimes, setQueueTimes] = useState<QueueTimeType[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedPark, setSelectedPark] = useState<number>(route.params.park);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Queue Times screen.');
    }, [])
  );

  const requestQueueTimes = async () => {
    setQueueTimes(await get(selectedPark));
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
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
      {!loading && (
        <ScrollView
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
              paddingTop: 32,
              paddingBottom: 32,
            }}
          >
            <Text style={{fontWeight: 'bold', textAlign: 'center'}}>
              Last updated: {queueTimes && dayjs(queueTimes[0].updated_at).startOf('second').fromNow()} ago
            </Text>
            {queueTimes?.map((queueTime, index) => {
              return (
                <View style={{paddingTop: 16}}>
                  <Text>{queueTime.ride} - {queueTime.wait_time} minute{queueTime.wait_time !== 1 ? 's' : ''}</Text>
                </View>
              );
            })}
            <Text style={{ fontSize: 12, textAlign: 'center', opacity: .4, paddingTop: 32}}>
              Powered by Queue-Times.com
            </Text>
          </View>
        </ScrollView>
      )}
    </>
  );
}
