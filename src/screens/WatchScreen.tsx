import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import view from '../api/endpoints/social-posts/view';
import youtube from '../api/endpoints/social-posts/youtube';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import useCrumbs from '../hooks/useCrumbs';
import { SocialPostType } from '../models/social-post-type';

export default function WatchScreen() {
  const [loading, setLoading] = useState<boolean>(true);
  const [videos, setVideos] = useState<SocialPostType[]>([]);
  const { labels } = useCrumbs();

  useAsyncEffect(async () => {
    setVideos(await youtube());
    setLoading(false);
  }, []);

  return (
    <Wrapper>
      <Topbar text="Watch" showBackButton />
      {loading && <Loading />}
      {!loading && (
        <View
          style={{
            marginTop: -8,
            flex: 1,
          }}
        >
          <View
            style={{
              paddingLeft: 8,
              paddingRight: 8,
              flex: 1,
            }}
          >
            {videos.length && (
              <FlashList
                ListHeaderComponent={
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      paddingTop: 32,
                      fontSize: 24,
                      paddingLeft: 8,
                      paddingBottom: 16,
                      textAlign: 'center',
                    }}
                  >
                    {labels.watch_social_posts}
                  </Text>
                }
                data={videos}
                numColumns={2}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={async () => {
                      await WebBrowser.openBrowserAsync(item.permalink);
                      await view(item);
                    }}
                    style={{
                      width: '100%',
                      padding: 8,
                    }}
                  >
                    <Image
                      source={item.image_url}
                      style={{
                        aspectRatio: 16 / 9,
                        borderRadius: 10,
                      }}
                    />
                  </TouchableOpacity>
                )}
                estimatedItemSize={15}
                keyExtractor={(item) => item.id.toString()}
              />
            )}
          </View>
        </View>
      )}
    </Wrapper>
  );
}
