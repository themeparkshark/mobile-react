/**
 * SeatAvatar: a racer's shark in a thick-outlined ring. Players show their own
 * outfitted avatar (server avatar_url); house bots and anyone without one wear
 * one of Alex's shark colours. Away players fade; ghosts get a soft sky ring.
 */
import { memo, useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { BRAND } from '../../ui/tokens';
import { BOT_SHARK, SHARKS, TEAM_RING } from './partyArt';

export interface SeatAvatarProps {
  avatarUrl: string | null;
  team?: string | null;
  size?: number;
  me?: boolean;
  away?: boolean;
  ghost?: boolean;
  /** Changes to this key play a little hop (joins, emotes, position gains). */
  bumpKey?: string | number;
}

function sourceFor(avatarUrl: string | null) {
  if (avatarUrl && BOT_SHARK[avatarUrl]) return BOT_SHARK[avatarUrl];
  if (avatarUrl && /^https?:\/\//.test(avatarUrl) && !/placeholder|via\.placeholder|lorempixel/.test(avatarUrl)) return { uri: avatarUrl };
  return SHARKS.classic;
}

function SeatAvatar({ avatarUrl, team, size = 56, me, away, ghost, bumpKey }: SeatAvatarProps) {
  const hop = useSharedValue(0);
  const scale = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 10, stiffness: 260, mass: 0.6 });
  }, [scale]);

  useEffect(() => {
    if (bumpKey === undefined) return;
    hop.value = withSequence(withTiming(-8, { duration: 110 }), withSpring(0, { damping: 9, stiffness: 320 }));
  }, [bumpKey, hop]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }, { scale: scale.value }] }));
  const ring = ghost ? BRAND.sky : me ? BRAND.gold : (team && TEAM_RING[team]) || BRAND.white;

  return (
    <Animated.View style={[{ width: size, height: size, opacity: away ? 0.5 : 1 }, style]}>
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: ring, borderWidth: Math.max(3, size * 0.07) }]}>
        <Image source={sourceFor(avatarUrl)} style={{ width: size * 0.86, height: size * 0.86 }} resizeMode="contain" />
      </View>
    </Animated.View>
  );
}

export default memo(SeatAvatar);

const styles = StyleSheet.create({
  ring: {
    backgroundColor: BRAND.sky,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: BRAND.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
