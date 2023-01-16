import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import {ScrollView, View, Text, Image, Button} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import allAnnouncements from '../api/endpoints/announcements/all';
import Announcement from '../components/Announcement';
import { AnnouncementType } from '../models/announcement-type';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import Loading from '../components/Loading';
import {SocialPostType} from '../models/social-post-type';
import twitter from '../api/endpoints/social-posts/twitter';
import instagram from '../api/endpoints/social-posts/instagram';
import dayjs from '../helpers/dayjs';
import * as WebBrowser from 'expo-web-browser';

export default function SocialScreen() {
  const [announcements, setAnnouncements] = useState<AnnouncementType[]>();
  const [twitterStatuses, setTwitterStatuses] = useState<SocialPostType[]>();
  const [instagramStatuses, setInstagramStatuses] = useState<SocialPostType[]>();
  const [loading, setLoading] = useState<boolean>(true);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Social screen.');
    }, [])
  );

  useEffect(() => {
    (async () => {
      setAnnouncements(await allAnnouncements());
      setTwitterStatuses(await twitter());
      setInstagramStatuses(await instagram());

      setLoading(false);
    })();
  }, []);

  return (
    <Wrapper>
      <Topbar text="Social" />
      {loading && <Loading />}
      {!loading && (
        <ScrollView
          style={{
            marginTop: -8,
          }}
        >
          <View
            style={{
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 32,
              paddingBottom: 32,
            }}
          >
            <ScrollView
              horizontal={true}
            >
              {announcements?.map((announcement, index) => {
                return (
                  <View key={index} style={{ marginLeft: index === 0 ? 0 : 16 }}>
                    <Announcement announcement={announcement} />
                  </View>
                );
              })}
            </ScrollView>
            <View
              style={{
                marginTop: 32,
              }}
            >
              <Text
                style={{
                  paddingBottom: 16,
                  fontFamily: 'Knockout',
                  fontSize: 24,
                }}
              >
                Twitter
              </Text>
              {twitterStatuses?.map((twitterStatus) => {
                const date = dayjs(twitterStatus.status_created_at).startOf('second').fromNow();

                return (
                  <View
                    key={twitterStatus.id}
                    style={{
                      flexDirection: 'row',
                      marginBottom: 24,
                    }}
                  >
                    <View
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 10,
                        overflow: 'hidden',
                      }}
                    >
                      <Image
                        source={require('../../assets/icon.png')}
                        style={{
                          width: '100%',
                          height: '100%',
                        }}
                      />
                    </View>
                    <View
                      style={{
                        flex: 1,
                        paddingLeft: 16,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                        }}
                      >
                        <View
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <Text
                            style={{
                              fontWeight: 'bold',
                              fontSize: 16,
                              paddingRight: 4,
                            }}
                          >
                            Theme Park Shark
                          </Text>
                          <Text
                            style={{
                              fontSize: 14,
                              opacity: .5,
                            }}
                          >
                            @themeparkshark
                          </Text>
                        </View>
                        <View>
                          <Text
                            style={{
                              fontSize: 14,
                              opacity: .5,
                            }}
                          >
                            {date}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={{
                          fontSize: 16,
                        }}
                      >
                        {twitterStatus.status}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <Button
                title="Follow Theme Park Shark on Twitter"
                onPress={() =>
                  WebBrowser.openBrowserAsync(
                    'https://twitter.com/themeparkshark'
                  )
                }
              />
            </View>
            <View
              style={{
                marginTop: 32,
              }}
            >
              <Text
                style={{
                  paddingBottom: 16,
                  fontFamily: 'Knockout',
                  fontSize: 24,
                }}
              >
                Instagram
              </Text>
              <View
                style={{
                  borderRadius: 10,
                  overflow: 'hidden',
                  flexWrap: 'wrap',
                  flexDirection: 'row',
                  marginBottom: 24,
                }}
              >
                {instagramStatuses?.map((instagramStatus) => {
                  return (
                    <View
                      key={instagramStatus.id}
                      style={{
                        width: '33.33333333%',
                      }}
                    >
                      <Image
                        source={{
                          uri: instagramStatus.image_url,
                        }}
                        style={{
                          aspectRatio: 1,
                        }}
                      />
                    </View>
                  );
                })}
              </View>
              <Button
                title="Follow Theme Park Shark on Instagram"
                onPress={() =>
                  WebBrowser.openBrowserAsync(
                    'https://instagram.com/themeparkshark'
                  )
                }
              />
            </View>
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
