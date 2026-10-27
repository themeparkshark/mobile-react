import { Image } from 'expo-image';
import { useRef } from 'react';
import { Dimensions, View } from 'react-native';

// One frame shared by Splash, Loading and Login: the loading loop's first
// frame plus the title logo, at the same place on every screen. Splash ends on
// exactly what Loading starts on, so the 220 ms fade between them can never
// show a doubled title or shifted sharks.
export const SPLASH_POSTER = require('../../assets/images/splash-loop-poster.jpg');
export const SPLASH_LOGO = require('../../assets/images/screens/login/logo.png');

// Where the title sits in the binary's launch art (assets/images/splash-bg.png,
// 1080x2500, drawn with resizeMode cover by the native launch screen and by
// Splash). Measured by matching logo.png against it. Putting our title on the
// same spot keeps it still from the very first native frame through Loading
// and Login, so no cross-fade on the way can show two titles.
const LAUNCH_ART_SIZE = { w: 1080, h: 2500 };
const LAUNCH_TITLE_BOX = { x: 14, y: 380, w: 1052, h: 264 };

export function splashLogoFrame(width: number, height: number) {
  const k = Math.max(width / LAUNCH_ART_SIZE.w, height / LAUNCH_ART_SIZE.h);
  const ox = (width - LAUNCH_ART_SIZE.w * k) / 2;
  const oy = (height - LAUNCH_ART_SIZE.h * k) / 2;
  return {
    position: 'absolute' as const,
    left: ox + LAUNCH_TITLE_BOX.x * k,
    top: oy + LAUNCH_TITLE_BOX.y * k,
    width: LAUNCH_TITLE_BOX.w * k,
    height: LAUNCH_TITLE_BOX.h * k,
  };
}

/**
 * The loop's first frame with the title on top. Calls onReady once both images
 * are on screen (onDisplay, not onLoad: a loaded title could still paint a frame
 * or two after the poster, which showed as the title popping in).
 */
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
        onDisplay={done}
        style={{ position: 'absolute', width, height }}
      />
      <View style={splashLogoFrame(width, height)}>
        <Image source={SPLASH_LOGO} contentFit="contain" transition={0} onDisplay={done} style={{ width: '100%', height: '100%' }} />
      </View>
    </View>
  );
}
