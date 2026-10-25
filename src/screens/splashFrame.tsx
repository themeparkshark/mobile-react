import { Image } from 'expo-image';
import { useRef } from 'react';
import { Dimensions, View } from 'react-native';

// One frame shared by Splash, Loading and Login: the loading loop's first
// frame plus the title logo, at the same place on every screen. Splash ends on
// exactly what Loading starts on, so the 220 ms fade between them can never
// show a doubled title or shifted sharks.
export const SPLASH_POSTER = require('../../assets/images/splash-loop-poster.jpg');
export const SPLASH_LOGO = require('../../assets/images/screens/login/logo.png');

export function splashLogoFrame(width: number, height: number) {
  return {
    position: 'absolute' as const,
    top: height * 0.12,
    width: width * 0.9,
    height: width * 0.9 * (322 / 1284),
    left: width * 0.05,
  };
}

/** The loop's first frame with the title on top. Calls onReady once both images have drawn. */
export function SplashStill({ onReady }: { onReady?: () => void }) {
  const { width, height } = Dimensions.get('window');
  const loaded = useRef(0);
  const done = () => {
    loaded.current += 1;
    if (loaded.current === 2) onReady?.();
  };
  return (
    <View style={{ width, height, backgroundColor: '#0768B9' }}>
      <Image
        source={SPLASH_POSTER}
        contentFit="cover"
        transition={0}
        onLoad={done}
        style={{ position: 'absolute', width, height }}
      />
      <View style={splashLogoFrame(width, height)}>
        <Image source={SPLASH_LOGO} contentFit="contain" transition={0} onLoad={done} style={{ width: '100%', height: '100%' }} />
      </View>
    </View>
  );
}
