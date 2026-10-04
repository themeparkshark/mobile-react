import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import view from '../api/endpoints/social-posts/view';
import YouTubePlayerModal, { type PlayerResult } from '../components/watch/YouTubePlayerModal';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext, type SoundEffectContextType } from '../context/SoundEffectProvider';
import CleanScreenBackground, { CLEAN, CLEAN_SCREEN_ACCENT, CLEAN_SCREEN_INK, CLEAN_SCREEN_INK_SOFT } from '../components/CleanScreenBackground';
import youtube from '../api/endpoints/social-posts/youtube';
import { earnedView, sortNewestFirst, upNextFor, videoIdOf, viewFailureKind } from '../components/watch/watchFeed';
import SocialPost, { COIN_ART, COIN_REWARD } from '../components/SocialPost';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { SocialPostType } from '../models/social-post-type';
import { BRAND, FONT, GameButton, GameDialog, GameIcon, SharkLoader } from '../ui';

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

  // One player and one reward dialog for the whole page.
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const { refreshPlayer } = useContext(AuthContext);
  const [playing, setPlaying] = useState<SocialPostType | null>(null);
  const [localWatched, setLocalWatched] = useState<ReadonlySet<number>>(new Set());
  const [rewardTotal, setRewardTotal] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState<SocialPostType | null>(null);
  const pendingCoins = useRef(0);
  const isWatched = useCallback(
    (post: SocialPostType) => post.has_watched || localWatched.has(post.id),
    [localWatched],
  );

  const markWatched = (post: SocialPostType) =>
    setLocalWatched(prev => (prev.has(post.id) ? prev : new Set(prev).add(post.id)));

  /** Pays for one video. Returns the coins granted (0 if already paid or failed). */
  const record = async (post: SocialPostType): Promise<number> => {
    try {
      const paid = (await view(post)).coins ?? COIN_REWARD;
      markWatched(post);
      return paid;
    } catch (error) {
      if (viewFailureKind(error) === 'already-paid') {
        markWatched(post);
      } else {
        // Offline or server trouble: keep the +25 on offer and let them retry.
        setSaveFailed(post);
      }
      return 0;
    }
  };

  const showReward = (coins: number) => {
    if (coins <= 0) return;
    setRewardTotal(coins);
    playSound(require('../../assets/sounds/reward.mp3'));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refreshPlayer().catch(() => undefined); // header coin count catches up
  };

  /** Settles the video that was playing; coins are banked until the player closes. */
  const settle = async (post: SocialPostType, result: PlayerResult) => {
    if (isWatched(post) || !earnedView(result.playedMs, result.ended, post.is_short)) return;
    pendingCoins.current += await record(post);
  };

  const openVideo = useCallback((post: SocialPostType) => {
    playSound(require('../../assets/sounds/button_press.mp3'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (videoIdOf(post)) {
      pendingCoins.current = 0;
      setPlaying(post);
      return;
    }
    // Very old rows without a YouTube id: open the link, then pay as before.
    void WebBrowser.openBrowserAsync(post.permalink).then(async () => {
      if (!post.has_watched) showReward(await record(post));
    });
  }, [playSound]);

  const switchVideo = (next: SocialPostType, result: PlayerResult) => {
    const current = playing;
    setPlaying(next);
    if (current) void settle(current, result);
  };

  const closePlayer = (result: PlayerResult) => {
    const current = playing;
    setPlaying(null);
    void (async () => {
      if (current) await settle(current, result);
      const total = pendingCoins.current;
      pendingCoins.current = 0;
      // Let the player sheet finish sliding away first (iOS drops a modal
      // presented during another one's dismissal).
      if (total > 0) setTimeout(() => showReward(total), 450);
    })();
  };

  const retrySave = async () => {
    const post = saveFailed;
    setSaveFailed(null);
    if (post) showReward(await record(post));
  };

  // The newest video is the hero; the rest sit in a two-column grid.
  const featuredVideo = videos.length > 0 ? videos[0] : null;
  const gridVideos = videos.length > 1 ? videos.slice(1) : [];
  const watchedCount = videos.filter(isWatched).length;
  const toEarn = videos.length - watchedCount;

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
                {/* Coin promise and progress: how many videos still pay */}
                {videos.length > 0 && (
                  <View style={[styles.banner, toEarn === 0 && styles.bannerDone]}>
                    <Image source={COIN_ART} style={styles.bannerCoin} contentFit="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerTitle}>
                        {toEarn === 0 ? 'All caught up!' : `Watch & earn +${COIN_REWARD} each`}
                      </Text>
                      <View style={styles.meterRow}>
                        <View style={styles.meter}>
                          <View style={[styles.meterFill, toEarn === 0 && styles.meterDone, { width: `${Math.round((watchedCount / videos.length) * 100)}%` }]} />
                        </View>
                        <Text style={styles.meterText}>{watchedCount}/{videos.length}</Text>
                      </View>
                    </View>
                    {toEarn === 0 && <GameIcon name="check" size={28} />}
                  </View>
                )}

                {featuredVideo && <SocialPost socialPost={featuredVideo} featured watched={isWatched(featuredVideo)} onPress={openVideo} />}

                {gridVideos.length > 0 && (
                  <View style={styles.sectionRow}>
                    <GameIcon name="play" size={20} />
                    <Text style={styles.section}>More videos</Text>
                  </View>
                )}
              </View>
            }
            renderItem={({ item }) => <SocialPost socialPost={item as SocialPostType} watched={isWatched(item as SocialPostType)} onPress={openVideo} />}
            extraData={localWatched}
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

      <YouTubePlayerModal
        video={playing}
        watched={playing ? isWatched(playing) : false}
        coins={COIN_REWARD}
        upNext={playing ? upNextFor(playing, videos, isWatched) : []}
        onSwitch={switchVideo}
        onClose={closePlayer}
      />

      {/* The one reward moment (the server's matching banner is suppressed). */}
      <GameDialog
        visible={rewardTotal !== null}
        title="Coins added!"
        buttons={[{ text: 'Awesome!' }]}
        haptic="none"
        onAnswer={() => setRewardTotal(null)}
      >
        {rewardTotal !== null && <CoinCountUp total={rewardTotal} />}
      </GameDialog>

      <GameDialog
        visible={saveFailed !== null}
        title="Coins not saved yet"
        message="Check your connection, then try again."
        icon="retry"
        buttons={[{ text: 'Later', style: 'cancel' }, { text: 'Try again' }]}
        onAnswer={index => { if (index === 1) void retrySave(); else setSaveFailed(null); }}
      />
    </Wrapper>
  );
}

/** The coin pops in and the number counts up to what was paid. */
function CoinCountUp({ total }: { readonly total: number }) {
  const [shown, setShown] = useState(0);
  const pop = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }).start();
    const started = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / 700);
      setShown(Math.round(total * t));
      if (t >= 1) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [total, pop]);
  return (
    <View style={styles.countWrap} accessible accessibilityLabel={`${total} coins added`}>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Image source={COIN_ART} style={{ width: 76, height: 76 }} contentFit="contain" />
      </Animated.View>
      <Text style={styles.countText}>+{shown}</Text>
    </View>
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
  bannerDone: { borderColor: BRAND.greenLip },
  bannerTitle: { fontFamily: FONT.display, fontSize: 17, color: CLEAN_SCREEN_INK, textTransform: 'uppercase' },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  meter: { flex: 1, height: 12, borderRadius: 6, backgroundColor: BRAND.creamDeep, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 6, backgroundColor: BRAND.gold },
  meterDone: { backgroundColor: BRAND.green },
  meterText: { fontFamily: FONT.display, fontSize: 15, color: CLEAN_SCREEN_INK },
  countWrap: { alignItems: 'center', gap: 2, paddingVertical: 4 },
  countText: { fontFamily: FONT.display, fontSize: 40, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6, paddingBottom: 2 },
  section: { fontFamily: FONT.display, fontSize: 18, color: CLEAN_SCREEN_INK, textTransform: 'uppercase', letterSpacing: 0.6 },
  empty: { paddingTop: 40, paddingHorizontal: 24, alignItems: 'center', backgroundColor: CLEAN.bg },
  emptyTitle: { fontFamily: FONT.display, fontSize: 24, color: CLEAN_SCREEN_INK, textTransform: 'uppercase', textAlign: 'center' },
  emptyText: { fontFamily: FONT.body, fontSize: 17, color: CLEAN_SCREEN_INK_SOFT, textAlign: 'center', marginTop: 6 },
});
