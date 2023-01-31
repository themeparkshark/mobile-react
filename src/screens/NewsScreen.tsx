import { RefreshControl, ScrollView, View } from 'react-native';
import { useCallback, useContext, useEffect, useState } from 'react';
import Wrapper from '../components/Wrapper';
import client from '../api/client-cms';
import Topbar from '../components/Topbar';
import Entry from './NewsScreen/Entry';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import { EntryType } from '../models/entry-type';
import Loading from '../components/Loading';
import Announcement from '../components/Announcement';
import allAnnouncements from '../api/endpoints/announcements/all';
import { useAsyncEffect } from 'rooks';
import { AnnouncementType } from '../models/announcement-type';
import { BroadcastContext } from '../context/BroadcastProvider';

export default function NewsScreen() {
  const [announcements, setAnnouncements] = useState<AnnouncementType[]>();
  const [entries, setEntries] = useState<EntryType[]>();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the News screen.');
    }, [])
  );

  const fetchEntries = async () => {
    return client
      .get('/entries')
      .then((response) => setEntries(response.data.data));
  };

  useAsyncEffect(async () => {
    setAnnouncements(await allAnnouncements());
    await fetchEntries();
    setLoading(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    async () => {
      await fetchEntries();
      setAnnouncements(await allAnnouncements());
    };
    setRefreshing(false);
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
            <View style={{ marginBottom: 32 }}>
              <ScrollView horizontal={true}>
                {announcements?.map((announcement, index) => {
                  return (
                    <View
                      key={index}
                      style={{ marginLeft: index === 0 ? 0 : 16 }}
                    >
                      <Announcement announcement={announcement} />
                    </View>
                  );
                })}
              </ScrollView>
            </View>
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
