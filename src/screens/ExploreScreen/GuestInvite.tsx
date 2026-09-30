import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import SignInButtons from '../../components/SignInButtons';
import Map from '../../components/Map';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, SHADOW } from '../../ui';

export const GUEST_COPY = {
  title: 'Your park adventure starts here',
  body: 'Sign in to catch ride coins, dress up your shark and play games while you wait in line.',
} as const;

/**
 * Guests see the live game map, softly blurred, with Finn and one sign-in card
 * on top: a bright invitation instead of a grey wall. Finn hops in, then bobs;
 * reduced motion holds him still.
 */
export default function GuestInvite() {
  const reduced = useReducedGameMotion();
  const enter = useSharedValue(reduced ? 1 : 0), bob = useSharedValue(0);
  useEffect(() => {
    if (reduced) { enter.value = 1; bob.value = 0; return; }
    enter.value = withSpring(1, { damping: 12, stiffness: 150 });
    bob.value = withDelay(500, withRepeat(withSequence(
      withTiming(-6, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })), -1, false));
  }, [reduced, enter, bob]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateY: (1 - enter.value) * 40 }, { scale: 0.94 + enter.value * 0.06 }] }));
  const finnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value + (1 - enter.value) * 60 }] }));
  return <View style={styles.fill}>
    <View style={StyleSheet.absoluteFill} pointerEvents="none"><Map>{null}</Map></View>
    <BlurView intensity={14} tint="light" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />
    <View style={styles.center}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Animated.View style={[styles.finnWrap, finnStyle]}>
          <Image source={require('../../../assets/images/screens/pin-collections/shark.png')} style={styles.finn}
            contentFit="contain" accessibilityLabel="Theme Park Shark" />
        </Animated.View>
        <Image source={require('../../../assets/images/screens/login/logo.png')} style={styles.logo} contentFit="contain"
          accessibilityLabel="Theme Park Shark" />
        <Text style={styles.title} accessibilityRole="header">{GUEST_COPY.title}</Text>
        <Text style={styles.body}>{GUEST_COPY.body}</Text>
        <SignInButtons />
      </Animated.View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BRAND.sky },
  tint: { backgroundColor: 'rgba(7,104,185,0.12)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  card: { width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 26,
    borderWidth: 4, borderColor: BRAND.white, paddingTop: 58, paddingHorizontal: 20, paddingBottom: 20, ...SHADOW.lifted },
  finnWrap: { position: 'absolute', top: -70 },
  finn: { width: 118, height: 118 },
  logo: { width: 230, height: 230 * (322 / 1284), marginBottom: 12 },
  title: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, textAlign: 'center' },
  body: { fontFamily: 'Knockout', fontSize: 16, lineHeight: 22, color: BRAND.navySoft, textAlign: 'center', marginTop: 8, marginBottom: 16 },
});
