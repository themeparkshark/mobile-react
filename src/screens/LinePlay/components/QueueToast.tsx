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
  /** No buzz (the time-away toast: quiet, inside LinePlay). */
  readonly quiet?: boolean;
}

/** On screen about 3 s in all (in, hold, out): the toast rule, never longer. */
const HOLD_MS = 2600;
/** How far a toast tucked inside the wait card travels in and out (its band's top margin is larger). */
const TUCKED_DROP = 6;

export default function QueueToast({ message, onDone, top, slim = false }: {
  message: QueueToastMessage | null; onDone: () => void;
  /** Where the toast lands (LinePlay: inside the wait card's middle band, so it never covers its ride name or buttons). */
  top?: number;
  /** One line each for the title and the body, a smaller icon: fits a short wait card's middle band. */
  slim?: boolean;
}) {
  const reducedMotion = useReducedGameMotion();
  const drop = useSharedValue(0);
  const wiggle = useSharedValue(0);

  useEffect(() => {
    if (!message) return;
    if (!message.quiet) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    // Inside the wait card (a `top` was given) it drops only a little, so its way in and out never
    // crosses the card's top row (ride name, ARCADE, pause).
    transform: reducedMotion ? [] : [{ translateY: (1 - drop.value) * (top != null ? -TUCKED_DROP : -70) },
      { scale: 0.92 + drop.value * 0.08 }],
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wiggle.value}deg` }] }));

  if (!message) return null;
  return <View pointerEvents="none" style={[styles.wrap, top != null && { top }]}>
    <Animated.View style={[styles.toast, slim && styles.toastSlim, toastStyle]} accessibilityLiveRegion="polite">
      <Animated.View style={[styles.iconWell, slim && styles.iconWellSlim, iconStyle]}>
        <GameIcon name={message.icon} size={slim ? 24 : 34} />
      </Animated.View>
      <View style={styles.copy}>
        <Text style={[styles.title, slim && styles.titleSlim]} numberOfLines={1}>{message.title}</Text>
        <Text style={[styles.body, slim && styles.bodySlim]} numberOfLines={slim ? 1 : 2}
          adjustsFontSizeToFit={slim} minimumFontScale={0.85}>{message.body}</Text>
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
  toastSlim: { height: 54, paddingVertical: 4, paddingLeft: 6, paddingRight: 12, borderRadius: 16, gap: 8 },
  iconWellSlim: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  titleSlim: { fontSize: 16 },
  bodySlim: { fontSize: 13, lineHeight: 15 },
  title: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  body: { fontFamily: 'Knockout', fontSize: 15, lineHeight: 18, color: BRAND.navySoft, marginTop: 1 },
});
