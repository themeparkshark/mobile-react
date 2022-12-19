import {
  ActivityIndicator,
  View,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import Wrapper from '../components/Wrapper';
import client from '../api/client-cms';
import Topbar from '../components/Topbar';
import Entry from './NewsScreen/Entry';

export default function NewsScreen() {
  const [entries, setEntries] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

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
            paddingTop: 32,
          }}
        >
          <ActivityIndicator size="large" />
        </View>
      )}
      {!loading && entries?.length && (
        <ScrollView
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
            {entries &&
              entries.map((entry, key) => {
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
