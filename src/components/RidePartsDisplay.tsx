import { useRef, useEffect } from 'react';
import { Animated, Text, View } from 'react-native';
import config from '../config';

interface Props {
  count: number;
  showAnimation?: boolean;
}

/**
 * Ride Parts currency display for topbar/UI.
 * Shows animated count changes.
 */
export default function RidePartsDisplay({ count, showAnimation = true }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const previousCount = useRef(count);

  useEffect(() => {
    if (showAnimation && count !== previousCount.current) {
      // Bounce animation on count change
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
      previousCount.current = count;
    }
  }, [count]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.2)',
      }}
    >
      <Text style={{ fontSize: 18, marginRight: 4 }}>🔧</Text>
      <Animated.Text
        style={{
          fontFamily: 'Shark',
          fontSize: 20,
          color: config.tertiary,
          textShadowColor: 'rgba(0, 0, 0, 0.5)',
          textShadowOffset: { width: 1, height: 1 },
          textShadowRadius: 0,
          transform: [{ scale: scaleAnim }],
        }}
      >
        {count}
      </Animated.Text>
    </View>
  );
}
