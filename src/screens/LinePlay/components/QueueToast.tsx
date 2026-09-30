/**
 * A glanceable, non-blocking toast for the queue: "the line jumped ahead" or
 * "welcome back". It never pauses play and never takes a tap to dismiss: it
 * drops in with a little overshoot, holds, and slides away on its own. The
 * haptic lands on the same frame the toast arrives. Reduced motion fades.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay,
  withSequence, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { BRAND, GameIcon, type GameIconName } from '../../../ui';

export interface QueueToastMessage {
  /** Changes for every new toast so the same copy can show again later. */
  readonly key: number;
  readonly icon: GameIconName;
  readonly title: string;
  readonly body: string;
}

const HOLD_MS = 3200;

export default function QueueToast({ message, onDone }: { message: QueueToastMessage | null; onDone: () => void }) {
  const reducedMotion = useReducedGameMotion();
  const drop = useSharedValue(0);
  const wiggle = useSharedValue(0);

  useEffect(() => {
    if (!message) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void AccessibilityInfo.announceForAccessibility(`${message.title}. ${message.body}`);
    cancelAnimation(drop);
    drop.value = 0;
    const finish = (done?: boolean) => { if (done) runOnJS(onDone)(); };
    if (reducedMotion) {
      drop.value = withSequence(withTiming(1, { duration: 160 }),
        withDelay(HOLD_MS, withTiming(0, { duration: 200 }, finish)));
      return;
    }
    drop.value = withSequence(withSpring(1, { damping: 12, stiffness: 220, mass: 0.7 }),
      withDelay(HOLD_MS, withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }, finish)));
    wiggle.value = withDelay(180, withSequence(withTiming(-10, { duration: 90 }), withTiming(8, { duration: 110 }),
      withSpring(0, { damping: 8, stiffness: 240 })));
    // Only a new message restarts the toast; motion preference is read at arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.key]);

  const toastStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 1.4),
    transform: reducedMotion ? [] : [{ translateY: (1 - drop.value) * -70 }, { scale: 0.92 + drop.value * 0.08 }],
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wiggle.value}deg` }] }));

  if (!message) return null;
  return <View pointerEvents="none" style={styles.wrap}>
    <Animated.View style={[styles.toast, toastStyle]} accessibilityLiveRegion="polite">
      <Animated.View style={[styles.iconWell, iconStyle]}><GameIcon name={message.icon} size={34} /></Animated.View>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>{message.title}</Text>
        <Text style={styles.body} numberOfLines={2}>{message.body}</Text>
      </View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 104, alignItems: 'center', zIndex: 30 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 360, marginHorizontal: 16,
    paddingVertical: 10, paddingLeft: 10, paddingRight: 16, borderRadius: 20, borderWidth: 3,
    borderColor: BRAND.navy, backgroundColor: BRAND.cream, shadowColor: BRAND.shadow,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 8 },
  iconWell: { width: 46, height: 46, borderRadius: 23, backgroundColor: BRAND.gold, alignItems: 'center',
    justifyContent: 'center', borderWidth: 3, borderColor: BRAND.navy },
  copy: { flexShrink: 1 },
  title: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  body: { fontFamily: 'Knockout', fontSize: 15, lineHeight: 18, color: BRAND.navySoft, marginTop: 1 },
});
