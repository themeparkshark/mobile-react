import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import {
  Button,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import instagram from '../api/endpoints/social-posts/instagram';
import twitter from '../api/endpoints/social-posts/twitter';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import dayjs from '../helpers/dayjs';
import { SocialPostType } from '../models/social-post-type';

export default function SocialScreen() {
  const [twitterStatuses, setTwitterStatuses] = useState<SocialPostType[]>();
  const [instagramStatuses, setInstagramStatuses] =
    useState<SocialPostType[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useAsyncEffect(async () => {
    setTwitterStatuses(await twitter());
    setInstagramStatuses(await instagram());

    setLoading(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    (async () => {
      setTwitterStatuses(await twitter());
      setInstagramStatuses(await instagram());
    })();
    setRefreshing(false);
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
            <View>
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
                const date = dayjs(twitterStatus.status_created_at)
                  .startOf('second')
                  .fromNow();

                return (
                  <View
                    key={twitterStatus.id}
                    style={{
                      marginBottom: 24,
                    }}
                  >
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                      }}
                      onPress={() => {
                        WebBrowser.openBrowserAsync(twitterStatus.permalink);
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
                                opacity: 0.5,
                              }}
                            >
                              @themeparkshark
                            </Text>
                          </View>
                          <View>
                            <Text
                              style={{
                                fontSize: 14,
                                opacity: 0.5,
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
                    </TouchableOpacity>
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
                      <TouchableOpacity
                        onPress={() => {
                          WebBrowser.openBrowserAsync(
                            instagramStatus.permalink
                          );
                        }}
                      >
                        <Image
                          source={instagramStatus.image_url}
                          style={{
                            aspectRatio: 1,
                          }}
                        />
                      </TouchableOpacity>
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
