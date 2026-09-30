import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon, SHADOW, type GameIconName } from '../../ui';

/**
 * A map-corner balance in the same pill language as the header Currency: the
 * icon rides the left edge of a bright blue capsule with a white outline. A
 * change pops the icon and counts the number up. Reduced motion: no pop, the
 * number changes at once.
 */
function MapResourcePill({ icon, count, label, muted = false }: {
  readonly icon: GameIconName;
  readonly count: number;
  readonly label: string;
  /** Zero balances read quieter without going grey-dark. */
  readonly muted?: boolean;
}) {
  const reduced = useReducedGameMotion();
  const [shown, setShown] = useState(count);
  const previous = useRef(count);
  const pop = useSharedValue(1);
  useEffect(() => {
    if (previous.current === count) return;
    const from = previous.current;
    previous.current = count;
    if (reduced) { setShown(count); return; }
    pop.value = withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 260 }));
    const started = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / 450);
      setShown(Math.round(from + (count - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [count, reduced, pop]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return <View accessible accessibilityRole="text" accessibilityLabel={`${label}: ${count}`} style={styles.wrap}>
    <View style={[styles.pill, muted && styles.muted]}>
      <Text style={styles.count} numberOfLines={1} adjustsFontSizeToFit>{shown}</Text>
    </View>
    <Animated.View style={[styles.icon, iconStyle]}><GameIcon name={icon} size={32} /></Animated.View>
  </View>;
}

export default memo(MapResourcePill);

const styles = StyleSheet.create({
  wrap: { height: 36, justifyContent: 'center' },
  pill: { height: 30, minWidth: 76, marginLeft: 14, paddingLeft: 24, paddingRight: 10, borderRadius: 15,
    backgroundColor: BRAND.blueBright, borderWidth: 2.5, borderColor: BRAND.white, justifyContent: 'center', ...SHADOW.card },
  muted: { backgroundColor: BRAND.blue },
  count: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white, textAlign: 'center',
    textShadowColor: BRAND.navy, textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0 },
  icon: { position: 'absolute', left: 0, top: 2 },
});
