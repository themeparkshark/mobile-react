import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutAnimation, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import view from '../api/endpoints/social-posts/view';
import YouTubePlayerModal, { type PlayerResult } from '../components/watch/YouTubePlayerModal';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext, type SoundEffectContextType } from '../context/SoundEffectProvider';
import CleanScreenBackground, { CLEAN, CLEAN_SCREEN_ACCENT, CLEAN_SCREEN_INK, CLEAN_SCREEN_INK_SOFT } from '../components/CleanScreenBackground';
import youtube from '../api/endpoints/social-posts/youtube';
import { bankResult, earnedView, EMPTY_BANK, nextBankDialog, type RewardBank, sortNewestFirst, upNextFor, videoIdOf, viewFailureKind } from '../components/watch/watchFeed';
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
  const retryRef = useRef<(quiet: boolean) => void>(() => undefined);

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
      retryRef.current(true);
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
  // Earned views the server has not confirmed yet (offline or 5xx). Kept until
  // a retry succeeds, so "Later" never throws a watched video away.
  const [unsaved, setUnsaved] = useState<readonly SocialPostType[]>([]);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const playerOpen = useRef(false);
  const dialogOpen = useRef(false);
  const bank = useRef<RewardBank>(EMPTY_BANK);
  const deliverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retrying = useRef(false);
  const isWatched = useCallback(
    (post: SocialPostType) => post.has_watched || localWatched.has(post.id),
    [localWatched],
  );

  const markWatched = (post: SocialPostType) =>
    setLocalWatched(prev => (prev.has(post.id) ? prev : new Set(prev).add(post.id)));

  /** Pays for one video. Returns the coins granted, 0 if already paid, null if not saved. */
  const record = async (post: SocialPostType): Promise<number | null> => {
    try {
      const paid = (await view(post)).coins ?? COIN_REWARD;
      markWatched(post);
      setUnsaved(prev => prev.filter(p => p.id !== post.id));
      return paid;
    } catch (error) {
      if (viewFailureKind(error) === 'already-paid') {
        markWatched(post);
        setUnsaved(prev => prev.filter(p => p.id !== post.id));
        return 0;
      }
      setUnsaved(prev => (prev.some(p => p.id === post.id) ? prev : [...prev, post]));
      return null;
    }
  };

  /**
   * Shows whatever the bank holds once nothing else is on screen. The wait
   * lets a closing player sheet finish (iOS drops a modal presented during
   * another one's dismissal); a reopened player keeps the bank for later.
   */
  const deliverSoon = () => {
    if (deliverTimer.current) clearTimeout(deliverTimer.current);
    deliverTimer.current = setTimeout(() => {
      deliverTimer.current = null;
      const next = nextBankDialog(bank.current, playerOpen.current || dialogOpen.current);
      if (next === 'reward') {
        const coins = bank.current.coins;
        bank.current = { ...bank.current, coins: 0 };
        dialogOpen.current = true;
        setRewardTotal(coins);
        playSound(require('../../assets/sounds/reward.mp3'));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refreshPlayer().catch(() => undefined); // header coin count catches up
      } else if (next === 'unsaved') {
        bank.current = { ...bank.current, unsaved: false };
        dialogOpen.current = true;
        setShowUnsaved(true);
      }
    }, 450);
  };

  const save = (post: SocialPostType) => {
    void record(post).then(result => {
      bank.current = bankResult(bank.current, result);
      deliverSoon();
    });
  };

  /** Saves the video that was playing if it was really watched. */
  const settle = (post: SocialPostType, result: PlayerResult) => {
    if (isWatched(post) || !earnedView(result.playedMs, result.ended, post.is_short)) return;
    save(post);
  };

  const openVideo = useCallback((post: SocialPostType) => {
    playSound(require('../../assets/sounds/button_press.mp3'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (videoIdOf(post)) {
      playerOpen.current = true;
      setPlaying(post);
      return;
    }
    // Very old rows without a YouTube id: open the link, then pay as before.
    void WebBrowser.openBrowserAsync(post.permalink).then(() => {
      if (!post.has_watched) save(post);
    });
  // save, record and deliverSoon only touch refs, setters and context.
  }, [playSound]);

  const switchVideo = (next: SocialPostType, result: PlayerResult) => {
    const current = playing;
    setPlaying(next);
    if (current) settle(current, result);
  };

  const closePlayer = (result: PlayerResult) => {
    const current = playing;
    setPlaying(null);
    playerOpen.current = false;
    if (current) settle(current, result);
    deliverSoon(); // anything banked while the player was open
  };

  const onRewardClosed = () => {
    dialogOpen.current = false;
    setRewardTotal(null);
    deliverSoon(); // a "not saved" note waiting behind the reward
  };

  /** Retries every unsaved view once at a time; results go through the bank. */
  const retryUnsaved = useCallback(async (quiet: boolean) => {
    if (retrying.current || unsaved.length === 0) return;
    retrying.current = true;
    try {
      const results = await Promise.all(unsaved.map(post => record(post)));
      for (const result of results) {
        // A quiet retry that fails again stays quiet; the card still offers +25.
        if (result !== null || !quiet) bank.current = bankResult(bank.current, result);
      }
      deliverSoon();
    } finally {
      retrying.current = false;
    }
  }, [unsaved]);

  retryRef.current = quiet => { void retryUnsaved(quiet); };

  // The hero is the newest video still worth coins (the newest overall once
  // everything is watched); the rest sit in a two-column grid, newest first.
  // It moves only when nothing is on top of the page, with a short animation,
  // so the kid sees the watched video slide into the grid.
  const [heroWatched, setHeroWatched] = useState<ReadonlySet<number>>(localWatched);
  const calm = playing === null && rewardTotal === null && !showUnsaved;
  useEffect(() => {
    if (!calm || heroWatched === localWatched) return;
    const id = setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setHeroWatched(localWatched);
    }, 250);
    return () => clearTimeout(id);
  }, [calm, localWatched, heroWatched]);
  const featuredVideo = videos.find(v => !v.has_watched && !heroWatched.has(v.id)) ?? videos[0] ?? null;
  const gridVideos = featuredVideo ? videos.filter(v => v.id !== featuredVideo.id) : [];
  const upNext = useMemo(
    () => (playing ? upNextFor(playing, videos, isWatched) : []),
    [playing, videos, isWatched],
  );
  // The meter, like the hero, moves when the page is calm so the kid sees it fill.
  const watchedCount = videos.filter(v => v.has_watched || heroWatched.has(v.id)).length;
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
                      <WatchMeter watched={watchedCount} total={videos.length} />
                    </View>
                    {toEarn === 0 && <GameIcon name="check" size={28} />}
                  </View>
                )}

                {featuredVideo && <SocialPost socialPost={featuredVideo} featured newest={featuredVideo.id === videos[0]?.id} watched={isWatched(featuredVideo)} onPress={openVideo} />}

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
        upNext={upNext}
        onSwitch={switchVideo}
        onClose={closePlayer}
      />

      {/* The one reward moment (the server's matching banner is suppressed). */}
      <GameDialog
        visible={rewardTotal !== null}
        title="Coins added!"
        buttons={[{ text: 'Awesome!' }]}
        haptic="none"
        onAnswer={onRewardClosed}
      >
        {rewardTotal !== null && <CoinCountUp total={rewardTotal} />}
      </GameDialog>

      <GameDialog
        visible={showUnsaved && unsaved.length > 0}
        title="Coins not saved yet"
        message="Check your connection, then try again. Your watch still counts."
        icon="retry"
        buttons={[{ text: 'Later', style: 'cancel' }, { text: 'Try again' }]}
        onAnswer={index => {
          dialogOpen.current = false;
          setShowUnsaved(false);
          if (index === 1) void retryUnsaved(false);
        }}
      />
    </Wrapper>
  );
}

/** Watched/total meter; it springs forward and sparkles when a video is earned. */
function WatchMeter({ watched, total }: { readonly watched: number; readonly total: number }) {
  const ratio = total > 0 ? watched / total : 0;
  const fill = useRef(new Animated.Value(ratio)).current;
  const sparkle = useRef(new Animated.Value(0)).current;
  const last = useRef(watched);
  useEffect(() => {
    Animated.spring(fill, { toValue: ratio, friction: 7, tension: 60, useNativeDriver: false }).start();
    if (watched > last.current) {
      sparkle.setValue(0);
      Animated.sequence([
        Animated.timing(sparkle, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(500),
        Animated.timing(sparkle, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
    last.current = watched;
  }, [ratio, watched, fill, sparkle]);
  const done = total > 0 && watched >= total;
  return (
    <View style={styles.meterRow} accessible accessibilityLabel={`${watched} of ${total} videos watched`}>
      <View style={styles.meter}>
        <Animated.View
          style={[styles.meterFill, done && styles.meterDone, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
      </View>
      <Text style={styles.meterText}>{watched}/{total}</Text>
      <Animated.View pointerEvents="none" style={[styles.sparkle, { opacity: sparkle, transform: [{ scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] }) }] }]}>
        <GameIcon name="sparkle" size={22} />
      </Animated.View>
    </View>
  );
}

/** The coin pops in and the number counts up to what was paid, with a coin sound at the end. */
function CoinCountUp({ total }: { readonly total: number }) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const [shown, setShown] = useState(0);
  const pop = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }).start();
    const started = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / 700);
      setShown(Math.round(total * t));
      if (t >= 1) {
        clearInterval(id);
        playSound(require('../../assets/sounds/coin.mp3'));
      }
    }, 40);
    return () => clearInterval(id);
  }, [total, pop, playSound]);
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
  sparkle: { position: 'absolute', right: 30, top: -10 },
  countWrap: { alignItems: 'center', gap: 2, paddingVertical: 4 },
  countText: { fontFamily: FONT.display, fontSize: 40, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6, paddingBottom: 2 },
  section: { fontFamily: FONT.display, fontSize: 18, color: CLEAN_SCREEN_INK, textTransform: 'uppercase', letterSpacing: 0.6 },
  empty: { paddingTop: 40, paddingHorizontal: 24, alignItems: 'center', backgroundColor: CLEAN.bg },
  emptyTitle: { fontFamily: FONT.display, fontSize: 24, color: CLEAN_SCREEN_INK, textTransform: 'uppercase', textAlign: 'center' },
  emptyText: { fontFamily: FONT.body, fontSize: 17, color: CLEAN_SCREEN_INK_SOFT, textAlign: 'center', marginTop: 6 },
});
