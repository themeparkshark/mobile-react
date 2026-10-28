import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { LiveEvent } from '../../api/endpoints/live-events';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { frenzyLine } from '../../services/liveEvents/model';
import { BRAND, GameIcon } from '../../ui';
import { useEventsOpen } from './eventsRung';

/**
 * Frenzy windows already announced (by end time), so it shows once per window, ever: kept on the
 * phone, so a relaunch inside the same window stays quiet (core loop: one banner per window).
 */
const announced = new Set<string>();
const SEEN_KEY = 'tps.frenzy.announced.v1';
let hydrated: Promise<void> | null = null;
function hydrate(): Promise<void> {
  hydrated ??= AsyncStorage.getItem(SEEN_KEY)
    .then(raw => { for (const k of (raw ? JSON.parse(raw) : []) as string[]) announced.add(k); })
    .catch(() => undefined);
  return hydrated;
}
function remember(key: string): void {
  announced.add(key);
  // Only the last few windows matter.
  void AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...announced].slice(-20))).catch(() => undefined);
}
export function resetFrenzyBannerForTests(): void { announced.clear(); hydrated = Promise.resolve(); }

/**
 * The Frenzy moment: when a Frenzy hour starts at your park (or you open the
 * map during one), a gold banner drops in once, "FRENZY! Rides x2 until
 * 1 PM", then tucks away into the event chip. No map tint, no timer.
 */
function FrenzyBannerInner({ event }: { readonly event: LiveEvent | null }) {
  const reduced = useReducedGameMotion();
  const line = event ? frenzyLine(event) : null;
  const key = event && line ? `${event.id}:${event.frenzy.ends_at}` : null;
  const [showing, setShowing] = useState<string | null>(null);
  const t = useSharedValue(0);
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; void hydrate().then(() => { if (live) setReady(true); }); return () => { live = false; }; }, []);
  useEffect(() => {
    if (!ready || !key || announced.has(key)) return;
    remember(key);
    setShowing(line);
    playSfx('go');
    haptic('hitMedium');
    const hide = () => setShowing(null);
    t.value = 0;
    t.value = withSequence(reduced ? withTiming(1, { duration: 150 }) : withSpring(1, { damping: 12, stiffness: 200 }),
      withDelay(2600, withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }, done => { if (done) runOnJS(hide)(); })));
  }, [ready, key, line, reduced, t]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value * 1.4), transform: [{ translateY: (1 - t.value) * -40 }, { rotate: `${(1 - t.value) * -3}deg` }] }));
  if (!showing) return null;
  return (
    <Animated.View style={[styles.banner, style]} pointerEvents="none" accessibilityLiveRegion="polite"
      accessibilityLabel={`Frenzy! ${showing}`}>
      <View style={styles.bolt}><GameIcon name="rush" size={30} /></View>
      <View>
        <Text style={styles.big}>FRENZY!</Text>
        <Text style={styles.small}>{showing}</Text>
      </View>
    </Animated.View>
  );
}

/** Hidden until the events rung opens (rung 9). */
function FrenzyBanner(props: Parameters<typeof FrenzyBannerInner>[0]) {
  return useEventsOpen() ? <FrenzyBannerInner {...props} /> : null;
}

export default memo(FrenzyBanner);

const styles = StyleSheet.create({
  banner: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BRAND.gold, borderRadius: 20,
    borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 5, borderBottomColor: BRAND.goldLip, paddingVertical: 4, paddingLeft: 5, paddingRight: 14,
    shadowColor: BRAND.shadow, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  bolt: { width: 36, height: 36, borderRadius: 18, backgroundColor: BRAND.blue, borderWidth: 3, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  big: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  small: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy },
});
