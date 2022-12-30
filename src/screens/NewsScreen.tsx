import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import Wrapper from '../components/Wrapper';
import client from '../api/client-cms';
import Topbar from '../components/Topbar';
import Entry from './NewsScreen/Entry';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import { EntryType } from '../models/entry-type';

export default function NewsScreen() {
  const [entries, setEntries] = useState<EntryType[]>();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the News screen.');
    }, [])
  );

  const fetchEntries = () => {
    return client
      .get('/entries')
      .then((response) => setEntries(response.data.data));
  };

  useEffect(() => {
    fetchEntries().then(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEntries().then(() => setRefreshing(false));
  }, []);

  return (
    <Wrapper>
      <Topbar text={'Latest News'} />
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
      {!loading && entries?.length && (
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
            {entries.map((entry, key) => {
              return (
                <Entry key={entry.id} entry={entry} horizontal={key > 0} />
              );
            })}
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
