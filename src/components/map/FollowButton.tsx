import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
  type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { BRAND, SHADOW } from '../../ui';
import type { FollowMode } from './cameraFollow';

const ROSE = require('../../../assets/images/map/compass-rose.png');
/** Panned away the button shows your own shark (its look), or Alex's Classic: "take me back to it". */
const CLASSIC = require('../../../assets/images/map/follow-shark-classic.png');

/** What the map's top-right button is doing right now. */
export type FollowButtonState = 'away' | FollowMode;

/** The words a player sees (short enough to read at a glance; tested in map-motion.test.cjs). */
export const FOLLOW_COPY = {
  heading: 'Map turns with you',
  north: 'North stays up',
  away: 'Tap to find your shark',
  noCompass: 'No compass here',
  hintTitle: 'Your compass',
  hintBody: 'The map turns when you turn. Tap me to keep north up.',
  hintBodyNorth: 'North stays on top. Tap me to turn the map with you.',
} as const;

type PillKey = 'heading' | 'north' | 'noCompass' | 'away';
/** The first time per app session the map is panned away, the pill says how to get back. */
let awayTaught = false;

/** A pill only for a real mode toggle (heading and north), never for leaving or coming back from panned away. */
export function shouldFlashPill(was: FollowButtonState, now: FollowButtonState): boolean {
  return was !== now && was !== 'away' && now !== 'away';
}

export function followButtonLabel(state: FollowButtonState): string {
  if (state === 'away') return 'Find your shark. The map follows you again.';
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
 *    on a white button with a navy rim and an N badge.
 *  - Panned away: a gold button showing your shark; a tap brings the map back to it.
 * Every tap shows what it did in a little pill, and the first visit gets a
 * one-time hint bubble. The rose turns on the UI thread with the camera
 * (`bearing` is the map's bearing, eased like the camera itself).
 */
export default function FollowButton({ state, bearing, onPress, reducedMotion, hint, onHintDone, noCompassFlash = 0, awayArt }: {
  readonly state: FollowButtonState;
  readonly bearing: SharedValue<number>;
  readonly onPress: () => void;
  readonly reducedMotion: boolean;
  /** Show the one-time hint bubble. */
  readonly hint: boolean;
  readonly onHintDone: () => void;
  /** Bumped when a tap cannot turn the map (no compass): the pill says so. */
  readonly noCompassFlash?: number;
  /** The player's own shark for the panned-away state (drawn 44 pt). */
  readonly awayArt?: ReactNode;
}) {
  // The new mode's name after a toggle (not on mount, not when coming back from panned away:
  // the button changing back is the feedback there).
  const [pill, setPill] = useState<PillKey | null>(null);
  const pillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastState = useRef(state);
  const flashPill = (key: PillKey) => {
    setPill(key);
    if (pillTimer.current) clearTimeout(pillTimer.current);
    pillTimer.current = setTimeout(() => setPill(null), 1800);
  };
  useEffect(() => {
    const was = lastState.current;
    lastState.current = state;
    if (shouldFlashPill(was, state)) flashPill(state as PillKey);
    else if (state === 'away' && was !== 'away' && !awayTaught) { awayTaught = true; flashPill('away'); }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (noCompassFlash > 0) flashPill('noCompass'); }, [noCompassFlash]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (pillTimer.current) clearTimeout(pillTimer.current); }, []);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(onHintDone, 7000);
    return () => clearTimeout(timer);
  }, [hint, onHintDone]);

  // The pill fades and slides in on the UI thread, and stays mounted while it fades out.
  const [shownPill, setShownPill] = useState<PillKey | null>(null);
  const pillOn = useSharedValue(0);
  useEffect(() => {
    const on = !!pill || hint;
    if (pill) setShownPill(pill);
    pillOn.value = reducedMotion ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: on ? 200 : 180, easing: Easing.out(Easing.quad) });
    if (!on) { const t = setTimeout(() => setShownPill(null), 200); return () => clearTimeout(t); }
  }, [pill, hint, reducedMotion, pillOn]);
  const pillStyle = useAnimatedStyle(() => ({ opacity: pillOn.value, transform: [{ translateX: 10 * (1 - pillOn.value) }, { scale: 0.92 + 0.08 * pillOn.value }] }));
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
  const roseStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-bearing.value}deg` }] }));
  // Panned away: the shark on the button wiggles once so the way back is noticed.
  const nudgeStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${nudge.value}deg` }] }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badge.value }] }));

  const tap = () => {
    if (!reducedMotion) press.value = withSequence(withTiming(0.88, { duration: 70, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 8, stiffness: 300 }));
    if (hint) onHintDone();
    onPress();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {(shownPill || hint) && (
        // A fixed-width lane left of the button: an absolute view with no width would be squeezed to
        // the 54 pt column it hangs from. The pill sizes to its words at the lane's right edge.
        <View pointerEvents="none" style={styles.pillLane}>
        <Reanimated.View style={[styles.pill, hint && styles.hint, pillStyle]}>
          {hint ? (
            <>
              <Text style={styles.hintTitle}>{FOLLOW_COPY.hintTitle}</Text>
              <Text style={styles.hintBody}>{state === 'north' ? FOLLOW_COPY.hintBodyNorth : FOLLOW_COPY.hintBody}</Text>
            </>
          ) : (
            <Text style={styles.pillText} numberOfLines={1}>{FOLLOW_COPY[shownPill ?? 'heading']}</Text>
          )}
          <View style={[styles.tail, hint && styles.hintTail]} />
        </Reanimated.View>
        </View>
      )}
      <Pressable onPress={tap} accessibilityRole="button" accessibilityLabel={followButtonLabel(state)} hitSlop={8}>
        <Reanimated.View style={[styles.button, state === 'north' && styles.north, state === 'away' && styles.away, buttonStyle]}>
          {state === 'away' ? (
            <Reanimated.View style={[styles.sharkBox, nudgeStyle]}>
              {awayArt ?? <Image source={CLASSIC} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />}
            </Reanimated.View>
          ) : (
            <Reanimated.View style={[styles.rose, roseStyle]}>
              <Image source={ROSE} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
            </Reanimated.View>
          )}
          {state !== 'away' && (
            <Reanimated.View style={[styles.badge, state === 'north' ? styles.badgeNorth : styles.badgeHeading, badgeStyle]}>
              {state === 'north' ? <Text style={styles.badgeN}>N</Text> : (
                // The beam under your shark, in small: "the map follows where you face".
                // A turning arrow: "the map turns".
                <Svg width={16} height={16} viewBox="0 0 16 16">
                  <Path d="M13.2 8.6 A5.3 5.3 0 1 1 10.6 3.6" stroke={BRAND.white} strokeWidth={2.4} fill="none" strokeLinecap="round" />
                  <Path d="M9.2 0.9 L13.6 3.4 L9.6 6.6 Z" fill={BRAND.white} />
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
  north: { backgroundColor: BRAND.white, borderColor: BRAND.navy },
  away: { backgroundColor: BRAND.gold },
  rose: { width: 40, height: 40 },
  sharkBox: { width: 44, height: 44, marginTop: 4 },
  badge: { position: 'absolute', right: -7, bottom: -7, width: 26, height: 26, borderRadius: 13, borderWidth: 2.5,
    borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  badgeHeading: { backgroundColor: BRAND.blue },
  badgeNorth: { backgroundColor: BRAND.navy },
  badgeN: { fontFamily: 'Shark', fontSize: 15, lineHeight: 17, color: BRAND.white, marginTop: 1 },
  pillLane: { position: 'absolute', right: 64, top: 0, width: 240, alignItems: 'flex-end' },
  pill: { marginTop: 11, height: 32, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: BRAND.white, borderWidth: 2.5, borderColor: BRAND.navy, justifyContent: 'center', ...SHADOW.card },
  pillText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navy },
  tail: { position: 'absolute', right: -7, top: 9, width: 10, height: 10, backgroundColor: BRAND.white,
    borderTopWidth: 2.5, borderRightWidth: 2.5, borderColor: BRAND.navy, transform: [{ rotate: '45deg' }] },
  hint: { marginTop: 0, height: undefined, width: 210, paddingVertical: 8, borderRadius: 14, backgroundColor: BRAND.cream },
  hintTail: { top: 20, backgroundColor: BRAND.cream },
  hintTitle: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
  hintBody: { fontFamily: 'Knockout', fontSize: 15, lineHeight: 18, color: BRAND.navySoft },
});
