import { Animated, Pressable } from 'react-native';
import { ReactNode } from 'react';

export default function Button({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress?: () => void;
}) {
  const animated = new Animated.Value(1);
  const zoomOut = () => {
    Animated.timing(animated, {
      toValue: 0.95,
      duration: 25,
      useNativeDriver: true,
    }).start();
  };
  const zoomIn = () => {
    Animated.timing(animated, {
      toValue: 1,
      duration: 25,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={zoomOut} onPressOut={zoomIn}>
      <Animated.View
        style={{
          transform: [
            {
              scale: animated,
            },
          ],
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
