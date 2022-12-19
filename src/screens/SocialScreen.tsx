import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useEffect, useState } from 'react';
import allAnnouncements from '../api/endpoints/announcements/all';
import Announcement from '../components/Announcement';
import { AnnouncementType } from '../models/announcement-type';

export default function SocialScreen() {
  const [announcements, setAnnouncements] = useState<AnnouncementType[]>();
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const response = await allAnnouncements();
      setAnnouncements(response);

      setLoading(false);
    })();
  }, []);

  return (
    <Wrapper>
      <Topbar text="Social" />
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
      {!loading && (
        <ScrollView
          style={{
            marginTop: -8,
            paddingTop: 24,
            flex: 1,
          }}
        >
          <ScrollView
            horizontal={true}
            style={{
              marginLeft: 16,
              marginRight: 16,
            }}
          >
            {announcements?.map((announcement, index) => {
              return (
                <View key={index} style={{ marginLeft: index === 0 ? 0 : 16 }}>
                  <Announcement announcement={announcement} />
                </View>
              );
            })}
          </ScrollView>
        </ScrollView>
      )}
    </Wrapper>
  );
}
