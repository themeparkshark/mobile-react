import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import client from '../api/client-cms';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { EntryType } from '../models/entry-type';
import Entry from './NewsScreen/Entry';

export default function NewsScreen() {
  const [entries, setEntries] = useState<EntryType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchEntries = async () => {
    return client
      .get('/entries')
      .then((response) => setEntries(response.data.data));
  };

  useAsyncEffect(async () => {
    await fetchEntries();
    setLoading(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEntries().then(() => setRefreshing(false));
  }, []);

  return (
    <Wrapper>
      <Topbar text={'Latest News'} />
      {loading && <Loading />}
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
            <View style={{ height: '100%' }}>
              {entries.length && (
                <FlashList
                  data={entries}
                  renderItem={({ item }) => (
                    <Entry key={item.id} entry={item} />
                  )}
                  estimatedItemSize={15}
                  keyExtractor={(item) => item.id.toString()}
                />
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
