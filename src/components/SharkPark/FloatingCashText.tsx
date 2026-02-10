import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

interface Props {
  text: string;
  onDone: () => void;
}

export default function FloatingCashText({ text, onDone }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -80, duration: 1200, useNativeDriver: true }),
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.2, friction: 3, tension: 200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(() => onDone());
  }, []);

  return (
    <Animated.Text
      style={[
        styles.floatingCash,
        { opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  floatingCash: {
    fontFamily: 'Knockout',
    fontSize: 22,
    color: '#fec90e',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
