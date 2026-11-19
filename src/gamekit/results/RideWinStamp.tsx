/**
 * The ride coin win's one short stamp (fix round W3, T037). In a paid ride
 * challenge a won game shows no results card of its own (no score sheet, no
 * NEW BEST, STATS or ALBUM, no Share, no CONTINUE): the stars stamp in under
 * one ribbon for a moment, then the shell hands the win on to the coin's one
 * win card, where the coin is the hero. No buttons, so a late tap can never
 * skip or replay anything. If the server is slow to confirm the win, a small
 * loader says the coin is on its way (never a dead screen).
 * UI-thread springs (motion.ts SPRING.stamp); Reduce Motion shows it still.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import SharkLoader from '../../ui/SharkLoader';
import { SPRING } from '../../ui/motion';
import { ResultsRibbon } from './ResultsRibbon';
import { RIDE_WIN_STAMP_TITLE, RIDE_WIN_WAIT_LINE_MS, RIDE_WIN_WAIT_TEXT, rideWinStars } from './rideWinStampModel';

function StampStar({ index, on, reduced }: { readonly index: number; readonly on: boolean; readonly reduced: boolean }) {
  const s = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) s.value = withDelay(120 + index * 160, withSpring(1, SPRING.stamp));
  }, [reduced, index, s]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, s.value * 2), transform: [{ scale: 0.4 + 0.6 * s.value }] }));
  return <Animated.View style={[styles.star, !on && styles.starOff, style]}><GameIcon name="star" size={index === 1 ? 62 : 50} /></Animated.View>;
}

export default function RideWinStamp({ stars, reducedMotion, handedOff }: {
  readonly stars: number;
  readonly reducedMotion: boolean;
  /** The win has been handed on (the server is confirming it): after a beat a small loader shows. */
  readonly handedOff: boolean;
}) {
  const shown = rideWinStars(stars);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!handedOff) { setWaiting(false); return undefined; }
    const timer = setTimeout(() => setWaiting(true), RIDE_WIN_WAIT_LINE_MS);
    return () => clearTimeout(timer);
  }, [handedOff]);
  return (
    <View style={styles.wrap} pointerEvents="none" accessible accessibilityRole="alert"
      accessibilityLabel={`You won the coin. ${shown} of 3 stars.`}>
      <ResultsRibbon title={RIDE_WIN_STAMP_TITLE} reducedMotion={reducedMotion} style={styles.ribbon} />
      <View style={styles.stars}>
        {[0, 1, 2].map(i => <StampStar key={i} index={i} on={i < shown} reduced={reducedMotion} />)}
      </View>
      {waiting && <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(200)} style={styles.wait}>
        {/* One line only: the loader says it, and keeps saying it (never a second "still loading" line). */}
        <SharkLoader compact tone="onBlue" title={RIDE_WIN_WAIT_TEXT} message={RIDE_WIN_WAIT_TEXT} />
      </Animated.View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,52,110,0.45)' },
  ribbon: { width: '86%' },
  stars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 6 },
  star: {},
  starOff: { opacity: 0.35 },
  wait: { alignItems: 'center', marginTop: 18 },
});
