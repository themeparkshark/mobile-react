import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { useContext, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import view from '../api/endpoints/social-posts/view';
import { SocialPostType } from '../models/social-post-type';
import { AuthContext } from '../context/AuthProvider';
import { BRAND, FONT, GameButton, GameIcon } from '../ui';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import YouTubePlayerModal, { type PlayerResult } from './watch/YouTubePlayerModal';
import { earnedView, formatDuration, isNewVideo, postedAgo, thumbnailFor, videoIdOf } from './watch/watchFeed';

/** What the Watch page promises per video (live economy.social_post_view_coins). */
export const COIN_REWARD = 25;

const COIN = require('../../assets/images/coingold.png');

/**
 * One Watch page video. `featured` is the newest-video hero at the top;
 * everything else is a grid card. Tapping plays in-app (kid-safe player);
 * the coin thank-you is paid after a real watch, shown once by our own
 * reward card.
 */
export default function SocialPost({
  socialPost,
  featured = false,
}: {
  readonly socialPost: SocialPostType;
  readonly featured?: boolean;
}) {
  // FlashList recycles this component across videos, so the local "just
  // watched" mark is tied to the video id instead of seeded once from props.
  const [watchedId, setWatchedId] = useState<number | null>(null);
  const hasWatched = socialPost.has_watched || watchedId === socialPost.id;
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const { refreshPlayer } = useContext(AuthContext);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rewardScale = useRef(new Animated.Value(0)).current;
  const coinBounce = useRef(new Animated.Value(0)).current;

  const videoId = videoIdOf(socialPost);
  const isNew = isNewVideo(socialPost);
  const duration = socialPost.is_short ? null : formatDuration(socialPost.duration_seconds);
  const ago = featured ? postedAgo(socialPost) : null;

  const press = (to: number) =>
    Animated.spring(scaleAnim, { toValue: to, friction: 5, tension: 300, useNativeDriver: true }).start();

  const showRewardModal = (coins: number) => {
    setReward(coins);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    rewardScale.setValue(0);
    coinBounce.setValue(0);
    Animated.spring(rewardScale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(coinBounce, { toValue: -12, duration: 300, useNativeDriver: true }),
        Animated.timing(coinBounce, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
      { iterations: 4 },
    ).start();
  };

  const recordView = async () => {
    if (hasWatched) return;
    const id = socialPost.id;
    try {
      const { coins } = await view(socialPost);
      setWatchedId(id);
      await refreshPlayer(); // Update coin count in header
      const paid = coins ?? COIN_REWARD;
      if (paid > 0) showRewardModal(paid);
    } catch {
      // Already paid (403) or offline: mark it so the card stops promising coins.
      setWatchedId(id);
    }
  };

  const handlePress = async () => {
    playSound(require('../../assets/sounds/button_press.mp3'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (videoId) {
      setPlayingId(videoId);
      return;
    }
    await WebBrowser.openBrowserAsync(socialPost.permalink);
    await recordView();
  };

  const closePlayer = (result: PlayerResult) => {
    setPlayingId(null);
    if (hasWatched || !earnedView(result.playedMs, result.ended, socialPost.is_short)) return;
    // Let the player sheet finish sliding away before the reward card opens
    // (iOS drops a modal presented during another one's dismissal).
    setTimeout(() => { recordView(); }, 450);
  };

  const a11y = `${socialPost.title}. ${hasWatched ? 'Watched' : `Earn ${COIN_REWARD} coins`}${isNew ? '. New' : ''}`;

  return (
    <>
      <Pressable
        onPress={handlePress}
        onPressIn={() => press(0.96)}
        onPressOut={() => press(1)}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={featured ? styles.heroOuter : styles.gridOuter}
      >
        <Animated.View style={[styles.card, featured && styles.heroCard, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.thumbWrap}>
            <Image
              source={thumbnailFor(socialPost, featured)}
              recyclingKey={String(socialPost.id)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={180}
              cachePolicy="memory-disk"
              priority={featured ? 'high' : 'normal'}
              accessibilityIgnoresInvertColors
            />
            {hasWatched && <View style={styles.watchedTint} />}

            {/* Play */}
            <View style={styles.center} pointerEvents="none">
              <View style={[styles.play, featured && styles.playHero, hasWatched && styles.playWatched]}>
                <GameIcon name="play" size={featured ? 64 : 40} />
              </View>
            </View>

            {/* NEW: on the channel less than 24 hours */}
            {isNew && (
              <View style={[styles.newBadge, featured && styles.newBadgeHero]}>
                <Text style={[styles.newText, featured && { fontSize: 15 }]}>NEW</Text>
              </View>
            )}

            {/* Coin reward, or Watched */}
            {hasWatched ? (
              <View style={[styles.chip, styles.watchedChip]}>
                <GameIcon name="check" size={featured ? 18 : 14} />
                <Text style={[styles.chipText, { color: BRAND.white }, featured && styles.chipTextHero]}>Watched</Text>
              </View>
            ) : (
              <View style={[styles.chip, styles.coinChip]}>
                <Image source={COIN} style={featured ? styles.coinHero : styles.coinSmall} contentFit="contain" />
                <Text style={[styles.chipText, featured && styles.chipTextHero]}>
                  +{COIN_REWARD}{featured ? ' coins' : ''}
                </Text>
              </View>
            )}

            {/* Short or duration */}
            {(socialPost.is_short || duration) && (
              <View style={styles.lengthChip}>
                <Text style={styles.lengthText}>{socialPost.is_short ? 'SHORT' : duration}</Text>
              </View>
            )}
          </View>

          <View style={[styles.body, featured && styles.heroBody]}>
            {featured && (
              <Text style={styles.kicker}>{isNew ? 'Brand new' : 'Newest video'}{ago ? ` · ${ago}` : ''}</Text>
            )}
            <Text numberOfLines={featured ? 3 : 2} style={featured ? styles.heroTitle : styles.title}>
              {socialPost.title}
            </Text>
            {featured && (
              <View style={{ marginTop: 10 }} pointerEvents="none">
                <GameButton
                  label={hasWatched ? 'Watch again' : `Watch now · +${COIN_REWARD}`}
                  icon="play"
                  fullWidth
                  haptics={false}
                />
              </View>
            )}
          </View>
        </Animated.View>
      </Pressable>

      <YouTubePlayerModal
        videoId={playingId}
        title={socialPost.title}
        subtitle={postedAgo(socialPost)}
        isShort={socialPost.is_short}
        rewardCoins={hasWatched ? 0 : COIN_REWARD}
        onClose={closePlayer}
      />

      {/* The one reward moment (the server's matching banner is suppressed). */}
      <Modal visible={reward !== null} transparent animationType="fade" onRequestClose={() => setReward(null)}>
        <Pressable style={styles.scrim} onPress={() => setReward(null)} accessibilityLabel="Close">
          <Animated.View style={[styles.rewardCard, { transform: [{ scale: rewardScale }] }]}>
            <Animated.View style={{ transform: [{ translateY: coinBounce }] }}>
              <Image source={COIN} style={{ width: 72, height: 72, marginBottom: 10 }} contentFit="contain" />
            </Animated.View>
            <Text style={styles.rewardTitle}>+{reward ?? COIN_REWARD} Coins!</Text>
            <Text style={styles.rewardText}>Thanks for watching! They're in your coin count.</Text>
            <GameButton label="Awesome!" onPress={() => setReward(null)} fullWidth />
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  gridOuter: { flex: 1, padding: 6 },
  heroOuter: { width: '100%' },
  card: {
    backgroundColor: BRAND.white,
    borderRadius: 18,
    borderWidth: 3,
    borderBottomWidth: 6,
    borderColor: BRAND.navy,
    overflow: 'hidden',
  },
  heroCard: { borderRadius: 22, borderWidth: 4, borderBottomWidth: 7 },
  thumbWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: BRAND.sky },
  watchedTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,52,110,0.35)' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  play: {
    shadowColor: BRAND.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  playHero: {},
  playWatched: { opacity: 0.85 },
  newBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    backgroundColor: BRAND.red,
    borderColor: BRAND.white,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  newBadgeHero: { top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 3 },
  newText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 1 },
  chip: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: BRAND.navy,
    paddingLeft: 3,
    paddingRight: 9,
    paddingVertical: 2,
  },
  coinChip: { backgroundColor: BRAND.gold },
  watchedChip: { backgroundColor: BRAND.green, paddingLeft: 6 },
  chipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.navy, textTransform: 'uppercase' },
  chipTextHero: { fontSize: 16 },
  coinSmall: { width: 18, height: 18 },
  coinHero: { width: 26, height: 26 },
  lengthChip: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    backgroundColor: BRAND.navy,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lengthText: { fontFamily: FONT.body, fontSize: 12, color: BRAND.white, letterSpacing: 0.5 },
  body: { paddingHorizontal: 10, paddingVertical: 9, minHeight: 56 },
  heroBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  title: { fontFamily: FONT.body, fontSize: 15, lineHeight: 18, color: BRAND.navy },
  kicker: { fontFamily: FONT.display, fontSize: 13, color: BRAND.blueBright, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  heroTitle: { fontFamily: FONT.body, fontSize: 21, lineHeight: 24, color: BRAND.navy },
  scrim: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BRAND.scrim },
  rewardCard: {
    backgroundColor: BRAND.cream,
    borderRadius: 26,
    borderWidth: 4,
    borderBottomWidth: 7,
    borderColor: BRAND.navy,
    padding: 24,
    marginHorizontal: 40,
    alignItems: 'center',
    minWidth: 260,
  },
  rewardTitle: { fontFamily: FONT.display, fontSize: 28, color: BRAND.navy, textTransform: 'uppercase', marginBottom: 6 },
  rewardText: { fontFamily: FONT.body, fontSize: 17, color: BRAND.navySoft, textAlign: 'center', marginBottom: 16 },
});
