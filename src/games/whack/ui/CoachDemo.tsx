/**
 * CoachDemo: the countdown pill's picture demo for Whack (wow-games lane, round 4).
 *
 * A 7-year-old learns the whole game with zero words while 3-2-1 counts: the foam finger bonks a
 * shark and a gold check pops; then a toothy lure fish shakes "no" and a calm navy X stamps over it.
 * Built from the game's own art (theme pop, angler, foam finger) plus code-drawn check and X (never a
 * red cross). One loop on the UI thread (Reanimated), only while the count is on screen; Reduce
 * Motion shows the end state (check and X) with no motion.
 */

import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Extrapolation,
} from 'react-native-reanimated';
import { ART, THEMED_SHARK_FRAMES, type WhackTheme } from '../assets';
import { GOLD_FX } from '../../../ui/motion';

const NAVY = '#05346e';
/** One demo loop: bonk (0-0.45), lure says no (0.5-0.9), rest. */
export const COACH_LOOP_MS = 1400;
const ART_PT = 46;

/** Demo pose at loop phase p (0..1), pure so tests can check the story beats in order. */
export function coachPose(p: number): { finger: number; squash: number; check: number; shake: number; cross: number } {
  'worklet';
  // Finger dips onto the shark (0.05-0.18), lifts (0.18-0.3).
  const finger = p < 0.05 ? 0 : p < 0.18 ? (p - 0.05) / 0.13 : p < 0.3 ? 1 - (p - 0.18) / 0.12 : 0;
  // The shark squashes on contact.
  const squash = p >= 0.16 && p < 0.26 ? 1 - Math.abs(p - 0.21) / 0.05 : 0;
  // The check pops past full on contact and settles (one overshoot), held to the loop end.
  const check = p < 0.18 ? 0 : p < 0.24 ? ((p - 0.18) / 0.06) * 1.25 : p < 0.3 ? 1.25 - ((p - 0.24) / 0.06) * 0.25 : 1;
  // The lure shakes "no" twice, then the X stamps in from big.
  const shake = p >= 0.5 && p < 0.72 ? Math.sin(((p - 0.5) / 0.22) * Math.PI * 4) : 0;
  const cross = p < 0.66 ? 0 : p < 0.72 ? 1.7 - ((p - 0.66) / 0.06) * 0.7 : 1;
  return { finger, squash, check, shake, cross };
}

export function CoachDemo({ theme, reduced }: { theme: WhackTheme; reduced: boolean }) {
  const t = useSharedValue(reduced ? 0.99 : 0);
  useEffect(() => {
    if (reduced) { t.value = 0.99; return undefined; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: COACH_LOOP_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [reduced, t]);

  const sharkStyle = useAnimatedStyle(() => {
    const q = coachPose(t.value).squash;
    return { transform: [{ scaleX: 1 + 0.12 * q }, { scaleY: 1 - 0.12 * q }] };
  });
  const fingerStyle = useAnimatedStyle(() => {
    const f = coachPose(t.value).finger;
    return { opacity: reduced ? 0 : interpolate(f, [0, 0.2, 1], [0.4, 1, 1], Extrapolation.CLAMP), transform: [{ translateY: -14 + 14 * f }, { rotate: `${8 - 12 * f}deg` }] };
  });
  const checkStyle = useAnimatedStyle(() => {
    const c = coachPose(t.value).check;
    return { opacity: c > 0 ? 1 : 0, transform: [{ scale: c }] };
  });
  const lureStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${10 * coachPose(t.value).shake}deg` }] }));
  const crossStyle = useAnimatedStyle(() => {
    const c = coachPose(t.value).cross;
    return { opacity: c > 0 ? 1 : 0, transform: [{ scale: c }] };
  });

  return (
    <View style={styles.row} accessible={false}>
      <View style={styles.cell}>
        <Animated.View style={sharkStyle}>
          <Image source={THEMED_SHARK_FRAMES[theme][1]} style={styles.art} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.finger, fingerStyle]} pointerEvents="none">
          <Image source={ART.foamFinger} style={styles.fingerArt} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.badge, styles.yes, checkStyle]}>
          <View style={[styles.tick, styles.tickShort]} />
          <View style={[styles.tick, styles.tickLong]} />
        </Animated.View>
      </View>
      <View style={styles.cell}>
        <Animated.View style={lureStyle}>
          <Image source={ART.angler} style={styles.art} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.badge, styles.no, crossStyle]}>
          <View style={[styles.bar, { transform: [{ rotate: '45deg' }] }]} />
          <View style={[styles.bar, { transform: [{ rotate: '-45deg' }] }]} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  cell: { width: ART_PT + 30, height: ART_PT + 14, alignItems: 'center', justifyContent: 'flex-end', marginHorizontal: 8 },
  art: { width: ART_PT, height: ART_PT },
  finger: { position: 'absolute', top: -6, right: 2 },
  fingerArt: { width: 26, height: 30 },
  badge: {
    position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, borderWidth: 2.5, borderColor: NAVY,
    alignItems: 'center', justifyContent: 'center',
  },
  yes: { backgroundColor: GOLD_FX.rays },
  no: { backgroundColor: '#ffffff' },
  tick: { position: 'absolute', height: 3.5, borderRadius: 2, backgroundColor: NAVY },
  tickShort: { width: 7, left: 4, top: 11, transform: [{ rotate: '45deg' }] },
  tickLong: { width: 12, left: 7, top: 9, transform: [{ rotate: '-50deg' }] },
  bar: { position: 'absolute', width: 14, height: 3.5, borderRadius: 2, backgroundColor: NAVY },
});
