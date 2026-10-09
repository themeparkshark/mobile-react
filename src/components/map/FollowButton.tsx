import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
  type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { BRAND, SHADOW } from '../../ui';
import type { FollowMode } from './cameraFollow';

const ROSE = require('../../../assets/images/map/compass-rose.png');

/** What the map's top-right button is doing right now. */
export type FollowButtonState = 'away' | FollowMode;

/** The words a player sees (short enough to read at a glance; tested in map-motion.test.cjs). */
export const FOLLOW_COPY = {
  heading: 'Map turns with you',
  north: 'North stays up',
  away: 'Back to my shark',
  hintTitle: 'Your compass',
  hintBody: 'The map turns as you turn. Tap to keep north up.',
} as const;

export function followButtonLabel(state: FollowButtonState): string {
  if (state === 'away') return 'Back to my shark. The map follows you again.';
  return state === 'heading'
    ? 'Compass: the map turns with you. Tap to keep north up.'
    : 'Compass: north stays up. Tap to turn the map with you.';
}

/**
 * The compass at the map's top right (Dustin, Oct 8: "I don't understand what
 * tapping the compass does"). Apple and Google Maps both teach the same two
 * states, so this does too, in our art:
 *  - Map turns with you (default): Alex's compass rose spins live so its red
 *    point always shows north; a small beam badge says it follows where you face.
 *  - North stays up: the map spins to north and holds; the rose sits upright
 *    on a cream button with a gold rim and an N badge.
 *  - Panned away: a gold button that brings the map back to your shark.
 * Every tap shows what it did in a little pill, and the first visit gets a
 * one-time hint bubble. The rose turns on the UI thread with the camera
 * (`bearing` is the map's bearing, eased like the camera itself).
 */
export default function FollowButton({ state, bearing, onPress, reducedMotion, hint, onHintDone }: {
  readonly state: FollowButtonState;
  readonly bearing: SharedValue<number>;
  readonly onPress: () => void;
  readonly reducedMotion: boolean;
  /** Show the one-time hint bubble. */
  readonly hint: boolean;
  readonly onHintDone: () => void;
}) {
  // A flash of the state's name after each tap (not on mount).
  const [pill, setPill] = useState<FollowButtonState | null>(null);
  const pillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstState = useRef(true);
  useEffect(() => {
    if (firstState.current) { firstState.current = false; return; }
    if (state === 'away') return;
    setPill(state);
    if (pillTimer.current) clearTimeout(pillTimer.current);
    pillTimer.current = setTimeout(() => setPill(null), 1800);
  }, [state]);
  useEffect(() => () => { if (pillTimer.current) clearTimeout(pillTimer.current); }, []);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(onHintDone, 7000);
    return () => clearTimeout(timer);
  }, [hint, onHintDone]);

  // Press: a squash and a pop. Mode change: the badge pops in. Panned away: one nudge so it is noticed.
  const press = useSharedValue(1);
  const badge = useSharedValue(1);
  const nudge = useSharedValue(0);
  const prevState = useRef(state);
  useEffect(() => {
    const was = prevState.current;
    prevState.current = state;
    if (reducedMotion || was === state) return;
    badge.value = withSequence(withTiming(0.4, { duration: 90 }), withSpring(1, { damping: 7, stiffness: 260 }));
    if (state === 'away') nudge.value = withSequence(withTiming(-14, { duration: 110 }), withSpring(0, { damping: 6, stiffness: 240 }));
  }, [state, reducedMotion, badge, nudge]);

  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  // North on the rose points at north on the map: the rose turns opposite the map.
  const roseStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${nudge.value - bearing.value}deg` }] }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badge.value }] }));

  const tap = () => {
    if (!reducedMotion) press.value = withSequence(withTiming(0.88, { duration: 70, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 8, stiffness: 300 }));
    if (hint) onHintDone();
    onPress();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {(pill || hint) && (
        <Reanimated.View key={hint ? 'hint' : pill ?? ''} pointerEvents="none"
          entering={reducedMotion ? undefined : FadeIn.duration(180)} exiting={reducedMotion ? undefined : FadeOut.duration(160)}
          style={[styles.pill, hint && styles.hint]}>
          {hint ? (
            <>
              <Text style={styles.hintTitle}>{FOLLOW_COPY.hintTitle}</Text>
              <Text style={styles.hintBody}>{FOLLOW_COPY.hintBody}</Text>
            </>
          ) : (
            <Text style={styles.pillText} numberOfLines={1}>{FOLLOW_COPY[pill ?? 'heading']}</Text>
          )}
          <View style={[styles.tail, hint && styles.hintTail]} />
        </Reanimated.View>
      )}
      <Pressable onPress={tap} accessibilityRole="button" accessibilityLabel={followButtonLabel(state)} hitSlop={8}>
        <Reanimated.View style={[styles.button, state === 'north' && styles.north, state === 'away' && styles.away, buttonStyle]}>
          <Reanimated.View style={[styles.rose, roseStyle]}>
            <Image source={ROSE} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
          </Reanimated.View>
          {state !== 'away' && (
            <Reanimated.View style={[styles.badge, state === 'north' ? styles.badgeNorth : styles.badgeHeading, badgeStyle]}>
              {state === 'north' ? <Text style={styles.badgeN}>N</Text> : (
                // A small beam: "it follows where you face".
                <Svg width={12} height={12} viewBox="0 0 12 12">
                  <Path d="M6 1 L10.5 10 Q6 7.6 1.5 10 Z" fill={BRAND.white} />
                </Svg>
              )}
            </Reanimated.View>
          )}
        </Reanimated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 54, height: 54 },
  button: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.blueBright, borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  north: { backgroundColor: BRAND.cream, borderColor: BRAND.gold },
  away: { backgroundColor: BRAND.gold },
  rose: { width: 40, height: 40 },
  badge: { position: 'absolute', right: -5, bottom: -5, width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  badgeHeading: { backgroundColor: BRAND.blue },
  badgeNorth: { backgroundColor: BRAND.navy },
  badgeN: { fontFamily: 'Shark', fontSize: 12, lineHeight: 14, color: BRAND.white, marginTop: 1 },
  pill: { position: 'absolute', right: 64, top: 11, height: 32, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: BRAND.white, borderWidth: 2.5, borderColor: BRAND.navy, justifyContent: 'center', ...SHADOW.card },
  pillText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navy },
  tail: { position: 'absolute', right: -7, top: 9, width: 10, height: 10, backgroundColor: BRAND.white,
    borderTopWidth: 2.5, borderRightWidth: 2.5, borderColor: BRAND.navy, transform: [{ rotate: '45deg' }] },
  hint: { top: 0, height: undefined, width: 210, paddingVertical: 8, borderRadius: 14, backgroundColor: BRAND.cream },
  hintTail: { top: 20, backgroundColor: BRAND.cream },
  hintTitle: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
  hintBody: { fontFamily: 'Knockout', fontSize: 15, lineHeight: 18, color: BRAND.navySoft },
});
