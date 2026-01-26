import { FlashList } from '@shopify/flash-list';
import axios from 'axios';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { EntryType } from '../models/entry-type';
import Entry from './NewsScreen/Entry';

export default function NewsScreen() {
  const [entries, setEntries] = useState<EntryType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchEntries = async () => {
    return axios
      .get('https://themeparkshark.com/wp-json/wp/v2/posts?_embed')
      .then((response) => {
        setEntries(
          response.data.map((item: any) => {
            // Safely get featured image with fallback
            let featured_image = null;
            try {
              const media = item._embedded?.['wp:featuredmedia']?.[0];
              featured_image = media?.media_details?.sizes?.medium?.source_url 
                || media?.source_url 
                || null;
            } catch (e) {
              featured_image = null;
            }
            
            return {
              id: item.id,
              date: item.date_gmt,
              featured_image,
              title: item.title.rendered,
              url: item.link,
            };
          })
        );
      })
      .catch((error) => {
        console.error('Failed to fetch news:', error);
      });
  };

  useAsyncEffect(async () => {
    await fetchEntries();
    setLoading(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setEntries([]);
    fetchEntries().then(() => setRefreshing(false));
  }, []);

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch>
          <TopbarText>Latest News</TopbarText>
        </TopbarColumn>
      </Topbar>
      {loading && <Loading />}
      {!loading && entries.length > 0 && (
        <View
          style={{
            marginTop: -8,
            flex: 1,
          }}
        >
          <FlashList
            data={entries as ReadonlyArray<EntryType>}
            renderItem={({ item }) => <Entry key={item.id} entry={item} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            estimatedItemSize={80}
            keyExtractor={(item) => item.id.toString()}
            ListFooterComponentStyle={{
              height: 64,
            }}
            ListHeaderComponentStyle={{
              height: 32,
            }}
          />
        </View>
      )}
    </Wrapper>
  );
}
