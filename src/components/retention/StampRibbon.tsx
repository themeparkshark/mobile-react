import { useEffect, useRef } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SLAM_SQUASH, SPRING } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import Ribbon from '../Ribbon';

/**
 * The gold ribbon on top of every retention card. When its words change
 * mid-moment ("Daily 3" to "All 3 done!"), it stamps in from 1.7 with a small
 * squash, the same stamp every label in the app uses. Reduce Motion: it just swaps.
 */
export default function StampRibbon({ text, reducedMotion }: { readonly text: string; readonly reducedMotion: boolean }) {
  const s = useSharedValue(1);
  const squash = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reducedMotion) return;
    s.value = 1.7;
    s.value = withTiming(1, { duration: 120, easing: EASE.in });
    squash.value = withSequence(withTiming(1, { duration: 120 }), withTiming(1 - SLAM_SQUASH, { duration: 50 }), withSpring(1, SPRING.stamp));
  }, [text, reducedMotion, s, squash]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { scaleY: squash.value }, { scaleX: 2 - squash.value }], zIndex: 20 }));
  return <Animated.View style={[{ width: '100%', zIndex: 20 }, style]}><Ribbon text={text} /></Animated.View>;
}
