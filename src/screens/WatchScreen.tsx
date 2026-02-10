import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useAsyncEffect } from 'rooks';
import youtube from '../api/endpoints/social-posts/youtube';
import Loading from '../components/Loading';
import SocialPost from '../components/SocialPost';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import config from '../config';
import { SocialPostType } from '../models/social-post-type';

export default function WatchScreen() {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState(false);
  const [videos, setVideos] = useState<SocialPostType[]>([]);

  const fetchVideos = async () => {
    const data = await youtube();
    setVideos(data);
  };

  useAsyncEffect(async () => {
    await fetchVideos();
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVideos();
    setRefreshing(false);
  }, []);

  // First video gets featured (full width), rest in 2-column grid
  const featuredVideo = videos.length > 0 ? videos[0] : null;
  const gridVideos = videos.length > 1 ? videos.slice(1) : [];

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
        <View style={{ flex: 1, backgroundColor: '#f0f4f8' }}>
          <FlashList
            data={gridVideos}
            numColumns={2}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={config.secondary}
                colors={[config.secondary]}
              />
            }
            ListHeaderComponent={
              <View style={{ paddingHorizontal: 12 }}>
                {/* Reward banner */}
                <View
                  style={{
                    backgroundColor: 'white',
                    borderRadius: 16,
                    padding: 16,
                    marginTop: 16,
                    marginBottom: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                    elevation: 3,
                  }}
                >
                  <Image
                    source={require('../../assets/images/coingold.png')}
                    style={{ width: 36, height: 36 }}
                    contentFit="contain"
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: 'Shark',
                        fontSize: 14,
                        color: config.primary,
                        textTransform: 'uppercase',
                      }}
                    >
                      Earn 25 Coins Per Video
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        fontSize: 13,
                        color: '#64748b',
                        marginTop: 2,
                      }}
                    >
                      Watch our latest videos and get rewarded!
                    </Text>
                  </View>
                </View>

                {/* Section header */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingBottom: 12,
                    gap: 8,
                  }}
                >
                  <Image
                    source={require('../../assets/images/screens/social/social_media.png')}
                    style={{ width: 28, height: 28 }}
                    contentFit="contain"
                  />
                  <Text
                    style={{
                      fontFamily: 'Shark',
                      fontSize: 18,
                      color: config.primary,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    Latest Videos
                  </Text>
                </View>

                {/* Featured video — full width, larger */}
                {featuredVideo && (
                  <View style={{ marginBottom: 8 }}>
                    <SocialPost socialPost={featuredVideo} fullWidth />
                  </View>
                )}

                {/* Grid section header */}
                {gridVideos.length > 0 && (
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 14,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      paddingTop: 16,
                      paddingBottom: 8,
                    }}
                  >
                    More Videos
                  </Text>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <SocialPost socialPost={item as SocialPostType} />
            )}
            estimatedItemSize={200}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: 6 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ paddingTop: 40, alignItems: 'center' }}>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 18,
                    color: '#94a3b8',
                    textAlign: 'center',
                  }}
                >
                  No videos yet
                </Text>
              </View>
            }
          />
        </View>
      )}
    </Wrapper>
  );
}
