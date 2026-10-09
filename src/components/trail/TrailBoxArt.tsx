import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { TIER_SCALE, type TrailTier } from '../../services/trail/trailModel';

export const BOX_ART: Record<TrailTier, number> = {
  blue: require('../../../assets/images/trail/box-blue.png'),
  red: require('../../../assets/images/trail/box-red.png'),
  gold: require('../../../assets/images/trail/box-gold.png'),
};
export const STEPS_ART = require('../../../assets/images/trail/steps.png');

/**
 * One Trail Box. It reacts to the walk: still when just started, a little
 * wiggle every few seconds past 75%, and a happy hop when it is ready to open.
 * All motion runs on the UI thread and stops when `active` is false (sheet
 * closed, app in the background) or with Reduce Motion.
 */
function TrailBoxArt({ tier, size, fraction = 0, ready = false, active = true, dim = false }: {
  readonly tier: TrailTier;
  readonly size: number;
  readonly fraction?: number;
  readonly ready?: boolean;
  readonly active?: boolean;
  readonly dim?: boolean;
}) {
  const reduced = useReducedGameMotion();
  const rot = useSharedValue(0);
  const hop = useSharedValue(0);
  const near = fraction >= 0.75;

  useEffect(() => {
    cancelAnimation(rot);
    cancelAnimation(hop);
    rot.value = 0;
    hop.value = 0;
    if (reduced || !active) return;
    if (ready) {
      hop.value = withRepeat(withSequence(
        withTiming(-1, { duration: 220, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 260, easing: Easing.bounce }),
        withDelay(900, withTiming(0, { duration: 1 })),
      ), -1);
      rot.value = withRepeat(withSequence(
        withTiming(-5, { duration: 110 }), withTiming(5, { duration: 160 }), withTiming(0, { duration: 110 }),
        withDelay(1100, withTiming(0, { duration: 1 })),
      ), -1);
    } else if (near) {
      rot.value = withRepeat(withSequence(
        withDelay(2600, withTiming(-4, { duration: 90 })), withTiming(4, { duration: 120 }),
        withTiming(-2, { duration: 90 }), withTiming(0, { duration: 90 }),
      ), -1);
    }
    return () => { cancelAnimation(rot); cancelAnimation(hop); };
  }, [ready, near, active, reduced, rot, hop]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.value * size * 0.12 }, { rotate: `${rot.value}deg` }],
  }));
  const drawn = Math.round(size * TIER_SCALE[tier]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Animated.View style={[{ width: drawn, height: drawn, opacity: dim ? 0.55 : 1 }, style]}>
        <Image source={BOX_ART[tier]} style={{ width: drawn, height: drawn }} contentFit="contain" />
      </Animated.View>
    </View>
  );
}

export default memo(TrailBoxArt);
