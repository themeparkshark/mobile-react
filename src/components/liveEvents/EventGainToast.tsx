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
/**
 * fillFrom/fillTo (0..1): your chest bar before and after the gain. The bar
 * fills with a wave splash at its edge, so the kid sees what the points did.
 */
function EventGainToast({ gained, gainedAt, artKey, word = 'reef', fillFrom = 0, fillTo = 0 }: {
  readonly gained: number; readonly gainedAt: number; readonly artKey: string | null; readonly word?: string;
  readonly fillFrom?: number; readonly fillTo?: number;
}) {
  const reduced = useReducedGameMotion();
  const [shown, setShown] = useState<{ n: number; at: number } | null>(null);
  const lastAt = useRef(gainedAt);
  const t = useSharedValue(0);
  const fill = useSharedValue(fillFrom);
  const splash = useSharedValue(0);
  useEffect(() => {
    if (!gained || gainedAt === lastAt.current) return;
    lastAt.current = gainedAt;
    setShown({ n: gained, at: gainedAt });
    playSfx('coin');
    haptic('success');
    const hide = () => setShown(null);
    fill.value = fillFrom;
    splash.value = 0;
    fill.value = withDelay(reduced ? 0 : 260, withTiming(Math.max(fillFrom, fillTo), { duration: reduced ? 1 : 700, easing: Easing.out(Easing.cubic) }));
    if (!reduced) splash.value = withDelay(900, withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 380 })));
    t.value = 0;
    t.value = withSequence(
      reduced ? withTiming(1, { duration: 120 }) : withSpring(1, { damping: 11, stiffness: 220 }),
      withDelay(2000, withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }, done => { if (done) runOnJS(hide)(); })));
  }, [gained, gainedAt, reduced, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.04, fill.value) }] }));
  const splashStyle = useAnimatedStyle(() => ({ left: `${Math.max(4, fill.value * 100)}%`, opacity: splash.value, transform: [{ scale: 0.4 + splash.value }] }));
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value * 1.5), transform: [{ translateY: (1 - t.value) * -16 }, { scale: 0.85 + 0.15 * t.value }] }));
  if (!shown) return null;
  return (
    <Animated.View style={[styles.toast, style]} pointerEvents="none" accessibilityLiveRegion="polite"
      accessibilityLabel={`Plus ${shown.n} to the ${word}`}>
      <Image source={eventArt(artKey).emblem} style={styles.emblem} contentFit="contain" />
      <Text style={styles.plus}>+{shown.n}</Text>
      <View>
        <Text style={styles.line}>to the {word}!</Text>
        <View style={styles.bar}>
          <Animated.View style={[styles.fill, fillStyle]} />
          <Animated.View style={[styles.splash, splashStyle]} />
        </View>
      </View>
    </Animated.View>
  );
}

export default memo(EventGainToast);

const styles = StyleSheet.create({
  toast: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.cream, borderRadius: 22,
    borderWidth: 3, borderColor: BRAND.navy, paddingLeft: 4, paddingRight: 14, height: 54,
    shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  emblem: { width: 36, height: 36 },
  plus: { fontFamily: 'Shark', fontSize: 22, color: BRAND.goldLip },
  line: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  bar: { width: 96, height: 10, borderRadius: 5, backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.navy, overflow: 'visible', marginTop: 2 },
  fill: { width: '100%', height: '100%', borderRadius: 3, backgroundColor: BRAND.gold, transformOrigin: 'left center' },
  splash: { position: 'absolute', top: -7, width: 18, height: 18, marginLeft: -9, borderRadius: 9, backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.skyDeep },
});
