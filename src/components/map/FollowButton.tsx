import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { BRAND, SHADOW } from '../../ui';
import type { FollowMode } from './cameraFollow';

/** Panned away the button shows your own shark (its look), or Alex's Classic: "take me back to it". */
const CLASSIC = require('../../../assets/images/map/follow-shark-classic.png');

/** What the map's top-right button is doing right now. */
export type FollowButtonState = 'away' | FollowMode;

/** The words a player sees (short enough to read at a glance; tested in map-motion.test.cjs). */
export const FOLLOW_COPY = {
  heading: 'Map spins with you',
  north: 'Map stays still',
  away: 'Tap to find your shark',
  noCompass: 'No compass here',
  hintTitle: 'Shark finder',
  hintBody: 'Tap me to stop the map spinning.',
  hintBodyNorth: 'Tap me to spin the map with you.',
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
    ? 'Shark finder: the map spins with you. Tap to keep it still, north up.'
    : 'Shark finder: the map stays still, north up. Tap to spin it with you.';
}

/**
 * The button's face: a locator, not a compass (the footer already has the gold compass). A gold shark fin
 * in a target ring; while the map turns with you, a view cone shows the way you face (up the screen).
 * Flat fills, cel bands and navy outlines in the house style.
 */
function LocatorFace({ facing }: { readonly facing: boolean }) {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      {facing && (
        <>
          <Path d="M22 26 L9.5 6.5 A19 19 0 0 1 34.5 6.5 Z" fill={BRAND.skyDeep} stroke={BRAND.navy} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M22 24 L15 10.5 A13 13 0 0 1 29 10.5 Z" fill={BRAND.sky} />
        </>
      )}
      <Circle cx={22} cy={28} r={11} fill={BRAND.white} stroke={BRAND.navy} strokeWidth={2.4} />
      {/* The fin: hooked back like a shark's, gold with a lighter cel band, a navy outline, cutting a wave. */}
      <Path d="M29 32 C28.5 25 24 19.5 15.5 17.5 C18.5 21.5 19.5 26.5 18.5 32 Z" fill={BRAND.gold} stroke={BRAND.navy} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M26.5 31 C26 26.5 23.5 22.5 19.5 20.3 C21 23.5 21.5 27 21 31 Z" fill={BRAND.goldLight} />
      <Path d="M13 32.5 q2.25 -2 4.5 0 t4.5 0 t4.5 0 t4.5 0" fill="none" stroke={BRAND.navy} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
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
    pillTimer.current = setTimeout(() => setPill(null), 2500);
  };
  useEffect(() => {
    const was = lastState.current;
    lastState.current = state;
    if (shouldFlashPill(was, state)) flashPill(state as PillKey);
    else if (state === 'away' && was !== 'away' && !awayTaught) { awayTaught = true; flashPill('away'); }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (noCompassFlash > 0) flashPill('noCompass'); }, [noCompassFlash]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (pillTimer.current) clearTimeout(pillTimer.current); }, []);
  // The hint stays until the first tap on the button or the map (no timer): a ring pulses round the
  // button meanwhile, so a child who cannot read still sees "tap here".
  const ring = useSharedValue(0);
  useEffect(() => {
    if (!hint || reducedMotion) { ring.value = 0; return; }
    ring.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 }), withDelay(300, withTiming(0, { duration: 0 }))), -1);
  }, [hint, reducedMotion, ring]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value > 0 ? 0.9 * (1 - ring.value) : 0, transform: [{ scale: 1 + 0.45 * ring.value }] }));

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
      {hint && <Reanimated.View pointerEvents="none" style={[styles.ring, ringStyle]} />}
      <Pressable onPress={tap} accessibilityRole="button" accessibilityLabel={followButtonLabel(state)} hitSlop={8}>
        <Reanimated.View style={[styles.button, state === 'north' && styles.north, state === 'away' && styles.away, buttonStyle]}>
          <View pointerEvents="none" style={styles.gloss} />
          {state === 'away' ? (
            <Reanimated.View style={[styles.sharkBox, nudgeStyle]}>
              {awayArt ?? <Image source={CLASSIC} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />}
            </Reanimated.View>
          ) : (
            <>
              <LocatorFace facing={state === 'heading'} />
              {/* The red north tick rides the rim and always points at north on the map. */}
              <Reanimated.View pointerEvents="none" style={[styles.northRing, roseStyle]}>
                <Svg width={54} height={54} viewBox="0 0 54 54">
                  <Path d="M27 1.5 L31.5 9.5 L22.5 9.5 Z" fill={BRAND.red} stroke={BRAND.navy} strokeWidth={1.6} strokeLinejoin="round" />
                </Svg>
              </Reanimated.View>
            </>
          )}
          {state !== 'away' && (
            <Reanimated.View style={[styles.badge, state === 'north' ? styles.badgeNorth : styles.badgeHeading, badgeStyle]}>
              {state === 'north' ? (
                // A padlock: the map is locked still.
                <Svg width={16} height={16} viewBox="0 0 16 16">
                  <Path d="M5 7.2 V5.2 a3 3 0 0 1 6 0 V7.2" stroke={BRAND.white} strokeWidth={2.2} fill="none" strokeLinecap="round" />
                  <Path d="M3.2 7.2 H12.8 V14 H3.2 Z" fill={BRAND.white} stroke={BRAND.white} strokeWidth={1} strokeLinejoin="round" />
                  <Circle cx={8} cy={10.5} r={1.3} fill={BRAND.navy} />
                </Svg>
              ) : (
                // Two curved arrows chasing each other: the map spins with you.
                <Svg width={17} height={17} viewBox="0 0 17 17">
                  <Path d="M3 7.2 A5.6 5.6 0 0 1 12.6 4" stroke={BRAND.white} strokeWidth={2.6} fill="none" strokeLinecap="round" />
                  <Path d="M14.6 1.2 L14.8 6.4 L9.8 5.4 Z" fill={BRAND.white} stroke={BRAND.white} strokeWidth={1} strokeLinejoin="round" />
                  <Path d="M14 9.8 A5.6 5.6 0 0 1 4.4 13" stroke={BRAND.white} strokeWidth={2.6} fill="none" strokeLinecap="round" />
                  <Path d="M2.4 15.8 L2.2 10.6 L7.2 11.6 Z" fill={BRAND.white} stroke={BRAND.white} strokeWidth={1} strokeLinejoin="round" />
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
  // House button chrome: a thick navy outline, a lighter inner ring, a lip underneath.
  button: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.blueBright, borderWidth: 4.5, borderColor: BRAND.navy, borderBottomWidth: 6.5, ...SHADOW.card },
  north: { backgroundColor: BRAND.cream },
  away: { backgroundColor: BRAND.gold, borderBottomColor: BRAND.navy },
  ring: { position: 'absolute', left: 0, top: 0, width: 54, height: 54, borderRadius: 27, borderWidth: 4, borderColor: BRAND.gold },
  northRing: { position: 'absolute', left: -4.5, top: -4.5, width: 54, height: 54 },
  gloss: { position: 'absolute', left: 8, top: 4, width: 22, height: 9, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.45)', transform: [{ rotate: '-18deg' }] },
  sharkBox: { width: 40, height: 40 },
  badge: { position: 'absolute', right: -10, bottom: -10, width: 26, height: 26, borderRadius: 13, borderWidth: 2.5,
    borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  badgeHeading: { backgroundColor: BRAND.blue },
  badgeNorth: { backgroundColor: BRAND.navy },
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
