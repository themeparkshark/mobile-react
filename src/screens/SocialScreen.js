import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import { ScrollView, View } from 'react-native';
import { useEffect, useState } from 'react';
import all from '../api/endpoints/announcements/all';
import Announcement from '../components/Announcement';

export default function SocialScreen() {
  const [announcements, setAnnouncements] = useState();

  useEffect(() => {
    all().then((response) => setAnnouncements(response));
  }, []);

  return (
    <Wrapper>
      <Topbar text="Social" showBackButton={true} />
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
              <View
                key={index}
                style={{ marginLeft: index === 0 ? 0 : 16 }}
              >
                <Announcement
                  announcement={announcement}
                />
              </View>
            );
          })}
        </ScrollView>
      </ScrollView>
    </Wrapper>
  );
};
