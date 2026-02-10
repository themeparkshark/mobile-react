import { ResizeMode, Video } from 'expo-av';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import SignInButtons from '../../components/SignInButtons';
import config from '../../config';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { ThemeContext } from '../../context/ThemeProvider';
import useCrumbs from '../../hooks/useCrumbs';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SPLASH_VIDEO = require('../../../assets/videos/splash-loop.mp4');
const SPLASH_LOGO = require('../../../assets/images/splash-logo.png');
const whooshSound = require('../../../assets/sounds/whoosh.mp3');
// Floating bubble component
function FloatingBubble({
  delay,
  x,
  size,
  duration,
}: {
  delay: number;
  x: number;
  size: number;
  duration: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const isLarge = size > 20;
  const isTiny = size < 8;
  const sway = isLarge ? 25 : isTiny ? 8 : 15;

  useEffect(() => {
    const loop = () => {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => loop());
    };
    loop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: isTiny
          ? 'rgba(255,255,255,0.15)'
          : isLarge
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(255,255,255,0.07)',
        borderWidth: isTiny ? 0 : 1,
        borderColor: isLarge
          ? 'rgba(255,255,255,0.12)'
          : 'rgba(255,255,255,0.08)',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: isTiny ? 0.4 : 0.1,
        shadowRadius: isTiny ? 4 : isLarge ? 8 : 2,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [SCREEN_HEIGHT + 50, -50],
            }),
          },
          {
            translateX: anim.interpolate({
              inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
              outputRange: [0, sway, -sway * 0.7, sway * 0.5, -sway * 0.3, 0],
            }),
          },
        ],
        opacity: anim.interpolate({
          inputRange: [0, 0.05, 0.85, 1],
          outputRange: [0, isTiny ? 0.8 : 0.5, isTiny ? 0.8 : 0.5, 0],
        }),
      }}
    />
  );
}

const BUBBLES = [
  // Large slow risers
  { delay: 0, x: 30, size: 24, duration: 7000 },
  { delay: 2000, x: 280, size: 28, duration: 8000 },
  { delay: 4000, x: 160, size: 26, duration: 7500 },
  { delay: 1200, x: 350, size: 22, duration: 6800 },
  // Medium bubbles
  { delay: 500, x: 80, size: 18, duration: 5500 },
  { delay: 1800, x: 200, size: 16, duration: 6000 },
  { delay: 3200, x: 120, size: 20, duration: 5800 },
  { delay: 800, x: 310, size: 18, duration: 6200 },
  { delay: 2600, x: 50, size: 16, duration: 5000 },
  { delay: 3800, x: 240, size: 18, duration: 6500 },
  // Small fast risers
  { delay: 300, x: 140, size: 10, duration: 4500 },
  { delay: 1000, x: 260, size: 8, duration: 4000 },
  { delay: 2400, x: 90, size: 12, duration: 4200 },
  { delay: 1600, x: 330, size: 10, duration: 3800 },
  { delay: 3500, x: 180, size: 8, duration: 4800 },
  { delay: 700, x: 370, size: 12, duration: 4400 },
  // Tiny sparkle bubbles
  { delay: 200, x: 45, size: 6, duration: 3500 },
  { delay: 1400, x: 150, size: 5, duration: 3200 },
  { delay: 2800, x: 300, size: 6, duration: 3800 },
  { delay: 900, x: 220, size: 5, duration: 3000 },
  { delay: 3100, x: 70, size: 7, duration: 3600 },
  { delay: 1100, x: 360, size: 6, duration: 3400 },
  { delay: 2100, x: 110, size: 5, duration: 3300 },
  { delay: 3600, x: 270, size: 7, duration: 3700 },
];

export default function LoginScreen({ navigation }) {
  const { labels } = useCrumbs();
  const { theme } = useContext(ThemeContext);
  const { playSound } = useContext(SoundEffectContext);
  // Entrance animations
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(30)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const buttonsY = useRef(new Animated.Value(40)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;
  const copyrightOpacity = useRef(new Animated.Value(0)).current;

  // Continuous logo float
  const logoFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance sequence
    Animated.sequence([
      // Logo bounces in
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
          delay: 300,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          delay: 300,
          useNativeDriver: true,
        }),
      ]),
      // Title slides up
      Animated.parallel([
        Animated.spring(titleY, {
          toValue: 0,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Buttons slide up
      Animated.parallel([
        Animated.spring(buttonsY, {
          toValue: 0,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(buttonsOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Copyright fades in
      Animated.timing(copyrightOpacity, {
        toValue: 0.5,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous gentle float on logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, {
          toValue: -8,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(logoFloat, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#09268f' }}>
      {/* Looping video background — exact screen dimensions */}
      <Video
        source={SPLASH_VIDEO}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
        style={{ position: 'absolute', width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
      />
      {/* Logo — bounces in + gentle float */}
      <Animated.View
        style={{
          position: 'absolute',
          top: SCREEN_HEIGHT * 0.12,
          width: SCREEN_WIDTH * 0.9,
          height: SCREEN_WIDTH * 0.9 * (322 / 1284),
          left: SCREEN_WIDTH * 0.05,
          opacity: logoOpacity,
          transform: [
            { scale: logoScale },
            { translateY: logoFloat },
          ],
        }}
      >
        <Image
          source={require('../../../assets/images/screens/login/logo.png')}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
        />
      </Animated.View>
      {/* Light overlay for button contrast — only bottom half */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.4)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: SCREEN_HEIGHT * 0.4 }}
      />

      {/* Floating bubbles */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
        }}
      >
        {BUBBLES.map((b, i) => (
          <FloatingBubble key={i} {...b} />
        ))}
      </View>

      {/* Bottom gradient for readability */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: SCREEN_HEIGHT * 0.5,
        }}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Sign in buttons with slide-in */}
          <Animated.View
            style={{
              opacity: buttonsOpacity,
              transform: [{ translateY: buttonsY }],
            }}
          >
            <SignInButtons>
              <TouchableOpacity
                onPress={() => {
                  playSound(whooshSound);
                  navigation.navigate('Explore');
                }}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    fontSize: 15,
                    paddingTop: 24,
                    fontFamily: 'Knockout',
                    color: '#666',
                  }}
                >
                  {labels.continue_as_guest}
                </Text>
              </TouchableOpacity>
            </SignInButtons>
          </Animated.View>
        </View>

        {/* Copyright */}
        <Animated.Text
          style={{
            opacity: copyrightOpacity,
            paddingBottom: 30,
            textAlign: 'center',
            fontSize: 12,
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'Knockout',
          }}
        >
          {labels.copyright}
        </Animated.Text>
      </SafeAreaView>
    </View>
  );
}
