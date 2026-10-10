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
/** 256 px copies for small draws (map pill, slots, rack): decoded near drawn size. */
export const BOX_ART_SM: Record<TrailTier, number> = {
  blue: require('../../../assets/images/trail/box-blue-sm.png'),
  red: require('../../../assets/images/trail/box-red-sm.png'),
  gold: require('../../../assets/images/trail/box-gold-sm.png'),
};
/** The opened box: lid up, light shining out (the reveal keeps it on screen behind the rewards). */
export const BOX_OPEN_ART: Record<TrailTier, number> = {
  blue: require('../../../assets/images/trail/open-blue.png'),
  red: require('../../../assets/images/trail/open-red.png'),
  gold: require('../../../assets/images/trail/open-gold.png'),
};
export const STEPS_ART = require('../../../assets/images/trail/steps.png');
export const WHEELS_ART = require('../../../assets/images/trail/wheels.png');

/** Idle wiggles and hops run this long after something changes, then rest (battery). */
const LIVELY_MS = 8000;

/**
 * One Trail Box. It reacts to the walk: still when just started, a little
 * wiggle every few seconds past 75%, and a happy hop when it is ready to open.
 * Motion runs on the UI thread for about 8 s after the box changes (or the
 * screen shows it), then rests, and never runs when `active` is false or with
 * Reduce Motion.
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
  const bucket = Math.floor(fraction * 20);

  useEffect(() => {
    cancelAnimation(rot);
    cancelAnimation(hop);
    rot.value = 0;
    hop.value = 0;
    if (reduced || !active || (!ready && !near)) return undefined;
    const reps = ready ? Math.ceil(LIVELY_MS / 1490) : Math.ceil(LIVELY_MS / 2990);
    if (ready) {
      hop.value = withRepeat(withSequence(
        withTiming(-1, { duration: 220, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 260, easing: Easing.bounce }),
        withDelay(1000, withTiming(0, { duration: 10 })),
      ), reps);
      rot.value = withRepeat(withSequence(
        withTiming(-5, { duration: 110 }), withTiming(5, { duration: 160 }), withTiming(0, { duration: 110 }),
        withDelay(1100, withTiming(0, { duration: 10 })),
      ), reps);
    } else {
      rot.value = withRepeat(withSequence(
        withDelay(2600, withTiming(-4, { duration: 90 })), withTiming(4, { duration: 120 }),
        withTiming(-2, { duration: 90 }), withTiming(0, { duration: 90 }),
      ), reps);
    }
    return () => { cancelAnimation(rot); cancelAnimation(hop); };
  }, [ready, near, bucket, active, reduced, rot, hop]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.value * size * 0.12 }, { rotate: `${rot.value}deg` }],
  }));
  const drawn = Math.round(size * TIER_SCALE[tier]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Animated.View style={[{ width: drawn, height: drawn, opacity: dim ? 0.55 : 1 }, style]}>
        <Image source={size <= 96 ? BOX_ART_SM[tier] : BOX_ART[tier]} style={{ width: drawn, height: drawn }} contentFit="contain" />
      </Animated.View>
    </View>
  );
}

export default memo(TrailBoxArt);
