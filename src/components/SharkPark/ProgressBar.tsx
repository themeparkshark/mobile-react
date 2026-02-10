import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

interface Props {
  progress: number; // 0–1
  color: string;
}

export default function ProgressBar({ progress, color }: Props) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  const shineAnim = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: 120,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Shine sweep effect
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shineAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const widthInterp = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const shineTranslate = shineAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-30, 200],
  });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { width: widthInterp, backgroundColor: color }]}>
        <Animated.View
          style={[
            styles.shine,
            { transform: [{ translateX: shineTranslate }] },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: '#e8ecf0',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  shine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 20,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 3,
  },
});
