import { ScrollView, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import Wrapper from '../components/Wrapper';
import client from '../api/client-cms';
import Topbar from '../components/Topbar';
import Entry from './NewsScreen/Entry';

export default function NewsScreen() {
  const [entries, setEntries] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEntries = () => {
    return client.get('/entries').then((response) => setEntries(response.data.data));
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEntries().then(() => setRefreshing(false));
  }, []);

  return (
    <Wrapper>
      <Topbar text={'Latest News'} />
      <ScrollView
        style={{
          padding: 16,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
      >
        { entries && entries.map((entry, key) => {
          return (
            <Entry
              key={entry.id}
              entry={entry}
              horizontal={key > 0}
            />
          );
        })}
      </ScrollView>
    </Wrapper>
  );
}
