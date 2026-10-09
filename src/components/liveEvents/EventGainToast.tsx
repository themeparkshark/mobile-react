import { memo, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND } from '../../ui';
import { eventArt } from './eventArt';

/**
 * "+8 to the reef!" after play adds points. Shows once per gain (gainedAt),
 * pops in, holds 2 s, leaves. Coin tick + light success haptic.
 * Place it near the top of the map, under the status row.
 */
function EventGainToast({ gained, gainedAt, artKey, word = 'reef' }: { readonly gained: number; readonly gainedAt: number; readonly artKey: string | null; readonly word?: string }) {
  const reduced = useReducedGameMotion();
  const [shown, setShown] = useState<{ n: number; at: number } | null>(null);
  const lastAt = useRef(gainedAt);
  const t = useSharedValue(0);
  useEffect(() => {
    if (!gained || gainedAt === lastAt.current) return;
    lastAt.current = gainedAt;
    setShown({ n: gained, at: gainedAt });
    playSfx('coin');
    haptic('success');
    const hide = () => setShown(null);
    t.value = 0;
    t.value = withSequence(
      reduced ? withTiming(1, { duration: 120 }) : withSpring(1, { damping: 11, stiffness: 220 }),
      withDelay(2000, withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }, done => { if (done) runOnJS(hide)(); })));
  }, [gained, gainedAt, reduced, t]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value * 1.5), transform: [{ translateY: (1 - t.value) * -16 }, { scale: 0.85 + 0.15 * t.value }] }));
  if (!shown) return null;
  return (
    <Animated.View style={[styles.toast, style]} pointerEvents="none" accessibilityLiveRegion="polite"
      accessibilityLabel={`Plus ${shown.n} to the ${word}`}>
      <Image source={eventArt(artKey).emblem} style={styles.emblem} contentFit="contain" />
      <Text style={styles.plus}>+{shown.n}</Text>
      <View><Text style={styles.line}>to the {word}!</Text></View>
    </Animated.View>
  );
}

export default memo(EventGainToast);

const styles = StyleSheet.create({
  toast: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.cream, borderRadius: 22,
    borderWidth: 3, borderColor: BRAND.navy, paddingLeft: 4, paddingRight: 14, height: 44,
    shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  emblem: { width: 36, height: 36 },
  plus: { fontFamily: 'Shark', fontSize: 22, color: BRAND.goldLip },
  line: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
});
