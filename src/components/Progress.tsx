import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import config from '../config';

/**
 * The launch bar (navy fill in a white bar). It fills by scaleX from the left edge on the native
 * driver, so it keeps moving while the JS thread is busy signing in, with no layout pass per frame.
 * `initial` is where it starts on its first frame (the Loading screen picks up the Splash bar's
 * share, so the bar only ever moves forward); `duration` is how long each move takes.
 */
export default function Progress({ progress, initial = 0, duration = 250 }: {
  readonly progress: number;
  readonly initial?: number;
  readonly duration?: number;
}) {
  const fill = useRef(new Animated.Value(Math.max(0, Math.min(100, initial)) / 100)).current;

  useEffect(() => {
    const anim = Animated.timing(fill, {
      toValue: Math.max(0, Math.min(100, progress)) / 100,
      duration,
      easing: duration > 600 ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, duration, fill]);

  return (
    <View
      style={{
        position: 'relative',
        width: '100%',
        height: 23,
        borderRadius: 10,
        borderWidth: 3,
        borderColor: config.primary,
        backgroundColor: 'white',
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '100%',
          transformOrigin: 'left',
          transform: [{ scaleX: fill }],
          backgroundColor: config.primary,
        }}
      />
    </View>
  );
}
