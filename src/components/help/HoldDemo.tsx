/**
 * HoldDemo: the pictured hold control (fix pass w4, T045). A 7-year-old sees a finger press down and
 * STAY down (a gold ring fills under the fingertip) while the game's own hero moves: Sharky rises while
 * the finger holds and sinks when it lifts; Banana Basket's basket slides with the held finger.
 * Used on the game's start card (the countdown pill) and the how-to card, so the hold is pictured on
 * both, with zero reading. Existing art only (the tap hand players already see in Parade Beat and on
 * the map, the game's own hero art), drawn on the UI thread; Reduce Motion shows the held pose still.
 */
import React, { useEffect } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { BRAND } from '../../ui/tokens';
import GameIcon from '../../ui/GameIcon';

const HAND = require('../../../assets/images/ride-photo/tap-hand.webp');

/** One loop of the demo: press (0 to 0.12), hold and move (to 0.62), lift (to 0.72), settle. */
export const HOLD_LOOP_MS = 1800;

function smooth(a: number, b: number, x: number): number {
  'worklet';
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The demo pose at loop phase p (0..1), pure so tests can read the story in order.
 * `press` is how far the finger is down (the ring fills with it), `rise` how far the hero has
 * swum up (rise demo), `slide` the basket and finger offset (-1..1, slide demo).
 */
export function holdPose(p: number, motion: 'rise' | 'slide'): { press: number; rise: number; slide: number } {
  'worklet';
  if (motion === 'slide') {
    // The finger stays down the whole loop and the basket rides under it, side to side.
    return { press: 1, rise: 0, slide: Math.sin(p * Math.PI * 2) };
  }
  const press = smooth(0, 0.12, p) * (1 - smooth(0.62, 0.72, p));
  const rise = smooth(0.12, 0.62, p) * (1 - smooth(0.72, 1, p));
  return { press, rise, slide: 0 };
}

export default function HoldDemo({ subject, motion, reduced, size = 46 }: {
  readonly subject: ImageSourcePropType;
  readonly motion: 'rise' | 'slide';
  readonly reduced: boolean;
  /** The hero's art size in points. */
  readonly size?: number;
}) {
  const t = useSharedValue(reduced ? 0.4 : 0);
  useEffect(() => {
    if (reduced) { t.value = 0.4; return undefined; }
    t.value = 0;
    // The loop clock; every pose above eases on it (smoothstep and sine), so nothing moves linearly.
    t.value = withRepeat(withTiming(1, { duration: HOLD_LOOP_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [reduced, t]);

  const fingerStyle = useAnimatedStyle(() => {
    const q = holdPose(t.value, motion);
    return { transform: [{ translateX: motion === 'slide' ? 18 * q.slide : 0 }, { translateY: -10 + 10 * q.press }, { rotate: `${6 - 8 * q.press}deg` }] };
  });
  const ringStyle = useAnimatedStyle(() => {
    const q = holdPose(t.value, motion);
    return { opacity: 0.5 + 0.5 * q.press, transform: [{ translateX: motion === 'slide' ? 18 * q.slide : 0 }, { scale: 0.6 + 0.4 * q.press }] };
  });
  const heroStyle = useAnimatedStyle(() => {
    const q = holdPose(t.value, motion);
    return { transform: [{ translateX: motion === 'slide' ? 18 * q.slide : 0 }, { translateY: motion === 'rise' ? 8 - 20 * q.rise : 0 }] };
  });

  if (motion === 'slide') {
    // The finger held on the basket: they slide together.
    return (
      <View style={[styles.slideCell, { height: size + 34 }]} accessible={false}>
        <Animated.View style={[styles.slideHero, heroStyle]}>
          <Image source={subject} style={{ width: size, height: size }} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.ring, styles.slideRing, ringStyle]} />
        <Animated.View style={[styles.slideFinger, fingerStyle]} pointerEvents="none">
          <Image source={HAND} style={styles.hand} resizeMode="contain" />
        </Animated.View>
      </View>
    );
  }
  return (
    <View style={styles.row} accessible={false}>
      <View style={styles.pressCell}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={fingerStyle} pointerEvents="none">
          <Image source={HAND} style={styles.hand} resizeMode="contain" />
        </Animated.View>
      </View>
      <View style={styles.arrow}><GameIcon name="arrow" size={20} /></View>
      <View style={[styles.riseCell, { width: size + 12, height: size + 26 }]}>
        <View style={styles.up}><GameIcon name="arrow" size={18} /></View>
        <Animated.View style={heroStyle}>
          <Image source={subject} style={{ width: size, height: size }} resizeMode="contain" />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  pressCell: { width: 52, height: 60, alignItems: 'center', justifyContent: 'flex-end' },
  ring: { position: 'absolute', bottom: 2, width: 30, height: 30, borderRadius: 15, borderWidth: 4, borderColor: BRAND.gold,
    backgroundColor: '#fff4cc' },
  hand: { width: 34, height: 40 },
  arrow: { marginHorizontal: 6 },
  riseCell: { alignItems: 'center', justifyContent: 'flex-end' },
  // Above the hero, pointing up: "up" while the finger holds.
  up: { position: 'absolute', top: 0, transform: [{ rotate: '-90deg' }] },
  slideCell: { width: 120, alignItems: 'center', justifyContent: 'flex-start' },
  slideHero: { marginTop: 0 },
  slideRing: { bottom: 8 },
  slideFinger: { position: 'absolute', bottom: 4 },
});
