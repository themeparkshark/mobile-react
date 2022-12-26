import { Animated, Pressable } from 'react-native';
import {ReactNode, useContext} from 'react';
import {SoundEffectContext} from '../context/SoundEffectProvider';

export default function Button({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress: () => void;
}) {
  const { playSound } = useContext(SoundEffectContext);
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
    <Pressable
      onPress={() => {
        playSound(require('../../assets/sounds/button-press.mp3'))
        onPress();
      }}
      onPressIn={zoomOut}
      onPressOut={zoomIn}
    >
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
