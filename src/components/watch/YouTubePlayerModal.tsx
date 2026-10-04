import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { BRAND, FONT, GameButton, GameIcon, SharkLoader } from '../../ui';
import {
  allowPlayerNavigation,
  EMBED_BASE_URL,
  minWatchMs,
  parsePlayerMessage,
  PLAYER_ORIGIN_WHITELIST,
  PLAYING,
  playerHtml,
} from './watchFeed';

export type PlayerResult = { readonly playedMs: number; readonly ended: boolean };

/**
 * In-app YouTube player for the Watch page.
 *
 * Kid safety: youtube-nocookie host, rel=0, no comments (embeds have none),
 * the top frame can never leave the player page, frames are limited to the
 * YouTube embed, no cookies are kept, and an end-screen or card tap that
 * tries to switch videos is put back on the chosen one. The finished screen
 * is covered by our own "That's a wrap" card, so the end-screen grid of
 * suggestions never shows.
 *
 * Coins: only time actually playing counts (ads, pauses and buffering do
 * not), shown as a filling coin bar; finishing always counts.
 */
export default function YouTubePlayerModal({
  videoId,
  title,
  subtitle,
  isShort = false,
  rewardCoins = 0,
  onClose,
}: {
  readonly videoId: string | null;
  readonly title: string;
  readonly subtitle?: string | null;
  readonly isShort?: boolean;
  /** Coins still to earn on this video; 0 when already watched. */
  readonly rewardCoins?: number;
  readonly onClose: (result: PlayerResult) => void;
}) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [playedMs, setPlayedMs] = useState(0);
  const playingSince = useRef<number | null>(null);
  const banked = useRef(0);
  const unlockedBuzzed = useRef(false);
  const goalMs = minWatchMs(isShort);

  // A fresh video starts from zero.
  useEffect(() => {
    setReady(false);
    setFailed(false);
    setEnded(false);
    setNotice(null);
    setPlayedMs(0);
    playingSince.current = null;
    banked.current = 0;
    unlockedBuzzed.current = false;
  }, [videoId]);

  const totalPlayed = useCallback(
    () => banked.current + (playingSince.current !== null ? Date.now() - playingSince.current : 0),
    [],
  );

  // Tick the coin bar only while the video is actually playing.
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || rewardCoins <= 0) return;
    const id = setInterval(() => setPlayedMs(totalPlayed()), 250);
    return () => clearInterval(id);
  }, [playing, rewardCoins, totalPlayed]);

  const unlocked = ended || playedMs >= goalMs;
  useEffect(() => {
    if (unlocked && rewardCoins > 0 && !unlockedBuzzed.current) {
      unlockedBuzzed.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [unlocked, rewardCoins]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(id);
  }, [notice]);

  const stopClock = () => {
    if (playingSince.current !== null) {
      banked.current += Date.now() - playingSince.current;
      playingSince.current = null;
    }
    setPlaying(false);
    setPlayedMs(banked.current);
  };

  const onMessage = (e: WebViewMessageEvent) => {
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
          setEnded(false);
        } else {
          stopClock();
        }
        break;
      case 'ended':
        stopClock();
        setEnded(true);
        break;
      case 'blocked':
        setNotice('Staying on this video');
        break;
      case 'error':
        stopClock();
        setFailed(true);
        break;
    }
  };

  const source = useMemo(
    () => (videoId ? { html: playerHtml(videoId), baseUrl: EMBED_BASE_URL } : null),
    [videoId],
  );

  const close = () => {
    const result = { playedMs: totalPlayed(), ended };
    stopClock();
    onClose(result);
  };

  const replay = () => {
    setEnded(false);
    webRef.current?.injectJavaScript('window.tpsReplay&&window.tpsReplay();true;');
  };

  const progress = Math.min(1, playedMs / goalMs);

  return (
    <Modal
      visible={videoId !== null}
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
            <View style={styles.brand}>
              <GameIcon name="shark" size={24} />
              <Text style={styles.brandText}>Theme Park Shark TV</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.stage}>
            <View style={isShort ? styles.frameShort : styles.frameWide}>
              {source && (
                <WebView
                  ref={webRef}
                  source={source}
                  style={styles.web}
                  originWhitelist={PLAYER_ORIGIN_WHITELIST}
                  onShouldStartLoadWithRequest={req => allowPlayerNavigation(req.url, req.isTopFrame)}
                  onMessage={onMessage}
                  allowsInlineMediaPlayback
                  allowsFullscreenVideo
                  mediaPlaybackRequiresUserAction={false}
                  allowsLinkPreview={false}
                  setSupportMultipleWindows={false}
                  javaScriptCanOpenWindowsAutomatically={false}
                  incognito
                  sharedCookiesEnabled={false}
                  thirdPartyCookiesEnabled={false}
                  scrollEnabled={false}
                  bounces={false}
                />
              )}
              {!ready && !failed && (
                <View style={styles.cover} pointerEvents="none">
                  <SharkLoader tone="onBlue" compact />
                </View>
              )}
              {ended && !failed && (
                <View style={[styles.cover, styles.coverCard]}>
                  <Text style={styles.coverTitle}>That's a wrap!</Text>
                  <View style={styles.coverButtons}>
                    <GameButton label="Done" icon="check" fullWidth onPress={close} />
                    <GameButton label="Watch again" icon="retry" variant="secondary" size="compact" fullWidth onPress={replay} />
                  </View>
                </View>
              )}
              {failed && (
                <View style={[styles.cover, styles.coverCard]}>
                  <Text style={styles.coverTitle}>This video can't play right now</Text>
                  <GameButton label="Back to videos" size="compact" onPress={close} />
                </View>
              )}
              {notice && (
                <View style={styles.notice} pointerEvents="none">
                  <Text style={styles.noticeText}>{notice}</Text>
                </View>
              )}
            </View>

            <View style={styles.info}>
              <Text numberOfLines={3} style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

              {rewardCoins > 0 && (
                <View
                  style={[styles.coinPill, unlocked && styles.coinPillDone]}
                  accessible
                  accessibilityLabel={unlocked ? `${rewardCoins} coins unlocked` : `Keep watching to earn ${rewardCoins} coins`}
                >
                  <Image source={require('../../../assets/images/coingold.png')} style={styles.coinIcon} contentFit="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.coinText}>
                      {unlocked ? `+${rewardCoins} coins unlocked!` : `Keep watching to earn +${rewardCoins}`}
                    </Text>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }, unlocked && styles.fillDone]} />
                    </View>
                  </View>
                  {unlocked && <GameIcon name="check" size={22} />}
                </View>
              )}
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.navy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.goldLight, textTransform: 'uppercase', letterSpacing: 1 },
  stage: { flex: 1, justifyContent: 'center' },
  frameWide: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  frameShort: { flex: 1, aspectRatio: 9 / 16, alignSelf: 'center', backgroundColor: '#000', borderRadius: 16, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: '#000' },
  cover: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.blue },
  coverCard: { gap: 14, paddingHorizontal: 20 },
  coverTitle: { fontFamily: FONT.display, fontSize: 22, color: BRAND.white, textTransform: 'uppercase', textAlign: 'center' },
  coverButtons: { width: '100%', maxWidth: 280, gap: 10 },
  notice: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    backgroundColor: BRAND.white,
    borderColor: BRAND.navy,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  noticeText: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navy },
  info: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 6 },
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
});
