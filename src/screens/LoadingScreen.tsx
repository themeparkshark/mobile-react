import { ResizeMode, Video } from 'expo-av';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { sample } from 'lodash';
import { useIsFocused } from '@react-navigation/native';
import { useContext, useEffect, useState, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  SafeAreaView,
  Text,
  View,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SPLASH_VIDEO = require('../../assets/videos/splash-loop.mp4');
const SPLASH_LOGO = require('../../assets/images/splash-logo.png');

// Bubble that rises from bottom to top
function Bubble({ delay, size, left, duration }: { delay: number; size: number; left: number; duration: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startAnimation = () => {
      translateY.setValue(0);
      opacity.setValue(0);

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -(SCREEN_HEIGHT * 0.6),
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.5,
            duration: duration * 0.15,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.5,
            duration: duration * 0.55,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: duration * 0.3,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => startAnimation());
    };

    const wobbleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, {
          toValue: 10,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(wobble, {
          toValue: -10,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    wobbleLoop.start();

    const timeout = setTimeout(startAnimation, delay);
    // Stop both loops when the bubble unmounts (the screen left focus).
    return () => {
      clearTimeout(timeout);
      wobbleLoop.stop();
      translateY.stopAnimation();
      opacity.stopAnimation();
    };
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 20,
        left: `${left}%`,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        opacity,
        transform: [{ translateY }, { translateX: wobble }],
      }}
    />
  );
}

const BUBBLES = [
  { delay: 0, size: 8, left: 10, duration: 4500 },
  { delay: 1200, size: 5, left: 25, duration: 5000 },
  { delay: 600, size: 10, left: 45, duration: 4000 },
  { delay: 2000, size: 6, left: 65, duration: 4800 },
  { delay: 1500, size: 9, left: 80, duration: 4200 },
  { delay: 800, size: 7, left: 35, duration: 5200 },
  { delay: 2500, size: 4, left: 55, duration: 5500 },
  { delay: 3000, size: 11, left: 90, duration: 3800 },
  { delay: 1800, size: 6, left: 18, duration: 4600 },
  { delay: 400, size: 8, left: 72, duration: 4400 },
];
import { useAsyncEffect, useEffectOnceWhen, useTimeoutWhen } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import Progress from '../components/Progress';
import { AuthContext } from '../context/AuthProvider';
import { LocationStatusContext } from '../context/LocationProvider';
import { ThemeContext } from '../context/ThemeProvider';
import useCrumbs from '../hooks/useCrumbs';

export default function LoadingScreen() {
  const logoFloat = useRef(new Animated.Value(0)).current;
  // This screen stays mounted under the map for the whole session. Its video,
  // logo float and bubbles only run while it is the screen on top.
  const focused = useIsFocused();

  useEffect(() => {
    if (!focused) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, { toValue: -6, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(logoFloat, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [focused]);

  const { isReady, player } = useContext(AuthContext);
  const { requestPark, parkLoaded, permissionGranted } =
    useContext(LocationStatusContext);
  const { labels } = useCrumbs();
  const { theme } = useContext(ThemeContext);
  const [progress, setProgress] = useState<number>(0);
  const [fact, setFact] = useState<string>();
  const hasUsername = !!player?.username;
  const hasNavigated = useRef(false);
  
  // Safe navigate — prevents double navigation race condition
  const safeNavigate = async () => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    // Team choice is deferred to the first gym tap; don't block the map.
    // Dev only: EXPO_PUBLIC_STANDINGS_PREVIEW=1 lands on Standings for screen captures.
    // Dev only: EXPO_PUBLIC_STANDINGS_PROFILE_ID opens that player's profile (a stranger-profile capture).
    if (__DEV__ && process.env.EXPO_PUBLIC_STANDINGS_PROFILE_ID) {
      RootNavigation.navigate('Player', { player: Number(process.env.EXPO_PUBLIC_STANDINGS_PROFILE_ID) });
      return;
    }
    if (__DEV__ && process.env.EXPO_PUBLIC_STANDINGS_PREVIEW === '1') {
      RootNavigation.navigate('Leaderboard', { tab: process.env.EXPO_PUBLIC_STANDINGS_TAB });
      return;
    }
    // Dev only: EXPO_PUBLIC_PIN_TRADING_PREVIEW=1 lands on Pin Trading for screen captures.
    if (__DEV__ && process.env.EXPO_PUBLIC_PIN_TRADING_PREVIEW === '1') {
      RootNavigation.navigate('PinSwaps');
      return;
    }
    RootNavigation.navigate('Explore');
  };

  useEffectOnceWhen(() => {
    RootNavigation.navigate('Welcome');
  }, Boolean(isReady && !hasUsername));

  // Real progress: signed in (50), park check done (100). The bar moves with
  // actual work, and a short floor keeps the art on screen long enough to land.
  const mountedAt = useRef(Date.now());
  const MIN_SHOW_MS = 1200;
  useAsyncEffect(async () => {
    if (!isReady || !hasUsername) {
      return;
    }
    setProgress(50);
    if (permissionGranted) {
      try { await requestPark(); } catch { /* the map retries on its own */ }
    }
    const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - mountedAt.current));
    setTimeout(() => setProgress(100), wait);
  }, [isReady, permissionGranted, hasUsername]);

  useEffect(() => {
    setFact(sample(labels.splash_screen_facts));
  }, []);

  useEffect(() => {
    if (__DEV__) console.log('🦈 Loading screen state:', { progress, isReady, hasUsername, parkLoaded, permissionGranted });
  }, [progress, isReady, hasUsername, parkLoaded, permissionGranted]);

  // Force navigate after 5 seconds regardless of state (safety net)
  useTimeoutWhen(
    () => {
      safeNavigate();
    },
    5000,
    isReady && hasUsername
  );

  // Normal navigate when progress hits 100
  useTimeoutWhen(
    () => {
      safeNavigate();
    },
    250,
    progress === 100 && hasUsername
  );

  return (
    <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#09268f' }}>
      {/* Looping video background — exact screen dimensions */}
      <Video
        source={SPLASH_VIDEO}
        resizeMode={ResizeMode.COVER}
        shouldPlay={focused}
        isLooping
        isMuted
        style={{ position: 'absolute', width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
      />
      {/* Logo — gentle float */}
      <Animated.View
        style={{
          position: 'absolute',
          top: SCREEN_HEIGHT * 0.12,
          width: SCREEN_WIDTH * 0.9,
          height: SCREEN_WIDTH * 0.9 * (322 / 1284),
          left: SCREEN_WIDTH * 0.05,
          transform: [{ translateY: logoFloat }],
        }}
      >
        <Image
          source={require('../../assets/images/screens/login/logo.png')}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
        />
      </Animated.View>
      {/* Rising bubbles */}
      {focused && BUBBLES.map((b, i) => (
        <Bubble key={i} {...b} />
      ))}
      <SafeAreaView
        style={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            marginBottom: 32,
            marginLeft: 'auto',
            marginRight: 'auto',
            width: '80%',
          }}
        >
          <Text
            style={{
              color: 'white',
              textAlign: 'center',
              fontFamily: 'Knockout',
              fontSize: 20,
              textShadowColor: 'rgba(0, 0, 0, .5)',
              textShadowOffset: {
                width: 1,
                height: 1,
              },
              textShadowRadius: 0,
              marginBottom: 16,
            }}
          >
            {fact}
          </Text>
          <View
            style={{
              borderRadius: 50,
              borderColor: 'white',
              borderWidth: 3,
            }}
          >
            <Progress progress={progress} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
