/**
 * The loss card's Ride Parts (T4, arcade plan Nov 20 2026): the Parts this loss paid drop into the coin's
 * slot, then the line "+3 Ride Parts for Space Mountain". A coin whose Parts are full today shows its slot
 * full and "Parts full here today". UI-thread motion only (motion.ts timings); Reduce Motion lands them still.
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import { DURATION } from '../../ui/motion';
import { withNumberFont } from '../../ui/numberText';

const RIDE_COIN = require('../../../assets/images/map/ride-coin.png');
/** Never more than 4 Parts pictures in flight, whatever the number. */
const MAX_SHOWN = 4;

function DroppingPart({ i, t }: { readonly i: number; readonly t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    // Each Part starts a little later and falls from above into the slot.
    const k = Math.min(1, Math.max(0, t.value * 1.6 - i * 0.2));
    return { opacity: k <= 0 || k >= 1 ? 0 : 1,
      transform: [{ translateX: (i - 1.5) * 16 * (1 - k) }, { translateY: -54 * (1 - k) }, { scale: 1 - k * 0.45 }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.part, style]}><GameIcon name="parts" size={24} /></Animated.View>;
}

export default function LossParts({ amount, full, line, coinUri, reduced }: {
  readonly amount: number;
  readonly full: boolean;
  readonly line: string;
  readonly coinUri?: string | null;
  readonly reduced: boolean;
}) {
  const t = useSharedValue(reduced ? 1 : 0);
  const shown = Math.min(MAX_SHOWN, Math.max(0, amount));
  useEffect(() => {
    if (reduced || shown === 0) { t.value = 1; return; }
    t.value = 0;
    t.value = withDelay(DURATION.base, withTiming(1, { duration: DURATION.bloom * 2, easing: Easing.in(Easing.quad) }));
  }, [reduced, shown, t]);
  const slot = useAnimatedStyle(() => ({ transform: [{ scale: 1 + Math.max(0, Math.sin(Math.min(1, t.value) * Math.PI)) * 0.08 }] }));
  return <View style={styles.wrap} accessible accessibilityRole="text" accessibilityLabel={line}>
    <Animated.View style={[styles.slot, full && styles.slotFull, slot]}>
      <Image source={coinUri ? { uri: coinUri } : RIDE_COIN} style={[styles.coin, !full && styles.coinWaiting]} contentFit="contain" />
      {Array.from({ length: shown }, (_, i) => <DroppingPart key={i} i={i} t={t} />)}
      <View style={styles.badge}><GameIcon name="parts" size={18} /></View>
    </Animated.View>
    <Text style={styles.line} numberOfLines={2}>{withNumberFont(line)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', justifyContent: 'center', marginBottom: 12 },
  slot: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderColor: BRAND.white, backgroundColor: 'rgba(5,52,110,0.35)',
    alignItems: 'center', justifyContent: 'center' },
  slotFull: { borderColor: BRAND.gold, backgroundColor: 'rgba(255,207,59,0.3)' },
  coin: { width: 44, height: 44 },
  coinWaiting: { opacity: 0.55 },
  part: { position: 'absolute' },
  badge: { position: 'absolute', right: -6, bottom: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: BRAND.white,
    borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  line: { fontFamily: FONT.display, fontSize: 18, lineHeight: 22, color: BRAND.white, flexShrink: 1 },
});
