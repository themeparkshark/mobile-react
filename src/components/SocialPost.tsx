import { Image } from 'expo-image';
import { memo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SocialPostType } from '../models/social-post-type';
import { BRAND, FONT, GameButton, GameIcon } from '../ui';
import { formatDuration, isNewVideo, postedAgo, thumbnailFor } from './watch/watchFeed';

/** What the Watch page promises per video (live economy.social_post_view_coins). */
export const COIN_REWARD = 25;

export const COIN_ART = require('../../assets/images/coingold.png');

/**
 * One Watch page video card. `featured` is the newest-video hero; the rest
 * are grid cards. Playing, coins and the reward moment live on WatchScreen
 * (one player and one dialog for the page), so a recycled grid cell never
 * carries another video's state.
 */
function SocialPost({
  socialPost,
  watched,
  featured = false,
  newest = true,
  onPress,
}: {
  readonly socialPost: SocialPostType;
  readonly watched: boolean;
  readonly featured?: boolean;
  /** The hero is the newest video, or the newest one still worth coins. */
  readonly newest?: boolean;
  readonly onPress: (post: SocialPostType) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const isNew = isNewVideo(socialPost);
  const duration = socialPost.is_short ? null : formatDuration(socialPost.duration_seconds);
  const ago = featured ? postedAgo(socialPost) : null;
  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, friction: 5, tension: 300, useNativeDriver: true }).start();

  return (
    <Pressable
      onPress={() => onPress(socialPost)}
      onPressIn={() => press(0.96)}
      onPressOut={() => press(1)}
      accessibilityRole="button"
      accessibilityLabel={`${socialPost.title}. ${watched ? 'Watched' : `Earn ${COIN_REWARD} coins`}${isNew ? '. New' : ''}`}
      style={featured ? styles.heroOuter : styles.gridOuter}
    >
      <Animated.View style={[styles.card, featured && styles.heroCard, { transform: [{ scale }] }]}>
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
          {watched && <View style={styles.watchedTint} />}

          {/* Grid: play sits in a corner so the thumbnail's own title art stays
              readable. The hero has its Watch button instead. */}
          {!featured && (
            <View style={styles.play} pointerEvents="none">
              <GameIcon name="play" size={30} />
            </View>
          )}

          {isNew && (
            <View style={[styles.newBadge, featured && styles.newBadgeHero]}>
              <Text style={[styles.newText, featured && { fontSize: 15 }]}>NEW</Text>
            </View>
          )}

          {watched ? (
            <View style={[styles.chip, styles.watchedChip]}>
              <GameIcon name="check" size={featured ? 18 : 14} />
              <Text style={[styles.chipText, { color: BRAND.white }, featured && styles.chipTextHero]}>Watched</Text>
            </View>
          ) : (
            <View style={[styles.chip, styles.coinChip]}>
              <Image source={COIN_ART} style={featured ? styles.coinHero : styles.coinSmall} contentFit="contain" />
              <Text style={[styles.chipText, featured && styles.chipTextHero]}>
                +{COIN_REWARD}{featured ? ' coins' : ''}
              </Text>
            </View>
          )}

          {(socialPost.is_short || duration) && (
            <View style={[styles.lengthChip, featured && styles.lengthChipHero]}>
              <Text style={styles.lengthText}>{socialPost.is_short ? 'SHORT' : duration}</Text>
            </View>
          )}
        </View>

        <View style={[styles.body, featured && styles.heroBody]}>
          {featured && (
            <Text style={styles.kicker}>{isNew ? 'Brand new' : newest ? 'Newest video' : 'Next to watch'}{ago ? ` · ${ago}` : ''}</Text>
          )}
          <Text numberOfLines={featured ? 3 : 2} style={featured ? styles.heroTitle : styles.title}>
            {socialPost.title}
          </Text>
          {featured && (
            <View style={{ marginTop: 10 }} pointerEvents="none">
              <GameButton label={watched ? 'Watch again' : `Watch now · +${COIN_REWARD}`} icon="play" fullWidth haptics={false} />
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default memo(SocialPost);

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
  play: {
    position: 'absolute',
    top: 6,
    right: 6,
    shadowColor: BRAND.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
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
  lengthChipHero: { bottom: undefined, top: 10, right: 10 },
  lengthText: { fontFamily: FONT.body, fontSize: 12, color: BRAND.white, letterSpacing: 0.5 },
  body: { paddingHorizontal: 10, paddingVertical: 9, minHeight: 56 },
  heroBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  title: { fontFamily: FONT.body, fontSize: 15, lineHeight: 18, color: BRAND.navy },
  kicker: { fontFamily: FONT.display, fontSize: 13, color: BRAND.blueBright, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  heroTitle: { fontFamily: FONT.body, fontSize: 21, lineHeight: 24, color: BRAND.navy },
});
