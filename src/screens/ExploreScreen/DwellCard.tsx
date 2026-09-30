import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon, SHADOW } from '../../ui';

/**
 * "In line at X? Play": the map's left suggestion chip when the player has
 * stood at one attraction for 90 s. Springs in, the queue icon wiggles once in
 * a while; reduced motion holds still.
 */
export default function DwellCard({ rideName, top, onPlay, onDismiss }: {
  readonly rideName: string;
  readonly top: number;
  /** Rejects with a reason when the ride's games cannot open; the chip shows it. */
  readonly onPlay: () => Promise<void>;
  readonly onDismiss: () => void;
}) {
  const reduced = useReducedGameMotion();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false), mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const play = () => {
    if (busy.current) return;
    busy.current = true; setError(null); haptic('tapLight');
    Promise.resolve().then(onPlay).catch(() => {
      if (!mounted.current) return;
      haptic('warning');
      setError('Could not open this line. Tap to try again.');
    }).finally(() => { busy.current = false; });
  };
  const enter = useSharedValue(reduced ? 1 : 0), wiggle = useSharedValue(0);
  useEffect(() => {
    if (reduced) { enter.value = 1; wiggle.value = 0; return; }
    haptic('tickSelection');
    enter.value = withSpring(1, { damping: 12, stiffness: 190 });
    wiggle.value = withDelay(600, withRepeat(withSequence(withTiming(1, { duration: 90 }), withTiming(-1, { duration: 120 }),
      withTiming(0, { duration: 90 }), withDelay(3200, withTiming(0, { duration: 1 }))), -1, false));
  }, [reduced, enter, wiggle]);
  const style = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateX: (1 - enter.value) * -28 }, { scale: 0.92 + enter.value * 0.08 }] }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wiggle.value * 10}deg` }] }));
  return <Animated.View style={[styles.slot, { top }, style]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`In line at ${rideName}? Play queue games`} onPress={play} style={styles.chip}>
      <Animated.View style={iconStyle}><GameIcon name="queue" size={32} /></Animated.View>
      <View style={styles.copy}>
        <Text style={styles.kicker}>IN LINE HERE?</Text>
        <Text style={styles.title} numberOfLines={1}>{error ? 'Not ready yet' : 'Play while you wait'}</Text>
        <Text style={styles.ride} numberOfLines={error ? 2 : 1} accessibilityLiveRegion="polite">{error ?? rideName}</Text>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={10} onPress={onDismiss} style={styles.close}>
      <GameIcon name="close" size={22} />
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', left: 12, width: '43%', zIndex: 21 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.blueBright, borderColor: BRAND.white,
    borderWidth: 3, borderRadius: 14, padding: 7, ...SHADOW.card },
  copy: { flex: 1, minWidth: 0 },
  kicker: { color: '#ffdc61', fontFamily: 'Knockout', fontSize: 10, letterSpacing: 0.6 },
  title: { color: BRAND.white, fontFamily: 'Shark', fontSize: 13, marginTop: 1 },
  ride: { color: '#dff4ff', fontFamily: 'Knockout', fontSize: 11 },
  close: { position: 'absolute', right: -8, top: -8 },
});
