import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import { Text, ScrollView, View, ImageBackground, Dimensions } from 'react-native';
import { useEffect, useState } from 'react';
import all from '../api/endpoints/announcements/all';

export default function SocialScreen() {
  const [announcements, setAnnouncements] = useState();

  useEffect(() => {
    all().then((response) => setAnnouncements(response));
  }, []);

  return (
    <Wrapper>
      <Topbar text="Social" />
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
                key={announcement.id}
                style={{
                  position: 'relative',
                  width: Dimensions.get('window').width - 100,
                  height: 200,
                  borderRadius: 10,
                  overflow: 'hidden',
                  marginLeft: index === 0 ? 0 : 16,
                }}
              >
                <ImageBackground
                  source={{
                    uri: announcement.image_url,
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    flexDirection: 'row',
                  }}
                >
                  <View
                    style={{
                      padding: 16,
                      backgroundColor: 'rgba(0, 0, 0, .7)',
                      width: '100%',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          color: 'white',
                          fontFamily: 'Knockout',
                          textTransform: 'uppercase',
                          fontSize: 22,
                        }}
                      >
                        {announcement.title}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        fontSize: 18,
                        color: 'white',
                        textTransform: 'uppercase',
                      }}
                    >
                      Learn more
                    </Text>
                  </View>
                </ImageBackground>
              </View>
            );
          })}
        </ScrollView>
      </ScrollView>
    </Wrapper>
  );
};
