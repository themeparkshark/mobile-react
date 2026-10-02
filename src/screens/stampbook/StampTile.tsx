/**
 * One stamp in the book grid. Earned: full-color sticker, earned date, foil
 * shine on rare and up. Locked: a soft silhouette with its one-line how-to and
 * a progress bar once started. Springy press, a tap sound, a light haptic.
 */
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { rarityToneByName } from '../../constants/coinTiers';
import GameIcon from '../../ui/GameIcon';
import { stampArt } from './art';
import { earnedDate, hasRewards, hasShine, progressLabel, type BookStamp } from './model';

export const INK = '#14213D';

interface Props {
  readonly stamp: BookStamp;
  readonly size: number;
  readonly accent: string;
  /** False while off-screen or under the stamp card: the shine loop stops. */
  readonly animate: boolean;
  readonly reducedMotion: boolean;
  readonly onPress: (stamp: BookStamp) => void;
}

function StampTile({ stamp, size, accent, animate, reducedMotion, onPress }: Props) {
  const press = useSharedValue(1);
  const shine = useSharedValue(-1);
  const tone = rarityToneByName(stamp.rarity);
  const foil = hasShine(stamp) && !reducedMotion;
  const claimable = stamp.earned && !stamp.rewardClaimed && hasRewards(stamp.rewards);

  useEffect(() => {
    if (!foil || !animate) {
      cancelAnimation(shine);
      shine.value = -1;
      return;
    }
    // A slow sweep with a long rest: alive, never busy. Stagger by id so tiles don't sync.
    shine.value = -1;
    shine.value = withDelay((stamp.id % 7) * 260, withRepeat(
      withTiming(2.2, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, false));
    return () => cancelAnimation(shine);
  }, [foil, animate, shine, stamp.id]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const shineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shine.value * size }, { rotate: '18deg' }] }));

  const art = size * 0.78;
  return (
    <Animated.View style={[{ width: size }, pressStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${stamp.name}. ${stamp.earned ? 'Earned' : `Locked. ${stamp.howTo}`}`}
        onPressIn={() => { press.value = withSpring(0.92, { damping: 14, stiffness: 420 }); }}
        onPressOut={() => { press.value = withSpring(1, { damping: 9, stiffness: 320 }); }}
        onPress={() => onPress(stamp)}
        style={[
          styles.card,
          stamp.earned ? styles.cardEarned : styles.cardLocked,
          stamp.earned && { borderColor: tone.color, shadowColor: tone.color },
        ]}
      >
        <View style={[styles.artWrap, { width: art, height: art }]}>
          {stamp.earned ? (
            <Image source={stampArt(stamp)} style={styles.art} contentFit="contain" transition={160} recyclingKey={String(stamp.id)} />
          ) : stamp.secret ? (
            <View style={[styles.secret, { borderColor: `${accent}88` }]}>
              <Text style={[styles.secretMark, { color: accent }]}>?</Text>
            </View>
          ) : (
            <Image source={stampArt(stamp)} style={[styles.art, styles.silhouette]} tintColor="#9DB3DB"
              contentFit="contain" transition={160} recyclingKey={String(stamp.id)} />
          )}
          {foil && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.foilClip]}>
              <Animated.View style={[styles.foil, { height: art * 1.6, top: -art * 0.3 }, shineStyle]}>
                <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                  start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
              </Animated.View>
            </View>
          )}
          {!stamp.earned && !stamp.secret && (
            <View style={styles.lock}><GameIcon name="lock" size={13} /></View>
          )}
        </View>

        <Text style={[styles.name, !stamp.earned && styles.nameLocked]} numberOfLines={1}>{stamp.name}</Text>
        {stamp.earned ? (
          <Text style={styles.date} numberOfLines={1}>{earnedDate(stamp.earnedAt) ?? 'Earned'}</Text>
        ) : (
          <Text style={styles.howTo} numberOfLines={2}>{stamp.howTo}</Text>
        )}
        {!stamp.earned && !stamp.secret && stamp.progress > 0 && (
          <View style={styles.barWrap}>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${stamp.percent}%`, backgroundColor: accent }]} /></View>
            <Text style={styles.barText}>{progressLabel(stamp)}</Text>
          </View>
        )}
        {claimable && (
          <View style={styles.claim}><Text style={styles.claimText}>CLAIM</Text></View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default memo(StampTile);

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 9,
    paddingHorizontal: 6,
    minHeight: 150,
  },
  cardEarned: {
    backgroundColor: '#FFF8E4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  cardLocked: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  artWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  art: { width: '100%', height: '100%' },
  silhouette: { opacity: 0.32 },
  foilClip: { overflow: 'hidden', borderRadius: 999 },
  foil: { position: 'absolute', width: 34, left: 0 },
  secret: {
    width: '78%', height: '78%', borderRadius: 999, borderWidth: 3, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,201,60,0.12)',
  },
  secretMark: { fontFamily: 'Shark', fontSize: 40 },
  lock: {
    position: 'absolute', right: 0, bottom: 2, width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#0E1C38', borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontFamily: 'Knockout', fontSize: 14, color: INK, textAlign: 'center' },
  nameLocked: { color: '#E8EEFF' },
  date: { fontFamily: 'Knockout', fontSize: 11, color: '#5B6B8C', marginTop: 1 },
  howTo: { fontFamily: 'Knockout', fontSize: 11, lineHeight: 13, color: 'rgba(232,238,255,0.72)', textAlign: 'center', marginTop: 1 },
  barWrap: { width: '92%', marginTop: 5, alignItems: 'center' },
  bar: { width: '100%', height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barText: { fontFamily: 'Knockout', fontSize: 10, color: 'rgba(232,238,255,0.8)', marginTop: 2 },
  claim: {
    position: 'absolute', top: -7, right: -5, backgroundColor: '#FFC93C', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2, borderWidth: 2, borderColor: INK,
  },
  claimText: { fontFamily: 'Knockout', fontSize: 11, color: INK, letterSpacing: 0.5 },
});
