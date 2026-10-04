import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { forwardRef, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { SoundEffectContext, type SoundEffectContextType } from '../../context/SoundEffectProvider';
import type { SocialPostType } from '../../models/social-post-type';
import { BRAND, FONT, GameButton, GameIcon, SharkLoader } from '../../ui';
import {
  allowPlayerNavigation,
  EMBED_BASE_URL,
  minWatchMs,
  parsePlayerMessage,
  PLAYER_ORIGIN_WHITELIST,
  PAUSED,
  PLAYING,
  playerHtml,
  postedAgo,
  videoIdOf,
} from './watchFeed';

export type PlayerResult = { readonly playedMs: number; readonly ended: boolean };

const COIN = require('../../../assets/images/coingold.png');

/**
 * The WebView in its own memoized component: the coin bar ticking in the
 * parent never re-renders it, and its callbacks are stable.
 */
const PlayerWeb = memo(forwardRef<WebView, { readonly videoId: string; readonly onMessage: (e: WebViewMessageEvent) => void }>(
  function PlayerWeb({ videoId, onMessage }, ref) {
    const source = useMemo(() => ({ html: playerHtml(videoId), baseUrl: EMBED_BASE_URL }), [videoId]);
    const shouldStart = useCallback(
      (req: { url: string; isTopFrame?: boolean }) => allowPlayerNavigation(req.url, req.isTopFrame),
      [],
    );
    return (
      <WebView
        ref={ref}
        source={source}
        style={styles.web}
        originWhitelist={PLAYER_ORIGIN_WHITELIST}
        onShouldStartLoadWithRequest={shouldStart}
        onMessage={onMessage}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        allowsLinkPreview={false}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        // No cookies kept between videos (a cold player load each open is the accepted cost).
        incognito
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        scrollEnabled={false}
        bounces={false}
      />
    );
  },
));

/**
 * In-app YouTube player for the Watch page.
 *
 * Kid safety: youtube-nocookie host, rel=0, no comments (embeds have none),
 * the top frame can never leave the player page and a blocked link is never
 * handed to Safari, frames are limited to the YouTube embed, no cookies are
 * kept, and an end-screen or card tap that tries to switch videos is put
 * back on the chosen one. When a video ends, our wrap card covers YouTube's
 * suggestion grid and offers the next Theme Park Shark video instead.
 *
 * Coins: only time actually playing counts (ads, pauses and buffering do
 * not), shown as a filling coin bar; finishing always counts.
 */
export default function YouTubePlayerModal({
  video,
  watched,
  coins,
  upNext,
  onSwitch,
  onClose,
}: {
  readonly video: SocialPostType | null;
  /** Already paid for this video (no coin bar). */
  readonly watched: boolean;
  readonly coins: number;
  /** Other videos from our own feed, unwatched first. */
  readonly upNext: readonly SocialPostType[];
  readonly onSwitch: (next: SocialPostType, result: PlayerResult) => void;
  readonly onClose: (result: PlayerResult) => void;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const webRef = useRef<WebView>(null);
  const videoId = video ? videoIdOf(video) : null;
  const isShort = Boolean(video?.is_short);
  const rewardCoins = watched ? 0 : coins;
  const goalMs = minWatchMs(isShort);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [playedMs, setPlayedMs] = useState(0);
  const playingSince = useRef<number | null>(null);
  const banked = useRef(0);
  const unlockFired = useRef(false);
  const pop = useRef(new Animated.Value(1)).current;
  const check = useRef(new Animated.Value(0)).current;
  const wrapIn = useRef(new Animated.Value(0)).current;

  // A fresh video starts from zero.
  useEffect(() => {
    setReady(false);
    setFailed(false);
    setEnded(false);
    setPlaying(false);
    setNotice(null);
    setWaiting(false);
    setPaused(false);
    setPlayedMs(0);
    playingSince.current = null;
    banked.current = 0;
    unlockFired.current = false;
    check.setValue(0);
  }, [videoId, check]);

  const totalPlayed = useCallback(
    () => banked.current + (playingSince.current !== null ? Date.now() - playingSince.current : 0),
    [],
  );

  const unlocked = ended || playedMs >= goalMs;

  // The bar only ticks while playing, and stops for good once unlocked.
  useEffect(() => {
    if (!playing || rewardCoins <= 0 || unlocked) return;
    const id = setInterval(() => setPlayedMs(totalPlayed()), 250);
    return () => clearInterval(id);
  }, [playing, rewardCoins, unlocked, totalPlayed]);

  // The unlock moment: coin pops, check springs in, a coin sound and a haptic.
  useEffect(() => {
    if (!unlocked || rewardCoins <= 0 || unlockFired.current) return;
    unlockFired.current = true;
    playSound(require('../../../assets/sounds/coin.mp3'));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.35, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }),
    ]).start();
    Animated.spring(check, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }).start();
  }, [unlocked, rewardCoins, playSound, pop, check]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(id);
  }, [notice]);

  // Ready but not playing for a while and not paused by the kid (an ad, or a
  // slow start): say so, so a still coin bar does not read as broken.
  useEffect(() => {
    if (!ready || playing || paused || ended || failed) { setWaiting(false); return; }
    const id = setTimeout(() => setWaiting(true), 3500);
    return () => clearTimeout(id);
  }, [ready, playing, paused, ended, failed]);

  const stopClock = useCallback(() => {
    if (playingSince.current !== null) {
      banked.current += Date.now() - playingSince.current;
      playingSince.current = null;
    }
    setPlaying(false);
    setPlayedMs(banked.current);
  }, []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    const msg = parsePlayerMessage(e.nativeEvent.data);
    if (!msg) return;
    switch (msg.type) {
      case 'ready':
        setReady(true);
        break;
      case 'state':
        setReady(true);
        if (msg.state === PLAYING) {
          if (playingSince.current === null) playingSince.current = Date.now();
          setPlaying(true);
          setPaused(false);
          setEnded(false);
        } else {
          stopClock();
          setPaused(msg.state === PAUSED);
        }
        break;
      case 'ended':
        stopClock();
        setEnded(true);
        wrapIn.setValue(0);
        Animated.spring(wrapIn, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
        break;
      case 'blocked':
        setNotice('Staying on this video');
        break;
      case 'error':
        stopClock();
        setFailed(true);
        break;
    }
  }, [stopClock, wrapIn]);

  const result = (): PlayerResult => ({ playedMs: totalPlayed(), ended });

  const close = () => {
    const r = result();
    stopClock();
    onClose(r);
  };

  const replay = () => {
    setEnded(false);
    webRef.current?.injectJavaScript('window.tpsReplay&&window.tpsReplay();true;');
  };

  const next = upNext[0] ?? null;
  const switchTo = (post: SocialPostType) => {
    const r = result();
    stopClock();
    onSwitch(post, r);
  };

  const progress = Math.min(1, playedMs / goalMs);
  const earnedHere = rewardCoins > 0 && unlocked;

  return (
    <Modal
      visible={video !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={close}
    >
      <StatusBar barStyle="light-content" />
      {/* A Modal is a separate native root: it needs its own provider for insets. */}
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.header}>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close video"
              hitSlop={12}
              style={({ pressed }) => [styles.closeButton, pressed && { transform: [{ scale: 0.92 }] }]}
            >
              <GameIcon name="close" size={22} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} bounces={false} showsVerticalScrollIndicator={false}>
            <View style={isShort ? styles.frameShort : styles.frameWide}>
              {videoId && <PlayerWeb ref={webRef} videoId={videoId} onMessage={onMessage} />}
              {!ready && !failed && (
                <View style={styles.cover} pointerEvents="none">
                  <SharkLoader tone="onBlue" compact />
                </View>
              )}
              {ended && !failed && (
                <View style={[styles.cover, styles.wrap]}>
                  <Animated.View style={{ alignItems: 'center', gap: 8, opacity: wrapIn, transform: [{ scale: wrapIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
                    <Image source={COIN} style={styles.wrapCoin} contentFit="contain" />
                    <Text style={styles.wrapTitle}>{earnedHere ? `+${rewardCoins} earned!` : "That's a wrap!"}</Text>
                  </Animated.View>
                  <View style={styles.wrapButtons}>
                    {next ? (
                      <GameButton
                        label={next.has_watched ? 'Next video' : `Next video · +${coins}`}
                        icon="play"
                        fullWidth
                        onPress={() => switchTo(next)}
                      />
                    ) : (
                      <GameButton label="Done" icon="check" fullWidth onPress={close} />
                    )}
                    <GameButton label="Watch again" icon="retry" variant="ghost" tone="onBlue" fullWidth onPress={replay} />
                  </View>
                </View>
              )}
              {failed && (
                <View style={[styles.cover, styles.wrap]}>
                  <GameIcon name="info" size={40} />
                  <Text style={styles.wrapTitle}>This video can't play right now</Text>
                  <View style={styles.wrapButtons}>
                    <GameButton label="Back to videos" fullWidth onPress={close} />
                  </View>
                </View>
              )}
              {notice && (
                <View style={styles.notice} pointerEvents="none">
                  <GameIcon name="lock" size={16} />
                  <Text style={styles.noticeText}>{notice}</Text>
                </View>
              )}
            </View>

            <View style={styles.info}>
              <Text numberOfLines={isShort ? 2 : 3} style={styles.title}>{video?.title}</Text>
              {video && postedAgo(video) ? <Text style={styles.subtitle}>{postedAgo(video)}</Text> : null}

              {rewardCoins > 0 && (
                <View
                  style={[styles.coinPill, unlocked && styles.coinPillDone]}
                  accessible
                  accessibilityLabel={unlocked ? `${rewardCoins} coins unlocked` : `Keep watching to earn ${rewardCoins} coins`}
                >
                  <Animated.View style={{ transform: [{ scale: pop }] }}>
                    <Image source={COIN} style={styles.coinIcon} contentFit="contain" />
                  </Animated.View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.coinText}>
                      {unlocked ? `+${rewardCoins} unlocked!` : waiting ? 'Video starting…' : paused ? `Paused · +${rewardCoins}` : `Keep watching · +${rewardCoins}`}
                    </Text>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }, unlocked && styles.fillDone]} />
                    </View>
                  </View>
                  <Animated.View style={{ transform: [{ scale: check }] }}>
                    <GameIcon name="check" size={24} />
                  </Animated.View>
                </View>
              )}

              {upNext.length > 0 && (
                <>
                  <Text style={styles.upNext}>Up next</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
                    {upNext.map(post => (
                      <Pressable
                        key={post.id}
                        onPress={() => switchTo(post)}
                        accessibilityRole="button"
                        accessibilityLabel={`Play ${post.title}`}
                        style={({ pressed }) => [styles.nextCard, pressed && { transform: [{ scale: 0.96 }] }]}
                      >
                        <Image
                          source={post.thumbnail_url ?? post.image_url}
                          style={styles.nextThumb}
                          contentFit="cover"
                          transition={150}
                          cachePolicy="memory-disk"
                        />
                        {!post.has_watched && (
                          <View style={styles.nextCoin}>
                            <Image source={COIN} style={{ width: 18, height: 18 }} contentFit="contain" />
                            <Text style={styles.nextCoinText}>+{coins}</Text>
                          </View>
                        )}
                        <Text numberOfLines={2} style={styles.nextTitle}>{post.title}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.navy },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BRAND.white,
    borderWidth: 3,
    borderColor: BRAND.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingBottom: 24 },
  frameWide: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  // Capped so the title and coin bar always fit under a vertical Short.
  frameShort: { height: 440, maxWidth: '100%', aspectRatio: 9 / 16, alignSelf: 'center', backgroundColor: '#000', borderRadius: 16, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: '#000' },
  cover: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.blue },
  wrap: { gap: 10, paddingHorizontal: 20 },
  wrapCoin: { width: 56, height: 56 },
  wrapTitle: { fontFamily: FONT.display, fontSize: 28, color: BRAND.white, textTransform: 'uppercase', textAlign: 'center' },
  wrapButtons: { width: '100%', maxWidth: 300, gap: 8 },
  notice: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.white,
    borderColor: BRAND.navy,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  noticeText: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navy },
  info: { paddingHorizontal: 16, paddingTop: 14, gap: 6 },
  title: { fontFamily: FONT.body, fontSize: 20, lineHeight: 23, color: BRAND.white },
  subtitle: { fontFamily: FONT.body, fontSize: 15, color: BRAND.sky },
  coinPill: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: BRAND.cream,
    borderColor: BRAND.goldLip,
    borderWidth: 3,
    borderBottomWidth: 5,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  coinPillDone: { borderColor: BRAND.greenLip },
  coinIcon: { width: 34, height: 34 },
  coinText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy, textTransform: 'uppercase' },
  track: { marginTop: 5, height: 10, borderRadius: 5, backgroundColor: BRAND.creamDeep, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: BRAND.gold },
  fillDone: { backgroundColor: BRAND.green },
  upNext: { marginTop: 14, fontFamily: FONT.display, fontSize: 17, color: BRAND.goldLight, textTransform: 'uppercase', letterSpacing: 0.6 },
  nextCard: {
    width: 168,
    backgroundColor: BRAND.white,
    borderRadius: 14,
    borderWidth: 3,
    borderBottomWidth: 5,
    borderColor: BRAND.navySoft,
    overflow: 'hidden',
  },
  nextThumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: BRAND.sky },
  nextCoin: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: BRAND.gold,
    borderColor: BRAND.navy,
    borderWidth: 2,
    borderRadius: 999,
    paddingLeft: 2,
    paddingRight: 7,
  },
  nextCoinText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy },
  nextTitle: { fontFamily: FONT.body, fontSize: 13, lineHeight: 15, color: BRAND.navy, paddingHorizontal: 7, paddingVertical: 6, minHeight: 42 },
});
