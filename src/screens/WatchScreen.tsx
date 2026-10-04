import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import CleanScreenBackground, { CLEAN, CLEAN_SCREEN_ACCENT, CLEAN_SCREEN_INK, CLEAN_SCREEN_INK_SOFT } from '../components/CleanScreenBackground';
import youtube from '../api/endpoints/social-posts/youtube';
import { sortNewestFirst } from '../components/watch/watchFeed';
import SocialPost, { COIN_REWARD } from '../components/SocialPost';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { SocialPostType } from '../models/social-post-type';
import { BRAND, FONT, GameButton, GameIcon, SharkLoader } from '../ui';

export default function WatchScreen() {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [videos, setVideos] = useState<SocialPostType[]>([]);
  const mounted = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);
  const lastFetch = useRef(0);

  useEffect(() => () => { mounted.current = false; }, []);

  // The backend syncs the channel every few minutes (and on YouTube's push),
  // so a fetch on open, on focus and on pull is enough to stay current.
  const fetchVideos = useCallback((): Promise<void> => {
    // A pull during a focus fetch waits for that fetch instead of ending at once.
    if (inFlight.current) return inFlight.current;
    inFlight.current = (async () => {
    try {
      const data = await youtube();
      if (!mounted.current) return;
      setVideos(sortNewestFirst(data));
      setFailed(false);
      lastFetch.current = Date.now();
    } catch {
      // Keep whatever is on screen; an empty first load shows the retry hint.
      if (mounted.current) setFailed(true);
    } finally {
      inFlight.current = null;
      if (mounted.current) setLoading(false);
    }
    })();
    return inFlight.current;
  }, []);

  // Runs on first focus too, so this is also the initial load. Coming back
  // from the player or another screen refetches unless it just did.
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastFetch.current > 15_000) fetchVideos();
    }, [fetchVideos]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVideos();
    if (mounted.current) setRefreshing(false);
  }, [fetchVideos]);

  // The newest video is the hero; the rest sit in a two-column grid.
  const featuredVideo = videos.length > 0 ? videos[0] : null;
  const gridVideos = videos.length > 1 ? videos.slice(1) : [];
  const toEarn = videos.filter(v => !v.has_watched).length;

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
      <CleanScreenBackground underTopbar>
        {loading ? (
          <View style={styles.loader}>
            <SharkLoader />
          </View>
        ) : (
          <FlashList
            data={gridVideos}
            numColumns={2}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={CLEAN_SCREEN_ACCENT}
                colors={[CLEAN_SCREEN_ACCENT]}
              />
            }
            ListHeaderComponent={
              <View style={styles.header}>
                {/* Coin promise: how many videos still pay */}
                <View style={styles.banner}>
                  <Image source={require('../../assets/images/coingold.png')} style={styles.bannerCoin} contentFit="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bannerTitle}>+{COIN_REWARD} coins per video</Text>
                    <Text style={styles.bannerText}>
                      {videos.length === 0
                        ? 'New Theme Park Shark videos land here first.'
                        : toEarn > 0
                          ? `${toEarn} video${toEarn === 1 ? '' : 's'} left to earn coins. Watch to the coin bar!`
                          : 'You earned every coin here. New videos land here first!'}
                    </Text>
                  </View>
                </View>

                {featuredVideo && <SocialPost socialPost={featuredVideo} featured />}

                {gridVideos.length > 0 && (
                  <View style={styles.sectionRow}>
                    <GameIcon name="play" size={20} />
                    <Text style={styles.section}>More videos</Text>
                  </View>
                )}
              </View>
            }
            renderItem={({ item }) => <SocialPost socialPost={item as SocialPostType} />}
            estimatedItemSize={190}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={{ paddingBottom: 110, paddingHorizontal: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={videos.length > 0 ? null : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{failed ? 'Videos are taking a break' : 'No videos yet'}</Text>
                <Text style={styles.emptyText}>
                  {failed ? 'Check your connection and try again.' : 'Pull down to check for new ones.'}
                </Text>
                {failed && <GameButton label="Try again" icon="retry" size="compact" onPress={onRefresh} style={{ marginTop: 14 }} />}
              </View>
            )}
          />
        )}
      </CleanScreenBackground>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 6, paddingTop: 18, gap: 14 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BRAND.cream,
    borderRadius: 18,
    borderWidth: 3,
    borderBottomWidth: 5,
    borderColor: BRAND.goldLip,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerCoin: { width: 40, height: 40 },
  bannerTitle: { fontFamily: FONT.display, fontSize: 17, color: CLEAN_SCREEN_INK, textTransform: 'uppercase' },
  bannerText: { fontFamily: FONT.body, fontSize: 15, color: CLEAN_SCREEN_INK_SOFT, marginTop: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6, paddingBottom: 2 },
  section: { fontFamily: FONT.display, fontSize: 18, color: CLEAN_SCREEN_INK, textTransform: 'uppercase', letterSpacing: 0.6 },
  empty: { paddingTop: 40, paddingHorizontal: 24, alignItems: 'center', backgroundColor: CLEAN.bg },
  emptyTitle: { fontFamily: FONT.display, fontSize: 24, color: CLEAN_SCREEN_INK, textTransform: 'uppercase', textAlign: 'center' },
  emptyText: { fontFamily: FONT.body, fontSize: 17, color: CLEAN_SCREEN_INK_SOFT, textAlign: 'center', marginTop: 6 },
});
