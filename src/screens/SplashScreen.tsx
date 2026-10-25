import { Image } from 'expo-image';
import { useIsFocused } from '@react-navigation/native';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { useEffectOnceWhen } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import { ThemeContext } from '../context/ThemeProvider';
import { CrumbContext } from '../context/CrumbProvider';
import { themeSplashUri } from '../utils/splashArt';
import { SplashStill } from './splashFrame';
import { isNativeSplashUp, splashArtShown } from '../nativeSplash';

// The binary's launch art. app.config.js `splash.image` points at this file and
// Expo hashes it into the runtime fingerprint, so its bytes must never change in
// an OTA (a changed file sends the update to a runtime no binary has). It is
// drawn first so the handoff from the native launch screen has no pop.
const LAUNCH_ART = require('../../assets/images/splash-bg.png');
// The current splash art is SplashStill: the loading loop's first frame and
// the title, the exact picture Loading and Login open on. It cross-fades in
// over the launch art, and the later fade to Loading changes nothing on screen.

export const SPLASH_FADE_MS = 250;
const FADE_SAFETY_MS = 1000;

export default function SplashScreen() {
  const { theme } = useContext(ThemeContext);
  const { isReady, player } = useContext(AuthContext);
  const { crumbsLoaded } = useContext(CrumbContext);
  const hasNavigated = useRef(false);
  const artOpacity = useRef(new Animated.Value(0)).current;
  const faded = useRef(false);
  // Pick the art once, when the splash mounts. A theme that resolves later
  // never swaps the picture mid-fade, and the retired 1.7.3 server splash
  // (light-sword, wizard hat, castle) never replaces the bundled art.
  // null means the bundled SplashStill.
  const [artSource, setArtSource] = useState<{ uri: string } | null>(() => {
    const uri = themeSplashUri(theme?.splash_screen_url);
    return uri ? { uri } : null;
  });

  const fadeIn = () => {
    if (faded.current) return;
    faded.current = true;
    if (isNativeSplashUp()) {
      // The native launch screen still covers us: show the art at once and
      // let the native fade (220 ms) carry the eye from launch art to it.
      artOpacity.setValue(1);
      requestAnimationFrame(() => requestAnimationFrame(splashArtShown));
      return;
    }
    Animated.timing(artOpacity, {
      toValue: 1,
      duration: SPLASH_FADE_MS,
      useNativeDriver: true,
    }).start();
    splashArtShown();
  };

  // If the art never reports a load, still fade so the screen never sticks.
  useEffect(() => {
    const t = setTimeout(fadeIn, FADE_SAFETY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Splash stays mounted at the bottom of the stack. AuthProvider moves a signed-in player on
  // by itself, so when the copy (crumbs) arrives late on a slow network, Splash must not
  // navigate from underneath: navigate('Loading') then popped the map back to a Loading
  // screen that had already done its one navigate, and the kid sat there for good.
  const focused = useIsFocused();

  // Use useEffectOnceWhen to navigate only once when ready
  useEffectOnceWhen(() => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    if (player) {
      // User is authenticated - go to loading screen
      RootNavigation.navigate('Loading');
    } else {
      // User is not authenticated - go to login
      RootNavigation.navigate('Login');
    }
  }, Boolean(isReady && crumbsLoaded && focused));

  const size = {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  };

  return (
    // Same art and blue as the native launch screen, so the handoff from the
    // launch storyboard is seamless. The current art (or an allowed server
    // theme splash) then fades in over it on the UI thread.
    <View style={{ flex: 1, backgroundColor: '#0768B9' }}>
      <Image source={LAUNCH_ART} contentFit="cover" style={size} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: artOpacity }]}>
        {artSource ? (
          <Image
            source={artSource}
            contentFit="cover"
            transition={0}
            onLoad={fadeIn}
            // A server splash that fails to load falls back to the bundled art,
            // so the old launch art underneath never shows through.
            onError={() => setArtSource(null)}
            style={size}
          />
        ) : (
          <SplashStill onReady={fadeIn} />
        )}
      </Animated.View>
    </View>
  );
}
