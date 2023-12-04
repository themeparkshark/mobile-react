import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import youtube from '../api/endpoints/social-posts/youtube';
import Loading from '../components/Loading';
import SocialPost from '../components/SocialPost';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
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
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Watch</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
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
                  <SocialPost socialPost={item as SocialPostType} />
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
