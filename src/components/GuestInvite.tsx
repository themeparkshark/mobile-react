/**
 * GuestInvite (WS8): what a signed-out player sees on the map.
 *
 * Replaces the grey "sign in" wall with a bright, branded invitation. Guests
 * have no map (the map needs a player), so his login art fills the space above
 * the card: the game world they are about to join, not an empty panel.
 * The entry point ("Continue as guest" on Login) is unchanged.
 *
 * Motion: the card springs up from the bottom (overshoot, settle), the shark
 * pops in on top of it and bobs, and the three promises cascade in. Reduced
 * motion shows the finished card. The sign-in button is live from frame one.
 *
 * Mounting: ExploreScreen (WS2) renders <GuestInvite /> in place of the grey
 * guest block, above the map, with pointerEvents on the map left intact.
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeInRight, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignInButtons from './SignInButtons';
import { BRAND, GameIcon, RADIUS, SHADOW, textPreset, type GameIconName } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';

const SHARK = require('../../assets/images/screens/welcome/shark.png');
const LOGO = require('../../assets/images/screens/login/logo.png');
const WORLD = require('../../assets/images/screens/login/login-bg.png');
/** The header covers most of the art's painted logo band; this lifts the rest out of view. */
const WORLD_LOGO_CROP = 24;

export const GUEST_PROMISES: readonly { icon: GameIconName; text: string }[] = [
  { icon: 'coin', text: 'Win a coin for every ride you conquer' },
  { icon: 'queue', text: 'Play quick games while you wait in line' },
  { icon: 'shark', text: 'Dress up your shark and join a team' },
];

export const GUEST_COPY = {
  title: 'Your park adventure starts here',
  signInHint: 'Sign in to save your coins and progress.',
} as const;

export default function GuestInvite() {
  const reduced = useUiReducedMotion();
  const insets = useSafeAreaInsets();
  const rise = useSharedValue(reduced ? 1 : 0);
  const pop = useSharedValue(reduced ? 1 : 0);
  const bob = useSharedValue(0);

  useEffect(() => {
    if (reduced) { rise.value = 1; pop.value = 1; bob.value = 0; return; }
    rise.value = withSequence(
      withTiming(1.04, { duration: 320, easing: Easing.out(Easing.cubic) }),
      withSpring(1, { damping: 12, stiffness: 200 }),
    );
    pop.value = withDelay(260, withSpring(1, { damping: 8, stiffness: 220, mass: 0.7 }));
    bob.value = withDelay(900, withRepeat(withSequence(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
    ), -1, false));
    return () => { cancelAnimation(rise); cancelAnimation(pop); cancelAnimation(bob); };
  }, [reduced, rise, pop, bob]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - rise.value) * 420 }],
  }));
  const sharkStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.5),
    transform: [
      { translateY: (1 - pop.value) * 40 - bob.value * 6 },
      { scale: 0.6 + pop.value * 0.4 },
      { rotate: `${-4 + bob.value * 8}deg` },
    ],
  }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* His login art fills the top half; a light wash keeps it bright behind the card. */}
      <Image source={WORLD} style={styles.world} contentFit="cover" pointerEvents="none" accessibilityIgnoresInvertColors />
      <View style={styles.wash} pointerEvents="none" />
      <Animated.View style={[styles.card, { paddingBottom: 16 + insets.bottom }, cardStyle]}>
        <Animated.View style={[styles.sharkWrap, sharkStyle]} pointerEvents="none">
          <Image source={SHARK} style={styles.shark} contentFit="contain" accessibilityIgnoresInvertColors />
        </Animated.View>
        <Image source={LOGO} style={styles.logo} contentFit="contain" accessibilityLabel="Theme Park Shark" />
        <Text style={styles.title}>{GUEST_COPY.title}</Text>
        <View style={styles.promises}>
          {GUEST_PROMISES.map((promise, index) => (
            <Animated.View key={promise.icon}
              entering={reduced ? undefined : FadeInRight.delay(420 + index * 110).springify().damping(15)}
              style={styles.promise}>
              <View style={styles.promiseIcon}><GameIcon name={promise.icon} size={30} /></View>
              <Text style={styles.promiseText}>{promise.text}</Text>
            </Animated.View>
          ))}
        </View>
        <SignInButtons />
        <Text style={styles.hint}>{GUEST_COPY.signInHint}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  // Full-width art: the header hides its painted logo (the card carries the logo), so the
  // coaster skyline and his sharks fill the space above the card.
  world: { position: 'absolute', left: 0, right: 0, top: -WORLD_LOGO_CROP, aspectRatio: 1080 / 1920 },
  wash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(124,198,245,0.12)' },
  card: {
    backgroundColor: BRAND.cream,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 4,
    borderBottomWidth: 0,
    borderColor: BRAND.white,
    paddingTop: 58,
    paddingHorizontal: 20,
    alignItems: 'center',
    ...SHADOW.lifted,
  },
  sharkWrap: { position: 'absolute', top: -92, alignSelf: 'center' },
  shark: { width: 150, height: 150 },
  logo: { width: 220, height: 220 * (322 / 1284) },
  title: {
    ...textPreset('title'),
    fontSize: 24,
    lineHeight: 28,
    color: BRAND.navy,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 8,
  },
  promises: { alignSelf: 'stretch', gap: 8, marginTop: 12, marginBottom: 14 },
  promise: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BRAND.white, borderRadius: RADIUS.md,
    paddingVertical: 8, paddingHorizontal: 10, borderWidth: 2, borderColor: BRAND.creamDeep,
  },
  promiseIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center',
  },
  promiseText: { ...textPreset('body'), fontSize: 17, color: BRAND.navy, flex: 1 },
  hint: { ...textPreset('caption'), color: BRAND.navySoft, textAlign: 'center', marginTop: 8 },
});
